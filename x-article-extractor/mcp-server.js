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

import { detectSource, sourceLabel } from './extractors/detector.js';
import * as xExtractor from './extractors/x-extractor.js';
import * as mediumExtractor from './extractors/medium-extractor.js';
import * as genericExtractor from './extractors/generic-extractor.js';
import { generateHtml } from './output/html-generator.js';
import { generateMarkdown } from './output/markdown-generator.js';

// Fichier pour stocker les cookies de session
const COOKIES_FILE = path.join(os.homedir(), '.x-tractor-cookies.json');

// Répertoire de sortie par défaut
const OUTPUT_DIR = process.env.X_TRACTOR_OUTPUT_DIR || process.cwd();

const server = new Server(
  {
    name: 'x-tractor',
    version: '2.0.0',
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
        name: 'extract_article',
        description: 'Extrait un article depuis X (Twitter), Medium, ou toute page web vers un fichier HTML ou Markdown autonome avec images embarquées en base64. Pour les articles X, une session valide est nécessaire (voir check_x_session).',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'URL de l\'article à extraire (X, Medium, ou toute page web)',
            },
            output_filename: {
              type: 'string',
              description: 'Nom du fichier de sortie (optionnel, généré automatiquement si non spécifié)',
            },
            format: {
              type: 'string',
              enum: ['html', 'markdown'],
              description: 'Format de sortie (défaut: html)',
            },
          },
          required: ['url'],
        },
      },
      {
        name: 'check_x_session',
        description: 'Vérifie si une session X valide existe. Nécessaire uniquement pour extraire des articles X.',
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

  if (name === 'extract_article') {
    return await extractArticle(args.url, args.output_filename, args.format);
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
              `Note: La session X n'est nécessaire que pour les articles X.\n` +
              `Les articles Medium et les pages web génériques ne nécessitent pas de session.`
      }],
      isError: true,
    };
  }
}

async function extractArticle(articleUrl, outputFilename, format = 'html') {
  if (!articleUrl) {
    return {
      content: [{ type: 'text', text: 'URL manquante.' }],
      isError: true,
    };
  }

  const source = detectSource(articleUrl);

  // Pour X, vérifier la session
  if (source === 'x') {
    try {
      await fs.access(COOKIES_FILE);
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
  }

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      channel: 'chrome',
    });

    const context = await browser.newContext({
      viewport: { width: 1400, height: 900 },
      locale: 'fr-FR',
    });

    // Charger les cookies X si nécessaire
    if (source === 'x') {
      const cookiesData = await fs.readFile(COOKIES_FILE, 'utf-8');
      const cookies = JSON.parse(cookiesData);
      await context.addCookies(cookies);
    }

    const page = await context.newPage();
    await page.goto(articleUrl, { waitUntil: 'domcontentloaded' });

    // Pour X, vérifier la redirection login
    if (source === 'x') {
      await page.waitForTimeout(2000);
      const currentUrl = page.url();
      if (currentUrl.includes('/login') || currentUrl.includes('/i/flow/login') || currentUrl.includes('/i/flow/signup')) {
        await browser.close();
        return {
          content: [{
            type: 'text',
            text: 'SESSION_EXPIRED: La session X a expiré.\n\nExécutez: node index.js --login'
          }],
          isError: true,
        };
      }
    }

    // Sélectionner l'extracteur
    const extractor = getExtractor(source);

    // Attendre et extraire
    await extractor.waitForContent(page);
    const articleData = await extractor.extract(page);

    // Convertir les images en base64
    const embedded = await embedImages(page, articleData);

    await browser.close();

    // Générer la sortie
    const isMarkdown = format === 'markdown';
    const ext = isMarkdown ? 'md' : 'html';
    let output;
    if (isMarkdown) {
      output = generateMarkdown(embedded);
    } else {
      output = generateHtml(embedded, extractor.extraCss());
    }

    // Sauvegarder
    const slug = (articleData.siteName || 'article').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const filename = outputFilename || `${slug}-article-${Date.now()}.${ext}`;
    const outputPath = path.join(OUTPUT_DIR, filename);
    await fs.writeFile(outputPath, output, 'utf-8');

    return {
      content: [{
        type: 'text',
        text: `✓ Article extrait avec succès!\n` +
              `  Source: ${sourceLabel(source)}\n` +
              `  Titre: ${articleData.title}\n` +
              `  Format: ${isMarkdown ? 'Markdown' : 'HTML'}\n` +
              `  Fichier: ${outputPath}`
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

function getExtractor(source) {
  switch (source) {
    case 'x': return xExtractor;
    case 'medium': return mediumExtractor;
    default: return genericExtractor;
  }
}

async function embedImages(page, articleData) {
  const { html, styles } = articleData;

  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/g;
  const backgroundRegex = /url\(["']?(https?:\/\/[^"')]+)["']?\)/g;

  let processedHtml = html;
  let processedStyles = styles || '';
  const imageUrls = new Set();

  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    if (match[1].startsWith('http')) imageUrls.add(match[1]);
  }
  while ((match = backgroundRegex.exec(html)) !== null) {
    imageUrls.add(match[1]);
  }
  if (styles) {
    const bgRegex2 = /url\(["']?(https?:\/\/[^"')]+)["']?\)/g;
    while ((match = bgRegex2.exec(styles)) !== null) {
      imageUrls.add(match[1]);
    }
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
      if (processedStyles) processedStyles = processedStyles.split(url).join(base64);
      converted++;
    } catch { /* ignore */ }
  }

  return { ...articleData, html: processedHtml, styles: processedStyles };
}

// Démarrer le serveur
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('X-Tractor MCP server running (v2.0 - multi-source)');
}

main().catch(console.error);
