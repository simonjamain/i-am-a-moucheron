# Travail sur Flight Lab

Lire `README.md`, puis `docs/gameplay.md` avant une première modification.
Pour le réseau ou la physique partagée, lire aussi `docs/walking-network.md`.
Pour les achats, signatures ou chutes, lire `docs/economy-physics.md`.
Pour publier ou vérifier un résultat, lire `docs/operations.md` et le skill Sites
actuellement disponible. Identifier le Site depuis `.openai/hosting.json`.

## Entretien de la documentation

À chaque changement de comportement, modifier dans la même livraison le document
qui en est responsable et les contrôles concernés. À chaque début de session,
vérifier que les références utilisées correspondent au code actuel. Avant une
publication, revoir les documents touchés et leurs liens pour retirer les règles
remplacées. À chaque évolution de stack, d’autorité réseau ou de boucle de jeu,
revoir aussi README, gameplay et carte du code.

Décrire l’état actuel dans les documents actifs. Conserver les raisons encore
utiles ; Git conserve le détail des changements. Mettre les anciennes descriptions
utiles dans `docs/archive/` avec un avertissement et un lien vers leur remplaçant.
Une règle a une seule référence détaillée ; ailleurs, ajouter un lien. Garder
les instructions de démarrage courtes et les détails accessibles par sujet.

## Livraison

Modifier les sources, assembler les fichiers générés et effectuer les contrôles
adaptés au changement. Pour une modification documentaire, vérifier liens,
cohérence et formatage ; une nouvelle validation complète du gameplay n’est pas
nécessaire si aucun code n’a changé. Pour une évolution fonctionnelle, utiliser
les tests pertinents et le parcours navigateur lorsque disponible.

Séparer dans le compte rendu les vérifications exécutées et leurs limites.
Conserver l’identifiant et l’audience du Site. Ajouter une nouvelle migration pour
toute évolution de schéma déjà publié. Conserver les secrets hors des documents.

Le fichier d’accueil ChatGPT remis à l’utilisateur pointe vers ce dépôt. Le mettre
à jour si l’identité, l’accès aux sources ou le parcours de reprise change ; les
règles détaillées restent dans le dépôt.
