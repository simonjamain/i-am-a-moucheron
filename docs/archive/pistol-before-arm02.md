> Archive antérieure à ARM-02. État actuel : [pistolet](../pistol-diagnosis.md).

# DIA-01 — Pistolet au bureau, diagnostic sans correction

29 octobre 2026. L’utilisateur demande de conserver le fonctionnement actuel.
Aucun réglage, commande ni calcul de `pistol()` n’est modifié dans ce lot.

## Boucle de reproduction

`node scripts/diagnose-pistol.mjs` extrait et exécute la véritable fonction
`pistol()` dans une scène Three.js contrôlée, avec ses vrais raycasts. Les
appels d’application de dégâts sont enregistrés ; il ne simule pas Pointer Lock.
Ce protocole couvre la géométrie et la décision de tir, pas le ressenti humain.

| Scénario                                                        | Résultat vérifié                                                                             |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Caméra à pied par défaut, distance 5,2 et inclinaison 0,24      | Direction Y −0,238 ; prolongement au sol à environ 5,52 m de référence devant le personnage. |
| Cible alignée à 22 cm du bureau                                 | Un impact de pistolet, 10 dégâts déclarés.                                                   |
| Même cible à 52 cm                                              | Aucun impact : portée limitée à 150 × 0,003 = 0,45 m du bureau.                              |
| Obstacle entre caméra et personnage, cible devant le personnage | Tir bloqué par cet obstacle, puisque le rayon part de la caméra.                             |

Les distances sont des mètres du décor ; les unités de référence sont divisées
par le ratio 3/1000. La pièce mesure plusieurs mètres du décor. Une portée de
45 cm couvre donc une petite partie de son volume.

## Causes confirmées et limites

La caméra de troisième personne regarde un point fixe près du torse. Le rayon
suit son axe optique, traverse ce point puis descend vers le bureau dans la vue
par défaut. Le canon visible n’est ni l’origine ni l’orientation du rayon ou du
traceur. Les obstacles situés derrière le corps, mais devant la caméra, peuvent
intercepter le tir. Ce sont des défauts de géométrie de visée et de présentation
reproduits ; ils ne prouvent pas une perte réseau de dégâts.

Le rayon utilise les meshes visibles, sans les étiquettes Sprite. Une cible
alignée à portée reçoit bien 10 dégâts dans le protocole. Les routes HTTP de
combat et leurs doublons restent couvertes par `test-backlog.mjs`. Aucune panne
d’application réseau propre au pistolet n’a été établie par cette analyse.

Le premier clic sans capture sert volontairement à la capture, pas au tir.
Espace en chute commande d’abord le parachute. Le tactile dépend du bouton Tir
et la manette de l’appui A/Croix : ces chemins restent inchangés. Le navigateur
de contrôle refuse Pointer Lock et ne fournit pas de tactile physique ni de
manette ; leur rôle dans le ressenti signalé reste donc non confirmé.

## Corrections possibles, différées

1. Définir une visée au réticule, puis construire le rayon depuis la bouche du
   pistolet vers le point visé. Vérifier les obstacles depuis cette bouche pour
   éviter le tir à travers une paroi proche du corps ; le traceur suit ce rayon.
2. Donner à l’orientation du personnage et du bras une direction de visée
   indépendante de l’orbite de caméra. Cela demande de préciser l’ergonomie
   souris, tactile et manette, pas seulement de déplacer le traceur.
3. Fixer explicitement la portée souhaitée en mètres du décor ou de référence.
   L’augmenter permettrait des tirs plus lointains, sans résoudre à elle seule
   l’origine du rayon ni la visée descendante.

Les règles restent : 10 dégâts, un tir par appui, pas de recharge, interdiction
à bord des équipements. Aucun de ces correctifs n’est appliqué ici.
