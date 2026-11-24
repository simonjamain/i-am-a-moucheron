# Caisse commune, achats et services

La room a une seule caisse en dollars, tenue en RAM par le serveur Node
(`server/game.js`) : une opération est un tour synchrone de la boucle d’événements, sans
base de données ni état disque ; un redémarrage ou une remise à zéro efface caisse,
achats, équipements et colis. Revenus et prix catalogue :
[progression](progression.md#revenus-et-prix). Le serveur fait confiance aux positions
déclarées par les clients ([confiance](trust-model.md)).

## Revenus

Chaque âme d’insecte libérée (servie par Saint Pierre ou abattue dans son ciel) crédite
une fois la puissance de son espèce (`releaseSoul`, `reward`) ; le passage de l’âme à
l’état `gone` garantit le crédit unique. Sans joueur au purgatoire, le serveur sert
lui-même la file ([file](purgatory-queue.md)). Le compteur `rewardCount`, qui déclenche
le son des gains, est distinct du solde dépensable.

## Acheter : le bon signé

Un achat passe par un bon de commande signé (`purchase-sign`, parcours décrit dans
[achats et pose](gameplay.md#achats-et-pose)) :

- le bon est identifié par sa référence `request` : un retry de la même référence ne
  débite jamais deux fois ;
- le serveur recalcule le prix (`shopPrice` sur `purchaseCount`) et refuse un
  `expectedPrice` périmé avant tout débit, pour que le joueur relise le nouveau tarif ;
  deux achats concurrents ne peuvent pas obtenir le même ancien palier ;
- la caisse doit couvrir le prix ; le débit précède la pose ;
- à pied, la room compte au plus **24** équipements posés ou payés non posés ;
- un bon payé et non posé est remboursé si son acheteur quitte la room.

Signé depuis un véhicule, le bon devient un [colis parachuté](logistics-contracts.md#colis-parachutés),
débité une seule fois quel que soit le poste signataire et hors limite de 24.

## Poser

`supportedPlacement` (`src/equipment.ts`) est le même test côté navigateur et serveur :
appui de toute l’emprise, hauteur libre, à portée (`PLACEMENT_REACH`, 9 m de référence)
d’un marcheur vivant au sol, à l’écart des appareils garés et des autres installations.
Les boîtes de collision viennent du plan actif ([plans](office-layouts.md)) ; sur les
meubles du pack, le serveur accepte la hauteur de surface déclarée par le client si elle
tombe dans la boîte du meuble (`decorTrust`, voir [collisions](collisions.md)).

La zone de service d’une station n’est pas un obstacle : une station peut se poser près
d’un appareil immobilisé, et un équipement dans sa zone ; seul le socle de la station
réserve une emprise. Rien ne se pose dans le ciel du purgatoire
([ciel](purgatory-sky.md#se-poser-marcher-embarquer)).

## Service payant

`advancePaidService()` (`src/paid-service.ts`) tourne sur le serveur une fois par seconde
de temps de room. Sources : la station gratuite « Ravitaillement Alpha »
(`initialStation`, conservée après remise à zéro), les stations achetées et les Castor
vivants (terrestre et volant), chacun dans une sphère de **0,50 m réel**
(`SERVICE_RADIUS`, `CASTOR_SERVICE_RADIUS`). Le service ne demande ni d’être posé ni
d’être arrêté : un appareil en vol ou qui roule est servi. Un véhicule de soutien se
sert lui-même.

| Fourniture (`SERVICE_RATES`)  | Prix                                     |
| ----------------------------- | ---------------------------------------- |
| PV (coque, barricades, tours) | 1 $ / 100 PV ; moteur/aile au même tarif |
| Carburant                     | 1 $ / 60 s                               |
| Balles                        | 1 $ / 1 000                              |
| Obus, roquettes               | 1 $ / 10                                 |
| Bombes                        | 1 $ / 5                                  |
| Missiles                      | 1 $ / 2                                  |

- Débit : une réserve se remplit en `SERVICE_SECONDS` (10 s) du vide au plein ; les PV
  remontent d’au plus 10 % du maximum par seconde.
- Partage : quand la caisse ne suffit pas, le budget est réparti équitablement entre
  demandeurs (`fairServiceShares`, max-min par dollars). Caisse vide : rien n’est
  fourni.
- Installations : DCA fixes, tourelles automatiques, canons anti-matériel et barricades
  intactes mais endommagées entrent dans le même budget s’ils sont à portée d’une
  source (pour une barricade, le point le plus proche du segment). Une barricade
  détruite n’est pas reconstruite.
- Stocks des DCA fixes : le flak léger et le flak lourd ont **120 obus**, la DCA haute
  cadence 1 000 balles. Chaque coup validé (`fixedDcaFire`, idempotent par tir) en
  retire un ; sans source à portée, la DCA ne se recharge pas.
- `spentBy` attribue les dollars à chaque type d’équipement pour les
  [statistiques](stats.md).

## Constructions au tronçon

Les constructions du Castor se paient à la signature ; les longueurs suivent
`lengthPrice` (`src/ground-defense-state.ts`) au centime près.

| Construction              | Prix                                               |
| ------------------------- | -------------------------------------------------- |
| Mur de briques            | 0,25 $ par tronçon de 48 mm (`WALL_SEGMENT_PRICE`) |
| Ruban collant             | 1 $ par 20 cm                                      |
| Sucre                     | 3 $                                                |
| Tourelle automatique T-01 | 5 $                                                |
| Canon anti-matériel       | 14 $                                               |
| Gatling                   | 25 $                                               |

Mur (`src/brick-rules.ts`) : briques de 24 mm (demi-brique 12 mm), deux rangées
décalées. La longueur validée est arrondie vers le bas au pas de 12 mm ; une portion
incomplète est facturée au prorata ; un trait trop court est refusé sans débit. Mêmes
règles à pied et au Castor (sections validées une à une par le serveur). Les tronçons
alignés sont réunis pour le dessin seulement ; dégâts, réparation et achat restent par
section.

## Mode debug

En [mode debug](laboratory.md), la caisse est remise à 1 milliard de dollars à chaque
traitement serveur et les achats ne sont pas comptés dans les statistiques ; signatures,
limites et règles de pose restent appliquées.

## Vérifier

- `scripts/test-paid-service.mjs` : sources, tarifs, partage équitable, caisse vide.
- `scripts/test-fixed-dca-ammo.mjs` : stocks et recharge des DCA fixes.
- `scripts/test-castor-repair.mjs` : réparation des barricades et tourelles.
- `scripts/test-service-placement.mjs`, `scripts/test-ground-placement.mjs` : pose dans
  une zone de service et sur le décor.
- `scripts/test-clean-flight.mjs` : prix en direct, bon prépayé, prix ou fonds périmés,
  achats concurrents, pose idempotente, remboursement à l’expiration.
- `scripts/test-economy-ballistics.mjs` : pose physique sur les livres (et balistique,
  voir [projectiles](projectiles.md)).
