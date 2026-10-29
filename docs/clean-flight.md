# Lisibilité, commandes, nettoyage et Spitfire

Référence du lot ECO-03 à VEH-05, livré sur **Node, RAM et UDP** le 29 octobre 2026. Aucun déploiement sur le Worker historique, aucune nouvelle image Docker.

## Prix, bon signé et pose

`shopPrice` reste le calcul commun des tarifs. `purchaseCount` compte les objets
posés **et les commandes déjà payées en attente**, avec des compteurs indépendants
par type. La station gratuite est exclue. L’erreur « Poser · 30 $ » était un texte
HTML fixe ; le bouton affiche désormais « E · Poser · déjà payé ».

Pour DCA, station, radar et lit : atelier → bon avec prix courant → signature
au relâchement → confirmation serveur → aperçu de pose directement. E pose,
Entrée reste un alias ; maintenir E ne multiplie pas les poses. Le lieu doit être
valide et le serveur revérifie support, proximité, chevauchements et capacité.
Aucune seconde signature, aucun second débit. Une pose invalide conserve l’achat.
Échap annule l’aperçu ; l’atelier propose « Déjà payé · Reprendre la pose ».
Le prix du bon périmé est refusé avant paiement : fermer puis rouvrir pour relire.

Les commandes prépayées sont personnelles à la connexion, restent disponibles
après une mort et comptent dans la limite des 24 installations. À expiration du
joueur (12 s sans activité), les objets non posés sont remboursés une fois à la
caisse commune. Un reset efface commandes et monnaie. Ce stock ne possède pas le
secret de reconnexion des contrats de lit : une reconnexion créant un nouvel ID
ne reprend pas l’ancienne commande ; son remboursement intervient à l’expiration.
Les bons et la pose sont dédupliqués côté domaine, en plus du protocole fiable.
Les achats directs d’appareils et améliorations restent ceux de l’atelier.

## Postes et commandes d’armes

Les touches physiques `Digit1` à `Digit7` sélectionnent les postes dans l’ordre
de `VEHICLES[type].seats`, sans dépendre de Shift ni des caractères AZERTY. Elles
appellent le même `seat-request` que le bouton : contrat pour place libre,
proposition signée puis accord du titulaire pour échange. Aucun transfert direct.
Le panneau en haut à droite affiche numéro, rôle, pseudo et poste personnel
surligné. Les saisies et formulaires neutralisent les raccourcis.

| Contexte                             | Clic gauche                | Espace maintenu                                       |
| ------------------------------------ | -------------------------- | ----------------------------------------------------- |
| Tireur canon du tank                 | Canon HE/AP                | Coaxiale                                              |
| Pilote d’avion                       | Mitrailleuses si présentes | Bombes si présentes                                   |
| Autres postes de mitrailleurs et DCA | Tir                        | Tir, raccourci conservé                               |
| À pied au sol, bureau et purgatoires | Pistolet semi-automatique  | Jet de nettoyage                                      |
| Personnage en chute                  | Pistolet                   | Ouverture/repli du parachute, un changement par appui |

B n’a plus d’action d’arme. C maintenu au canon du tank conserve l’observation
sans tourner la tourelle et interdit les deux armes. Relâchement, menu, perte de
focus et changement de poste effacent les commandes maintenues.

Le bombardier initial dispose de **50 bombes**, le Stuka de **6**. Une pression
brève largue une bombe ; le maintien largue à intervalle nominal de **0,5 s**.
Le contrat de cadence double cet intervalle. Stocks et délai restent validés par
`heavy-fire` côté serveur ; un envoi en cours est unique. En cas de latence élevée,
l’attente de cette confirmation peut réduire la cadence effective des armes
lourdes. Les MG restent prédites immédiatement et réglées par lots idempotents.
Le ravitaillement habituel remplit ces nouvelles capacités en dix secondes.

## Provenance et mire

Les MG locales/distantes, obus et bombes utilisent le numéro de teinte persistant
de leur véhicule, indépendamment de son occupant. Les six armes du Spitfire ont
six bouches distinctes ; les traceurs distants utilisent ces mêmes points.
Le pistolet utilise le cœur lumineux/halo des traceurs, avec un effet distant
sans dégâts supplémentaires. Les HE sont des cylindres trapus, les AP des cônes
allongés ; les bombes gardent leur corps à empennages. Les tailles visuelles ne
changent ni rayons de collision, ni dégâts.

`ballisticMarks` utilise **le même `integrateOrdnance`** à pas de 1/120 s que le
serveur, avec vitesse de l’obus sélectionné, gravité miniature, traînée et vitesse
héritée du tank. Repères à 0,15 / 0,30 / 0,60 / 1,20 / 2,40 mètres du décor,
projetés depuis le canon. Les graduations hors écran ou trop rapprochées du centre/entre elles sont masquées ; HE/AP et zoom
actualisent la projection. C masque la mire. Aucun ajustement automatique du canon.

## Impacts et salissure

Le serveur balaie le déplacement de chaque coque contre les positions partagées
des insectes, avec volumes sphériques bornés issus de leur taille. Il déduit
**0,05 × PV restants de l’insecte** au moment du contact, sans blesser l’insecte.
L’ancienne soustraction client liée au coût de l’ennemi est supprimée. Le contact
est mémorisé par coque et ennemi jusqu’à séparation ; lecture d’instantané ou
client supplémentaire n’inflige pas un second impact. La règle vaut aussi pour
le tank et les coques vacantes ; décor et tirs conservent leurs règles distinctes.
Les positions restent déclaratives dans le modèle coopératif du jeu.

Chaque impact ajoute **0,18** de salissure, plafonnée à 1. La peinture extérieure
brunit progressivement ; un voile taché couvre la vue de tous les occupants,
avec opacité maximale **0,42**. À 0,55 apparaît discrètement le conseil de nettoyage.
Sortir enlève le voile personnel ; la coque garde sa salissure pour le prochain
occupant. Ce statut ne change aucune performance.

À pied au sol, Espace maintenu produit un jet illimité dans la direction visée.
Portée **2 mètres du décor**. Le serveur part de la taille du personnage, vérifie
la première coque et les obstacles, puis retire 0,1 de salissure par seconde
et par joueur : environ **10 s** pour une coque complètement sale, plus vite
à plusieurs. Les purgatoires montrent le jet sans nettoyer les coques du bureau.
Un occupant ne peut pas laver depuis son siège. La destruction rend la coque
inlavable ; reset supprime les états.

Le client envoie au plus cinq commandes de jet par seconde, une en cours ; le
serveur borne le temps imputable à 0,25 s par rapport et par joueur. Il ne rattrape
pas une longue interruption réseau. Les particules sont purement décoratives,
28 points réutilisés par joueur actif, sans commande fiable par particule.
La transition sale → propre produit un seul événement partagé et 24 étoiles
finies. Limites : 16 groupes d’étoiles, 64 traceurs personnels, 128 projectiles
lourds, 256 traceurs balistiques. Les matériaux sont libérés au retrait.

## Spitfire et identité sonore

Le Spitfire S6 est un achat à **24 $**, deux Stuka. Monoplace sans bombes,
ailes elliptiques et six mitrailleuses, trois par aile. Perdu définitivement à sa
destruction ; achat suivant possible, sans remplacement gratuit.

Vitesse plafonnée à **122,5 m/s de référence** contre 70 ; facteur de rotation
**1,45** contre 1. La poussée est réglée à 70 pour atteindre le nouveau plafond,
sans prétention de modèle historique. À vitesse égale, les réponses angulaires
mesurées sont multipliées par 1,45. Les améliorations et clauses restent applicables.
Chaque arme tire 75 dégâts de base simultanément toutes les 0,06 s : **4 500 balles**
communes, soit 750 salves complètes et **45 s** de tir nominal. Moins de six balles
n’autorise aucune salve partielle ; le HUD conserve le compte de balles total.
Accès, contrats, teinte, stations, dégâts et nettoyage suivent les autres avions.

La sirène supplémentaire de piqué ne concerne que le Stuka occupé, selon sa vitesse
et sa descente. Sortie du dernier occupant, destruction, changement de scène ou
arrêt du piqué suppriment sa boucle. Les autres sons restent actifs pour les autres
avions, dont le Spitfire.

## Contrôles et limites

`test-clean-flight.mjs` vérifie le domaine réel : prix, signature, concurrence,
fonds, propriété et pose idempotente, remboursement, cadence/épuisement/recharge,
les six dernières balles via les vrais `shoot`/`bullet`, autonomie complète,
ratios physiques, contacts persistants/séparés et ennemis blessés, jet obstrué,
coopération et événement propre unique. Il exerce les vrais gestionnaires clavier
et de signature et compare la mire à l’intégration des obus.

`test-udp-native.mjs` relie deux vrais pairs UDP : commandes fiables, achats,
Spitfire, salissure partagée/nettoyage/étoiles et trace du pistolet observés par
l’autre pair. Les fixtures préparent les positions dans la salle locale ; ce
n’est pas une partie jouée sur Internet. Le test RAM traitait parfois une annexe
avant sa position légale : cette fixture aléatoire a été corrigée sans changer
les règles de signature.

Navigateur : chargement du client et vrais composants de bon, signature, HUD du
tank et stock Spitfire sur données de démonstration. Le navigateur de contrôle
n’a pas de contexte WebGL. La géométrie est vérifiée sans GPU ; lisibilité en
combat, sensations de vol, écoute, tactile physique, charge et WAN restent à
vérifier sur la VM. Les tests ne revendiquent pas une validation visuelle 3D.

[Comparaison du modèle Spitfire et du chasseur](spitfire-model.png) : projection
CPU des triangles réels, sans capture WebGL.
