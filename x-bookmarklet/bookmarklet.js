(async function() {
  const statusDiv = document.createElement('div');
  statusDiv.id = 'x-extractor-status';
  statusDiv.style.cssText = 'position:fixed;top:20px;right:20px;background:#1d9bf0;color:white;padding:15px 20px;border-radius:8px;z-index:999999;font-family:system-ui;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
  statusDiv.textContent = 'Extraction en cours...';
  document.body.appendChild(statusDiv);

  const updateStatus = (msg) => { statusDiv.textContent = msg; };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // URL de Readability.js (remplacée dynamiquement par install.html)
  const READABILITY_URL = '__READABILITY_URL__';

  // Charge Readability.js dynamiquement si pas encore présent
  function loadReadability() {
    return new Promise((resolve, reject) => {
      if (typeof Readability !== 'undefined') { resolve(); return; }
      if (READABILITY_URL === '__READABILITY_' + 'URL__') { reject(new Error('URL non configurée')); return; }
      const s = document.createElement('script');
      s.src = READABILITY_URL;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Impossible de charger Readability'));
      document.head.appendChild(s);
    });
  }

  // === Détection de la source ===
  function detectSource() {
    const host = window.location.hostname.toLowerCase();
    if (host === 'x.com' || host === 'twitter.com' || host.endsWith('.x.com') || host.endsWith('.twitter.com')) return 'x';
    if (host === 'medium.com' || host.endsWith('.medium.com')) return 'medium';
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
    ['[data-testid="reply"]','[data-testid="retweet"]','[data-testid="like"]','[data-testid="bookmark"]','[data-testid="share"]','[role="group"]'].forEach(sel => {
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
    // storyContent en premier : corps seul sans chrome
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
      // Titre dupliqué
      '[data-testid="storyTitle"]','.pw-post-title',
      // Clap UI résiduel
      '.pw-multi-vote-icon','.pw-multi-vote-count',
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
      '[data-testid="post-end-cta"]','[data-testid="belowPostTagsPrompt"]','[data-testid="recommendedPosts"]','[aria-label="recommendations"]'
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

  // === Extraction générique (Readability + fallback heuristique) ===
  function extractGeneric() {
    const genericCss = 'figure{margin:2em 0}figure img{display:block;margin:0 auto}figcaption{text-align:center;font-size:0.875em;opacity:0.7}pre{background:rgba(128,128,128,0.1);padding:1em;border-radius:4px;overflow-x:auto}blockquote{border-left:3px solid currentColor;margin-left:0;padding-left:1.5em;opacity:0.85}a{color:#1d9bf0}';
    const titleEl = document.querySelector('meta[property="og:title"]');
    const siteNameEl = document.querySelector('meta[property="og:site_name"]');
    const title = titleEl ? titleEl.content : document.title;
    const siteName = siteNameEl ? siteNameEl.content : window.location.hostname;

    // Essayer Readability d'abord (chargé dynamiquement)
    if (typeof Readability !== 'undefined') {
      try {
        const docClone = document.cloneNode(true);
        const reader = new Readability(docClone);
        const article = reader.parse();
        if (article && article.content) {
          let headerHtml = '';

          // Image à la une via og:image (universel, pas spécifique WordPress)
          const ogImage = document.querySelector('meta[property="og:image"]');
          if (ogImage && ogImage.content) {
            headerHtml += '<figure class="x-tractor-featured"><img src="' + ogImage.content + '" alt=""></figure>';
          }

          // Titre : seulement si le content ne commence pas déjà par un <h1>
          const articleTitle = article.title || title;
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
            siteName: siteName,
            extraCss: genericCss + '.x-tractor-featured{margin:0 0 1.5em 0;text-align:center}.x-tractor-featured img{max-width:100%;height:auto;border-radius:4px}.x-tractor-title{margin:0 0 0.3em 0;line-height:1.2}.x-tractor-byline{opacity:0.6;font-size:0.9em;margin-bottom:1.5em;padding-bottom:1em;border-bottom:1px solid rgba(128,128,128,0.3)}'
          };
        }
      } catch (e) {
        console.warn('Readability a échoué, fallback heuristique:', e.message);
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

    if (!articleEl) throw new Error('Contenu principal non trouvé sur cette page');

    const clone = articleEl.cloneNode(true);
    ['nav','header','footer','.sidebar','.ad','.advertisement','.social-share','.comments','.comment-section','[role="navigation"]','[role="banner"]','[role="contentinfo"]','script','style','iframe[src*="ad"]','.newsletter-signup','.related-posts','.recommended'].forEach(sel => {
      clone.querySelectorAll(sel).forEach(el => el.remove());
    });

    return {
      html: clone.outerHTML,
      styles: '',
      title: title,
      siteName: siteName,
      extraCss: genericCss
    };
  }

  // === Extraction des styles CSS ===
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

  try {
    const source = detectSource();
    updateStatus(`Extraction (${source === 'x' ? 'X' : source === 'medium' ? 'Medium' : 'Web'})...`);

    // Pour les pages génériques, charger Readability d'abord
    if (source === 'generic') {
      updateStatus('Chargement de Readability...');
      try {
        await loadReadability();
      } catch (e) {
        console.warn('Readability non disponible, fallback heuristique:', e.message);
      }
    }

    let data;
    if (source === 'x') {
      data = extractX();
    } else if (source === 'medium') {
      data = extractMedium();
    } else {
      data = extractGeneric();
    }

    // Convertir les images en base64
    updateStatus('Conversion des images...');
    const container = document.createElement('div');
    container.innerHTML = data.html;

    const images = container.querySelectorAll('img');
    let processed = 0;
    for (const img of images) {
      try {
        const response = await fetch(img.src);
        const blob = await response.blob();
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        img.src = base64;
        processed++;
        updateStatus(`Conversion des images... ${processed}/${images.length}`);
      } catch (e) {
        console.warn('Image non convertie:', img.src);
      }
    }

    // Convertir les background-image
    const elementsWithBg = container.querySelectorAll('*');
    for (const el of elementsWithBg) {
      const bg = el.style.backgroundImage;
      if (bg && bg.startsWith('url(')) {
        const urlMatch = bg.match(/url\(["']?([^"')]+)["']?\)/);
        if (urlMatch && urlMatch[1].startsWith('http')) {
          try {
            const response = await fetch(urlMatch[1]);
            const blob = await response.blob();
            const base64 = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
            el.style.backgroundImage = `url("${base64}")`;
          } catch (e) {}
        }
      }
    }

    updateStatus('Génération du HTML...');

    const bodyStyle = getComputedStyle(document.body);
    const bgColor = bodyStyle.backgroundColor || (source === 'x' ? '#000' : '#fff');
    const textColor = bodyStyle.color || (source === 'x' ? '#fff' : '#000');
    const fontFamily = bodyStyle.fontFamily;

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.title} - ${data.siteName}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 20px;
      background-color: ${bgColor};
      color: ${textColor};
      font-family: ${fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'};
      line-height: 1.6;
    }
    .article-container {
      max-width: 100%;
      margin: 0 auto;
      padding: 20px 40px;
    }
    img { max-width: 100%; height: auto; }
    ${data.styles}
    ${data.extraCss}
  </style>
</head>
<body>
  <div class="article-container">
    ${container.innerHTML}
  </div>
</body>
</html>`;

    // Télécharger le fichier
    const slug = data.siteName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const fileName = `${slug}-article-${Date.now()}.html`;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (isIOS) {
      // Sur iOS, navigator.share() exige un geste utilisateur frais.
      // Après le traitement async des images, le geste initial a expiré.
      // On affiche un bouton pour que l'utilisateur tape dessus.
      statusDiv.textContent = '';
      statusDiv.style.cssText = 'position:fixed;top:20px;right:20px;background:#1d9bf0;color:white;padding:8px 12px;border-radius:12px;z-index:999999;font-family:system-ui;box-shadow:0 4px 12px rgba(0,0,0,0.3);display:flex;align-items:center;gap:8px;';
      const btn = document.createElement('button');
      btn.textContent = '📥 Enregistrer';
      btn.style.cssText = 'background:white;color:#1d9bf0;border:none;padding:10px 20px;border-radius:20px;font-size:15px;font-weight:bold;cursor:pointer;font-family:system-ui;';
      const closeBtn = document.createElement('button');
      closeBtn.textContent = '✕';
      closeBtn.style.cssText = 'background:none;border:none;color:white;font-size:18px;cursor:pointer;padding:4px 8px;';
      closeBtn.onclick = () => statusDiv.remove();
      btn.onclick = async () => {
        try {
          const file = new File([html], fileName, { type: 'text/html' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: data.title });
          } else {
            const b = new Blob([html], { type: 'text/html' });
            window.open(URL.createObjectURL(b), '_blank');
          }
        } catch (e) {
          if (e.name === 'AbortError') return;
          const b = new Blob([html], { type: 'text/html' });
          window.open(URL.createObjectURL(b), '_blank');
        }
        statusDiv.remove();
      };
      statusDiv.appendChild(btn);
      statusDiv.appendChild(closeBtn);
    } else {
      updateStatus('Téléchargement...');
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      updateStatus('✓ Terminé !');
      await sleep(2000);
      statusDiv.remove();
    }

  } catch (error) {
    updateStatus('❌ Erreur: ' + error.message);
    await sleep(4000);
    statusDiv.remove();
  }
})();
