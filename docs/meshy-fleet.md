# Visuels Meshy texturés : Stuka, Spitfire S6, Tank T3 et DCA mobile D2

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
Les hélices et canons restent pilotés par le jeu, et les ailes des deux avions se
rétractent visuellement avec les dégâts. Le T3 garde ses deux tourelles orientables
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
