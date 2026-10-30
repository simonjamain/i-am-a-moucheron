# Retours multijoueurs, HUD et déploiement au sol

Lot MORT-01 à RAD-02, Node/RAM/UDP, 29 octobre 2026. Source livrée en ZIP ; le
Worker historique n’héberge pas ces nouvelles règles. Les spécifications du backlog
sont les décisions validées ; ce document décrit leur réalisation et ses limites.

## Mort et observation volontaire

Le serveur retire immédiatement le joueur des sièges et des corps actifs. Son
état `awaitingPurgatory` le laisse mort sans âme matérialisée et refuse toutes ses
actions, sauf synchronisation, accès au purgatoire et remise à zéro. Le client
fige position, orientation et champ de vue de la caméra au décès, tout en continuant
à afficher et recevoir la partie. Aucune minuterie n’impose la transition.
La petite fenêtre « Accéder au purgatoire » déclenche `enter-purgatory`, protégé
par incarnation et idempotent. Un clic répété ne crée pas de deuxième âme.

La même observation sépare mort au purgatoire et accès au super purgatoire. Une
mort au super purgatoire reste une nouvelle incarnation sur place, avec les cinq
papiers réinitialisés. Reset supprime l’observation. Le timeout réseau de présence
reste 12 s ; une nouvelle connexion est un nouveau joueur, sans restaurer la vie
ou l’observation de l’ancien. L’ancien expire sans fabriquer une résurrection.
Le secret de reprise conserve le contrat de lit et la couleur, pas une vie active.
Les règles de trois/cinq signatures restent inchangées après l’accès volontaire.

## HUD et aide permanente

Les panneaux latéraux repliables sont retirés de l’affichage. `live-hud.js` fournit
une aide blanche permanente en bas à gauche, selon marche, chute, placement et
poste. Ni survol ni ouverture temporaire. Les anciens blocs d’aide superposés sont
masqués. Les menus suspendent les commandes ; l’observation les neutralise.

Près du viseur : vitesse de l’appareil, PV et petite jauge de coque, balles du poste,
bombes pour les pilotes équipés. Le pilote utilise sa vitesse et ses PV locaux
minorés par ceux du serveur ; les autres postes utilisent la coque partagée. Les
réserves MG déduisent les tirs prédits non acquittés. Un réapprovisionnement est
visible sans survol ; 0 balle reste affiché. Les repères suivent le viseur et le
zoom. Les informations tank et DCA restent contextuelles, avec leur aide complète.

## Réserves gratuites et achats de véhicules

Chaque type initial garde **un exemplaire de réserve prêt**. Le premier décollage
retire définitivement `ready` à cette coque et crée son remplaçant ; les avions
utilisés restent en partie. Revenir se poser ne recrée pas une réserve supplémentaire.
Détruire un exemplaire prêt le remplace ; détruire un avion déjà utilisé ne crée
pas un deuxième remplaçant. Le tick et les commandes synchrones arbitrent les cas
concurrents. Les coques achetées n’entrent jamais dans cette réserve gratuite.

Tous les modèles sont vendus : chasseur M1 **8 $**, bombardier B3 **16 $**, Stuka
**12 $**, tank **10 $**, Spitfire **24 $**. Les deux nouveaux prix sont choisis dans
l’économie existante ; `shopPrice` reste partagé. Achat **à pied**, signature du
bon puis aperçu et E pour poser, au sol ou sur mobilier réellement porteur.
Aucun appareil acheté n’apparaît automatiquement à Alpha. La route publique
`buy` refuse désormais les véhicules : passer par `purchase-sign` et
`place-purchase`. Les anciens tests d’armes préparent leurs coques directement
avec le helper interne ; les nouveaux tests exercent le parcours public complet.

Les empreintes prennent en compte envergure et longueur, avec un mètre de référence
de marge. Le serveur vérifie la base entière, hauteur libre, proximité et autres
coques. Le bon payé reste personnel et reprenable après Échap ; la pose ne débite
pas de nouveau. Invalide, répétée ou concurrente, elle ne duplique ni coque ni débit.
Les règles de remboursement à expiration du joueur et de reset restent celles du
[lot précédent](clean-flight.md#prix-bon-signé-et-pose). Un tank peut ainsi être
acheté après une descente et posé sur le plancher, sans retour à la station.

## Spitfire et performance des tirs

Le stock du S6 est **1 000 balles communes**, chaque projectile consomme une balle.
Les six armes gardent un intervalle nominal de 0,06 s par arme. Décalages de
**0 / 2 / 4 / 6 / 8 / 10 ms** dans chaque salve ; à faible cadence d’images,
plusieurs départs sont rendus à l’image suivante. Les quatre dernières balles
forment une salve partielle : aucune perte artificielle du reliquat. À cadence
nominale, 166 salves complètes puis 4 balles représentent environ **10 secondes**.
Les performances de pilotage +75 % / +45 %, le prix et le ravitaillement restent.
`GunSalvos` borne sa file à 128 départs et invalide les départs au changement de
poste, menu, perte de focus ou décès. Les départs distants ont les mêmes petits
écarts visuels ; ils n’appliquent jamais de dégâts supplémentaires.

La cause mesurée principale du coût des tirs était la recherche détaillée de
chaque insecte et de ses matrices pour **chaque sous-segment de chaque balle**,
même très loin de sa trajectoire. Une phase sphérique conservatrice rejette
maintenant les cibles éloignées avant toute intersection détaillée. Les véritables
meshes, ou ellipsoïdes agrandis seulement pour les moucherons, départagent les
candidats. La recherche ne reconstruit plus une Map filtrée à chaque sous-pas.
Les traceurs de véhicules sont recyclés dans un pool de 256, au lieu de créer
et détruire systématiquement deux géométries et deux matériaux par balle.
Les sons et flashes sont regroupés à au plus un départ toutes les 40 ms dans la
scène ; les trajectoires, débits et dégâts de chaque balle restent individuels.

Mesures CPU, médiane de trois passages, 180 vrais modèles, segments hors cible :

| Travail simulé                                  |      Avant |   Après |
| ----------------------------------------------- | ---------: | ------: |
| 3 000 requêtes, charge d’un tireur              |   405,2 ms |  9,8 ms |
| 9 000 requêtes, charge répétée de trois tireurs | 1 198,0 ms | 29,2 ms |
| 1 000 créations/libérations de traceur          |    26,9 ms | 0,71 ms |

Le dernier cas recycle une seule instance. Ce ne sont **pas** des FPS GPU, un
benchmark de trois navigateurs simultanés, une mesure WAN ou une preuve de charge
à 100 joueurs. Script reproductible : `review-return-performance.mjs`, référence
Git `94c54a4`, données brutes [JSON](return-performance.json).

## Parcours et fourmis précoces

Les parcours font le tour de plusieurs zones éloignées, aussi pour les premières
vagues. Les routes aériennes utilisent le haut de la pièce et une traversée plus
basse ; les routes terrestres parcourent les couloirs du plancher puis rejoignent
la corbeille par son approche existante. A* et contrôles de segments évitent le
mobilier statique ; aucun obstacle dynamique nouvellement posé ne provoque un
recalcul de navigation général.

Sur 90 fixtures de trois graines et trois vagues, à vitesse de la même fixture
strictement conservée : air **16,32 → 32,21 m** et **108,72 → 278,40 s** en moyenne ;
sol **10,31 → 36,84 m** et **84,89 → 319,74 s**. L’exemple aérien initial passe de
4,35 à 32,65 m et de 55,62 à 404,74 s. Un ennemi abattu n’attend pas cette échéance.
[Comparaison des chemins](routes-return.png), même graine et même échelle.
Le temps d’arrivée serveur découle de la nouvelle longueur ; aucune attente
artificielle distincte du déplacement. Les mouvements de groupe restent les mêmes.

La première vague comporte **quatre moucherons et quatre fourmis de 100 PV**, sans cafard
ni élite. Le budget commence à 8 au lieu de 6 et garde la courbe précédente +2.
Deux fourmis sont garanties aux vagues suivantes, puis le directeur compose le
reste ; plafonds d’élites conservés. Leur présence allonge l’approche terrestre,
mais ne modifie pas les primes ni la minute de préparation entre vagues.

## Gravité, parachute et pistolet

Le personnage du bureau utilise désormais le ratio humain **0,003** : gravité
**0,02943 m/s²**, vitesse limite **0,162 m/s** (54 × ratio), vitesse sous voile
**0,0165 m/s**, freinage maximal **0,072 m/s²**, gonflage **0,25 s**.
Seuils d’impact sans/mortels : **0,018 / 0,060 m/s**. Entre eux, la courbe quadratique
existante utilise ces nouveaux seuils. Les vitesses héritées d’un avion ne sont
jamais tronquées instantanément à la limite : freinage progressif. Ces valeurs
centralisées remplacent explicitement CHU-01 ; les autres physiques du purgatoire
et des avions ne changent pas.

Chute mesurée de 0,90 m : **9,183 s**, impact **0,15088 m/s**, 100 dégâts sans voile.
Ouverture immédiate : 0 dégât ; ouverture à 9 s : 100. L’atterrissage reste résolu
par sous-pas et un impact est dédupliqué par incarnation. Plusieurs ouvertures et
fermetures sont possibles. Aucun dégât n’est appliqué en restant posé.

**Cause reproduite du tir arrière** : le pistolet utilisait un traceur immobile
ancré à la bouche, dont la géométrie est une traînée vers l’arrière. Le cœur visible
était centré à **−4,675 m de référence** sur l’axe du tir ; le rayon de dégâts
restait dirigé vers la cible. `makeShotTrace` décale maintenant la tête devant la
bouche et borne la longueur à la cible proche : le même test donne **+6,325 m**.
Les balles mobiles gardent leur traînée normale. Origine et direction physiques
restent celles de la main vers le point du réticule, avec second test d’obstacles.
Les hypothèses alternatives de caméra périmée et bras inversé ne se reproduisent
pas dans les cas testés ; aucune prétention de couvrir tout défaut observé en jeu.
Le regard va à **±1,52 rad** (environ ±87°), sans passer au-delà de la verticale.
Tests réels de `pistol()` et géométrie main/caméra aux deux échelles conservés.

## Bombes, moucherons, personnages et radar

Les bombes du bombardier B3 ont un rayon de **40 m de référence = 0,12 m du décor**,
contre 20 / 0,06 pour le Stuka. Le facteur voyage avec le projectile et son événement
d’explosion, même si la coque disparaît. Dégâts centre 240 et bord 60 inchangés,
rayon visuel et dégâts doublés ensemble ; obstacles et déduplication conservés.

Le moucheron est encore agrandi de **50 %** : facteur visuel historique **2,025**, désormais **6,075** après le [correctif de visibilité](enemy-visibility.md) par
rapport au modèle antérieur à VIS-02. Sa tolérance de tir est **1,2 ×** ce nouveau
modèle. Les intersections ellipsoïdales ne modifient pas les meshes rendus ni les
PV. Les autres espèces suivent désormais les [facteurs de visibilité](enemy-visibility.md) ; leurs tolérances de collision restent inchangées.

Chaque joueur reçoit une teinte stable par identité de session et de grandes
initiales contrastées sur poitrine et dos, dans le bureau et les purgatoires.
Deux pseudos identiques conservent des teintes distinctes. Pas de nom flottant.
Les textures ne sont recréées que si identité ou pseudo change.

Le radar couvre un **cylindre de rayon 2 m**, à toutes les hauteurs de la pièce.
La carte affiche son cercle et un balayage léger ; le modèle a une parabole dont
la rotation décorative est temporelle. La détection reste testée à chaque mise
à jour visuelle, sans cadence cachée imposée par le balayage. Plusieurs cercles
unissent leur couverture ; suppression/reset retirent le radar et son effet.

## Vérifications et limites

`test-multiplayer-return.mjs` exerce les 14 tâches : vrais états et commandes
Node, réserve, chaque modèle posé au sol, stocks et décalages, chutes, visée,
intersections, cache visuel, initiales, couverture, parcours et rayons d’explosion.
`test-udp-native.mjs` utilise deux vrais pairs UDP, avec refus d’action en observation,
accès volontaire répété sans deuxième âme, achat/pose et effets communs.
La suite complète conserve les anciens parcours, avec attentes adaptées aux
nouvelles règles demandées, plutôt que l’ancien budget, rayon ou temps de chute.

Le navigateur a chargé le client et exercé les composants HUD, aide contextuelle
et observation sur données de démonstration. Il n’a pas de contexte WebGL ; le
ressenti en combat, la lecture des couleurs/initiales à distance, l’écoute, les
écrans tactiles réels et le WAN restent à vérifier sur la VM. Aucun déploiement
externe ni nouveau Docker n’est revendiqué.

[HUD et aide permanente contrôlés sur données de démonstration](ui-return-hud.jpg).
