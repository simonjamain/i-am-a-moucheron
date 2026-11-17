# Plans de bureau — dispositions par room

- Tâche / PR : à lier (demande de l'utilisateur : repenser la disposition du bureau, six variantes jouables, choix avant d'entrer dans une room).
- Branche : `ccr-9b5ca0c6-tew99n`.
- Résultat attendu : six plans de blocage (volumes simples) jouables, plus l'actuel pour comparaison ; un sélecteur de plan dans l'accueil, fixé à la création de la room ; une room avec des joueurs ne change jamais de plan. Outil d'essai d'abord, pas un vrai choix de carte.
- Décisions de conception (validées) : un seul volume découpé par des cassures ; corbeille adossée à un angle ou au centre selon le plan ; pas de base ni de piste matérialisées ; joueurs au sol près de la corbeille ; entrées éloignées de la corbeille (> 6 m si possible) ; passages bouchables de 0,5 à 0,9 m ; le sol suit le plus court chemin ; l'air est plus lent à arriver (cible ≈ 3× le sol, à obtenir aussi par les vitesses) ; décor en volumes simples, modèles détaillés plus tard.
- Les six plans dessinés (planche de comparaison faite en session ; format cible : données par plan) : 1 Diagonale, 2 Îlots à 360°, 3 Cloison et porte, 4 Deux fronts, 5 Archives en serpentin, 6 Corbeille sur le bureau.

## Faits relevés dans le code (à vérifier avant de s'y fier)

- Une room = le « Code de partie » ; `Game.rooms` (`server/game.js`) la garde en RAM.
- La disposition est globale : `OFFICE_LAYOUT`, `RAID_POINTS` (`src/layout.js`), `PORTALS`, `enemyRoute` + cache (`src/routes.js`), `staticGroundFlow` (`src/ground-defense.js`), `OFFICE_SOLIDS` généré à l'assemblage (`scripts/assemble.mjs` → `worker/assets.js`, fichier énorme : ne pas le parcourir), décor dans `src/office.js`.
- Les appareils et la marche sont calculés depuis l'origine de la base (`src/base.js`, `OFFICE_LAYOUT.base`). `baseBody` accepte déjà un `walkSpawn` : piste pour faire apparaître les joueurs au sol près de la corbeille.
- Le serveur Node et le client importent les mêmes modules ; des workers (`wave-ground-worker.js`) lisent aussi les trajets.

## Livraison par étapes (chaque étape = une PR, tests verts, version supérieure)

1. Infrastructure : registre de plans (`src/layouts.js`) avec le plan « actuel » seul ; plan actif par room côté serveur, transmis au client à la connexion ; caches (`routeCache`, flux de sol) indexés par plan ; aucun changement visible.
2. Décor et collisions pilotés par les données du plan (`office.js`, solides serveur).
3. Portails, trajets aériens (`RAID_POINTS`), but des rampants et apparition des joueurs par plan.
4. Les six plans et le sélecteur (cartes avec vignette) dans l'accueil, paramètre `?plan=`.
5. Essai de jeu, ajustement des durées (sol mesuré, air ≈ 3×).

## État réel

- Étape 0 faite : exploration et plans dessinés. Aucun code modifié.

## Vérifications

- `npm test` local bloqué par `node-datachannel` absent (environnement) ; la CI complète tranche. Docker local indisponible : contrôle GitHub Actions `Docker build`.
- Non vérifié : tout ce qui touche WebGL/UDP en conditions réelles.

## Prochaine action

Étape 1 : lister précisément les lecteurs de `OFFICE_LAYOUT`/`PORTALS`/`RAID_*` côté serveur (`server/game.js`, `src/server.js`, `src/combat.js`, `src/waves.js`, `src/ground-creatures.js`) et décider entre passage explicite du plan et contexte actif par room (le serveur doit traiter plusieurs rooms de plans différents).
