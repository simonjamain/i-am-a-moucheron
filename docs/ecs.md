# Entités, composants, systèmes (ECS)

> **Brouillon de conception, à valider avant tout code.** Ce document fixe l'architecture
> cible du jeu ; rien n'est encore migré. Il décrit les décisions prises, puis les points
> ouverts. Une fois validé, il décrit l'état actuel et l'ancien code disparaît de la carte.

## Pourquoi

La performance est au cœur du gameplay (essaims, projectiles, véhicules) et le code actuel
varie les comportements par branches (`kind === 'gatling'`), dans des fichiers de plusieurs
milliers de lignes (`server/game.js`, `src/client.js`). Une entité est ici **ce que ses
composants disent qu'elle est** : un nouveau type s'ajoute par déclaration, sans toucher au
code générique.

## Vocabulaire

| Terme     | Définition                                                                                  |
| --------- | ------------------------------------------------------------------------------------------- |
| Entité    | Un identifiant entier, stable et partagé entre client et serveur. Aucune donnée ni méthode. |
| Composant | Des données pures, rangées par champ : `Health.hp`, `Ammo.count`, `Transform.x`…            |
| Système   | Une fonction qui parcourt toutes les entités ayant un jeu donné de composants.              |
| Monde     | L'ensemble des entités et des stockages ; un par salle côté serveur, un côté client.        |

## Décisions

1. **Tableaux denses dès le début.** Chaque champ numérique d'un composant est un tableau typé
   (`Float32Array`, `Uint16Array`…) indexé par une table dense d'entités. Pas d'allocation par
   entité ni par image ; les systèmes parcourent des blocs contigus.
2. **Un accès `get`/`set` autour du stockage.** Le code lit et écrit par `world.get(Health, e)`
   et `world.set(Health, e, hp)`, jamais par indice brut ; le stockage reste modifiable sans
   toucher aux systèmes. Les boucles chaudes disposent d'un parcours par blocs. Priorité :
   performance, puis lisibilité.
3. **Variation par composition.** Pas de `kind === '…'` dans un système : une tourelle Gatling
   est une entité avec une cadence rapide, pas un cas particulier du système de tir.
4. **Rapier reste maître des corps dynamiques.** Un composant `Body` porte seulement le
   _handle_ du corps. Un système `PhysicsStep` avance Rapier, puis `PhysicsSync` recopie en un
   passage la pose des corps éveillés vers `Transform`. Le sens de copie est unique (Rapier
   vers `Transform`) ; les forces passent par des commandes appliquées avant l'étape. Les
   entités sans corps (insectes au sol du serveur, tourelles posées, projectiles) écrivent
   `Transform` directement.
5. **Autorité par composant.** `Authority { owner }` désigne un joueur ou le serveur. Seul le
   propriétaire exécute les systèmes de simulation de l'entité et réplique ses composants ;
   les autres n'exécutent que l'interpolation. **La propriété ne change qu'à la montée à bord
   et à la descente d'un engin** (l'engin sans pilote revient au serveur, `parked-host.ts`) ;
   un contact entre joueur et objet physique ne la transfère pas.
6. **Transfert d'autorité explicite et complet.** Une seule opération emporte l'état entier
   (pose, vitesse remise à zéro pour un engin au repos, corps endormi). Les bogues de passage
   de main (engin qui flotte, vitesse résiduelle d'un engin à l'arrêt) viennent de transferts
   partiels.
7. **Client et serveur partagent le modèle.** Les composants et les systèmes de règle partagée
   vivent dans `src/`, importés des deux côtés ; le rendu et les entrées restent côté client,
   la salle et l'argent côté serveur. Aucun anti-triche ([confiance](trust-model.md)).
8. **Réseau par deltas de composants.** Seuls les composants répliqués et modifiés partent, au
   format compact des [corps partagés](walking-network.md) ; les entités distantes s'affichent
   interpolées (`PoseSmoother`, `MotionTrack`).

## Ajouter un type d'entité

1. Déclarer ses composants dans un module de `src/` (données seules).
2. Décrire le type dans la table des définitions : composants initiaux et valeurs.
3. Réutiliser les systèmes existants ; n'en écrire un nouveau que pour un comportement
   nouveau, dans son propre fichier.
4. Ajouter un test sous Node qui crée l'entité et fait tourner les systèmes.

L'exemple de référence est la première tranche migrée (les tourelles) ; copier ce qui
marche vaut mieux que suivre une règle.

## Migration

Coexistence avec l'ancien code, une tranche à la fois, sans réécriture d'un bloc. Ordre
proposé : tourelles, créatures au sol, engins sans pilote, puis engins pilotés. Mesurer avant
et après chaque tranche performante ([performance](performance.md)).

## Points ouverts

- Format exact de la table d'indices (identifiants dispersés ou entités regroupées par type).
- Réutilisation des identifiants d'entités détruites (génération pour éviter les références
  périmées).
- Découpage des modules entre `src/` partagé, `server/` et `client`.
- Quels composants sont répliqués, à quelle cadence, avec quelle quantification.
