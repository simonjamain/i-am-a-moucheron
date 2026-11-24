# Contribuer au jeu

Les consignes de travail des agents sont dans [AGENTS](AGENTS.md) ; ce document décrit le
parcours d'une contribution sur GitHub, pour les humains comme pour les agents.

## Prendre une tâche

Les issues GitHub sont le seul suivi des tâches. Avant d'en ouvrir une, chercher les
doublons et les PR en cours ; préciser le comportement attendu, la reproduction ou les
critères d'acceptation.

Annoncer sa prise en charge dans l'issue et ouvrir une branche par contribution. Si une
autre tâche touche les mêmes systèmes, convenir d'un ordre ou d'une interface commune ;
les contributions indépendantes avancent en parallèle. Discuter en amont une évolution du
protocole réseau, de l'autorité physique ou une refonte transversale.

Garder une PR ciblée, testable et accompagnée des références mises à jour. Pour
interrompre ou transmettre un travail, suivre [les notes de reprise](docs/tasks/README.md).

## Vérifier et fusionner

1. Exécuter les contrôles décrits dans [operations](docs/operations.md#contrôles-avant-une-pr)
   et relire le diff contre les critères d'acceptation.
2. Renseigner le [modèle de PR](.github/pull_request_template.md) : commit testé,
   commandes et résultats, build Docker, limites, scénario d'essai en jeu.
3. Pour le pilotage, le rendu, les interactions ou le réseau, prévoir un essai réel en
   jeu : un contrôle automatisé ne valide pas les sensations. Un essai impossible est
   décrit honnêtement, jamais présenté comme exécuté.
4. Activer l'**auto-merge en squash** : GitHub fusionne dès que les contrôles requis de
   `main` (dont `Docker build`) passent ; si la PR est déjà fusionnable, la fusionner
   directement en squash. Aucune validation supplémentaire extérieure à GitHub.

L'auteur reste responsable de sa branche jusqu'à la fusion effective. Quand une autre PR
est fusionnée avant, le workflow `Conflict alert` pose le label `conflit` et commente la
PR ; intégrer alors `origin/main` (ou dès que `mergeable_state` vaut `dirty`), résoudre,
relancer les contrôles concernés, renouveler l'essai en jeu si le comportement testé
change, et pousser. Le numéro de version et les nouveautés ne créent pas de conflit
([version et nouveautés](docs/changelog.md)).

Si un contrôle requis échoue, manque, ou si GitHub bloque la fusion, laisser la PR ouverte
et signaler le blocage ; ne jamais contourner les protections ni les permissions.

## Clôturer une issue

Une PR qui termine une issue écrit `Closes #123` dans sa description (un mot-clé par
issue) ; une contribution partielle écrit `Refs #123` et liste dans l'issue les critères
restants. Après fusion, vérifier que chaque issue livrée est fermée, sinon la fermer comme
terminée après contrôle de `main` ([liens PR–issue](https://docs.github.com/fr/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue)).

## Environnements d'essai

Il n'existe pas d'environnement temporaire par PR : indiquer « indisponible » dans la PR
et donner la procédure locale (`npm ci && npm start`). La production suit `main`
automatiquement ([déploiement](docs/operations.md#déploiement)) ; le VPS et ses secrets
sont administrés hors du dépôt par les mainteneurs.
