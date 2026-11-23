# Rendu dessin animé (cell shading et contours) — versions 277 et 278

Depuis la version 278, le rendu « toon » est **le rendu du jeu pour tous les joueurs** :
trois paliers de lumière et des contours de 1,5 px (`TOON_LOOK` dans `src/toon.ts`),
valeurs validées en partie lors du prototype de la version 277, où il était une option
personnelle désactivée par défaut. Il n'existe plus de réglage joueur (les champs ont
été retirés du panneau **Pilotage**). Il n'agit que sur le rendu GPU (WebGPU, ou le backend WebGL 2 du même renderer :
voir [le rendu WebGPU](webgpu.md)) ; le rendu logiciel de secours reste tel quel.

## Éclairage par paliers

`installToonLighting` (`src/toon.ts`) enveloppe une fois, au démarrage, les modèles
d'éclairage de Three.js (`PhysicalLightingModel` et `PhongLightingModel`, donc
`MeshStandardMaterial` et `MeshLambertMaterial` : tous les modèles Meshy et le décor) :
le N·L de chaque lumière directe est remplacé par `toonQuantize(N·L)` (la couleur de la
lumière est multipliée par `quantifié / N·L`, ce que le modèle multiplie à nouveau par
N·L), et la pondération de l'hémisphère (`HemisphereLightNode.setup`) passe par la même
fonction. `toonQuantize` découpe la lumière en _N_ paliers (3 dans le jeu) avec une
transition anti-crénelage étroite. Une uniforme TSL partagée (`toonUniform`) vaut 3 ; à 0
l'éclairage redevient continu (usage outils et tests), sans recompiler de shader. Les
textures Meshy gardent leurs ombres cuites ; l'effet est donc plus visible sur les
surfaces unies et le décor.

## Contours

`OutlinePass` rend la scène dans une cible HalfFloat (4 échantillons) avec texture de
profondeur, puis une passe plein écran (nœuds TSL) dessine le trait : la profondeur du
`logarithmicDepthBuffer` du jeu (`d = log(w / near) / log(far / near)`) est décodée en
profondeur inverse, et un pixel situé
juste derrière une surface plus proche (laplacien de la profondeur inverse positif,
nul sur un plan, même rasant) prend la couleur du trait (`#1b1510`). L'épaisseur
(0 à 4 px) suit la hauteur de l'écran. La passe applique elle-même le _tone mapping_ du renderer (le tone mapping automatique
est coupé pendant qu'elle dessine) et laisse la conversion sRGB au renderer, sauf au ciel
(couleur de fond, jamais tone-mappée). Les effets
transparents (fumée, sprites) n'écrivent pas de profondeur : ils n'ont pas de contour.
Depuis la version 405, le trait **s'efface dans le brouillard** comme la surface
qu'il borde : la passe reconstruit le point du monde de la surface la plus proche
autour du pixel (profondeur, focale et position de la caméra) et applique la même
formule que les matériaux (couche de nuages du bureau, `officeFogLayer`, plus le
brouillard de distance ; brouillard linéaire au purgatoire). Une tige qui monte
dans les nuages n'y laisse donc plus de trait noir.
Les contours ajoutent une passe plein écran et un rendu multi-échantillonné : la
mesure des images par seconde reste à faire sur des machines réelles.

`scripts/test-toon.mjs` vérifie le patch (une fois, modèles d'éclairage enveloppés, uniforme partagée), l'enchaînement
des passes avec un moteur simulé, le décodage de la profondeur et l'absence de réglage joueur ; le
rendu a été vérifié hors partie avec un moteur logiciel.

## Viseurs et traçantes

Le cercle et le point central du viseur des canons et de la consigne souris sont
blancs opaques avec un liseré sombre ; aucun réglage en jeu. Les traçantes ont un
cœur ambre/orange et un contour brun sombre en mélange normal, dessinés dans cet
ordre (contour puis cœur), y compris en rendu instancié. La largeur projetée du
cœur vise au moins 2 pixels ; seule la largeur change, jamais la trajectoire ni
les collisions. Brouillard et obstacles masquent toujours les tirs.
Contrôles : `test-tracer-contrast.mjs`, `test-instanced-tracers.mjs`.

## Brouillard spatial et plafond

Le brouillard de distance blanc est léger (densité 0,018). La couche de nuages
commence à **2,2125 m** (`OFFICE_FOG_START`) et s'épaissit jusqu'au haut des murs,
**2,7 m** (`OFFICE_CLOUD_TOP`, hauteur des murs du pack de bureau) ; au-delà de **3,95 m**
(`SKY_FLOOR`, l'ancien plafond de vol), on entre dans le
[ciel du purgatoire](purgatory-sky.md). La densité
croît avec la hauteur et les matériaux calculent l'épaisseur traversée par chaque
rayon : regarder vers le haut depuis le sol révèle la couche. Un voile blanc
uniforme monte entre 40 % et 100 % du plafond (jusqu'à 85 % d'opacité) ; le HUD
reste devant. La pièce est fermée par quatre murs du pack ; au-dessus d'eux, le fond
de scène a la couleur du brouillard (`OFFICE_HAZE`, blanc) : il n'y a plus d'enveloppe
colorée autour de la pièce (l'ancienne laissait voir un mur vert-de-gris au sud). Le
purgatoire garde son brouillard linéaire, sans voile d'altitude.
Contrôles : `test-office-clouds.mjs` ; rendu réel : `e2e-office-clouds.mjs`
(Playwright + Chromium, hors `npm test`, dans `npm run e2e` et sa CI ; variables `PLAYWRIGHT_PATH`,
`CHROMIUM_PATH`, `CLOUD_SCREENSHOT`).
