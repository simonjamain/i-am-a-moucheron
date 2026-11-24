# Flotte, échelle et armement

Référence commune des engins : échelle des acteurs, catalogue des véhicules, cycle de
vie et postes, armement et DCA fixes. Détails par famille :
[biplans](biplane-models.md), [M1](m1-model.md), [modèles Meshy de la flotte](meshy-fleet.md),
[H2 et D2](support-vehicles.md), [physique de l'avion](plane-physics.md),
[physique au sol](physics-engine.md). Projectiles et réseau des tirs :
[projectiles](projectiles.md). Réserves, ravitaillement et contrats :
[logistique](logistics-contracts.md). Achat et pose : [économie](economy-physics.md).

## Échelle

`src/scale.ts` est la seule déclaration du rapport miniature. `MAPS.office` vaut 3/1000
(`MAP`) ; `mapScale(n, 1000)` en crée d'autres. Le bureau et son mobilier sont modélisés
en mètres SI ; les dimensions, vitesses, forces et portées des acteurs sont écrites en
**mètres de référence** et multipliées par `MAP.ratio` (`MAP.metres()`,
`MAP.reference()` pour l'inverse). Une personne mesure 1,8 m de référence (5,4 mm au
bureau), un insecte de référence 0,9 m (`INSECT_SCALE`) ; `ACTOR_UNIT` convertit l'unité
de modèle des avions (5,6 unités d'envergure pour 10,4 m de référence). Vitesses
angulaires, cadences et délais sont des temps et ne sont pas mis à l'échelle.

Les mêmes conversions servent au vol, à la marche, aux parachutes, aux bouches de tir,
aux projectiles, fusées et souffles, aux marges de collision, aux caméras et à
l'atténuation du son. `REFERENCE` regroupe les vitesses de référence (marche 6 m/s,
balle 820 m/s, obus 800 m/s, gravité 9,81). Le HUD affiche les valeurs réelles du bureau
(`formatSpeed`, `formatDistance`, `src/units.ts`) : la fusée du Flak léger (100–1 200 m de
référence) s'affiche de 30 cm à 3,60 m. Le rendu utilise un tampon de profondeur
logarithmique (`src/renderer.ts`) pour des acteurs millimétriques dans une pièce
métrique.

## Véhicules

Profils dans `VEHICLES` (`src/fleet.ts`), prix dans `SHOP` (`src/equipment.ts`), colonnes
de l'atelier dans `src/shop-catalog.ts`. Vitesses maximales en m/s de référence ; PV de
coque 100 sauf mention.

| Clé            | Nom                   | Prix | Postes                                   | Vitesse max | Armement                                |
| -------------- | --------------------- | ---: | ---------------------------------------- | ----------: | --------------------------------------- |
| `fighter`      | Chasseur biplan       |  5 $ | pilote                                   |        52,5 | une MG centrale                         |
| `bomber`       | Bombardier biplan     |  5 $ | pilote, mitrailleur dorsal               |        52,5 | bombes (pilote), MG dorsale             |
| `tank`         | Char moyen            |  5 $ | conducteur, tireur principal, mitrailleur supérieur |          32 | MG, canon HE/AP + coaxiale, MG          |
| `lightfighter` | Chasseur léger        | 15 $ | pilote                                   |          70 | deux MG de nez                          |
| `medbomber`    | Bombardier moyen      | 15 $ | pilote, dorsal, queue, ventral           |        52,5 | bombes, trois MG                        |
| `castor`       | Castor                | 15 $ | pilote                                   |          52 | MG ; soutien et construction            |
| `flaktruck`    | Anti-air mobile (D2)  | 15 $ | conducteur, tireur                       |          66 | canon à fusée de proximité              |
| `interceptor`  | Stuka                 | 25 $ | pilote                                   |          54 | MG, bombes                              |
| `flyingcastor` | Castor volant         | 35 $ | pilote, trois passagers                  |          42 | aucun ; largages et soutien (200 PV)    |
| `helicopter`   | Hélicoptère H2        | 50 $ | pilote, copilote                         |          42 | roquettes, MG, missile (200 PV)         |
| `spitfire`     | Spitfire              | 75 $ | pilote                                   |       122,5 | six MG en salves                        |

Le chasseur léger (`LIGHT_FIGHTER`) reste la référence dont dérivent Stuka, Spitfire et
hélicoptères. Le char est 20 % plus grand que son dessin (`VEHICLE_SCALE`). Carburant :
cinq minutes à plein gaz (`FUEL_SECONDS`, `src/logistics.ts`) ; une panne sèche supprime
la poussée sans figer le vol.

## Cycle de vie et postes

- **Réserves gratuites.** Chasseur biplan, bombardier biplan et char sont des
  `starter` : chaque type garde un exemplaire prêt sur son emplacement (`PAD_OFFSET`).
  Dès que le prêt est utilisé ou détruit, un successeur apparaît, au plus un toutes les
  10 s par type (`STARTER_GAP_MS`, `server/game.js`) ; les coques utilisées restent.
- **Achats.** Les autres exemplaires (`purchase`) se paient avec un bon signé et se
  posent à l'emplacement choisi ; ils ne sont pas remplacés gratuitement, mais on peut
  en racheter.
- **Monter.** On vise le poste lui-même (verrière, trappe, tourelle), de n'importe quel
  côté ; un clic ouvre son dossier à signer
  ([règles d'interface](ui-guidelines.md#monter-dans-un-engin--viser-le-poste),
  `src/seat-posts.ts`). Le serveur vérifie la proximité et l'exclusivité du siège à la
  signature ; les contrats propres à chaque poste sont décrits dans
  [logistique](logistics-contracts.md).
- **Postes.** Le pilote seul publie la pose de la coque ; les tireurs publient visée et
  tirs indépendamment, sans pilote requis. F quitte le poste (`equipmentExitAction`,
  `src/control-focus.ts`) : seul ce siège se libère, l'engin, son équipage et ses stocks
  restent. Une sortie en vol laisse le joueur en chute libre. Un engin sans pilote est
  simulé par le serveur (`ParkedHost`, `src/parked-host.ts`) jusqu'au repos.
- **Absences.** Un siège silencieux est masqué après `PRESENCE_MS` (12 s) et conservé
  `RESUME_MS` (30 s) pour un joueur qui se reconnecte.
- **Destruction.** Elle libère tous les occupants, qui passent au purgatoire, y compris
  quand le dernier mouvement signale la destruction sans commande de mort. Le serveur
  publie un seul événement de crash (pose, vitesse, horodatage) ; chaque client montre
  chute, son d'impact, fumée et débris (`src/crash-effects.ts` : douze carcasses au
  plus, dix débris chacune, chute bornée à 16 s, disparition 4 s après l'impact). Une
  connexion tardive reconstruit la phase atteinte sans rejouer les sons. Ces effets ne
  sont pas des surfaces de collision.

Les identités visuelles (pastilles, teintes, inscriptions) sont décrites dans
[logistique](logistics-contracts.md).

## Armement

Stocks pleins par `fullAmmo()` (`src/logistics.ts`), cadences dans `src/fleet.ts`,
`src/armament.ts` et `src/client.js`, dégâts par type dans [projectiles](projectiles.md).
Une MG a environ 60 s de tir nominal (90 s pour celles du char).

| Engin / poste                       | Arme (type)          |  Stock | Cadence |
| ----------------------------------- | -------------------- | -----: | ------: |
| Chasseur biplan, pilote             | MG (`mg`)            |    500 |  0,12 s |
| Chasseur léger, Stuka, pilote       | MG (`mg`)            |  1 000 |  0,06 s |
| Spitfire, pilote                    | six MG (`mg`)        |  1 000 |  salves |
| Mitrailleurs des bombardiers        | MG (`mg`)            |    667 |  0,09 s |
| Stuka, pilote                       | bombes (`bomb`)      |      6 |   0,5 s |
| Bombardier moyen, pilote            | bombes (`bomb`)      |     50 |   0,5 s |
| Bombardier biplan, pilote           | bombes (`bomb`)      |     30 |     1 s |
| Char, conducteur                    | MG (`mgLight`)       |  1 000 |  0,09 s |
| Char, tireur principal              | coaxiale (`coax`)    |  1 500 |  0,06 s |
| Char, tireur principal              | obus HE / AP         | 30 + 30 |    2 s |
| Char, mitrailleur supérieur         | MG (`mg`)            |  1 500 |  0,06 s |
| Castor, pilote                      | MG (`castorGun`)     |    500 |  0,16 s |
| H2, D2                              | voir [H2 et D2](support-vehicles.md) |        |         |

- Les pilotes des bombardiers n'ont pas de MG ; Espace largue les bombes. Les bombes des
  bombardiers ont un rayon double (`radiusFactor`).
- Char : HE et AP partagent le délai du canon ; une réserve vide bascule sur l'autre si
  elle contient un obus entier (`availableShell`). Les trois réserves de MG sont
  indépendantes. Élévation du canon jusqu'à 30° (`TANK_GUN_MAX_PITCH`).
- Les bouches de tir sont des nœuds des modèles (`src/vehicle-anchors.ts`,
  `src/muzzle.ts`) : tirs locaux et distants partent de la bouche affichée ; le Spitfire
  garde ses six origines de salve.
- Les niveaux fractionnaires de munitions sont conservés ; tirer exige une munition
  entière. Recharge : [logistique](logistics-contracts.md).
- Commandes de tir par poste : [commandes](controls.md).

## DCA fixes

Les trois postes s'achètent dans **Installations**, se posent à pied et se servent après
signature de leur dossier (`equipment-select`, `equipment-sign`). Une station ou un
Castor à portée les recharge automatiquement, contre paiement. Profils dans `FIXED_DCA`
(`src/fixed-dca.ts`).

| Poste             | Prix                                    | Stock        | Tir                                                                                              |
| ----------------- | --------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------ |
| Flak léger        | 5 $, +2 $ par exemplaire, au plus 40 $  | 120 obus     | deux tubes alternés, 0,7 s ; éclatement à distance programmée, souffle 30 m (80 → 20), 200 au contact |
| DCA haute cadence | 50 $                                    | 1 000 balles | quatre MG de Spitfire alternées, un départ toutes les 15 ms, 62 par balle                        |
| Flak lourd        | 30 $                                    | 120 obus     | un obus par seconde, fusée de proximité de la DCA mobile, souffle 40 m (240 → 60)                |

- Azimut libre, élévation de +5° à +90° (`FLAK.minPitch`, `flakPitchAllowed`). Deux
  articulations séparées (lacet, tourillon) ; boucliers et plateaux suivent l'azimut.
- **Flak léger** : distance de fusée de 100 à 1 200 m de référence (`fuseRange`,
  `src/combat.ts`). Maj/Ctrl maintenus la balaient en continu (`FUSE_RATE`,
  `src/equipment-controls.ts`) ; molette, crochets et boutons la changent par pas de
  25 m. Un contact direct inflige 200 ; un contact avec le décor avant la distance de
  sécurité est inerte (`shellImpact`). L'éclat est occulté par le mobilier et blesse
  alliés et coques.
- **Flak lourd** : la vue passe à la bouche du canon et suit son axe ; la molette règle
  la proximité comme sur la [DCA mobile](support-vehicles.md#dca-mobile-d2).
- La collision des DCA fixes suit leur embase, à son échelle et son orientation.

Le canon anti-matériel construit depuis le Castor (`FORTIFICATIONS`,
`src/ground-fortifications.ts`) est décrit dans [le gameplay](gameplay.md).

## Vérifier

- `npm test -- fleet-scale`, `npm test -- units` : échelle et unités affichées.
- `npm test -- next-backlog` : stocks et bascules d'obus, délais, accès de rôle,
  conduite sur support, effets de crash bornés.
- `npm test -- boarding`, `npm test -- seat-posts`, `npm test -- vehicle-exit` : accès
  et sortie des postes.
- `npm test -- fixed-dca-ammo`, `npm test -- fuse-continuous` : DCA fixes.
- `npm test -- muzzle-alignment` : bouches de tir.
- `npm test -- udp-native` : armes et postes entre deux vrais pairs UDP.

Ces contrôles ne prouvent ni le ressenti du pilotage, ni le rendu WebGL, ni une partie WAN.
