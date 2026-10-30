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

Avant de clôturer chaque lot du backlog, inventorier tous les Markdown suivis et
vérifier leur cohérence avec le code livré : stack, démarrage, architecture,
fonctionnalités, commandes, état des tâches et liens. Corriger les informations
erronées et règles remplacées ; identifier les archives historiques. Vérifier que
README, gameplay et carte du code donnent un parcours de reprise court et à jour.
Consigner dans le suivi du lot les documents corrigés et les limites restantes ;
exécuter aussi `npm run check:docs` pour les liens locaux. La livraison est
complète lorsque cette revue documentaire est effectuée.

## Exécution du backlog

Quand l’utilisateur demande de traiter le backlog, prendre en charge toutes les
tâches prêtes du périmètre demandé, dans l’ordre des dépendances et priorités,
jusqu’à leur livraison vérifiée. Les décisions de conception consignées sont
validées : passer directement à l’implémentation, aux contrôles et à la livraison,
sans nouvelle étape de confirmation des maquettes ou résultats intermédiaires.
Choisir les détails non spécifiés selon les conventions du jeu et documenter les
hypothèses et arbitrages dans le suivi de tâche.

Découper les tâches et produire des releases intermédiaires cohérentes est
autorisé. Fournir au fil des releases un ZIP des sources déployables, les consignes
nécessaires, les contrôles exécutés et les limites connues, pour permettre à
l’utilisateur de déployer avant la fin du lot. Continuer automatiquement sur le
reste du lot après chaque livraison, sans attendre de retour. Une image Docker
n’est à produire que sur demande explicite. Ces livraisons ne provisionnent ni ne
déploient un serveur externe à la place de l’utilisateur.

Les mises à jour de progression informent sans demander d’accord pour continuer.
En cas de blocage réel, chercher une solution dans le périmètre autorisé, consigner
le blocage et poursuivre les tâches indépendantes. Solliciter l’utilisateur
uniquement lorsqu’une information ou un accès indispensable reste introuvable,
ou qu’une action exige une autorisation qui n’a pas été donnée ; les contrôles
d’autorisation natifs restent applicables. Ne pas déclarer le lot terminé tant
que des tâches restent incomplètes : donner leur état précis et la reprise utile.

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


## Version à chaque commit

La valeur entière dans `VERSION` est la référence unique du numéro de jeu.
Cette règle entre en vigueur avec la version 36. Avant chaque commit suivant,
y compris documentaire, augmenter cette valeur de 1 dans le même commit.
Après synchronisation ou fusion, utiliser un numéro supérieur à la dernière
version intégrée et vérifier l'incrément avant de pousser. L'affichage, les assets
assemblés et les livraisons doivent reprendre cette valeur ; VER-01 dans
`BACKLOG.md` suit l'ajout de l'affichage et du contrôle automatique.
