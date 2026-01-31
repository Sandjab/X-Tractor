# X-Tractor

Extraction des articles du réseau social X (ex Twitter) en fichiers HTML autonomes, consultables hors-ligne, avec images embarquées en base64.

## Fonctionnalités

- Extraction complète d'un article X vers un fichier HTML unique
- Images converties en base64 (fichier totalement autonome, partageable sans assets)
- Rendu fidèle au style de X avec largeur de contenu élargie (800px au lieu de 600px)
- Support du mode sombre et clair (thème capturé au moment de l'extraction)
- Suppression automatique des boutons d'interaction (like, retweet, reply, etc.)

## Les 3 outils

Le projet propose trois approches pour extraire les articles, chacune avec ses avantages :

| Outil | Auth | Images CORS | Automatisable | Poids |
|-------|------|-------------|---------------|-------|
| **CLI Playwright** | Variables d'environnement | Aucun problème | Oui | ~300 Mo |
| **Bookmarklet** | Session navigateur | Parfois bloquées | Non | ~4 Ko |
| **Extension Chrome** | Session navigateur | Parfois bloquées | Non | ~10 Ko |

### Quand utiliser quoi ?

- **CLI Playwright** : Automatisation, extraction en masse, ou quand les images posent problème
- **Bookmarklet** : Usage occasionnel, installation ultra-rapide (drag & drop)
- **Extension Chrome** : Usage régulier avec interface graphique

## Installation

### CLI Playwright

```bash
cd x-article-extractor
npm install
npx playwright install chromium
```

Configuration des credentials :

```bash
export X_USERNAME="votre_email_ou_username"
export X_PASSWORD="votre_mot_de_passe"
```

Ou copier `.env.example` vers `.env`.

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
node x-article-extractor/index.js https://x.com/utilisateur/status/1234567890
```

Le fichier `x-article-TIMESTAMP.html` sera généré dans le répertoire courant.

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
├── x-article-extractor/     # CLI Node.js + Playwright
│   ├── index.js             # Script principal
│   ├── package.json
│   └── .env.example
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

## Licence

MIT
