# Performances — mesures et limites

## Collisions des tirs

`InsectIndex` dans `src/insect-hits.js` sélectionne les candidats avec une grille
spatiale de 8 cm et un parcours des cellules traversées par le segment. Les mêmes
sphères conservatrices que le parcours exhaustif couvrent toutes leurs cellules.
Les intersections précises, tolérance du moucheron, exclusions et ordre des
impacts ex æquo sont conservés. L'index est invalidé après l'animation des ennemis
et construit au premier tir, une seule fois par image. Les suppressions entre
deux tirs sont filtrées. En dessous de 128 insectes, pour les rayons très longs,
les populations concentrées ou les modèles surdimensionnés, le parcours direct
reste disponible. Aucun ennemi ni projectile n'est supprimé par cette optimisation.

Reproduction : `npm run bench:collisions`. Le scénario CPU compare les mêmes
modèles et 256 segments de 2 cm, avec reconstruction de l'index incluse, après
échauffement ; 12 échantillons alternés par méthode. Population dispersée dans
2 m ou concentrée dans 12 cm. La médiane dépend de la machine et de sa charge.

Mesure locale du 31 octobre 2026, Node 24, avant / après (ms par lot) :

| Insectes | Dispersés, direct | Dispersés, index | Concentrés, direct | Concentrés, index/repli |
| -------- | ----------------- | ---------------- | ------------------ | ----------------------- |
| 100      | 1,39              | 1,33             | 5,39               | 5,01                    |
| 300      | 4,27              | 2,43             | 20,32              | 21,96                   |
| 900      | 12,33             | 4,26             | 72,35              | 71,54                   |

Le cas compact conserve le coût des intersections et ne promet aucun gain ;
le repli évite le tri d'une grande partie de la population. Les temps CPU ne
mesurent ni FPS, ni GPU, ni WAN. Les plafonds de population restent inchangés.

`test-insect-index.mjs` compare les impacts au parcours exhaustif avec les six
espèces, rotations/échelles, portées, exclusions, frontières de cellule,
suppressions, transformations parentes et modèles surdimensionnés.

Essai en jeu : une rafale dans et autour d'une nuée, puis un tir personnel sur
chaque espèce ; vérifier les impacts, les alliés, le mobilier et les fins de vague.
L'environnement temporaire est indisponible ; utiliser `npm ci && npm start`
et le réseau UDP décrit dans [l'exploitation](operations.md).

## Traceurs instanciés

Sur WebGL, `TracerPool` conserve les objets de calcul des tirs mais les retire de
la scène. `flush()` recopie les matrices exactes du halo/cœur dans deux lots par
calibre, une seule fois après les sous-étapes balistiques et avant le rendu. Les
halos utilisent leur couleur individuelle ; les cœurs conservent leur matériau.
Géométrie, longueur, largeur minimale projetée, mélange additif et profondeur
restent identiques. La balistique, les collisions et le plafond de 256 traceurs
ne changent pas. Les traceurs personnels restent sur leur chemin actuel.
Le renderer logiciel conserve les meshes ordinaires, car il ne gère pas les
instances. Les lots vides ont zéro instance ; les ressources sont libérées avec
le pool. Les lots sont exclus du culling global pour ne pas masquer un tir actif
à cause d'une ancienne enveloppe ; ils ne comportent que 256 instances au total.

`node scripts/benchmark-tracers.mjs` inventorie les vrais objets de scène et les
triangles, puis mesure la préparation CPU des matrices (échauffement + médiane
sur 100 passages). Pour 256 tirs et deux calibres, 512 objets de rendu deviennent
4 lots ; le nombre de triangles est conservé. C'est un inventaire CPU, pas une
mesure de draw calls réels ni une promesse de FPS. Le coût de copie des matrices
reste présent.

Le comparateur `scripts/review-tracers.html` sert la même scène statique, les mêmes
256 tirs et la même caméra avec et sans instances ; il rapporte draw calls,
triangles, temps CPU de soumission et différences des pixels lus au GPU. Le temps
CPU ne constitue pas une mesure GPU. Depuis la racine, `python -m http.server 8089`
puis ouvrir `http://localhost:8089/scripts/review-tracers.html` et comparer les deux
images. Cette page est un outil local, absent des assets de jeu. Elle ne remplace
pas l'essai en rafales, les impacts et le confort en vraie partie. Le navigateur
de contrôle de cette session ne joint pas le serveur local (connexion refusée) :
aucune parité de pixels ni mesure GPU n'a été observée ici.
