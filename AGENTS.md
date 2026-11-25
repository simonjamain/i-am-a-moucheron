# Travail sur i am a moucheron

## Où lire

Le dépôt GitHub est la référence : les tâches ouvertes sont les issues, l'historique est
dans Git. Lire [README](README.md) et [CONTRIBUTING](CONTRIBUTING.md), puis seulement les
documents de la tâche :

- carte des modules : [code-structure](docs/code-structure.md) ;
- règles de jeu et parcours joueur : [gameplay](docs/gameplay.md), qui renvoie aux règles détaillées
  (achats : [economy](docs/economy.md) ; signatures et réserves : [logistics-contracts](docs/logistics-contracts.md)) ;
- réseau, autorité, corps partagés : [walking-network](docs/walking-network.md) et [udp-server](docs/udp-server.md) ;
- contrôles, CI, déploiement : [operations](docs/operations.md) ;
- nouvelle espèce ou nouveau véhicule : [ajouter du contenu](docs/adding-content.md) ;
- tâche interrompue : sa note dans [docs/tasks/](docs/tasks/README.md), la discussion GitHub
  et le diff, en vérifiant chaque affirmation contre la branche.

En cas d'écart entre un document et le code, le code fait foi : corriger le document
dans la même PR.

## Confiance envers les joueurs

Règle pérenne : **on fait confiance aux clients**. C'est un jeu coopératif sans enjeu ; ne jamais
écrire ni conserver de code qui détecte, empêche ou limite la triche (butées ou cadences imposées
par le serveur, plafonds de dégâts, contrôles de plausibilité de position ou de vitesse). Le serveur
garde seulement les règles de jeu partagées, la robustesse des entrées (types, nombres finis,
idempotence) et la protection de la salle. Détail : [confiance envers les clients](docs/trust-model.md).

## Boucle de travail

1. Définir le résultat observable et le périmètre. Reproduire un bug avant correction ;
   consigner une reproduction impossible. Repérer les systèmes touchés et les PR ouvertes
   qui les touchent aussi.
2. Implémenter par étapes ciblées ; après chaque étape, lancer le contrôle pertinent
   (`npm test -- <fragment>`), lire son résultat et corriger la cause d'un échec. Un bug
   reproductible automatiquement reçoit un test de régression rouge avant correction. Un
   test rouge se diagnostique : ses attentes ne sont jamais affaiblies pour passer.
3. Sans progrès après plusieurs tentatives, revenir aux observations, changer d'hypothèse
   ou documenter le blocage.
4. Relire le diff final contre la demande : régressions, interactions réseau, code
   généré, secrets, changements hors périmètre. Lancer la suite complète et le build
   Docker ([operations](docs/operations.md#contrôles-avant-une-pr)).
5. Livrer preuves et limites dans la PR. Une compilation, un aperçu HUD ou un test local
   ne prouve pas une partie WebGL/UDP/WAN ni le confort du pilotage. Une optimisation
   demande un scénario et des mesures comparables avant/après.

## Code

- Tout nouveau module s'écrit en TypeScript (types effacés, sans compilation) ; règles et
  migration d'un `.js` : [TypeScript](docs/typescript.md).
- Un nouveau `scripts/test-*.mjs` s'ajoute à `scripts/suite.mjs` (`test-suite-wiring.mjs`
  le vérifie) ; un nouveau `scripts/e2e-*.mjs` à sa liste `E2E`.
- Fichiers générés, jamais édités à la main. Ignorés par Git : `VERSION`,
  `server/assets.js`, `src/changelog-recent.ts`, `dist/`. Versionnés mais régénérés :
  `docs/ui-review.html` (par l'assembleur), les `src/*-data.ts` et
  `src/vehicle-anchors.ts` (par les importeurs, [pipeline](docs/asset-pipeline.md)). Le
  numéro de version vient de Git : un clone superficiel demande `git fetch --unshallow`
  ([version et nouveautés](docs/changelog.md)).

## Documentation

Mettre à jour dans la même PR la référence dont le comportement change : une référence
par sujet, décrivant l'état actuel au présent, sans journal de versions (Git le garde).
Une nouvelle page de `docs/` s'ajoute au `nav` de `mkdocs.yml` ([site](docs/site.md)).
`npm run check:docs` vérifie les liens locaux. Pour un travail long ou transmis, tenir une
note selon [le modèle de reprise](docs/tasks/README.md) et la supprimer à la clôture.

## Contribution visible par les joueurs

- Rendu, son, texte, menu ou HUD : suivre la [direction artistique](docs/art-direction.md)
  et les [règles d'interface](docs/ui-guidelines.md) — le monde et le son informent avant
  le HUD, les menus sont des documents qui sortent du monde, couleurs et tailles viennent
  des jetons visuels. Justifier toute exception dans la PR.
- Ajouter un **nouveau fichier** `changelog.d/sujet-court-ab12.md` (suffixe aléatoire,
  jamais le nom de la branche ni l'édition d'un fragment existant) : une phrase par ligne,
  en français courant, 130 caractères au plus, sur ce qui change pour le joueur. Rien pour
  une contribution purement technique ; jamais d'édition de `src/changelog-history.ts`.
  Détail : [version et nouveautés](docs/changelog.md).

## Nouveaux assets Meshy

Règle pérenne : proposer des visuels conformes à la [direction artistique](docs/art-direction.md)
et obtenir la **validation de l'utilisateur avant toute génération**. Ensuite, une
image de référence isolée et une génération séparée par pièce mobile (roue, rotor, tourelle, canon) ;
pivots, axes et dimensions documentés ; source approuvée et provenance SHA-256 conservées ;
jamais de simplification aveugle d'un GLB monobloc articulé. Étapes et checklist :
[pipeline d'assets](docs/asset-pipeline.md#règle-pour-tout-nouveau-modèle-meshy).

## Livraison et fusion

Traiter le périmètre jusqu'à une livraison vérifiée ; choisir les détails courants selon
les conventions et consigner les hypothèses. Demander seulement si une décision ou un
accès indispensable manque. La livraison est la PR fusionnée sur `main` ; le déploiement
suit seul ([operations](docs/operations.md#déploiement)).

L'agent auteur fusionne lui-même sa PR, sans revue manuelle, selon
[CONTRIBUTING](CONTRIBUTING.md#vérifier-et-fusionner) : auto-merge en squash
(`enable_pr_auto_merge`, `SQUASH`), ou fusion directe en squash si GitHub répond que la PR
est déjà fusionnable. Pas d'auto-merge tant qu'un essai, un contrôle ou une relecture reste
à faire. L'agent reste responsable jusqu'à la fusion effective : contrôle rouge, label
`conflit`, état de `main`, fermeture des issues. En cas de blocage, laisser la PR ouverte
et le documenter ; ne jamais contourner une protection ni déclarer exécuté un essai qui ne
l'a pas été. Secrets et administration du VPS restent hors des contributions.
