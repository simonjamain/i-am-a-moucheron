# Contribuer au jeu

Règles de travail des agents : [AGENTS](AGENTS.md). Contrôles à exécuter :
[operations](docs/operations.md).

## Prendre une tâche

Les issues GitHub sont le seul suivi des tâches : y proposer idées et bugs avec
comportement attendu, reproduction ou critères d'acceptation, après avoir cherché
les doublons et les PR en cours.

Annoncer sa prise en charge dans l'issue et ouvrir une branche par contribution.
Si une autre tâche ou PR touche les mêmes systèmes, convenir d'un ordre ou d'une
interface commune ; les contributions indépendantes avancent en parallèle.
Discuter en amont une évolution du protocole réseau, de l'autorité physique ou une
refonte transversale. Pour interrompre ou transmettre un travail, suivre
[les notes de reprise](docs/tasks/README.md).

## Préparer la PR

Garder une PR ciblée, testable, avec les références mises à jour. Renseigner le
modèle de PR : commit testé, commandes et résultats, build Docker, limites, scénario
d'essai en jeu. Pour le pilotage, le rendu, les interactions ou le réseau, prévoir un
essai réel en jeu ; un contrôle automatisé ne valide pas les sensations. Un essai
humain impossible est décrit comme tel, jamais présenté comme exécuté.

Clôturer les issues : écrire `Closes #123` dans la description (un mot-clé par issue) ;
pour une contribution partielle, `Refs #123` et les critères restants dans l'issue
([liens PR–issue](https://docs.github.com/fr/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue)).

## Vérifier et fusionner

La fusion est autonome : l'agent auteur fusionne sa PR sans validation manuelle
préalable de l'utilisateur.

1. Relire le diff contre les critères d'acceptation ; constater les contrôles
   requis réussis sur le dernier commit, `Docker build` compris, et l'absence de
   conflit.
2. Activer l'**auto-merge** en **squash** (`enable_pr_auto_merge`, `SQUASH`) : GitHub
   fusionne dès que les contrôles requis de `main` passent. Si GitHub répond que la
   PR est déjà fusionnable, la fusionner directement en squash. Ne pas activer
   l'auto-merge tant qu'un essai, un contrôle ou une relecture reste à faire.
3. Rester responsable jusqu'à la fusion effective : corriger un contrôle rouge ;
   après une mise à jour depuis `main`, relancer les contrôles concernés et
   renouveler l'essai en jeu si le comportement testé change.
4. Après fusion, vérifier `main` et la fermeture des issues livrées (les fermer comme
   terminées sinon, en citant la PR).

**Conflits.** Quand une autre PR fusionne avant la vôtre, le workflow `Conflict alert`
pose le label `conflit` et commente la PR (aussi visible par `mergeable_state: dirty`) :
intégrer `origin/main`, résoudre, relancer les contrôles et pousser sans attendre.
Version et nouveautés ne provoquent pas de conflit ([détail](docs/changelog.md)).

**Blocage.** Contrôle rouge ou absent, conflit non résolu, permission insuffisante :
laisser la PR ouverte, documenter précisément le blocage et le signaler. Ne jamais
contourner les protections ni les permissions GitHub. Il n'existe pas d'autre circuit
de validation que GitHub.

## Environnements temporaires : non configurés

Aucun workflow ne déploie encore d'environnement par PR : indiquer « indisponible »
dans la PR et donner une procédure locale. Cible retenue : un environnement isolé par
PR, construit par GitHub Actions (HTTPS, WebRTC, plage UDP propre, nettoyage à la
fermeture), sans exposer les secrets de déploiement aux contributions externes. La
production suit l'image `latest` publiée depuis `main` ([déploiement](docs/operations.md#déploiement)).
