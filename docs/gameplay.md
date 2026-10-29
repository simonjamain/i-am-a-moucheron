# Gameplay actuel

Référence consolidée le 29 octobre 2026, comportement de la livraison du backlog du 29 octobre 2026.
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
l’infestation. La mort conduit au purgatoire et à la paperasse de retour en jeu.

La première vague démarre dix secondes après le lancement de la partie. Après
chaque vague, la pause dure au maximum dix secondes ; le déclenchement manuel
peut la raccourcir. Un budget de difficulté croissant compose des vagues variées
avec des ennemis de résistances différentes. Le départ comporte six moucherons
et dure environ une minute sans interception sur la graine de contrôle ; les types plus difficiles
sont débloqués progressivement. Voir [progression](progression.md). Des groupes aériens arrivent depuis
plusieurs aérations, se séparent et se rejoignent ; fourmis et cafards empruntent
des parcours terrestres depuis des trous. La durée des trajets dépend de leur longueur à vitesse conservée et est partagée
avec le serveur pour l’arrivée à la poubelle. Le système est guidé et déterministe, sans navigation générale
évitant tous les équipements placés par les joueurs.

## Équipements et combat

Un chasseur monoplace et un bombardier sont disponibles au départ. Le bombardier
a un pilote, un mitrailleur dorsal et un mitrailleur de queue. Un exemplaire vivant
par type initial est conservé ; sa destruction fournit un successeur gratuit. Les achats fournissent un Stuka
ou un tank dont la destruction est définitive. Les sièges sont exclusifs.

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
Le Stuka et le pilote du bombardier peuvent larguer des bombes (B ; le bombardier
utilise aussi le tir principal). Les stocks, commandes et dégâts sont détaillés
dans [véhicules et banque](vehicles-bank.md). Le HUD utilise des rails latéraux contextuels avec détails temporaires et une
jauge DCA près du viseur. Le banquier (bouton ou N) propose trois emplacements
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
une DCA, un radar ou une station à placer sur un support solide, un Stuka, un tank et des
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
variantes pour chacun de 40 documents/contextes, soit 400 variantes de documents, avec les contrats adaptés aux trois postes du tank :
pilote, mitrailleurs dorsal et arrière, DCA, trois documents classiques, cinq
supérieurs et mutation/demande/acceptation d’échange pour chaque poste embarqué.
Le texte reste stable pendant la signature ; la variante immédiatement précédente
est évitée pendant la session. Les contrats supérieurs sont nettement plus longs
et leur corps est intégralement consultable par défilement.

À bord d’un appareil à plusieurs places, Échap donne accès au panneau des postes.
Un siège libre demande un contrat ; un siège occupé demande la signature initiale
du demandeur puis celle du destinataire. Refuser, partir ou se déconnecter annule
la demande. Les postes sont conservés jusqu’au transfert atomique et revalidés à
cet instant. Au sol comme en vol, quitter le cockpit pour un autre poste ne crée
aucun pilote automatique : un client désigné continue la physique avec commandes
neutres et les derniers gaz, jusqu’à reprise des commandes ou crash.

Mourir au purgatoire conduit au super purgatoire, réservé aux joueurs, avec super
Saint-Pierre. Cinq signatures ramènent au purgatoire classique, dont les trois
signatures sont à refaire. Mourir au super purgatoire recrée le corps au même
endroit et réinitialise les cinq documents, sans monde supplémentaire. Chaque
transition restaure 100 PV ; tuer un joueur ne rapporte jamais d’argent.

Voir [combat et mondes](combat-worlds.md) pour les valeurs et garanties réseau.

## Retours de partie après 025

Les noms flottants sont retirés. Les moucherons sont agrandis de 35 % ; les
insectes blessés montrent leurs PV, de la fumée puis des flammes à 30 % de PV.
Les morts aériennes ont un son de chute spatialisé. Voir
[retours de partie](party-feedback.md) pour les seuils, les signatures fiabilisées
et les apparitions périphériques, et le [diagnostic différé du pistolet](pistol-diagnosis.md).

## Identification, contrats et ravitaillement

Les appareils ont une teinte persistante et les pseudos de leur équipage inscrits
sur la carrosserie. Déchirer un document normal fournit un nouvel exemplaire
obligatoire ; une annexe présente dans 5 % des dossiers peut être déchirée sans
accepter sa clause. La signer applique son effet pendant l’occupation du poste.

Les avions disposent de cinq minutes de carburant à plein gaz et d’environ une
minute de tir par poste armé. Une station gratuite à Alpha remplit les réserves
en dix secondes, avion posé et arrêté. Stations supplémentaires et radars sont
vendus 4 $, puis +2 $ par exemplaire de leur type. Sans radar, aucun ennemi sur
la carte ; chaque radar révèle ceux dans une sphère de 1 m, sans masquer la scène.
Voir [logistique et contrats](logistics-contracts.md) pour les valeurs, garanties
et limites de vérification.
