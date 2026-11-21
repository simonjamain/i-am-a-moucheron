# Travail sur Flight Lab

## Contexte utile

Le dépôt GitHub est la référence ; développer dans une branche dédiée et livrer
une pull request. Lire [README](README.md), puis les documents liés à la tâche.
Pour le gameplay, lire [gameplay](docs/gameplay.md) ; pour le réseau ou la physique
partagée, [walking-network](docs/walking-network.md) ; pour les achats, signatures
ou chutes, [economy-physics](docs/economy-physics.md). Pour les vérifications et
l'exploitation, lire [operations](docs/operations.md).
Lire [CONTRIBUTING](CONTRIBUTING.md) avant de prendre une tâche ou préparer une PR.
Pour reprendre une tâche interrompue, lire sa note dans `docs/tasks/`, la discussion
GitHub et le diff ; vérifier les affirmations contre l'état de la branche. Les
tâches ouvertes sont les issues GitHub ; il n'y a plus de BACKLOG ni d'archive de
docs (l'historique est dans Git). Les documents de `docs/` décrivant un « lot »
daté peuvent citer des versions dépassées : le code et la référence du thème font foi.

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
L'auteur maintient sa branche et résout ses conflits jusqu'à la fusion. Après
intégration de changements concurrents, refaire les contrôles concernés et
signaler les essais humains à renouveler. Par défaut, l'agent auteur fusionne lui-même sa PR dès qu'il estime la contribution
terminée **et** que les contrôles requis sont réussis. L'utilisateur n'a pas à
redemander la fusion ni à fournir une revue manuelle préalable. Avant toute fusion,
relire le diff, vérifier les critères d'acceptation, les contrôles GitHub Actions
(y compris `Docker build`), l'absence de conflit et les protections de `main`.
Si Docker n'est pas disponible localement, attendre la réussite du contrôle
`Docker build` de la PR. Utiliser une fusion **squash** lorsque GitHub l'autorise.
Utiliser l'**auto-merge** de GitHub (activé sur le dépôt, contrôles requis sur
`main`) : une fois la contribution terminée, le diff relu et les critères
vérifiés, activer l'auto-merge en squash sur la PR (`enable_pr_auto_merge` avec
`SQUASH`) au lieu d'attendre les contrôles pour fusionner à la main ; GitHub
fusionne dès que tous les contrôles requis passent. Si GitHub répond que la PR est
déjà fusionnable (statut propre), fusionner directement en squash. Rester
responsable de la PR jusqu'à la fusion effective : corriger un contrôle rouge ou
un conflit, puis vérifier que la fusion a eu lieu. Ne pas activer l'auto-merge
tant qu'un essai attendu, un contrôle ou une relecture reste à faire.
Ne jamais contourner une protection ni déclarer réussi un essai non exécuté :
en cas d'échec, de contrôle absent, de conflit ou de permission insuffisante,
laisser la PR ouverte, documenter précisément le blocage et le signaler.
Après fusion, vérifier l'état de `main` et la fermeture des issues liées.

Les déploiements temporaires relèvent de GitHub Actions, selon l'état décrit dans
CONTRIBUTING. Vérifier le résultat réellement retourné ; signaler un environnement
absent ou en échec. Garder secrets et administration du VPS hors des contributions.
Le déploiement est automatique : chaque commit sur `main` publie l'image
`latest` sur GHCR (workflow `docker.yml`), et un environnement extérieur au dépôt
récupère périodiquement la dernière image pour la déployer sur le VPS. Il n'y a
ni ZIP à produire ni autre cible de publication ; la livraison est la PR fusionnée.
Avant toute livraison de contribution, construire systématiquement l’image Docker
selon [le guide Docker](docs/docker.md), même sans livrer d’image. Après les
dernières modifications ou une synchronisation, refaire ce build et consigner
commande, résultat et commit testé dans la PR. Si Docker est indisponible, le
signaler et vérifier le contrôle GitHub Actions `Docker build` avant la fusion.

## Direction artistique et interface

Toute contribution visible (modèle, décor, effet, son, texte, menu, HUD) suit la
[direction artistique](docs/art-direction.md) et les [règles d'interface](docs/ui-guidelines.md) :
le monde et le son informent avant le HUD, les menus sont des documents qui sortent
du monde, aucune couleur ou taille nouvelle écrite en dur hors des jetons visuels.
Justifier toute exception dans la PR.

## Nouveautés visibles par les joueurs

Tenir `src/changelog.js` à jour **dans la même PR** pour chaque fonctionnalité ou
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
