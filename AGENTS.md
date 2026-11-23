# Travail sur Flight Lab

## Où lire

Le code et `package.json` font foi ; la documentation explique le pourquoi, les
règles partagées et les pièges. Lire [README](README.md), puis selon la tâche :

- **gameplay**, touches, parcours joueur : [gameplay](docs/gameplay.md) ;
- **réseau**, autorité, physique partagée : [walking-network](docs/walking-network.md) ;
- **achats**, signatures, balistique, chutes : [economy-physics](docs/economy-physics.md) ;
- **emplacement d'un module** : [carte du code](docs/code-structure.md) ;
- **contrôles** avant livraison, CI, limites des tests : [operations](docs/operations.md) ;
- **PR**, fusion, conflits, issues : [CONTRIBUTING](CONTRIBUTING.md) ;
- **nouvelle espèce ou nouveau véhicule** : [ajouter du contenu](docs/adding-content.md) ;
- **reprise** d'une tâche interrompue : sa note dans `docs/tasks/`, la discussion
  GitHub et le diff ; vérifier chaque affirmation contre la branche.

Les tâches ouvertes sont les issues GitHub ; l'historique est dans Git.

## Confiance envers les joueurs

Règle pérenne : **on fait confiance aux clients**. C'est un jeu coopératif sans enjeu ; ne jamais
écrire ni conserver de code qui détecte, empêche ou limite la triche (butées ou cadences imposées
par le serveur, plafonds de dégâts, contrôles de plausibilité de position ou de vitesse). Le serveur
garde seulement les règles de jeu partagées, la robustesse des entrées (types, nombres finis,
idempotence) et la protection de la salle. Détail : [confiance envers les clients](docs/trust-model.md).

## Boucle de travail

1. Définir le résultat observable et le périmètre. Reproduire un bug avant de le
   corriger ; consigner une reproduction impossible. Repérer les systèmes touchés
   et les PR ouvertes qui y touchent aussi.
2. Avancer par étapes ciblées, chacune suivie de son contrôle. Pour un bug
   reproductible automatiquement, ajouter une régression rouge avant correction.
   Un test rouge se diagnostique : ses attentes ne s'affaiblissent pas.
3. Après plusieurs tentatives sans progrès, revenir aux observations, changer
   d'hypothèse ou documenter le blocage.
4. Relire le diff final : régressions, interactions réseau, code généré, secrets,
   hors-périmètre. Lancer les contrôles de [operations](docs/operations.md), dont la
   suite complète et le build Docker ([guide](docs/docker.md)).
5. Livrer preuves et limites dans la PR. Une compilation, un aperçu HUD ou un test
   local ne prouve ni une partie WebGL/UDP/WAN ni le confort du pilotage. Une
   optimisation demande un scénario et des mesures comparables avant/après.

Itérer avec `npm test -- <fragment>` (`--bail`, `--list`, `--jobs=1`). Un nouveau
`scripts/test-*.mjs` s'inscrit dans `scripts/suite.mjs`.

## Code

- Tout nouveau module s'écrit en TypeScript ; migration et règles d'écriture :
  [TypeScript](docs/typescript.md).
- Fichiers générés, jamais édités ni committés : `VERSION`, `server/assets.js`,
  `src/changelog-recent.ts`, `dist/`. Les `src/*-data.ts` et `src/vehicle-anchors.ts`
  se régénèrent par leurs importeurs. Le numéro de version vient de l'historique Git
  (`git fetch --unshallow` si le clone est superficiel) : [version](docs/changelog.md).
- Ne jamais éditer `src/changelog-history.ts` (historique figé).

## Documentation

Mettre à jour dans la même PR la référence dont le comportement change : une
référence par sujet, des liens ailleurs, pas de récit de livraison (Git le garde).
Une évolution de stack, d'autorité réseau ou de boucle de jeu revoit aussi README,
gameplay et la carte du code. Une nouvelle page de `docs/` s'ajoute au menu de
`mkdocs.yml` ([site](docs/site.md)). Vérifier les liens avec `npm run check:docs`.
Un travail long ou transmis tient une note selon [le modèle de reprise](docs/tasks/README.md).

## Nouveautés visibles par les joueurs

Pour chaque changement perceptible en jeu, ajouter **dans la même PR un nouveau fichier**
`changelog.d/sujet-court-ab12.md` (suffixe aléatoire, jamais le nom de la branche, jamais
l'édition d'un fragment existant) : une phrase par ligne, 130 caractères au plus, en français
courant, sur ce qui change **pour le joueur**. Rien pour un changement purement technique ;
rien d'annoncé qui ne soit livré. Détail : [version et nouveautés](docs/changelog.md).

## Direction artistique et interface

Toute contribution visible (modèle, décor, effet, son, texte, menu, HUD) suit la
[direction artistique](docs/art-direction.md) et les [règles d'interface](docs/ui-guidelines.md) :
le monde et le son informent avant le HUD, les menus sont des documents qui sortent
du monde, couleurs et tailles viennent des jetons visuels. Justifier toute exception dans la PR.

## Nouveaux assets Meshy — outil 3D

Règle pérenne pour tout nouveau modèle Meshy (détails et checklist dans
[le pipeline d'assets](docs/asset-pipeline.md#règle-pour-tout-nouveau-modèle-meshy)) :

1. proposer des visuels conformes à la [direction artistique](docs/art-direction.md) et obtenir la
   **validation de l'utilisateur avant toute génération** ;
2. une image de référence isolée, aux vues adaptées, par pièce mobile — jamais une
   planche entière envoyée comme une seule pièce ;
3. générer séparément roues, rotor, tourelle, canon et autres articulations ;
   documenter pivots, axes et dimensions ;
4. conserver source approuvée, UV, textures et provenance SHA-256, passer l'outil
   d'optimisation quand une réduction sûre est possible, puis vérifier rendu,
   pièces mobiles et performances avant adoption.

## Livraison et fusion

Traiter le périmètre jusqu'à une livraison vérifiée ; trancher les détails courants
selon les conventions et consigner les hypothèses. Ne demander une précision que si
une décision ou un accès indispensable manque.

L'agent auteur développe sur une branche dédiée, ouvre la PR et **la fusionne lui-même**
(auto-merge GitHub en squash) une fois le diff relu, les critères vérifiés et les
contrôles requis réussis, `Docker build` compris ; il reste responsable jusqu'à la
fusion effective, puis vérifie `main` et la fermeture des issues. Procédure, conflits
et cas bloqués : [CONTRIBUTING](CONTRIBUTING.md#vérifier-et-fusionner).

Garde-fous : ne jamais contourner une protection de `main` ni déclarer exécuté un
essai qui ne l'a pas été ; en cas d'échec, de contrôle absent ou de permission
insuffisante, laisser la PR ouverte et documenter le blocage. Secrets et
administration du VPS restent hors des contributions. Le déploiement est automatique
depuis `main` ([operations](docs/operations.md#déploiement)).
