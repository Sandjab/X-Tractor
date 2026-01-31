# X Article Extractor - Extension Chrome

Extension Chrome pour extraire les articles X (Twitter) vers des fichiers HTML autonomes.

## Installation

1. Ouvrir Chrome et aller à `chrome://extensions/`
2. Activer le "Mode développeur" (en haut à droite)
3. Cliquer sur "Charger l'extension non empaquetée"
4. Sélectionner le dossier `x-extension`

## Utilisation

1. Aller sur une page d'article X (vous devez être connecté)
2. Cliquer sur l'icône de l'extension dans la barre d'outils
3. Cliquer sur "Extraire l'article"
4. Choisir où sauvegarder le fichier HTML

## Fonctionnalités

- ✓ Extraction du contenu de l'article
- ✓ Styles CSS préservés
- ✓ Images converties en base64 (fichier autonome)
- ✓ Largeur de contenu élargie (800px)
- ✓ Support du mode sombre/clair

## Permissions requises

- `activeTab` : Accéder à l'onglet actif pour extraire le contenu
- `scripting` : Exécuter le script d'extraction dans la page
- `downloads` : Télécharger le fichier HTML généré

## Limitations

- Les images protégées par CORS peuvent ne pas être converties en base64
- Fonctionne uniquement sur x.com et twitter.com
