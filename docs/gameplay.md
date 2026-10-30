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

La première vague démarre dix secondes après le lancement de la partie. Après
chaque vague, la pause dure au maximum soixante secondes ; le déclenchement manuel
peut la raccourcir. Un budget de difficulté croissant compose des vagues variées
avec des ennemis de résistances différentes. Le départ comporte vingt moucherons et quatre fourmis, avec des parcours
étendus dans toute la pièce à vitesse conservée ; les types plus difficiles
sont débloqués progressivement. Voir [progression](progression.md). Des groupes aériens arrivent depuis
plusieurs aérations, se séparent et se rejoignent ; fourmis et cafards empruntent
des parcours terrestres depuis des trous. La durée des trajets dépend de leur longueur à vitesse conservée et est partagée
avec le serveur pour l’arrivée à la poubelle. Le système est guidé et déterministe, sans navigation générale
évitant tous les équipements placés par les joueurs.

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
principe de War Thunder. Les commandes directes restent disponibles. Un avion
peut rouler et se poser si sa vitesse, sa descente et son attitude le permettent.
Au sol, il faut l’arrêter pour en sortir. Toute sortie aérienne commence en chute
libre avec la vitesse héritée ; le parachute s’ouvre et se replie manuellement.

Le tank a un pilote/MG avant, un tireur canon/coaxiale et un mitrailleur supérieur.
Le Stuka et le pilote du bombardier larguent des bombes en maintenant Espace
(0,5 s ; 6 et 50 bombes respectivement). Le clic gauche sert aux MG ; au canon du
tank, clic gauche tire HE/AP et Espace la coaxiale. B est supprimé. Les stocks, commandes et dégâts sont détaillés
dans [véhicules et banque](vehicles-bank.md). Le HUD affiche les statistiques de coque près du viseur et une aide permanente
en bas à gauche. Les anciens panneaux repliables sont masqués ; la jauge DCA reste. Le banquier (bouton ou N) propose trois emplacements
de prêts partagés, consultables et signables dans tous les postes et mondes.

Les mitrailleuses tirent des traceurs légèrement dispersés depuis leurs canons.
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
avec Web Audio et spatialisés. Aucun pack de modèles ou d’enregistrements externes
n’est actuellement intégré. Les événements importants ont des indications sonores,
dont les vagues, les signatures et les tirs. La prise en charge graphique de
secours permet un diagnostic, sans garantir le rendu WebGL final.

## Contrats, changements de poste et récidive

Le titre affiché est « i am a moucheron ». Le catalogue embarqué contient dix
variantes pour chacun de 60 documents/contextes, soit 600 variantes de documents, avec les contrats adaptés aux trois postes du tank :
pilote, mitrailleurs dorsal et arrière, DCA, trois documents classiques, cinq
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
minute de tir par poste armé. Une station gratuite à Alpha remplit les réserves
en dix secondes, avion posé et arrêté. Stations supplémentaires et radars sont
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
leurs pattes, avec une marge de navigation adaptée à leur corps élargi. Les PV et primes restent inchangés ; la composition de départ est désormais
20 moucherons + 4 fourmis selon [les nuées densifiées](dense-swarms.md) ;
VAG-07 réduit ensuite taille et vitesse des fourmis, selon le lot confort.

Le [lot confort de jeu, version 37](comfort.md) précise réparation, zoom, jauges,
radar à pied, remise à zéro, fourmis et projectiles du pistolet courants.

Les [nuées densifiées](dense-swarms.md) multiplient les seuls moucherons par cinq,
avec mêmes groupes de trajets et calcul de voisinage spatial.

Les [commandes H2 corrigées](helicopter-controls.md) précisent les touches,
le retour au stationnaire et les roquettes alignées sur la coque.

Le [lot de retours du 30 octobre, version 48](returns-30-october.md) décrit les correctifs
physiques, sons/HUD, livraisons sous parachute et parcours du purgatoire.
