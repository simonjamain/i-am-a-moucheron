# Travail sur i am a moucheron

## Où lire

Le dépôt GitHub est la référence : les tâches ouvertes sont les issues, l'historique est
dans Git. Lire [README](README.md) et [CONTRIBUTING](CONTRIBUTING.md), puis seulement les
documents de la tâche :

- carte des modules : [code-structure](docs/code-structure.md) ;
- règles de jeu et parcours joueur : [gameplay](docs/gameplay.md), qui renvoie aux règles détaillées ;
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
- Fichiers générés, jamais édités ni committés : `VERSION`, `server/assets.js`,
  `src/changelog-recent.ts`, `dist/`, `docs/ui-review.html` et les `src/*-data.ts` des
  importeurs. Le numéro de version vient de Git : un clone superficiel demande
  `git fetch --unshallow` ([version et nouveautés](docs/changelog.md)).

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

Règle pérenne pour tout nouveau modèle Meshy (détails et checklist dans
[le pipeline d'assets](docs/asset-pipeline.md#règle-pour-tout-nouveau-modèle-meshy)) :

1. proposer des visuels conformes à la [direction artistique](docs/art-direction.md) et obtenir la
   **validation de l'utilisateur avant toute génération** ;
2. une image de référence isolée, aux vues adaptées, par pièce mobile — jamais une
   planche entière envoyée comme une seule pièce ;
3. générer séparément roues, rotor, tourelle, canon et autres articulations ;
   documenter pivots, axes et dimensions ;
4. conserver la source approuvée, UV, textures et provenance SHA-256 ; passer l'image
   Docker d'optimisation quand une réduction sûre est possible, sans jamais simplifier
   aveuglément un GLB monobloc articulé ; vérifier rendu, pièces mobiles, intégration
   et performances avant adoption.

## Livraison et fusion

Traiter le périmètre jusqu'à une livraison vérifiée ; choisir les détails courants selon
les conventions et consigner les hypothèses. Demander seulement si une décision ou un
accès indispensable manque. La livraison est la PR fusionnée sur `main` : le déploiement
est ensuite automatique ([operations](docs/operations.md#déploiement)).

L'agent auteur fusionne lui-même sa PR, sans revue manuelle préalable, selon
[CONTRIBUTING](CONTRIBUTING.md#vérifier-et-fusionner) :

1. diff relu, critères d'acceptation vérifiés, build Docker local consigné (commande,
   résultat, commit testé) ou, sans Docker, contrôle `Docker build` attendu ;
2. activer l'**auto-merge en squash** (`enable_pr_auto_merge`, `SQUASH`) ; si GitHub
   répond que la PR est déjà fusionnable, la fusionner directement en squash ;
3. rester responsable jusqu'à la fusion effective : corriger un contrôle rouge ou un
   conflit (label `conflit`), puis vérifier l'état de `main` et la fermeture des issues.

Pas d'auto-merge tant qu'un essai, un contrôle ou une relecture reste à faire. En cas
d'échec, de contrôle absent ou de permission insuffisante, laisser la PR ouverte et
documenter le blocage ; ne jamais contourner une protection ni déclarer exécuté un essai
qui ne l'a pas été. Secrets et administration du VPS restent hors des contributions.
