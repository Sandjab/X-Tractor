# X-Tractor

Extraction des articles du réseau social X (ex Twitter) en fichiers HTML autonomes, consultables hors-ligne, avec images embarquées en base64.

## Pourquoi ce projet ?

Depuis mars 2024, X (ex-Twitter) propose une fonctionnalité "Articles" permettant aux abonnés Premium de publier du contenu long (jusqu'à 100 000 caractères) avec formatage riche et médias intégrés.

**Le problème** : X exige désormais une connexion pour accéder à la quasi-totalité de son contenu. Les personnes sans compte se heurtent à un "login wall" et ne peuvent pas lire les Articles qu'on leur partage.

**La solution** : X-Tractor extrait un Article X vers un fichier HTML autonome, consultable par n'importe qui, n'importe où, sans compte X requis.

## Fonctionnalités

- Extraction complète d'un article X vers un fichier HTML unique
- Images converties en base64 (fichier totalement autonome, partageable sans assets)
- Rendu fidèle au style de X en pleine largeur
- Support du mode sombre et clair (thème capturé au moment de l'extraction)
- Suppression automatique des boutons d'interaction (like, retweet, reply, etc.)
- **Serveur MCP** pour intégration avec Claude Code et autres LLMs

## Les 3 outils

Le projet propose trois approches pour extraire les articles, chacune avec ses avantages :

| Outil | Auth | Images CORS | Automatisable | MCP | Poids |
|-------|------|-------------|---------------|-----|-------|
| **CLI Playwright** | Session cookies | Aucun problème | Oui | Oui | ~300 Mo |
| **Bookmarklet** | Session navigateur | Parfois bloquées | Non | Non | ~4 Ko |
| **Extension Chrome** | Session navigateur | Parfois bloquées | Non | Non | ~10 Ko |

### Quand utiliser quoi ?

- **CLI Playwright + MCP** : Automatisation via Claude Code, extraction en masse
- **CLI Playwright** : Extraction en ligne de commande
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
2. Glisser le bouton bleu "Extraire Article X" vers votre barre de favoris
3. C'est prêt !

### Extension Chrome

1. Ouvrir `chrome://extensions/`
2. Activer le "Mode développeur" (en haut à droite)
3. Cliquer sur "Charger l'extension non empaquetée"
4. Sélectionner le dossier `x-extension`

## Utilisation

### CLI

```bash
# Première utilisation : se connecter à X
node x-article-extractor/index.js --login

# Extraire un article (mode interactif)
node x-article-extractor/index.js https://x.com/utilisateur/status/1234567890

# Extraire un article (mode headless/automatique)
node x-article-extractor/index.js https://x.com/utilisateur/status/1234567890 --headless
```

Le fichier `x-article-TIMESTAMP.html` sera généré dans le répertoire courant.

### Serveur MCP (Claude Code)

1. **Setup initial** (une seule fois) :
   ```bash
   cd x-article-extractor
   node index.js --login
   ```

2. **Configurer Claude Code** :
   ```bash
   claude mcp add x-article-extractor node /chemin/vers/x-article-extractor/mcp-server.js
   ```

3. **Utiliser via Claude** :
   - "Vérifie ma session X" → appelle `check_x_session`
   - "Extrait cet article X: https://x.com/..." → appelle `extract_x_article`

### Bookmarklet

1. Se rendre sur un article X (être connecté)
2. Cliquer sur le favori "Extraire Article X"
3. Attendre la conversion des images
4. Le fichier HTML se télécharge automatiquement

### Extension Chrome

1. Se rendre sur un article X (être connecté)
2. Cliquer sur l'icône de l'extension
3. Cliquer sur "Extraire l'article"
4. Choisir où sauvegarder le fichier

## Structure du projet

```
X-Tractor/
├── x-article-extractor/     # CLI Node.js + Playwright + MCP
│   ├── index.js             # Script CLI principal
│   ├── mcp-server.js        # Serveur MCP pour Claude Code
│   └── package.json
├── x-bookmarklet/           # Bookmarklet JavaScript
│   ├── bookmarklet.js       # Code source
│   ├── bookmarklet.min.js   # Version minifiée
│   └── install.html         # Page d'installation
└── x-extension/             # Extension Chrome (Manifest V3)
    ├── manifest.json
    ├── popup.html/js        # Interface popup
    └── icons/               # Icônes 16/48/128px
```

## Limitations connues

- **Pas de support 2FA** : L'authentification à deux facteurs n'est pas gérée par le CLI
- **CORS sur les images** : Le bookmarklet et l'extension peuvent échouer à convertir certaines images en base64 (elles restent alors avec leur URL originale)
- **Pas de threads** : L'extraction de threads multi-tweets n'est pas supportée
- **SPA React** : Les sélecteurs DOM de X peuvent changer sans préavis
- **Session expirante** : Les cookies X expirent après quelques semaines, relancer `--login`

## Licence

MIT
