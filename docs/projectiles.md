# Projectiles

Catalogue des projectiles, ricochets, simulation par le tireur et affichage chez les
autres joueurs. Les armes qui les tirent (cadences, stocks, postes) sont dans
[la flotte](scale-fleet-weapons.md#armement), [l'hélicoptère et la DCA mobile](support-vehicles.md)
et [les tourelles automatiques](gatling-turret.md).

## Catalogue

`PROJECTILES` (`src/projectiles.ts`) décrit ce qu'est un projectile, indépendamment de
l'arme : une arme référence un type et ne garde que ce qui lui appartient (cadence,
stock, recul). Les distances et vitesses sont en mètres de référence
([échelle](scale-fleet-weapons.md#échelle)).

| Champ                      | Sens                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| `damage`, `edge`, `radius` | Dégâts au centre, au bord du souffle, rayon du souffle (0 : pas d'explosion).             |
| `speed`                    | Vitesse nominale à la bouche.                                                             |
| `lifetime`                 | Durée de vol en secondes.                                                                 |
| `drag`                     | Loi de traînée (`bullet`, `shell`) ou aucune (`null`).                                    |
| `speedExponent`            | Part de la vitesse dans les dégâts : `damage × (vitesse / nominale) ^ exposant`.          |
| `ricochetMaxAngle`         | Plus grand angle rasant (en degrés depuis la surface) qui permet un ricochet ; 0 jamais.  |
| `color`                    | Couleur neutre du corps d'un obus, identique pour tous ; les balles utilisent le traceur. |

| Type        |          Dégâts (centre → bord) | Rayon (m) |      Vitesse (m/s) | Durée (s) | Ricochet | Armes                                      |
| ----------- | ------------------------------: | --------: | -----------------: | --------: | -------: | ------------------------------------------ |
| `mg`        |                              75 |         — |                820 |         3 |      20° | chasseurs, MG du H2, MG supérieure du char |
| `mgLight`   |                              33 |         — |                820 |         3 |      20° | MG du conducteur du char                   |
| `coax`      |                              50 |         — |                820 |         3 |      20° | coaxiale du char                           |
| `castorGun` |                              40 |         — |                820 |         3 |      20° | Castor                                     |
| `rapidDca`  |                              62 |         — |                820 |         3 |      20° | DCA haute cadence                          |
| `flak`      | 200 direct ; 80 → 20 en souffle |        30 |                800 |       4,5 |       0° | Flak léger                                 |
| `proximity` |                         80 → 20 |        30 |                560 |         9 |       0° | DCA mobile                                 |
| `dcaHeavy`  |                        240 → 60 |        40 |                560 |         9 |       0° | Flak lourd                                 |
| `rocket`    |                        120 → 30 |        12 |                180 |         9 |       0° | roquettes du H2                            |
| `missile`   |                        360 → 70 |        30 |                100 |        15 |       0° | missile guidé du H2                        |
| `bomb`      |                        240 → 60 |        20 | vitesse de l'avion |      52,5 |       0° | Stuka, bombardiers (rayon ×2)              |
| `he`        |                        320 → 30 |        20 |                320 |      19,5 |       5° | obus explosif du char                      |
| `ap`        |                             800 |         — |                600 |        12 |      10° | obus perforant du char                     |
| `antitank`  |                        800 → 90 |         5 |                750 |        12 |       0° | canon anti-matériel                        |

`projectileDamage(id, vitesse)` applique `speedExponent` ; aucun tir ne l'appelle. Les armes lourdes lisent leur type via `HEAVY` (`src/armament.ts`), les
balles via `TANK_MG`, `CASTOR_GUN_DAMAGE`, `RAPID_DCA_DAMAGE` et `HELI.gunDamage`.
`REFERENCE.bullet` (820) et `REFERENCE.shell` (800) sont dans `src/scale.ts` ; la DCA
mobile et le Flak lourd tirent à 70 % de `shell`.

Règles particulières :

- **Souffle** (`heavyDamage`) : décroissance linéaire du centre au bord, occultée par le
  décor ; les explosions blessent aussi alliés et coques.
- **Bombe** : hérite de la vitesse de l'avion et tombe ; un piqué (avant de l'avion
  plus bas que −0,65) multiplie les dégâts par 1,35 ; le rayon double pour les
  bombardiers (`radiusFactor`).
- **Obus perforant** : sans souffle, il traverse les ennemis en appliquant ses dégâts à
  chacun puis en garde 80 % (`AP_PIERCE_KEEP`) ; il s'arrête sur le décor, une coque ou
  un joueur, et seul lui tue net un joueur touché.
- **Missile** : guidé vers le point visé par le copilote (au plus 1,2 rad/s,
  `steerMissile`), un seul en vol par hélicoptère, détruit avec son hélicoptère.
- **Fusées de proximité** (DCA mobile, Flak lourd) : voir
  [la DCA mobile](support-vehicles.md#dca-mobile-d2).

## Balistique

Balles et obus suivent `stepBallisticVelocity` (`src/ballistics.ts`) : gravité et traînée
quadratique `dv/dt = g − k|v|v`, intégrées en demi-pas, avec `BALLISTICS.bullet` 0,0007 et
`BALLISTICS.shell` 0,00015 (mètres de référence, divisés par `MAP.ratio`). La chute des
personnages est décrite dans [corps partagés](walking-network.md#saut-chute-et-parachute) ;
`stepFall`, du même module, n'est appelé que par son test. Test :
`scripts/test-economy-ballistics.mjs`.

## Ricochet

`bounce()` (`src/ricochet.ts`) mesure l'angle entre la trajectoire et la surface (0°
rasant, 90° de plein fouet). Le seuil est le **minimum** de `ricochetMaxAngle` du type
et du matériau touché (`MATERIALS`, `src/materials.ts`). Sous le seuil (seuil > 0), le
projectile ricoche ; au-dessus, il touche normalement.

- Réflexion parfaite, sans aléatoire ; la vitesse est multipliée par
  `1 − 0,6 × angle / seuil` (`SPEED_LOSS`).
- Un ricochet n'inflige aucun dégât ; le projectile continue et peut toucher plus loin,
  alliés compris. Même éclat d'impact qu'un tir au but, son `ricochet`.
- Au plus 5 ricochets (`MAX_BOUNCES`) ; le contact éligible suivant arrête le
  projectile sans dégât.

| Matériau   | Angle max | Porté par                                      |
| ---------- | --------: | ---------------------------------------------- |
| `decor`    |       10° | murs, sol, meubles, objets                     |
| `armor`    |       90° | le char : seule la limite du projectile compte |
| `hull`     |        0° | les autres véhicules (`vehicleMaterial`)       |
| `carapace` |       12° | le scarabée (`insectMaterial`)                 |
| `flesh`    |        0° | les autres insectes et les joueurs             |

Un nouveau matériau (papier, bois, verre…) s'ajoute à `MATERIALS` puis s'affecte à des
objets, sans toucher à la balistique.

Les obus `he` et `ap` ricochent aussi, dans `stepHeavy` (`src/heavy-sim.ts`) : sol,
boîtes et triangles du décor, coques (normale du centre vers l'impact) et insectes. À
un ricochet l'obus ne détone pas. Le tireur envoie `heavy-bounce` (`shot`, `p`, `v`,
`age`, `updated`, `bounces`) ; le serveur remplace le départ enregistré (le rebond le
plus récent l'emporte) et les autres joueurs repartent de ce nouveau départ.

## Simulation par le tireur

Chaque joueur simule **ses propres** tirs : trajectoire, collisions et dégâts sont
calculés dans son navigateur, puis rapportés au serveur, qui les applique une seule
fois (identifiants de tir idempotents). Voir [confiance envers les clients](trust-model.md).

- **Balles.** Prédites et débitées localement (`src/aircraft-fire.ts`), confirmées par
  lots : regroupement pendant 50 ms, 32 tirs au plus par lot, huit lots en attente au
  plus, file bornée à 512 tirs ; un lot perdu est renvoyé avec les mêmes identifiants.
  Les touches d'ennemis arrivent par `hit`, les touches de joueurs et de coques par
  `friendly-hit`.
- **Armes lourdes** (`src/heavy-sim.ts`, partagé par tous les clients) : le tireur crée
  le projectile dès l'appui depuis la bouche affichée et envoie `heavy-fire`
  (`antitank-fire` / `heavy-dca-fire` pour les canons fixes) ; le serveur débite le
  stock et enregistre le départ. Le tireur envoie ensuite `heavy-impact` avec les dégâts
  par ennemi, coque et joueur, ou avec `fizzle: true` pour une fin sans explosion. Le serveur
  oublie un départ sans rapport 3 s après sa fin de vie (`IMPACT_GRACE_MS`) et garde au
  plus `MAX_ORDNANCE` départs par salle.
- Les autres joueurs font voler l'obus depuis le départ enregistré ; un missile guidé
  est dessiné à la position relayée dans le mouvement du tireur.

## Tirs des autres joueurs

Les autres joueurs ne reçoivent pas les balles : ils les rejouent pour l'affichage,
sans jamais blesser.

- **Compteur.** L'état de mouvement du tireur porte `rounds`, le nombre de balles tirées.
  `RemoteRounds` (`src/remote-rounds.ts`) transforme chaque nouveau numéro en un
  traceur, cadencé par l'intervalle de l'arme, avec ce numéro pour identité. Les salves
  du Spitfire gardent leur propre cadence locale, sans identité.
- **Décor fixe.** Le traceur distant s'arrête sur le décor ou ricoche selon la même règle
  déterministe que chez le tireur.
- **Surfaces mobiles** (char, scarabée). Le tireur ajoute à son mouvement `skids`, les
  ricochets de ses 600 dernières ms (`[numéro, rebond, position(3), vitesse(3)]`, huit au
  plus), répétés tant qu'ils sont récents ; le spectateur applique chaque entrée une
  fois, à la balle de ce numéro.
- Format du lot binaire de mouvement : `MOTION_BATCH_VERSION` (`src/motion-wire.ts`).

Limites : les balles du Spitfire, des tourelles et de la DCA n'ont pas de numéro, donc
pas de ricochets rejoués sur les surfaces mobiles ; le traceur distant part du canon
**affiché** (retardé), sans la dispersion du tireur.

## Traceurs

`src/tracers.ts` dessine chaque balle comme un cœur clair non éclairé et un halo
additif coloré : traînée de 11 m de référence (7 m pour un obus), largeur projetée
minimale pour rester lisible de loin. La collision utilise le segment balayé réel, pas
la taille visuelle. Les traceurs sont instanciés et plafonnés (256), tous de la même
couleur (`TRACER_COLOR`). Effets de bouche, flammes et fumées des
roquettes et missiles (`src/missile-exhaust.ts`) : purement visuels, sans message
réseau.

## Vérifier

- `npm test -- projectiles` : valeurs du catalogue.
- `npm test -- ricochet`, `npm test -- heavy-ricochet` : règle et obus lourds.
- `npm test -- remote-rounds` : compteur, traceurs et `skids` distants.
- `npm test -- aircraft-fire` : lots de balles et reprises.
- `npm test -- heavy-impact`, `npm test -- client-heavy`, `npm test -- ap-pierce` :
  armes lourdes simulées par le tireur.
- `npm test -- shot-effects`, `npm test -- instanced-tracers` : effets et traceurs.
- `node scripts/benchmark-motion-rounds.mjs` : coût du compteur dans le relais de mouvement.
