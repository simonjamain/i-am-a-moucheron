# Audio : gestionnaire de voix

Le son du jeu passe par une bibliothèque de voix virtualisées sur la Web Audio
API (`src/audio/`) et par son adaptateur propre au jeu (`src/game-audio/`). Le
jeu demande autant de sons qu'il veut ; seules les voix au meilleur score sont
réellement jouées, les autres boucles restent virtuelles et presque gratuites.
Tout reste côté client : le serveur n'en sait rien et aucun message réseau
n'est ajouté. La spécification de travail et les décisions sont dans le document
partagé « Gestionnaire de voix audio — synthèse et spécification ».

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

- `synth.ts` : les 27 sons synthétisés (aucun fichier audio) et leurs niveaux.
- `catalog.ts` : catalogue ; boucles `ambience`, `engine`, `dive`, `insect`
  pilotées par `{ rate, level }`.
- `scores.ts` : score = priorité du son × niveau × atténuation inverse
  (`ref`, roll-off 1,3, distance max 200 ou 55 au purgatoire). Les sons d'interface
  (récompense, compte à rebours) passent avant le combat, l'ambiance en dernier.
- `game-sound.ts` : `GameSound`, façade appelée par `client.js` : `play`,
  `loop` puis `keep` à chaque image, `followOnce`/`moveFollowing`/`endFollowing`
  pour les corps qui tombent. 48 voix réelles au total (avant : 24 ponctuels,
  20 boucles et 16 suiveurs en plafonds séparés). Tous les sons spatialisés gardent
  le rendu HRTF d'avant ; le moteur du joueur a une priorité doublée.
- `swarm.ts` : regroupement des nuées en 5 émetteurs ([performances](performance.md#son-des-grandes-nuées)).

## Vérifications

`npm test -- audio` lance `test-audio` (synthèse, nuées), `test-audio-library`
(contrat sur un faux contexte, dont 500 sons logiques), `test-audio-boundary` et
`test-game-audio` (catalogue, scores, saturation, boucles, suiveurs, cycle de vie).
`scripts/audio-library-types.ts` vérifie les erreurs de typage attendues via
`npm run typecheck`. Ces tests ne valident ni l'écoute en partie, ni le confort
des fondus, ni le coût HRTF sur une machine modeste.

## Bourdonnements et arrivées

Six sources de bourdonnement au plus (niveau 0,12, distance de référence 20 unités
acteur), chacune réduite par la racine du nombre de sources. Une nouvelle arrivée
d'ennemis (comparaison des identifiants entre deux snapshots, sans rejouer le
premier) donne un signal bref placé à l'auditeur. Valeurs à confirmer à l'écoute.
