#!/usr/bin/env node

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

const X_USERNAME = process.env.X_USERNAME;
const X_PASSWORD = process.env.X_PASSWORD;

async function main() {
  const articleUrl = process.argv[2];
  
  if (!articleUrl) {
    console.error('Usage: node index.js <article-url>');
    console.error('Example: node index.js https://x.com/user/status/123456789');
    process.exit(1);
  }

  if (!X_USERNAME || !X_PASSWORD) {
    console.error('Error: X_USERNAME and X_PASSWORD environment variables are required');
    process.exit(1);
  }

  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    // Login to X
    console.log('Logging in to X...');
    await login(page);
    
    // Navigate to article
    console.log(`Navigating to article: ${articleUrl}`);
    await page.goto(articleUrl, { waitUntil: 'networkidle' });
    
    // Wait for article content to load
    console.log('Waiting for article content...');
    await waitForArticleContent(page);
    
    // Extract article HTML
    console.log('Extracting article content...');
    const articleHtml = await extractArticle(page);
    
    // Convert images to base64
    console.log('Converting images to base64...');
    const htmlWithEmbeddedImages = await embedImages(page, articleHtml);
    
    // Generate standalone HTML
    const standaloneHtml = generateStandaloneHtml(htmlWithEmbeddedImages);
    
    // Save to file
    const outputFilename = `x-article-${Date.now()}.html`;
    await fs.writeFile(outputFilename, standaloneHtml, 'utf-8');
    console.log(`✓ Article saved to: ${outputFilename}`);
    
  } catch (error) {
    console.error('Error:', error.message);
    // Take a screenshot for debugging
    await page.screenshot({ path: 'error-screenshot.png' });
    console.error('Screenshot saved to error-screenshot.png');
    process.exit(1);
  } finally {
    await browser.close();
  }
}

async function login(page) {
  await page.goto('https://x.com/i/flow/login', { waitUntil: 'networkidle' });
  
  // Enter username
  const usernameInput = page.locator('input[autocomplete="username"]');
  await usernameInput.fill(X_USERNAME);
  await page.locator('text=Next').click();
  
  // Wait for password field (or sometimes X asks for email/phone verification)
  await page.waitForTimeout(1500);
  
  // Check if there's an additional verification step (username/phone)
  const verificationInput = page.locator('input[data-testid="ocfEnterTextTextInput"]');
  if (await verificationInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log('Additional verification required - entering username...');
    await verificationInput.fill(X_USERNAME);
    await page.locator('text=Next').click();
    await page.waitForTimeout(1500);
  }
  
  // Enter password
  const passwordInput = page.locator('input[type="password"]');
  await passwordInput.fill(X_PASSWORD);
  await page.locator('text=Log in').click();
  
  // Wait for login to complete
  await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 30000 });
  console.log('✓ Logged in successfully');
  
  // Small delay to ensure session is fully established
  await page.waitForTimeout(2000);
}

async function waitForArticleContent(page) {
  // Wait for the article container to appear
  // X articles typically have a specific structure
  await page.waitForSelector('article', { timeout: 30000 });
  
  // Wait for any loading spinners to disappear
  await page.waitForFunction(() => {
    const spinners = document.querySelectorAll('[role="progressbar"]');
    return spinners.length === 0;
  }, { timeout: 15000 }).catch(() => {});
  
  // Additional wait for dynamic content
  await page.waitForTimeout(2000);
  
  // Wait for images to load
  await page.waitForFunction(() => {
    const images = document.querySelectorAll('article img');
    return Array.from(images).every(img => img.complete);
  }, { timeout: 15000 }).catch(() => {});
}

async function extractArticle(page) {
  return await page.evaluate(() => {
    // Find the main article content
    // X articles are typically in a specific container
    const article = document.querySelector('article');
    if (!article) {
      throw new Error('Could not find article element');
    }
    
    // Get the article and its parent for better context
    const articleContainer = article.closest('[data-testid="tweet"]') || article;
    
    // Clone the node to manipulate it
    const clone = articleContainer.cloneNode(true);
    
    // Remove unnecessary elements
    const elementsToRemove = [
      '[data-testid="reply"]',
      '[data-testid="retweet"]', 
      '[data-testid="like"]',
      '[data-testid="bookmark"]',
      '[data-testid="share"]',
      '[role="group"]', // Action buttons
    ];
    
    elementsToRemove.forEach(selector => {
      clone.querySelectorAll(selector).forEach(el => el.remove());
    });
    
    // Get computed styles for the article
    const computedStyles = getComputedStyle(articleContainer);
    
    // Extract all stylesheets
    const styles = Array.from(document.styleSheets)
      .map(sheet => {
        try {
          return Array.from(sheet.cssRules || [])
            .map(rule => rule.cssText)
            .join('\n');
        } catch (e) {
          // Cross-origin stylesheets can't be accessed
          return '';
        }
      })
      .join('\n');
    
    return {
      html: clone.outerHTML,
      styles: styles,
      bodyStyles: {
        backgroundColor: computedStyles.backgroundColor || '#000',
        color: computedStyles.color || '#fff',
        fontFamily: computedStyles.fontFamily
      }
    };
  });
}

async function embedImages(page, articleData) {
  const { html, styles, bodyStyles } = articleData;
  
  // Find all image URLs in the HTML
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/g;
  const backgroundRegex = /url\(["']?([^"')]+)["']?\)/g;
  
  let processedHtml = html;
  const imageUrls = new Set();
  
  // Collect image URLs from img tags
  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    imageUrls.add(match[1]);
  }
  
  // Collect image URLs from background styles
  while ((match = backgroundRegex.exec(html)) !== null) {
    if (match[1].startsWith('http')) {
      imageUrls.add(match[1]);
    }
  }
  
  // Convert each image to base64
  for (const url of imageUrls) {
    try {
      const base64 = await page.evaluate(async (imageUrl) => {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }, url);
      
      // Replace URL with base64 in HTML
      processedHtml = processedHtml.split(url).join(base64);
    } catch (error) {
      console.warn(`Warning: Could not convert image ${url}: ${error.message}`);
    }
  }
  
  return { html: processedHtml, styles, bodyStyles };
}

function generateStandaloneHtml(articleData) {
  const { html, styles, bodyStyles } = articleData;
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>X Article</title>
  <style>
    /* Reset and base styles */
    * {
      box-sizing: border-box;
    }
    
    body {
      margin: 0;
      padding: 20px;
      background-color: ${bodyStyles.backgroundColor};
      color: ${bodyStyles.color};
      font-family: ${bodyStyles.fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'};
      line-height: 1.5;
    }
    
    /* Container for wider display */
    .article-container {
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    
    /* Responsive images */
    img {
      max-width: 100%;
      height: auto;
    }
    
    /* Original X styles */
    ${styles}
    
    /* Override X's narrow width constraints */
    [style*="max-width: 600px"],
    [style*="max-width:600px"] {
      max-width: 100% !important;
    }
  </style>
</head>
<body>
  <div class="article-container">
    ${html}
  </div>
</body>
</html>`;
}

main();
