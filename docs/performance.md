# Performances

Mécanismes en place pour tenir des dizaines de joueurs et des milliers
d'ennemis dans un navigateur, et comment les mesurer. La réduction du volume
réseau (lots binaires de mouvements, roster compact, patchs, snapshot partagé,
positions distantes à 1 Hz) fait partie du protocole : voir
[serveur et transport](udp-server.md#transport-et-fiabilité).

## Choix d'architecture

- **Un état de salle commun.** Sans anti-triche ni information secrète
  ([confiance](trust-model.md)), le serveur construit un état identique pour
  tous ; seules les confirmations sont propres à chaque joueur.
- **Calculs délestés vers les clients.** Les trajectoires de nuée sont
  calculées par chaque navigateur depuis l'heure du serveur ; physique, tirs et
  armes lourdes sont simulés par leur propriétaire. Le serveur arbitre argent,
  sièges, achats et vagues.
- **Insectes au sol simulés par le serveur seul.** Leur simulation est à état
  (appâts, repas, rubans, dégâts aux barricades) et dépend du découpage du
  temps : la rejouer chez chaque client produirait des écarts.
- **Backend en JavaScript.** Les coûts mesurés sont algorithmiques ; les règles
  sont partagées entre client et serveur. Une passerelle WebTransport ou un
  relais TURN restent des pistes d'infrastructure, non décidées.

## Serveur

- **Contacts véhicule–ennemi.** `Game.contactFrames()` réutilise les positions de
  la nuée au plus `CONTACT_FRAME_MS` (50 ms) : un calcul de nuée à 20 Hz au plus
  par salle, alors que `advance()` s'exécute à chaque commande. Le segment
  parcouru par chaque véhicule reste balayé exactement à chaque appel. Le cache
  est invalidé par un changement de roster, de révision, de vague, d'ennemis au
  sol ou un recul de l'horloge.
- **Phase large conservatrice.** `sweptSphereMayTouch()` (`src/swept-broadphase.ts`)
  rejette une sphère qui ne touche pas la boîte du segment parcouru, élargie du
  rayon de la cible ; tout vrai contact passe le calcul exact (`segmentSphere`),
  dans le même ordre.
- **Mouvements dans une grande salle.** Chaque mouvement est encodé une fois
  pour toute la salle ; à partir de 40 pilotes, un mouvement sur deux est
  relayé, tous sont appliqués ([mouvements](udp-server.md#mouvements)).
- **Rejeu des réponses.** `GameSession` garde le texte JSON immuable de chaque
  réponse ; `encodeReplyText()` le découpe sans le réanalyser.

## Client : tirs et collisions

- **`InsectIndex`** (`src/insect-hits.ts`) : grille spatiale de 8 cm parcourue le
  long du segment de tir, construite au premier tir de l'image. Mêmes sphères
  conservatrices, intersections, tolérance du moucheron et ordre des impacts que
  le parcours exhaustif. Le parcours direct reste utilisé sous 128 insectes et
  pour les rayons très longs, populations concentrées ou modèles surdimensionnés.
- **Cibles solides** : `solidTarget` / `nearestSolidHit` préparent une fois par
  image, à la demande de `stepProjectiles`, les matrices, maillages solides et
  la boîte monde (agrandie de 30 % pour la pose animée) de chaque véhicule et
  pilote ; une boîte que le segment n'atteint pas évite tout test de triangle.
  `Raycaster` et vecteurs de travail sont partagés.
- **Pré-compilation** : `warmShaders` (`src/client.js`) dessine une fois chaque
  effet (traceurs instanciés, impacts, sang, flash, explosion) avant la fin de
  l'écran de chargement, pour éviter une compilation au premier tir.
- **Traceurs instanciés** : sur un rendu GPU, `TracerPool` (`src/tracers.ts`)
  garde les objets de calcul hors de la scène et recopie, une fois par image,
  les matrices du halo et du cœur dans deux lots par calibre (256 traceurs au
  plus). Le rendu logiciel garde des meshes ordinaires. Le tri des halos avec les
  autres surfaces transparentes n'est pas celui d'un tri objet par objet :
  `scripts/review-tracers.html` compare les deux images (servir la racine,
  par exemple `python -m http.server 8089`, puis ouvrir la page).

## Nuées

- `src/waves.ts` calcule la position des moucherons directement depuis
  identifiant, route et temps (`midgeDisplacement`), sans voisinage de groupe ;
  les autres espèces gardent la grille de voisinage.
- Les espèces sont dessinées en lots instanciés (`midge-batch.ts`,
  `flyer-batch.ts`, `walker-batch.ts`) avec des proxies logiques légers ; les
  collisions ne dépendent pas du rendu.

## Son des grandes nuées

`swarmAudioGroups()` (`src/game-audio/swarm.ts`) regroupe les insectes vivants
par cellule spatiale de 40 m de référence et retient au plus **5 sources HRTF**
selon la proximité et la densité. Le niveau croît de façon logarithmique et
plafonne ; les clés de cellule stables évitent qu'une mort isolée coupe les
autres sons, et une préférence pour les cellules déjà audibles limite les
changements de source. Le regroupement est recalculé 10 fois par seconde (et à
chaque changement de scène), en temps linéaire. Chaque source est une boucle
logique du [gestionnaire de voix](audio.md). Aucun message réseau n'est ajouté.

## Fluidité affichée

- **Horloge des ennemis** : `ServerClock` (`src/server-clock.ts`) garde sur 6 s
  l'échantillon au trajet le plus court et s'en rapproche d'au plus 5 % du temps
  écoulé : l'heure ne recule ni ne saute, sauf resynchronisation au-delà de
  500 ms d'écart.
- **Joueurs distants** : `MotionTrack` (`src/network.ts`) place chaque
  échantillon à l'heure de capture de l'émetteur (horloge lissée sur 10 s) ; le
  délai d'affichage s'adapte à l'intervalle et au retard des arrivées, entre 60
  et 350 ms. Contrepartie : les autres joueurs sont affichés un peu plus dans le
  passé, régulièrement.
- **Engin piloté** : la physique tourne à pas fixe de 1/120 s ;
  `src/render-interpolation.ts` affiche la pose entre les deux derniers pas
  (méthode « Fix Your Timestep ») ; physique, tirs et HUD relisent la pose du pas,
  une téléportation n'est pas interpolée.
- **Caméra de poursuite** : `followMoving` (`src/camera-follow.ts`) résout le
  suivi pour une cible qui avance : le retard reste `v/k` quelle que soit la
  durée de l'image.
- **Engins des autres** : `PoseSmoother` (`src/pose-smoother.ts`) affiche cible
  + erreur : un saut de source (flux réseau ou état serveur) est absorbé puis
  l'erreur décroît (τ = 0,2 s) sans recul. La rotation reste suivie par `slerp`.

## Mesurer

Les temps sont des temps CPU dépendant de la machine ; ils ne mesurent ni FPS,
ni GPU, ni WAN.

| Commande                                    | Mesure                                                                                                   |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `npm run bench:room-sync`                   | Réponse `sync` complète (commande, simulation, snapshot, encodage, découpage) pour N joueurs et E ennemis, horloge simulée à 4 `sync`/s. Arguments : `node scripts/benchmark-room-sync.mjs 50 900`. |
| `npm run bench:collisions`                  | `InsectIndex` contre parcours direct, populations dispersées ou concentrées.                             |
| `npm run bench:swarm-50`                    | 50 segments de véhicules contre 900 sphères, avec et sans phase large (CI).                              |
| `npm run bench:udp-replies`                 | Encodage des réponses de vagues réelles, premier envoi et rejeu.                                         |
| `npm run bench:tracers`                     | Objets de rendu, triangles et préparation des matrices des traceurs.                                     |
| `node scripts/benchmark-motion-rounds.mjs`  | Taille d'un mouvement binaire avec compteur de tirs et ricochets.                                         |
| `node scripts/review-return-performance.mjs` | Coût des rayons et traceurs, routes : réécrit `docs/return-performance.json` et `docs/routes-return.svg`. |

Ordre de grandeur (`bench:room-sync`, conteneur de développement) : à 50 joueurs
et 900 ennemis, environ 1 ms et 4 Ko par `sync` courant, 95 Ko pour le premier.

### Mesurer la capacité

- `npm run test:capacity` (`scripts/test-udp-capacity-50.mjs`) démarre un serveur
  local et connecte 50 pairs WebRTC/UDP natifs dans une salle : présence des 50
  pilotes, deux canaux ouverts, relais des mouvements et mémoire du processus.
  `UDP_MUX_PORT=44000 npm run test:capacity` refait l'essai sur un port unique.
  La CI exécute les deux.
- `scripts/test-motion-capacity.mjs` (dans `test:udp`) vérifie, à 2, 39, 40 et
  50 pilotes, que tous les mouvements sont appliqués et qu'un sur deux est
  relayé à partir de 40.
- `scripts/benchmark-snapshot-50.mjs` et `scripts/benchmark-motion-sync-50.mjs`
  comparent, à 50 joueurs, la construction des snapshots (avec `advance()`
  neutralisé) et `Game.sync()` à une version de référence chargée depuis Git
  (`scripts/baseline-game.mjs`, clone complet requis) ; la CI les exécute.

Ces mesures locales (`127.0.0.1`, pairs `node-datachannel`) ne prouvent ni les
FPS WebGL, ni le trafic WAN, ni la fluidité avec 50 navigateurs réels : une
validation de capacité demande une partie instrumentée (CPU, mémoire, délai des
commandes, débit, pertes, FPS client).

### Tests de non-régression

`test-insect-index.mjs` et `test-solid-targets.mjs` comparent les impacts au
parcours exhaustif ; `test-swept-broadphase.mjs` la phase large à
`segmentSphere` ; `test-contact-frames.mjs` le cache de contacts ;
`test-instanced-tracers.mjs` les traceurs ; `test-dense-swarms.mjs`,
`test-midge-batch.mjs` les nuées ; `test-audio.mjs` (10 000 individus) et
`test-game-audio.mjs` le son ; `test-server-clock.mjs`,
`test-motion-smoothing.mjs`, `test-render-interpolation.mjs`,
`test-camera-follow.mjs` et `test-pose-smoother.mjs` la fluidité simulée. Le
ressenti (pilote et mitrailleur d'un même bombardier, rafales dans une nuée)
reste à confirmer en partie.
