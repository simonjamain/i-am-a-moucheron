# Visuels Meshy texturés : Stuka, Spitfire S6, Tank T3 et DCA mobile D2

Depuis la version 263, le Spitfire S6, le T3, le D2, le H2 et le B3 utilisent les
modèles refaits par l'utilisateur, articulés pièce par pièce : voir
[le remodelage de la flotte](#remodelage-de-la-flotte-version-263). Les sections
suivantes décrivent la première génération, remplacée partout : le M1 et le
Stuka suivent depuis la version 266.

Les quatre véhicules utilisent le maillage et les véritables UV des GLB Meshy.
Leur atlas JPEG de 1 024 pixels est intégré dans les modules du jeu ; la texture
est commune à tous les exemplaires d'un même véhicule. Les surfaces ne changent
pas de couleur selon l'appareil et, depuis la version 238 ([issue #106](https://github.com/simonjamain/i-am-a-moucheron/issues/106)),
aucune pastille flottante ni couleur par joueur ou par appareil n'est ajoutée : traceurs
et obus ont des couleurs neutres par arme. Le M1, le H2 et le bombardier B3 suivent le même principe.
Les cercles d'accès au sol des postes libres portent un pictogramme blanc par rôle
(`src/seat-icons.js`) : volant (conducteur), avion (pilote), avion à deux places
(copilote), viseur (mitrailleur) et tourelle (canon du char).

## Références et provenance

Les images [de référence](vehicle-references/) ont servi à produire les modèles.
Les GLB originaux ont été fournis dans la Bibliothèque du projet le 5 novembre 2026 ;
leurs empreintes sont vérifiées avant toute conversion. Aucun nouvel appel Meshy.

| Véhicule      | Image de référence                                | Tâche Meshy                            | Triangles intégrés |
| ------------- | ------------------------------------------------- | -------------------------------------- | -----------------: |
| Stuka         | [stuka.png](vehicle-references/stuka.png)         | `01a1a8ed-4589-75ee-9c0f-1bc3ea25e52a` |             28 192 |
| Spitfire S6   | [spitfire.png](vehicle-references/spitfire.png)   | `01a1a8ed-9b2d-76c7-9b3c-1eab9d5ba005` |             28 723 |
| Tank T3       | [tank.png](vehicle-references/tank.png)           | `01a1a8ed-d517-7384-9784-d5d7d810c3aa` |             26 940 |
| DCA mobile D2 | [flaktruck.png](vehicle-references/flaktruck.png) | `01a1a8ee-118f-77a9-a1ac-2b776b385189` |             26 943 |

SHA-256 des GLB sources, dans l'ordre du tableau :

- Stuka : `a98ad764232edf10d892e2eb4496a062cc82f4ea6147c17a2873e6ca7e029d95`
- S6 : `8e3bf0b0d947cb57e74deb0ce713c67acdecd8ed22790de6cf23fdbb735785f9`
- T3 : `6aca60a17506abd27334d3450392b6df3d0a3b6d2250e608aaefc0fcda0eb0bb`
- D2 : `d8ec0b4f3f0e1e205c0bff1f8cd2b18dedd52dec93521e283d8f3e6ef7067bac`

## Import, textures et mouvements

`python3 scripts/import-meshy-textures.py NOM SOURCE.glb` recrée
`src/meshy-NOM-data.js` pour `stuka`, `spitfire`, `tank` ou `flaktruck`.
Dépendances Python hors ligne : NumPy, trimesh, Pillow (SciPy requis pour H2).
Les positions et UV sont quantifiés sur 16 bits, les faces restent indexées
avec leurs séparations de texture. Le matériau utilise la carte de couleur d'origine,
une rugosité uniforme et un éclairage standard ; les autres cartes PBR ne sont pas
chargées. Aucun GLB ni service Meshy n'est requis dans le navigateur.

`src/meshy-texture.js` partage les buffers, matériaux et atlas entre véhicules.
Les hélices et canons restent pilotés par le jeu ; depuis la version 267, les
dégâts se voient par la fumée des moteurs, jamais par un changement de forme. Le T3 garde ses deux tourelles orientables
et le D2 son attelage : sa remorque suit le pivot existant à z = −0,7.
Le placement, les tirs, les sièges et les règles réseau n'ont pas changé.

La conversion antérieure de `scripts/import-meshy-fleet.py` (3 000 triangles par
coque, couleurs peintes par face) reste dans l'historique. Le nouveau rendu
**privilégie la texture Meshy réelle**, comme le B3 : il charge environ
27 000–29 000 triangles par véhicule. Il ne faut pas présenter cette variante
comme une optimisation de FPS ; mesurer le coût sur plusieurs appareils en WebGL
avant de prétendre qu'elle convient à une flotte nombreuse.

## Vérifications

`node scripts/test-meshy-fleet.mjs` contrôle maillages, UV, partage des buffers,
terrain, absence de pastille, ailes et remorque ; `node scripts/test-vehicle-identity.mjs`
contrôle couleurs d'origine et pictogrammes de postes.
`node scripts/test-meshy-textures.mjs` contrôle atlas JPEG et indices/UV.
`node scripts/test-muzzle-alignment.mjs` vérifie les bouches de tir.

La [projection CPU historique](meshy-fleet-review.png) illustre la géométrie
**simplifiée précédente**, pas l'atlas actuel. Les nouveaux modèles doivent être
vérifiés visuellement en jeu : silhouette, texture, repère, chaque poste et ses
armes, remorque D2, collision et fluidité avec plusieurs véhicules.
Une compilation et un test sans GPU ne constituent pas cet essai.

## Remodelage de la flotte (version 263)

L'utilisateur a refait cinq véhicules dans Meshy. Chaque GLB est **un seul
maillage** texturé dont chaque pièce mobile est un **îlot séparé** :

| Véhicule       | GLB fourni (SHA-256)                                                                                  | Triangles | Îlots |
| -------------- | ----------------------------------------------------------------------------------------------------- | --------: | ----: |
| Spitfire S6    | `Meshy_AI_Vintage_Fighter_Plane` (`b18e5558feef75463354dee45037b11ed640a4de6f9f0c71cd6e9dbf484026c4`) |     3 002 |    22 |
| Tank T3        | `Meshy_AI_Desert_Vanguard` (`fb105cc19eefd50573c25ca9eaa233bf15eb4898d04f34cbaa736b618da186e9`)       |     3 833 |   154 |
| DCA mobile D2  | `Meshy_AI_Towable_Anti_Aircraft` (`3861d4bf21e75d0ca9a7864b40f98189847b0fdcffdf6de5daf1127f71da18ed`) |     4 689 |   150 |
| H2             | `Meshy_AI_Desert_Viper_Helicopt` (`488832fc140c16321dc54d07addd088ea16e2f3b042f568fa910ec1ee1206a9a`) |     5 102 |    66 |
| B3             | `Meshy_AI_Desert_Sky_Fortress` (`a50363b85c21e407839651d5b478bf8900bb340debec3e86cdc68b94b8284307`)   |     5 797 |    45 |
| M1 (v. 267)    | `Meshy_AI_Olive_Scout_Plane` (`d4115c13695e06dc06f42e35301c59e0717e26a68e77cbfb6d17bd5ba5107387`)     |     2 357 |    20 |
| Stuka (v. 266) | `Meshy_AI_Desert_Sparrow` (`6290811f303ac480f3b286dd62ee73d6293fa542d824987b378262e5c8ec9ade`)        |     3 261 |    40 |

`python3 scripts/import-meshy-vehicle.py spitfire|tank|flaktruck|helicopter|bomber|fighter|interceptor SOURCE.glb`
soude les sommets (sans tenir compte des coutures UV) pour retrouver les îlots, puis
range chacun dans un nœud articulé selon une spécification par véhicule (zones,
pivots, sens des canons). Tous les triangles et UV d'origine sont conservés ; seule
la texture 4 096 px est réduite en JPEG 1 024 px (modules de 350 à 420 Ko, contre
0,8 à 1 Mo auparavant). L'option `--debug FICHIER` exporte les îlots et groupes
pour un rendu de contrôle surligné. Les anciens scripts (`import-meshy-textures.py`,
`import-meshy-h2.py`, `import-meshy-b3.py`) restent verrouillés sur les empreintes
des anciennes sources et ne s'appliquent plus à ces cinq véhicules.

Orientation : avant Meshy −X tourné vers −Z sans miroir ; échelle calée sur
l'envergure (Spitfire 6,2 ; B3 11,3) ou la longueur (T3 4,3 ; D2 8,6 ; H2 7,5),
cohérente avec `VEHICLES` ; roues au niveau −`gear`.

`src/meshy-rig.js` construit la hiérarchie (`data.rig`) : chaque nœud est un
pivot placé dans le repère de son parent, avec sa rotation de repos. Les canons
sont stockés alignés sur −Z, ce qu'attend `aimGun`, et leurs bouches
(`data.anchors`) sont sur l'axe passant par le pivot d'élévation :

- **Spitfire** : hélice (axe Z), ailes, six canons d'aile
  sculptés comme bouches de tir.
- **T3** : tourelle (lacet) portant le canon, la coaxiale et la mitrailleuse de toit
  sur son propre affût (lacet + élévation) ; mitrailleuse de caisse pour le pilote.
- **D2** : remorque pivotant à l'attelage, affût tournant sur la remorque, canons
  jumeaux en élévation (au repos, pointés vers l'arrière et le haut comme le modèle).
- **H2** : rotor à cinq pales (Y), rotor de queue (X), canon de nez du copilote.
- **B3** : deux hélices, ailes, tourelles dorsale, de queue (tournée vers l'arrière
  au repos) et ventrale (vers le bas), dans l'ordre des postes.
- **M1** (version 267, `Meshy_AI_Olive_Scout_Plane_1110221559`, SHA-256
  `d4115c13695e06dc06f42e35301c59e0717e26a68e77cbfb6d17bd5ba5107387`, 2 357
  triangles, corrige le modèle de la version 266) : hélice et deux mitrailleuses
  de nez sculptées comme bouches ; aile laissée dans la coque ; envergure 5,6.
- **Stuka** (version 266) : hélice, ailes en mouette (îlots séparés), bombe ventrale
  dans la coque ; deux bouches au bord d'attaque à 40 % de l'envergure (pas de
  canon sculpté) ; envergure 7,7 conservée. Les anciennes bombes décoratives sous
  les ailes sont retirées. `src/meshy-fleet.js` (coques statiques) est supprimé.

L'importeur écrit aussi `src/vehicle-anchors.js`, partagé par le client et le
serveur, pour que la physique suive le modèle : pivot et longueur du canon du T3
(`tankBarrelOrigin`), attelage, pivot et longueur des canons du D2
(`mobileBarrelOrigin`, `trailerGunPivot`), enveloppes de collision tracteur et
remorque (`sweptVehicle`, points de contact de `tank.js`), origines des roquettes
et missiles du H2 (`heliWeaponOrigin`). Ces points ont changé avec les nouvelles
proportions : les obus et roquettes partent des bouches dessinées.

`scripts/test-meshy-vehicles.mjs` vérifie empreintes, triangles, contact au sol,
hiérarchies et l'égalité entre bouches dessinées et origines de la physique
(char et D2 quelle que soit la visée, remorque braquée, armes du H2, tourelles du
B3). **Essai en jeu requis** : rendu, tirs de chaque poste, braquage de la
remorque, collisions et performances à plusieurs véhicules en WebGL/UDP.

## Castor G1 : modèle Meshy remodelé (version 262)

Le Castor de l'issue [#76](https://github.com/simonjamain/i-am-a-moucheron/issues/76) utilise désormais le modèle refait par l'utilisateur, `Meshy_AI_Tactical_Rescue_Rover_1110083041_texture_1.glb` (SHA-256 `b211b4234f6a2ac443357c7867c9a634288a098f6fd5bfa62e3b4b863e67c466`, 3 700 triangles, texture 2 048 px). Il remplace les trois anciennes tâches séparées (châssis `01a1afc9-29f8-…`, tourelle, roue ; ~30 000 triangles pour la seule coque), ainsi que le masquage des roues sculptées dans la coque, devenu inutile.

Le GLB est un seul maillage, mais **chaque pièce est un îlot séparé** (158 îlots). `python3 scripts/import-meshy-castor.py SOURCE.glb` soude les sommets (sans tenir compte des coutures UV) pour trouver ces îlots, puis :

- reconnaît les six pneus (îlots bas, plus de 60 faces, un par côté) et les cinq pièces de la tourelle de toit ; l'import échoue si ce compte diffère ;
- tourne le modèle de −X (avant Meshy) vers −Z (avant du jeu), sans miroir, et l'échelonne à **6,1 unités de long** (longueur de l'ancien Castor) ; le contact des roues est à −0,8 (hauteur `gear`) ;
- enregistre chaque pièce autour de son pivot dans `src/meshy-castor-data.js` : `body`, `wheel0`…`wheel5` (moyeu de chaque pneu, axe X, rayon 0,568 → `CASTOR_WHEEL_RADIUS` 0,57), `turret` (couronne, lacet autour de Y) et `gun` (tête et canon, élévation autour de X, au centre de la tête), avec la bouche à l'extrémité du canon ;
- conserve tous les triangles et UV d'origine ; seule la texture est réduite en JPEG 1 024 px (module de 449 Ko, contre 3,3 Mo pour les trois anciens).

`src/castor-model.js` crée ces pivots par Castor et partage géométries, matériau et atlas entre exemplaires. `scripts/test-castor-meshy.mjs` vérifie l'empreinte, les triangles, l'encombrement, le contact au sol, les moyeux et la bouche. Le mât caméra et l'antenne restent fixes dans la coque.

**Vérification visuelle requise en WebGL** : sens de marche, rotation des roues, visée de la tourelle et performances à plusieurs exemplaires ; un rendu hors jeu ne remplace pas l'essai en partie.

Pour tout nouvel export GLB Meshy, voir le [pipeline de validation et de simplification](asset-pipeline.md) : les originaux approuvés restent la référence, et les variantes optimisées doivent préserver les textures et les pivots.
