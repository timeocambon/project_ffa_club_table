# Guide utilisateur

Ce guide explique comment consulter et organiser les performances d'un club
FFA depuis un ordinateur, une tablette ou un téléphone.

## Ouvrir l'application

Utiliser l'adresse publique fournie par Render, ou l'adresse locale
`http://localhost:3001` pendant le développement.

Ne pas ouvrir directement le fichier `public/index.html` : dans ce cas, la
page ne peut pas communiquer avec le serveur qui récupère les résultats.

## Charger les résultats d'un club

1. Saisir le numéro du club, composé de **6 chiffres**.
2. Vérifier l'année, composée de **4 chiffres**.
3. Sélectionner **Charger**.
4. Attendre la fin de la progression, puis vérifier le message `OK` affiché
   au-dessus du tableau.

La première ouverture sur l'offre gratuite Render peut prendre environ une
minute si le service était en veille. La récupération des données Athlé.fr
peut ensuite prendre quelques secondes, davantage si le club possède beaucoup
de résultats.

## Comprendre le tableau

Chaque ligne représente un athlète. Les premières colonnes indiquent son nom,
sa catégorie et son sexe. Chaque épreuve utilise ensuite deux colonnes : la
meilleure performance et le nombre de points correspondant.

- un nombre indique les points calculés ;
- `0` signifie que la performance est sous le premier seuil du barème ;
- `N/D` signifie qu'aucun barème ne correspond à cette combinaison d'épreuve,
  de catégorie ou de sexe ;
- `?` signifie que le format de la performance n'a pas pu être converti ;
- `—` signifie qu'aucune performance n'est disponible dans cette cellule.

Le tableau peut être déplacé horizontalement pour voir toutes les épreuves.
Sur mobile, la première colonne reste visible pendant le déplacement.

## Filtrer les résultats

Les options disponibles sont regroupées au-dessus du tableau. Sur téléphone,
sélectionner d'abord **Options** pour les afficher.

### Catégories

Choisir une ou plusieurs catégories pour limiter les athlètes affichés.
**Tout** sélectionne toutes les catégories et **Effacer** retire le filtre de
catégorie.

### Sexe

Choisir **Tous**, **Hommes** ou **Femmes**. Le bouton actif reste visuellement
sélectionné.

### Barème

Choisir le barème **50** ou **1000**. Les points sont recalculés immédiatement
sans recharger les résultats Athlé.fr.

### Épreuves

Choisir les familles d'épreuves à conserver. **Tout** les affiche toutes ;
**Effacer** masque toutes les colonnes d'épreuves jusqu'à une nouvelle
sélection.

## Trier le tableau

Sélectionner le titre d'une colonne :

- pour le nom, la catégorie et le sexe, les clics successifs alternent entre
  l'ordre croissant et décroissant ;
- pour une épreuve, les clics successifs affichent d'abord les meilleures puis
  les moins bonnes performances ;
- l'indicateur `▲`, `▼` ou `↕` montre l'état du tri.

Les titres de colonnes sont également utilisables au clavier avec la touche
`Entrée`.

## Gérer les absents

Sur ordinateur, effectuer un clic droit sur la ligne d'un athlète puis choisir
**Mettre absent**. Sur un écran tactile, maintenir le doigt sur la ligne pendant
un peu plus d'une demi-seconde.

Le menu **Absents** permet ensuite :

- de consulter les noms marqués absents ;
- de retirer un nom avec le bouton `×` ;
- d'effacer toute la liste ;
- de placer ou non les absents en bas du tableau.

La liste est conservée dans le navigateur utilisé.

## Colorer des cellules

1. Ouvrir **Couleurs**.
2. Choisir rouge, jaune ou vert.
3. Sélectionner les cellules à colorer dans le tableau.
4. Sélectionner de nouveau une cellule de la même couleur pour retirer sa
   couleur.

**Effacer la case sélectionnée** retire uniquement la couleur de la dernière
case choisie. **Tout effacer** retire toutes les couleurs du tableau courant.
Choisir **Aucune** permet de sélectionner des cellules sans les recolorer.

## Enregistrer une vue

Une sauvegarde mémorise les résultats chargés, les filtres, le tri, les
absents et les couleurs.

1. Ouvrir **Sauvegardes** après avoir chargé un club.
2. Saisir un nom ou conserver le nom proposé automatiquement.
3. Sélectionner **Enregistrer la vue actuelle**.

Pour retrouver une vue, la choisir dans la liste puis sélectionner **Charger**.
Le bouton **Supprimer** efface la sauvegarde sélectionnée.

Les sauvegardes restent uniquement dans le navigateur courant. Elles ne sont
pas synchronisées entre appareils et disparaissent si les données du site sont
effacées ou si une navigation privée est fermée.

## Utiliser l'application au clavier

- `Tab` et `Maj + Tab` déplacent le focus entre les commandes ;
- `Entrée` ou `Espace` active un bouton ;
- `Échap` ferme un menu ouvert et rend le focus à son bouton ;
- `Entrée` dans le champ Club ou Année lance le chargement.

## Résoudre les problèmes courants

### Le message « Club invalide » apparaît

Le numéro doit contenir exactement 6 chiffres, sans espace ni lettre.

### Le message « Année invalide » apparaît

Utiliser une année sur 4 chiffres, comprise entre 2000 et l'année prochaine.

### La première page est lente à s'ouvrir

Le service gratuit Render se met en veille après une période sans visite. La
première requête suivante le réveille et peut prendre environ une minute.

### Une erreur Athlé.fr apparaît

Attendre quelques instants puis relancer le chargement. L'application dépend
de la disponibilité et de la structure du site Athlé.fr.

### Des points affichent `N/D`

Ce n'est pas nécessairement une erreur : certains barèmes ne couvrent pas
toutes les catégories, tous les sexes ou toutes les épreuves.

### Une sauvegarde a disparu

Vérifier que le même navigateur et le même appareil sont utilisés. Les
sauvegardes ne sont pas stockées sur Render.
