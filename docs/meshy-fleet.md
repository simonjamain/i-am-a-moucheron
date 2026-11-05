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
