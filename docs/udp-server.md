# Serveur Node : RAM et UDP obligatoire

Décision validée le 29 octobre 2026 : aucune base de données et aucun repli
WebSocket/TCP pour les joueurs incompatibles. Une [image Docker](docker.md)
est désormais disponible pour déployer ce runtime sur VM.

## Démarrage sur une VM

Installer Node 22.13+ et les dépendances depuis le dépôt :

```sh
npm ci
npm start
```

Le processus sert le client et sa signalisation sur HTTP 3000. Mettre ce port
derrière un proxy HTTPS (nécessaire à WebRTC hors localhost), en conservant
l'en-tête Host original. Exposer **41000–41099/UDP directement** vers la VM.
Un proxy HTTP comme Traefik ne transporte pas les paquets ICE/DTLS/SCTP de jeu.
Une seule instance Node possède les salles ; ne pas répartir les requêtes de
négociation entre plusieurs processus qui auraient des mémoires distinctes.

| Variable                | Valeur par défaut      | Usage                                                                                |
| ----------------------- | ---------------------- | ------------------------------------------------------------------------------------ |
| `HOST`                  | `0.0.0.0`              | Adresse d'écoute HTTP                                                                |
| `PORT`                  | `3000`                 | Port HTTP, accessible par le proxy HTTPS                                             |
| `UDP_PORT_BEGIN`        | `41000`                | Premier port UDP ICE                                                                 |
| `UDP_PORT_END`          | `41099`                | Dernier port UDP ICE                                                                 |
| `UDP_BIND_ADDRESS`      | découverte automatique | IP locale de l'interface UDP ; `127.0.0.1` pour tests locaux                         |
| `UDP_ADVERTISE_ADDRESS` | vide                   | IP publique à annoncer si la VM est derrière un NAT avec redirection des mêmes ports |
| `STUN_SERVER`           | vide                   | Serveur STUN optionnel, par exemple `stun:stun.cloudflare.com:3478`                  |

Exemple, en remplaçant l'adresse documentaire par l'IP réelle de la VM :

```sh
UDP_ADVERTISE_ADDRESS=203.0.113.10 PORT=3000 npm start
```

Sans IP publique directement joignable, configurer une redirection UDP conservant
les ports ou un STUN adapté. Aucun relais TURN/TCP n'est configuré. L'échec UDP
refuse la connexion et affiche une erreur ; aucune action ne part alors en HTTP.
`GET /healthz` indique `storage: ram` et `transport: webrtc-udp` ; cela vérifie le
processus, pas l'ouverture du pare-feu UDP. L'indication « UDP » en jeu nécessite
les statistiques ICE du navigateur et la vérification du serveur.

## Transport et fiabilité

Le navigateur utilise WebRTC natif, le serveur `node-datachannel` (libdatachannel).
La connexion est navigateur–serveur ; les joueurs ne se connectent pas entre eux.
HTTP échange uniquement l'offre/réponse SDP, puis le gameplay utilise deux canaux
SCTP/DTLS sur UDP :

| Canal         | Livraison                        | Contenu                                                                                         |
| ------------- | -------------------------------- | ----------------------------------------------------------------------------------------------- |
| `motion-v2`   | non ordonné, zéro retransmission | positions, orientation et visée à 20 Hz                                                         |
| `commands-v1` | fiable et ordonné                | entrée en salle, synchronisations, signatures, achats, dégâts, réserves et changements de monde |

Le serveur désactive ICE/TCP et filtre les candidats TCP du SDP. Client et serveur
contrôlent le protocole de la paire sélectionnée. En cas de changement vers un
transport non confirmé UDP, la connexion est fermée.

Chaque commande a un identifiant croissant lié à sa connexion DTLS. Son résultat
confirme le traitement métier, avec son statut d'erreur éventuel. Une répétition
renvoie le résultat conservé ; après éviction du cache, les anciens identifiants
sont refusés et ne sont jamais exécutés à nouveau. Cela garantit l'absence de
double exécution pendant la vie de la session, pas après redémarrage du serveur.
Achats, tirs et impacts ont également leurs identifiants métier. Une commande
sans confirmation ferme la connexion après 20 s : son résultat peut être incertain,
il n'y a pas de réessai automatique sur une nouvelle session.

Les réponses volumineuses sont découpées puis réassemblées. Les files, messages,
cadences et caches sont bornés ; la saturation ne déclenche aucun autre transport.
Les paquets de mouvement dépassés sont ignorés ; incarnation, poste et génération
d'occupation protègent contre une position ancienne reçue après un transfert.
Le navigateur simule toujours sa physique et prédit ses tirs immédiatement.
Le modèle reste coopératif, sans validation anti-triche des positions/impacts.

## État et exploitation

`server/game.js` garde des objets, Map et Set par salle. Ses opérations sont
synchrones : aucun accès SQL, disque ou attente réseau dans une transaction de
jeu. L'identité vient de la connexion, pas du champ `id` d'une requête du joueur.
Les corps restent sous autorité client ; les règles, sièges et réserves sont
sous autorité du serveur. Le tick de maintenance est de 250 ms par salle.

Un redémarrage efface tout : monnaie, joueurs, vagues et achats. Les connexions
doivent être recréées. Les salles inactives expirent après 30 minutes ; les
joueurs expirent après 12 secondes sans activité. Les corps détruits sans occupant
sont retirés après 15 secondes et les âmes libérées sont supprimées. Au maximum
24 PNJ matérialisés sont inclus dans les snapshots, en plus des joueurs.
Les identifiants d'impacts et de tirs ont une limite de 128 000 par registre :
la limite atteinte refuse de nouveaux éléments, sans oublier les doublons.
Une partie exceptionnellement longue peut nécessiter une remise à zéro.

Le Site public reste sur le Worker/D1 historique jusqu'à installation de ce
runtime sur une VM. Aucun domaine ni serveur externe n'a été configuré ici.
L'assemblage produit séparément `worker/assets.js`, importé par Node, et
`worker/index.js`, Worker de compatibilité. Le runtime Node n'importe pas le
Worker, `node:sqlite`, ni `scripts/local-db.mjs`. `npm run dev:sites` est réservé
à la reproduction du backend historique. Les deux runtimes ne partagent pas
les salles. Les migrations D1 existantes ne sont pas modifiées.

## Vérifications

```sh
npm run test:udp
npm test
```

`test-ram-game.mjs` vérifie le domaine en mémoire et les transitions de jeu.
`test-udp-client.mjs` vérifie le contrat navigateur avec un pair simulé, y compris
refus TCP, fermeture et absence de repli HTTP. `test-udp-native.mjs` connecte
deux vrais pairs natifs au serveur HTTP/UDP local, contrôle la paire UDP,
la réplication et les confirmations idempotentes. Les tests Worker/D1 continuent
à couvrir la compatibilité historique, sans être nécessaires au serveur Node.

La réussite locale ne mesure pas la latence Internet, les NAT mobiles ni la
charge maximale de la VM. Après installation, faire un essai à deux navigateurs
sur des réseaux distincts et vérifier « UDP » dans les deux interfaces.
Le navigateur de prévisualisation a chargé le client Node puis affiché
« UDP indisponible sur ce réseau. Aucun transport de secours. » : ce parcours
vérifie le refus, sans valider une partie navigateur sur Internet.

Références : [WebRTC Data Channels, RFC 8831](https://www.rfc-editor.org/rfc/rfc8831),
[API node-datachannel](https://github.com/murat-dogan/node-datachannel/blob/master/API.md),
[configuration des canaux navigateur](https://www.w3.org/TR/webrtc/#dom-rtcdatachannelinit).
