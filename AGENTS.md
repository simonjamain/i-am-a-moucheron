# Travail sur i am a moucheron

## Contexte utile

Le dépôt GitHub est la référence ; développer dans une branche dédiée et livrer
une pull request. Lire [README](README.md) (index des documents par thème), puis les
documents liés à la tâche : [gameplay](docs/gameplay.md) pour les règles,
[carte du code](docs/code-structure.md) pour trouver les modules,
[walking-network](docs/walking-network.md) pour le réseau ou la physique partagée,
[economy-physics](docs/economy-physics.md) pour achats, signatures et balistique,
[operations](docs/operations.md) pour les vérifications.
Lire [CONTRIBUTING](CONTRIBUTING.md) avant de prendre une tâche ou préparer une PR.
Les tâches ouvertes sont les issues GitHub ; l'historique est dans Git. Pour
reprendre une tâche interrompue, lire sa note dans `docs/tasks/`, la discussion
GitHub et le diff, et vérifier les affirmations contre la branche. En cas d'écart
entre un document et le code, le code fait foi : corriger le document.

## Confiance envers les joueurs

Règle pérenne : **on fait confiance aux clients**. C'est un jeu coopératif sans enjeu ; ne jamais
écrire ni conserver de code qui détecte, empêche ou limite la triche (butées ou cadences imposées
par le serveur, plafonds de dégâts, contrôles de plausibilité de position ou de vitesse). Le serveur
garde seulement les règles de jeu partagées, la robustesse des entrées (types, nombres finis,
idempotence) et la protection de la salle. Détail : [confiance envers les clients](docs/trust-model.md).

## Boucle de travail

1. Définir le résultat observable et le périmètre depuis la demande. Reproduire
   un bug avant correction quand possible ; consigner une reproduction impossible.
   Repérer les systèmes touchés et les contributions susceptibles d'interagir.
2. Implémenter par étapes ciblées. Après chaque étape significative, exécuter le
   contrôle pertinent, lire son résultat et corriger la cause d'un échec.
   Choisir les tests selon le risque ; pour un bug reproductible automatiquement,
   ajouter une régression qui échoue avant correction. Préserver la portée des
   contrôles : un test rouge se diagnostique, ses attentes ne sont pas affaiblies
   pour rendre le changement vert.
3. Après plusieurs tentatives sans progrès, revenir à la reproduction et aux
   observations ; changer d'hypothèse ou documenter le blocage. Continuer les
   tâches indépendantes du périmètre autorisé.
4. Relire le diff final contre la demande : régressions, interactions réseau,
   code généré, secrets, changements hors périmètre. Vérifier les commandes utiles
   de `package.json` et suivre les contrôles de `docs/operations.md`.
5. Livrer les preuves et limites dans la PR. Une compilation, un aperçu HUD ou un
   test local ne prouve pas une partie WebGL/UDP/WAN ni le confort du pilotage.
   Une optimisation demande un scénario et des mesures comparables avant/après.

## TypeScript et contrôles rapides

Tout nouveau module s'écrit en TypeScript ; migrer un module existant avec
`npm run ts:migrate -- src/<module>.js` (candidats prêts : `npm run ts:migrate -- --leaves`),
puis le typer jusqu'à ce que `npm run typecheck` passe. Règles (syntaxe effaçable, imports `.ts`, Three.js typé) : [TypeScript](docs/typescript.md). Pour itérer, cibler la suite :
`npm test -- <fragment>` (ex. `npm test -- castor`), `--bail` pour s'arrêter au
premier échec, `--list` pour la liste ; la suite complète reste due avant livraison.
Un nouveau script `scripts/test-*.mjs` s'ajoute à `scripts/suite.mjs`
(`test-suite-wiring.mjs` le vérifie). Pour une
nouvelle espèce ou un nouveau véhicule, suivre [ajouter du contenu](docs/adding-content.md).

## Contexte persistant et documentation

Mettre à jour, dans la même PR, les références dont le comportement change ;
conserver une référence détaillée par sujet, avec des liens ailleurs. Pour une
évolution de stack, d'autorité réseau ou de boucle de jeu, revoir aussi README,
gameplay et carte du code. Vérifier les documents concernés et leurs liens avec
`npm run check:docs`. Une nouvelle page de `docs/` s'ajoute au menu de `mkdocs.yml` :
le [site de documentation](docs/site.md) publié sur GitHub Pages en est généré et son
contrôle `Docs site` échoue sur une page hors menu ou un lien cassé. Réserver l'audit
global à une tâche documentaire explicite.

Pour un travail long, interrompu ou à transmettre, maintenir une note par tâche
selon [le modèle de reprise](docs/tasks/README.md). Y conserver l'état actuel,
les preuves et la prochaine action ; reporter les décisions durables dans leur
référence métier. Git garde l'historique. Les tâches courtes terminées dans une
session peuvent se contenter de leur PR ; aucun journal central à alimenter.

## Livraison et autonomie

Traiter le périmètre autorisé jusqu'à une livraison vérifiée ; choisir les détails
courants selon les conventions et consigner les hypothèses utiles. Demander une
précision seulement si une décision ou un accès indispensable manque.
Une tâche a un responsable ; plusieurs tâches peuvent avancer en parallèle.
L'auteur maintient sa branche et résout ses conflits jusqu'à la fusion ; après
intégration de changements concurrents, refaire les contrôles concernés et
signaler les essais humains à renouveler.

**Fusion autonome.** L'agent auteur fusionne lui-même sa PR, sans revue manuelle
préalable ni nouvelle demande de l'utilisateur, dès que la contribution est
terminée : diff relu, critères d'acceptation vérifiés, aucun conflit, aucun essai
ou relecture en attente. Il active alors l'**auto-merge** GitHub en **squash**
(`enable_pr_auto_merge` avec `SQUASH`) ; GitHub fusionne quand les contrôles requis
de `main` passent (dont `Docker build`). Si GitHub répond que la PR est déjà
fusionnable, fusionner directement en squash. Rester responsable jusqu'à la fusion
effective : corriger un contrôle rouge ou un conflit, puis vérifier `main` et la
fermeture des issues liées. Ne jamais contourner une protection ni déclarer réussi
un essai non exécuté : en cas d'échec, de contrôle absent, de conflit ou de
permission insuffisante, laisser la PR ouverte, documenter le blocage et le signaler.

**Déploiement.** La livraison est la PR fusionnée : chaque commit sur `main` publie
l'image `latest` sur GHCR (`docker.yml`), récupérée périodiquement par un
environnement extérieur au dépôt qui la déploie sur le VPS. Pas d'autre cible ni
d'environnement temporaire par PR (voir CONTRIBUTING) ; garder secrets et
administration du VPS hors des contributions. Avant toute livraison, et de nouveau
après les dernières modifications ou une synchronisation, construire l'image selon
[le guide Docker](docs/docker.md) et consigner commande, résultat et commit testé
dans la PR ; si Docker est indisponible, le signaler et attendre le contrôle
`Docker build`.

## Direction artistique et interface

Toute contribution visible (modèle, décor, effet, son, texte, menu, HUD) suit la
[direction artistique](docs/art-direction.md) et les [règles d'interface](docs/ui-guidelines.md) :
le monde et le son informent avant le HUD, les menus sont des documents qui sortent
du monde, aucune couleur ou taille nouvelle écrite en dur hors des jetons visuels.
Justifier toute exception dans la PR.

## Nouveautés visibles par les joueurs

Tenir `src/changelog.ts` à jour **dans la même PR** pour chaque fonctionnalité ou
correction perceptible en jeu. Ajouter une entrée pour le nouveau numéro de
`VERSION` (ou regrouper les nouveautés de ce numéro), dans l'ordre décroissant.
Écrire une ou deux phrases très courtes en français courant, sans vocabulaire
technique : expliquer **ce qui change pour le joueur**, pas les fichiers, tests,
performances internes ou CI. Ne rien ajouter pour une contribution uniquement
technique. Ne pas inventer de version historique ni annoncer une fonctionnalité
non livrée. Le bouton « Nouveautés » est accessible dans l'accueil et en partie ;
`npm test` vérifie le format et le rendu de l'historique.

## Version

`VERSION` reste la référence entière du jeu. Avant chaque commit, y compris
documentaire, augmenter sa valeur ; après synchronisation, utiliser un numéro
supérieur à la dernière version intégrée. Utiliser `npm run version:next` et
`npm run check:version` selon leurs options et vérifier les assets assemblés.
Cette convention reste en vigueur en attendant une évolution dédiée du
versionnement pour les branches parallèles.

## Nouveaux assets Meshy — outil 3D

Règle pérenne pour tout nouveau modèle Meshy (détails et checklist dans
[le pipeline d'assets](docs/asset-pipeline.md#règle-pour-tout-nouveau-modèle-meshy)) :

1. proposer des visuels conformes à la [direction artistique](docs/art-direction.md) et obtenir la
   **validation de l'utilisateur avant toute génération** ;
2. une image de référence isolée, aux vues adaptées, par pièce mobile — jamais une
   planche entière envoyée comme une seule pièce ;
3. générer séparément roues, rotor, tourelle, canon et autres articulations ;
   documenter pivots, axes et dimensions ;
4. conserver UV, textures et sources, puis vérifier rendu, pièces mobiles,
   intégration et performances avant adoption.

Pour chaque nouvel asset Meshy, consulter [le pipeline d'assets](docs/asset-pipeline.md)
et utiliser l'image Docker d'optimisation avant import quand une réduction sûre
est possible. Conserver la source approuvée, les UV/textures, les pièces mobiles,
la provenance SHA-256 et les mesures avant/après ; ne jamais simplifier aveuglément
un GLB monobloc contenant des articulations. Un échec de simplification ne bloque
pas l'intégration de l'original après justification. Tester visuellement les
pièces mobiles avant adoption d'une variante.
