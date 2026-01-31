# X Article Extractor

Extrait les articles X (Twitter) vers des fichiers HTML autonomes, avec images embarquées en base64.

## Installation

```bash
npm install
npx playwright install chromium
```

## Modes d'utilisation

### 1. CLI interactif (recommandé pour démarrer)

```bash
# Première utilisation : se connecter à X
node index.js --login

# Extraire un article (ouvre un navigateur)
node index.js https://x.com/user/status/123456789
```

### 2. CLI headless (automatisation)

```bash
# Nécessite une session valide (--login d'abord)
node index.js https://x.com/user/status/123456789 --headless
```

### 3. Serveur MCP (pour Claude Code / LLMs)

```bash
# Démarrer le serveur MCP
node mcp-server.js
```

## Configuration MCP pour Claude Code

```bash
claude mcp add x-article-extractor node /chemin/vers/x-article-extractor/mcp-server.js
```

Optionnel - avec répertoire de sortie personnalisé :
```bash
claude mcp add x-article-extractor -e X_TRACTOR_OUTPUT_DIR=/chemin/sortie -- node /chemin/vers/mcp-server.js
```

### Outils MCP disponibles

| Outil | Description |
|-------|-------------|
| `check_x_session` | Vérifie si une session X valide existe |
| `extract_x_article` | Extrait un article vers HTML (nécessite session valide) |

### Workflow MCP

1. **Setup initial** (une seule fois, dans votre terminal) :
   ```bash
   cd /chemin/vers/x-article-extractor
   node index.js --login
   ```
   → Se connecter dans le navigateur qui s'ouvre
   → Les cookies sont sauvegardés dans `~/.x-tractor-cookies.json`

2. **Utilisation via Claude Code** :
   - Claude peut appeler `check_x_session` pour vérifier l'état
   - Claude peut appeler `extract_x_article` avec une URL

## Options CLI

| Option | Description |
|--------|-------------|
| `--login` | Ouvre un navigateur pour se connecter à X et sauvegarder la session |
| `--headless` | Mode sans interface graphique (nécessite session valide) |

## Variables d'environnement

| Variable | Description | Défaut |
|----------|-------------|--------|
| `X_TRACTOR_OUTPUT_DIR` | Répertoire de sortie pour les fichiers HTML | Répertoire courant |

## Fichiers générés

- `~/.x-tractor-cookies.json` : Cookies de session X
- `x-article-TIMESTAMP.html` : Article extrait

## Notes

- Le rendu reproduit le style de X en pleine largeur
- Toutes les images sont embarquées en base64 (fichier autonome)
- Pas de support 2FA
- La session expire après quelques semaines, relancer `--login` si nécessaire
