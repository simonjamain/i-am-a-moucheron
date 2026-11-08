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

Le profil prudent par défaut cible **75 % des triangles restants**
(`--ratio 0.75`, `--error 0.001`). Pour comparer d’autres variantes,
essayer `--ratio 0.5` ou `--ratio 0.25` sur des copies ; la réduction
réelle peut être moindre et n’est jamais garantie. `--error 0.001` limite la déformation géométrique
relative ; les bordures sont verrouillées. Pas de modification des coordonnées
UV, positions, normales, textures ou matériaux : seul le tableau des indices
des triangles peut changer. Il est possible qu'aucune simplification ne soit
réalisable dans ces contraintes. Les textures ne sont pas recompressées. Un fichier GLB peut **grossir**, même
avec moins de triangles (en-têtes et représentation des buffers) : le rapport
le signale et aucun gain de taille ou de FPS n'est garanti.

Sur Linux, si votre UID/GID hôte diffère de 1000, exécuter
`export ASSETS_UID=$(id -u) ASSETS_GID=$(id -g)` avant les commandes Compose.
Le conteneur conserve un utilisateur non-root et écrit avec les droits du
propriétaire du répertoire de sortie, sans modifier les originaux.

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

## Règle pour tout nouveau modèle Meshy

Cette règle s'applique **avant** l'outillage décrit ci-dessus et le complète
([issue #109](https://github.com/simonjamain/i-am-a-moucheron/issues/109), outillage
de l'[issue #78](https://github.com/simonjamain/i-am-a-moucheron/issues/78)).

1. **Propositions visuelles validées.** Présenter des images dans la direction
   artistique du jeu (low-poly, couleurs militaires lisibles à l'échelle miniature,
   cohérence avec la flotte existante). Aucune génération Meshy (modèle, texture,
   rig) n'est lancée sans l'accord explicite de l'utilisateur sur ces images ;
   consigner le lien ou la référence de cette validation dans la PR.
2. **Une référence isolée par pièce.** Chaque pièce mobile (châssis, roue, rotor,
   tourelle, canon, capteur…) dispose de sa propre image de référence, avec les
   vues utiles (face, profil, dessus, 3/4). Ne jamais envoyer une planche
   multi-vues ou multi-pièces comme une seule pièce.
3. **Articulations séparées dès la génération.** Générer les pièces mobiles comme
   des modèles distincts, puis documenter pour chacune : pivot (point de rotation
   dans le repère du modèle), axe(s) et amplitude, dimensions réelles visées et
   échelle d'import, origine des projectiles ou effets (bouche de canon).
4. **Conserver et vérifier.** Garder UV, textures et sources originales (tâche
   Meshy, SHA-256), puis vérifier le rendu sous plusieurs angles, chaque pièce
   mobile à ses butées, l'intégration en jeu (collision, aperçu de pose, tir) et
   les performances avec plusieurs exemplaires. Une simplification n'est adoptée
   qu'après ces contrôles (voir ci-dessous).

### Checklist de PR pour un asset Meshy

- [ ] Images proposées et **validées par l'utilisateur** avant génération (référence).
- [ ] Une image de référence isolée par pièce mobile.
- [ ] Tâches Meshy et SHA-256 des sources conservés.
- [ ] Pivots, axes, amplitudes et dimensions documentés par pièce.
- [ ] UV et textures d'origine préservées ; rendu comparé sous plusieurs angles.
- [ ] Pièces mobiles testées à leurs butées ; origine de tir à la vraie bouche.
- [ ] Mesures avant/après (triangles, octets, FPS si possible) et essai en jeu.

## Brique LEGO 2×4 du mur Castor

Premier asset passé par la règle ci-dessus ([issue #99](https://github.com/simonjamain/i-am-a-moucheron/issues/99)).

- Référence : image unique d'une brique 2×4 rouge isolée, vue 3/4, **validée par
  l'utilisateur** (SHA-256 `67e97d4a…c425`, conservée hors dépôt dans
  `assets/originals/brick-2x4/`). Pièce sans articulation : une seule référence suffit.
- Génération : Meshy image-to-3D, tâche `01a1ba16-7dde-758d-82fb-74eb5b54fa80`,
  `smart-topology` cible 1 000 triangles, **sans texture** (le jeu colore chaque
  instance), 5 crédits. GLB d'origine SHA-256 `42c02791…65c7`, 844 triangles,
  505 sommets ; aucune simplification nécessaire (rendu instancié).
- Axes et dimensions : tenons vers +Y, longueur X, profondeur Z (rapport 2:1).
  En jeu : pas `BRICK_PITCH` = 24 mm, rangée `BRICK_ROW` = 6 mm (corps), profondeur
  `BRICK_DEPTH` = 12 mm ; tenons visibles sur la rangée supérieure.
- Import : `PYTHONPATH=scripts python3 scripts/import-meshy-brick.py <GLB>` vérifie
  l'empreinte et écrit `src/meshy-brick-data.js` ; `scripts/test-brick-model.mjs`
  contrôle provenance, orientation et proportions.

## Personnage joueur (Meshy + Mixamo)

Modèle fourni et validé par l'utilisateur ([issue #111](https://github.com/simonjamain/i-am-a-moucheron/issues/111)) ;
tous les joueurs sont identiques pour l'instant, le modèle sera affiné.

- Original : `assets/originals/character/cowboy-boy.glb` (hors dépôt), SHA-256
  `29cbb213…ed0d`. Squelette Mixamo de 44 os, 1 556 triangles, texture 1024 px,
  clips `Idle_12`, `Walking`, `Running` (sur place).
- Import : `PYTHONPATH=scripts python3 scripts/import-character.py <GLB>` vérifie
  l'empreinte et écrit `src/character-data.js` (493 Ko) : positions/UV float32,
  poids sur 8 bits, rotations quantifiées en int16, translation des hanches seule.
- Rendu : `src/character-model.js` partage géométrie, matériau et clips ; chaque
  joueur possède ses os et son mixeur. Allure : repos sous 0,35 m/s, course dès
  3 m/s, vitesse de lecture liée à la vitesse réelle. Les poses absentes
  (pistolet au purgatoire, assis en DCA, chute ou parachute) orientent les os en
  espace monde ; au bureau, les joueurs n'ont pas d'arme et gardent les clips.
- Intégration : `graphics.humanoid()` garde le cadre invisible `arms`/`legs`/`rig`.
  Le bras du pistolet part de l'épaule du modèle et sa longueur place la crosse
  dans la paume ; balistique, dégâts et règles de tir sont inchangés. Aucune
  initiale ni teinte par joueur. `scripts/test-character.mjs` couvre ces points.

## Canon anti-matériel (obusier Meshy)

Modèle fourni par l'utilisateur pour l'[issue #113](https://github.com/simonjamain/i-am-a-moucheron/issues/113)
(volet canon anti-matériel ; la DCA mobile D2 reste à faire).

- Original : `assets/originals/howitzer/field-howitzer.glb` (hors dépôt), SHA-256
  `5d30ba36…6c5c`, un seul maillage « topologie intelligente » de 2 922 triangles,
  texture PNG 2K. Axes du modèle : tube vers −X, essieu selon Z, Y vers le haut.
- Découpage sans coupe : le maillage contient 77 coques déconnectées, chacune
  affectée entière à une pièce par `scripts/import-howitzer.py` (règles par boîte
  englobante, comptes verrouillés) : affût fixe (flèches, berceau en U, essieu)
  1 315 triangles, roue gauche 356, roue droite 372, berceau élevable (culasse,
  cylindres de recul, anneau des tourillons et bouclier) 558, tube reculant avec
  frein de bouche 321. Normales et UV d'origine conservés, texture en JPEG 1K
  (167 Ko), module `src/howitzer-data.js` de 399 Ko.
- Pivots : milieu de l'essieu (rotation horizontale de tout le canon, roues de
  rayon 0,082 en sens inverse, sans glissement), tourillons en (0,157 ; 0,045)
  dans le berceau en U, bouche au centre de la face du frein de bouche.
- Échelle joueur : roues de 1,10 m (mètres de référence), soit un canon d'environ
  6,4 m de long et 2 m de haut à côté du joueur de 1,80 m ; emprise de pose et
  collision 0,0105 (rayon balayé par la bouche, 3,4 m).
- Mouvements (`src/howitzer-model.js`) : pointage 45°/s, élévation 30°/s entre
  −5° et +40° (au-delà, la culasse traverserait les flèches) ; le tir part dans la
  direction réelle du tube. Recul de 30 % du tube en 0,06 s, retour en 0,6 s,
  secousse de 6 cm de l'affût. `scripts/test-howitzer.mjs` couvre ces points.

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
conservation des UV et des images, refus des sorties dangereuses. Le job Compose
exporte aussi cette fixture vers les volumes réels, exécute `optimize` et
`validate`, puis conserve le rapport JSON comme artifact GitHub Actions. Les PR ne
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
{
  "regions": [
    { "name": "rotor", "mesh": "body", "min": [-0.3, 0.1, -0.2], "max": [0.3, 0.5, 0.2] },
    { "name": "canon", "min": [-0.1, -0.2, 0.6], "max": [0.1, 0.2, 1.0] }
  ]
}
```

Les triangles dont la boîte englobante chevauche une région sont copiés
**à l'identique**, tandis que les autres triangles sont simplifiés avec leurs
frontières verrouillées. Valider le résultat avec le même argument `--regions`.
Les boîtes doivent être établies/revues pour chaque modèle : elles ne remplacent
pas une segmentation réelle des meshes articulés ni une inspection visuelle.

## Réintégrer un dérivé dans les scripts Python du jeu

Un fichier `optimisé.glb` n'est accepté par un importeur Meshy que si son
`optimisé.glb.report.json` correspond aux empreintes du dérivé **et de l'original
approuvé**, et si les régions critiques d'un GLB monobloc ont été déclarées.
La variante exploratoire `--allow-monobloc` est refusée par les importeurs.
Le GLB original demeure requis lors d'une intégration :

```sh
python3 scripts/import-meshy-textures.py stuka assets/optimized/stuka.glb \
  /tmp/meshy-stuka-data.js assets/originals/stuka.glb
python3 scripts/import-meshy-b3.py assets/optimized/b3.glb assets/originals/b3.glb
```

Les dépendances Python `trimesh`, NumPy et Pillow restent nécessaires **pour
l'importation vers le jeu uniquement** ; Docker + Compose suffisent pour produire
et valider le GLB. Les masques d'extraction des pièces du modèle d'origine
peuvent toujours nécessiter un réajustement spécifique après simplification.
Ne pas remplacer les modules d'une flotte validée sans comparaison visuelle,
vérification des pivots/armes et tests de régression. Le nouvel import est opt-in.

## Exemple concret : tourelle T-01 du Castor

[Quatre modules Meshy T-01 et leur import contrôlé](t01-asset.md) : import
depuis quatre GLB originaux au SHA-256 vérifié, textures source 2K
rééchantillonnées en WebP 1K pour l'exécution. La géométrie reste intacte
(13 626 triangles au total) : les pivots indépendants et les UV sont prioritaires
sur un taux de réduction arbitraire. Toute simplification supplémentaire doit
être mesurée et validée sur une copie avant substitution.
