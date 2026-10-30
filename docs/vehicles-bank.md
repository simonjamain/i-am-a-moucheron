# Pilotage, véhicules, armement et banque

État du lot du 29 octobre 2026, pour le **serveur Node RAM/UDP**. Le Worker Sites
reste historique : ce lot ne doit pas être publié sur son backend D1.
Les écrans HUD et banquier ont été validés puis intégrés au jeu. L’aperçu
`/ui-review.html`, généré depuis le HTML et les modules réellement servis, permet
de les essayer avec une caisse de démonstration indépendante et temporaire.

## Pilotage et accès

Maintenir le clic droit en poste, pointeur capturé, passe le champ de vue de 62°
à 28°. Relâcher, perdre le focus, quitter le poste, mourir ou changer d’occupation
réinitialise le zoom. Aucun tir ne part du clic droit ; le menu contextuel est
désactivé sur le décor. À pied et au purgatoire, la vue ordinaire est conservée.

La DCA utilise Shift pour augmenter la fusée de 25 mètres de référence par
pression et Ctrl pour la diminuer. Molette et boutons existants restent disponibles.
Les limites demeurent 100–1 200 m de référence, soit **0,300–3,600 m du décor**.
La valeur existante affiche désormais les mètres réels. La jauge près du viseur affiche la même valeur, entre les bornes réelles
de 0,300 et 3,600 m. Elle suit le viseur et disparaît hors DCA.
Dans un tank, Shift sélectionne HE et Ctrl AP ; ces touches ne changent aucune
fusée de DCA. La conduite utilise Z/S ou flèches pour avancer/reculer, Q/D pour
tourner. Au tireur canon, clic gauche tire HE/AP et Espace la coaxiale ; les autres postes gardent clic/Espace pour la MG. En avion, Espace maintient le largage des bombes. B ne tire plus.

Chaque poste libre a son cercle au sol, avec une icône de rôle (P pilote,
D dorsal, Q queue, C canon, M supérieur). Approcher puis presser E ouvre directement
le bon dossier. La sélection par liste est retirée de ce parcours. Le serveur
contrôle la proximité du cercle correspondant et l’exclusivité du siège à la
seconde signature. Les mutations et échanges à bord conservent leurs contrats.
Les trois postes du tank ont des contrats adaptés, ajoutant 150 variantes au
catalogue de 250 documents. Les traits de signature restent soumis à leurs
protections existantes ; aucun effacement préalable n’est nécessaire.

## Cycle des véhicules

Le chasseur initial et le bombardier initial ont l’origine `starter`. Il n’y a
qu’un exemplaire prêt de chaque origine/type : son décollage ou sa destruction
fournit un nouveau prêt, sans supprimer les coques utilisées. Un retour ne recrée pas de réserve supplémentaire. Les exemplaires achetés
ont l’origine `purchase`, sont posés une fois après bon signé et achat idempotent et ne sont
pas remplacés gratuitement. Acheter à nouveau est permis.

Quitter un poste libère seulement ce siège. L’appareil, son équipage et ses stocks
restent présents ; un départ en vol ne supprime plus le véhicule et ne force plus
les autres occupants à sortir. Sans pilote, l’hôte désigné poursuit la physique
neutre de l’avion. Le tank ralentit sans conducteur et continue de tomber s’il
a quitté un support. Un choc vertical au-delà de 20 m/s de référence le détruit.
Les changements de siège ne recréent aucune réserve.

## Stocks et équilibre initial

| Équipement / arme            | Réserve | Cadence nominale | Dégâts                    |
| ---------------------------- | ------- | ---------------- | ------------------------- |
| Stuka, mitrailleuses         | 1 000   | 0,06 s           | 75                        |
| Stuka, bombes                | 6       | 0,5 s            | 240 au centre, 60 au bord |
| Bombardier, bombes du pilote | 50      | 0,5 s            | mêmes bombes              |
| Tank, MG du pilote           | 1 000   | 0,09 s           | 25                        |
| Tank, MG coaxiale            | 1 500   | 0,06 s           | 50                        |
| Tank, MG supérieure          | 1 500   | 0,06 s           | 75                        |
| Tank, obus HE                | 30      | 2 s              | 120 au centre, 30 au bord |
| Tank, obus AP                | 30      | 2 s              | 320 sur la cible touchée  |

Chaque MG du tank a 90 s de tir nominal ; chaque réserve d’obus a 60 s.
HE et AP partagent le même délai de canon, empêchant de contourner ce délai en
changeant de type. Une réserve vide bascule automatiquement vers l’autre si elle
contient au moins un obus entier. Aucun pilote n’est requis pour utiliser les
deux postes tireurs. Les réserves de MG sont complètement indépendantes.

Le Stuka est une silhouette à ailes en mouette, carénages de train et bombes
externes. Sa vitesse maximale de référence est 54 m/s et son facteur de virage
0,65, contre 70 et 1 pour le chasseur initial. Il coûte 12 $ par exemplaire,
le tank 10 $. Le bombardier conserve ses deux postes de mitrailleurs.

Les bombes héritent de la vitesse de l’avion et subissent la gravité. Un piqué
dont la direction avant descend de plus de 0,65 applique un facteur **1,35** aux
dégâts, soit 324 au centre : il permet notamment d’abattre un cafard de 300 PV
avec une bombe bien placée. Le rayon d’une bombe Stuka est de 20 m de référence
(0,060 m du décor), celui du gros bombardier de 40 m (0,120 m), celui d’un HE de 12 m (0,036 m). Les AP sont des projectiles
directs sans dégâts de zone. Le décor bloque trajectoires et explosions.

Les stations habituelles rechargent toutes les réserves en dix secondes selon
les mêmes conditions d’arrêt et d’appui au sol. Les niveaux fractionnaires sont
conservés ; tirer exige au moins une munition complète. Carburant : cinq minutes
à plein régime. Aucune recharge achetée ni restriction aux intervagues.
Les clauses malicieuses continuent de modifier commandes, visée, cadence et dégâts,
y compris les armes lourdes et le pilote du tank.

Les MG restent prédites localement puis débitées par lots idempotents. Les armes
lourdes passent par `heavy-fire` sur le canal UDP fiable ; le serveur débite,
applique le délai, simule les projectiles et produit les impacts communs. Leurs
réponses ne créent pas de deuxième projectile. Les snapshots décrivent les
projectiles en vol. Les dégâts et libérations d’âmes sont métier ; les effets
visuels ne déclenchent aucun dégât ni récompense supplémentaires.

## Trajets et crashs

Les nouveaux trajets gardent la vitesse **effective** des anciennes vagues,
y compris celle résultant de leur ancien plafonnement temporel. `route-speed.js`
conserve uniquement ce calcul de calibration ; ces anciens chemins ne sont pas
suivis. La durée actuelle est le temps d’entrée plus longueur du nouveau trajet
divisée par cette vitesse. Les longues routes ne sont plus accélérées pour
rentrer dans un délai artificiel. Les apparitions restent périphériques.

Les terrestres suivent une grille A* puis une simplification avec visibilité
libre ; les aériens font des détours en altitude avant la descente vers la poubelle.
Les obstacles de navigation sont générés depuis les colliders du bureau.
Les grilles d’aération décoratives sont les points de sortie, pas des obstacles
fermant leur propre apparition. Les éléments achetés en cours de partie ne
modifient pas cette navigation statique. La première vague garde six moucherons ;
sur la graine de contrôle DOC, sa dernière arrivée passe autour de 58 s.

Une destruction publie un seul événement de crash avec la pose, la vitesse et
son horodatage. Les clients montrent chute, impact sonore, fumée et débris.
Une connexion tardive reconstruit la phase déjà atteinte sans rejouer les sons
passés. Limites : douze corps visuels, dix débris par corps et disparition quatre
secondes après l’impact ; chute bornée à seize secondes. Les effets n’appartiennent
pas aux surfaces de collision. Tous les occupants sont libérés côté serveur et passent au purgatoire, même
si le dernier mouvement signale la destruction sans commande de mort ultérieure.

## Banque et documents signés

L’API expose toujours trois emplacements, contenant une offre stable ou un prêt
signé. Les signatures et remboursements portent le numéro de l’emplacement et
le numéro unique de l’offre ; une ancienne offre ne peut pas recréditer la caisse.
Ces opérations sont accessibles à tout moment par le domaine serveur.
Le bouton Banquier ou N ouvre le guichet à tout moment, y compris embarqué ou
au purgatoire. La consultation libère la souris et neutralise les commandes ;
la partie continue. Échap ou la croix ferment le panneau. Il ne s’ouvre pas
pendant le dépôt d’un autre dossier. La navigation clavier reste dans le panneau.

Chaque offre donne accès à un document humoristique, au tableau d’amortissement
et à un cadre de signature. Relâcher un trait valide transmet une seule commande
fiable. Le dossier attend sa confirmation ; une erreur affiche son message et
permet de signer à nouveau. Une annulation du pointeur ne signe jamais. Le contrat
actif reste consultable avec son capital restant, ses vagues restantes et les
échéances payées. Le remboursement anticipé exige une nouvelle signature. Une
échéance ou un reset intervenus pendant la lecture invalident le document ; le
serveur revérifie aussi son epoch et le montant attendu. Les documents confirmés
rejoignent l’archive locale des signatures, sans envoyer leur image au serveur.

| Capital proposé | Taux fixe par vague | Nombre de vagues |
| --------------- | ------------------- | ---------------- |
| 12 $            | 10 %                | 4                |
| 18 $            | 12 %                | 5                |
| 24 $            | 15 %                | 6                |
| 30 $            | 18 %                | 7                |
| 40 $            | 20 %                | 8                |

Les calculs utilisent des centimes entiers. L’échéance théorique est celle d’un
prêt amortissable à taux fixe, arrondie au centime ; chaque échéance sépare intérêts
arrondis sur capital restant et remboursement de capital. La dernière solde
exactement le reste. Le tableau complet, le coût total, les vagues restantes et
le capital restant sont conservés dans le contrat signé.

Une signature crédite immédiatement le capital. Une seule échéance est prélevée
par prêt à chaque fin de vague, y compris une vague perdue, sans double prélèvement
sur les polls suivants. Le solde peut devenir négatif et les échéances continuent.
Aucun nouveau prêt n’est signé avec un solde négatif. Le remboursement anticipé
coûte seulement le capital restant et exige les fonds disponibles. Le prêt terminé
est remplacé par une nouvelle offre vierge dans le même emplacement. Un reset
efface prêts, offres et monnaie avec le reste de la partie.

## Vérifications et limites

`npm run test:next` couvre l’amortissement, les trois emplacements, les débits de
fin de vague et le solde négatif, les stocks et bascules, délais et doublons,
les impacts au sol, les contrats malicieux, les accès de rôle, la conduite sur
support, les trajets de plusieurs vagues/graines et les effets de crash bornés.
Les tests de prédiction et les tests réseau natifs couvrent aussi les nouvelles
armes sans WebSocket ni repli HTTP. La suite historique Worker reste distincte.

Le navigateur de prévisualisation a vérifié les maquettes et le chargement du
client, sans partie WebRTC vers cette VM. Captures de référence :
[DCA](ui-review-dca.jpg) et [banquier](ui-review-bank.jpg).
WebGL est désactivé dans ce navigateur ; le ressenti du pilotage, la qualité
WebGL et les essais WAN sont à vérifier sur l’installation réelle. Une charge
synthétique de 128 bombes et 180 ennemis a donné typiquement 13–28 ms par tick
chaud de 250 ms localement ; ce n’est pas une mesure de latence réseau ni une
garantie de capacité. Les collisions utilisent une présélection spatiale.

Le paquet Docker `2026.10.29-udp.2` contient uniquement le lot véhicules/banque,
avant les [retours terrain](field-update.md), livrés en ZIP de sources. La version `.1`
est antérieure au Stuka, au tank et aux interfaces intégrées. Voir [Docker](docker.md).

## Ancien HUD contextuel, remplacé

Les pilotes ont le vol/conduite à gauche et l’armement à droite ; les tireurs
ont la visée ou le canon à gauche et leur MG à droite. Le tank affiche le type
d’obus effectivement disponible, HE/AP et le stock coaxial indépendant. Stuka et
bombardier affichent leurs bombes. Les compteurs MG tiennent compte des débits
locaux encore en attente ; les bombes/obus suivent le snapshot serveur.

Les rails restent compacts. Leurs détails s’ouvrent 2,5 s à l’entrée, lors d’un
réglage, changement d’arme, dégâts, seuil critique, décrochage ou début/fin de ravitaillement ;
ils sont aussi consultables au survol ou au focus clavier. La vitesse ne les
maintient pas ouverts en permanence. Les menus masquent les rails et la jauge.
L’état de combat reste en petit cartouche haut ; les changements de vague ont
une notification de trois secondes. Les commandes d’intervague restent accessibles.

`test-hud-bank-ui.mjs` exerce les vrais gestionnaires de signature, annulation,
répétition, attente serveur, erreurs, documents périmés/reset et soldes négatifs,
ainsi que les variantes et le repli d’obus du HUD. Le navigateur a signé une
offre dans le composant réel, vérifié les cartes, le tableau et le rendu des rails
sur des données de démonstration. La connexion UDP et WebGL du navigateur distant
ne permettent pas de conclure sur une partie WAN ; les tests natifs restent distincts.

Capture historique avant ECO-02 : [interface du lot précédent](ui-bank-integrated.jpg).
Les réglages actuels de lunette/coaxiale, de prêts et de réapparition sont dans
[retours terrain](field-update.md).

Le [lot lisibilité, nettoyage et Spitfire](clean-flight.md) ajoute le S6 acheté,
les raccourcis physiques de poste, les projectiles aux couleurs de la coque,
la mire balistique et la salissure commune. Il remplace les anciens dégâts
de collision avec un insecte et les anciennes commandes d’armes lourdes.

Le [dernier lot](multiplayer-return.md) remplace les rails par statistiques au
viseur et aide permanente, étend la réserve gratuite et déploie tous les achats
de véhicules à l’emplacement choisi. Le Spitfire a désormais 1 000 balles.

## Véhicules d’appui du 30 octobre

Le [H2 et le D2](support-vehicles.md) complètent cette flotte. L’assistance sans
pilote du H2 est spécifique ; les avions continuent leur physique neutre.
Les quatre rôles supplémentaires portent le catalogue courant à 600 variantes.
