/**
 * Extracteur spécialisé pour X (Twitter).
 * Exécution via page.evaluate() dans Playwright.
 */

/**
 * Attend que le contenu de l'article X soit chargé.
 */
export async function waitForContent(page) {
  await page.waitForSelector('article', { timeout: 30000 });

  await page.waitForFunction(() => {
    const spinners = document.querySelectorAll('[role="progressbar"]');
    return spinners.length === 0;
  }, { timeout: 15000 }).catch(() => {});

  await page.waitForTimeout(2000);

  await page.waitForFunction(() => {
    const images = document.querySelectorAll('article img');
    return Array.from(images).every(img => img.complete);
  }, { timeout: 15000 }).catch(() => {});
}

/**
 * Extrait l'article X depuis la page.
 * @returns {{ html: string, styles: string, title: string, byline: string, siteName: string, bodyStyles: object }}
 */
export async function extract(page) {
  return await page.evaluate(() => {
    const article = document.querySelector('article');
    if (!article) {
      throw new Error('Article X non trouvé sur cette page');
    }

    const articleContainer = article.closest('[data-testid="tweet"]') || article;
    const clone = articleContainer.cloneNode(true);

    // Supprimer les boutons d'action
    [
      '[data-testid="reply"]',
      '[data-testid="retweet"]',
      '[data-testid="like"]',
      '[data-testid="bookmark"]',
      '[data-testid="share"]',
      '[role="group"]',
    ].forEach(sel => {
      clone.querySelectorAll(sel).forEach(el => el.remove());
    });

    // Extraire les styles
    const styles = Array.from(document.styleSheets)
      .map(sheet => {
        try {
          return Array.from(sheet.cssRules || []).map(rule => rule.cssText).join('\n');
        } catch { return ''; }
      })
      .join('\n');

    const computedStyles = getComputedStyle(articleContainer);

    // Titre : premier texte significatif ou meta
    const titleEl = document.querySelector('meta[property="og:title"]');
    const title = titleEl ? titleEl.content : document.title;

    // Auteur
    const authorEl = article.querySelector('[data-testid="User-Name"]');
    const byline = authorEl ? authorEl.textContent : '';

    return {
      html: clone.outerHTML,
      styles,
      title,
      byline,
      siteName: 'X',
      bodyStyles: {
        backgroundColor: computedStyles.backgroundColor || '#000',
        color: computedStyles.color || '#fff',
        fontFamily: computedStyles.fontFamily,
      },
    };
  });
}

/**
 * Styles CSS supplémentaires spécifiques à X.
 */
export function extraCss() {
  return `
    /* Override X's narrow width constraints */
    [style*="max-width: 600px"],
    [style*="max-width:600px"],
    [style*="max-width: 598px"],
    [style*="max-width:598px"] {
      max-width: 100% !important;
    }
    article, article > div {
      max-width: 100% !important;
      width: 100% !important;
    }
  `;
}
