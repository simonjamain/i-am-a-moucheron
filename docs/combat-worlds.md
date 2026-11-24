# Combat, PV et sièges

Règles serveur des dégâts déclarés, des vies et des échanges de poste. Les clients
gardent l’autorité sur leurs mouvements et sur les impacts qu’ils déclarent ; le serveur
Node applique les règles partagées en RAM ([confiance](trust-model.md)).

## Dégâts

- PV des espèces : [bestiaire](enemy-bestiary.md) (`ENEMY_TYPES`, `src/waves.ts`). Un
  joueur a 100 PV ; les PV d’un véhicule (`vehicleMaxHP`, 100 par défaut) sont
  indépendants des PV personnels et détruire le véhicule tue ses occupants.
- Une balle de mitrailleuse inflige 75 dégâts (`src/projectiles.ts`). Personne n’a d’arme
  à pied : le serveur ignore un impact (`hit`, `friendly-hit`) déclaré par un joueur à
  pied, au bureau comme au purgatoire.
- Obus de DCA (`src/combat.ts`) : au contact direct, 200 dégâts à sa seule cible puis il
  disparaît (`shellImpact`) ; sinon sa fusée programmée explose, 80 dégâts au centre,
  décroissance linéaire jusqu’à 20 au bord inclus, zéro au-delà (`blastDamage`). Les
  obstacles masquent le souffle ; un projectile supprimé ne déclenche aucun second
  impact.
- Projectiles, balistique et effets : [projectiles](projectiles.md).

## Vies et idempotence

Chaque impact est appliqué une fois grâce à une clé (`once`) qui inclut tireur, cible,
tir et **incarnation** de la cible. Une mort (`kill`) n’est acceptée que pour
l’incarnation courante, puis l’incrémente : un retry ne peut pas tuer ni réinitialiser
la vie suivante. Les snapshots exposent PV et incarnation de chaque joueur.

Mourir mène au purgatoire ([la mort, un passage](purgatory-sky.md#la-mort-un-passage)) ;
y mourir renvoie l’âme à l’entrée de la file. Dans le ciel de Saint Pierre, les tirs
touchent âmes d’insectes, Saint Pierre et le vigile (`purgatory-hit`) : voir
[tirer dans le ciel](purgatory-sky.md#tirer-dans-le-ciel). Une âme d’insecte est libérée
une seule fois, par le service ou par un tir, et rapporte la puissance de son espèce
([économie](economy.md#revenus)). Dégâts de chute et retour au lit :
[retours terrain](field-update.md).

## Échanges de poste

Un occupant peut demander un autre poste de son appareil (`seat-request`) ; la demande
mémorise demandeur, destinataire éventuel, les deux postes et l’état (`signing`,
`offered`, `completed`, `cancelled`). Le demandeur signe, puis l’occupant du poste visé
s’il y en a un (`seat-sign`) ; `seat-reject` annule. Le transfert revérifie que les
postes d’origine sont toujours tenus par les mêmes joueurs avant de réattribuer les
sièges. Une demande est annulée après deux minutes, ou dès qu’un des joueurs meurt ou
quitte son poste. Un joueur n’a qu’une demande en cours.

Les appareils vides sont simulés par le serveur (`src/parked-host.ts`).

## Son des gains

Le son de gain suit `rewardCount`, distinct du solde dépensable. `RewardQueue`
(`src/rewards.ts`) prend une base au chargement, ignore les compteurs qui reculent et
joue une note de machine à sous par dollar, espacées de 290 ms, sans superposition.
Volume, muet et activation audio du navigateur restent applicables.

## Vérifier

- `scripts/test-backlog.mjs` : PV des espèces, échelle des dégâts, classification des
  obus (contact, distance de sécurité, obstacle).
- `scripts/test-ram-game.mjs`, `scripts/test-b3-crew.mjs` : échanges de poste côté
  serveur.
- `scripts/test-seat-contracts.mjs` : séquence sonore des gains, variantes de documents.
- `scripts/test-purgatory-sky.mjs` : tirs dans le ciel du purgatoire.

Le ressenti du tir et l’écoute multijoueur restent à confirmer sur des appareils réels.
