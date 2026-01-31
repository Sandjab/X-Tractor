#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Fichier pour stocker les cookies de session
const COOKIES_FILE = path.join(os.homedir(), '.x-tractor-cookies.json');

// Répertoire de sortie par défaut
const OUTPUT_DIR = process.env.X_TRACTOR_OUTPUT_DIR || process.cwd();

const server = new Server(
  {
    name: 'x-article-extractor',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Liste des outils disponibles
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'extract_x_article',
        description: 'Extrait un article X (Twitter) vers un fichier HTML autonome avec images embarquées en base64. Nécessite une session valide (voir check_x_session).',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'URL de l\'article X à extraire (ex: https://x.com/user/status/123456789)',
            },
            output_filename: {
              type: 'string',
              description: 'Nom du fichier de sortie (optionnel, généré automatiquement si non spécifié)',
            },
          },
          required: ['url'],
        },
      },
      {
        name: 'check_x_session',
        description: 'Vérifie si une session X valide existe. Si non, indique comment en créer une.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

// Handler pour les appels d'outils
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'check_x_session') {
    return await checkSession();
  }

  if (name === 'extract_x_article') {
    return await extractArticle(args.url, args.output_filename);
  }

  return {
    content: [{ type: 'text', text: `Outil inconnu: ${name}` }],
    isError: true,
  };
});

async function checkSession() {
  try {
    await fs.access(COOKIES_FILE);
    const stats = await fs.stat(COOKIES_FILE);
    const ageHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);

    return {
      content: [{
        type: 'text',
        text: `✓ Session X trouvée (cookies: ${COOKIES_FILE})\n` +
              `  Âge: ${ageHours.toFixed(1)} heures\n` +
              `  Note: Si l'extraction échoue avec SESSION_EXPIRED, exécutez:\n` +
              `  cd ${path.dirname(COOKIES_FILE.replace(os.homedir(), '~'))}\n` +
              `  node index.js --login`
      }],
    };
  } catch {
    return {
      content: [{
        type: 'text',
        text: `✗ Aucune session X trouvée.\n\n` +
              `Pour créer une session, exécutez dans votre terminal:\n` +
              `  cd /path/to/x-article-extractor\n` +
              `  node index.js --login\n\n` +
              `Cela ouvrira un navigateur pour vous connecter à X.\n` +
              `La session sera ensuite utilisable pour les extractions automatiques.`
      }],
      isError: true,
    };
  }
}

async function extractArticle(articleUrl, outputFilename) {
  // Vérifier que l'URL est valide
  if (!articleUrl || !articleUrl.includes('x.com/') && !articleUrl.includes('twitter.com/')) {
    return {
      content: [{ type: 'text', text: 'URL invalide. L\'URL doit être un lien x.com ou twitter.com.' }],
      isError: true,
    };
  }

  // Vérifier les cookies
  let cookies;
  try {
    const cookiesData = await fs.readFile(COOKIES_FILE, 'utf-8');
    cookies = JSON.parse(cookiesData);
  } catch {
    return {
      content: [{
        type: 'text',
        text: 'SESSION_REQUIRED: Aucune session X sauvegardée.\n\n' +
              'Exécutez d\'abord: node index.js --login'
      }],
      isError: true,
    };
  }

  let browser;
  try {
    // Lancer le navigateur en mode headless
    browser = await chromium.launch({
      headless: true,
      channel: 'chrome'
    });

    const context = await browser.newContext({
      viewport: { width: 1400, height: 900 },
      locale: 'fr-FR'
    });

    // Charger les cookies
    await context.addCookies(cookies);

    const page = await context.newPage();

    // Naviguer vers l'article
    await page.goto(articleUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Vérifier si on est redirigé vers login
    const currentUrl = page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('/i/flow/login') || currentUrl.includes('/i/flow/signup')) {
      await browser.close();
      return {
        content: [{
          type: 'text',
          text: 'SESSION_EXPIRED: La session X a expiré.\n\n' +
                'Exécutez: node index.js --login'
        }],
        isError: true,
      };
    }

    // Attendre le contenu
    await page.waitForSelector('article', { timeout: 30000 });
    await page.waitForFunction(() => {
      const spinners = document.querySelectorAll('[role="progressbar"]');
      return spinners.length === 0;
    }, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await page.waitForFunction(() => {
      const images = document.querySelectorAll('article img');
      return Array.from(images).every(img => img.complete);
    }, { timeout: 15000 }).catch(() => {});

    // Extraire l'article
    const articleData = await page.evaluate(() => {
      const article = document.querySelector('article');
      if (!article) throw new Error('Article non trouvé');

      const articleContainer = article.closest('[data-testid="tweet"]') || article;
      const clone = articleContainer.cloneNode(true);

      // Supprimer les éléments inutiles
      ['[data-testid="reply"]', '[data-testid="retweet"]', '[data-testid="like"]',
       '[data-testid="bookmark"]', '[data-testid="share"]', '[role="group"]']
        .forEach(sel => clone.querySelectorAll(sel).forEach(el => el.remove()));

      const computedStyles = getComputedStyle(articleContainer);
      const styles = Array.from(document.styleSheets)
        .map(sheet => {
          try {
            return Array.from(sheet.cssRules || []).map(rule => rule.cssText).join('\n');
          } catch { return ''; }
        }).join('\n');

      return {
        html: clone.outerHTML,
        styles,
        bodyStyles: {
          backgroundColor: computedStyles.backgroundColor || '#000',
          color: computedStyles.color || '#fff',
          fontFamily: computedStyles.fontFamily
        }
      };
    });

    // Convertir les images en base64
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/g;
    const backgroundRegex = /url\(["']?(https?:\/\/[^"')]+)["']?\)/g;

    let processedHtml = articleData.html;
    let processedStyles = articleData.styles;
    const imageUrls = new Set();

    let match;
    while ((match = imgRegex.exec(articleData.html)) !== null) {
      if (match[1].startsWith('http')) imageUrls.add(match[1]);
    }
    while ((match = backgroundRegex.exec(articleData.html)) !== null) {
      imageUrls.add(match[1]);
    }
    const bgRegex2 = /url\(["']?(https?:\/\/[^"')]+)["']?\)/g;
    while ((match = bgRegex2.exec(articleData.styles)) !== null) {
      imageUrls.add(match[1]);
    }

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
        processedHtml = processedHtml.split(url).join(base64);
        processedStyles = processedStyles.split(url).join(base64);
        converted++;
      } catch { /* ignore */ }
    }

    await browser.close();

    // Générer le HTML final
    const finalHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>X Article</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 20px;
      background-color: ${articleData.bodyStyles.backgroundColor};
      color: ${articleData.bodyStyles.color};
      font-family: ${articleData.bodyStyles.fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'};
      line-height: 1.5;
    }
    .article-container { max-width: 100%; margin: 0 auto; padding: 20px 40px; }
    img { max-width: 100%; height: auto; }
    ${processedStyles}
    [style*="max-width: 600px"], [style*="max-width:600px"],
    [style*="max-width: 598px"], [style*="max-width:598px"] { max-width: 100% !important; }
    article, article > div { max-width: 100% !important; width: 100% !important; }
  </style>
</head>
<body>
  <div class="article-container">${processedHtml}</div>
</body>
</html>`;

    // Sauvegarder le fichier
    const filename = outputFilename || `x-article-${Date.now()}.html`;
    const outputPath = path.join(OUTPUT_DIR, filename);
    await fs.writeFile(outputPath, finalHtml, 'utf-8');

    return {
      content: [{
        type: 'text',
        text: `✓ Article extrait avec succès!\n` +
              `  Fichier: ${outputPath}\n` +
              `  Images converties: ${converted}/${imageUrls.size}`
      }],
    };

  } catch (error) {
    if (browser) await browser.close();
    return {
      content: [{ type: 'text', text: `Erreur: ${error.message}` }],
      isError: true,
    };
  }
}

// Démarrer le serveur
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('X-Article-Extractor MCP server running');
}

main().catch(console.error);
