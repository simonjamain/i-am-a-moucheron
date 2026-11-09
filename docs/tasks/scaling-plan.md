# Montée en charge — beaucoup de joueurs et d'ennemis

- Tâche / PR : branche `claude/focused-ritchie-r0te2v`, PR de la phase 0.
- Résultat attendu : parties fluides et sans coupure UDP avec des dizaines de
  joueurs et des milliers d'ennemis, toujours jouables dans un navigateur.
- Mesures de référence : `npm run bench:room-sync` (CPU serveur et taille des
  réponses `sync`) et `npm run test:capacity` (50 pairs UDP natifs locaux).

## Diagnostic (version 246)

Mesuré avec `scripts/benchmark-room-sync.mjs`, sans navigateur ni WAN :
à 50 joueurs et 900 ennemis, une réponse `sync` coûtait 5 à 15 ms de CPU et
~72 Ko. À 4 sync/s par joueur, cela dépasse un cœur : la boucle Node prend du
retard, la file fiable grossit et les règles « file pleine », « 20 s sans
confirmation » et « ICE `disconnected` » ferment la connexion.

Causes identifiées :

1. `advance()` s'exécute à chaque commande, deux fois par `sync` (`command()`
   puis `snapshot()`), et `vehicleContacts()` y recalculait toute la nuée.
   `benchmark-snapshot-50` neutralise `advance()` et ne voyait pas ce coût.
2. Chaque joueur reçoit un snapshot construit pour lui, sérialisé en JSON :
   coût joueurs × taille de la salle. `pilots`, `base` et `groundAgents`
   (~70 Ko à 50 joueurs) sont renvoyés entiers à chaque `sync`.
3. Le canal fiable **ordonné** transporte ces gros snapshots : une perte bloque
   les petites commandes importantes (blocage en tête de file de SCTP).
4. Coupures fatales trop rapides : ICE `disconnected` (souvent transitoire),
   dépassement du débit de commandes, aucune reprise de session.
5. Client : buffer de profondeur logarithmique, ombres PCF 2048², seuls
   moucherons et araignées instanciés, `swarmFrame()` complet à chaque image,
   allocations par image, interpolation sur l'heure de réception.

## Arbitrage des pistes

| Piste                                        | Décision          | Raison                                                                                                                 |
| -------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Pas d'anti-triche, pas d'information secrète | Retenue           | Permet **un seul état de salle par tick**, identique pour tous ; seules les confirmations restent par joueur.          |
| Délester les calculs vers les clients        | Retenue, encadrée | Simulations déterministes calculées par chaque client ; le serveur arbitre argent, sièges, achats, vagues. Pas d'hôte. |
| Backend compilé (Go, Rust)                   | Reportée          | Le coût mesuré est algorithmique (×5 à ×10 déjà gagné en JS). Règles partagées client/serveur à préserver.             |
| Messages fiables sans TCP                    | Déjà le cas       | SCTP/DTLS/UDP. Le problème est l'ordre et le volume : l'état passe en non fiable avec bases confirmées.                |
| WebTransport (QUIC)                          | Plus tard         | Flux indépendants et datagrammes ; serveurs plus mûrs en Go/Rust : candidat pour une passerelle de transport.          |
| Relais TURN UDP                              | À décider         | Ouvre les réseaux sans UDP direct ; décision d'infrastructure.                                                         |

## Plan d'attaque

**Phase 0 — mesurer et arrêter l'hémorragie (cette PR, version 247).**
Banc `bench:room-sync`. Positions ennemies des contacts véhicules réutilisées
au plus 50 ms (`contactFrames()`). Délai de grâce de 10 s sur ICE
`disconnected` (client et serveur). Rafale de commandes refusée en 429 au lieu
de fermer la session. Résultat : ~2 ms par `sync` à 50 joueurs / 900 ennemis.

**Phase 1 — état partagé par tick.** Simulation (`advance()`) uniquement dans le
tick de salle ; un état commun construit et sérialisé une fois par tick, avec
des révisions par bloc (`base`, `bank`, `vehicles`, `pilots`, ennemis au sol)
pour n'envoyer que les blocs modifiés. La réponse `sync` se réduit à la
confirmation et à la partie personnelle. Critère : coût serveur quasi constant
par joueur ajouté ; `sync` courant < 5 Ko.

**Phase 2 — état sur le canal non fiable.** Différences par rapport à quelques
bases communes confirmées (modèle Quake 3) ; événements importants en canal
fiable non ordonné, ou répétés jusqu'à accusé ; jeton de reprise de session
sans rechargement. Critère : aucune fermeture sous 5 % de pertes simulées.

**Phase 3 — format binaire et relais groupé.** Positions quantifiées, un paquet
de mouvements par destinataire et par tick, horodatage serveur pour
l'interpolation. Critère : débit descendant par joueur divisé par 5 à 50 joueurs.

**Phase 4 — rendu client.** Profiler une vraie partie (`renderer.info`,
Performance). Instancier toutes les espèces, positions des moucherons en
shader, retirer le buffer logarithmique, résolution adaptative, ombres
limitées, suppression des allocations par image. Critère : FPS mesurés
avant/après sur une scène de référence.

**Phase 5 — transport.** Selon les mesures des phases 1 à 3 : passerelle
WebTransport (Go ou Rust) et/ou TURN UDP ; règles conservées en JS.

## État réel

- Phase 0 : fusionnée (version 247).
- Phase 1 : terminée.
  - Version 248 : réponses `sync` en patchs structurels par connexion.
  - Version 249 : snapshot de salle partagé 50 ms entre les `sync` ; position
    des autres joueurs à 1 Hz dans les réponses fiables.
  - 50 joueurs / 900 ennemis, banc à horloge réaliste : ~1,8 ms et ~9 Ko par
    `sync` (v246 : 5–15 ms et ~72 Ko).
- Phase 2, premier lot (version 250) : reprise automatique de session après
  une coupure (même pilote, siège et vie, 30 s), détection immédiate des canaux
  fermés, `leave` à la fermeture de la page. Vérifié avec un vrai Chromium
  contre le serveur local (`npm run e2e:resume`) ; pas sur WAN.
- Reste identifié : `groundAgents` (insectes au sol simulés par le serveur)
  domine le volume restant des réponses. Leur simulation est à état (appâts,
  repas, rubans, dégâts aux barricades) et dépend du découpage du temps : la
  rejouer chez chaque client serait fragile. Pistes : précision réduite des
  positions, puis transport sur le canal non fiable.
- Essais WAN et parties réelles : non effectués.
- Prochaine action : phase 2, état de salle sur le canal non fiable avec bases
  confirmées, en commençant par les positions `groundAgents`.
