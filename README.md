# X-Tractor

Extraction d'articles depuis **X (Twitter)**, **Medium**, et **tout site web** en fichiers HTML ou Markdown autonomes, consultables hors-ligne, avec images embarquées en base64.

## Pourquoi ce projet ?

Le web regorge de contenu de qualité, mais l'accès est souvent entravé par des login walls (X), des paywalls partiels (Medium), ou des interfaces surchargées (publicités, menus, popups).

**X-Tractor** extrait le contenu principal d'un article — et uniquement le contenu — vers un fichier autonome, partageable et lisible par n'importe qui, n'importe où.

## Fonctionnalités

- **Multi-source** : X (Twitter), Medium, et tout site web
- **Extraction intelligente** : contenu principal uniquement, sans menus, publicités, footer
- Images converties en base64 (fichier totalement autonome)
- **Deux formats de sortie** : HTML standalone ou Markdown
- Rendu en pleine largeur pour une meilleure lisibilité
- Support du mode sombre et clair
- **Serveur MCP** pour intégration avec Claude Code et autres LLMs

## Les 3 outils

| Outil | Sources | Auth | Images CORS | Automatisable | MCP | Format |
|-------|---------|------|-------------|---------------|-----|--------|
| **CLI Playwright** | X, Medium, Web | Session cookies (X) | Aucun problème | Oui | Oui | HTML, Markdown |
| **Bookmarklet** | X, Medium, Web | Session navigateur | Parfois bloquées | Non | Non | HTML |
| **Extension Chrome** | X, Medium, Web | Session navigateur | Parfois bloquées | Non | Non | HTML |

### Quand utiliser quoi ?

- **CLI Playwright + MCP** : Automatisation via Claude Code, extraction en masse
- **CLI Playwright** : Extraction en ligne de commande, export Markdown
- **Bookmarklet** : Usage occasionnel, installation ultra-rapide (drag & drop)
- **Extension Chrome** : Usage régulier avec interface graphique

## Installation

### CLI Playwright

```bash
cd x-article-extractor
npm install
npx playwright install chromium
```

### Bookmarklet

1. Ouvrir `x-bookmarklet/install.html` dans votre navigateur
2. Glisser le bouton bleu vers votre barre de favoris
3. C'est prêt !

### Extension Chrome

1. Ouvrir `chrome://extensions/`
2. Activer le "Mode développeur" (en haut à droite)
3. Cliquer sur "Charger l'extension non empaquetée"
4. Sélectionner le dossier `x-extension`

## Utilisation

### CLI

```bash
# Première utilisation : se connecter à X (nécessaire uniquement pour les articles X)
node x-article-extractor/index.js --login

# Extraire un article X
node x-article-extractor/index.js https://x.com/utilisateur/status/1234567890

# Extraire un article Medium
node x-article-extractor/index.js https://medium.com/@auteur/mon-article

# Extraire n'importe quelle page web
node x-article-extractor/index.js https://example.com/blog/article

# Exporter en Markdown
node x-article-extractor/index.js https://example.com/article --markdown

# Mode headless (automatisation)
node x-article-extractor/index.js https://x.com/user/status/123 --headless
```

Le fichier sera généré dans le répertoire courant : `<source>-article-<timestamp>.html` (ou `.md`).

### Serveur MCP (Claude Code)

1. **Setup initial** (une seule fois, pour les articles X) :
   ```bash
   cd x-article-extractor
   node index.js --login
   ```

2. **Configurer Claude Code** :
   ```bash
   claude mcp add x-tractor node /chemin/vers/x-article-extractor/mcp-server.js
   ```

3. **Utiliser via Claude** :
   - "Vérifie ma session X" → `check_x_session`
   - "Extrait cet article: https://medium.com/..." → `extract_article`
   - "Extrait en markdown: https://example.com/blog" → `extract_article` avec `format: "markdown"`

### Bookmarklet

1. Se rendre sur n'importe quel article (X, Medium, blog, etc.)
2. Cliquer sur le favori "Extraire l'article"
3. Attendre la conversion des images
4. Le fichier HTML se télécharge automatiquement

### Extension Chrome

1. Se rendre sur n'importe quel article
2. Cliquer sur l'icône de l'extension
3. Cliquer sur "Extraire l'article"
4. Choisir où sauvegarder le fichier

## Sources supportées

### X (Twitter)
- Articles X (contenu long Premium)
- Tweets individuels
- Nécessite une session authentifiée (CLI: `--login`, bookmarklet/extension: être connecté)

### Medium
- Articles Medium (medium.com)
- Blogs hébergés sur domaines custom Medium (détection automatique via meta tags)
- Suppression automatique des éléments Medium (CTA, recommendations, paywall banner)

### Pages web génériques
- **CLI** : Utilise [Mozilla Readability](https://github.com/mozilla/readability) (la même technologie que le Reader View de Firefox)
- **Extension** : Readability bundlé + fallback heuristique
- **Bookmarklet** : Extraction heuristique (sélecteurs courants + plus grand bloc de texte)
- Suppression automatique : navigation, sidebars, publicités, commentaires, footer

## Structure du projet

```
X-Tractor/
├── x-article-extractor/         # CLI Node.js + Playwright + MCP
│   ├── index.js                 # Script CLI principal (multi-source)
│   ├── mcp-server.js            # Serveur MCP pour Claude Code
│   ├── extractors/              # Modules d'extraction par source
│   │   ├── detector.js          # Détection automatique du type de source
│   │   ├── x-extractor.js       # Extracteur X (Twitter)
│   │   ├── medium-extractor.js  # Extracteur Medium
│   │   └── generic-extractor.js # Extracteur générique (Readability)
│   ├── output/                  # Générateurs de sortie
│   │   ├── html-generator.js    # Génération HTML standalone
│   │   └── markdown-generator.js # Génération Markdown (Turndown)
│   └── package.json
├── x-bookmarklet/               # Bookmarklet JavaScript
│   ├── bookmarklet.js           # Code source (multi-source)
│   ├── bookmarklet.min.js       # Version minifiée
│   └── install.html             # Page d'installation
└── x-extension/                 # Extension Chrome (Manifest V3)
    ├── manifest.json
    ├── readability.js           # Mozilla Readability bundlé
    ├── content.js               # Script d'extraction (multi-source)
    ├── popup.html/js            # Interface popup
    └── icons/                   # Icônes 16/48/128px
```

## Limitations connues

- **Pas de support 2FA** pour X : L'authentification à deux facteurs n'est pas gérée par le CLI
- **CORS sur les images** : Le bookmarklet et l'extension peuvent échouer à convertir certaines images
- **Pas de threads X** : L'extraction de threads multi-tweets n'est pas supportée
- **Paywall Medium** : Les articles derrière le paywall nécessitent d'être connecté à Medium
- **SPA/JS-heavy sites** : Les pages qui chargent le contenu uniquement via JavaScript peuvent nécessiter le CLI (Playwright attend le rendu)
- **Markdown** : La sortie Markdown est disponible uniquement via le CLI

## Licence

MIT
