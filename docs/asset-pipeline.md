# Pipeline des assets 3D

Comment un modèle 3D entre dans le jeu : règle de validation des modèles Meshy,
import hors ligne vers des modules TypeScript, outil Docker d'optimisation et contrôles.
La provenance, les pivots et les dimensions de chaque modèle intégré sont dans le
[catalogue des modèles](models.md) ; l'ajout d'une espèce ou d'un véhicule suit
[ajouter du contenu](adding-content.md).

## Règle pour tout nouveau modèle Meshy

Cette règle s'applique **avant** toute génération et avant l'outillage ci-dessous.

1. **Propositions visuelles validées.** Présenter des images conformes à la
   [direction artistique](art-direction.md) (low poly, couleurs militaires lisibles à
   l'échelle miniature, cohérence avec la flotte). Aucune génération Meshy (modèle,
   texture, rig) n'est lancée sans l'accord explicite de l'utilisateur sur ces images ;
   consigner le lien ou la référence de cette validation dans la PR.
2. **Une référence isolée par pièce.** Chaque pièce mobile (châssis, roue, rotor,
   tourelle, canon, capteur…) a sa propre image de référence, avec les vues utiles
   (face, profil, dessus, 3/4). Ne jamais envoyer une planche multi-vues ou
   multi-pièces comme une seule pièce.
3. **Articulations séparées dès la génération.** Générer les pièces mobiles comme des
   modèles distincts (ou au moins des îlots de maillage séparés), puis documenter pour
   chacune : pivot (point de rotation dans le repère du modèle), axe(s) et amplitude,
   dimensions visées et échelle d'import, origine des projectiles ou effets (bouche).
4. **Conserver et vérifier.** Garder UV, textures et sources originales (tâche Meshy,
   SHA-256), puis vérifier le rendu sous plusieurs angles, chaque pièce mobile à ses
   butées, l'intégration en jeu (collision, aperçu de pose, tir) et les performances
   avec plusieurs exemplaires. Une simplification n'est adoptée qu'après ces contrôles.

Un modèle fourni déjà fait par l'utilisateur (personnages, créatures, remodelages de
véhicules) ne coûte aucune génération, mais suit les points 3 et 4.

### Checklist de PR pour un asset Meshy

- [ ] Images proposées et **validées par l'utilisateur** avant génération (référence).
- [ ] Une image de référence isolée par pièce mobile.
- [ ] Tâches Meshy et SHA-256 des sources conservés.
- [ ] Pivots, axes, amplitudes et dimensions documentés par pièce.
- [ ] UV et textures d'origine préservées ; rendu comparé sous plusieurs angles.
- [ ] Pièces mobiles testées à leurs butées ; origine de tir à la vraie bouche.
- [ ] Mesures avant/après (triangles, octets, FPS si possible) et essai en jeu.

## Importer un modèle dans le jeu

Le navigateur ne lit jamais de GLB : un script Python hors ligne
(`scripts/import-*.py`) convertit l'original en module `src/*-data.ts` embarqué par
l'assembleur. Conventions communes :

- **Originaux hors Git**, dans `assets/originals/<modèle>/` (ignoré). La plupart des
  importeurs épinglent le SHA-256 de la source approuvée et refusent tout autre fichier
  (`verify_meshy_source` de `scripts/meshy_provenance.py`, ou comparaison directe) ;
  `import-meshy-vehicle.py` et `import-meshy-castor.py` l'inscrivent seulement. Le module
  généré porte l'empreinte dans son en-tête ou son champ `sourceSha256`. Ne jamais
  modifier un module `*-data.ts` à la main.
- **Géométrie intacte** : tous les triangles et UV d'origine sont gardés ; les pièces
  mobiles sont séparées par îlots ou coques déconnectées (connectivité soudée, sans
  tenir compte des coutures UV), jamais par simplification. L'import échoue si le
  découpage attendu (nombre d'îlots, de roues…) ne correspond pas.
- **Texture** : seule la carte de couleur est reprise, réduite à 1 024 px (512 px pour
  les créatures) en JPEG, ou en WebP pour la T-01 et la Gatling (atlas PNG d'origine pour le décor du
  bureau) ; les autres cartes PBR
  ne sont pas chargées. Positions, UV et indices sont le plus souvent quantifiés
  (entiers 16 bits), selon l'importeur.
- **Repère** : Y vers le haut ; l'avant d'un véhicule ou d'une arme (souvent −X ou +Z
  chez Meshy) est tourné vers −Z du jeu sans miroir, contact au sol à −`gear` pour les
  véhicules, échelle fixée par l'envergure ou la longueur du profil de `src/fleet.ts`.
- **Squelettes** : les créatures gardent le rig Meshy (os et matrices de liaison) ;
  l'import peut corriger des poids ou ajouter des os d'ailes, sans toucher géométrie,
  UV ni texture. L'animation est procédurale (`src/rigged-creature.ts`) sauf clip
  fourni.
- **Retouches de rig** : des scripts `scripts/rig-*.mjs`, `split-vehicle-parts.mjs` et
  `attach-castor-rims.py` réorganisent ensuite les pièces d'un module existant (roues,
  chenilles, tube) sans changer triangle, UV ni texture, et l'inscrivent dans son
  en-tête ; détail par véhicule dans le [catalogue](models.md#véhicules) et la
  [physique Rapier](physics-engine.md#roues-et-chenilles-dans-les-modèles).

Dépendances Python de l'import seulement : NumPy, trimesh, Pillow (SciPy pour
certains scripts). Exemple : `PYTHONPATH=scripts python3 scripts/import-midge.py
assets/originals/midge/angry-little-fly.glb`. Chaque modèle a un test
`scripts/test-<modèle>*.mjs` (provenance, triangles, UV, pivots, contact au sol).

`scripts/import-meshy-textures.py`, `import-meshy-b3.py`, `import-meshy-h2.py`,
`import-meshy-m1.py` et `import-meshy-fleet.py` ne produisent aucun module actuel
(empreintes et masques d'anciennes tâches Meshy) : ne pas les relancer.

Un asset acheté ou fourni hors Meshy (décor du bureau, porte-bloc) échappe à la règle
de validation Meshy mais suit la même discipline : original hors Git, empreinte
épinglée, licence respectée ([catalogue](models.md#cartoon-office-pack-bloxbits)).

## Outil Docker d'optimisation

Outil de développement ponctuel (`compose.assets.yaml`, `tools/assets/`), sans réseau,
port, GPU, coût Meshy ni déploiement ; il n'est pas intégré au conteneur du jeu.
Prérequis sur l'hôte : Docker et Docker Compose (pas Node ni Python). L'image utilise
Node 22, glTF Transform et meshoptimizer.

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

- **Profil prudent** par défaut : `--ratio 0.75 --error 0.001` (75 % des triangles
  visés, déformation relative bornée, bordures verrouillées). Essayer `--ratio 0.5` ou
  `0.25` sur des copies ; la réduction réelle peut être moindre ou nulle.
- **Seul le tableau des indices change** : UV, positions, normales, textures et
  matériaux restent intacts, les textures ne sont pas recompressées. Un GLB peut
  **grossir** malgré moins de triangles ; aucun gain de taille ou de FPS n'est garanti.
- **Pièces protégées** : les maillages dont le nom correspond à
  `rotor|prop|turret|tourelle|canon|barrel|wheel|roue|hinge|pivot|gun` ne sont pas
  simplifiés ; `--protect REGEX` remplace ce motif.
- **GLB monobloc** : refusé sans boîtes de protection `--regions zones.json` (voir
  ci-dessous) ; `--allow-monobloc` permet une exploration sans validation des pièces
  mobiles, refusée ensuite par les importeurs.
- **Fichiers** : originaux montés en lecture seule ; sorties dans `assets/optimized`
  sans écraser l'existant (sauf `--overwrite`). `ASSETS_ORIGINALS` et `ASSETS_OUTPUTS`
  changent ces dossiers. Le conteneur tourne en UID 1000 : sous Linux, exporter
  `ASSETS_UID=$(id -u) ASSETS_GID=$(id -g)` si besoin. Ne pas versionner originaux ni
  variantes.
- **Rapport** : chaque sortie a un `.glb.report.json` (SHA-256 source/dérivé, versions,
  triangles, tailles, avertissements). `validate` compare nœuds, matériaux, octets des
  images, attributs de sommets et indices ; il ne remplace **pas** une comparaison
  visuelle à angles équivalents ni un essai en jeu.

### Protection des régions dans un GLB monobloc

Un fichier `zones.json` dans le dossier des originaux déclare des boîtes, dans **les
coordonnées du GLB** (pas celles du jeu) :

```json
{
  "regions": [
    { "name": "rotor", "mesh": "body", "min": [-0.3, 0.1, -0.2], "max": [0.3, 0.5, 0.2] },
    { "name": "canon", "min": [-0.1, -0.2, 0.6], "max": [0.1, 0.2, 1.0] }
  ]
}
```

Les triangles dont la boîte englobante chevauche une région sont copiés à
l'identique ; les autres sont simplifiés, frontières verrouillées. Valider avec le
même `--regions`. Les boîtes se revoient pour chaque modèle et ne remplacent ni une
segmentation des pièces articulées ni une inspection visuelle.

### Réintégrer un dérivé

`verify_meshy_source(source, sha, original)` (`scripts/meshy_provenance.py`) accepte
un `optimisé.glb` seulement si l'original approuvé est fourni, si le
`optimisé.glb.report.json` correspond aux deux empreintes, s'il n'est pas issu de
`--allow-monobloc` et si un monobloc a déclaré ses régions. Les importeurs actuels
n'appellent cette fonction qu'avec l'empreinte de l'original : intégrer un dérivé
demande d'adapter l'importeur du modèle concerné (passer l'original), puis de
revérifier UV, pivots et armes. Démarche :

1. Séparer d'abord les pièces mobiles (l'importeur), optimiser ensuite les seules
   pièces non critiques ; réduire avant de segmenter peut retirer des surfaces d'une
   tourelle et déplacer ses pivots.
2. Comparer silhouette, textures, canon ou rotor, orientation et dimensions ; refuser
   une variante qui dégrade une fonction. Garder l'original est permis.
3. Consigner SHA-256, paramètres et rapport dans la PR ; relancer les tests du modèle,
   `npm test`, le build Docker du jeu, et mesurer plusieurs exemplaires en WebGL. Ne
   pas conclure à un gain de FPS sur le seul nombre de triangles.

## CI

`.github/workflows/assets-check.yml` (job « Asset tool Docker and UV tests ») construit
la même image que Compose et exécute son `selftest` (fixture texturée, tourelle
protégée, réduction effective, UV et images conservés, refus des sorties dangereuses),
puis `optimize` et `validate` à travers de vrais montages Compose. Il essaie aussi
l'optimiseur sur les géométries des quatre modules T-01 reconstruites en GLB de test
(`tools/assets/test-t01-optimizer.mjs`, artifact `t01-meshy-geometry-optimization`) et
lance `scripts/test-meshy-provenance.py`. Ces variantes sont exploratoires et jamais
utilisées en jeu. `assets-publish.yml` publie l'image de l'outil sur GHCR après un push
sur `main` touchant l'outillage. La CI ne juge pas la qualité visuelle des modèles.

Documentation amont : [glTF Transform](https://gltf-transform.dev/),
[meshoptimizer](https://github.com/zeux/meshoptimizer),
[Docker Compose run](https://docs.docker.com/reference/cli/docker/compose/run/).
