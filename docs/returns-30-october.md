# Retours de partie — implémentation Node version 48

Ce lot traite les seize tâches prêtes du dernier backlog. BUG-07 demeure à
préciser : le geste et le formulaire concernés ne sont pas connus. Aucun
correctif de signature supplémentaire n'est revendiqué.

## Fonctionnement et physique

- REP-02 : un appareil vivant, posé et arrêté en station récupère moteur et ailes
  avec ses PV. Le pilote importe cet état de service ; une épave reste perdue.
- HEL-08 : le dernier occupant parti, le rotor décroît exponentiellement
  (constante 0,8/s), l'assistance perd son efficacité et la gravité reprend.
  Un copilote seul maintient l'appareil occupé. Le retour d'un pilote relance le
  rotor (2/s). Rotor partagé dans les mouvements ; appareil au sol intact.
- VOL-01 : contact roues autorisé si axe haut > 0,88 et descente inférieure à
  5 m/s de référence. La vitesse horizontale ne suffit plus à détruire l'avion.
  Une vitesse verticale positive quitte la surface ; la commande souris à
  cabrer permet aussi le décollage au-delà de 18 m/s, sans attendre un rebord.
  Coques, obstacles et mauvaises orientations restent dangereux.
- HEL-09 : le missile suivait un point de poursuite fixe à 250 m de référence,
  raccourci par le raycast contre le décor. Une fois ce point dépassé, il pouvait
  se retourner. Le serveur suit désormais la direction demandée, depuis le
  missile, avec la même limite angulaire de 1,2 rad/s. Le parcours courbe utilise
  tous les solides pour son balayage. Impact/détonation uniques, expiration
  inerte à 10 s, stock et délai de 2 s conservés ; aucun évitement automatique.

## Sons et interface

SON-03 utilise l'état partagé au copilote, sans doubler sa boucle avec celle des
appareils distants. SON-04 conserve six sources de bourdonnement au maximum,
augmente le niveau de 0,045 à 0,12 et la distance de référence de 5 à 20 unités
acteur. Chaque source est réduite par la racine du nombre de sources, en plus
du compresseur existant. Ces valeurs sont des réglages à confirmer en écoute.
SON-05 compare les identifiants d'arrivée de deux snapshots : une nouvelle
arrivée donne un signal bref, le premier snapshot sert de référence sans rejouer
le passé. Le signal est placé à l'auditeur pour être perceptible dans son monde.

HUD-07 relie PV, carburant, gaz et munitions aux valeurs courantes, réparation et
réapprovisionnement compris. HUD-08 conserve les actions tactiles courtes mais
place les touches de sortie/parachute dans l'aide permanente. HUD-09 aligne les
alertes de réserves à 25 % et zéro dans un bloc discret, rouge et lentement
pulsé (animation désactivée si mouvement réduit). HUD-10 partage ce bloc :
« Missile en vol » est prioritaire, puis épuisement ou recharge réelle de 2 s.

NET-01 retire ventilateur, commandes, souffle et obstacle de la scène actuelle.
L'ancien backend Worker/D1 reste historique. VOL-02 retire le mode manuel, sa
bascule et le raccourci M ; souris et gaz restent actifs, sans supprimer les
commandes des véhicules terrestres, H2, zoom ni regard libre.

## Achats et parcours

ACH-01 permet la signature depuis tous les postes d'un véhicule : débit unique
et colis distinct, inutilisable avant réception. Les prix croissants comptent
les livraisons en cours. La limite des 24 installations reste propre à la pose
à pied ; elle ne bloque pas les commandes aériennes. Des colonnes libres sont
recherchées près du véhicule, hors de sa coque, pour le colis et sa voile.
La descente constante vaut **MAP.metres(1/3) = 0,001 m du monde/s** : trois secondes
par mètre de référence. La première surface portant toute l'emprise et gardant
la hauteur libre reçoit l'objet, sans dégâts ni rebond. Les contacts latéraux
ne constituent pas une réception. Les autres appareils et installations sont
vérifiés lors de la pose. Les livraisons sont partagées, effacées au reset et
n'accordent aucun accès avant la pose.

PUR-03 fait apparaître le joueur sur le côté, hors signature, même sans file.
Dans les arènes Node, les insectes antérieurs encore présents dans le couloir
empêchent de prendre leur place au guichet. Leur déplacement hors du couloir ou
leur libération ouvre la place. Pas d'attente artificielle sans insecte devant.
La file conserve les collisions et son service normal.

VAG-09 réserve un voltigeur dès la vague 2 en retirant son coût du budget initial,
sans augmenter ce budget. Déblocages suivants : cafard 3, carapace 5, bourdon 8 ;
plafonds d'élites et budget conservés. La vague 1 reste 20 moucherons + 4 fourmis.

## Preuves et limites

`test-backlog-return.mjs` exerce réparation des sept modèles, H2 occupé/vide et
récupération du rotor, contact rapide des roues et départ en montée, guidage
après dépassement de l'ancien point, alertes et recharge, arrivées dédupliquées,
vague 2 sur cent graines, apparition latérale et achats signés des onze types
d'équipements, débit unique, descente et réception sur meuble.
Les suites existantes gardent leurs contrôles de contrats, dégâts et UDP.

Un test de domaine ne valide pas l'écoute, WebGL, Pointer Lock, lisibilité du HUD
ni le confort de décollage. Ces essais restent à réaliser en partie, idéalement
avec deux joueurs, en suivant les critères détaillés du BACKLOG. Aucun déploiement
VPS ni validation humaine n'est revendiqué par ce document.
