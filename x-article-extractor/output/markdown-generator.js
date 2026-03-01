/**
 * Génère un fichier Markdown à partir des données extraites.
 * Utilise Turndown pour la conversion HTML → Markdown.
 * Les images sont référencées en base64 inline.
 */

import TurndownService from 'turndown';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '_',
});

// Règle pour les figures
turndown.addRule('figure', {
  filter: 'figure',
  replacement(content, node) {
    const img = node.querySelector('img');
    const caption = node.querySelector('figcaption');
    if (!img) return content;
    const alt = caption ? caption.textContent.trim() : (img.alt || '');
    const src = img.getAttribute('src') || '';
    return `\n\n![${alt}](${src})\n${caption ? `_${caption.textContent.trim()}_` : ''}\n\n`;
  },
});

/**
 * @param {object} articleData
 * @param {string} articleData.html - HTML de l'article
 * @param {string} articleData.title - Titre de l'article
 * @param {string} articleData.byline - Auteur
 * @param {string} articleData.siteName - Nom du site source
 * @returns {string} Contenu Markdown
 */
export function generateMarkdown(articleData) {
  const { html, title, byline, siteName, featuredImage } = articleData;

  const lines = [];

  // Front matter
  lines.push(`# ${title || 'Article'}`);
  lines.push('');
  if (featuredImage) {
    lines.push(`![](${featuredImage})`);
    lines.push('');
  }
  if (byline || siteName) {
    const parts = [];
    if (byline) parts.push(`**Auteur** : ${byline}`);
    if (siteName) parts.push(`**Source** : ${siteName}`);
    lines.push(parts.join(' | '));
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  // Conversion HTML → Markdown
  const markdown = turndown.turndown(html);
  lines.push(markdown);

  return lines.join('\n');
}
