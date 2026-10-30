# Contribuer au jeu

## Prendre une tâche

Proposer idées et bugs dans les issues GitHub ; préciser le comportement attendu,
la reproduction ou les critères d'acceptation. Le [backlog](BACKLOG.md) contient
les tâches existantes : le consulter pour éviter les doublons. Lier issue et
entrée de backlog lorsque les deux existent, sans recopier leurs états partout.

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
La personne ayant les droits de fusion décide de l'intégration avec les résultats
des contrôles et les retours des joueurs. Il n'y a pas de circuit de validation
supplémentaire extérieur à GitHub.

## Environnements temporaires : cible à configurer

Le dépôt ne fournit pas encore de workflow de déploiement temporaire. Jusqu'à
sa mise en place, indiquer « indisponible » et donner une procédure locale ;
ne pas annoncer un lien de test automatique.

Le fonctionnement retenu est un environnement par PR, construit et mis à jour
par GitHub Actions, avec client et serveur isolés des autres PR et de la
production. La pipeline publiera le lien et le commit déployé, puis supprimera
l'environnement à la fermeture de la PR. Prévoir HTTPS, négociation WebRTC,
allocation de plages UDP distinctes, limites de ressources et nettoyage des
échecs. Le mécanisme devra gérer les contributions externes sans leur exposer
les secrets de déploiement ni un accès d'administration au VPS.

Les agents consultent les résultats de la pipeline ; l'infrastructure est
configurée une fois par les mainteneurs. Le déploiement sur VPS et ses secrets
restent à configurer séparément. Le Site Worker/D1 historique ne permet pas de
valider le runtime Node/UDP.

## Sources de la méthode

Ces recommandations sont adaptées au projet ; elles ne constituent pas une
mesure comparative des agents ou une garantie de correction.

- [Claude Code : bonnes pratiques](https://code.claude.com/docs/en/best-practices) :
  instructions courtes, procédures à la demande et vérifications exécutables.
- [Anthropic : agents sur plusieurs sessions](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) :
  progression incrémentale, notes de reprise et essais de bout en bout.

Consultées le 30 octobre 2026. Les notes séparées par tâche et le parcours de PR
sont des choix de ce projet pour permettre les contributions parallèles.
