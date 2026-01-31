# X Article Extractor

Extrait les articles X (Twitter) vers des fichiers HTML autonomes, avec images embarquées en base64.

## Installation

```bash
npm install
```

## Configuration

Définir les variables d'environnement :

```bash
export X_USERNAME="votre_email_ou_username"
export X_PASSWORD="votre_mot_de_passe"
```

Ou copier `.env.example` vers `.env` et utiliser un outil comme `dotenv`.

## Utilisation

```bash
node index.js <url-de-larticle>
```

Exemple :

```bash
node index.js https://x.com/elonmusk/status/1234567890
```

Le fichier HTML sera généré dans le répertoire courant avec un nom du type `x-article-1234567890.html`.

## Notes

- Pas de support 2FA pour l'instant
- Le rendu reproduit le style de X mais avec une largeur de contenu plus généreuse (800px au lieu de 600px)
- Toutes les images sont embarquées en base64, le fichier HTML est totalement autonome
