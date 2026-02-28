# CLAUDE.md - X-Tractor

## Objectif

Extraire le contenu principal d'un article web (X, Medium, ou toute page) en fichier HTML ou Markdown autonome, consultable hors-ligne, avec images embarquées en base64. Le rendu doit préserver le style d'origine avec une largeur de contenu en pleine largeur (100%) pour une meilleure lisibilité sur grand écran.

## Structure du projet

```
├── x-article-extractor/          # CLI Node.js + Playwright + MCP
│   ├── index.js                  # Point d'entrée CLI
│   ├── mcp-server.js             # Serveur MCP
│   ├── extractors/               # Modules d'extraction
│   │   ├── detector.js           # Détection du type de source (URL/DOM)
│   │   ├── x-extractor.js        # Extracteur X (Twitter)
│   │   ├── medium-extractor.js   # Extracteur Medium
│   │   └── generic-extractor.js  # Extracteur générique (Readability)
│   └── output/                   # Générateurs de sortie
│       ├── html-generator.js     # HTML standalone
│       └── markdown-generator.js # Markdown (Turndown)
├── x-bookmarklet/                # Bookmarklet (JS pur, multi-source)
│   └── readability.js            # Readability chargé dynamiquement via GitHub Pages
└── x-extension/                  # Extension Chrome (Manifest V3, multi-source)
```

Les trois outils font la même chose avec des trade-offs différents :

| Outil | Sources | Auth | Images CORS | Format | Poids |
|-------|---------|------|-------------|--------|-------|
| CLI Playwright | X, Medium, Web | Cookies (X) | Aucun problème | HTML, Markdown | ~300 Mo |
| Bookmarklet | X, Medium, Web | Session navigateur | Parfois bloquées | HTML | ~10 Ko (+84 Ko Readability lazy) |
| Extension | X, Medium, Web | Session navigateur | Parfois bloquées | HTML | ~80 Ko (avec Readability) |

## Architecture d'extraction

### Pipeline commun

1. **Détection** : URL pattern matching + meta tags DOM → `'x' | 'medium' | 'generic'`
2. **Extraction** : Module spécifique à la source → `{ html, styles, title, byline, siteName, bodyStyles }`
3. **Embedding images** : Fetch + base64 (CLI via Playwright page.evaluate, bookmarklet/extension via fetch/canvas)
4. **Génération sortie** : HTML template ou Markdown (Turndown)

### Extracteur X (`x-extractor.js`)
- Sélecteurs : `article` → `[data-testid="tweet"]`
- Nettoyage : reply, retweet, like, bookmark, share, role="group"
- Styles : extraction complète des styleSheets
- Spécificité : override largeur 600px → 100%

### Extracteur Medium (`medium-extractor.js`)
- Sélecteurs : `article`, `[data-testid="storyContent"]`, `.meteredContent`
- Nettoyage : actions sociales, CTA, recommendations, paywall banner, commentaires
- CLI : fallback Readability via JSDOM si sélecteurs échouent

### Extracteur générique (`generic-extractor.js`)
- CLI : Mozilla Readability (JSDOM + @mozilla/readability)
- Extension : Readability bundlé
- Bookmarklet : heuristique (sélecteurs courants + plus grand bloc de texte)
- Nettoyage : nav, header, footer, sidebar, ads, comments, scripts

## Contraintes techniques connues

### Sélecteurs X
X est une SPA React. Les sélecteurs peuvent changer sans préavis :
- `article` : conteneur principal (stable)
- `[data-testid="tweet"]` : wrapper du tweet (moyennement stable)
- `[data-testid="reply|retweet|like|bookmark|share"]` : boutons d'action à supprimer
- `[role="progressbar"]` : spinners de chargement

### Medium
- SPA React également, structure DOM qui évolue
- Meta tags stables pour la détection : `al:android:package`, `og:*`, `meta[name="generator"]`
- Articles sur domaines custom : détection via meta tags Medium

### CORS (bookmarklet & extension uniquement)
Les images sur `pbs.twimg.com` et certains CDN ont des headers CORS restrictifs :
1. `fetch()` avec `mode: 'cors'` → échoue souvent
2. Canvas `drawImage()` + `toDataURL()` → échoue si l'image n'a pas les bons headers

Le CLI Playwright n'a pas ce problème car il exécute le fetch dans le contexte du navigateur contrôlé.

### Authentification X
- Login classique : email/username → password (géré)
- Vérification supplémentaire : X demande parfois de confirmer le username/téléphone (partiellement géré)
- 2FA : **non supporté** actuellement

## Améliorations possibles

### Priorité haute
- [ ] Support des threads X (extraction multi-tweets)
- [ ] Gestion du 2FA (pause interactive ou TOTP)
- [ ] Export Markdown dans bookmarklet/extension (nécessite bundler Turndown)

### Priorité moyenne
- [ ] Support Substack (extracteur dédié)
- [ ] Proxy pour contourner CORS dans bookmarklet/extension
- [ ] Cache de session Playwright
- [ ] Extraction des vidéos (complexe : HLS streams)

### Priorité basse
- [ ] Mode batch CLI (liste d'URLs)
- [ ] Export PDF
- [ ] Dark/light mode toggle dans le HTML généré

## Décisions de design

### Pourquoi Playwright plutôt que Puppeteer ?
Auto-wait intelligent. X charge le contenu progressivement, Playwright gère mieux les états intermédiaires.

### Pourquoi base64 plutôt que fichiers séparés ?
Fichier unique = partage simplifié. Un seul .html à envoyer.

### Pourquoi 100% de largeur ?
X utilise 600px, trop étroit sur grand écran. La pleine largeur avec padding de 40px offre une meilleure lisibilité.

### Pourquoi Readability pour le générique ?
C'est la même technologie que le Reader View de Firefox. Très éprouvée, gère la majorité des sites. Licence Apache 2.0.

### Pourquoi Readability dynamique pour le bookmarklet ?
Readability fait ~84 Ko, trop lourd pour être inline dans un bookmarklet. Il est chargé dynamiquement depuis GitHub Pages uniquement pour les pages génériques, avec fallback heuristique si le chargement échoue. L'URL est injectée par `install.html` au moment de l'installation du bookmarklet.

## Commandes utiles

```bash
# CLI - toutes sources
cd x-article-extractor
npm install && npx playwright install chromium
node index.js --login                                        # Session X
node index.js https://x.com/user/status/123 --headless       # Article X
node index.js https://medium.com/@user/article               # Article Medium
node index.js https://example.com/blog/post                  # Page web
node index.js https://example.com/blog/post --markdown        # Export Markdown

# Extension : charger dans chrome://extensions/ en mode développeur

# Bookmarklet : ouvrir install.html et glisser le lien
```

## Points d'attention pour les modifications

1. **Ne pas supposer la structure DOM** : toujours avoir des fallbacks
2. **Garder les trois outils synchronisés** : même logique d'extraction, même format de sortie
3. **Tester en mode sombre ET clair** : X et Medium changent les couleurs dynamiquement
4. **Les styles extraits sont volumineux** : c'est normal, X injecte beaucoup de CSS
5. **Détection Medium sur domaines custom** : utiliser les meta tags, pas seulement l'hostname
6. **Readability modifie le DOM** : toujours cloner le document avant de le passer à Readability
