# Décor du purgatoire

Le purgatoire est une administration posée sur un nuage, en plein ciel bleu, environ
150 m réels au-dessus du bureau dans le même monde
([un seul monde](walking-network.md#un-seul-monde-pour-le-bureau-et-le-purgatoire)). Le
guichet de Saint Pierre est fait des meubles du **Cartoon Office Pack** (ceux de la carte
principale), à taille humaine ; le long de la file, seuls quelques meubles de salle
d’attente. Le décor n’ajoute aucun obstacle de marche : règles de la file dans
[file du purgatoire](purgatory-queue.md), vol, atterrissage et tirs dans
[ciel du purgatoire](purgatory-sky.md).

Code : `src/purgatory-scene.ts` (scène, mobilier, panneaux), `src/purgatory-clouds.ts`
(dôme et nuages du ciel), `src/purgatory-floor.ts` (nuage-sol volumétrique),
`src/saint-pierre-model.ts`, `src/vip-guard-model.ts` et `src/clipboard-model.ts`.
`client.js` crée la scène avec `createPurgatoryScene`, l’anime avec `update()`, dessine
la couche des nuages du ciel avec `prerender()` avant l’image, puis le nuage-sol avec
`postrender()` juste après. Les shaders sont écrits en TSL ([rendu WebGPU](webgpu.md)).

![Arrivée au purgatoire et vue vers le guichet](purgatory-scene-review.jpg)

## Le nuage-sol

On marche à moitié dans un nuage volumétrique, le même que ceux du ciel.

- La partie plate (`PURGATORY_HALL`, x de −10 à 10, z de −8 à 90) couvre le rectangle de
  marche de la file et l’arrière du guichet. La brume monte jusqu’aux genoux
  (`FLOOR_MIST.top`, 0,95 unité pour une âme de 2,46) et devient dense sous le sol
  (`FLOOR_MIST.dense`).
- À 2,5 unités au-delà de la salle (`FLOOR_MIST.margin`), le nuage se gonfle en
  bourrelets ; son bord (`CLOUD_FLOOR` = `PURGATORY_CLOUD`, ±16 en x, de −11 à 96 en z)
  s’effiloche et son ventre descend jusqu’à −7. Ce volume est aussi le solide du nuage
  (`purgatorySolids`).
- Rendu (`createFloorCloud`) : passe d’écran après la scène, par lancer de rayons (bruit
  fractal animé, marche vers le soleil, Beer-poudre, Henyey-Greenstein). Chaque rayon
  s’arrête sur la surface opaque la plus proche, lue dans la profondeur du rendu dessin
  animé (`ToonRenderer.depthTexture`) : une jambe n’est couverte que par la brume devant
  elle. Calcul à 40 % de la résolution (`FLOOR_LAYER_SCALE`) en gardant la profondeur la
  plus lointaine de chaque pixel (pas de halo autour des silhouettes). Au-dessus de la
  surface, un rayon saute jusqu’à elle avant de marcher à pas fins (64 au plus), sur au
  plus 160 unités : le nuage se voit de loin. Un rayon qui atteint la couche dense sans
  s’être rempli prend la couleur de la surface : aucun trou vers le ciel.
- Les insectes de la file flottent au-dessus de la brume (`hover`, aux trois quarts de sa
  hauteur).
- Sans shaders (rendu logiciel de secours), un nuage dessin animé le remplace : dessus
  plat sur la salle et bosselé autour (`cloudHeight`), boules du bord (`cloudPuffs`).
- La borne de marche est un mur invisible ; les meubles de salle d’attente juste au-delà
  (x = ±11,5) montrent où elle se trouve.

## Ciel et nuages

- Un dôme dessiné derrière tout (`createSkyDome`) : bleu du zénith à l’horizon, bleu
  aussi sous l’horizon, halo et disque du soleil dans la direction `SUN_DIRECTION`,
  partagée avec la lumière. Brume du ciel : [ce que l’on voit](purgatory-sky.md#ce-que-lon-voit).
- Huit nuages (`SKY_CLOUDS`) flottent autour, au-dessus et en dessous du nuage-sol, chacun
  calculé par lancer de rayons dans sa boîte : cumulus (dôme à base aplatie érodé par un
  bruit fractal), courte marche vers le soleil, Beer-poudre, Henyey-Greenstein à deux
  lobes et liseré argenté. Ils dérivent lentement.
- Ils sont calculés à demi-résolution (`CLOUD_LAYER_SCALE`) dans une cible à part, avant
  l’image ; le dôme compose cette couche derrière la scène. Ils ne passent donc jamais
  devant le nuage-sol ni les meubles, ce qui est juste car aucun ne se trouve entre la
  caméra et le décor.
- Sans shaders, ni dôme ni nuages : le fond est uni.

Le coût sur carte graphique réelle reste à mesurer ; le rendu logiciel n’en donne qu’un
ordre de grandeur.

## Mobilier et guichet

- `purgatoryProps()` liste chaque meuble du pack, placé à la main en unités de la scène
  (2,46 pour une personne de 1,8 m) ; `PURGATORY_FRAME` place le groupe dans le monde.
  Aucun meuble bloquant ne se trouve dans la salle de marche ni ne coupe les cordons VIP.
- **Le guichet** (`COUNTER`) : trois bureaux pour la file des insectes et un au guichet
  VIP, tournés vers Saint Pierre (écran, clavier, lampe de son côté ; papiers, agrafeuse
  côté visiteurs). Le bureau du milieu reste nu : seul son porte-bloc y est posé. Leur
  bord avant reste derrière le bord de la salle (z < 0).
- **L’arrière** : tableau blanc, trois classeurs, une photocopieuse.
- **Le long de la file** : deux coins salon (canapé, table basse et magazines), deux
  fontaines à eau, deux rangées de chaises visiteurs ; aucune fourniture de bureau.
- **Signalétique** : un seul pupitre « COUPE-FILE · Laissez-passer auprès du vigile »,
  peint aux couleurs des documents papier (`--paper`, `--ink`, police machine à écrire).
  Ni plaque sur les bureaux ni marquage au sol : les zones des guichets (`inDeskZone`,
  `VIP_ZONE`) sont invisibles.

## Le porte-bloc du guichet

Sur chacun des deux guichets (file et VIP), un porte-bloc est posé à plat, tourné vers les
âmes, juste à droite du milieu et dépassant du bord avant (`CLIPBOARD_AT` dans
`src/purgatory-queue.ts`, `clipboardYaw`), 10 % plus grand que nature (`CLIPBOARD_SCALE`).
Modèle 32 × 21 cm ([pipeline des assets](asset-pipeline.md#porte-bloc-du-guichet)).

- Seul le porte-bloc du guichet où Saint Pierre **nous sert** s’utilise
  (`clipboardWindow`) : visé par le réticule (ou le curseur libéré), il est entouré du
  **bleu signal** ; un clic ouvre les formulaires. Ailleurs, rien ne s’entoure.
- Une âme sans coupe-file n’utilise jamais le porte-bloc VIP.
- Au guichet principal, aucune place à tenir : il suffit d’être à portée du porte-bloc
  (`nearDeskClipboard`, environ 2,6 m, la portée du vigile). Les insectes, eux, se
  présentent toujours devant le milieu du bureau.
- Entrer dans la zone du guichet n’ouvre jamais les formulaires (`paperSuppressed` dans
  `client.js`) : on clique quand on est prêt.

## Saint Pierre

Modèle Meshy rigué sans animation ([pipeline des assets](asset-pipeline.md#saint-pierre)),
dessiné à 1,85 m et animé en procédural par `SaintPierre` :

- une respiration lente ;
- la tête tournée vers l’âme ou l’insecte qu’il sert (`servedAt`) ;
- quand il change de guichet, des pas qui suivent la distance parcourue ;
- pendant qu’il sert un insecte (`stamping`), le bras droit abat le tampon environ
  1,4 fois par seconde ; le bruit du tampon final reste celui du guichet.

## Le vigile de la file VIP

Modèle Meshy rigué sans animation ([pipeline des assets](asset-pipeline.md#vigile-de-la-file-vip)),
dessiné à 1,95 m (une tête de plus que les âmes), avec une attente en boucle : trois
respirations et un regard de chaque côté le long de la file.

Il s’utilise comme un poste d’engin ([règles d’interface](ui-guidelines.md)) : à portée
(`nearVipGuard`) et sans coupe-file, le vigile visé est entouré du **bleu signal**
(`PostHighlight`, `SelectionOutline`) ; un clic ouvre le coupe-file. Le masque du contour
suit son squelette et le tracé ne couvre que son rectangle d’écran, pour limiter le coût
du survol.

![Vigile visé, entouré du bleu signal](purgatory-guard-hover.jpg)

## Vérifier

`scripts/test-purgatory-scene.mjs` : salle plate là où l’on marche, nuage plus large que
la salle, nuages du ciel à l’écart du nuage-sol et dans la portée de la caméra, brume
jusqu’aux genoux, aucun meuble bloquant dans la salle ni sur les cordons, mobilier de la
file et du guichet, provenance et taille du vigile et de Saint Pierre, pas, tampon et
regard, construction de la scène sans document ni shader. `scripts/e2e-purgatory-walk.mjs`
rend le purgatoire dans le navigateur.
