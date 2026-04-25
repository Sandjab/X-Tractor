/**
 * Extracteur spécialisé pour LinkedIn Pulse.
 * Articles publics SSR, sans détection bot agressive (contrairement à Medium).
 * Sélecteur principal stable : [data-test-id="article-content-blocks"].
 */

import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

/**
 * Attend que le contenu LinkedIn soit chargé.
 */
export async function waitForContent(page) {
  // Le contenu Pulse est server-side rendered, il est donc présent dès domcontentloaded
  await page.waitForSelector('[data-test-id="article-content-blocks"], article.article-main', { timeout: 30000 }).catch(() => {});

  // Attendre que les images soient chargées (cover + inline)
  await page.waitForFunction(() => {
    const images = document.querySelectorAll('article img, [data-test-id="article-content-blocks"] img');
    return Array.from(images).every(img => img.complete);
  }, { timeout: 15000 }).catch(() => {});

  await page.waitForTimeout(1000);
}

/**
 * Extrait l'article LinkedIn depuis la page.
 */
export async function extract(page) {
  const pageContent = await page.content();
  const pageUrl = page.url();

  // Métadonnées (parser côté Node pour être robuste aux entités HTML)
  const dom = new JSDOM(pageContent, { url: pageUrl });
  const doc = dom.window.document;

  const ogTitle = doc.querySelector('meta[property="og:title"]');
  // Parse "(N) Titre | LinkedIn" → "Titre" pour le mode logué/auteur
  const parseDocTitle = (t) => (t || '').replace(/^\s*\(\d+\)\s*/, '').replace(/\s*\|\s*LinkedIn\s*$/i, '').trim();
  const title = ogTitle ? ogTitle.content : (doc.querySelector('h1.pulse-title')?.textContent?.trim() || parseDocTitle(doc.querySelector('title')?.textContent) || 'LinkedIn Article');

  // Auteur : LinkedIn n'a pas de meta[name=author] sur Pulse, on lit la card
  const authorLink = doc.querySelector('a[data-tracking-control-name="article-ssr-frontend-pulse_publisher-author-card"]');
  const byline = authorLink ? authorLink.textContent.trim().replace(/\s+/g, ' ') : '';

  const ogImage = doc.querySelector('meta[property="og:image"]');
  const featuredImage = ogImage ? ogImage.content : '';

  // Extraction côté page (pour éviter de perdre les attributs/styles)
  const linkedinHtml = await page.evaluate(() => {
    // Préférer le bloc de contenu pur (sans header/cover/share/comments).
    // Pas de fallback générique sur 'article' : si aucun sélecteur Pulse ne matche,
    // on retourne null pour que Readability prenne le relais (DOM logué/auteur).
    const selectors = [
      '[data-test-id="article-content-blocks"]',
      'article.article-main',
      'article.pulse',
    ];

    let articleEl = null;
    for (const sel of selectors) {
      articleEl = document.querySelector(sel);
      if (articleEl) break;
    }

    if (!articleEl) return null;

    const clone = articleEl.cloneNode(true);

    // LinkedIn utilise data-delayed-url pour le lazy loading.
    // Promouvoir vers src pour que l'embedding base64 puisse les attraper.
    clone.querySelectorAll('img[data-delayed-url]').forEach(img => {
      const url = img.getAttribute('data-delayed-url');
      if (url && !img.getAttribute('src')) {
        img.setAttribute('src', url);
      }
    });

    // Liste de chrome LinkedIn à supprimer (defense in depth)
    const removeSelectors = [
      // Navigation et menus
      'nav',
      'header',
      'footer',
      // Cover image (réinjectée depuis og:image en haut du HTML)
      'figure.cover-img',
      // Menu ellipsis (3 points)
      '.ellipsis-menu',
      '[data-tracking-control-name*="ellipsis-menu"]',
      // Cards d'articles recommandés (inline ET en bas)
      'a[data-tracking-control-name="inline-recommended-articles"]',
      '[data-tracking-control-name*="recommended-articles"]',
      '[data-tracking-control-name*="see_all_articles"]',
      '[data-tracking-control-name*="see_more"]',
      '[data-tracking-control-name*="show_more"]',
      // Social actions (likes, commentaires, partage)
      '[data-test-id^="social-actions"]',
      '[data-tracking-control-name*="social-share"]',
      '[data-tracking-control-name*="like-toggle"]',
      '[data-tracking-control-name*="comment-cta"]',
      '[data-tracking-control-name*="likes-count"]',
      '[data-tracking-control-name*="reactions"]',
      // CTA bandeaux (sign-in, feed, follow)
      '[data-tracking-control-name*="sign-in-redirect"]',
      '[data-tracking-control-name*="feed-cta-banner"]',
      '[data-tracking-control-name*="nav-header-join"]',
      '[data-tracking-control-name*="nav-header-signin"]',
      // Author card (réinjectée en byline)
      '[data-tracking-control-name*="publisher-author-card"]',
      // Topic pills
      '[data-tracking-control-name*="topic_pill"]',
      // Boutons divers
      'button[aria-label*="Open menu" i]',
      'button[aria-label*="Sign in" i]',
      // Popovers / dropdowns
      '[role="tooltip"]',
      '.collapsible-dropdown__list',
      // Boutons CTA Pulse
      '[data-tracking-control-name="article-ssr-frontend-pulse_little-text-block"]',
    ];

    removeSelectors.forEach(sel => {
      try {
        clone.querySelectorAll(sel).forEach(el => el.remove());
      } catch (e) {
        // ignore selectors non supportés
      }
    });

    return clone.outerHTML;
  });

  let html;

  if (linkedinHtml) {
    html = linkedinHtml;
  } else {
    // Fallback Readability
    const reader = new Readability(doc);
    const article = reader.parse();
    if (!article) {
      throw new Error('Impossible d\'extraire l\'article LinkedIn');
    }
    html = article.content;
  }

  // Styles du body pour le thème
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
    featuredImage,
    siteName: 'LinkedIn',
    bodyStyles,
  };
}

/**
 * Styles CSS supplémentaires pour LinkedIn.
 */
export function extraCss() {
  return `
    /* LinkedIn article styles */
    figure { margin: 2em 0; }
    figure img { display: block; margin: 0 auto; max-width: 100%; height: auto; }
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
    /* Texte LinkedIn : éviter les titres trop énormes */
    .article-main__content { margin: 0 0 1em 0; }
    h1, h2, h3, h4 { line-height: 1.3; }
  `;
}
