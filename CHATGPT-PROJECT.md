# Accueil du projet ChatGPT — I am a moucheron

Ce projet développe « I am a moucheron — Flight Lab », un jeu coopératif de combat
aérien miniature dans un bureau. Son identité associe pilotage, combat d’insectes
et paperasse à signer à la souris ou au toucher, pour accéder aux équipements et
quitter le purgatoire de Saint Pierre.

## Reprendre dans un autre chat

Le dépôt courant est https://github.com/simonjamain/i-am-a-moucheron.
Lire `AGENTS.md`, `README.md` et `CONTRIBUTING.md`, puis les références utiles
à la tâche. Pour reprendre un travail interrompu, consulter sa note dans
`docs/tasks/`, la PR et le diff actuel.

Le Site historique `appgprj_6ae1e591360481919010bdf89f8da3f0` reste accessible
via Sites pour une intervention explicite sur ce backend. Le développement
courant ne nécessite pas Sites. Une pièce jointe ChatGPT est une copie : vérifier
sa fraîcheur contre le dépôt. Signaler une source inaccessible sans inventer son état.

## Repères techniques

JavaScript ESM, Three.js embarqué, géométries procédurales et Web Audio spatialisé.
Le runtime actuel est Node, en RAM uniquement. Tous les événements de jeu passent
par WebRTC sur UDP : mouvements sans retransmission, commandes importantes fiables.
HTTP sert les fichiers et la négociation ; aucun repli WebSocket/TCP/HTTP de gameplay.
Le Worker/D1 Sites est un backend historique distinct, toujours publié tant que
le serveur Node n’est pas déployé sur la VM de l’utilisateur. Les contributions sont livrées en PR ; ZIP et images Docker dépendent de la
livraison demandée.
La physique reste coopérative côté client, avec règles et transactions côté serveur.
Le décor est en mètres ; les modèles miniatures utilisent un ratio centralisé.
La chute du personnage convertit aussi la gravité humaine avec ce ratio (CHU-02). Voir les références
actuelles du dépôt pour les règles exactes, tâches et limites de validation.

## Méthode de travail attendue

Poursuivre les demandes jusqu’à une livraison vérifiée, communiquer en français,
et distinguer ce qui est testé de ce qui reste à observer sur de vrais appareils.
À chaque changement, mettre à jour le document de référence concerné dans la même
livraison. Vérifier les règles utilisées contre le code au début d’une session et
avant publication. Retirer les doublons et règles remplacées ; conserver les
archives clairement identifiées. Vérifier les documents concernés par le changement
et maintenir une note de reprise par tâche lorsque nécessaire. Les règles de
collaboration et l’état des environnements temporaires figurent dans CONTRIBUTING.

Ce fichier peut être joint aux fichiers du projet ChatGPT. Ses sections
« Reprendre dans un autre chat » et « Méthode de travail attendue » peuvent aussi
servir d’instructions du projet. L’ajout à ChatGPT doit être effectué dans son
interface ; une mise à jour du dépôt ne l’attache pas automatiquement.

Consolidation : 30 octobre 2026. Les détails évolutifs et l’état de publication
sont à retrouver dans le dépôt et les outils de déploiement concernés, plutôt qu’à recopier ici.
