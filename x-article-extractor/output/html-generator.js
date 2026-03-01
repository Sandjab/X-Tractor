/**
 * Génère un fichier HTML autonome à partir des données extraites.
 */

/**
 * @param {object} articleData
 * @param {string} articleData.html - HTML de l'article
 * @param {string} articleData.styles - CSS extrait de la page (peut être vide)
 * @param {string} articleData.title - Titre de l'article
 * @param {string} articleData.byline - Auteur
 * @param {string} articleData.siteName - Nom du site source
 * @param {object} articleData.bodyStyles - Styles du body
 * @param {string} extraCss - CSS additionnel spécifique à la source
 * @returns {string} HTML complet autonome
 */
export function generateHtml(articleData, extraCss = '') {
  const { html, styles, title, byline, siteName, bodyStyles, featuredImage } = articleData;
  const fontFamily = bodyStyles.fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

  // Image à la une
  const featuredHtml = featuredImage
    ? `<figure class="x-tractor-featured"><img src="${escapeHtml(featuredImage)}" alt=""></figure>`
    : '';

  // Titre h1 : seulement si le content ne commence pas déjà par un <h1>
  const titleHtml = title && !html.trimStart().match(/^<h1[\s>]/i)
    ? `<h1 class="x-tractor-title">${escapeHtml(title)}</h1>`
    : '';

  // Byline + source
  const metaHtml = byline
    ? `<div class="article-meta">
        <span class="article-source">${escapeHtml(siteName)}</span>
        <span class="article-author">${escapeHtml(byline)}</span>
      </div>`
    : '';

  const headerHtml = featuredHtml + titleHtml + metaHtml;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - ${escapeHtml(siteName)}</title>
  <style>
    /* Reset and base styles */
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 20px;
      background-color: ${bodyStyles.backgroundColor};
      color: ${bodyStyles.color};
      font-family: ${fontFamily};
      line-height: 1.6;
    }

    /* Container full width */
    .article-container {
      max-width: 100%;
      margin: 0 auto;
      padding: 20px 40px;
    }

    /* Featured image */
    .x-tractor-featured {
      margin: 0 0 1.5em 0;
      text-align: center;
    }
    .x-tractor-featured img {
      max-width: 100%;
      height: auto;
      border-radius: 4px;
    }

    /* Article title */
    .x-tractor-title {
      margin: 0 0 0.3em 0;
      line-height: 1.2;
    }

    /* Article metadata */
    .article-meta {
      margin-bottom: 1.5em;
      padding-bottom: 1em;
      border-bottom: 1px solid rgba(128,128,128,0.3);
      font-size: 0.9em;
      opacity: 0.7;
    }
    .article-source {
      font-weight: bold;
      margin-right: 1em;
    }

    /* Responsive images */
    img {
      max-width: 100%;
      height: auto;
    }

    /* Original page styles */
    ${styles}

    /* Source-specific overrides */
    ${extraCss}
  </style>
</head>
<body>
  <div class="article-container">
    ${headerHtml}
    ${html}
  </div>
</body>
</html>`;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
