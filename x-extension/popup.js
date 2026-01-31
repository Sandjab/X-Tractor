document.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('status');
  const progressEl = document.getElementById('progress');
  const progressBar = document.getElementById('progress-bar');
  const extractBtn = document.getElementById('extract-btn');

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

  extractBtn.addEventListener('click', async () => {
    extractBtn.disabled = true;
    setStatus('Vérification de la page...');
    setProgress(10);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab.url.includes('x.com') && !tab.url.includes('twitter.com')) {
        throw new Error('Cette extension fonctionne uniquement sur x.com');
      }

      setStatus('Extraction en cours...');
      setProgress(30);

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractArticle,
      });

      if (!results || !results[0] || !results[0].result) {
        throw new Error('Échec de l\'extraction');
      }

      const { html, error } = results[0].result;
      
      if (error) {
        throw new Error(error);
      }

      setStatus('Préparation du téléchargement...');
      setProgress(90);

      // Créer le blob et déclencher le téléchargement
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      
      await chrome.downloads.download({
        url: url,
        filename: `x-article-${Date.now()}.html`,
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

// Cette fonction s'exécute dans le contexte de la page X
function extractArticle() {
  try {
    const article = document.querySelector('article');
    if (!article) {
      return { error: 'Article non trouvé sur cette page' };
    }

    const articleContainer = article.closest('[data-testid="tweet"]') || article;
    const clone = articleContainer.cloneNode(true);

    // Supprimer les boutons d'action
    const selectorsToRemove = [
      '[data-testid="reply"]',
      '[data-testid="retweet"]',
      '[data-testid="like"]',
      '[data-testid="bookmark"]',
      '[data-testid="share"]',
      '[role="group"]'
    ];
    selectorsToRemove.forEach(sel => {
      clone.querySelectorAll(sel).forEach(el => el.remove());
    });

    // Extraire les styles
    let styles = '';
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules || []) {
          styles += rule.cssText + '\n';
        }
      } catch (e) {}
    }

    const bodyStyle = getComputedStyle(document.body);
    const bgColor = bodyStyle.backgroundColor || '#000';
    const textColor = bodyStyle.color || '#fff';
    const fontFamily = bodyStyle.fontFamily;

    // Convertir les images en base64 de manière synchrone via canvas
    const images = clone.querySelectorAll('img');
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
          } catch (e) {
            // CORS - on garde l'URL originale
          }
        }
      } catch (e) {}
    });

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>X Article - ${new Date().toLocaleDateString()}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 20px;
      background-color: ${bgColor};
      color: ${textColor};
      font-family: ${fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'};
      line-height: 1.5;
    }
    /* Container full width */
    .article-container {
      max-width: 100%;
      margin: 0 auto;
      padding: 20px 40px;
    }
    /* Responsive images */
    img { max-width: 100%; height: auto; }
    /* Original X styles */
    ${styles}
    /* Override X's narrow width constraints */
    [style*="max-width: 600px"], [style*="max-width:600px"],
    [style*="max-width: 598px"], [style*="max-width:598px"] { max-width: 100% !important; }
    /* Force all content to expand */
    article, article > div { max-width: 100% !important; width: 100% !important; }
  </style>
</head>
<body>
  <div class="article-container">
    ${clone.outerHTML}
  </div>
</body>
</html>`;

    return { html };

  } catch (error) {
    return { error: error.message };
  }
}
