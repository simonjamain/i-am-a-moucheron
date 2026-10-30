# Identification, feuillets et logistique

Le serveur Node applique ces règles en RAM et sur des commandes UDP fiables.
Ses réserves, dossiers et achats disparaissent au redémarrage. Les références
aux migrations, à la persistance et aux requêtes HTTP ci-dessous décrivent le
backend Sites historique conservé pendant la transition. Voir [serveur UDP](udp-server.md).

Référence du lot du 29 octobre 2026. Les modules `logistics.js`, `malice.js` et
`vehicle-livery.js` portent les règles communes. Migration :
`0011_logistics_contracts.sql`. Les anciennes salles sont conservées ; leurs
appareils reçoivent des réserves pleines à leur première lecture avec cette version.

## Véhicules identifiables

Chaque appareil possède un numéro persistant, indépendant du pilote. Sa teinte
est `numéro × 137,50776405003785° modulo 360`, avec saturation 58 % et luminosité
57 %. Le numéro est attribué côté stockage et communiqué à tous les clients.
Les inscriptions des occupants sont des plaques fixées aux deux côtés de la
carrosserie, proches de chaque poste. Elles suivent l’orientation de l’avion et
les occultations ordinaires ; elles ne font pas face à la caméra. Aucun nom
flottant n’est réintroduit. Un changement d’équipage remplace les textures ; un
équipage identique les réutilise. Maximum : six plaques sur un bombardier.

## Déchirer et signer

Tous les documents ouverts proposent « Déchirer ce document ». Une déchirure
anime la feuille pendant 320 ms, efface le trait et fournit un nouvel exemplaire
s’il s’agit d’un document obligatoire. Les signatures précédentes restent
acquises. Les documents archivés ne peuvent plus être déchirés. Fermer un dossier
et refuser un échange restent des actions distinctes. Une déchirure ne tamponne
pas et n’ajoute aucune signature à l’archive. Les actions sont bloquées pendant
un envoi ; après erreur, le document peut être traité de nouveau.

Le serveur tire une annexe dans **5 % des dossiers**, au maximum une par dossier.
Le tirage, sa clause et sa position sont persistants. Un dossier d’accès fermé
puis rouvert au même poste conserve son jeton et sa progression. L’annexe se
place avant le premier ou le deuxième document obligatoire ; les mutations et
échanges peuvent également recevoir une annexe, avant leur contrat normal.
Les dossiers de résurrection n’en reçoivent pas. Le refus d’une annexe est
persisté sans signature et permet de poursuivre ; il ne dispense jamais des
signatures normales. Une signature et une déchirure concurrentes sont départagées
par une mise à jour conditionnelle : un seul choix est conservé.

Les quatre clauses ont chacune dix introductions préécrites. Le texte indique
son effet ; aucun avertissement extérieur ne signale le piège :

| Clause                  | Effet pendant l’occupation du poste                                    |
| ----------------------- | ---------------------------------------------------------------------- |
| Commandes à contre-sens | Tangage, roulis, lacet et variation des gaz inversés, pilote seulement |
| Tourelle contrariée     | Deux axes de visée inversés, mitrailleur ou DCA                        |
| Économie de poudre      | Dégâts du poste × 0,5, y compris DCA directe et éclatement             |
| Tir contemplatif        | Intervalle entre tirs × 2                                              |

Le pilote du bombardier peut désormais larguer des bombes ; ses clauses
de pilotage restent celles de son dossier. Les nouveaux postes et armes lourdes
appliquent aussi leurs clauses compatibles ; voir [véhicules et banque](vehicles-bank.md).
L’effet commence à l’attribution effective du poste et se termine à la sortie,
au décès ou au transfert. Il ne passe pas à l’occupant suivant et n’affecte ni
le pistolet ni les autres membres de l’équipage. Les dégâts fractionnaires sont
conservés : une mitrailleuse normale à 75 dégâts peut infliger 37,5 dégâts.

## Réserves des appareils

Les quantités appartiennent à l’appareil dans une table distincte du mouvement.
Changer de siège, quitter l’avion, se reconnecter ou changer de client simulant
le cockpit vacant ne remet pas les réserves à neuf.

L’horodatage des réserves ne recule jamais : une requête capturée avant une autre
mais traitée après elle ne peut pas remettre l’horloge en arrière et provoquer
un second décompte ou ravitaillement du même intervalle. La mise à jour reste
conditionnée à la révision lue pour gérer les accès concurrents.

- Carburant : **300 secondes à plein régime**. Consommation proportionnelle aux
  gaz, nulle moteur coupé. À zéro, seule la poussée cesse ; portance, gravité et
  commandes continuent. Les gaz peuvent être ramenés à zéro.
- Chasseur : **1 000 balles**, une émission toutes les 0,06 s, en alternance entre
  les deux canons ; ils partagent le stock du pilote.
- Bombardier : **667 balles par mitrailleur**, une émission toutes les 0,09 s,
  soit environ 60 s. Les deux postes ont des compteurs indépendants. Le pilote
  du bombardier possède 50 bombes, le Stuka 6, à intervalle nominal de 0,5 s.
- Spitfire : 1 000 balles, six départs légèrement décalés par salve et fin de réserve partielle.
- Bombes du Stuka et du bombardier, MG et obus du tank : réserves indépendantes
  détaillées dans [véhicules et banque](vehicles-bank.md#stocks-et-équilibre-initial).
- DCA fixe et pistolet : réserves illimitées ; DCA mobile limitée, voir plus bas.

Les tirs d’avion sont simulés **immédiatement dans le navigateur**, avec son,
traceur et trajectoire créés à l’appui, sans attendre le serveur. `aircraft-fire.js`
décompte localement les balles et transmet leurs identifiants au serveur par lots
(toutes les 250 ms au plus vite, 32 tirs maximum par lot, une requête en cours).
L’origine, la direction, la vitesse héritée et l’effet contractuel restent fixés
au déclenchement. À sec, aucun projectile n’est émis.

Le serveur débite chaque identifiant une seule fois. Les réserves révisées sont
réconciliées avec les débits locaux en attente ; un ancien snapshot ne rembourse
pas les balles prédites. En cas d’échec réseau dont l’issue est inconnue, les mêmes
identifiants sont réessayés après une seconde. La file est bornée à 128 tirs non
acquittés : une panne prolongée finit par arrêter la prédiction, sans munitions
infinies. Un refus définitif du serveur bloque la prédiction pour cette occupation.
Une réponse tardive ne crée **jamais** de projectile et ne modifie pas le nouvel
appareil du joueur. Les confirmations de réserves restent liées à leur véhicule.
Les dernières balles rapportées après un départ de poste peuvent être refusées ;
les tirs locaux ne sont pas rembobinés dans ce modèle coopératif.

Ce fonctionnement remplace l’autorisation HTTP préalable de chaque projectile,
introduite en version 028. Le carburant conserve son horodatage monotone et ses
mises à jour conditionnelles ; un mouvement ne ravitaille pas rétroactivement
les secondes passées en vol.

Le HUD donne les secondes de carburant équivalentes à plein gaz, le nombre de
balles du poste et l’indication de ravitaillement. Une cadence contractuelle plus
lente allonge la durée du stock sans en changer la capacité.

## Ravitaillement et installations

Une station gratuite est disponible à Alpha dès le départ, avec un cercle de
service de **0,12 m réel** de rayon, adapté au bombardier. Elle n’est pas un achat
et ne compte pas dans le prix des suivantes. Un avion vivant doit être posé,
au niveau du support et arrêté (tolérance numérique de 0,001 m/s de référence).
Un survol ou un roulage ne remplit rien. Chaque avion peut être servi en même
temps que les autres, gratuitement et sans réserve de station.

Dix secondes remplissent simultanément 300 s de carburant et toutes les munitions.
Une réserve à moitié pleine ne demande que cinq secondes. Quitter la zone ou
reprendre le mouvement interrompt le service et conserve le plein partiel.
Des cercles qui se recouvrent n’accélèrent pas le remplissage.

Stations supplémentaires et radars coûtent chacun **4, 6, 8… dollars**, avec des
compteurs séparés. Les DCA conservent leur propre progression. L’atelier affiche
le prix courant, fait signer le bon et débite une seule fois avant l’aperçu.
E pose sans nouveau paiement ; Échap conserve l’achat pour reprise. Les trois installations
utilisent une prévisualisation et un support solide ; le serveur contrôle aussi
proximité, obstacles, appareils garés, chevauchements, fonds et prix concurrent.
Une station exige une surface dégagée de 13 × 13 cm, suffisante pour l’envergure
du plus grand appareil. Le nombre total d’installations achetées est borné à 24.
La station gratuite demeure après une remise à zéro ; les achats sont effacés.

## Carte et radars

Aucun radar au départ. Sans radar, la carte garde ses repères, alliés et
installations et ne montre aucun ennemi. Un radar révèle les ennemis aériens et
terrestres dans un **cylindre vertical de rayon 2 m du décor**, sans obstruction du mobilier. Les
couvertures se réunissent sans doubler les contacts ; la sortie de couverture retire
immédiatement le point. La scène 3D, les PV et les effets de dégâts ne sont jamais
masqués. Détection et positions dépendent des mêmes installations persistantes
et des trajectoires partagées ; aucune dernière position ennemie n’est stockée.

## Vérifications et limites

`test-logistics-contracts.mjs` exécute les règles et les routes Worker avec SQLite :
probabilité sur 10 000 points, stabilité du dossier, concurrence signer/déchirer,
progression normale obligatoire, effets propres au poste, dégâts réels 37,5/75,
fin au transfert, doubles requêtes de tir, réserves indépendantes du bombardier,
panne après cinq minutes, reconnexion, plein de dix secondes de plusieurs avions,
prix séparés, refus de pose/prix périmé et couverture cylindrique. Il exerce aussi
le vrai gestionnaire de déchirure (double action et erreur réseau), les meshes
peints, le remplacement et la libération des textures d’inscription.

La suite de régression conserve des dossiers ordinaires via une fixture explicite,
pour éviter une variation aléatoire de ses scénarios. La nouvelle suite couvre
séparément les annexes forcées et la probabilité réelle du module partagé.

Navigateur local : entrée en jeu, déchirure/remplacement d’un document normal,
signature suivante, annexe injectée dans la seule salle de test, déchirure de
celle-ci, conservation de la première signature, embarquement final, HUD à
300 s/1 000 balles avec ravitaillement, sortie et nouveaux articles du magasin.
Le navigateur fonctionne en rendu logiciel et refuse Pointer Lock ; la lisibilité
WebGL des plaques/couleurs, les commandes inversées en vol, le toucher physique,
l’écoute et la fluidité WAN ne sont pas validés par ce parcours.

Les tests de `test-aircraft-fire.mjs` retiennent volontairement les réponses HTTP
et vérifient l’apparition immédiate des tirs via le vrai point d’entrée client,
le regroupement, l’épuisement local, les réponses après changement de monde et
les reprises sur erreur. `test-logistics-contracts.mjs` vérifie les débits par lots,
les doublons concurrents et la validation des rapports. Ce sont des scénarios
réseau déterministes, pas une mesure de latence WAN ou de charge maximale.
Le modèle reste coopératif : positions et impacts sont déclarés par les clients.
Recharger tous les clients après publication pour utiliser le même protocole.

Les lits sont une installation supplémentaire, avec progression de prix indépendante
4 $, 6 $, 8 $… et contrat personnel de réapparition. Ils ne ravitaillent pas et
ne détectent pas d’ennemis. Voir [lits](field-update.md#départ-lits-et-contrats-personnels).

Les [prix prépayés, projectiles teintés et nettoyage](clean-flight.md) complètent ces règles.
Les compteurs de prix et la limite d’installations incluent désormais les commandes
payées non posées ; leurs tarifs ne sont pas débités une seconde fois à la pose.

La parabole tourne et sa couverture circulaire apparaît sur la carte ; ce balayage
ne ralentit pas la détection. Voir [retours multijoueurs](multiplayer-return.md).

## Réserves des véhicules d’appui

H2 et D2 partagent les stations et les garanties des bons et occupations. Le H2
compte 300 secondes de **vol**, y compris en stationnaire, plutôt qu’un temps
proportionnel au collectif. D2 : consommation proportionnelle à la conduite.
Stocks et cadences : [hélicoptère et DCA mobile](support-vehicles.md).
La DCA **fixe** reste illimitée ; la DCA mobile possède 100 obus.
Le catalogue courant comprend 600 variantes, avec quatre rôles supplémentaires.
