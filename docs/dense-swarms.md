# Nuées : composition et mouvement

Comment une vague devient un roster d'ennemis et comment ces ennemis se déplacent.
Les espèces sont décrites dans [le bestiaire](enemy-bestiary.md), le budget et la
montée en difficulté dans [progression](progression.md) et
[puissance des ennemis](enemy-power.md).

## Composition d'une vague

Le roster est tiré par `prepareRoster()` (`server/wave-preparation.js`) en meutes
(`PACKS`) : règles de tirage, tailles, colosse et calendrier dans
[progression](progression.md#composition). Les volants attendent 2 s à leur entrée, les
terrestres 0,4 s, et les membres d'une meute sortent l'un après l'autre (`memberGap`).
Le réglage de population de la salle (`scaleRoster`, `src/balance.js`) agrandit ou
réduit l'effectif en le répartissant sur toute la composition.

`wavePlan()` (`src/waves.ts`) est un générateur déterministe de repli, utilisé quand
aucun roster n'a encore été reçu ; il multiplie chaque moucheron source par
`MIDGE_SWARM_MULTIPLIER` (5). `debugSwarmRoster()` construit des nuées exactes pour les
tests.

## Trajets

Les trajets (`src/routes.ts`) partent des aérations périphériques
(voir [lisibilité](enemy-bestiary.md#lisibilité-et-retours-visuels)) et sont
paramétrés par longueur d'arc, partagés par le client et le serveur, y compris
l'échéance d'arrivée à la poubelle. Les volants font des détours en altitude avant la
descente finale. La route nominale des terrestres suit une grille A\* simplifiée par
visibilité (`src/route-navigation.ts`), générée depuis les colliders du bureau, avec une
marge de 25 mm (18 mm pour les volants) ; les aérations ne bloquent pas leur propre
sortie. En jeu, le serveur guide chaque terrestre sur un champ de flux qui tient compte
des barricades : voir [navigation terrestre](gameplay.md#navigation-terrestre).

## Mouvement des volants

`swarmFrame()` (`src/waves.ts`) calcule les positions directement depuis le temps de
jeu absolu, sans historique d'images : tous les clients, y compris ceux qui arrivent
en retard, voient la même nuée sans serveur temps réel dédié.

- **Moucherons** (et bébés araignées) : décalage procédural autour de la route, tiré de
  l'identifiant et de `routeSeed` (`midgeDisplacement`), avec une petite oscillation
  temporelle et une enveloppe qui s'annule à l'entrée et à l'arrivée. L'étendue dépend
  de la taille du groupe (`swarmSpread`, bornée à 20 fois le rayon de base en vol,
  8 au sol), pas l'agitation individuelle. Aucun moucheron ne dépend de ses voisins :
  en supprimer un ne déplace aucun survivant.
- **Moustiques** : esquives erratiques locales, sans dominer la vitesse de progression.
- **Autres espèces** : pilotage de groupe borné inspiré des
  [Boids de Craig Reynolds](https://www.red3d.com/cwr/boids/) (séparation, cohésion,
  alignement) entre voisins à moins de 24 m de référence, trouvés par une grille
  spatiale et sommés dans l'ordre des identifiants (résultat identique sur tous les
  clients). La correction est plafonnée et s'éteint aux extrémités du trajet.
- **Terrestres** : le serveur simule leur position (`groundAgents`, foule de
  `src/ground-crowd.js`) ; `swarmFrame()` reprend cette pose autoritaire. Sans pose, le repli place les membres d'une meute en files côte à côte
  (`GROUND_LANES`). Affichage côté client :
  [bestiaire](enemy-bestiary.md#mouvement-des-terrestres-côté-client).

## Réseau et rendu

Le roster complet part dans la réponse fiable à la première synchronisation, après un
changement de vague ou une révision (`rosterRevision`, naissances, ennemis de debug) ;
les `sync` intermédiaires l'omettent et le client garde le précédent. Morts et dégâts
sont transmis normalement. Les volants n'envoient aucune position : chaque client les
recalcule.

Tous les moucherons vivants sont dessinés en un seul appel par `MidgeBatch`
(`src/midge-batch.ts`) ; chaque ennemi garde un objet léger hors scène (identifiant,
position, PV, effets). Les tirs légers testent la sphère du moucheron par intersection
rayon–sphère exacte, avec présélection `InsectIndex` ; les armes lourdes utilisent le
même rayon après une boîte englobante balayée. Mesures de charge :
[performances](performance.md).

## Vérifier

- `npm test -- wave-preparation` : meutes, budget, colosse, départs.
- `npm test -- dense-swarms` : parité du voisinage avec le parcours exhaustif,
  invariance après suppression d'un moucheron, échantillons CPU 1k/5k/10k.
- `npm test -- midge-batch` : instances, matrices, collisions, suppressions.
- `npm test -- roster-sync` : omission du roster inchangé, resynchronisation.
- `npm test -- ground-paths` et `npm test -- ground-crowd` : chemins et foule au sol.

Un benchmark CPU n'est pas une mesure jouable : taille du premier snapshot, rendu GPU
et réseau à plusieurs joueurs restent à mesurer en partie réelle.
