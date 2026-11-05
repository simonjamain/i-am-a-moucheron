# Visuels Meshy : Stuka, Spitfire S6, Tank T3 et DCA mobile D2

Les quatre véhicules utilisent une coque Meshy avec couleurs intégrées aux triangles.
Le M1, le B3 et le H2 conservent leurs modèles existants. La DCA fixe n'est pas
un véhicule et n'est pas modifiée dans ce lot.

## Références et provenance

Les images de [référence](vehicle-references/) ont été générées pour cette contribution :
un objet entier en vue trois-quarts sur fond blanc, formes simples, camouflage
olive/sable, sans texte ni planche multivue. Les hélices et armes mobiles sont
exclues des images pour rester animées par le moteur. Le D2 présente son attelage
aligné et un raccord étroit entre tracteur et remorque.

| Véhicule      | Image                                             | Tâche Meshy                            | Triangles source | Triangles coque livrée |
| ------------- | ------------------------------------------------- | -------------------------------------- | ---------------: | ---------------------: |
| Stuka         | [stuka.png](vehicle-references/stuka.png)         | `01a1a8ed-4589-75ee-9c0f-1bc3ea25e52a` |           28 192 |                  2 999 |
| Spitfire S6   | [spitfire.png](vehicle-references/spitfire.png)   | `01a1a8ed-9b2d-76c7-9b3c-1eab9d5ba005` |           28 723 |                  3 000 |
| Tank T3       | [tank.png](vehicle-references/tank.png)           | `01a1a8ed-d517-7384-9784-d5d7d810c3aa` |           26 940 |                  2 999 |
| DCA mobile D2 | [flaktruck.png](vehicle-references/flaktruck.png) | `01a1a8ee-118f-77a9-a1ac-2b776b385189` |           26 943 |                  3 000 |

Paramètres Meshy : image-to-3D, texture activée, remesh activé, triangles,
PBR désactivé, modèle par défaut. Coût retourné : 30 crédits par génération,
120 crédits pour ce lot. Un téléchargement GLB par véhicule.
Les GLB originaux restent récupérables via leurs tâches Meshy ; les données de
rendu finales sont embarquées dans le dépôt, sans appel Meshy en jeu.

SHA-256 des GLB utilisés :

- Stuka : `a98ad764232edf10d892e2eb4496a062cc82f4ea6147c17a2873e6ca7e029d95`
- S6 : `8e3bf0b0d947cb57e74deb0ce713c67acdecd8ed22790de6cf23fdbb735785f9`
- T3 : `6aca60a17506abd27334d3450392b6df3d0a3b6d2250e608aaefc0fcda0eb0bb`
- D2 : `d8ec0b4f3f0e1e205c0bff1f8cd2b18dedd52dec93521e283d8f3e6ef7067bac`

## Conversion et animation

`scripts/import-meshy-fleet.py NOM SOURCE.glb` applique les transformations
spécifiques aux quatre exports inspectés : nez -X vers -Z, dimensions adaptées
aux véhicules existants, roues au niveau du train de référence. Dépendances hors
ligne : trimesh 5.2.0, fast-simplification 0.2.0, scipy, pillow et shapely.
Formater ensuite les modules produits avec Prettier.

La simplification quadratique vise au plus 3 000 triangles par coque. Les couleurs
sont échantillonnées depuis le modèle source et converties de sRGB en RGB linéaire.
Les zones olive conservent maintenant leur teinte de base, comme les autres
surfaces ; la couleur propre à chaque véhicule est portée uniquement par un
petit disque au-dessus de lui. La coque n'est plus recolorée par appareil.
Les couleurs actuellement intégrées aux triangles sont une approximation des
textures Meshy : contrairement au B3, les atlas UV originaux ne sont pas embarqués.
Pour retrouver ces détails à l'identique, il faut les GLB originaux texturés. Aucun atlas, PBR, chargeur
GLTF ou décodeur supplémentaire n'est chargé par le navigateur.

`src/meshy-fleet.js` partage les géométries et matériaux fixes entre exemplaires.
Les groupes d'animation restent propres à chaque véhicule. Les ailes des avions
réagissent aux dégâts et les hélices tournent indépendamment. Les canons visibles
portent leurs bouches de tir, y compris les six armes du S6. Le T3 conserve deux
tourelles orientables ; leurs habillages sont des volumes octogonaux légers.
Le D2 est découpé au raccord de remorque, sur le pivot existant z=-0,7. La remorque
et son canon suivent les transformations déjà pilotées par le jeu.
Les règles de mouvement, sièges, munitions et réseau ne changent pas.

## Vérifications et limites

`node scripts/test-meshy-fleet.mjs` vérifie les budgets des coques, les attributs
finis, le partage des buffers, les livrées, le contact au sol, les ailes, hélices
et la remorque. `scripts/test-muzzle-alignment.mjs` vérifie les origines des tirs.
Ces tests font partie de `npm test`.

`node scripts/review-meshy-fleet.mjs` produit `tmp/meshy/fleet-review.svg`.
La [projection CPU](meshy-fleet-review.png) montre les géométries réelles assemblées,
pas une capture WebGL. Les petites armes ajoutent des triangles au budget des
coques ; le budget annoncé n'est pas celui du véhicule complet.
La réduction face au GLB source n'est pas une mesure de gain de FPS face aux
anciens modèles procéduraux. Aucun essai multijoueur/WebGL/WAN n'est revendiqué.
Tester en jeu : achats et embarquement, vues de chaque poste, tirs, dégâts des
ailes, virages du D2 et proximité entre plusieurs véhicules.
