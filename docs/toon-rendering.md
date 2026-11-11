# Rendu dessin animé (cell shading et contours) — versions 277 et 278

Depuis la version 278, le rendu « toon » est **le rendu du jeu pour tous les joueurs** :
trois paliers de lumière et des contours de 1,5 px (`TOON_LOOK` dans `src/toon.js`),
valeurs validées en partie lors du prototype de la version 277, où il était une option
personnelle désactivée par défaut. Il n'existe plus de réglage joueur (les champs ont
été retirés du panneau **Pilotage**). Il n'agit que sur le rendu WebGL ; le rendu logiciel
de secours reste tel quel.

## Éclairage par paliers

`installToonLighting` (`src/toon.js`) modifie une fois, au démarrage, les chunks de
shader de Three.js pour les matériaux éclairés (`MeshStandardMaterial` et
`MeshLambertMaterial`, donc tous les modèles Meshy et le décor) : l'éclairage direct
et la pondération de l'hémisphère passent par `toonQuantize`, qui découpe la lumière
en _N_ paliers (3 dans le jeu) avec une transition anti-crénelage étroite. Une
uniforme partagée (`toonBands`) vaut 3 ; à 0 l'éclairage redevient continu (usage
outils et tests), sans recompiler de shader. Les textures Meshy gardent leurs ombres cuites ;
l'effet est donc plus visible sur les surfaces unies et le décor.

## Contours

`OutlinePass` rend la scène dans une cible HalfFloat (4 échantillons) avec texture de
profondeur, puis une passe plein écran dessine le trait : la profondeur du
`logarithmicDepthBuffer` du jeu est décodée en profondeur inverse, et un pixel situé
juste derrière une surface plus proche (laplacien de la profondeur inverse positif,
nul sur un plan, même rasant) prend la couleur du trait (`#1b1510`). L'épaisseur
(0 à 4 px) suit la hauteur de l'écran. La passe applique aussi le _tone mapping_ et la
conversion sRGB, sauf au ciel (couleur de fond, jamais tone-mappée). Les effets
transparents (fumée, sprites) n'écrivent pas de profondeur : ils n'ont pas de contour.
Les contours ajoutent une passe plein écran et un rendu multi-échantillonné : la
mesure des images par seconde reste à faire sur des machines réelles.

`scripts/test-toon.mjs` vérifie le patch (une fois, uniforme partagée), l'enchaînement
des passes avec un moteur simulé, le décodage de la profondeur et l'absence de réglage joueur ; le
rendu a été vérifié hors partie avec un moteur logiciel.
