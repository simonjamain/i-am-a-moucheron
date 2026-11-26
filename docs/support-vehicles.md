# Hélicoptère H2 et DCA mobile D2

Référence de l'hélicoptère d'attaque au sol (`helicopter`, H2) et de l'anti-air mobile
(`flaktruck`, D2) : commandes, armes et fusée de proximité. Règles communes de la
flotte (achat, postes, destruction, ravitaillement) : [flotte](scale-fleet-weapons.md) ;
projectiles : [projectiles](projectiles.md) ; modèles : [catalogue des modèles](models.md#véhicules) ;
physique : [vol des hélicoptères](heli-physics.md) et
[camion DCA sur Rapier](physics-engine.md).

| Véhicule | Prix | Postes             |  Coque | Vitesse max (m/s de référence) | Carburant               |
| -------- | ---: | ------------------ | -----: | -----------------------------: | ----------------------- |
| H2       | 50 $ | pilote, copilote   | 200 PV |                             42 | 300 s en vol            |
| D2       | 15 $ | conducteur, tireur | 100 PV |                             66 | 300 s à pleine commande |

Les deux s'achètent avec un bon signé et se posent sur un support libre ; ils n'ont pas
de réserve gratuite et leur destruction est définitive. Le carburant du H2 ne s'use
qu'en vol, quelle que soit la poussée demandée (`burnFuel`, `src/logistics.ts`).

## H2 : pilotage

Le pilote commande une assiette et une vitesse verticale ; le modèle est un pilotage
assisté de jeu sur un corps Rapier (`src/heli-physics.ts`), pas une simulation de rotor.

| Touches              | Commande                           |
| -------------------- | ---------------------------------- |
| Maj gauche ou droite | Monter (8 m/s de référence)        |
| Ctrl gauche ou droit | Descendre (jusqu'à 30 m/s)         |
| Z ou flèche Haut     | Piquer                             |
| S ou flèche Bas      | Cabrer                             |
| Q ou flèche Gauche   | Roulis à gauche                    |
| D ou flèche Droite   | Roulis à droite                    |
| Souris               | Cap et assiette visés              |
| C maintenu           | Regard libre, roquettes suspendues |
| Clic maintenu        | Roquettes                          |

- Tangage et roulis partagent un budget de 45° (`HELI.maxTilt`), y compris en
  diagonale. Une touche de tangage ou de roulis prend la priorité sur la souris pour son
  axe pendant l'appui ; la souris garde l'axe non forcé. Les touches opposées se
  neutralisent, les alias ne se cumulent pas.
- Au relâchement de Maj/Ctrl, le collectif revient au neutre : l'assistance tient le
  stationnaire et freine progressivement. `heliCollective` (`src/client.js`) garde
  l'état du pilote local entre les réponses réseau et part dans le mouvement.
- Menu, perte de focus ou pointeur non capturé neutralisent toutes les commandes.
- Sans carburant ou sans pilote, il ne reste que la gravité ; un choc à plus de 8 m/s
  détruit la coque (`HELI_CRASH_IMPACT`, détail dans [vol des hélicoptères](heli-physics.md)).

## H2 : armes

| Poste / arme       | Stock | Cadence                  | Projectile                       |
| ------------------ | ----: | ------------------------ | -------------------------------- |
| Pilote, roquettes  |    30 | 0,3 s                    | `rocket` : 120 → 30, rayon 12 m  |
| Copilote, MG       | 1 000 | 15 balles/s              | `mg` : 75                        |
| Copilote, missiles |    10 | un seul en vol à la fois | `missile` : 360 → 70, rayon 30 m |

- **Roquettes.** Elles partent dans l'axe avant de l'hélicoptère (−Z local transformé
  par son quaternion), alternativement des lanceurs gauche et droit, avec la vitesse de
  l'appareil ajoutée ; la caméra ne les dirige pas.
- **Copilote.** Vue première personne à la tourelle sous le nez, MG visible. Rotation
  horizontale complète, de −83° à 0° en vertical (`HELI.minPitch`, `HELI.maxPitch`). La
  tourelle tourne au plus à π rad/s, budget commun au lacet et au tangage
  (`stepHeliAim`) : chaque mise à jour consomme le déplacement de souris reçu et
  abandonne l'excédent, sans cible à rattraper ; une souris immobile arrête la tourelle.
  Caméra, MG et guidage suivent la direction réelle de la tourelle. Le clic tire la MG,
  Espace lance le missile ; un second appui distinct sur Espace le fait exploser. MG et
  missile s'utilisent en même temps : le serveur accepte les tirs de la MG pendant le vol
  du missile.
- **Missile.** Il vise le point regardé par le copilote, à 1,2 rad/s au plus, sans
  acquisition de cible. Fin sans explosion après sa durée de vie ; détruit sans dégâts
  avec la coque. Sortie, transfert, mort ou déconnexion du copilote rompt le guidage et
  la détonation ; revenir au poste ne le récupère pas.
- Le pilote n'a aucune arme du copilote. Les éclairs de bouche suivent les ancres
  physiques des lanceurs et du canon (`src/vehicle-anchors.ts`).

## DCA mobile D2

Le conducteur conduit sans arme ; le tireur sert un canon unique, utilisable en
roulant. Tracteur 6×4 et remorque sont deux corps Rapier attelés
(`src/truck-physics.ts`) ; le jeu accepte un angle de remorque borné par
`TRAILER_LIMITS` (`src/fleet.ts`). Azimut libre, élévation de +5° à +90° par rapport au
châssis (`flakPitchAllowed`).

**Obus** (`proximity`) : 100 obus, 560 m/s de référence plus la vitesse du camion,
un départ toutes les 0,8 s, durée de vie 9 s. Souffle de 30 m de référence, 80 au centre
et 20 au bord, occulté par le décor, alliés compris.

**Fusée** (`MOBILE_FUSE`, `src/mobile-flak.ts`) : la molette du tireur règle la
distance de détection, de 0,5 à 20 m de référence par pas de 0,5 (5 m au départ),
affichée en distance réelle du bureau (1,5 mm à 6 cm). Le réglage est copié au départ de
chaque obus ; la molette ne change ni les gaz ni le zoom.

- La fusée s'arme à 0,3 s. Avant, tout contact est inerte ; le camion tireur est ignoré
  pour laisser sortir l'obus.
- Armé, l'obus qui entre dans la distance de détection d'un objet physique (sol,
  mobilier sur ses triangles, installations, ennemis, joueurs, véhicules, camion tireur
  compris) attend que la distance recommence à augmenter : l'explosion part au passage
  au plus près. Un contact direct après armement explose aussitôt.
- Sans déclenchement, l'obus expire sans explosion.
- La détection et le souffle sont indépendants : un grand réglage peut déclencher loin
  de la cible sans la blesser.
- Le balayage se fait par segment depuis l'instant d'armement : boîtes du décor à coins
  arrondis, enveloppes orientées des coques (articulées pour le camion), sphères pour
  personnages et insectes, avec mouvement relatif des insectes pendant le pas.

Le Flak lourd fixe utilise la même fusée de proximité
([DCA fixes](scale-fleet-weapons.md#dca-fixes)).

## Vérifier

- `npm test -- support-vehicles` : caractéristiques, contrats, réserves et recharge,
  stationnaire, freinage, panne, guidage, roquettes alternées, exclusivité, cadences,
  armement à 0,299/0,300/0,301 s, mur fin, rayon, camion tireur, explosion unique,
  expiration, perte de coque et remise à zéro.
- `npm test -- heli-controls` : vraie branche `physics()` du client, collectif, menus et
  focus, direction des roquettes sous plusieurs attitudes.
- `npm test -- heli-handling` : inclinaison, descente, freinage, tourelle 360° et
  vitesse bornée à 30/60/144 Hz, arrêt et inversion après grande impulsion.
- `npm test -- heli-physics`, `npm test -- truck-physics` : corps Rapier.

Le ressenti du pilotage à deux et le rendu WebGL restent à juger en partie réelle.
