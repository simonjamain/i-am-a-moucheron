# Pipeline des assets Meshy — outillage Docker local et CI

Le jeu embarque des modules JS dérivés de GLB Meshy ; l'outillage ci-dessous est
un **outil de développement ponctuel**, sans serveur, port, GPU, coût Meshy ni
déploiement sur le VPS. Il n'est pas intégré au conteneur du jeu.

## Exécuter

Prérequis sur l'hôte : Docker et Docker Compose, **pas Node ni Python**.
L'image Docker utilise Node 22, glTF Transform (lecture/écriture GLB) et
meshoptimizer (simplification d'indices géométriques).

```sh
mkdir -p assets/originals assets/optimized
# Déposer un GLB APPROUVÉ dans assets/originals/modèle.glb
docker compose -f compose.assets.yaml build optimizer
docker compose -f compose.assets.yaml run --rm optimizer \
  inspect '/assets/originals/modèle.glb'
docker compose -f compose.assets.yaml run --rm optimizer \
  optimize '/assets/originals/modèle.glb' '/assets/optimized/modèle.glb'
docker compose -f compose.assets.yaml run --rm optimizer \
  validate '/assets/originals/modèle.glb' '/assets/optimized/modèle.glb'
```

Par défaut, les noms de parties tels que `turret`, `rotor`, `prop`, `wheel`
et `canon` sont **exclus de la simplification** ; on peut fournir un motif
`--protect 'rotor|tail|gun'`. Pour un GLB monobloc, l'outil exige des boîtes de protection explicites
(`--regions /assets/originals/zones.json`), sinon `--allow-monobloc` n'est
utilisable que pour une exploration sans validation des pièces mobiles.

`--ratio 0.5` demande de conserver environ 50 % des triangles ; la réduction
réelle peut être moindre. `--error 0.001` limite la déformation géométrique
relative ; les bordures sont verrouillées. Pas de modification des coordonnées
UV, positions, normales, textures ou matériaux : seul le tableau des indices
des triangles peut changer. Il est possible qu'aucune simplification ne soit
réalisable dans ces contraintes. Les textures ne sont pas recompressées.

Les originaux sont montés en lecture seule. Les sorties sont créées dans
`assets/optimized` et ne remplacent pas des fichiers existants (sauf demande
explicite `--overwrite`). Définir `ASSETS_ORIGINALS` et `ASSETS_OUTPUTS` pour
utiliser d'autres dossiers. Les sorties sont écrites par l'utilisateur non-root
`node` (UID 1000) : donner les droits d'écriture au répertoire de sortie.
Ne pas ajouter les originaux privés ou les variantes temporaires dans Git.

Chaque exécution produit un `.glb` et un `.glb.report.json` avec SHA-256
source/dérivé, versions, triangle count, tailles, réduction et avertissements.
La commande `validate` relit les deux fichiers et compare nœuds, matériaux,
octets des images, attributs de sommets et intégrité des indices. Ce contrôle
ne remplace PAS une comparaison visuelle à angles équivalents ni un essai en jeu.

## Intégration Meshy au jeu

1. Télécharger le modèle Meshy **approuvé** et en conserver l'original/empreinte.
2. **Séparer d'abord les pièces mobiles** lorsque Meshy a produit un monobloc.
   L'importeur historique fait cette segmentation au moyen de masques propres
   au modèle ; réduire avant de segmenter risque de retirer les surfaces d'une
   tourelle et de modifier ses pivots.
3. Optimiser les morceaux non critiques, comparer la silhouette, les textures,
   le canon/rotor, l'orientation et les dimensions ; refuser une variante qui
   dégrade une fonctionnalité. Il est permis de garder l'original.
4. Conserver SHA-256, paramètres de réduction et rapport dans la PR. Adapter
   l'importeur du modèle **concerné**, vérifier UV et pivots à nouveau.
5. Relancer les tests du modèle, la suite du jeu, le build de distribution et le
   build Docker du jeu ; mesurer si possible plusieurs exemplaires en WebGL.
   Ne pas conclure à un gain de FPS à partir du seul nombre de triangles.

Les scripts historiques `scripts/import-meshy-textures.py` et
`scripts/import-meshy-b3.py` vérifient des SHA-256 d'originaux et, pour
certaines pièces, des masques dépendant de la géométrie. **Ne pas supprimer
ces contraintes ni remplacer les modèles déjà approuvés automatiquement.**
La conversion bout-en-bout d'un Meshy monobloc nécessite une étape
supplémentaire de séparation/reconstruction GLB par pièce ; l'outillage
actuel refuse ces fichiers par défaut, volontairement.

## CI et livraison

`assets-check.yml` construit **la même image Docker** que Compose et exécute
son `selftest` : fixture texturée, tourelle protégée, réduction effective,
conservation des UV et des images, refus des sorties dangereuses. Les PR ne
poussent aucun fichier ni image. `assets-publish.yml` publie séparément
l'image sur GHCR après push sur `main` touchant les outils ; pas avant.
La CI ne valide pas la qualité visuelle de tous les modèles Meshy.

Documentation amont :
- [glTF Transform](https://gltf-transform.dev/)
- [meshoptimizer](https://github.com/zeux/meshoptimizer)
- [Docker Compose run](https://docs.docker.com/reference/cli/docker/compose/run/)

## Protection des régions dans un GLB monobloc

Placer un fichier `zones.json` dans le dossier des originaux. Exemple (à
recalibrer sur **les coordonnées du GLB**, pas celles du jeu) :

```json
{"regions":[
  {"name":"rotor","mesh":"body","min":[-0.3,0.1,-0.2],"max":[0.3,0.5,0.2]},
  {"name":"canon","min":[-0.1,-0.2,0.6],"max":[0.1,0.2,1.0]}
]}
```

Les triangles dont la boîte englobante chevauche une région sont copiés
**à l'identique**, tandis que les autres triangles sont simplifiés avec leurs
frontières verrouillées. Valider le résultat avec le même argument `--regions`.
Les boîtes doivent être établies/revues pour chaque modèle : elles ne remplacent
pas une segmentation réelle des meshes articulés ni une inspection visuelle.
