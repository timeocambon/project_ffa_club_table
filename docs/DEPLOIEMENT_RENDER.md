# Déployer l'application sur Render

Ce guide décrit la première publication, les contrôles après déploiement et la
procédure de retour arrière. Le projet utilise un service web Docker défini par
le fichier `render.yaml`.

Documentation officielle utile :

- [Render Blueprints](https://render.com/docs/infrastructure-as-code) ;
- [contrôles de santé](https://render.com/docs/health-checks) ;
- [limites de l'offre gratuite](https://render.com/docs/free) ;
- [retours arrière](https://render.com/docs/rollbacks).

## Configuration prévue

Le Blueprint crée un service avec les réglages suivants :

- nom : `ffa-club-table` ;
- environnement : Docker ;
- région : Francfort ;
- offre : gratuite ;
- contrôle de santé : `/healthz` ;
- déploiement automatique après la réussite des contrôles GitHub Actions ;
- délai d'arrêt permettant de terminer une récupération Athlé.fr en cours.

Render fournit automatiquement le port public. Ne pas ajouter manuellement de
variable `PORT`. L'application ne demande ni secret, ni base de données, ni
disque persistant.

## Vérifications avant publication

Depuis le dossier du projet :

```bash
npm ci
npm test
docker build -t ffa-club-table .
```

La commande `npm test` doit terminer sans échec. GitHub Actions exécutera la
même suite après l'envoi du code.

Vérifier également que les changements à publier se trouvent bien sur la
branche principale du dépôt GitHub.

## Première publication

1. Envoyer la branche principale sur GitHub.
2. Ouvrir le tableau de bord Render.
3. Choisir **New > Blueprint**.
4. Connecter le dépôt GitHub `project_ffa_club_table`.
5. Choisir la branche principale contenant `render.yaml`.
6. Conserver le chemin Blueprint proposé : `render.yaml`.
7. Vérifier le résumé du service, puis sélectionner **Deploy Blueprint**.
8. Attendre la fin de la construction Docker et le passage du service à l'état
   disponible.
9. Copier l'adresse publique se terminant par `.onrender.com`.

Le nom public exact peut recevoir un suffixe si `ffa-club-table` est déjà
utilisé. Toujours reprendre l'adresse affichée par Render.

## Contrôles après publication

Ouvrir d'abord l'adresse publique dans un navigateur. Vérifier ensuite la route
de santé :

```text
https://ADRESSE-RENDER.onrender.com/healthz
```

Elle doit afficher `ok`.

Lancer ensuite le contrôle automatique depuis le projet local :

```bash
APP_URL=https://ADRESSE-RENDER.onrender.com npm run test:smoke
```

Pour tester également la connexion réelle à Athlé.fr :

```bash
APP_URL=https://ADRESSE-RENDER.onrender.com \
SMOKE_CLUB=081061 \
SMOKE_YEAR=2026 \
SMOKE_REQUIRE_RESULTS=1 \
npm run test:smoke
```

Le résultat attendu confirme successivement la santé, la page publique, les
ressources, la sécurité, l'API et la récupération Athlé.fr.

## Déploiements suivants

Le réglage `autoDeployTrigger: checksPass` demande à Render d'attendre la
réussite des contrôles liés au dépôt avant de déployer un nouveau commit.

Le déroulement normal est donc :

1. modifier et tester le projet localement ;
2. envoyer les changements sur GitHub ;
3. attendre la réussite de GitHub Actions ;
4. laisser Render construire et remplacer automatiquement le service ;
5. relancer `npm run test:smoke` avec l'adresse publique.

## Surveiller le service

- la page **Events** montre les constructions, déploiements et redémarrages ;
- les journaux permettent de retrouver `API on http://0.0.0.0:10000` puis
  `Browser launched` lors d'un démarrage normal ;
- `/healthz` doit répondre `ok` ;
- une erreur de récupération Athlé.fr apparaît dans les journaux sans empêcher
  la route de santé de répondre.

L'offre gratuite se met en veille après 15 minutes sans trafic. Son réveil peut
prendre environ une minute. Elle utilise un disque temporaire, mais cela ne
fait pas perdre les sauvegardes de l'application : celles-ci se trouvent dans
le navigateur de chaque utilisateur.

## Revenir à une version précédente

Si une version publiée ne fonctionne pas :

1. ouvrir la page **Events** du service ;
2. trouver un déploiement précédent qui a réussi ;
3. choisir **Rollback** puis confirmer le retour vers ce déploiement ;
4. relancer le contrôle `npm run test:smoke` ;
5. corriger le problème dans le code avant de réactiver les déploiements
   automatiques.

Un retour arrière lancé depuis le tableau de bord désactive automatiquement les
déploiements automatiques. Les réactiver dans les réglages du service seulement
après la correction.

## Résoudre un échec de déploiement

### Le Blueprint est refusé

Consulter le détail affiché par Render et vérifier que le fichier utilisé est
bien `render.yaml` à la racine du dépôt.

### La construction Docker échoue

Vérifier d'abord GitHub Actions et reproduire localement avec :

```bash
docker build -t ffa-club-table .
```

### Aucun port n'est détecté

Les journaux doivent indiquer une écoute sur `0.0.0.0` et sur le port fourni par
Render. Ne pas forcer une autre variable `PORT` dans le tableau de bord.

### Chromium ne démarre pas

Vérifier que le `Dockerfile` utilise toujours l'image Playwright correspondant
exactement à la version verrouillée dans `package-lock.json`.

### Le contrôle réel Athlé.fr échoue

Relancer d'abord le contrôle après quelques minutes. Si `/healthz` et la page
principale fonctionnent, le problème peut provenir temporairement d'Athlé.fr ou
de sa structure HTML.
