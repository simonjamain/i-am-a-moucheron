# Gameplay actuel

Vue d'ensemble des règles et du parcours joueur ; chaque section renvoie à la
référence détaillée de son sujet. Mettre à jour la section concernée quand le
comportement change ; les valeurs exactes restent dans le code cité.

Index : [commandes](controls.md) · [vagues et magasin](progression.md) ·
[économie et signatures](economy-physics.md) · [réseau](walking-network.md) ·
[écran de chargement](loading-screen.md) · [viseurs, traçantes et brouillard](toon-rendering.md).

## Session réseau

Le serveur Node utilise WebRTC sur UDP. Les mouvements sont locaux et relayés par
le serveur à 20 Hz ; signatures, achats, impacts et changements de monde passent sur
un canal fiable avec confirmation. Un réseau sans UDP joue en TCP sur un WebSocket.
Toute la partie reste en mémoire ; un redémarrage la supprime. Voir
[serveur UDP](udp-server.md) et [confiance envers les clients](trust-model.md).

## Boucle de jeu

Les joueurs rejoignent une salle coopérative et apparaissent à pied près de la
corbeille (le [plan du bureau](office-layouts.md) est choisi à la création de la
salle), en caméra à la troisième personne. Ils rejoignent physiquement un
équipement, remplissent son dossier et en prennent un siège. L'objectif est de
protéger la poubelle : chaque ennemi arrivé augmente l'infestation. La mort ouvre
une observation à caméra fixe ; un clic volontaire mène au purgatoire.

Avant chaque vague, le serveur annonce les entrées et les horaires des groupes. La
préparation dure une minute par défaut ; tout joueur peut lancer la vague plus tôt.
Il n'y a ni vote ni plan à débloquer : tout s'achète à son prix. Le budget de vague,
en **puissance**, est multiplié par 1,5 à chaque vague, sans plafond, et par `N^0,9`
pour `N` joueurs ; toutes les espèces sont disponibles dès la vague 1 et la puissance
seule décide de leur tirage. La frise et le bouton de vague affichent la puissance
annoncée. Les règles de salle sont fixes (aucun réglage d'équilibrage par salle).
Voir [progression](progression.md), [puissance des ennemis](enemy-power.md) et
[bestiaire](enemy-bestiary.md).

Les volants arrivent par quatre aérations alimentant deux couloirs qui se croisent
à des altitudes différentes (`src/routes.js`, au plus 2,1 m, sous le brouillard
`OFFICE_FOG_START`) ; le nuage de phéromones de chaque entrée apparaît avant leur
passage. Fourmis et cafards sortent de trous et marchent vers la poubelle en
contournant mobilier et barricades ([navigation terrestre](#navigation-terrestre)).

## Accueil

L'accueil affiche le titre **I am a moucheron**, le formulaire (pseudo, code de
salle) et « Base Alpha », sur le bureau 3D animé. Le numéro de version, en haut à
gauche, ouvre les **Nouveautés** (`src/changelog.ts`). Un sélecteur montre le
**personnage** choisi parmi huit modèles (flèches, ou ←/→ au focus) ; le choix est
mémorisé dans le navigateur et visible par tous. En jeu, le modèle se tourne
doucement vers sa direction de marche. Le son démarre au volume standard dès la
première interaction autorisée par le navigateur ; il n'y a pas de réglage audio.

Noms affichés (`src/fleet.ts`, `src/equipment.ts`, `src/ground-fortifications.ts`) :
**Chasseur biplan**, **Bombardier biplan**, **Chasseur léger**, **Bombardier moyen**,
**Stuka d’attaque au sol**, **Spitfire**, **Hélicoptère d’attaque au sol**,
**Castor volant**, **Char moyen**, **Castor**, **Anti-air mobile**, **Flak léger**,
**DCA haute cadence**, **Flak lourd**, **Canon anti-matériel**, tourelles
automatiques. Les sigles M1, B3, H2, T3, D2, G1, S6 sont des désignations internes
(code, tests, documents) jamais affichées en jeu.

## Accès aux équipements et dossiers

On vise directement le poste (cockpit, trappe, tourelle) ou l'installation (DCA
fixe, canon, lit) : il s'entoure de bleu signal s'il est libre, d'un contour clair
avec le nom de l'occupant sinon, et un clic ouvre son dossier
([règles d'interface](ui-guidelines.md#monter-dans-un-engin--viser-le-poste)).
Chaque accès passe par un dossier de deux documents obligatoires, signés tels quels
à la souris ou au toucher ; la signature part au relâchement d'un trait valide. Le
tampon est immédiat ; la réponse serveur confirme le document et le siège. Aucune
archive des documents signés n'est conservée. Dès qu'un dossier est terminé, la
souris est recapturée. Les sièges sont exclusifs.

Le catalogue embarqué contient dix variantes pour chacun de 65 documents/contextes
(650 variantes) ; la variante immédiatement précédente est évitée pendant la
session, et les contrats supérieurs, plus longs, se lisent par défilement.

À bord d'un appareil à plusieurs places, Digit1–Digit7 ou le panneau des postes
demandent un changement contractuel : un siège libre demande un contrat, un siège
occupé la signature du demandeur puis du destinataire. Refuser, partir ou se
déconnecter annule la demande ; le transfert est atomique et revalidé. Quitter le
cockpit pour un autre poste ne crée aucun pilote automatique (sauf l'assistance au
stationnaire de l'hélicoptère) : un client désigné continue la physique avec
commandes neutres et derniers gaz, jusqu'à reprise ou crash. Détails :
[économie et signatures](economy-physics.md), [logistique et feuillets](logistics-contracts.md).

## Flotte et pilotage

Un chasseur biplan, un bombardier biplan (pilote et mitrailleur dorsal) et un char
moyen sont disponibles au départ (`fleet()` dans `server/game.js`) : un exemplaire
prêt par type est conservé et, dès son départ, un successeur gratuit apparaît. Les
autres véhicules s'achètent au marchand (prix dans `src/equipment.ts`) et leur
destruction est définitive. Un achat produit un bon signé, puis l'objet se pose
avec E au sol ou sur un meuble ; Échap le conserve pour reprise depuis l'atelier.
Flotte, échelle et armes : [unités, flotte et armes](scale-fleet-weapons.md),
[véhicules et banque](vehicles-bank.md), [véhicules de soutien](support-vehicles.md),
[biplans](biplane-models.md).

Le pilotage par défaut vise un point à la souris avec assistance ; une commande
manuelle remplace l'assistance sur son axe tant qu'elle est active (touches :
[commandes](controls.md), hélicoptère : [commandes H2](helicopter-controls.md)). Au
zoom (clic droit), la sensibilité suit le champ de vision (`lookScale`,
`src/control-focus.ts`). Les avions ont carburant (cinq minutes à plein gaz) et
munitions limités. Ils décollent d'une surface plane (`ROLLING_FRICTION`,
`LIFTOFF_SPEED` = 18 m/s dans `src/flight.ts`, `scripts/test-takeoff.mjs`) ; le
biplan vole sur Rapier ([vol du biplan](plane-physics.md)), les véhicules au sol
aussi ([physique Rapier](physics-engine.md)). Le contact des roues est permis si
l'axe haut dépasse 0,88 et la descente reste sous 5 m/s de référence. Au sol, il faut
s'arrêter pour sortir ; une sortie aérienne commence en chute libre avec la vitesse
héritée, parachute ouvert et replié à la main. La chute utilise la gravité humaine
multipliée par le ratio du personnage, avec dégâts d'impact verticaux.

Les équipements commandés depuis un appareil descendent dans un colis sous
parachute à 1/3 m/s dans le décor jusqu'à une surface porteuse ; le serveur y
déploie l'équipement une seule fois ([colis parachutés](logistics-contracts.md#colis-parachutés)).

## Combat

Le clic gauche tire les MG ; le Stuka et le pilote du bombardier larguent en
maintenant Espace (0,5 s) ; au canon du tank, clic gauche tire HE/AP et Espace la
coaxiale. Les mitrailleuses tirent des traceurs légèrement dispersés ; la cadence
locale rattrape les images retardées sans attendre le réseau. Les projectiles
subissent gravité et traînée. Les DCA fixes (Flak léger à éclatement réglable,
DCA haute cadence, Flak lourd) ont 120 obus (`FIXED_DCA_AMMO`,
`src/ground-ammo.ts`) rechargés seulement par une source de service
([DCA fixes](scale-fleet-weapons.md#dca-fixes-pilotées)). Stocks, commandes et
dégâts : [véhicules et banque](vehicles-bank.md).

Le tir allié inflige des dégâts. Les joueurs ont 100 PV. Une collision avec un
insecte coûte à la coque 5 % de ses PV restants, une fois par impact, et la salit
pour ses occupants ; à pied, Espace maintient un jet qui nettoie à courte portée.
Un avion endommagé ne change pas de forme et ne perd aucune efficacité : ses moteurs
fument à partir de 15 % de dégâts, de plus en plus (`src/engine-smoke.ts`). Chaque
impact blessant un insecte projette des gouttes rouges purement visuelles
(`src/blood-effects.ts`) ; les insectes tués tombent et s'estompent. Lisibilité des
ennemis : [visibilité des ennemis](enemy-visibility.md). Balistique :
[économie et physique](economy-physics.md).

## Interface en jeu

Une seule barre en haut (`#topBar`) : à gauche vague, présence ennemie, infestation,
« Préparer la vague », argent, boutons Équipement (P) et Banquier (N) ; à droite
connexion, Pilotage et Debug. La liste des pilotes et les messages passent dessous.
Le HUD affiche les statistiques de coque près du viseur et une aide permanente en bas
à gauche ; les alertes de réserves (25 % et zéro) pulsent lentement en rouge,
« Missile en vol » étant prioritaire. Sans radar, aucun ennemi sur la carte ; chaque
radar révèle ceux d'un cylindre de 2 m de rayon. L'état de présence indique
« Ennemis restants » tant que la vague contient des ennemis ni tués ni arrivés.

L'**atelier** (P) range les achats en trois colonnes — Aéronefs, Véhicules au sol,
Installations — du moins cher au plus cher. Chaque carte est un bouton : image rendue
depuis le vrai modèle (`src/shop-thumbs.js`), nom, prix (ou « Acquis » / « Déjà
payé »). Ordre et catégories : `src/shop-catalog.ts` ; un article non classé tombe
dans « Autres » (`scripts/test-shop-catalog.mjs`).

Le **banquier** (N) présente sur un prospectus trois emplacements de prêts partagés,
signables depuis tous les postes et mondes, sans remboursement anticipé
([banque](vehicles-bank.md)).

## Purgatoire, économie et réapparition

L'accès au bureau de Saint Pierre dépend de la présence physique dans sa zone ; la
file guide les PNJ sans priorité abstraite et les collisions permettent de se
bousculer ([file physique](purgatory-queue.md)). Au purgatoire, chacun a un pistolet
semi-automatique à 10 dégâts et 120 balles par incarnation (`PISTOL_CAPACITY`), sans
rechargement ; personne n'est armé à pied dans le bureau, et les armes personnelles
sont inutilisables dans les équipements. Les PNJ ne ripostent pas.

Chaque PNJ accepté par Saint Pierre ou tué au purgatoire est libéré et rapporte une
fois **la puissance de son espèce** en dollars communs (1 $ pour un moucheron,
24,47 $ pour un rat) ; c'est la seule source de revenu des vagues : ni prime de vague,
ni argent pour un ennemi abattu dans le bureau. Chaque dollar déclenche une courte
sonnerie chez tous. Le service des PNJ continue sans joueur au purgatoire. Mourir au
super purgatoire (réservé aux joueurs, avec super Saint-Pierre) recrée le corps au
même endroit ; cinq signatures ramènent au purgatoire classique. Chaque transition
restaure 100 PV ; tuer un joueur ne rapporte rien. Valeurs : [combat et mondes](combat-worlds.md).

Le retour se fait au départ, sauf contrat personnel de lit signé (en visant le lit) ;
plusieurs joueurs peuvent signer le même lit. La remise à zéro (« Lancer » après une
défaite, sortie du mode debug) recrée monnaie, prêts, installations, véhicules,
vagues et contrats ; pseudos et salle restent. Aucune progression permanente entre
parties.

## Stations, radars et installations

La station initiale Alpha et les stations achetées réparent et rechargent
automatiquement, contre paiement, les véhicules dans leur sphère (verte, rayon réel
du service), même en mouvement ou en vol, ainsi que les DCA fixes et les murs
endommagés ; la caisse commune paie au prorata et, si elle manque, la somme est
répartie équitablement. PV, moteur, ailes et murs remontent de 10 % du maximum par
seconde (`src/paid-service.js` ; [tarifs](economy-physics.md),
[logistique](logistics-contracts.md)). Prix
de base (`src/equipment.ts`) : Flak léger 5 $ (plafonné à 40 $), radar 10 $, lit
15 $, station 20 $, puis +2 $ par exemplaire de leur type.

## Défenses terrestres

À pied au sol du bureau, maintenir **G** (ou le clic molette) ouvre la roue de
construction : barricade, sucre, ruban, réparation ou suppression ; relâcher sur un
outil le choisit, au centre annule. Un aperçu suit le point visé au centre de la
caméra ; une paroi ou un point hors de portée refuse la pose (même principe pour les
équipements achetés). Pour une barricade ou un ruban, un premier clic (ou E) fixe le
début, un second la fin. R oriente le sucre. Échap quitte la pose.

Prix : mur 0,25 $ par tronçon de 48 mm (demi-briques au prorata), ruban 1 $ pour
20 cm, sucre 3 $, réparation 1 $, suppression gratuite. Les murs sont découpés en
sections réparables, en deux rangées de briques LEGO 2×4. Le serveur revalide caisse
et occupation avant paiement ; la pose exige le sol du bureau, sans parachute. Les
défenses sont partagées par salle et effacées à la remise à zéro. Le radar affiche
constructions et rayons d'appât.

### Navigation terrestre

Le serveur simule chaque insecte terrestre dès le début du combat. Une grille de
5 cm (`buildGroundFlow`, `src/ground-defense.ts`) bloque le mobilier au sol et les
barricades ; elle n'est reconstruite qu'au changement de `navigationRevision`.
L'insecte vise le point le plus lointain de la descente encore visible en ligne
droite (marge d'environ une demi-case) et le garde jusqu'à l'atteindre. L'aperçu de
vague (`smoothRoute`) enchaîne les mêmes points : la piste de phéromones orange
indique le trajet de référence. Un brouillon de barricade montre le détour ; sans
chemin, l'aperçu affiche « Passage fermé » et cafards, araignées et rats attaquent la
barricade la plus proche. Le sucre détourne seulement les insectes entrés dans son
rayon. La route nominale (`enemyRoute`) suit ce champ sur un bureau vide et fixe la
durée nominale (`scripts/test-ground-paths.mjs`). Les constructions posées sur un
meuble ne gênent pas les terrestres.

Les positions affichées et les volumes de tir suivent les positions simulées.
`ground-crowd.js` partage une grille de voisinage par sous-pas (50 ms au plus) :
chaque individu a un espace personnel souple proportionnel à sa taille, ralentit
derrière un voisin et le contourne, sans être poussé à travers une défense. La
vitesse reste plafonnée à celle du bestiaire ; sucre et colle gardent leurs pauses.
Des chevauchements brefs restent possibles (contacts souples). Tests :
`test-ground-crowd.mjs`, `test-ground-spread.mjs`.

## Castor et Castor volant

Le **Castor** (G1, 15 $) est un camion monoplace à six roues : Z/S et Q/D pour
conduire, souris pour sa mitrailleuse (500 balles à 40 dégâts, recharges payantes).
**V** bascule une vue de dessus (40 cm au-dessus, nord en haut, viseur au sol pour
poser dans 24 cm et tirer ; `src/castor-top-view.ts`). Roues : `src/castor-wheels.ts`.
Sa sphère de soutien de **50 cm** (`src/service-zones.ts`) soigne, ravitaille et
répare alliés, DCA et murs, lui compris, aux frais de la caisse commune. Modèle :
trois pièces Meshy texturées ([flotte Meshy](meshy-fleet.md)).

Au volant, le clic molette ouvre la roue des défenses. Murs LEGO et rubans se posent
en continu **derrière le véhicule** entre deux clics gauches (sections de 48 mm à
0,25 $, ruban 20 cm à 1 $, dernière section au prorata ; `scripts/test-castor-trail.mjs`).
Un changement de poste, une sortie, un échec de placement ou un déplacement brutal
interrompt la construction ; pas de pose sur une surface surélevée. Brique :
[pipeline d'assets](asset-pipeline.md#brique-lego-24-du-mur-castor). Le Castor
construit aussi :

- le **canon anti-matériel** (14 $), obusier à taille humaine contre les boss
  terrestres : élévation −5° à +40°, obus simulé par le tireur à 750 m/s, 800 dégâts,
  explosion de 5 m, sans fusée ; 50 obus rechargés aux sources de service ; dossier
  et signatures à 6 m ;
- la **tourelle automatique** (5 $, 180 balles, recharge payante), modèle en quatre
  pièces Meshy ([asset T-01](t01-asset.md)) ; ses mouvements suivent la dernière cible
  validée par le serveur ; et la [tourelle Gatling](gatling-turret.md).

Le **Castor volant** (35 $, colonne Aéronefs) est un hélicoptère logistique à deux
rotors : un pilote, trois passagers, aucune arme, 200 PV, pilotage assisté de
l'hélicoptère, même soutien de 50 cm (taille du modèle : `FLYING_CASTOR_SCALE`,
`src/flying-castor-model.ts`). Tous les occupants ouvrent la roue (G / clic molette)
et **larguent** les constructions du Castor sauf les murs (sucre, ruban de 10 cm,
tourelles, canon) au même prix, à la verticale de l'appareil et dans son cap ; un
aperçu montre le point de chute. La caisse est débitée au largage, l'objet tombe à
1/3 m/s puis est construit sur la première surface (sol ou meuble), remboursé si la
place a été prise. **Réparer** et **Enlever** visent la construction la plus proche
sous l'appareil (moins de 27 cm à l'horizontale). **V** bascule la vue verticale
(12 cm au-dessus de la surface, molette 5 à 80 cm) ; le pilote y pilote au clavier
(Z/S/Q/D, A/E pour tourner, Maj/Ctrl pour l'altitude). Les constructions posées sur
un meuble tirent depuis leur emplacement réel. Modèle :
[flotte Meshy](meshy-fleet.md).

## Mode debug

Le bouton **Debug : OFF / ON** est un interrupteur commun à la salle. Actif : argent
illimité, toutes les constructions, aucun dégât de chute, défaite impossible (les PV
de la poubelle restent affichés, même négatifs). Pendant une vague, le marchand
propose aussi de poser des **Mannequins** (immobiles, invulnérables, dernier dégât
affiché) et des **Ennemis réels** ; hitbox, portées et volumes de collision du décor
sont visibles. Le désactiver réinitialise la partie. Voir [mode debug](laboratory.md).

## Échelle et présentation

Le décor est en mètres réels. Personnages, véhicules et longueurs de référence
utilisent le ratio de carte, 3/1000 pour le bureau (un personnage de 1,80 m mesure
5,4 mm) ; le purgatoire a son propre ratio. Durées et vitesses angulaires ne sont pas
mises à l'échelle ([unités](scale-fleet-weapons.md)). Les modèles sont procéduraux
ou Meshy embarqués, le décor vient du Cartoon Office Pack ; les sons sont synthétisés
en Web Audio et spatialisés ([audio](audio.md)).
