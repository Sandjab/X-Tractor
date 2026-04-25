// Content script pour l'extraction multi-source d'articles
// Ce script est injecté dans la page et peut accéder au DOM

// === Détection de la source ===
function detectSource() {
  const host = window.location.hostname.toLowerCase();
  if (host === 'x.com' || host === 'twitter.com' || host.endsWith('.x.com') || host.endsWith('.twitter.com')) return 'x';
  if (host === 'medium.com' || host.endsWith('.medium.com')) return 'medium';
  if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) return 'linkedin';
  const gen = document.querySelector('meta[name="generator"]');
  if (gen && gen.content && gen.content.toLowerCase().includes('medium')) return 'medium';
  const mp = document.querySelector('meta[property="al:android:package"][content="com.medium.reader"]');
  if (mp) return 'medium';
  return 'generic';
}

// === Extraction X ===
function extractX() {
  const article = document.querySelector('article');
  if (!article) throw new Error('Article X non trouvé');
  const container = article.closest('[data-testid="tweet"]') || article;
  const clone = container.cloneNode(true);

  ['[data-testid="reply"]','[data-testid="retweet"]','[data-testid="like"]','[data-testid="bookmark"]','[data-testid="share"]','[role="group"]','[data-testid="caret"]'].forEach(sel => {
    clone.querySelectorAll(sel).forEach(el => el.remove());
  });

  const styles = extractStyles();
  const titleEl = document.querySelector('meta[property="og:title"]');

  return {
    html: clone.outerHTML,
    styles: styles,
    title: titleEl ? titleEl.content : document.title,
    siteName: 'X',
    extraCss: '[style*="max-width: 600px"],[style*="max-width:600px"],[style*="max-width: 598px"],[style*="max-width:598px"]{max-width:100%!important}article,article>div{max-width:100%!important;width:100%!important}'
  };
}

// === Extraction Medium ===
function extractMedium() {
  // storyContent en premier : c'est le corps seul, sans le chrome de Medium
  const selectors = ['[data-testid="storyContent"]', 'article', '.meteredContent', '.postArticle-content'];
  let articleEl = null;
  for (const sel of selectors) {
    articleEl = document.querySelector(sel);
    if (articleEl) break;
  }
  if (!articleEl) throw new Error('Article Medium non trouvé');
  const clone = articleEl.cloneNode(true);

  const removeSelectors = [
    // Marqueur Medium pour chrome non-lisible
    '.speechify-ignore','aside',
    // Titre dupliqué (réinjecté ci-dessous depuis og:title)
    '[data-testid="storyTitle"]','.pw-post-title',
    // Clap UI résiduel
    '.pw-multi-vote-icon','.pw-multi-vote-count',
    // Navigation et headers
    'nav','header',
    '[data-testid="headerSocialActions"]','[data-testid="footerSocialActions"]','[data-testid="postSidebarActions"]',
    '[data-testid="headerClapButton"]','[data-testid="footerClapButton"]',
    '[data-testid="headerBookmarkButton"]','[data-testid="footerBookmarkButton"]',
    '[data-testid="headerFollowButton"]','[data-testid="audioPlayButton"]',
    '[data-testid="responsesPanel-button"]','[data-testid="responses"]',
    '[data-testid="authorByline"]','[data-testid="storyPublishDate"]','[data-testid="storyReadTime"]',
    '[data-testid="storyPreviewMeteredBanner"]','[data-testid="metered-paywall"]',
    '[aria-label*="Top highlight" i]',
    'button[aria-label*="Listen" i]','button[aria-label*="Share" i]','button[aria-label*="More options" i]',
    'button[aria-label*="Bookmark" i]','button[aria-label*="Follow" i]',
    'button[aria-label*="clap" i]','button[aria-label*="responses" i]',
    '[role="tooltip"]','[data-testid="popover"]',
    '[data-testid="post-end-cta"]','[data-testid="belowPostTagsPrompt"]','[data-testid="recommendedPosts"]','[aria-label="recommendations"]',
  ];
  removeSelectors.forEach(sel => {
    try { clone.querySelectorAll(sel).forEach(el => el.remove()); } catch (e) {}
  });

  // Section "Bonus Articles" / "More from" / "Recommended" : h2 + siblings
  const bonusPattern = /^\s*(bonus\s*articles?|more\s+from|recommended|read\s+more|further\s+reading)\s*$/i;
  clone.querySelectorAll('h1, h2, h3').forEach(h => {
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
  // Cards de posts liés (lien interne Medium ?source=post_page)
  clone.querySelectorAll('a[data-discover="true"][href*="source=post_page"]').forEach(a => {
    const card = a.closest('div');
    if (card && card !== clone) card.remove();
  });

  const titleEl = document.querySelector('meta[property="og:title"]');
  const authorEl = document.querySelector('meta[name="author"]');
  const ogImage = document.querySelector('meta[property="og:image"]');

  // Reconstruire l'en-tête (image, titre, auteur) depuis les métadonnées
  let headerHtml = '';
  if (ogImage && ogImage.content) {
    headerHtml += '<figure class="x-tractor-featured"><img src="' + ogImage.content + '" alt=""></figure>';
  }
  const articleTitle = titleEl ? titleEl.content : document.title;
  if (articleTitle && !clone.outerHTML.trimStart().match(/^<h1[\s>]/i)) {
    headerHtml += '<h1 class="x-tractor-title">' + articleTitle.replace(/</g, '&lt;') + '</h1>';
  }
  if (authorEl && authorEl.content) {
    headerHtml += '<div class="x-tractor-byline">' + authorEl.content.replace(/</g, '&lt;') + '</div>';
  }

  return {
    html: headerHtml + clone.outerHTML,
    styles: '',
    title: articleTitle,
    siteName: 'Medium',
    extraCss: '.x-tractor-featured{margin:0 0 1.5em 0;text-align:center}.x-tractor-featured img{max-width:100%;height:auto;border-radius:4px}.x-tractor-title{margin:0 0 0.3em 0;line-height:1.2}.x-tractor-byline{opacity:0.6;font-size:0.9em;margin-bottom:1.5em;padding-bottom:1em;border-bottom:1px solid rgba(128,128,128,0.3)}figure{margin:2em 0}figure img{display:block;margin:0 auto}figcaption{text-align:center;font-size:0.875em;opacity:0.7;margin-top:0.5em}pre{background:rgba(128,128,128,0.1);padding:1em;border-radius:4px;overflow-x:auto}blockquote{border-left:3px solid currentColor;margin-left:0;padding-left:1.5em;opacity:0.85}'
  };
}

// === Extraction LinkedIn ===
function parseLinkedInDocTitle(t) {
  return (t || '').replace(/^\s*\(\d+\)\s*/, '').replace(/\s*\|\s*LinkedIn\s*$/i, '').trim();
}

function extractLinkedIn() {
  // 1) Tentative ciblée : sélecteurs Pulse publics
  const specificSelectors = ['[data-test-id="article-content-blocks"]', 'article.article-main', 'article.pulse'];
  let articleEl = null;
  for (const sel of specificSelectors) {
    articleEl = document.querySelector(sel);
    if (articleEl) break;
  }

  // 2) Fallback Readability si DOM logué/auteur
  if (!articleEl) {
    const titleElMeta = document.querySelector('meta[property="og:title"]');
    const ogImageMeta = document.querySelector('meta[property="og:image"]');
    const articleTitle = (titleElMeta && titleElMeta.content) ? titleElMeta.content : parseLinkedInDocTitle(document.title);

    if (typeof Readability !== 'undefined') {
      try {
        const docClone = document.cloneNode(true);
        const reader = new Readability(docClone);
        const article = reader.parse();
        if (article && article.content) {
          let headerHtml = '';
          if (ogImageMeta && ogImageMeta.content) {
            headerHtml += '<figure class="x-tractor-featured"><img src="' + ogImageMeta.content + '" alt=""></figure>';
          }
          if (articleTitle && !article.content.trimStart().match(/^<h1[\s>]/i)) {
            headerHtml += '<h1 class="x-tractor-title">' + articleTitle.replace(/</g, '&lt;') + '</h1>';
          }
          if (article.byline) {
            headerHtml += '<div class="x-tractor-byline">' + article.byline.replace(/</g, '&lt;') + '</div>';
          }
          return {
            html: headerHtml + article.content,
            styles: '',
            title: articleTitle,
            siteName: 'LinkedIn',
            extraCss: '.x-tractor-featured{margin:0 0 1.5em 0;text-align:center}.x-tractor-featured img{max-width:100%;height:auto;border-radius:4px}.x-tractor-title{margin:0 0 0.3em 0;line-height:1.2}.x-tractor-byline{opacity:0.6;font-size:0.9em;margin-bottom:1.5em;padding-bottom:1em;border-bottom:1px solid rgba(128,128,128,0.3)}figure{margin:2em 0}figure img{display:block;margin:0 auto;max-width:100%;height:auto}figcaption{text-align:center;font-size:0.875em;opacity:0.7;margin-top:0.5em}pre{background:rgba(128,128,128,0.1);padding:1em;border-radius:4px;overflow-x:auto}blockquote{border-left:3px solid currentColor;margin-left:0;padding-left:1.5em;opacity:0.85}'
          };
        }
      } catch (e) {
        console.warn('LinkedIn: Readability a échoué, fallback article:', e.message);
      }
    }
    articleEl = document.querySelector('article');
  }

  if (!articleEl) throw new Error('Article LinkedIn non trouvé');
  const clone = articleEl.cloneNode(true);

  // LinkedIn utilise data-delayed-url pour le lazy load : promouvoir vers src
  clone.querySelectorAll('img[data-delayed-url]').forEach(img => {
    const url = img.getAttribute('data-delayed-url');
    if (url && !img.getAttribute('src')) img.setAttribute('src', url);
  });

  const removeSelectors = [
    'nav','header','footer',
    'figure.cover-img',
    '.ellipsis-menu','[data-tracking-control-name*="ellipsis-menu"]',
    'a[data-tracking-control-name="inline-recommended-articles"]',
    '[data-tracking-control-name*="recommended-articles"]',
    '[data-tracking-control-name*="see_all_articles"]',
    '[data-tracking-control-name*="see_more"]','[data-tracking-control-name*="show_more"]',
    '[data-test-id^="social-actions"]',
    '[data-tracking-control-name*="social-share"]','[data-tracking-control-name*="like-toggle"]',
    '[data-tracking-control-name*="comment-cta"]','[data-tracking-control-name*="likes-count"]',
    '[data-tracking-control-name*="reactions"]',
    '[data-tracking-control-name*="sign-in-redirect"]','[data-tracking-control-name*="feed-cta-banner"]',
    '[data-tracking-control-name*="nav-header-join"]','[data-tracking-control-name*="nav-header-signin"]',
    '[data-tracking-control-name*="publisher-author-card"]',
    '[data-tracking-control-name*="topic_pill"]',
    'button[aria-label*="Open menu" i]','button[aria-label*="Sign in" i]',
    '[role="tooltip"]','.collapsible-dropdown__list',
    '[data-tracking-control-name="article-ssr-frontend-pulse_little-text-block"]',
  ];
  removeSelectors.forEach(sel => {
    try { clone.querySelectorAll(sel).forEach(el => el.remove()); } catch (e) {}
  });

  // Reconstruire l'en-tête depuis les meta tags
  const titleEl = document.querySelector('meta[property="og:title"]');
  const ogImage = document.querySelector('meta[property="og:image"]');
  const authorLink = document.querySelector('a[data-tracking-control-name="article-ssr-frontend-pulse_publisher-author-card"]');
  const articleTitle = titleEl ? titleEl.content : (document.querySelector('h1.pulse-title')?.textContent?.trim() || document.title);
  const byline = authorLink ? authorLink.textContent.trim().replace(/\s+/g, ' ') : '';

  let headerHtml = '';
  if (ogImage && ogImage.content) {
    headerHtml += '<figure class="x-tractor-featured"><img src="' + ogImage.content + '" alt=""></figure>';
  }
  if (articleTitle && !clone.outerHTML.trimStart().match(/^<h1[\s>]/i)) {
    headerHtml += '<h1 class="x-tractor-title">' + articleTitle.replace(/</g, '&lt;') + '</h1>';
  }
  if (byline) {
    headerHtml += '<div class="x-tractor-byline">' + byline.replace(/</g, '&lt;') + '</div>';
  }

  return {
    html: headerHtml + clone.outerHTML,
    styles: '',
    title: articleTitle,
    siteName: 'LinkedIn',
    extraCss: '.x-tractor-featured{margin:0 0 1.5em 0;text-align:center}.x-tractor-featured img{max-width:100%;height:auto;border-radius:4px}.x-tractor-title{margin:0 0 0.3em 0;line-height:1.2}.x-tractor-byline{opacity:0.6;font-size:0.9em;margin-bottom:1.5em;padding-bottom:1em;border-bottom:1px solid rgba(128,128,128,0.3)}figure{margin:2em 0}figure img{display:block;margin:0 auto;max-width:100%;height:auto}figcaption{text-align:center;font-size:0.875em;opacity:0.7;margin-top:0.5em}pre{background:rgba(128,128,128,0.1);padding:1em;border-radius:4px;overflow-x:auto}blockquote{border-left:3px solid currentColor;margin-left:0;padding-left:1.5em;opacity:0.85}.article-main__content{margin:0 0 1em 0}h1,h2,h3,h4{line-height:1.3}'
  };
}

// === Extraction générique avec Readability ===
function extractGeneric() {
  // Essayer Readability d'abord (si disponible)
  if (typeof Readability !== 'undefined') {
    try {
      const docClone = document.cloneNode(true);
      const reader = new Readability(docClone);
      const article = reader.parse();
      if (article && article.content) {
        const titleEl = document.querySelector('meta[property="og:title"]');
        const siteNameEl = document.querySelector('meta[property="og:site_name"]');
        const genericCss = 'figure{margin:2em 0}figure img{display:block;margin:0 auto}figcaption{text-align:center;font-size:0.875em;opacity:0.7}pre{background:rgba(128,128,128,0.1);padding:1em;border-radius:4px;overflow-x:auto}blockquote{border-left:3px solid currentColor;margin-left:0;padding-left:1.5em;opacity:0.85}a{color:#1d9bf0}';

        let headerHtml = '';

        // Image à la une via og:image (universel, pas spécifique WordPress)
        const ogImage = document.querySelector('meta[property="og:image"]');
        if (ogImage && ogImage.content) {
          headerHtml += '<figure class="x-tractor-featured"><img src="' + ogImage.content + '" alt=""></figure>';
        }

        // Titre : seulement si le content ne commence pas déjà par un <h1>
        const articleTitle = titleEl ? titleEl.content : (article.title || document.title);
        if (articleTitle && !article.content.trimStart().match(/^<h1[\s>]/i)) {
          headerHtml += '<h1 class="x-tractor-title">' + articleTitle.replace(/</g, '&lt;') + '</h1>';
        }

        // Byline
        if (article.byline) {
          headerHtml += '<div class="x-tractor-byline">' + article.byline.replace(/</g, '&lt;') + '</div>';
        }

        return {
          html: headerHtml + article.content,
          styles: '',
          title: articleTitle,
          siteName: siteNameEl ? siteNameEl.content : window.location.hostname,
          extraCss: genericCss + '.x-tractor-featured{margin:0 0 1.5em 0;text-align:center}.x-tractor-featured img{max-width:100%;height:auto;border-radius:4px}.x-tractor-title{margin:0 0 0.3em 0;line-height:1.2}.x-tractor-byline{opacity:0.6;font-size:0.9em;margin-bottom:1.5em;padding-bottom:1em;border-bottom:1px solid rgba(128,128,128,0.3)}'
        };
      }
    } catch (e) {
      console.warn('Readability failed, falling back to heuristic:', e.message);
    }
  }

  // Fallback heuristique
  const candidates = [
    document.querySelector('article'),
    document.querySelector('[role="article"]'),
    document.querySelector('main article'),
    document.querySelector('main'),
    document.querySelector('.post-content'),
    document.querySelector('.entry-content'),
    document.querySelector('.article-content'),
    document.querySelector('.article-body'),
    document.querySelector('.post-body'),
    document.querySelector('.story-body'),
    document.querySelector('#content'),
    document.querySelector('.content'),
  ];

  let articleEl = candidates.find(el => el !== null);

  if (!articleEl) {
    const blocks = document.querySelectorAll('div, section');
    let maxLen = 0;
    for (const block of blocks) {
      const text = block.textContent || '';
      if (text.length > maxLen && block.querySelectorAll('p').length >= 2) {
        maxLen = text.length;
        articleEl = block;
      }
    }
  }

  if (!articleEl) throw new Error('Contenu principal non trouvé');

  const clone = articleEl.cloneNode(true);
  ['nav','header','footer','.sidebar','.ad','.advertisement','.social-share','.comments','.comment-section','[role="navigation"]','[role="banner"]','[role="contentinfo"]','script','style','iframe[src*="ad"]','.newsletter-signup','.related-posts','.recommended'].forEach(sel => {
    clone.querySelectorAll(sel).forEach(el => el.remove());
  });

  const titleEl = document.querySelector('meta[property="og:title"]');
  const siteNameEl = document.querySelector('meta[property="og:site_name"]');

  return {
    html: clone.outerHTML,
    styles: '',
    title: titleEl ? titleEl.content : document.title,
    siteName: siteNameEl ? siteNameEl.content : window.location.hostname,
    extraCss: 'figure{margin:2em 0}figure img{display:block;margin:0 auto}figcaption{text-align:center;font-size:0.875em;opacity:0.7}pre{background:rgba(128,128,128,0.1);padding:1em;border-radius:4px;overflow-x:auto}blockquote{border-left:3px solid currentColor;margin-left:0;padding-left:1.5em;opacity:0.85}a{color:#1d9bf0}'
  };
}

// === Utilitaires partagés ===
function extractStyles() {
  let styles = '';
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules || []) {
        styles += rule.cssText + '\n';
      }
    } catch (e) {}
  }
  return styles;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function imageToBase64ViaCanvas(img) {
  return new Promise((resolve, reject) => {
    if (!img.complete || img.naturalWidth === 0) {
      reject(new Error('Image not loaded'));
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    try {
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    } catch (e) {
      reject(e);
    }
  });
}

// === Fonction d'extraction principale ===
async function extractArticle() {
  const source = detectSource();

  let data;
  if (source === 'x') {
    data = extractX();
  } else if (source === 'medium') {
    data = extractMedium();
  } else if (source === 'linkedin') {
    data = extractLinkedIn();
  } else {
    data = extractGeneric();
  }

  // Convertir les images en base64
  const container = document.createElement('div');
  container.innerHTML = data.html;

  const images = container.querySelectorAll('img');
  for (const img of images) {
    try {
      const response = await fetch(img.src, { mode: 'cors' });
      const blob = await response.blob();
      const base64 = await blobToBase64(blob);
      img.src = base64;
    } catch (e) {
      try {
        const base64 = await imageToBase64ViaCanvas(img);
        if (base64) img.src = base64;
      } catch (e2) {
        console.warn('Image non convertible:', img.src);
      }
    }
  }

  // Convertir les background-images
  const allElements = container.querySelectorAll('*');
  for (const el of allElements) {
    const bg = getComputedStyle(el).backgroundImage;
    if (bg && bg !== 'none' && bg.startsWith('url(')) {
      const urlMatch = bg.match(/url\(["']?([^"')]+)["']?\)/);
      if (urlMatch && urlMatch[1].startsWith('http')) {
        try {
          const response = await fetch(urlMatch[1], { mode: 'cors' });
          const blob = await response.blob();
          const base64 = await blobToBase64(blob);
          el.style.backgroundImage = `url("${base64}")`;
        } catch (e) {}
      }
    }
  }

  return {
    articleHtml: container.innerHTML,
    styles: data.styles,
    title: data.title,
    siteName: data.siteName,
    extraCss: data.extraCss,
    source: source,
  };
}

// Export pour utilisation par l'extension
window.extractArticle = extractArticle;
