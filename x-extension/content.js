// Content script pour l'extraction d'articles X
// Ce script est injecté dans la page et peut accéder au DOM

async function extractXArticle() {
  const article = document.querySelector('article');
  if (!article) {
    throw new Error('Article non trouvé');
  }

  const articleContainer = article.closest('[data-testid="tweet"]') || article;
  const clone = articleContainer.cloneNode(true);

  // Supprimer les éléments non désirés
  const selectorsToRemove = [
    '[data-testid="reply"]',
    '[data-testid="retweet"]',
    '[data-testid="like"]',
    '[data-testid="bookmark"]',
    '[data-testid="share"]',
    '[role="group"]',
    '[data-testid="caret"]'
  ];
  
  selectorsToRemove.forEach(sel => {
    clone.querySelectorAll(sel).forEach(el => el.remove());
  });

  // Collecter les styles
  let styles = '';
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules || []) {
        styles += rule.cssText + '\n';
      }
    } catch (e) {
      // Ignorer les feuilles de style cross-origin
    }
  }

  // Récupérer les styles du body
  const bodyStyle = getComputedStyle(document.body);
  const bgColor = bodyStyle.backgroundColor || '#000';
  const textColor = bodyStyle.color || '#fff';
  const fontFamily = bodyStyle.fontFamily;

  // Convertir les images en base64
  const images = clone.querySelectorAll('img');
  for (const img of images) {
    try {
      const response = await fetch(img.src, { mode: 'cors' });
      const blob = await response.blob();
      const base64 = await blobToBase64(blob);
      img.src = base64;
    } catch (e) {
      // Si fetch échoue, essayer avec canvas
      try {
        const base64 = await imageToBase64ViaCanvas(img);
        if (base64) img.src = base64;
      } catch (e2) {
        console.warn('Image non convertible:', img.src);
      }
    }
  }

  // Convertir les background-images
  const allElements = clone.querySelectorAll('*');
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
    articleHtml: clone.outerHTML,
    styles,
    bgColor,
    textColor,
    fontFamily
  };
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

// Export pour utilisation par l'extension
window.extractXArticle = extractXArticle;
