document.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('status');
  const progressEl = document.getElementById('progress');
  const progressBar = document.getElementById('progress-bar');
  const extractBtn = document.getElementById('extract-btn');
  const sourceInfo = document.getElementById('source-info');
  const sourceBadge = document.getElementById('source-badge');

  function setStatus(message, type = 'normal') {
    statusEl.textContent = message;
    statusEl.className = 'status' + (type !== 'normal' ? ' ' + type : '');
  }

  function setProgress(percent) {
    if (percent > 0) {
      progressEl.classList.add('active');
      progressBar.style.width = percent + '%';
    } else {
      progressEl.classList.remove('active');
      progressBar.style.width = '0%';
    }
  }

  function showSource(source) {
    const labels = { x: 'X (Twitter)', medium: 'Medium', generic: 'Web' };
    sourceBadge.textContent = labels[source] || source;
    sourceBadge.className = 'source-badge' + (source !== 'x' ? ' ' + source : '');
    sourceInfo.style.display = 'flex';
  }

  // Détection de la source au chargement du popup
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (tab && tab.url) {
      try {
        const host = new URL(tab.url).hostname.toLowerCase();
        if (host === 'x.com' || host === 'twitter.com' || host.endsWith('.x.com') || host.endsWith('.twitter.com')) {
          showSource('x');
        } else if (host === 'medium.com' || host.endsWith('.medium.com')) {
          showSource('medium');
        } else {
          showSource('generic');
        }
      } catch (e) {}
    }
  });

  extractBtn.addEventListener('click', async () => {
    extractBtn.disabled = true;
    setStatus('Vérification de la page...');
    setProgress(10);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      setStatus('Injection de Readability...');
      setProgress(20);

      // Injecter Readability.js d'abord (pour l'extraction générique)
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['readability.js'],
      });

      setStatus('Extraction en cours...');
      setProgress(30);

      // Exécuter l'extraction
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractArticleInPage,
      });

      if (!results || !results[0] || !results[0].result) {
        throw new Error('Échec de l\'extraction');
      }

      const { html, error, source } = results[0].result;

      if (error) {
        throw new Error(error);
      }

      if (source) showSource(source);

      setStatus('Préparation du téléchargement...');
      setProgress(90);

      // Créer le blob et déclencher le téléchargement
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);

      const slug = (results[0].result.siteName || 'article').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      await chrome.downloads.download({
        url: url,
        filename: `${slug}-article-${Date.now()}.html`,
        saveAs: true
      });

      setStatus('✓ Article extrait !', 'success');
      setProgress(100);

      setTimeout(() => {
        setProgress(0);
      }, 2000);

    } catch (error) {
      setStatus('❌ ' + error.message, 'error');
      setProgress(0);
    } finally {
      extractBtn.disabled = false;
    }
  });
});

// Cette fonction s'exécute dans le contexte de la page
function extractArticleInPage() {
  try {
    // Détection de la source
    const host = window.location.hostname.toLowerCase();
    let source = 'generic';
    if (host === 'x.com' || host === 'twitter.com' || host.endsWith('.x.com') || host.endsWith('.twitter.com')) source = 'x';
    else if (host === 'medium.com' || host.endsWith('.medium.com')) source = 'medium';
    else {
      const gen = document.querySelector('meta[name="generator"]');
      if (gen && gen.content && gen.content.toLowerCase().includes('medium')) source = 'medium';
    }

    let articleHtml, styles = '', title, siteName, extraCss = '';

    // Extraction spécifique à la source
    if (source === 'x') {
      const article = document.querySelector('article');
      if (!article) return { error: 'Article X non trouvé sur cette page' };
      const container = article.closest('[data-testid="tweet"]') || article;
      const clone = container.cloneNode(true);
      ['[data-testid="reply"]','[data-testid="retweet"]','[data-testid="like"]','[data-testid="bookmark"]','[data-testid="share"]','[role="group"]'].forEach(sel => {
        clone.querySelectorAll(sel).forEach(el => el.remove());
      });
      // Extraire les styles CSS
      for (const sheet of document.styleSheets) {
        try { for (const rule of sheet.cssRules || []) { styles += rule.cssText + '\n'; } } catch (e) {}
      }
      articleHtml = clone.outerHTML;
      const titleEl = document.querySelector('meta[property="og:title"]');
      title = titleEl ? titleEl.content : document.title;
      siteName = 'X';
      extraCss = '[style*="max-width: 600px"],[style*="max-width:600px"],[style*="max-width: 598px"],[style*="max-width:598px"]{max-width:100%!important}article,article>div{max-width:100%!important;width:100%!important}';
    } else if (source === 'medium') {
      const selectors = ['article', '[data-testid="storyContent"]', '.meteredContent', '.postArticle-content'];
      let articleEl = null;
      for (const sel of selectors) { articleEl = document.querySelector(sel); if (articleEl) break; }
      if (!articleEl) return { error: 'Article Medium non trouvé' };
      const clone = articleEl.cloneNode(true);
      ['nav','[data-testid="headerSocialActions"]','[data-testid="postSidebarActions"]','[data-testid="post-end-cta"]','[data-testid="belowPostTagsPrompt"]','[data-testid="recommendedPosts"]','[data-testid="responses"]','[data-testid="metered-paywall"]'].forEach(sel => {
        clone.querySelectorAll(sel).forEach(el => el.remove());
      });
      articleHtml = clone.outerHTML;
      const titleEl = document.querySelector('meta[property="og:title"]');
      title = titleEl ? titleEl.content : document.title;
      siteName = 'Medium';
      extraCss = 'figure{margin:2em 0}figure img{display:block;margin:0 auto}figcaption{text-align:center;font-size:0.875em;opacity:0.7;margin-top:0.5em}pre{background:rgba(128,128,128,0.1);padding:1em;border-radius:4px;overflow-x:auto}blockquote{border-left:3px solid currentColor;margin-left:0;padding-left:1.5em;opacity:0.85}';
    } else {
      // Générique : essayer Readability, sinon heuristique
      let readabilityWorked = false;
      if (typeof Readability !== 'undefined') {
        try {
          const docClone = document.cloneNode(true);
          const reader = new Readability(docClone);
          const article = reader.parse();
          if (article && article.content) {
            articleHtml = article.content;
            title = article.title || document.title;
            readabilityWorked = true;
          }
        } catch (e) {}
      }

      if (!readabilityWorked) {
        const candidates = [
          document.querySelector('article'),
          document.querySelector('[role="article"]'),
          document.querySelector('main article'),
          document.querySelector('main'),
          document.querySelector('.post-content'),
          document.querySelector('.entry-content'),
          document.querySelector('.article-content'),
          document.querySelector('.article-body'),
        ];
        let articleEl = candidates.find(el => el !== null);
        if (!articleEl) {
          const blocks = document.querySelectorAll('div, section');
          let maxLen = 0;
          for (const block of blocks) {
            const text = block.textContent || '';
            if (text.length > maxLen && block.querySelectorAll('p').length >= 2) {
              maxLen = text.length; articleEl = block;
            }
          }
        }
        if (!articleEl) return { error: 'Contenu principal non trouvé sur cette page' };
        const clone = articleEl.cloneNode(true);
        ['nav','header','footer','.sidebar','.ad','.advertisement','.social-share','.comments','script','style','.newsletter-signup','.related-posts'].forEach(sel => {
          clone.querySelectorAll(sel).forEach(el => el.remove());
        });
        articleHtml = clone.outerHTML;
        const titleEl = document.querySelector('meta[property="og:title"]');
        title = titleEl ? titleEl.content : document.title;
      }

      const siteNameEl = document.querySelector('meta[property="og:site_name"]');
      siteName = siteNameEl ? siteNameEl.content : window.location.hostname;
      extraCss = 'figure{margin:2em 0}figure img{display:block;margin:0 auto}figcaption{text-align:center;font-size:0.875em;opacity:0.7}pre{background:rgba(128,128,128,0.1);padding:1em;border-radius:4px;overflow-x:auto}blockquote{border-left:3px solid currentColor;margin-left:0;padding-left:1.5em;opacity:0.85}a{color:#1d9bf0}';
    }

    // Convertir les images via canvas (synchrone, pas de fetch async)
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = articleHtml;
    const images = tempDiv.querySelectorAll('img');
    images.forEach(img => {
      try {
        if (img.complete && img.naturalWidth > 0) {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          try {
            const dataUrl = canvas.toDataURL('image/png');
            img.src = dataUrl;
          } catch (e) {}
        }
      } catch (e) {}
    });

    const bodyStyle = getComputedStyle(document.body);
    const bgColor = bodyStyle.backgroundColor || (source === 'x' ? '#000' : '#fff');
    const textColor = bodyStyle.color || (source === 'x' ? '#fff' : '#000');
    const fontFamily = bodyStyle.fontFamily;

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - ${siteName}</title>
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
    ${styles}
    ${extraCss}
  </style>
</head>
<body>
  <div class="article-container">
    ${tempDiv.innerHTML}
  </div>
</body>
</html>`;

    return { html, source, siteName };

  } catch (error) {
    return { error: error.message };
  }
}
