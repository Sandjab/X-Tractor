/**
 * Extracteur générique basé sur Mozilla Readability.
 * Fonctionne sur n'importe quelle page web.
 */

import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

/**
 * Attend que le contenu de la page soit chargé.
 */
export async function waitForContent(page) {
  // Attendre que le DOM soit stable
  await page.waitForLoadState('domcontentloaded');

  // Attendre un peu que le JS côté client finisse de rendre
  await page.waitForTimeout(2000);

  // Attendre que les images soient chargées
  await page.waitForFunction(() => {
    const images = document.querySelectorAll('img');
    return Array.from(images).every(img => img.complete);
  }, { timeout: 15000 }).catch(() => {});
}

/**
 * Extrait l'article principal de la page avec Readability.
 */
export async function extract(page) {
  const pageContent = await page.content();
  const pageUrl = page.url();

  const dom = new JSDOM(pageContent, { url: pageUrl });
  const doc = dom.window.document;

  // Métadonnées
  const ogTitle = doc.querySelector('meta[property="og:title"]');
  const metaAuthor = doc.querySelector('meta[name="author"]');
  const ogSiteName = doc.querySelector('meta[property="og:site_name"]');

  const reader = new Readability(doc);
  const article = reader.parse();

  if (!article) {
    throw new Error('Impossible d\'extraire le contenu principal de cette page. Readability n\'a pas trouvé d\'article.');
  }

  const title = ogTitle ? ogTitle.content : (article.title || doc.querySelector('title')?.textContent || 'Article');
  const byline = metaAuthor ? metaAuthor.content : (article.byline || '');
  const siteName = ogSiteName ? ogSiteName.content : new URL(pageUrl).hostname;

  // Récupérer le thème de la page
  const bodyStyles = await page.evaluate(() => {
    const style = getComputedStyle(document.body);
    return {
      backgroundColor: style.backgroundColor || '#fff',
      color: style.color || '#000',
      fontFamily: style.fontFamily,
    };
  });

  return {
    html: article.content,
    styles: '',
    title,
    byline,
    siteName,
    bodyStyles,
  };
}

/**
 * Styles CSS génériques pour une bonne lisibilité.
 */
export function extraCss() {
  return `
    /* Generic article styles */
    figure { margin: 2em 0; }
    figure img { display: block; margin: 0 auto; }
    figcaption {
      text-align: center;
      font-size: 0.875em;
      opacity: 0.7;
      margin-top: 0.5em;
    }
    pre, code {
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
    }
    pre {
      background: rgba(128,128,128,0.1);
      padding: 1em;
      border-radius: 4px;
      overflow-x: auto;
    }
    blockquote {
      border-left: 3px solid currentColor;
      margin-left: 0;
      padding-left: 1.5em;
      opacity: 0.85;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 1em 0;
    }
    th, td {
      border: 1px solid rgba(128,128,128,0.3);
      padding: 0.5em 1em;
      text-align: left;
    }
    a { color: #1d9bf0; }
  `;
}
