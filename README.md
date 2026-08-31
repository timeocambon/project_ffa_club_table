# Tableau des performances FFA

Application web permettant de récupérer les bilans d’un club depuis Athlé.fr,
de regrouper les meilleures performances par athlète et de calculer les points
avec les barèmes 50 et 1000.

## Fonctionnalités

- récupération des résultats d’un club FFA par année ;
- classement par catégorie, sexe et famille d’épreuves ;
- calcul des points avec indication claire lorsqu’un barème est indisponible ;
- gestion des absents, couleurs de cellules, tris et sauvegardes locales ;
- cache serveur de cinq minutes pour limiter les requêtes vers Athlé.fr ;
- validation automatique des barèmes et tests de l’interface.

## Prérequis

- Node.js 20 ou plus récent ;
- npm ;
- Chromium fourni par Playwright.

## Installation locale

```bash
npm ci
npx playwright install chromium
npm start
```

Ouvrir ensuite [http://localhost:3001](http://localhost:3001).

L’application doit être ouverte par cette adresse HTTP. Ouvrir directement
`public/index.html` comme un fichier local ne permet pas d’appeler l’API.

Pour changer le port :

```bash
PORT=8080 npm start
```

## Tests

La commande principale vérifie les barèmes, les règles serveur, le calcul des
points et un scénario complet dans Chromium :

```bash
npm test
```

Commandes ciblées :

```bash
npm run validate:barremes
npm run test:unit
npm run test:ui
```

## Intégration continue

Le workflow GitHub Actions `.github/workflows/ci.yml` relance automatiquement
la même suite lors de chaque envoi de code et pour chaque pull request. Il
utilise Node.js 22, installe Chromium et ne demande qu’un accès en lecture au
dépôt.

## Docker

Construire puis lancer l’image :

```bash
docker build -t ffa-club-table .
docker run --rm --ipc=host -p 3001:3001 ffa-club-table
```

Le conteneur expose le port `3001` et possède un contrôle de santé sur
`/healthz`. Le port peut être remplacé avec `-e PORT=8080 -p 8080:8080`.

## Déploiement sur Render

Le fichier `render.yaml` prépare un service web Docker avec les réglages
adaptés au projet : région de Francfort, contrôle de santé sur `/healthz`,
offre gratuite et déploiement automatique uniquement après la réussite des
contrôles GitHub Actions.

Pour publier l'application :

1. envoyer la branche principale sur GitHub ;
2. choisir **New > Blueprint** dans le tableau de bord Render ;
3. connecter ce dépôt et laisser Render détecter `render.yaml` ;
4. vérifier le nom du service puis lancer **Apply**.

Render fournit automatiquement la variable `PORT`. Il ne faut pas la créer
manuellement : le serveur la valide et écoute sur `0.0.0.0`, comme demandé par
la plateforme. Aucun secret ni aucune base de données ne sont nécessaires.

L'offre gratuite se met en veille après 15 minutes sans trafic. La première
visite suivante peut donc prendre environ une minute. Pour un service toujours
disponible, il faudra remplacer l'offre `free` par une offre payante dans
Render. Les sauvegardes de l'application restent stockées dans le navigateur
de chaque utilisateur et ne dépendent pas du disque temporaire du serveur.

## API

### `GET /healthz`

Renvoie `ok` lorsque le serveur fonctionne.

### `GET /api/bilans`

Paramètres :

- `club` : code FFA à six chiffres, obligatoire ;
- `annee` : année sur quatre chiffres, facultative ;
- `debug=1` : ajoute des informations de diagnostic, réservé au développement.

Exemple :

```text
http://localhost:3001/api/bilans?club=081061&annee=2026
```

Les réponses invalides utilisent le statut `400`. Une indisponibilité
d’Athlé.fr renvoie `502`, ou `504` lorsque le délai maximal est dépassé.

## Organisation

- `index.js` : serveur HTTP, récupération Athlé.fr, cache et parseur ;
- `public/` : interface, styles et barèmes ;
- `public/scoring.js` : conversion des performances et calcul des points ;
- `scripts/validate-barremes.js` : validation des fichiers de barèmes ;
- `tests/` : tests unitaires et scénario d’interface.

## Limites connues

- la récupération dépend de la structure HTML d’Athlé.fr ;
- vingt pages au maximum sont analysées par demande ;
- les sauvegardes, absents et couleurs sont stockés dans le navigateur local ;
- certaines disciplines restent visibles avec `N/D` lorsqu’aucun barème ne
  correspond à la catégorie ou au sexe.
