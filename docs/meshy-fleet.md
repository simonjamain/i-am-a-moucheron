# Visuels Meshy texturés : Stuka, Spitfire S6, Tank T3 et DCA mobile D2

Les quatre véhicules utilisent le maillage et les véritables UV des GLB Meshy.
Leur atlas JPEG de 1 024 pixels est intégré dans les modules du jeu ; la texture
est commune à tous les exemplaires d'un même véhicule. Les surfaces ne changent
plus de couleur selon l'appareil : seule une pastille colorée flottante porte
l'identification. Le M1, le H2 et le bombardier B3 suivent le même principe.

## Références et provenance

Les images [de référence](vehicle-references/) ont servi à produire les modèles.
Les GLB originaux ont été fournis dans la Bibliothèque du projet le 5 novembre 2026 ;
leurs empreintes sont vérifiées avant toute conversion. Aucun nouvel appel Meshy.

| Véhicule | Image de référence | Tâche Meshy | Triangles intégrés |
| --- | --- | --- | ---: |
| Stuka | [stuka.png](vehicle-references/stuka.png) | `01a1a8ed-4589-75ee-9c0f-1bc3ea25e52a` | 28 192 |
| Spitfire S6 | [spitfire.png](vehicle-references/spitfire.png) | `01a1a8ed-9b2d-76c7-9b3c-1eab9d5ba005` | 28 723 |
| Tank T3 | [tank.png](vehicle-references/tank.png) | `01a1a8ed-d517-7384-9784-d5d7d810c3aa` | 26 940 |
| DCA mobile D2 | [flaktruck.png](vehicle-references/flaktruck.png) | `01a1a8ee-118f-77a9-a1ac-2b776b385189` | 26 943 |

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
terrain, pastilles colorées, ailes et remorque.
`node scripts/test-meshy-textures.mjs` contrôle atlas JPEG et indices/UV.
`node scripts/test-muzzle-alignment.mjs` vérifie les bouches de tir.

La [projection CPU historique](meshy-fleet-review.png) illustre la géométrie
**simplifiée précédente**, pas l'atlas actuel. Les nouveaux modèles doivent être
vérifiés visuellement en jeu : silhouette, texture, repère, chaque poste et ses
armes, remorque D2, collision et fluidité avec plusieurs véhicules.
Une compilation et un test sans GPU ne constituent pas cet essai.


## Castor G1 : châssis, tourelle et roues Meshy

Les trois modèles Meshy de l'issue [#76](https://github.com/simonjamain/i-am-a-moucheron/issues/76) sont importés séparément, avec leurs **vrais atlas et UV** : châssis `01a1afc9-29f8-771d-8efc-493296643670`, tourelle `01a1afc9-3823-7324-ae2b-56cd8adf4c34`, roue `01a1afc9-4756-727e-8b75-cf19b054f6d4`.

`python3 scripts/import-meshy-castor.py body|turret|wheel SOURCE.glb` convertit chaque source en module JS indépendant `src/meshy-castor-*-data.js`. Le convertisseur conserve les triangles et leurs UV/textures d'origine, rééchantillonne uniquement les images en atlas JPEG à 1 024 pixels et calibre les composants à l'échelle miniature. Les empreintes SHA256 des trois sources sont inscrites dans les modules.

`src/castor-model.js` crée six pivots de roue et un pivot de tourelle/élévation sans rigging Meshy. Les géométries, matériaux et atlas sont partagés entre plusieurs exemplaires pour éviter les copies GPU inutiles. Aucune dépendance réseau ni import GLB au navigateur. Les couleurs Meshy restent originales, avec un rond d'identification séparé.

**Vérification visuelle requise en WebGL** : sens de marche, face des roues, absence de roues doublées dans la coque Meshy, sortie de la bouche du canon et performances à plusieurs exemplaires. Les éventuelles roues déjà moulées dans le châssis sont conservées à cette étape (pas de découpage aveugle de la géométrie). Une CI verte ne constitue pas cet essai.


### Correction de l'assemblage des roues G1 (version 186)

Le châssis Meshy comporte déjà six roues sculptées. Le moteur retire de **l'affichage** les triangles du châssis dans leurs six zones latérales inférieures (sans modifier les atlas, UV ni GLB sources), puis réutilise la véritable roue Meshy indépendante aux centres du châssis : `x = ±1,01`, `z = −2,05 / 0,55 / 1,70`, `y = −0,24` en unités de modèle. L'échelle de roue est `0,65`, ce qui aligne sa taille sur les roues d'origine ; la rotation des six pivots reste indépendante. Le filtrage est effectué **une seule fois par maillage partagé**, sans duplication des textures et UV par Castor. Des tests vérifient le nombre de faces ignorées et l'encombrement final.

La suppression est une découpe géométrique par zones, pas une segmentation sémantique Meshy : vérifier visuellement qu'aucun garde-boue, marchepied ou pare-chocs n'est tronqué par le masque. Le véhicule reste gourmand en triangles, à optimiser ultérieurement après mesure GPU.
