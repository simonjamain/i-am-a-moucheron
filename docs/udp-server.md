# Serveur Node : déploiement et transport

Un seul processus Node garde toutes les salles en RAM, sans base de données :
un redémarrage efface monnaie, joueurs, vagues et achats. Le gameplay passe par
WebRTC sur UDP, avec un secours TCP par WebSocket ; aucune action de jeu ne
passe en HTTP (`/api/*` répond 410). Livraison : l'image Docker `latest` publiée
à chaque commit sur `main` ([Docker](docker.md), [exploitation](operations.md)).
Qui simule quoi : [autorité et corps partagés](walking-network.md).

## Démarrage et variables

```sh
npm ci
npm start
```

Le processus sert le client et sa signalisation sur HTTP 3000. Mettre ce port
derrière un proxy HTTPS (nécessaire à WebRTC hors localhost) qui conserve
l'en-tête Host. Exposer **41000–41099/UDP directement** vers la VM : un proxy
HTTP comme Traefik ne transporte pas l'ICE/DTLS/SCTP. Une seule instance
possède les salles ; ne pas répartir la négociation entre plusieurs processus.

| Variable                | Défaut                 | Usage                                                                                 |
| ----------------------- | ---------------------- | ------------------------------------------------------------------------------------- |
| `HOST`                  | `0.0.0.0`              | Adresse d'écoute HTTP                                                                 |
| `PORT`                  | `3000`                 | Port HTTP, joint par le proxy HTTPS                                                   |
| `UDP_PORT_BEGIN`        | `41000`                | Premier port UDP ICE                                                                  |
| `UDP_PORT_END`          | `41099`                | Dernier port UDP ICE                                                                  |
| `UDP_MUX_PORT`          | vide                   | Port UDP unique partagé par toutes les connexions ; remplace la plage s'il est défini |
| `UDP_ADVERTISE_PORT`    | vide                   | Port UDP public annoncé si Docker ou un NAT change le numéro                          |
| `UDP_BIND_ADDRESS`      | découverte automatique | IP locale de l'interface UDP ; `127.0.0.1` pour les tests locaux                      |
| `UDP_ADVERTISE_ADDRESS` | vide                   | IP publique annoncée si la VM est derrière un NAT qui redirige les mêmes ports        |
| `STUN_SERVER`           | vide                   | Serveur STUN optionnel, par exemple `stun:stun.cloudflare.com:3478`                   |
| `TCP_FALLBACK`          | activé                 | `0` désactive la route WebSocket `/ws`                                                |
| `STATS_FILE`            | vide                   | Fichier de persistance des [statistiques](stats.md) (volume Docker)                   |
| `STATS_TOKEN`           | vide                   | Jeton exigé par `/stats` et `/stats.json` ; sans jeton, routes publiques              |

Exemple : `UDP_ADVERTISE_ADDRESS=203.0.113.10 PORT=3000 npm start`.

Sans IP publique joignable, configurer une redirection UDP conservant les ports
ou un STUN adapté ; aucun relais TURN n'est configuré. `GET /healthz` indique
`storage: ram`, `transport: webrtc-udp`, le nombre de salles et de connexions,
`tcpFallback` et `tcpConnections` : il vérifie le processus, pas l'ouverture du
pare-feu UDP. Le serveur accepte au plus 128 connexions (`maxConnections`) et
16 négociations simultanées.

### Port UDP unique (réseaux d'entreprise)

Beaucoup de réseaux d'entreprise ne laissent sortir l'UDP que sur quelques ports
(443 pour HTTP/3, 3478 pour STUN/TURN). Avec `UDP_MUX_PORT`, toutes les
connexions partagent un port (multiplexage ICE de libdatachannel) ; le serveur
reconnaît chaque joueur à son identifiant ICE puis à son adresse. Elles
partagent alors le tampon de réception d'une seule socket : en cas de pertes
sous forte charge, augmenter `net.core.rmem_max`/`rmem_default` de la VM.

Le port annoncé dans la réponse SDP doit être celui que joint le navigateur : si
Docker publie un autre numéro (`-p 443:41000/udp`), définir
`UDP_ADVERTISE_PORT=443`. Un reverse proxy qui sert HTTP/3 occupe déjà l'UDP 443
de son adresse : choisir 3478 ou désactiver HTTP/3. Diagnostic : le partage de
connexion 4G fonctionne, `h3` apparaît ou non dans la colonne Protocol des
DevTools, `tcpdump -ni any udp port PORT` montre si les paquets arrivent.

## Transport et fiabilité

Le navigateur utilise WebRTC natif, le serveur `node-datachannel`
(libdatachannel). La connexion est navigateur–serveur, jamais entre joueurs.
HTTP (`POST /rtc/offer`) n'échange que l'offre/réponse SDP ; ensuite deux canaux
SCTP/DTLS sur UDP (`src/udp-protocol.ts`) :

| Canal         | Livraison                        | Contenu                                                                         |
| ------------- | -------------------------------- | ------------------------------------------------------------------------------- |
| `motion-v2`   | non ordonné, zéro retransmission | mouvement du joueur (JSON montant), lots binaires partagés (descendant)         |
| `commands-v1` | fiable et ordonné                | entrée en salle, `sync`, signatures, achats, tirs, dégâts, changements de monde |

Le serveur désactive ICE/TCP et filtre les candidats TCP du SDP ; client et
serveur contrôlent la paire sélectionnée et ferment la connexion si elle n'est
pas UDP. L'identité vient de la connexion, jamais du champ `id` d'une requête.

### Mouvements

Le navigateur envoie son mouvement toutes les 50 ms (20 Hz) avec son heure de
capture `at`. Le serveur valide chaque mouvement (`validMotion`, incarnation,
occupation, siège), l'applique (`Game.sync`) puis l'encode une fois en binaire
(`encodeMotionState`, `src/motion-wire.ts`) : masque de présence sur un schéma de
champs, flottants 32 bits, quaternion en entiers 16 bits, UUID sur 16 octets,
complément JSON pour tout champ hors schéma. Toutes les 50 ms
(`MOTION_FLUSH_MS`, `server/index.js`), le dernier mouvement accepté de chaque
joueur part à **tous** les joueurs de la salle dans les mêmes paquets
(`encodeMotionBatch`, version `MOTION_BATCH_VERSION`), découpés sous
1 100 octets ; chaque entrée porte son âge dans le lot et l'heure de capture.
Chacun ignore sa propre entrée. Un destinataire dont la file dépasse 64 Ko saute
le lot. À partir de 40 pilotes dans la salle, seul un mouvement sur deux est
relayé (10 Hz vers les autres), mais tous sont appliqués
(`server/session.ts`). Un mouvement plus ancien que le dernier reçu est ignoré.
Changer le schéma du lot change sa version : une page ouverte sur l'ancienne
version doit être rechargée.

### Commandes fiables

Chaque commande a un identifiant croissant lié à sa connexion ; son résultat
confirme le traitement, avec un statut d'erreur éventuel. Une répétition renvoie
le résultat conservé ; après éviction du cache, les anciens identifiants sont
refusés et jamais réexécutés : pas de double exécution pendant la vie de la
session (pas après un redémarrage). Achats, tirs et impacts ont en plus leurs
identifiants métier. Une commande sans confirmation après 20 s ferme la
connexion, sans réessai automatique. Au-delà de 120 commandes/s, une commande
reçoit 429 sans être exécutée ni mise en cache ; le client garde la connexion et
réessaie au `sync` suivant (au-delà de 60 mouvements/s, les mouvements en trop
sont ignorés). Une commande malformée ou trop grosse (`MAX_COMMAND_BYTES`) ferme
la connexion.

Les réponses sont découpées en blocs de 12 000 caractères (4 Mio au plus) puis
réassemblées (`encodeReplyText`, `ReplyAssembler`). Le client envoie un `sync`
toutes les 100 ms à pied et 250 ms en engin.

### Contenu des réponses `sync`

Pour réduire le volume du canal fiable, chaque connexion garde une base de
synchronisation (`src/snapshot-wire.ts`) :

- **Roster** : la liste des insectes part entière, groupée par nuée, au premier
  état et à chaque changement de vague, d'équilibrage ou de révision ; un ajout
  d'apparitions à un roster inchangé part en tranche. Morts et dégâts n'envoient
  que les nouveaux indices et valeurs modifiées.
- **Patchs** : les autres champs d'un snapshot de salle (`join` et réponses
  portant `rosterRevision`) partent en `$patch` contre la réponse précédente de
  la connexion (valeur remplacée, clés retirées, longueur de liste) ; une liste
  de valeurs simples (`p`, `q`, `v`) est renvoyée entière dès qu'elle change.
  Les autres réponses (par exemple `aircraft-fire`) partent telles quelles. Une
  réponse rejouée ne modifie jamais la base.
- **Snapshot partagé** : en production (`SNAPSHOT_SHARE_MS`, 50 ms,
  `server/game.js`), les `sync` d'une salle réutilisent la partie « salle »
  construite au plus 50 ms plus tôt ; roster, dégâts reçus et heure restent
  propres à chaque réponse. Toute autre commande ou changement de clé de roster
  la reconstruit.
- **Positions distantes à 1 Hz** : position, vitesse et visée des autres joueurs
  (`pilots[].state`, leur véhicule, leur corps dans `base`) ne sont rafraîchies
  qu'une fois par seconde (`MOTION_REFRESH_MS`) ; elles circulent à 20 Hz sur
  `motion-v2` et ne servent qu'en secours si ce canal se tait. Les champs de jeu
  et toute discontinuité (vie, siège, mode, véhicule) partent tout de suite.
- **Insectes au sol** : `groundAgentsView` n'envoie que `p` (arrondi à 1e-6),
  `dir` (1e-4) et `arrived` ; le serveur garde l'état complet.

Les limites de file et de message ne déclenchent aucun autre transport. Pour
diagnostiquer une coupure, distinguer saturation ou erreur d'encodage,
expiration de commande, perte ICE et charge CPU du serveur.

### Reprise de session

Le serveur de production crée son `Game` avec `resumable: true`. Un pilote sans
message disparaît de la liste après 12 s (`PRESENCE_MS`) et garde corps, siège,
vie et papiers jusqu'à 30 s (`RESUME_MS`). L'état WebRTC `disconnected` est
souvent transitoire : le serveur attend `DISCONNECT_GRACE_MS` (10 s) avant de
fermer, le client abandonne après `RECONNECT_AFTER_MS` (5 s) ; `failed` et
`closed` ferment aussitôt. Le navigateur ouvre alors une connexion neuve et
envoie `join` avec `resume` et son `resumeKey`, pendant 25 s au plus
(`RECONNECT_WINDOW_MS`), sans recharger la page ; la physique locale continue.
Le serveur rattache la connexion au même pilote et ferme l'ancienne ; une clé
fausse ou un pilote expiré reçoit 410 et le jeu demande de recharger. À
`pagehide`, le navigateur envoie `leave`, qui libère aussitôt siège et pilote.
Les commandes en cours au moment de la coupure sont perdues.

## Secours TCP (WebSocket)

Le navigateur essaie toujours l'UDP d'abord. Si les canaux ne s'ouvrent pas en
5 s (`UDP_OPEN_MS`, `src/client.js`), il ouvre un WebSocket sur `/ws` (même
domaine, même proxy HTTPS) avec le même protocole : trames texte pour les
commandes et réponses, trames binaires pour les mouvements. Session, reprise,
limites et lots de mouvements sont les mêmes ; joueurs TCP et UDP partagent la
salle. Après un échec UDP, les reconnexions de la page vont directement en TCP.
Le HUD affiche « TCP (SECOURS) ». Sur TCP, un paquet perdu retarde tout ce qui
suit : le jeu est moins fluide sur un réseau qui perd des paquets.

## État en mémoire

`server/game.js` garde objets, `Map` et `Set` par salle ; ses opérations sont
synchrones, sans SQL, disque ni attente réseau. Le tick de `server/index.js`
avance chaque salle active toutes les 250 ms et ferme une connexion muette
depuis 15 s. Les salles inactives expirent après 30 minutes. Les engins détruits
sans occupant sont retirés après 15 s. Les registres d'impacts et de tirs sont
limités à 128 000 entrées : la limite refuse de nouveaux éléments (429) sans
oublier les doublons ; une partie exceptionnellement longue peut demander une
remise à zéro.

## Vérifier

```sh
npm run test:udp
npm test
```

`test:udp` regroupe `test-ram-game.mjs` (domaine en mémoire),
`test-motion-capacity.mjs`, `test-udp-client.mjs` (contrat navigateur, refus
TCP, absence de repli HTTP), `test-udp-native.mjs` (deux vrais pairs natifs :
paire UDP, réplication, confirmations idempotentes, reprise),
`test-udp-mux.mjs` et `test-tcp-fallback.mjs` (WebSocket réel, salle mixte,
reprise, refus d'origine). Codecs : `test-motion-wire.mjs`,
`test-snapshot-wire.mjs`, `test-snapshot-patch.mjs`, `test-roster-sync.mjs`,
`test-shared-snapshot.mjs`, `test-ground-view.mjs`, `test-udp-reply-encoding.mjs`,
`test-fire-reply.mjs` ; reprise du domaine : `test-resume.mjs`. Scénarios
Chromium (`npm run e2e`, aussi en CI) : `e2e:resume`, `e2e:motion`, `e2e:tcp` ;
dans un conteneur dont l'interface n'est pas `127.0.0.1`, passer son adresse
(`node scripts/e2e-browser-resume.mjs 192.0.2.2`). Capacité :
[performances](performance.md#mesurer-la-capacité).

Ces essais locaux ne mesurent ni la latence Internet, ni les NAT mobiles, ni la
charge maximale de la VM : après installation, jouer à deux navigateurs sur des
réseaux distincts et vérifier « UDP » dans les deux interfaces.

Références : [RFC 8831](https://www.rfc-editor.org/rfc/rfc8831),
[API node-datachannel](https://github.com/murat-dogan/node-datachannel/blob/master/API.md),
[`RTCDataChannelInit`](https://www.w3.org/TR/webrtc/#dom-rtcdatachannelinit).
