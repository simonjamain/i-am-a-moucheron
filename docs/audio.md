# Audio : gestionnaire de voix

Le son du jeu passe par une bibliothèque de voix virtualisées sur la Web Audio
API (`src/audio/`) et par son adaptateur propre au jeu (`src/game-audio/`). Le
jeu demande autant de sons qu'il veut ; seules les voix au meilleur score sont
réellement jouées, les autres boucles restent virtuelles et presque gratuites.
Tout reste côté client : le serveur n'en sait rien et aucun message réseau
n'est ajouté.

## Bibliothèque `src/audio/`

Conçue pour devenir une bibliothèque indépendante : elle n'importe que ses
propres fichiers et des types Three.js (`scripts/test-audio-boundary.mjs`).

| Fichier        | Rôle                                                                        |
| -------------- | --------------------------------------------------------------------------- |
| `types.ts`     | Contrats publics : `SoundDef`, `SoundOutput`, `PlayOptions`, `AudioManager` |
| `scheduler.ts` | Choix pur des voix réelles, testable sans Web Audio                         |
| `voice.ts`     | Nœuds d'une voix : démarrage, reprise de boucle, fondus, libération         |
| `spatial.ts`   | Panner, listener, lecture des positions sans Three.js à l'exécution         |
| `clock.ts`     | Minuteries injectables : tick `setInterval`, image `requestAnimationFrame`  |
| `manager.ts`   | `createAudioManager` : sons logiques, cycle de vie du contexte, `stats()`   |
| `helpers.ts`   | Fabriques d'exemple `fromBuffer` et `fromUrl`                               |
| `index.ts`     | Exports publics                                                             |

Contrat :

- `play(nom, { score, position?, spatial?, volume?, distance?, params?, onEnded? })`
  renvoie une fonction `Stop(fadeMs?)` idempotente. `score()` est rappelé à chaque
  tick ; un score `<= minScore` (0) n'est jamais joué.
- Les `maxVoices` meilleurs scores ont une voix ; à égalité, la voix déjà jouée
  garde sa place, puis le son le plus ancien. Les voix en fondu (`fadeMs`, 50 ms)
  s'ajoutent brièvement à ce plafond pour qu'un vol de voix reste immédiat.
- Un son ponctuel sans place est jeté ; une boucle devient virtuelle, avance dans
  le temps et reprend au bon offset avec un fondu d'entrée.
- `position` : un point est copié à l'appel, un `Object3D` suivi par sa matrice
  monde (dernière position gardée s'il quitte la scène), une fonction relue à
  chaque image. Spatialisation `"simple"` (equalpower) par défaut, `"hrtf"` sur
  demande, sans quota. Positions, listener et `update(params)` sont appliqués à
  chaque image ; la planification tourne à `tickMs` (100 ms) et juste après un `play`.
- Le contexte est créé par `resume()` (geste utilisateur). Contexte suspendu :
  les nouveaux sons ponctuels sont jetés. `close()` libère le contexte et garde les
  boucles virtuelles jusqu'au prochain `resume()`. `setVolume`, `setMuted`,
  `stopAll`, `stats()` et `dispose()` complètent le cycle de vie.

## Adaptateur du jeu `src/game-audio/`

- `synth.ts` : les sons synthétisés (aucun fichier audio) et leurs niveaux.
- `catalog.ts` : catalogue ; boucles `ambience`, `engine`, `dive`, `insect`, `gatling`, `airflow`
  (frottement d'air du décrochage : [rubans d'air](air-ribbons.md)) pilotées par
  `{ rate, level }` ; la boucle `gatling` dure 1 s, douze impulsions sans couture
  ([la Gatling](gatling-turret.md#son-continu)).
- `scores.ts` : score = priorité du son × niveau × atténuation inverse
  (`ref`, roll-off 1,3, distance max 200 ou 55 au purgatoire). Les sons d'interface
  (récompense, compte à rebours) passent avant le combat, l'ambiance en dernier.
- `game-sound.ts` : `GameSound`, façade appelée par `client.js` : `play`,
  `loop` puis `keep` à chaque image, `followOnce`/`moveFollowing`/`endFollowing`
  pour les corps qui tombent. 48 voix réelles au total (`MAX_VOICES`), tous types
  confondus. Les sons spatialisés du jeu sont rendus en HRTF ; le moteur du joueur a
  une priorité doublée.
- `swarm.ts` : regroupement des nuées en 5 émetteurs ([performances](performance.md#son-des-grandes-nuées)).

## Vérifications

`npm test -- audio` lance `test-audio` (synthèse, nuées), `test-audio-library`
(contrat sur un faux contexte, dont 500 sons logiques), `test-audio-boundary` et
`test-game-audio` (catalogue, scores, saturation, boucles, suiveurs, cycle de vie).
`scripts/audio-library-types.ts` vérifie les erreurs de typage attendues via
`npm run typecheck`. Ces tests ne valident ni l'écoute en partie, ni le confort
des fondus, ni le coût HRTF sur une machine modeste.

## Bourdonnements et arrivées

Au bureau, les nuées sont regroupées par `swarmAudioGroups` (`swarm.ts`) en cinq
boucles `insect` au plus (cellules de 40 m, portée 1 500 m, distance de référence 20),
recalculées à 10 Hz ; les régions déjà jouées sont préférées pour éviter les sauts.
Une nouvelle arrivée d'ennemis dans la vague donne un `tick` bref placé à l'auditeur
(clé par vague, jamais rejoué). Niveaux à confirmer à l'écoute.
