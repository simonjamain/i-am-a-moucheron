# File physique des purgatoires

Les PNJ réservent des positions espacées au centre. Un joueur réserve l’espace
en s’y tenant réellement ; aucun ticket ne lui accorde de priorité abstraite au
guichet. Un PNJ déplacé conserve sa place et la rejoint par les allées latérales.
Il attend derrière les joueurs et ne riposte jamais.

Le service de Saint-Pierre exige une seconde et demie à son guichet (les PNJ, deux fois plus vite qu'avant). Le client hôte
simule les PNJ lorsqu’un joueur est présent ; sinon le serveur Node les avance à son tick de maintenance. Les déplacements restent côté client, sans correction imposée au
corps du joueur. Une âme libérée n’est jamais réintroduite par un ancien rapport.

Les PNJ sont les vrais modèles des insectes tués, mis à l'échelle de l'âme.

Code : `src/purgatory-queue.ts` (`PURGATORY_RULES`, `advancePurgatory`) ajoute ces
règles au moteur de marche commun `src/walk-arena.ts` ; la file respecte toujours
l’ordre d’arrivée (un joueur ne double pas un insecte arrivé avant lui).

## File VIP (coupe-file payant)

Une âme de joueur apparaît à l’entrée (`SOUL_ENTRANCE`), près du canapé côté VIP, d'où
l'on voit les deux files (sans traverser celle des insectes) ; un joueur qui descend
d'un appareil sur le nuage apparaît là où il en est sorti. La file
des insectes reste gratuite : on peut s’y placer, notamment quand elle est vide. À sa
droite, une **file VIP** bordée de cordons (`VIP_LANE`) mène au second guichet de
Saint Pierre (`VIP_DESK`). Un cordon doré la ferme ; un vigile (`VIP_GUARD`) se tient
à côté. Un clic sur lui, entouré de bleu quand on le vise à portée,
ouvre un petit contrat papier, le coupe-file (`src/vip-pass-ui.ts`,
signature seule, aucune case) : il coûte **le numéro de la vague en dollars** (vague 1 :
1 $, vague 3 : 3 $ ; `vipPrice`), prélevés une fois sur la caisse commune. Le serveur
(`vip-pass`) refuse si la caisse ne peut pas payer ; un second paiement est sans effet.

Une âme qui a payé (`vip` sur son corps) traverse le cordon doré, seul obstacle réservé
aux non-payants. Au second guichet, Saint Pierre finit l’insecte en cours
(`served > 0`), puis sert l’âme VIP avant les insectes, qui attendent pendant qu’elle
signe ses trois documents. Saint Pierre se déplace derrière le comptoir vers le
guichet qu’il sert.
`test-purgatory-vip.mjs` vérifie le cordon, la priorité, le prix, le refus et la
signature au guichet VIP.

Les coups, gardes, esquives de combat, KO et le pistolet sont supprimés : l'âme est
le personnage du bureau, mêmes modèle et animations, sans arme. Un PNJ est libéré
(avec une seule récompense) quand Saint Pierre l'a servi. Les collisions et la marche
restent actives. Aucun panneau d'interface : le décor (vigile, cordons, guichets,
plaques et pupitre) indique quoi faire, avec la ligne des commandes en bas d'écran.
Saint Pierre et le vigile peuvent être tués depuis le ciel (10 000 points de vie,
[ciel du purgatoire](purgatory-sky.md)) : leur âme rejoint alors la file. Vigile mort,
le guichet VIP et le coupe-file sont fermés (`vipClosed`) ; Saint Pierre mort, personne
n'est servi ni ne signe (`saintDown`, `deskOccupant` rend null).
Le décor lui-même (nuage, ciel, mobilier, vigile) est décrit dans
[décor du purgatoire](purgatory-scene.md) ; il n'ajoute aucun obstacle partagé.

Il n’y a qu’un purgatoire : y mourir renvoie l’âme en fin de file.
Voir [combat et mondes](combat-worlds.md) et [gameplay](gameplay.md).
`test-purgatory-queue.mjs` vérifie la file de douze PNJ, le démêlage d’un ancien
attroupement, l’attente derrière le signataire et le retour à la place après
bousculade. Les tests de combat sont dans `test-backlog.mjs`.

Les joueurs morts ne rejoignent la file qu’après le [passage au purgatoire](multiplayer-return.md#mort-et-passage-au-purgatoire).
L’observation ne réserve aucune place ni corps au guichet.
