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
  Les âmes d’insectes sont les modèles des insectes tués, à l’échelle de l’âme ; **toutes**
  sont montrées, la file peut dépasser le bord du nuage et se prolonger dans le ciel.
  Seules les premières places (48) sont animées, les suivantes restent immobiles.
- Les places des insectes sont une **formule** (`queueTargets`, `placeSouls`) : dans
  l'ordre d'arrivée (ticket puis identifiant), une place tous les `QUEUE_SPACING` au centre
  depuis le guichet, en sautant la place d'un joueur qui s'y tient réellement, sans ticket
  abstrait. Une âme d'insecte (`fixed`) ne marche pas, ne contourne rien, ne détecte aucun
  obstacle, n'entre en collision avec aucune autre âme et n'est jamais poussée ; seul le
  joueur est arrêté par elle. La file respecte l'ordre d'arrivée : un joueur ne double
  pas un insecte arrivé avant lui. Les insectes ne ripostent jamais.
- Sur le réseau, les âmes d'insectes voyagent en courtes lignes (`queue` de l'arène,
  `queueView` / `expandQueue`) : chaque client en retrouve le corps et la place par la formule.
- Saint Pierre met 1,5 s à servir un insecte (`INSECT_SERVICE_MS`) ; l’âme servie est
  libérée et rapporte une fois sa récompense ([économie](economy.md#revenus)). Une âme
  libérée n’est jamais réintroduite par un ancien rapport.
- Autorité : quand un joueur est au purgatoire, le client de l'âme de joueur au plus
  petit identifiant (`host`) simule les insectes ; sinon le serveur les avance lui-même. Les déplacements des
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

- `scripts/test-purgatory-queue.mjs` : file de douze insectes, attroupement remis en
  place, attente derrière le signataire, mille âmes placées par la formule sans se
  chevaucher, place faite à un joueur.
- `scripts/test-purgatory-vip.mjs` : cordon, priorité, prix, refus, signature au guichet
  VIP, porte-bloc utilisable selon le guichet.
- `scripts/test-walk-worlds.mjs` : marche commune au bureau et au purgatoire.
