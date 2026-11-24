# Dossiers, réserves et livraisons

Règles partagées des documents à signer, des réserves de carburant et de munitions,
du radar et des colis. Le serveur Node les applique en RAM par commandes UDP fiables
([serveur UDP](udp-server.md)) ; tout disparaît au redémarrage. Les règles communes sont
dans `src/logistics.ts`, `src/aircraft-fire.ts`, `src/contracts.ts` et
`src/delivery.ts`.

## Signer

Les documents papier (dossiers d’accès, bon de commande, coupe-file, formulaires de
Saint Pierre) suivent les [règles d’interface](ui-guidelines.md#menus--des-documents-qui-sortent-du-monde) ;
`src/paper-form.ts` gère clauses et tampons.

- Un trait d’encre valide envoie le document au relâchement du pointeur
  (`pointerup`), jamais sur `pointercancel`, qui efface la signature.
- Pendant l’envoi, le document courant est verrouillé ; après une erreur, il peut être
  signé de nouveau. Le tampon s’affiche aussitôt dans une couche indépendante, sans
  bloquer le document suivant.
- Seul `signature: true` est transmis : ni l’encre ni les cases cochées ne quittent le
  navigateur. Ce n’est pas une vérification d’écriture.
- Le serveur vérifie l’ordre des documents (`form === paper + 1`), la proximité,
  l’occupation du poste et l’exclusivité du siège.

Nombre de documents : deux pour prendre un poste d’appareil (`vehicle-select` puis
`vehicle-sign`) ou une défense fixe (`equipment-select`, `equipment-sign`), trois chez
Saint Pierre ([file](purgatory-queue.md)). Un dossier ne contient que ses documents
obligatoires ; chaque poste tire avec la cadence et les dégâts de son arme. Échanger de
poste dans un appareil : voir [sièges](combat-worlds.md#échanges-de-poste).

## Plaques des occupants

Aucune couleur d’identité par joueur ou par appareil : les modèles gardent leurs
couleurs (`paintVehicle`, `src/vehicle-livery.ts`). Les noms des occupants sont des
plaques fixées aux deux flancs de la carrosserie, près de chaque poste ; elles suivent
l’appareil et ne font pas face à la caméra. Un changement d’équipage remplace leurs
textures ; un équipage identique les réutilise.

## Réserves des appareils

Les réserves appartiennent à l’appareil, pas au pilote : changer de siège, sortir, se
reconnecter ou changer de client simulant un appareil vide ne les remet pas à neuf.
Leur horodatage ne recule jamais et la mise à jour est conditionnée à la révision lue.

- **Carburant** : `FUEL_SECONDS`, 300 s à plein gaz ; consommation proportionnelle aux
  gaz, nulle moteur coupé ; un hélicoptère consomme une seconde par seconde de vol, rien
  posé. À zéro, seule la poussée cesse.
- **Munitions** (`fullAmmo`, `ammoCapacity`) :

| Appareil          | Réserves                                                    |
| ----------------- | ----------------------------------------------------------- |
| Chasseur biplan   | 500 balles (une toutes les 0,12 s)                          |
| Chasseur léger    | 1 000 balles (0,06 s)                                       |
| Bombardier biplan | mitrailleur dorsal 667 balles, 30 bombes ; pilote sans arme |
| Bombardier moyen  | trois mitrailleurs à 667 balles, 50 bombes                  |
| Stuka             | 1 000 balles, 6 bombes                                      |
| Spitfire          | 1 000 balles, six départs par salve                         |
| Char moyen        | MG 1 000 / 1 500 / 1 500, 30 obus HE, 30 obus AP            |
| Hélicoptère       | 30 roquettes, 10 missiles, 1 000 balles (copilote)          |
| Anti-air mobile   | 100 obus                                                    |
| Castor            | 500 balles ; Castor volant sans arme                        |

Cadences et équilibre des armes : [véhicules et banque](scale-fleet-weapons.md#armement)
et [véhicules d’appui](support-vehicles.md). Stocks des DCA fixes et recharge payante :
[économie](economy.md#service-payant). Le HUD montre les secondes de carburant à plein
gaz, les munitions du poste et l’indication de service.

## Tirs prédits

Les tirs d’armes légères sont simulés **immédiatement dans le navigateur** (son, traceur,
trajectoire) ; `AircraftFire` décompte localement et transmet les identifiants de tir
au serveur (`aircraft-fire`) :

- lots de 32 tirs au plus d’un même poste, regroupés pendant 50 ms, huit requêtes en
  vol au plus ; au-delà de 512 tirs non acquittés, la prédiction s’arrête ;
- le serveur débite chaque identifiant une seule fois ; les réserves révisées sont
  réconciliées avec les débits en attente, un ancien snapshot ne rembourse rien ;
- issue réseau inconnue : mêmes identifiants réessayés après 1 s ; refus définitif
  (4xx hors 429) : tirs abandonnés et prédiction bloquée pour cette occupation ;
- une réponse ne crée **jamais** de projectile ni ne touche l’appareil suivant du
  joueur ; les tirs locaux ne sont pas rembobinés (modèle coopératif).

## Radar

Sans radar, la carte garde repères, alliés et installations mais aucun ennemi. Un radar
révèle les ennemis aériens et terrestres dans un **cylindre vertical de 2 m de rayon**
(`inRadarCoverage`), sans occultation par le mobilier ; les couvertures se réunissent
sans doubler les contacts et un ennemi sorti disparaît aussitôt de la carte. La
parabole tourne et sa couverture apparaît sur la carte ; le balayage ne ralentit pas la
détection. La scène 3D n’est jamais masquée.

## Colis parachutés

Un bon signé depuis un véhicule devient un colis (`deliveryStart`). Sa hauteur dépend de
l’instant de largage et de sa hauteur initiale : serveur et client utilisent le même
calcul (`src/delivery.ts`, `DELIVERY_SPEED`), le client l’évalue entre les snapshots
jusqu’à la surface de réception publiée par le serveur. Seul le serveur supprime le colis
et crée l’équipement, une seule fois : la première surface portant toute l’emprise avec
la hauteur libre le reçoit, sans dégâts ; un contact latéral ne reçoit pas. Débit unique
quel que soit le poste signataire ; les paliers de prix comptent les colis en cours ; la
limite de 24 équipements ne concerne que la pose à pied. Vitesse de descente : voir
[gameplay](gameplay.md).

## Vérifier

- `scripts/test-logistics-contracts.mjs` : panne de carburant, plein, paliers de prix,
  couverture radar cylindrique, plaques d’occupants et libération de leurs textures.
- `scripts/test-aircraft-fire.mjs` : tir immédiat par le vrai point d’entrée client,
  regroupement, épuisement local, réponses tardives et reprises sur erreur.
- `scripts/test-vehicle-identity.mjs` : couleurs d’origine, pas d’identité colorée.
- `scripts/test-paper-feedback.mjs` : vrais gestionnaires de pointeur (souris, toucher,
  annulation, documents consécutifs), sélection après accusé, tampon unique.

Ce sont des scénarios réseau déterministes, pas une mesure de latence WAN.
