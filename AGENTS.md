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
GitHub et le diff ; vérifier les affirmations contre l'état de la branche.

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

## Contexte persistant et documentation

Mettre à jour, dans la même PR, les références dont le comportement change ;
conserver une référence détaillée par sujet, avec des liens ailleurs. Pour une
évolution de stack, d'autorité réseau ou de boucle de jeu, revoir aussi README,
gameplay et carte du code. Vérifier les documents concernés et leurs liens avec
`npm run check:docs`. Réserver l'audit global à une tâche documentaire explicite.

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
signaler les essais humains à renouveler. La fusion appartient aux personnes
habilitées sur GitHub ; créer une PR ne vaut pas autorisation de la fusionner.

Les déploiements temporaires relèvent de GitHub Actions, selon l'état décrit dans
CONTRIBUTING. Vérifier le résultat réellement retourné ; signaler un environnement
absent ou en échec. Garder secrets et administration du VPS hors des contributions.
Le runtime Node/UDP et le Site historique Worker/D1 sont distincts : publier le
client Node sur le Worker est incompatible. Sites n'est pas requis pour coder ;
le consulter seulement pour une intervention explicite sur le Site historique,
depuis son ancien dépôt distinct. Ce dépôt ne porte plus de manifeste Sites.
Générer un ZIP uniquement si la livraison demandée le nécessite.
Avant toute livraison de contribution, construire systématiquement l’image Docker
selon [le guide Docker](docs/docker.md), même sans livrer d’image. Après les
dernières modifications ou une synchronisation, refaire ce build et consigner
commande, résultat et commit testé dans la PR. Si Docker est indisponible, le
signaler et vérifier le contrôle GitHub Actions `Docker build` avant la fusion.

## Version

`VERSION` reste la référence entière du jeu. Avant chaque commit, y compris
documentaire, augmenter sa valeur ; après synchronisation, utiliser un numéro
supérieur à la dernière version intégrée. Utiliser `npm run version:next` et
`npm run check:version` selon leurs options et vérifier les assets assemblés.
Cette convention reste en vigueur en attendant une évolution dédiée du
versionnement pour les branches parallèles.
