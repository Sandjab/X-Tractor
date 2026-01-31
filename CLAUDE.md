# CLAUDE.md - X Article Extractor

## Objectif

Transformer un article X (Twitter) en fichier HTML autonome, consultable hors-ligne, avec images embarquées en base64. Le rendu doit être fidèle à X mais avec une largeur de contenu en pleine largeur (100%) pour une meilleure lisibilité sur grand écran.

## Structure du projet

```
├── x-article-extractor/   # CLI Node.js + Playwright
├── x-bookmarklet/         # Bookmarklet (JS pur)
└── x-extension/           # Extension Chrome (Manifest V3)
```

Les trois outils font la même chose avec des trade-offs différents :

| Outil | Auth | Images CORS | Automatisable | Poids |
|-------|------|-------------|---------------|-------|
| CLI Playwright | Credentials en env | ✓ Aucun problème | ✓ Oui | ~300 Mo |
| Bookmarklet | Session navigateur | ✗ Parfois bloquées | ✗ Non | ~4 Ko |
| Extension | Session navigateur | ✗ Parfois bloquées | ✗ Non | ~10 Ko |

## Contraintes techniques connues

### Sélecteurs X
X est une SPA React. Les sélecteurs peuvent changer sans préavis :
- `article` : conteneur principal (stable)
- `[data-testid="tweet"]` : wrapper du tweet (moyennement stable)
- `[data-testid="reply|retweet|like|bookmark|share"]` : boutons d'action à supprimer
- `[role="progressbar"]` : spinners de chargement

### CORS (bookmarklet & extension uniquement)
Les images sur `pbs.twimg.com` ont des headers CORS restrictifs. Deux stratégies :
1. `fetch()` avec `mode: 'cors'` → échoue souvent
2. Canvas `drawImage()` + `toDataURL()` → échoue si l'image n'a pas été servie avec les bons headers

Le CLI Playwright n'a pas ce problème car il exécute le fetch dans le contexte du navigateur contrôlé.

### Authentification X
- Login classique : email/username → password (géré)
- Vérification supplémentaire : X demande parfois de confirmer le username/téléphone (partiellement géré)
- 2FA : **non supporté** actuellement

## Améliorations possibles

### Priorité haute
- [ ] Meilleure détection des articles "longs" (X Articles vs tweets normaux)
- [ ] Support des threads (extraction multi-tweets)
- [ ] Gestion du 2FA (pause interactive ou TOTP)

### Priorité moyenne
- [ ] Proxy pour contourner CORS dans bookmarklet/extension (service worker ou serveur externe)
- [ ] Cache de session Playwright pour éviter le login à chaque extraction
- [ ] Extraction des vidéos (complexe : HLS streams)

### Priorité basse
- [ ] Mode batch CLI (liste d'URLs)
- [ ] Export PDF en plus de HTML
- [ ] Dark/light mode toggle dans le HTML généré

## Décisions de design

### Pourquoi Playwright plutôt que Puppeteer ?
Auto-wait intelligent. X charge le contenu progressivement, Playwright gère mieux les états intermédiaires sans code défensif.

### Pourquoi base64 plutôt que fichiers séparés ?
Fichier unique = partage simplifié. Un seul .html à envoyer, pas de dossier d'assets.

### Pourquoi 100% de largeur ?
X utilise 600px, trop étroit sur grand écran. La pleine largeur (100%) avec un padding de 40px offre une meilleure lisibilité tout en préservant le design original.

## Commandes utiles

```bash
# CLI
cd x-article-extractor
npm install && npx playwright install chromium
X_USERNAME=xxx X_PASSWORD=xxx node index.js <url>

# Extension : charger dans chrome://extensions/ en mode développeur

# Bookmarklet : ouvrir install.html et glisser le lien
```

## Points d'attention pour les modifications

1. **Ne pas supposer la structure DOM de X** : toujours avoir des fallbacks
2. **Garder les trois outils synchronisés** : même logique d'extraction, même format de sortie
3. **Tester en mode sombre ET clair** : X change les couleurs dynamiquement
4. **Les styles extraits sont volumineux** : c'est normal, X injecte beaucoup de CSS
