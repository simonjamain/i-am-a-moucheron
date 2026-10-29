# Retours terrain : accès, visée, chutes et réapparition

Référence actuelle du lot BUG-04 à ECO-02, serveur **Node RAM/UDP**.
Les sources se livrent en ZIP ; l’ancienne image Docker `.2` ne contient pas ce lot.
Le Site public Worker reste historique et n’est pas remplacé par ce client Node.

## Embarquement et délai après E

Chaque place du bombardier et du tank possède son cercle. Le client doit vérifier
la proximité du **siège sélectionné**, à la sélection comme à l’affichage du dossier.
Le défaut reproduit était un appel à `vehicleAccess` sans `selectedSeat` : sa valeur
par défaut `pilot` masquait le dossier dorsal/queue/canon/supérieur après une
sélection pourtant acceptée par le serveur. Aucun droit supplémentaire ni réduction
des deux documents requis n’a été introduit.

`test-field-backlog.mjs` exécute la vraie branche d’éligibilité du client puis
sélectionne/signe chaque rôle avec les vraies commandes du domaine Node. Il vérifie
les trois occupants simultanés, pas seulement un bouton visible. Les tests existants
couvrent échanges, refus, nouvelle tentative et concurrence sur une place.

La sélection exige un aller-retour fiable : proximité, disponibilité, jeton et
annexe éventuelle sont décidés côté serveur. Il n’y avait pas de délai d’animation
obligatoire ; le client restait toutefois silencieux jusqu’à cet acquittement.
Il affiche maintenant immédiatement « Préparation du dossier · poste… », verrouille
une deuxième sélection et n’expose une feuille signable qu’après confirmation.
Un échec ferme l’attente et permet de recommencer. La correction de proximité évite
aussi une attente indéfinie devant un dossier injustement masqué.

Mesure du vrai `chooseVehicle` avant/après dans un contexte VM, réponse simulée :

| Retard injecté | Premier retour visuel avant | Premier retour visuel après | Dossier confirmé après |
| -------------- | --------------------------: | --------------------------: | ---------------------: |
| 5 ms           |                      6,6 ms |                      1,1 ms |                 6,4 ms |
| 250 ms         |                    251,2 ms |                      0,8 ms |               251,4 ms |

Ces valeurs mesurent l’appel au rendu DOM, sans GPU ni WAN : elles ne démontrent
pas une baisse du RTT serveur. `moucheronInteractionTimings` expose en lecture seule
les 32 dernières traces locales (entrée, feedback, requête, confirmation, document,
opportunités de peinture via deux RAF). Aucun nom, position ou secret n’y figure.
Les métriques de peinture en arrière-plan peuvent être retardées par le navigateur.

## Pistolet à l’épaule

La caméra reste à la troisième personne, cible à 1,55 m de référence au-dessus des
pieds et décalage d’épaule de 0,70 m, multipliés par le ratio du monde. Le torse ne
masque plus le centre. Le bras droit est orienté vers la visée et le pistolet est
attaché à sa main ; sa bouche est un nœud réel du modèle, pas la caméra.

Un premier rayon trouve le point sous le réticule. Un second part du canon vers
ce point et contrôle à nouveau cibles et obstacles. Une légère pénétration du
point visé de 1 cm de référence évite les ratés numériques sur un sommet de triangle.
Un point situé derrière la bouche n’entraîne pas de tir dans le dos. Mobilier du
bureau, guichet et sol des purgatoires bloquent le tir. Les traceurs suivent le
second rayon. Portée conservée : 150 m de référence, soit 0,45 m au bureau et
150 m au purgatoire ; 10 dégâts, semi-automatique, sans recharge, interdit en poste.

`personal-aim.js`, le diagnostic exécutant le vrai `pistol()` et les tests géométriques
couvrent orientations, deux échelles, cible proche/lointaine et obstruction. Le
ressenti avec Pointer Lock réel reste à observer sur une machine équipée de WebGL.

## Chute et parachute

La chute du personnage utilise désormais les **mètres réels du décor**, sans
multiplier la gravité par le ratio miniature. Les avions et projectiles gardent
leurs réglages propres. `field-physics.js` possède les valeurs du personnage :

| Quantité                         |                Valeur de jeu |
| -------------------------------- | ---------------------------: |
| Gravité                          |           9,81 m/s² du décor |
| Vitesse limite sans voile        |               6 m/s du décor |
| Vitesse cible sous voile gonflée |           0,045 m/s du décor |
| Gonflage complet                 |                       0,25 s |
| Décélération maximale de voile   |                      24 m/s² |
| Impact sans dégâts               | vitesse verticale ≤ 0,60 m/s |
| Impact mortel                    |    vitesse verticale ≥ 2 m/s |

Entre les seuils, dégâts = arrondi supérieur de
`100 × ((v − 0,60) / (2 − 0,60))²`. Seule la vitesse descendante à l’impact compte.
Le ralentissement est progressif, avec sous-pas de 1/240 s. Espace ouvre/replie
plusieurs fois ; le gonflage se résorbe en 0,125 s après fermeture. Le contact est résolu dans les sous-pas pour éviter un impact majoré à faible
cadence ; un corps déjà posé ne subit pas de dégâts en restant immobile. Le contact
replie la voile et remet son gonflage à zéro. Ces réglages sont un modèle de jeu,
pas une simulation biologique du personnage miniature.

Sur une chute de 0,90 m : environ 0,45 s et 3,74 m/s à l’impact sans voile, donc
mortelle ; ouverture immédiate : 0 dégât ; ouverture à 0,37 s : encore mortelle.
Les tests comparent plusieurs cadences et cycles. Un impact possède un identifiant
lié au joueur et à son incarnation ; le serveur déduit les dégâts une seule fois
et déclenche le purgatoire. Les rapports de vitesse restent sous la confiance
coopérative du jeu ; aucune promesse anti-triche n’est ajoutée.

## Départ, lits et contrats personnels

La fin des trois papiers du purgatoire restaure 100 PV et recrée le corps dans
la zone de départ. Le super purgatoire ramène d’abord au purgatoire classique.
L’ancien corps local est retiré lors du changement d’incarnation : ses coordonnées
ne doivent pas gagner contre la nouvelle destination dans la fusion des snapshots.
Vitesse, parachute, rotation de caméra et commandes sont réinitialisés.

Un lit coûte 4 $, puis +2 $ par lit acheté, sur la caisse commune. Sa pose réserve
une surface de 6 × 4,2 m de référence, soit 18 × 12,6 mm du décor, avec support
continu, place pour le corps et hauteur libre. Il peut être posé sur un meuble.
Un cercle permet E puis un **contrat personnel signé**. Chaque joueur a un seul
lit actif, plusieurs joueurs peuvent signer le même lit. Signer un autre remplace
le précédent ; E au lit actif propose la résiliation signée, sans téléportation.

La résurrection utilise le côté libre du lit après revalidation du support et
des installations proches. Lit absent ou impraticable : retour au départ et
message explicite. Les contrats et mouvements périmés sont refusés par epoch et
incarnation. Une signature attend son résultat et n’est archivée qu’après succès.
Le panneau est nettoyé à la mort, à la fermeture et au reset.

Un secret de reprise retourné seulement à la connexion est conservé dans le
`sessionStorage` du navigateur par salle. Il permet de retrouver le contrat de lit
après rechargement/reconnexion dans cette session ; il ne figure jamais dans les
snapshots partagés. Il ne restaure pas le véhicule ou la vie précédente. Autre
navigateur, nouvelle session sans secret, reset ou redémarrage serveur : pas de
récupération du contrat. Registre limité à 2 048 identités de contrat par salle.

## Tank, modèle et HUD

Le tireur canon utilise une vue alignée sur la bouche du canon ; son propre tank
est masqué dans cette lunette pour éviter l’obstruction par la géométrie. La
coaxiale possède son nœud de bouche, décalé de 0,30 unité de modèle (environ
1,67 mm du décor). Son rayon est parallèle au canon : la parallaxe à courte
portée n’est pas artificiellement annulée. Les obus serveur partent du même
canon que le modèle.

C maintenu passe en observation à la troisième personne. La souris/manette
modifie l’observation, pas la tourelle ; MG et canon sont suspendus. Relâcher C,
changer de siège, ouvrir un menu ou mourir quitte ce mode. Les autres postes
gardent leur vue actuelle. Les tests vérifient bouche, parallaxe et invariance
du montage pendant l’observation ; le rendu WebGL subjectif reste à vérifier.

Le Stuka conserve profils, stocks et dégâts : jambes de train fines, roues et
carénages arrondis remplacent les grands blocs sous les ailes ; les freins de
piqué sont amincis. La bombe a un corps effilé et quatre surfaces d’empennage,
orientés selon sa vitesse en vol. Comparaison de la géométrie réelle sous une
projection identique : [avant/après](models-before-after.png). Le rendu de contrôle
est une projection CPU des triangles, pas une capture WebGL.

La monnaie, l’atelier et le banquier sont dans une même zone de mise en page,
sous les statistiques, avec espacement et retour à la ligne pour grands montants.
Le HUD contextuel reste inchangé dans son principe. Le panneau de lit réutilise
le langage visuel des documents et garde les commandes du monde neutralisées.

## Vagues et prêts

Le lancement initial reste à 10 s. Les pauses **entre vagues** passent à 60 s ;
le bouton de lancement anticipé est conservé. Le serveur arbitre démarrage manuel
et automatique sans double vague. Une seule échéance de prêt reste prélevée à
chaque fin de vague.

Les nouvelles offres utilisent 10, 12, 15, 18 ou 20 % **par vague**, taux fixe
sur capital restant. Les montants/durées restent ceux du catalogue, et l’offre
non signée reste stable. Un contrat signé conserve son taux et son tableau
stockés ; il n’est pas recalculé à partir du nouveau catalogue. Les tests couvrent
10 et 20 %, les centimes, le total réellement prélevé et le dernier solde nul.

## Vérifications et limites

Suites complètes, contrôles Node natifs UDP, tests `test-field-backlog.mjs` et
`test-bed-ui.mjs`. Le navigateur a exécuté signature du contrat de lit puis accès
à la résiliation dans le vrai composant avec données de démonstration ; l’aperçu
montre aussi un grand montant sans collision des trois commandes.
Le navigateur de contrôle ne dispose pas de WebGL et son réseau UDP ne valide
pas une partie WAN. Tactile physique, écoute et charge maximale restent à vérifier
sur la VM. Aucun déploiement externe ni image Docker nouvelle dans ce lot.

Le [lot suivant de lisibilité et nettoyage](clean-flight.md) précise les commandes
contextuelles actuelles, les effets partagés et les nouvelles collisions de coque.
