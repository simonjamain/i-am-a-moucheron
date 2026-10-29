# File physique des purgatoires

Les PNJ réservent des positions espacées au centre. Un joueur réserve l’espace
en s’y tenant réellement ; aucun ticket ne lui accorde de priorité abstraite au
guichet. Un PNJ déplacé conserve sa place et la rejoint par les allées latérales.
Il attend derrière les joueurs et ne riposte jamais.

Le service de Saint-Pierre exige trois secondes à son guichet. Le client hôte
simule les PNJ lorsqu’un joueur est présent ; sinon le serveur Node les avance à son tick de maintenance (le Worker historique
les avançait lors des requêtes). Les déplacements restent côté client, sans correction imposée au
corps du joueur. Une âme libérée n’est jamais réintroduite par un ancien rapport.

Les coups, gardes, esquives de combat et KO sont supprimés. Le pistolet utilise
de vrais PV persistants, sans récupération automatique ; tuer un PNJ le libère
avec une seule récompense. Les collisions et la marche restent actives.

Le super purgatoire est une arène séparée, sans PNJ, avec cinq contrats.
Voir [combat et mondes](combat-worlds.md) et [gameplay](gameplay.md).
`test-purgatory-queue.mjs` vérifie la file de douze PNJ, le démêlage d’un ancien
attroupement, l’attente derrière le signataire et le retour à la place après
bousculade. Les tests de combat sont dans `test-backlog.mjs`.
