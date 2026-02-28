#!/usr/bin/env node

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

// Fichier pour stocker les cookies de session X
const COOKIES_FILE = path.join(os.homedir(), '.x-tractor-cookies.json');

async function main() {
  // Parse arguments
  const args = process.argv.slice(2);
  const headlessMode = args.includes('--headless');
  const loginMode = args.includes('--login');
  const markdownMode = args.includes('--markdown') || args.includes('--md');
  const articleUrl = args.find(arg => !arg.startsWith('--'));

  if (!articleUrl && !loginMode) {
    console.error('Usage: node index.js <url> [options]');
    console.error('       node index.js --login');
    console.error('');
    console.error('Sources supportées:');
    console.error('  - X (Twitter) : https://x.com/user/status/123');
    console.error('  - Medium      : https://medium.com/@user/article-slug');
    console.error('  - Toute page  : https://example.com/article');
    console.error('');
    console.error('Options:');
    console.error('  --login       Se connecter à X et sauvegarder la session');
    console.error('  --headless    Mode sans interface (pour MCP/automatisation)');
    console.error('  --markdown    Exporter en Markdown au lieu de HTML');
    console.error('  --md          Alias pour --markdown');
    console.error('');
    console.error('Exemples:');
    console.error('  node index.js --login');
    console.error('  node index.js https://x.com/user/status/123 --headless');
    console.error('  node index.js https://medium.com/@user/my-article --markdown');
    console.error('  node index.js https://example.com/blog/post');
    process.exit(1);
  }

  // Mode login uniquement (pour X)
  if (loginMode) {
    await doLogin();
    return;
  }

  // Détecter la source
  const source = detectSource(articleUrl);
  console.log(`Source détectée : ${sourceLabel(source)}`);

  if (headlessMode) {
    console.log('Mode headless (MCP)...');
  } else {
    console.log('Lancement du navigateur...');
  }

  const browser = await chromium.launch({
    headless: headlessMode,
    channel: 'chrome',
  });

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    locale: 'fr-FR',
  });

  const page = await context.newPage();

  try {
    // Pour X, gérer l'authentification
    if (source === 'x') {
      await loadOrLogin(context, page, articleUrl, headlessMode);
    } else {
      // Pour les autres sources, naviguer directement
      console.log(`Navigation vers l'article...`);
      await page.goto(articleUrl, { waitUntil: 'domcontentloaded' });
    }

    // Sélectionner l'extracteur approprié
    const extractor = getExtractor(source);

    // Attendre le contenu
    console.log('Attente du contenu...');
    await extractor.waitForContent(page);

    // Extraire l'article
    console.log('Extraction du contenu...');
    const articleData = await extractor.extract(page);
    console.log(`  Titre : ${articleData.title}`);
    if (articleData.byline) console.log(`  Auteur : ${articleData.byline}`);

    // Convertir les images en base64
    console.log('Conversion des images en base64...');
    const embedded = await embedImages(page, articleData);

    // Générer la sortie
    let output, ext;
    if (markdownMode) {
      output = generateMarkdown(embedded);
      ext = 'md';
    } else {
      output = generateHtml(embedded, extractor.extraCss());
      ext = 'html';
    }

    // Sauvegarder
    const slug = slugify(articleData.siteName);
    const outputFilename = `${slug}-article-${Date.now()}.${ext}`;
    await fs.writeFile(outputFilename, output, 'utf-8');
    console.log(`✓ Article sauvegardé : ${outputFilename}`);

  } catch (error) {
    console.error('Erreur:', error.message);
    await page.screenshot({ path: 'error-screenshot.png' });
    console.error('Capture d\'écran sauvegardée : error-screenshot.png');
    process.exit(1);
  } finally {
    await browser.close();
  }
}

/**
 * Retourne le module extracteur correspondant à la source.
 */
function getExtractor(source) {
  switch (source) {
    case 'x': return xExtractor;
    case 'medium': return mediumExtractor;
    default: return genericExtractor;
  }
}

/**
 * Génère un slug pour le nom de fichier.
 */
function slugify(str) {
  return (str || 'article').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ===== Authentification X =====

async function doLogin() {
  console.log('Lancement du navigateur pour connexion...');

  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
  });

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    locale: 'fr-FR',
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

    await page.waitForURL(
      url => !url.toString().includes('/login') &&
             !url.toString().includes('/i/flow/login') &&
             !url.toString().includes('/i/flow/signup'),
      { timeout: 300000 }
    );

    await page.waitForTimeout(2000);

    const cookies = await context.cookies();
    await fs.writeFile(COOKIES_FILE, JSON.stringify(cookies, null, 2));
    console.log('');
    console.log(`✓ Session sauvegardée dans ${COOKIES_FILE}`);
    console.log('✓ Vous pouvez maintenant utiliser --headless pour les extractions X');

  } finally {
    await browser.close();
  }
}

async function loadOrLogin(context, page, articleUrl, headlessMode = false) {
  // Essayer de charger les cookies existants
  try {
    const cookiesData = await fs.readFile(COOKIES_FILE, 'utf-8');
    const cookies = JSON.parse(cookiesData);
    await context.addCookies(cookies);
    console.log('✓ Cookies X chargés');
  } catch (err) {
    if (headlessMode) {
      throw new Error('SESSION_REQUIRED: Aucune session X sauvegardée. Lancez d\'abord : node index.js --login');
    }
    console.log('Aucune session X sauvegardée');
  }

  console.log(`Navigation vers l'article...`);
  await page.goto(articleUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const currentUrl = page.url();
  const needsLogin = currentUrl.includes('/login') ||
                     currentUrl.includes('/i/flow/login') ||
                     currentUrl.includes('/i/flow/signup');

  if (!needsLogin) return;

  if (headlessMode) {
    throw new Error('SESSION_EXPIRED: La session X a expiré. Lancez : node index.js --login');
  }

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Connectez-vous à X dans le navigateur qui vient de s\'ouvrir ║');
  console.log('║  Le script continuera automatiquement après la connexion     ║');
  console.log('║  (Timeout: 5 minutes)                                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  await page.waitForURL(
    url => !url.toString().includes('/login') &&
           !url.toString().includes('/i/flow/login') &&
           !url.toString().includes('/i/flow/signup'),
    { timeout: 300000 }
  );

  await page.waitForTimeout(2000);

  if (!page.url().includes(articleUrl.split('/status/')[1])) {
    await page.goto(articleUrl, { waitUntil: 'domcontentloaded' });
  }

  const cookies = await context.cookies();
  await fs.writeFile(COOKIES_FILE, JSON.stringify(cookies, null, 2));
  console.log(`✓ Cookies X sauvegardés`);
}

// ===== Embedding images =====

async function embedImages(page, articleData) {
  const { html, styles } = articleData;

  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/g;
  const backgroundRegex = /url\(["']?(https?:\/\/[^"')]+)["']?\)/g;

  let processedHtml = html;
  let processedStyles = styles || '';
  const imageUrls = new Set();

  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    if (match[1].startsWith('http')) {
      imageUrls.add(match[1]);
    }
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

  console.log(`  ${imageUrls.size} images trouvées...`);

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
      if (processedStyles) {
        processedStyles = processedStyles.split(url).join(base64);
      }
      converted++;
    } catch (error) {
      console.warn(`  ⚠ Non convertie: ${url.substring(0, 60)}... (${error.message})`);
    }
  }

  console.log(`  ✓ ${converted}/${imageUrls.size} images converties`);

  return { ...articleData, html: processedHtml, styles: processedStyles };
}

main();
