/**
 * Extracteur spécialisé pour Medium.
 * Utilise des sélecteurs spécifiques à Medium avec fallback Readability.
 */

import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

/**
 * Attend que le contenu Medium soit chargé.
 */
export async function waitForContent(page) {
  // Medium utilise <article> comme conteneur principal
  await page.waitForSelector('article', { timeout: 30000 }).catch(() => {});

  // Attendre que les images soient chargées
  await page.waitForFunction(() => {
    const images = document.querySelectorAll('article img');
    return Array.from(images).every(img => img.complete);
  }, { timeout: 15000 }).catch(() => {});

  await page.waitForTimeout(1500);
}

/**
 * Extrait l'article Medium depuis la page.
 * Essaie d'abord les sélecteurs spécifiques, puis Readability en fallback.
 */
export async function extract(page) {
  const pageContent = await page.content();
  const pageUrl = page.url();

  // Extraction côté Node.js avec JSDOM + Readability
  const dom = new JSDOM(pageContent, { url: pageUrl });
  const doc = dom.window.document;

  // Métadonnées
  const ogTitle = doc.querySelector('meta[property="og:title"]');
  const title = ogTitle ? ogTitle.content : doc.querySelector('title')?.textContent || 'Medium Article';

  const authorMeta = doc.querySelector('meta[name="author"]');
  const byline = authorMeta ? authorMeta.content : '';

  // Essayer l'extraction spécifique Medium d'abord
  const mediumHtml = await page.evaluate(() => {
    // Sélecteurs Medium connus (article principal)
    const selectors = [
      'article',
      '[data-testid="storyContent"]',
      '.meteredContent',
      '.postArticle-content',
    ];

    let articleEl = null;
    for (const sel of selectors) {
      articleEl = document.querySelector(sel);
      if (articleEl) break;
    }

    if (!articleEl) return null;

    const clone = articleEl.cloneNode(true);

    // Supprimer les éléments parasites Medium
    const removeSelectors = [
      // Navigation et header
      'nav',
      'header:not(article header)',
      // Barres d'action
      '[data-testid="headerSocialActions"]',
      '[data-testid="postSidebarActions"]',
      '[data-testid="audioPlayButton"]',
      // Popovers, tooltips
      '[role="tooltip"]',
      '[data-testid="popover"]',
      // Suivre / S'abonner
      'button[data-testid="headerFollowButton"]',
      // Footer promotions
      '[data-testid="post-end-cta"]',
      '[data-testid="belowPostTagsPrompt"]',
      // Recommendations
      '[data-testid="recommendedPosts"]',
      '[aria-label="recommendations"]',
      // Commentaires
      '[data-testid="responses"]',
      // Member-only banners
      '[data-testid="metered-paywall"]',
    ];

    removeSelectors.forEach(sel => {
      clone.querySelectorAll(sel).forEach(el => el.remove());
    });

    return clone.outerHTML;
  });

  let html;

  if (mediumHtml) {
    html = mediumHtml;
  } else {
    // Fallback Readability
    const reader = new Readability(doc);
    const article = reader.parse();
    if (!article) {
      throw new Error('Impossible d\'extraire l\'article Medium');
    }
    html = article.content;
  }

  // Récupérer les styles de la page pour le thème
  const bodyStyles = await page.evaluate(() => {
    const style = getComputedStyle(document.body);
    return {
      backgroundColor: style.backgroundColor || '#fff',
      color: style.color || '#000',
      fontFamily: style.fontFamily,
    };
  });

  return {
    html,
    styles: '',
    title,
    byline,
    siteName: 'Medium',
    bodyStyles,
  };
}

/**
 * Styles CSS supplémentaires pour Medium.
 */
export function extraCss() {
  return `
    /* Medium article styles */
    article { max-width: 100% !important; }
    figure { margin: 2em 0; }
    figure img { display: block; margin: 0 auto; }
    figcaption {
      text-align: center;
      font-size: 0.875em;
      opacity: 0.7;
      margin-top: 0.5em;
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
  `;
}
