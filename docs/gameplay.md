# Gameplay actuel

Référence consolidée le 30 octobre 2026, comportement du runtime Node courant.
Mettre à jour les sections concernées lorsque le comportement change.

## Session réseau

Le serveur Node utilise WebRTC sur UDP uniquement. Les mouvements sont locaux,
relayés par le serveur à 20 Hz ; signatures, achats, impacts et changements de
monde passent sur un canal fiable avec confirmation. Aucune connexion de jeu
n'est ouverte si UDP n'est pas confirmé. Toute la partie reste en mémoire et
un redémarrage la supprime. Le [guide UDP](udp-server.md) distingue ce runtime
de la version publique historique encore sur Sites/D1.

## Boucle de jeu

Les joueurs rejoignent une salle coopérative, apparaissent à pied sur le bureau
et utilisent une caméra à la troisième personne. Ils rejoignent physiquement un
équipement, remplissent son dossier et en prennent un siège. Les avions ont du carburant et
des munitions limités, à compléter en se posant et s’arrêtant dans une station. L’objectif est de
protéger la poubelle contre les insectes ; les arrivées ennemies augmentent
l’infestation. La mort ouvre une observation à caméra fixe ; un clic volontaire donne accès au purgatoire et à la paperasse de retour en jeu.

Avant chaque vague, le serveur annonce les entrées et les horaires des groupes. La préparation dure une minute par défaut. Votez pour un plan commun, puis équipez les objets compatibles. Une fois le vote résolu, tout joueur peut lancer la vague avant la fin du compte à rebours. La première vague combine fourmis et moucherons, puis le budget des vagues augmente de moitié à chaque étape, jusqu'à 2 400 points. Voir [progression](progression.md). Des groupes aériens arrivent depuis
plusieurs aérations, se séparent et se rejoignent ; fourmis et cafards empruntent
des parcours terrestres depuis des trous. La durée des trajets dépend de leur longueur à vitesse conservée et est partagée
avec le serveur pour l’arrivée à la poubelle. Le système est guidé et déterministe, sans navigation générale
évitant tous les équipements placés par les joueurs.

Le panneau **Équilibrage et nuées** permet à tous les joueurs de modifier les
paramètres de la room et d'envoyer des lots d'ennemis par espèce, y compris hors
combat. Une nuée de debug rejoint la vague courante ou démarre une vague de test
sans composition automatique, selon la phase. Voir [équilibrage par room](room-balance.md).

## Équipements et combat

Un chasseur monoplace et un bombardier sont disponibles au départ. Le bombardier
a un pilote, un mitrailleur dorsal et un mitrailleur de queue. Un exemplaire de réserve prêt
par type initial est conservé ; dès son décollage, un successeur gratuit apparaît sans supprimer les avions utilisés. Les achats fournissent un Stuka, un Spitfire,
un tank, un hélicoptère biplace ou une DCA mobile, dont la destruction est définitive. Les sièges sont exclusifs.

Chaque accès publié aux équipements, y compris une nouvelle entrée, passe par un
cercle au sol et un dossier de deux documents obligatoires, avec parfois une annexe. La signature s’effectue à la souris
ou au toucher et part automatiquement au relâchement d’un trait valide. Le tampon
est immédiat ; la réponse serveur confirme le document et l’attribution du siège.
L’archive locale empile les documents confirmés pendant la session, à travers les
morts. Elle est vidée à la réception d’une remise à zéro de la partie.

Le pilotage par défaut vise un point à la souris avec assistance, inspiré du
principe de War Thunder. Z/S et les flèches haut/bas pilotent le tangage, Q/D et
les flèches gauche/droite le roulis, et A/E le lacet. Une commande manuelle
remplace l'assistance souris sur son axe tant qu'elle est active, sans désactiver
les autres axes assistés ; voir [commandes](controls.md). Un avion
peut rouler et se poser si sa vitesse, sa descente et son attitude le permettent.
Au sol, il faut l’arrêter pour en sortir. Toute sortie aérienne commence en chute
libre avec la vitesse héritée ; le parachute s’ouvre et se replie manuellement.

Les équipements commandés depuis un appareil descendent dans un colis sous
parachute à **1 m/s dans le décor**, jusqu'à une surface porteuse disponible.
Le serveur y déploie l'équipement une seule fois ; le colis n'est pas utilisable
en vol. Voir [livraisons](issues-15-16-17.md#correction-de-la-vitesse-après-retour-en-jeu-version-70).

Le tank a un pilote/MG avant, un tireur canon/coaxiale et un mitrailleur supérieur.
Le Stuka et le pilote du bombardier larguent des bombes en maintenant Espace
(0,5 s ; 6 et 50 bombes respectivement). Le clic gauche sert aux MG ; au canon du
tank, clic gauche tire HE/AP et Espace la coaxiale. B est supprimé. Les stocks, commandes et dégâts sont détaillés
dans [véhicules et banque](vehicles-bank.md). Le HUD affiche les statistiques de coque près du viseur et une aide permanente
en bas à gauche. Les anciens panneaux repliables sont masqués ; la jauge DCA reste. Le banquier (bouton ou N) propose trois emplacements
de prêts partagés, consultables et signables dans tous les postes et mondes.

Chaque impact infligeant des dégâts à un insecte déclenche une gerbe de grosses gouttes
rouges, y compris sur un coup fatal. Cet effet purement visuel fonctionne aussi à partir
des augmentations de dégâts reçues des autres joueurs (une gerbe au maximum par
actualisation serveur), sans modifier les PV, le réseau ni la balistique.
Les gouttes retombent, disparaissent rapidement et sont regroupées dans un seul
maillage instancié plafonné à 240 particules. Les murs et les véhicules gardent
leurs effets d'étincelles habituels ; aucun sang n'est ajouté aux joueurs.
Les mitrailleuses tirent des traceurs légèrement dispersés depuis leurs canons.
La cadence locale rattrape les images retardées sans attendre les confirmations
réseau ; les rafales vues à distance suivent une cadence approximative plutôt
qu'un tir aléatoire à chaque image. Voir [stocks et réseau](vehicles-bank.md).
Les projectiles subissent gravité et traînée et sont supprimés après impact ou
expiration. La DCA tire des obus à éclatement réglable en distance, à cadence
réduite, avec fumée noire persistante. Le tir allié inflige des dégâts. Les joueurs ont 100 PV ; une résurrection restaure tous les PV. Les insectes
tués tombent et s’estompent avant suppression. Voir [physique](economy-physics.md)
et [armement](scale-fleet-weapons.md).

## Purgatoire et économie

L’accès au bureau de Saint Pierre dépend de la présence physique dans sa zone.
L’ordre de la file guide les PNJ sans donner une priorité abstraite de signature.
Les collisions permettent de se bousculer. Le combat à mains nues est supprimé ;
à pied, chacun utilise son pistolet semi-automatique à 10 dégâts fixes, sans
chargeur ni rechargement, dans le bureau et les deux purgatoires. Les armes
personnelles sont inutilisables dans tous les équipements. Les PNJ ne ripostent
pas et conservent leurs dégâts sans régénération. Voir [file physique](purgatory-queue.md).

Une vague terminée sans défaite verse une prime commune immédiate, de 4 $ à la
première vague à 20 $ au maximum. Les premiers achats commencent à 4 $, puis
les prix montent avec les installations et niveaux acquis.
Chaque PNJ accepté par Saint Pierre ou tué au purgatoire est définitivement
libéré et rapporte un dollar commun une seule fois. Un ennemi abattu dans le
bureau ne rapporte pas directement d’argent. Chaque dollar déclenche une courte
sonnerie chez tous les joueurs présents, même dans les autres mondes. Le service des PNJ
continue côté serveur sans joueur humain au purgatoire. Le menu P permet d’acheter
une DCA, un radar ou une station à placer sur un support solide, un Stuka, un Spitfire, un tank et des
améliorations partagées de moteur ou de munitions. Prix et niveaux sont définis
par `src/equipment.js` ; [économie](economy-physics.md) détaille les garanties.
La remise à zéro efface monnaie, installations et améliorations : aucune
progression permanente entre parties n’est implémentée.

## Échelle et présentation

Le décor est en mètres réels. Personnages, véhicules et quantités linéaires de
référence utilisent le ratio de carte, actuellement 3/1000 pour le bureau : un
personnage de référence de 1,80 m mesure donc 5,4 mm. Le purgatoire utilise son
propre ratio. Les durées et vitesses angulaires ne se multiplient pas par ce ratio.

Les modèles sont des géométries procédurales Three.js ; les sons sont synthétisés
avec Web Audio et spatialisés. Les modèles Meshy sont embarqués localement ; aucun enregistrement sonore externe
n’est actuellement intégré. Les événements importants ont des indications sonores,
dont les vagues, les signatures et les tirs. La prise en charge graphique de
secours permet un diagnostic, sans garantir le rendu WebGL final.

## Contrats, changements de poste et récidive

Le titre affiché est « i am a moucheron ». Le catalogue embarqué contient dix
variantes pour chacun de 65 documents/contextes, soit 650 variantes de documents, avec les contrats adaptés aux trois postes du tank :
pilote, mitrailleurs dorsal, arrière et ventral, DCA, trois documents classiques, cinq
supérieurs et mutation/demande/acceptation d’échange pour chaque poste embarqué.
Le texte reste stable pendant la signature ; la variante immédiatement précédente
est évitée pendant la session. Les contrats supérieurs sont nettement plus longs
et leur corps est intégralement consultable par défilement.

À bord d’un appareil à plusieurs places, les touches physiques Digit1–Digit7
ou le panneau des postes demandent un changement contractuel. Échap libère le curseur.
Un siège libre demande un contrat ; un siège occupé demande la signature initiale
du demandeur puis celle du destinataire. Refuser, partir ou se déconnecter annule
la demande. Les postes sont conservés jusqu’au transfert atomique et revalidés à
cet instant. Au sol comme en vol, quitter le cockpit pour un autre poste d’avion ne crée
aucun pilote automatique (l’hélicoptère possède sa propre assistance au stationnaire) : un client désigné continue la physique avec commandes
neutres et les derniers gaz, jusqu’à reprise des commandes ou crash.

Mourir au purgatoire ouvre aussi une observation avant le bouton d’accès au super
purgatoire, réservé aux joueurs, avec super Saint-Pierre. Cinq signatures ramènent au purgatoire classique, dont les trois
signatures sont à refaire. Mourir au super purgatoire recrée le corps au même
endroit et réinitialise les cinq documents, sans monde supplémentaire. Chaque
transition restaure 100 PV ; tuer un joueur ne rapporte jamais d’argent.

Voir [combat et mondes](combat-worlds.md) pour les valeurs et garanties réseau.

## Retours de partie après 025

Les noms flottants sont retirés. Les moucherons sont agrandis d’un facteur total de 6,075, avec tolérance de tir supplémentaire de 20 % ; les
insectes blessés montrent leurs PV, de la fumée puis des flammes à 30 % de PV.
Les morts aériennes ont un son de chute spatialisé. Voir
[retours de partie](party-feedback.md) pour les seuils, les signatures fiabilisées
et les apparitions périphériques, et le [diagnostic et correction du pistolet](pistol-diagnosis.md).

## Identification, contrats et ravitaillement

Les appareils ont une teinte persistante et les pseudos de leur équipage inscrits
sur la carrosserie. Déchirer un document normal fournit un nouvel exemplaire
obligatoire ; une annexe présente dans 5 % des dossiers peut être déchirée sans
accepter sa clause. La signer applique son effet pendant l’occupation du poste.

Les avions disposent de cinq minutes de carburant à plein gaz et d’environ une
minute de tir par poste armé. Une station initiale à Alpha répare et recharge les véhicules
à portée, automatiquement et contre paiement, même en mouvement ou en vol. Les
stations achetées fournissent le même service. La caisse commune paie au prorata
les PV, le carburant et chaque catégorie de munitions ; en cas de fonds insuffisants,
la somme est répartie équitablement entre les véhicules éligibles.
Voir [le tarif et les limites du lot G1](economy-physics.md#tarification-automatique-des-stations-lot-préparatoire-g1-castor). Stations supplémentaires et radars sont
vendus 4 $, puis +2 $ par exemplaire de leur type. Sans radar, aucun ennemi sur
la carte ; chaque radar révèle ceux dans un cylindre de rayon 2 m, à toutes hauteurs, sans masquer la scène.
Voir [logistique et contrats](logistics-contracts.md) pour les valeurs, garanties
et limites de vérification.

## Retours terrain intégrés

Le pistolet tire depuis la main vers le point du réticule, avec caméra à l’épaule
et obstacles revérifiés depuis le canon. La chute utilise la gravité humaine multipliée par le ratio du personnage,
un parachute progressif et des dégâts d’impact verticaux. Le retour après
purgatoire se fait au départ, sauf contrat personnel de lit signé (E au lit).
Les lits s’achètent 4 $, puis +2 $ ; plusieurs joueurs peuvent signer le même.
Le tireur canon du tank utilise une lunette ; C maintenu observe sans tourner
la tourelle et suspend les tirs. Les nouvelles offres de prêt sont à 10–20 %
par vague ; les contrats signés gardent leurs conditions. Détails, valeurs,
causes confirmées et tests : [retours terrain](field-update.md).

## Lisibilité, nettoyage et Spitfire

Les installations passent par un bon payé à la signature, puis se posent avec E ;
Échap conserve l’objet pour reprise depuis l’atelier. Les collisions avec un
insecte coûtent 5 % de ses PV restants à la coque, une seule fois par impact, et
la salissent pour tous ses occupants. À pied au sol, Espace maintient un jet qui
nettoie à courte portée, plus vite à plusieurs. Le Spitfire acheté dispose de six
MG avec de petits décalages et de 1 000 balles communes, dernière salve partielle comprise. Les projectiles portent la couleur de leur
coque ; seule la sirène de piqué du Stuka subsiste. Valeurs et limites :
[lisibilité, commandes, nettoyage et Spitfire](clean-flight.md).

Les achats de tous les véhicules utilisent désormais le bon signé et la pose par E,
au sol ou sur mobilier, avec chasseur 8 $ et bombardier 16 $. Les bombes du B3
ont le double du rayon de celles du Stuka ; les personnages portent leurs initiales
et une couleur propre. [Référence du dernier lot](multiplayer-return.md).

## Hélicoptère et camion DCA

H2 : pilote et copilote, souris pour incliner, Z/O/Haut pour monter, S/Bas pour descendre et retour
assisté au stationnaire. C observe et suspend les roquettes. Le copilote dispose
d’une MG et d’un missile guidé manuellement depuis son poste, avec détonation au
second clic. D2 : conducteur et tireur sur semi-remorque, obus à fusée armée à
0,3 s uniquement ; proximité réglée à la molette, sans explosion d’impact propre.
Valeurs, choix, garanties réseau et vérifications restantes :
[référence du lot](support-vehicles.md).

Le [correctif de visibilité](enemy-visibility.md) place les apparitions devant les
aérations et recrée les bons modèles aux changements de vague. Les moucherons
sont trois fois plus gros que dans la livraison précédente.

Les six espèces utilisent désormais des dimensions contrôlées en pixels :
[facteurs et mesures](enemy-visibility.md). Les terrestres sont relevés selon
leurs pattes, avec une marge de navigation adaptée à leur corps élargi. Les PV et primes restent inchangés ; la première vague suit maintenant le même
tirage que les suivantes, avec au moins deux fourmis et des moucherons en nuées ×5.
L'ancienne composition fixe 20 + 4 est décrite dans [les nuées densifiées](dense-swarms.md).
VAG-07 réduit taille et vitesse des fourmis, selon le lot confort.

Le [lot confort de jeu, version 37](comfort.md) précise réparation, zoom, jauges,
radar à pied, remise à zéro, fourmis et projectiles du pistolet courants.

Une commande manuelle de debug crée une nuée unique sur un trajet et à une
entrée commune, même avec plusieurs milliers d'individus (les espèces au sol
gardent leur parcours terrestre propre). L'étendue spatiale croît avec
l'effectif, sans accélérer les insectes ; les vagues automatiques restent
réparties en plusieurs groupes.
Voir [nuées densifiées](dense-swarms.md) et [équilibrage](room-balance.md).

Les [nuées densifiées](dense-swarms.md) multiplient les seuls moucherons par cinq,
avec mêmes groupes de trajets et calcul de voisinage spatial.

Les [commandes H2 corrigées](helicopter-controls.md) précisent les touches,
le retour au stationnaire et les roquettes alignées sur la coque.

Le [lot de retours du 30 octobre, version 48](returns-30-october.md) décrit les correctifs
physiques, sons/HUD, livraisons sous parachute et parcours du purgatoire.

Les [issues 15–17](issues-15-16-17.md) précisent la descente continue des colis,
le mapping Maj/Ctrl et tangage du H2, et la réduction supplémentaire des vitesses terrestres.

Les [réglages d’équilibrage par room](room-balance.md) sont consultables par tous et
modifiables à tout moment par le créateur de la room.

## Rat, moustique et araignée pondeuse

Le rat géant possède 5 000 PV et avance lentement. Le moustique possède 70 PV et esquive selon des oscillations déterministes. L'araignée pondeuse possède 1 200 PV : elle libère **100 bébés araignées** de 20 PV à sa mort, au lieu du site de décès, avec une trajectoire dispersée et rapide vers la poubelle. Chaque bébé survivant compte **1 point d'infestation**, soit 100 possibles pour la portée complète (défaite à 20). Les bébés morts ne créent pas d'âmes rémunérées. Moustique dès vague 3, pondeuse dès vague 11, rat dès vague 15. Voir [bestiaire](enemy-bestiary.md).

Les [vitesses physiques des espèces](enemy-bestiary.md#vitesse-physique-dans-la-pièce) sont explicites en m/s dans le bureau, indépendantes de la taille des insectes et du nombre de membres de la nuée. L'accélération cachée des bébés araignées et les oscillations trop rapides des moustiques ont été corrigées.

## Défenses terrestres

À pied au sol du bureau, ouvrir « Défense » puis choisir barricade, sucre, ruban,
réparation ou suppression. Le menu se ferme et la caméra reste en troisième
personne. Un aperçu suit le point visé au centre de la caméra, indépendamment de la direction
de marche. Visez une surface proche ; une paroi ou un point hors de portée ne
permet pas de poser. Ce principe s'applique aussi aux équipements et véhicules
achetés. Échap quitte le mode de pose.

Maintenez le bouton de la molette, dirigez la souris vers un outil puis relâchez
pour le sélectionner. Au centre, le choix est annulé. Pour une barricade ou un
ruban, le premier clic (ou E) fixe le début indiqué par un petit repère sans
orientation. Visez ensuite la fin, en marchant si nécessaire, puis cliquez de
nouveau (ou E). Les deux points déterminent seuls la longueur et l'orientation.
Le bouton de confirmation suit ces mêmes deux étapes. Le coût reste de 1 $ par
tranche de 20 cm ; les longs murs sont découpés en segments réparables. La
barricade est composée de briques colorées en trois rangées décalées, plus ou
moins nombreuses selon sa longueur. R oriente le sucre et le ventilateur.
Le sucre coûte
3 $, une réparation 1 $, la suppression est gratuite. L’aperçu rouge et le message
signalent un refus ; le serveur revalide position, caisse et occupation avant
paiement. La pose exige le sol du bureau, sans parachute. Les défenses sont
partagées par room et effacées à sa remise à zéro. Les terrestres utilisent alors
la navigation serveur qui tient compte des barricades, appâts et rubans ; les
volants gardent leurs parcours. Le radar conserve les constructions et rayons
d’appât ; il ne sert pas à construire. Le rendu et le confort de pose demandent
encore un essai WebGL/UDP en partie réelle.

## Défense aérienne

Quatre aérations alimentent deux couloirs qui se croisent à des altitudes différentes.
Le nuage de phéromones de chaque entrée apparaît en couleur avant le passage des
insectes. Les volants conservent une dispersion propre autour du couloir.

Au sol, sélectionnez **Ventilateur** dans la roue de construction. La flèche montre
la direction du souffle. Tournez avec **R** et regardez la traînée se déplacer avant
de confirmer la pose (4 $). Le ventilateur forme une colonne d’air de 1,8 m de rayon.
Le déplacement latéral culmine à environ un mètre en son centre. Des ventilateurs
opposés se compensent, des ventilateurs voisins combinent leur souffle. Les
insectes déjà engagés rejoignent le nouveau tracé en 2,5 secondes en continuant
d’avancer. Retirez un ventilateur avec **Enlever** pour rétablir progressivement
le parcours. Le départ et l’arrivée restent fixes.

Le [bombardier B3 à quatre places](b3-model.md) conserve son camouflage Meshy ; un disque coloré au-dessus identifie l’appareil.


## G1 Castor (première étape, version 179)

Le **G1 Castor** est un camion monoplace à six roues, achetable pour **12 $** avec le bon signé des véhicules. Z/S et Q/D permettent de conduire ; la souris vise sa mitrailleuse légère (500 balles, recharges payantes). **V** bascule une vue tactique surélevée. Plus rapide que le tank, il possède un rayon de soutien sphérique de **50 cm** qui peut soigner et ravitailler les alliés en mouvement ou en vol et se réapprovisionner lui-même. Le service utilise la caisse commune.

**La construction en roulant n'est pas encore disponible dans ce premier lot.** Le modèle basse définition est **provisoire**, les trois modèles texturés Meshy (châssis, tourelle et roue) attendent leur import. Voir [l'issue #76](https://github.com/simonjamain/i-am-a-moucheron/issues/76) et [la note de reprise](tasks/g1-castor.md).


### Construction depuis le Castor (version 185)

Sur le sol du bureau, le conducteur du G1 Castor ouvre la roue de défense par **clic molette**. Pour les **barricades LEGO** et les **rubans**, un clic gauche engage la dépose continue **derrière le camion** pendant qu'il roule et un autre clic arrête. La pose est interrompue en cas d'impossibilité (caisse vide, obstacle, écart trop grand), de changement de conducteur ou de zone. Les segments sont facturés un par un, au tarif de 1 $ chacun, sans achat anticipé ; le chemin peut donc être préparé en mouvement. Les pièges ponctuels (sucre, ventilateur), la réparation et le retrait utilisent la visée de caméra comme à pied. Le placement conserve les contraintes du bureau et la validation autoritaire Node ; il ne permet pas de construire depuis un bureau surélevé ou à distance.
