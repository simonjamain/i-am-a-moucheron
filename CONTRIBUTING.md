# Contribuer au jeu

## Prendre une tâche

Proposer idées et bugs dans les issues GitHub ; préciser le comportement attendu,
la reproduction ou les critères d'acceptation. Les issues GitHub sont le seul
suivi des tâches : chercher les doublons et les PR en cours avant d'en ouvrir une.

Annoncer sa prise en charge dans la discussion de la tâche et ouvrir une branche
par contribution. Vérifier les tâches et PR en cours qui touchent les mêmes
systèmes. En cas d'interaction, convenir d'un ordre ou d'une interface commune.
Les contributions indépendantes continuent en parallèle. Chaque personne utilise
son propre environnement et ses agents, en suivant [AGENTS](AGENTS.md).

## Développer et reprendre

Garder une PR ciblée, testable et accompagnée des références mises à jour.
Discuter en amont une évolution du protocole réseau, de l'autorité physique ou
une refonte transversale. Décrire les hypothèses nécessaires dans la tâche.
Pour interrompre ou transmettre un travail, suivre
[les notes de reprise](docs/tasks/README.md).

## Vérifier et proposer la fusion

Exécuter les contrôles adaptés décrits dans [operations](docs/operations.md),
puis relire le diff contre les critères d'acceptation. Renseigner le modèle de PR :
commandes et résultats, limites, scénario à tester et état de l'environnement.
Pour le pilotage, le rendu, les interactions ou le réseau, prévoir un essai réel
en jeu ; un contrôle automatisé ne suffit pas à valider les sensations.

L'auteur est responsable des corrections et de l'adaptation de sa branche jusqu'à
la fusion. Après une mise à jour depuis `main` ou une résolution de conflit,
relancer les contrôles concernés ; si le comportement testé change, renouveler
l'essai en jeu. Identifier le commit testé pour éviter une validation périmée.
La fusion est autonome : l'auteur (humain ou agent) fusionne sa PR en squash, sans
validation manuelle préalable, une fois le diff et les critères relus, l'absence de
conflit vérifiée et les contrôles requis réussis sur le dernier commit (dont
`Docker build`). Activer l'auto-merge en squash ; fusionner directement si GitHub
dit la PR déjà fusionnable. Les essais humains non réalisés sont décrits comme tels.
Si un contrôle requis échoue ou manque, ou si GitHub bloque, laisser la PR ouverte
et signaler le blocage ; ne jamais contourner protections ni permissions. Après
fusion, vérifier `main` et la fermeture des issues.
Il n'y a pas de circuit de validation supplémentaire extérieur à GitHub.

## Clôturer une issue à la fusion

Quand une PR vers `main` termine une issue, écrire `Closes #123` dans la
description de la PR, en remplaçant 123 par son numéro. Pour plusieurs issues,
répéter le mot-clé pour chacune. Pour une contribution partielle, écrire
`Refs #123` et indiquer dans l’issue les critères qui restent à couvrir.

Après la fusion, vérifier sur GitHub que chaque issue livrée est fermée. Si elle
est encore ouverte, la fermer comme terminée après avoir vérifié le contenu de
`main`. Mentionner la PR fusionnée et conserver les limites des essais dans la PR.
Voir la [documentation GitHub sur les liens entre PR et issues](https://docs.github.com/fr/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue).

## Environnements de test

Aucun environnement temporaire par PR n'existe : indiquer « indisponible » dans la PR
et donner une procédure locale. La production suit l'image `latest` publiée sur GHCR
à chaque commit sur `main` ([operations](docs/operations.md#déploiement)). Un futur
environnement par PR devra isoler client, serveur et plages UDP, publier lien et
commit déployé, puis se supprimer à la fermeture, sans exposer de secret aux
contributions externes.
