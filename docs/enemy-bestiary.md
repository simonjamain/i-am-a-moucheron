# Bestiaire

Référence des espèces ennemies : statistiques, comportement, modèles, volumes de tir
et lisibilité. La composition des vagues et le mouvement des groupes sont dans
[les nuées](dense-swarms.md) ; le calcul de la puissance et le budget des vagues dans
[puissance des ennemis](progression.md#unité-commune) et [progression](progression.md). Ajouter une
espèce : [ajouter du contenu](adding-content.md).

## Espèces

Les statistiques sont saisies dans `SPECIES` (`src/waves.ts`) ; `ENEMY_TYPES` y ajoute
la puissance calculée (`src/enemy-power.ts`). La puissance est la seule mesure d'un
ennemi : coût dans le budget de vague, dollars rapportés par son âme au purgatoire,
dégâts infligés à la poubelle s'il l'atteint.

| Clé          | Nom               |     PV | Puissance | Vitesse (m/s) | Déplacement | Particularité                              |
| ------------ | ----------------- | -----: | --------: | ------------: | ----------- | ------------------------------------------ |
| `ant`        | Fourmi            |    100 |      0,58 |         0,085 | sol         | grandes colonnes                           |
| `roach`      | Cafard            |    400 |      1,38 |        0,0625 | sol         | attaque les barricades (6 PV/s)            |
| `midge`      | Moucheron         |    100 |      1,00 |          0,11 | air         | nuées denses                               |
| `guard`      | Abeille           |    600 |      4,03 |        0,0875 | air         |                                            |
| `mosquito`   | Moustique         |    150 |      2,06 |         0,115 | air         | esquives erratiques                        |
| `brute`      | Scarabée          |  1 500 |      6,93 |          0,07 | air         | carapace (ricochets)                       |
| `spider`     | Araignée pondeuse |  1 200 |     10,94 |         0,055 | sol         | 100 bébés à sa mort ; barricades (10 PV/s) |
| `spiderling` | Bébé araignée     |     10 |      0,08 |         0,075 | sol         | naissance uniquement                       |
| `rat`        | Rat               | 10 000 |     24,47 |       0,08075 | sol         | très gros, lent ; barricades (30 PV/s)     |

- **Vitesse.** `speedMps` est une vitesse de progression en mètres du bureau par
  seconde, indépendante de la taille du modèle, de l'effectif du groupe, du numéro de
  vague et de la longueur du trajet. Seul le réglage « Vitesse ennemis » de la salle
  (`balance.enemySpeed`) la multiplie (`enemyTravelSpeed`). La durée d'un trajet est
  sa longueur réelle divisée par cette vitesse, plus l'attente d'entrée.
- **Disponibilité.** Le directeur des vagues (`server/wave-preparation.js`) peut tirer
  toute espèce dès la vague 1 : seule la puissance restante du budget décide
  ([progression](progression.md#composition)). `ENEMY_UNLOCK_WAVE` ne fixe plus que la
  liste et l'ordre de tirage, et les déblocages du générateur de repli `wavePlan()`.
- **Attaques au sol.** Cafard, pondeuse et rat endommagent la barricade la plus proche
  quand elle bloque leur route (`GROUND_ATTACK_DAMAGE`, `src/ground-creatures.ts`) ; les
  défenses au sol sont décrites dans [le gameplay](gameplay.md).
- **Réglages de salle.** PV et vitesse sont multipliés par `balance.enemyHP` et
  `balance.enemySpeed` (`src/balance.ts`).

## Araignée pondeuse et bébés

La mort d'une pondeuse, par arme légère ou lourde, déclenche côté serveur **une seule**
naissance (`spawnOffspring`) : 100 bébés au point de décès, départs échelonnés de
20 ms, route `brood` vers la poubelle. Le roster est révisé (`rosterRevision`), y
compris pour les joueurs arrivés en retard. Les bébés passent au purgatoire comme les
autres ennemis ; chaque bébé qui atteint la poubelle y ajoute sa puissance (0,08). Le
roster de naissance est borné à `MAX_OFFSPRING_ROSTER` (20 000) : au plafond, une
naissance peut être partielle.

## Modèles, tailles et volumes de tir

Chaque espèce a un modèle Meshy riggé, dessiné en un `InstancedMesh` par espèce
(`MidgeBatch`, `src/flyer-batch.ts`, `src/walker-batch.ts`), sans niveau de détail.
Modèles, provenance, import, animations et zones de tir (`ANT_HIT`, `BEETLE_HIT`…) :
[catalogue des modèles](models.md#créatures). La zone de tir est un ellipsoïde du corps
sans pattes ni ailes, une sphère pour le moucheron (`MIDGE_SPHERE_RADIUS`) et le
scarabée. La phase de marche des terrestres avance avec la distance parcourue : les
pieds restent plantés quelle que soit la vitesse reçue du serveur.

**Tailles.** `ENEMY_SIZE_FACTORS` (`src/scale.ts`, lu par `enemySizeFactor()`) agrandit
d'un même rapport le modèle, sa zone de tir et le rayon de collision des armes lourdes,
identiques pour tous les joueurs ; PV, puissance et vitesse n'en dépendent pas. Ce sont
des choix de lisibilité, pas des proportions biologiques. Au repos, ailes et pattes
comprises, l'abeille mesure 15 mm, le scarabée 17 mm et le moustique 12 mm au bureau.
Les volants ont une tolérance de tir `FLYER_HIT_TOLERANCE` (1,3), le moucheron
`MIDGE_HIT_TOLERANCE`.

**Au sol.** `swarmFrame()` relève les terrestres de la profondeur de leurs pattes
(`GROUND_FOOT_DEPTH`, multipliée par l'échelle de l'espèce) ; les modèles riggés
posent leurs pieds `GROUND_FOOT_CLEARANCE` plus haut. Le même relèvement est calculé
côté client et serveur.

## Lisibilité et retours visuels

- **Apparitions.** Les points d'entrée (aérations décoratives) sont sur la périphérie,
  à plus de 3 m de la poubelle. `portalExit()` (`src/routes.ts`) décale le premier
  point vivant de `VISIBLE_SPAWN_INSET` (4 cm) vers l'intérieur : un insecte n'attend
  jamais dans le panneau plein d'une aération. Le décor garde son occultation normale ;
  aucun marqueur ne traverse les meubles.
- **Changement de vague.** Le modèle d'un ennemi est rattaché à sa vague et à son
  espèce : un identifiant réutilisé par une autre espèce libère l'ancienne géométrie.
- **Connexion tardive.** Un ennemi déjà en route n'est pas replacé au mur ; le client
  annonce une découverte tardive de la vague.
- **Blessures** (`src/insect-status.ts`). Un insecte blessé (0 < PV < max), âmes du
  purgatoire comprises, porte une barre de PV sans texte et des volutes de fumée ; des
  flammes s'ajoutent à 30 % de PV ou moins. Ces objets sont hors des surfaces de tir.
- **Chute.** Une mort aérienne visible joue un son de chute de 4 s qui suit le corps
  jusqu'à l'impact.

## Mouvement des terrestres côté client

Le serveur simule les terrestres (`groundAgents` du snapshot : position, cap, arrivée).
Le client les affiche avec 300 ms de retard (`GROUND_VISUAL_DELAY_MS`,
`src/ground-motion.ts`) en interpolant un historique borné de poses horodatées, sans
extrapolation : sans nouvelle réponse, la dernière pose est conservée et aucune
barricade n'est traversée par anticipation. L'historique repart à zéro au changement de
vague, de monde ou de phase.

## Vérifier

- `npm test -- enemy-bestiary` : naissances, identifiants, doublons, infestation, profils.
- `npm test -- enemy-speeds` : vitesses, trajet réel, nuées de 10 à 5 000, bébés,
  multiplicateur de salle.
- `npm test -- enemy-readability` : tailles projetées, hauteurs, zones de tir, pieds au sol.
- `npm test -- enemy-visibility` : aérations, modèles entre vagues, corps hors du mobilier.
- `npm test -- ground-motion` : interpolation des terrestres.
- `npm test -- feedback` : blessures, apparitions, découverte tardive.

Ces contrôles ne remplacent pas un essai WebGL/UDP réel pour l'animation, la fluidité
et la circulation des gros animaux entre les meubles.
