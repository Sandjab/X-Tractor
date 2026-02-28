/**
 * Détection automatique du type de source à partir de l'URL et/ou du DOM.
 */

/**
 * Détecte le type de source à partir de l'URL.
 * @param {string} url
 * @returns {'x' | 'medium' | 'generic'}
 */
export function detectSource(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();

    // X / Twitter
    if (host === 'x.com' || host === 'twitter.com' || host.endsWith('.x.com') || host.endsWith('.twitter.com')) {
      return 'x';
    }

    // Medium (domaine principal + sous-domaines connus)
    if (host === 'medium.com' || host.endsWith('.medium.com')) {
      return 'medium';
    }

    return 'generic';
  } catch {
    return 'generic';
  }
}

/**
 * Détection côté DOM (pour le bookmarklet / extension).
 * Exécutée dans le contexte de la page.
 * @returns {'x' | 'medium' | 'generic'}
 */
export function detectSourceFromDOM() {
  const host = window.location.hostname.toLowerCase();

  if (host === 'x.com' || host === 'twitter.com' || host.endsWith('.x.com') || host.endsWith('.twitter.com')) {
    return 'x';
  }

  if (host === 'medium.com' || host.endsWith('.medium.com')) {
    return 'medium';
  }

  // Détection Medium sur domaine custom via meta tags
  const generator = document.querySelector('meta[name="generator"]');
  if (generator && generator.content && generator.content.toLowerCase().includes('medium')) {
    return 'medium';
  }
  const mediumMeta = document.querySelector('meta[property="al:android:package"][content="com.medium.reader"]');
  if (mediumMeta) {
    return 'medium';
  }

  return 'generic';
}

/**
 * Retourne un label lisible pour le type de source.
 */
export function sourceLabel(source) {
  const labels = { x: 'X (Twitter)', medium: 'Medium', generic: 'Web' };
  return labels[source] || source;
}
