#!/usr/bin/env node

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Fichier pour stocker les cookies de session
const COOKIES_FILE = path.join(os.homedir(), '.x-tractor-cookies.json');

async function main() {
  // Parse arguments
  const args = process.argv.slice(2);
  const headlessMode = args.includes('--headless');
  const loginMode = args.includes('--login');
  const articleUrl = args.find(arg => !arg.startsWith('--'));

  if (!articleUrl && !loginMode) {
    console.error('Usage: node index.js <article-url> [--headless]');
    console.error('       node index.js --login');
    console.error('');
    console.error('Options:');
    console.error('  --login     Se connecter à X et sauvegarder la session');
    console.error('  --headless  Mode sans interface (pour MCP/automatisation)');
    console.error('              Nécessite une session valide (--login d\'abord)');
    console.error('');
    console.error('Workflow MCP:');
    console.error('  1. node index.js --login              # Une fois, établir la session');
    console.error('  2. node index.js <url> --headless     # Extractions automatiques');
    console.error('');
    console.error('Exemples:');
    console.error('  node index.js --login');
    console.error('  node index.js https://x.com/user/status/123 --headless');
    process.exit(1);
  }

  // Mode login uniquement
  if (loginMode) {
    await doLogin();
    return;
  }

  if (headlessMode) {
    console.log('Mode headless (MCP)...');
  } else {
    console.log('Lancement du navigateur...');
  }

  // Lancer un navigateur Playwright
  const browser = await chromium.launch({
    headless: headlessMode,
    channel: 'chrome'
  });

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    locale: 'fr-FR'
  });

  const page = await context.newPage();

  try {
    // Charger les cookies et naviguer vers l'article (login manuel si nécessaire)
    await loadOrLogin(context, page, articleUrl, headlessMode);
    
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

async function doLogin() {
  console.log('Lancement du navigateur pour connexion...');

  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome'
  });

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    locale: 'fr-FR'
  });

  const page = await context.newPage();

  try {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  Connectez-vous à X dans le navigateur qui vient de s\'ouvrir ║');
    console.log('║  Le script se terminera automatiquement après la connexion   ║');
    console.log('║  (Timeout: 5 minutes)                                        ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');

    await page.goto('https://x.com/login', { waitUntil: 'domcontentloaded' });

    // Attendre que l'utilisateur se connecte
    await page.waitForURL(
      url => !url.toString().includes('/login') &&
             !url.toString().includes('/i/flow/login') &&
             !url.toString().includes('/i/flow/signup'),
      { timeout: 300000 }
    );

    await page.waitForTimeout(2000);

    // Sauvegarder les cookies
    const cookies = await context.cookies();
    await fs.writeFile(COOKIES_FILE, JSON.stringify(cookies, null, 2));
    console.log('');
    console.log(`✓ Session sauvegardée dans ${COOKIES_FILE}`);
    console.log('✓ Vous pouvez maintenant utiliser --headless pour les extractions');

  } finally {
    await browser.close();
  }
}

async function loadOrLogin(context, page, articleUrl, headlessMode = false) {
  // Essayer de charger les cookies existants
  let hasCookies = false;
  try {
    const cookiesData = await fs.readFile(COOKIES_FILE, 'utf-8');
    const cookies = JSON.parse(cookiesData);
    await context.addCookies(cookies);
    console.log('✓ Cookies chargés');
    hasCookies = true;
  } catch (err) {
    if (headlessMode) {
      throw new Error('SESSION_REQUIRED: Aucune session sauvegardée. Lancez d\'abord le script sans --headless pour vous connecter.');
    }
    console.log('Aucune session sauvegardée');
  }

  // Aller directement sur l'article
  console.log(`Navigation vers l'article...`);
  await page.goto(articleUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Vérifier si on est redirigé vers login
  const currentUrl = page.url();
  const needsLogin = currentUrl.includes('/login') ||
                     currentUrl.includes('/i/flow/login') ||
                     currentUrl.includes('/i/flow/signup');

  if (!needsLogin) {
    // Session valide, on continue
    return;
  }

  // En mode headless, on ne peut pas demander de login manuel
  if (headlessMode) {
    throw new Error('SESSION_EXPIRED: La session a expiré. Lancez le script sans --headless pour vous reconnecter.');
  }

  // Login manuel nécessaire
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Connectez-vous à X dans le navigateur qui vient de s\'ouvrir ║');
  console.log('║  Le script continuera automatiquement après la connexion     ║');
  console.log('║  (Timeout: 5 minutes)                                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  // Attendre que l'utilisateur se connecte (max 5 minutes)
  await page.waitForURL(
    url => !url.toString().includes('/login') &&
           !url.toString().includes('/i/flow/login') &&
           !url.toString().includes('/i/flow/signup'),
    { timeout: 300000 }
  );

  // Petite pause pour s'assurer que la session est établie
  await page.waitForTimeout(2000);

  // Si on n'est pas sur l'article, y aller
  if (!page.url().includes(articleUrl.split('/status/')[1])) {
    await page.goto(articleUrl, { waitUntil: 'domcontentloaded' });
  }

  // Sauvegarder les cookies
  const cookies = await context.cookies();
  await fs.writeFile(COOKIES_FILE, JSON.stringify(cookies, null, 2));
  console.log(`✓ Cookies sauvegardés`);
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

  // Find all image URLs in HTML and CSS
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/g;
  const backgroundRegex = /url\(["']?(https?:\/\/[^"')]+)["']?\)/g;

  let processedHtml = html;
  let processedStyles = styles;
  const imageUrls = new Set();

  // Collect image URLs from img tags in HTML
  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    if (match[1].startsWith('http')) {
      imageUrls.add(match[1]);
    }
  }

  // Collect image URLs from background-image in HTML
  while ((match = backgroundRegex.exec(html)) !== null) {
    imageUrls.add(match[1]);
  }

  // Collect image URLs from background-image in CSS styles
  const backgroundRegex2 = /url\(["']?(https?:\/\/[^"')]+)["']?\)/g;
  while ((match = backgroundRegex2.exec(styles)) !== null) {
    imageUrls.add(match[1]);
  }

  console.log(`Found ${imageUrls.size} images to convert...`);

  // Convert each image to base64
  let converted = 0;
  for (const url of imageUrls) {
    try {
      const base64 = await page.evaluate(async (imageUrl) => {
        const response = await fetch(imageUrl, { credentials: 'include' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }, url);

      // Replace URL with base64 in both HTML and CSS
      processedHtml = processedHtml.split(url).join(base64);
      processedStyles = processedStyles.split(url).join(base64);
      converted++;
    } catch (error) {
      console.warn(`⚠ Could not convert: ${url.substring(0, 60)}... (${error.message})`);
    }
  }

  console.log(`✓ Converted ${converted}/${imageUrls.size} images`);

  return { html: processedHtml, styles: processedStyles, bodyStyles };
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
    
    /* Container full width */
    .article-container {
      max-width: 100%;
      margin: 0 auto;
      padding: 20px 40px;
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
    [style*="max-width:600px"],
    [style*="max-width: 598px"],
    [style*="max-width:598px"] {
      max-width: 100% !important;
    }

    /* Force all content to expand */
    article, article > div {
      max-width: 100% !important;
      width: 100% !important;
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
