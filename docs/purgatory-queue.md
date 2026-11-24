# File du purgatoire

Règles de la file d’âmes devant Saint Pierre, du guichet et de la file VIP. Code :
`src/purgatory-queue.ts` (`PURGATORY_RULES`, `advancePurgatory`), sur le moteur de marche
commun `src/walk-arena.ts` ; serveur : `arena`, `sign`, `vipPass` dans `server/game.js`.
Le décor est décrit dans [décor du purgatoire](purgatory-scene.md), le ciel autour, la mort
et les tirs dans [ciel du purgatoire](purgatory-sky.md).

## Âmes et file

- Il n’y a qu’un purgatoire. Un joueur mort y arrive après le
  [passage](purgatory-sky.md#la-mort-un-passage) ; y mourir renvoie l’âme à l’entrée.
- L’âme d’un joueur est le personnage du bureau, mêmes modèle et animations, sans arme.
  Les âmes d’insectes sont les modèles des insectes tués, à l’échelle de l’âme ; la file
  en montre au plus 24 à la fois.
- Les insectes réservent des places espacées (`QUEUE_SPACING`) au centre ; un joueur
  réserve l’espace en s’y tenant réellement, sans ticket abstrait. La file respecte
  l’ordre d’arrivée : un joueur ne double pas un insecte arrivé avant lui. Un insecte
  bousculé garde sa place et la rejoint par les allées latérales ; il ne riposte jamais.
- Saint Pierre met 1,5 s à servir un insecte (`INSECT_SERVICE_MS`) ; l’âme servie est
  libérée et rapporte une fois sa récompense ([économie](economy.md#revenus)). Une âme
  libérée n’est jamais réintroduite par un ancien rapport.
- Autorité : quand un joueur est au purgatoire, le client du premier joueur (`host`)
  simule les insectes ; sinon le serveur les avance lui-même. Les déplacements des
  joueurs restent côté client, sans correction imposée.
- La marche est bornée à un rectangle (x de −10 à 10, z de 0 à au moins 80) ; le décor
  n’ajoute aucun obstacle partagé hormis les cordons VIP (`VIP_LANE`).

## Guichet principal

Un joueur est au guichet dès qu’il est à portée du porte-bloc du bureau de Saint Pierre
(`nearDeskClipboard`, `PURGATORY_REACH`), d’où qu’il vienne ; il attend seulement les
insectes arrivés avant lui (`deskOccupant`). Seul le clic sur le porte-bloc ouvre les
**trois** formulaires, signés dans l’ordre ; le serveur exige d’être servi au guichet
(`sign`). Au dernier, le joueur revit au bureau, à son lit s’il en a un, sinon à la base.
Comportement du porte-bloc : [décor](purgatory-scene.md#le-porte-bloc-du-guichet).

## File VIP (coupe-file payant)

Une âme de joueur apparaît près du canapé côté VIP (`SOUL_ENTRANCE`), d’où l’on voit les
deux files ; un joueur qui descend d’un appareil posé sur le nuage apparaît là où il en
est sorti. La file des insectes reste gratuite.

- À sa droite, une file bordée de cordons (`VIP_LANE`) mène au second guichet
  (`VIP_DESK`), fermée par un cordon doré ; un vigile (`VIP_GUARD`) se tient à côté.
- Viser le vigile à portée (`nearVipGuard`) l’entoure du bleu signal ; un clic ouvre le
  coupe-file (`src/vip-pass-ui.ts`, signature seule). Il coûte **le numéro de la vague
  en dollars** (`vipPrice`), prélevé une fois sur la caisse commune ; le serveur
  (`vip-pass`) refuse si la caisse ne peut pas payer, un second paiement est sans effet.
- Une âme qui a payé (`vip`) traverse le cordon doré, seul obstacle réservé aux
  non-payants. Dans la moitié avant de la file VIP (`VIP_ZONE`, `inVipDesk`), elle est
  servie : Saint Pierre finit l’insecte en cours (`served > 0`), vient au guichet VIP en
  face d’elle (`saintWindowX`), puis la sert avant les insectes.
- Personnel tué depuis le ciel ([ciel](purgatory-sky.md#tirer-dans-le-ciel)) : vigile
  mort, coupe-file et guichet VIP sont fermés (`vipClosed`) ; Saint Pierre mort, personne
  n’est servi ni ne signe (`saintDown`, `deskOccupant` rend null).

Aucun panneau d’interface : vigile, cordons, guichets, porte-blocs et pupitre indiquent
quoi faire, avec la ligne des commandes en bas d’écran.

## Vérifier

- `scripts/test-purgatory-queue.mjs` : file de douze insectes, démêlage d’un
  attroupement, attente derrière le signataire, retour à la place après bousculade.
- `scripts/test-purgatory-vip.mjs` : cordon, priorité, prix, refus, signature au guichet
  VIP, porte-bloc utilisable selon le guichet.
- `scripts/test-walk-worlds.mjs` : marche commune au bureau et au purgatoire.
