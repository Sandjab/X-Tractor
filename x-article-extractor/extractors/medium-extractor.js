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

  const ogImage = doc.querySelector('meta[property="og:image"]');
  const featuredImage = ogImage ? ogImage.content : '';

  // Essayer l'extraction spécifique Medium d'abord
  const mediumHtml = await page.evaluate(() => {
    // Préférer storyContent (corps seul, sans header chrome)
    // Fallback sur article si non trouvé
    const selectors = [
      '[data-testid="storyContent"]',
      'article',
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

    // .speechify-ignore est le marqueur natif Medium pour les éléments qui
    // ne sont pas du contenu d'article (chrome : top highlight, byline,
    // Follow, claps, comments, bookmark, listen, share, more, alt-text overlay)
    // Liste data-testid + classes pw-* en defense in depth pour les variantes
    const removeSelectors = [
      // Marqueur Medium pour le chrome non-lisible (couvre la plupart des cas)
      '.speechify-ignore',
      // Top highlight widget (aside flottant)
      'aside',
      // Titre dupliqué (on en réinjecte un depuis og:title)
      '[data-testid="storyTitle"]',
      '.pw-post-title',
      // Clap UI (icône + count)
      '.pw-multi-vote-icon',
      '.pw-multi-vote-count',
      // Navigation et headers
      'nav',
      'header',
      // Barres d'action (header, footer, sidebar)
      '[data-testid="headerSocialActions"]',
      '[data-testid="footerSocialActions"]',
      '[data-testid="postSidebarActions"]',
      // Boutons individuels
      '[data-testid="headerClapButton"]',
      '[data-testid="footerClapButton"]',
      '[data-testid="headerBookmarkButton"]',
      '[data-testid="footerBookmarkButton"]',
      '[data-testid="headerFollowButton"]',
      '[data-testid="audioPlayButton"]',
      '[data-testid="responsesPanel-button"]',
      '[data-testid="responses"]',
      // Author byline / metadata
      '[data-testid="authorByline"]',
      '[data-testid="storyPublishDate"]',
      '[data-testid="storyReadTime"]',
      // Member-only / paywall banners
      '[data-testid="storyPreviewMeteredBanner"]',
      '[data-testid="metered-paywall"]',
      // aria-label fallbacks
      '[aria-label*="Top highlight" i]',
      'button[aria-label*="Listen" i]',
      'button[aria-label*="Share" i]',
      'button[aria-label*="More options" i]',
      'button[aria-label*="Bookmark" i]',
      'button[aria-label*="Follow" i]',
      'button[aria-label*="clap" i]',
      'button[aria-label*="responses" i]',
      // Popovers, tooltips
      '[role="tooltip"]',
      '[data-testid="popover"]',
      // End-of-article promotions
      '[data-testid="post-end-cta"]',
      '[data-testid="belowPostTagsPrompt"]',
      '[data-testid="recommendedPosts"]',
      '[aria-label="recommendations"]',
    ];

    removeSelectors.forEach(sel => {
      try {
        clone.querySelectorAll(sel).forEach(el => el.remove());
      } catch (e) {
        // certains anciens navigateurs ne supportent pas le flag `i`
      }
    });

    // Section "Bonus Articles" / "More from" / "Recommended" :
    // h2 + tous les siblings suivants (cards de posts liés).
    // On détecte le h2 par le texte (fragile mais c'est le seul signal stable).
    const bonusPattern = /^\s*(bonus\s*articles?|more\s+from|recommended|read\s+more|further\s+reading)\s*$/i;
    const allHeadings = clone.querySelectorAll('h1, h2, h3');
    allHeadings.forEach(h => {
      if (bonusPattern.test(h.textContent.trim())) {
        let next = h.nextElementSibling;
        h.remove();
        while (next) {
          const cur = next;
          next = next.nextElementSibling;
          cur.remove();
        }
      }
    });

    // Lien interne Medium "post_page" : signature des cards de posts liés
    // Si un tel lien subsiste isolé, on retire son card-wrapper le plus proche
    clone.querySelectorAll('a[data-discover="true"][href*="source=post_page"]').forEach(a => {
      const card = a.closest('div');
      if (card && card !== clone) card.remove();
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
    featuredImage,
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
