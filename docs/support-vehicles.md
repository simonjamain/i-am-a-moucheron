# Hélicoptère et DCA mobile

Implémentation du 30 octobre 2026 sur **Node/RAM/WebRTC UDP**. Les sept tâches
métier HEL-01 à HEL-05 et DCM-01/DCM-02 sont implémentées et couvertes par les
contrôles de domaine. HEL-06 et DCM-03 gardent leur validation finale **en cours** :
les échanges entre deux pairs UDP natifs sont vérifiés, mais le réseau du navigateur
de contrôle refuse UDP. Aucun essai humain de pilotage, d'écoute, de rendu WebGL
ou de partie WAN n'est revendiqué. Le Site Worker historique reste inchangé.

## Achat, accès et réserves

Les deux véhicules passent par le bon signé, paiement unique et pose par E sur
support libre. Aucune réserve gratuite. Destruction définitive, postes exclusifs,
mutations et échanges signés, teinte, nettoyage et tirs alliés suivent les règles
communes. Les quatre nouveaux rôles ont leurs contrats propres, soit 200 variantes
supplémentaires et **600 variantes** au total. Les stations habituelles remplissent
carburant et chaque stock en dix secondes, véhicule posé et arrêté.

| Véhicule       |                   Prix |  Coque |              Vitesse de référence | Carburant                           |
| -------------- | ---------------------: | -----: | --------------------------------: | ----------------------------------- |
| Hélicoptère H2 | 30 $ (1,25 × Spitfire) | 200 PV | 42 m/s (60 % du chasseur initial) | 300 s en vol                        |
| DCA mobile D2  |                   20 $ | 100 PV |                            10 m/s | 300 s à pleine commande de conduite |

Les valeurs D2 non imposées sont des choix d'équilibrage. Son articulation est
cinématique : angle de remorque limité à ±0,65 rad, redressement proportionnel au
roulage, sans simulation séparée de masse/attelage. Les enveloppes de collision
couvrent tracteur et remorque ; ce n'est pas une simulation de poids lourd.
Les améliorations de moteur s'appliquent au H2 comme aux avions.

## Hélicoptère

Le modèle procédural montre un cockpit avant bas, un second cockpit plus haut,
un rotor, une queue et deux lanceurs latéraux. Pilote devant, copilote derrière.
La souris demande le cap et l'inclinaison ; Z/O/Haut augmente la poussée et S/Bas la
diminue. Q/D et A/E n'ajoutent pas de translation ou de commande verticale.
Au relâchement des touches verticales, la poussée revient progressivement au neutre ; l'assistance
amortit la vitesse verticale et freine le mouvement horizontal. Sans pilote ou
pointeur actif, l'assistance redresse et freine, sans trajectoire automatique.
La physique est un modèle assisté de jeu, pas une simulation aérodynamique de rotor.

C maintenu conserve la consigne de pilotage pendant le regard libre et suspend
les roquettes. Perte de focus ou menu coupe les tirs ; sans carburant, gravité et
collisions continuent, sans stationnaire. Une arrivée verticale au sol au-delà
de 8 m/s de référence détruit la coque. Le carburant dure cinq minutes de vol,
indépendamment de la poussée collective demandée.

| Poste / arme       | Stock | Cadence                               | Dégâts et rayon de référence             |
| ------------------ | ----: | ------------------------------------- | ---------------------------------------- |
| Pilote, roquettes  |    30 | au moins 0,3 s                        | HE du tank : 120→30, rayon 12 m          |
| Copilote, MG       | 1 000 | 15 balles/s                           | 75 de base, améliorations MG habituelles |
| Copilote, missiles |    10 | un en vol, puis 2 s après destruction | DCA explosive : 80→20, rayon 8 m         |

Les roquettes alternent leurs origines gauche/droite et partent dans l'axe du
véhicule, sans viser indépendamment avec la souris. Le copilote vise avec une
vue première personne où la MG reste visible. Butées choisies : ±90° horizontal,
de −83° environ à 0° vertical, depuis la tourelle sous le nez, sans couverture
arrière ni élévation à travers le fuselage. Maj choisit la MG, Ctrl les missiles.
Le clic utilise l'arme choisie ; maintenir le clic tire la MG ou les roquettes.

Le missile part latéralement. Le pilote ne récupère aucune arme du copilote.
La caméra reste au poste : le missile tourne vers le point visé, à **1,2 rad/s
maximum**, sans acquisition de cible. Un second appui distinct fait exploser le
missile ; maintenir le clic de lancement ne le fait pas exploser. Impact : une
explosion. Après dix secondes : suppression sans explosion. Changement d'arme
bloqué pendant le vol. Sortie, transfert, mort ou déconnexion du copilote rompt
le guidage et la détonation ; revenir au poste ne récupère pas l'ancien missile.
La destruction de coque supprime le missile sans dégâts supplémentaires.

Le serveur intègre les armes lourdes à pas de 1/120 s au maximum. Le point visé
et la direction arrivent par le canal de mouvement existant. Stocks, lancement
et détonation utilisent les commandes fiables, liées à la génération d'occupation.
Les effets ne produisent aucun second impact. Les clauses compatibles conservent
leurs effets ; elles ne peuvent accélérer les roquettes au-delà du maximum validé.

## DCA mobile

Le conducteur conduit sans arme. Le tireur vise un canon unique, utilisable en
roulant ; molette : proximité, pas de **0,5 m**, valeur initiale **5 m**, bornes
**0,5–20 m de référence**. Le curseur affiche cette unité, et non les mètres du
décor. À l'échelle actuelle : 0,0015–0,06 m du décor. La molette du tireur ne
change ni les gaz ni le zoom. Les limites de visée choisies suivent les tourelles
ordinaires : azimut libre, élévation de −0,1 à 1,35 rad.

100 obus, vitesse initiale propre **560 m/s** de référence (70 % de la DCA fixe),
intervalle minimum **0,8 s**, durée maximale **6 s**. L'obus hérite aussi de la
vitesse du camion. Le réglage est copié au départ de chaque projectile.

La fusée s'arme à **0,300 s**. Avant : impact inerte, sans explosion ni dégâts.
Après : présence dans le rayon d'un objet physique, y compris sol, mobilier,
installations, ennemis, joueurs, véhicules alliés et camion tireur, déclenche
l'explosion. Le camion tireur est exclu uniquement des impacts avant l'armement
pour laisser l'obus sortir de son canon ; il redevient détectable à 0,3 s.
Sans déclenchement : expiration inerte. Aucun impact direct à 200 dégâts ni
éclatement programmé en distance n'est hérité de la DCA fixe.

Le rayon des dégâts reste **8 m de référence**, indépendant de la détection,
avec 80 au centre, 20 au bord, zéro au-delà, occultation du décor et dégâts alliés.
Un grand réglage peut donc déclencher loin de la cible sans la blesser.

Le segment est coupé à l'instant d'armement. La détection balaie la trajectoire,
avec distance exacte aux boîtes du décor (coins arrondis) ; les coques utilisent
des enveloppes orientées, articulées pour le camion, et les personnages/insectes
des volumes simplifiés comme les autres armes. Les éléments décoratifs et labels
ne sont pas des objets physiques. Un filtrage spatial élimine d'abord les
obstacles hors de portée du segment. Les mouvements des cibles restent ceux des
snapshots coopératifs, sans historique continu de toutes les géométries.

## Vérifications et reprise

`node scripts/test-support-vehicles.mjs` couvre caractéristiques, contrats,
réserves/recharge, stationnaire et poussée, freinage, panne, guidage borné,
roquettes alternées, exclusivité, cadences et stocks, instant d'armement
0,299/0,300/0,301 s, mur fin, rayon, camion tireur, explosion unique, expiration,
perte de coque et reset. Les tests communs couvrent signature/pose de tous les
types et transferts contractuels. `test-udp-native.mjs` exerce aussi ces armes
avec deux vrais pairs UDP : stocks, paramètres, PV 200, observation et refus du
conducteur de tirer le canon.

Mesure CPU synthétique sur cette session : 128 projectiles de proximité, chacun
sur 250 ms simulées et 256 boîtes, environ 570 ms avant filtrage spatial,
puis 20–30 ms après. Ce scénario est reproductible dans le test ; il ne mesure
ni les FPS, ni 100 joueurs, ni la charge Internet. Le serveur borne à 128 les
armes lourdes simultanées. Les projectiles et effets restent nettoyés et bornés.

L'aperçu `/ui-review.html` expose les quatre postes avec les composants HUD réels.
Le navigateur charge le client, puis affiche « UDP indisponible sur ce réseau ».
La validation finale demande encore, sur une VM UDP joignable, une partie solo
puis pilote/copilote, une conduite/tir simultanés, l'entrée tardive, les changements
de poste et les morts, l'écoute et le confort visuel des modèles et du pilotage.
**Aucune VM externe n'a été provisionnée ni déployée.** Installer le ZIP selon
[le guide UDP](udp-server.md), puis recharger les navigateurs après redémarrage.

Le [lot confort de jeu, version 37](comfort.md) précise réparation, zoom, jauges,
radar à pied, remise à zéro, fourmis et projectiles du pistolet courants.

La [correction des commandes H2](helicopter-controls.md) détaille les défauts
reproduits, le collectif local, la jauge au neutre et les tests de roquettes.

## Accès après pose du H2

Un H2 neuf conserve son état posé malgré la marge de pose de 0,05 mm : la
physique recale les patins au support proche avant de masquer les cercles des
deux postes. Cette tolérance ne rappelle pas au sol un hélicoptère en vol.
