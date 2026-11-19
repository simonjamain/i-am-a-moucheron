# Physique Rapier — les véhicules au sol (versions 352 à 362)

Le jeu écrit sa physique à la main (vol, hélicoptère, `stepWalker`, balistique). Les
véhicules au sol roulent sur un vrai moteur, **Rapier** (Rust compilé en
WebAssembly). Version 352 : essai derrière `?rapier`. Version 353 : par défaut.
Version 354 : **l'ancienne conduite du Castor est supprimée** (au volant et à vide) ;
Rapier est chargé **derrière l'écran de chargement** (`homeReady` attend son
téléchargement) et un échec de chargement est une erreur de démarrage, comme une
ressource manquante.

Version 358 : le **char moyen** passe aussi sur Rapier. Version 359 : le **camion DCA**
et sa remorque aussi ; l'ancienne conduite au sol (`tank.js`) est supprimée.

Migration en cours : tous les véhicules **au sol** sont sur Rapier. Les avions, les
hélicoptères et la marche gardent leur physique d'origine (`flight.js`, `helicopter.js`,
`sortie.js`). Elle est obsolète : chaque migration en retire le code correspondant, et à
terme elle disparaît entièrement.

## Décision et périmètre

- Choix de Rapier plutôt qu'ammo.js (API lourde, mémoire gérée à la main), cannon-es
  (JavaScript pur, peu actif) ou Jolt (plan B si des chenilles sont voulues). Rapier
  fournit capsules, contrôleur de véhicule à roues, détection continue et un build
  déterministe, et tourne sous Node (tests headless).
- Ce que le moteur ne remplace pas : le vol (aérodynamique maison, réglée), les
  collisions de tirs contre les ennemis (grille spatiale, voir
  [performances](performance.md)) et les ennemis eux-mêmes (leur état vient du serveur).
- Étapes suivantes possibles, si l'essai convainc : capsules pour la marche des pilotes
  et pour les volumes de touche des ennemis, véhicules vides, autres véhicules au sol.

## Unités : la physique travaille à l'échelle humaine

La pièce est modélisée en mètres SI ; les pilotes y mesurent environ 3 cm. Pour que la
physique garde le « poids » d'un humain, elle travaille en **mètres humains** : un pilote
(5,6 unités de modèle) mesure 1,8 m, la gravité vaut 9,81 m/s². Tout passe par
`toPhysics` / `toWorld` (`src/physics-world.ts`) :

```
MODEL_UNIT      = 1,8 / 5,6            mètres physiques par unité de modèle
WORLD_PER_METRE = ACTOR_UNIT / MODEL_UNIT   mètres du monde par mètre physique (≈ 0,0173)
```

Rendre les joueurs deux fois plus petits ne change que `ACTOR_UNIT` : la physique, vue en
mètres humains, garde la même sensation. Le rapport de carte `MAP.ratio` ne sert qu'à
l'affichage des distances. Conséquences pour le Castor : sa vitesse maximale (52 m de
référence/s) devient 9 m/s (32 km/h), et sa gravité est la vraie (9,81 m/s² physiques,
soit environ 0,17 m/s² dans le monde) au lieu de 9,81 × `MAP.ratio` (environ 0,03 m/s²)
que les autres véhicules utilisent encore : un Castor qui tombe d'un bureau tombe plus
vite que les autres corps. La mort en cas de chute est conservée comme **hauteur** de chute (environ 6 cm de la
pièce), pas comme vitesse.

## Modules

| Module                            | Rôle                                                                                                                                                                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `vendor/rapier.compat.mjs`        | Rapier 0.21.0 (WASM en base64, 4,3 Mo, environ 1,7 Mo compressé), servi sur `/rapier.js`. Provenance et empreinte dans [vendor/README.md](../vendor/README.md). Chargé pendant l'écran de chargement.                                      |
| `src/physics-world.ts`            | Unités, `loadRapier`, `PhysicsWorld` : le sol et les boîtes `colliders` du jeu en solides fixes. Boîtes orientées (cadre de lacet) converties en cuboïdes tournés ; la liste est comparée à chaque pas (ajouts et retraits de placements). |
| `src/castor-physics.ts`           | `CastorRig` : châssis rigide, six roues à rayon et ressort (positions, rayon tirés du modèle Meshy), conduite, direction, freinage. Appelé par `physics()` dans `client.js`.                                                               |
| `src/tank-physics.ts`             | `TankRig` : coque rigide sur douze ressorts (un rayon par galet), chenilles commandées en vitesse de bande. Voir « Le char sur Rapier ».                                                                                                   |
| `src/truck-physics.ts`            | `TruckRig` : tracteur 6x4 et remorque sur une articulation Rapier, roues à rayon et ressort pour chacun. Voir « Le camion DCA sur Rapier ».                                                                                                |
| `scripts/test-truck-physics.mjs`  | Test Node (dans `npm test`) : échelle, essieux mesurés sur le maillage, attelage, virages, marche arrière, mur, chute.                                                                                                                     |
| `scripts/test-tank-physics.mjs`   | Test Node (dans `npm test`) : échelle, train de roulement mesuré sur le maillage, ressorts, conduite, pivot, mur, marches, chute.                                                                                                          |
| `scripts/test-castor-physics.mjs` | Test Node (dans `npm test`) : unités, géométrie, conduite, mur, solides orientés contre `rayCollider`, téléportation, chute.                                                                                                               |

## Conduite du Castor sur Rapier

- **Moteur** : poussée sur les six roues, `accel` = 4 m/s² au départ (départ progressif,
  issue #171), qui s'annule en approchant la vitesse maximale. Marche arrière limitée à la
  moitié de la vitesse maximale.
- **Freins** : une commande contraire au mouvement freine à environ 7 m/s², puis passe en
  marche arrière une fois arrêté. Sans commande : frein moteur d'environ 1,2 m/s², et
  maintien à l'arrêt.
- **Direction géométrique** (`wheelSteering`) : l'essieu avant braque, l'essieu central est
  le pivot, l'essieu arrière braque en sens inverse, comme sur un camion à plusieurs
  essieux ; la roue intérieure braque plus (Ackermann). Le volant tourne à 2,4 rad/s au plus
  et se recentre à cette vitesse.
- **Braquage limité par l'adhérence** (`steerLimit`) : pleine butée (0,55 rad) à l'arrêt,
  puis juste ce que les pneus tiennent (accélération latérale ≤ 5,5 m/s²). À pleine vitesse
  le rayon de virage est d'environ 13 m ; à basse vitesse le Castor tourne serré. En marche
  arrière, la rotation s'inverse naturellement comme sur une voiture (ancien
  `reverseSteering`).
- **Collisions** : le châssis rigide s'arrête sur les murs (les anciens `colliders` du jeu),
  sans rebond ni dégâts, et glisse ou s'arrête selon l'angle ; la masse est basse, pas de
  retournement dans les essais de slalom.

## Le char sur Rapier (version 358)

Même contrat que le Castor (`p`, `q`, `v`, `omega`), un rig par char conduit et un par
char vide simulé par l'hôte. Le modèle d'un char à chenilles :

- **Échelle d'un vrai char** : le modèle est un char moyen réduit (coque de 1,23 m pour les
  5,9 m d'un Sherman, échelle 0,208). À gravité égale, la similitude de Froude donne les
  masses en taille³, les vitesses en √taille et les taux de rotation en 1/√taille : 30 t
  deviennent 270 kg, 40 km/h deviennent 5 m/s, un pivot de 0,6 rad/s devient 1,3 rad/s. Les
  profils changent donc : `maxSpeed` 12 → 29 (m de référence/s, soit 5 m/s physiques),
  `turn` 0,7 → 1,3. **Le char est environ 2,4 fois plus rapide qu'avant.**
- **Suspension** : douze ressorts (six galets par côté) à rayons `castRay` ; raideur pour un
  affaissement de 4 cm au repos, amortissement à 45 %, fréquence de la coque 2,5 Hz (le 1,1 Hz
  d'un vrai char, mis à l'échelle). Le char pique du nez au freinage (environ 4°), se
  cabre en accélérant et penche dans les virages. `rig.wheelCompression` expose la
  compression de chaque ressort : c'est la donnée dont les chenilles déformables seront
  dessinées.
- **Chenilles, comme au clavier** (version 362) : Z pousse les deux chenilles vers l'avant, S les
  tire vers l'arrière ; Q (gauche) ou D (droite) ajoute une **différence de poussée** entre elles,
  **à toute vitesse et dès le départ** : avancer en tournant fait ralentir un peu la chenille
  intérieure pendant que le char accélère (avant la version 362, le char attendait sa vitesse
  finale pour tourner : une commande en vitesse de bande saturait la poussée des deux
  côtés). Q seul fait pivoter sur place (chenille droite vers l'avant, gauche vers l'arrière).
  La différence est un asservissement du taux de lacet voulu (voir plus bas), la poussée
  commune est limitée par l'adhérence (la charge du ressort × 0,9, ce qui tient une pente de
  42°). Le glissement latéral est un frottement sec (adhérence 0,4 de la charge), plus faible
  que l'adhérence longitudinale : le char pivote sur place (1,1 rad/s mesuré) et un braquage
  à pleine vitesse le fait glisser un peu.
- **Accélération douce** : 1,2 m/s² au départ (2,4 avant la version 362) ; 12 s pour atteindre
  la vitesse maximale. Le char monte quand même une marche de 18 cm : tant qu'une touche est
  appuyée, la pente est annulée (`slopeAssist`), comme un char qui a la puissance de grimper.
- **Franchissement** : la coque a le nez et l'arrière chanfreinés ; le char franchit une
  marche de 18 cm (environ deux rayons de galet) et bute sur 40 cm.
- **Géométrie du train de roulement** (galets, rayon, ligne de chenille) mesurée sur le
  maillage de la caisse ; `test-tank-physics.mjs` la contrôle sur les sommets du modèle.

Pistes (pas encore faites) : découpage du modèle du char en caisse, chenilles, galets et roue
motrice ; chenilles dessinées par un shader le long du profil des ressorts ; roues du Castor
et du camion animées par la physique plutôt que déduites du taux de lacet.

## Le camion DCA sur Rapier (versions 359 et 362)

Deux corps rigides, le tracteur (6x4) et la remorque du canon, liés par une **rotule**
(version 362) : trois rotations, chacune avec sa butée souple (couples de rappel sur les deux
corps) : lacet jusqu'à **100°** (1,75 rad, sous les 1,8 rad acceptés par le serveur),
tangage ±26° (0,45 rad), roulis ±17° (0,3 rad). Chacun a ses roues à rayon et ses ressorts :
trois essieux au tracteur (avant directeur, tandem arrière moteur), deux à la remorque. Les
roues sont des **pièces du modèle** (`wheel0…5`, `trailerWheel0…3`, voir « Roues et
chenilles dans les modèles ») : la physique lit leurs pivots et leur rayon (0,42 et 0,35
unité de modèle).

Réseau : l'état envoie la pose du tracteur, `trailerAngle` (lacet de la remorque dans le
repère du tracteur, jusqu'à ±1,8 rad) et, depuis la version 362, `trailerPitch` (tangage,
jusqu'à ±0,5 rad). Le roulis n'est pas envoyé. Le champ ajouté change le format des lots de
mouvement (`MOTION_BATCH_VERSION` 3) ; les ressources étant versionnées, une page ouverte
sur l'ancienne version doit être rechargée.

- **Échelle d'un vrai camion** (Froude, 0,277) : tracteur 130 kg (6 t), remorque 45 kg
  (2,1 t). Un vrai camion attelé ferait 5,8 m/s (40 km/h) ; **vitesse maximale doublée pour
  le jeu** (11,4 m/s, `maxSpeed` 66, il était à 10 avant le moteur physique).
- **Accélération douce** : 1,2 m/s² au départ (le double avant la version 362) ; il faut
  environ 25 s pour atteindre la vitesse maximale (poussée qui s'annule en approchant de
  celle-ci, frottement linéaire faible pour ne pas la manger).
- **Conduite** : comme le Castor (Ackermann, braquage limité par l'adhérence, freins,
  marche arrière lente), pivot de direction sur le milieu du tandem. Le frein de roue de
  Rapier est une impulsion de frottement, pas une force : étalonné à 4,8·b m/s² pour le
  tracteur de 130 kg (`BRAKE_PER_DECEL`). La remorque a un frein d'inertie qui suit celui du
  camion, ce qui l'empêche de plier au freinage.
- **Remorque** : elle se balance à l'opposé du virage (environ −0,05 rad en virage établi à
  vitesse), **pique et se cabre par rapport au tracteur** à l'accélération et au freinage
  (jusqu'à 0,08 rad mesuré au freinage), se recentre sans osciller, et **se met en
  portefeuille** en marche arrière à pleine butée de braquage (jusqu'à 100°). Un ressort de
  rappel de lacet (40 N·m/rad : un attelage anti-ballant) compense l'instabilité d'une
  remorque en marche arrière (elle part en portefeuille en quelques secondes si on la laisse) ;
  plus rigide il l'empêcherait de plier, plus souple il la ferait plier seule.
- **Roues** : les angles de braquage et la rotation des roues viennent de la vitesse et du
  taux de lacet, par la cinématique de la roue sur le sol (`steeredWheelPose`,
  `castor-wheels.ts`) : même géométrie d'Ackermann que la physique, aucun envoi réseau, valable
  aussi pour les autres joueurs. Les roues de la remorque ne font que rouler.
- **Réglage** : ressorts plus souples (60) que ceux du Castor (100) : un tracteur léger sur
  des ressorts plus raides rebondit et roule (mesuré) ; l'accélération latérale demandée est
  bornée à 2,8 m/s² (0,29 g, un camion chargé). La remorque est de niveau au repos (ses
  roues physiques touchent le sol même si le maillage de la remorque flotte de 0,18 unité).

## Accélérations (version 362)

Les accélérations au départ étaient trop vives : Castor 4 → 2,5 m/s², char 2,4 → 1,2 m/s²,
camion 2,4 → 1,2 m/s². Les vitesses maximales restent celles des profils (Castor 9 m/s, char
5 m/s, camion 11,4 m/s) ; la marge `topMargin` de chaque véhicule compense le frottement
pour que la vitesse atteinte soit celle du profil à 1-2 % près.

## Roues et chenilles dans les modèles

Les modèles Meshy du camion et du char sont un maillage texturé dont les pièces sont des
îlots de triangles soudés. `scripts/split-vehicle-parts.mjs` en extrait des pièces du rig
sans toucher un triangle, une UV ni la texture : le camion a six roues de tracteur
(`wheel0…5`, de l'avant vers l'arrière, gauche puis droite) et quatre de remorque
(`trailerWheel0…3`, rattachées à la remorque) ; chacune a son pivot au centre. Le script
refuse un module déjà découpé ; sa trace est écrite dans l'en-tête du module de données.
Le char sera découpé de la même façon (chenilles, galets, roues, pignons).

## Réglages et étalonnage

Tous les paramètres sont dans `CASTOR_PHYSICS`. Le frein de roue de Rapier n'est pas une
force : mesuré sur ce châssis (400 kg, six roues), une valeur `b` par roue ralentit
d'environ 1,85·b m/s² jusqu'à la limite d'adhérence ; `BRAKE_PER_DECEL` en tient compte et
`test-castor-physics.mjs` vérifie les décélérations obtenues. La raideur des ressorts (100)
donne une assiette de repos à 1,5 % de la hauteur du modèle.

Coût mesuré (Node, 2 boîtes) : environ 0,03 ms par pas de 1/120 s, soit 4 ms par seconde
de jeu.

## Limites et essais à faire en jeu

- Essai de conduite concluant (version 352, par le responsable du jeu). Les valeurs
  (accélération, freins, braquage, adhérence) restent une estimation réaliste, à régler au
  ressenti ; pas encore d'essai à plusieurs ni en réseau dégradé.
- Le châssis peut maintenant tanguer et rouler : le quaternion envoyé aux autres joueurs
  contient donc le roulis et le tangage, qui étaient nuls. Les caméras de conduite suivent
  la souris, pas le châssis.
- Chaque Castor sans pilote est simulé par un `CastorRig` (frein de maintien, gravité)
  chez l'hôte de la salle ; le corps Rapier suit la pose du jeu à chaque pas et se
  téléporte si le jeu déplace le véhicule (placement, apparition).
- Les roues affichées déduisent leur braquage du taux de lacet (`castor-wheels.ts`) ; le
  braquage réel de la physique n'est pas encore transmis au modèle.
- Le glissement le long d'un mur oblique est faible : les roues gardent le cap.
- Le serveur Node ne compresse pas les ressources : `/rapier.js` est servi en 4,3 Mo (environ 1,7 Mo si le reverse proxy compresse). Chaque joueur le télécharge une fois (URL immuable versionnée), pendant l'écran de chargement : sur une connexion lente, 4,3 Mo allongent d'autant ce premier chargement.
- Le gain CPU des tirs ne dépend pas de cet essai ; voir [performances](performance.md).

Essai en jeu : monter dans un Castor, accélérer, braquer à basse puis haute vitesse,
freiner, reculer, heurter un bureau et un mur oblique, tomber d'un bureau. Avec une partie à plusieurs : un autre joueur doit voir le Castor
suivre le même trajet sans saccade.
