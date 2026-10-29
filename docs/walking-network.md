# Transport actuel et corps partagés

Le serveur Node est en RAM et reçoit tous les événements de jeu par WebRTC/UDP.
Le canal `motion-v2` est sans retransmission, non ordonné, à 20 Hz ; le canal
`commands-v1` est fiable et ordonné. Le serveur relaie les mouvements, sans
maillage entre navigateurs. Les commandes portent un identifiant croissant et
reçoivent leur résultat d'exécution. Identité de session, incarnation et numéro
d'occupation empêchent une ancienne position de modifier un nouveau corps ou
un nouveau poste. Aucun repli HTTP, TCP ou WebSocket ne transporte du gameplay.
Voir [déploiement et garanties UDP](udp-server.md).

Le navigateur reste propriétaire de sa physique, les autres corps sont des
proxies interpolés. Le serveur conserve en mémoire les règles, PV, contrats,
sièges et stocks. Les PNJ sont simulés par le joueur désigné au purgatoire ;
sans joueur, le serveur poursuit leur service à chaque tick de salle (250 ms).
Les tirs d'avion restent prédits immédiatement, puis débités par lots fiables.

Les sections suivantes documentent le backend Sites historique, maintenu pour
la version publique durant la migration. Les références HTTP/D1 de ces sections
ne s'appliquent pas au serveur Node.

# Cooperative client-owned character physics

Each player's browser owns its body at the base and in purgatory, as it already
owns its aircraft. Movement and collision response are
computed locally, without waiting for an HTTP response. Accepted snapshots merge
membership, papers and remote bodies but preserve the local body and simulation
time for the same arena epoch and body ID. Reset/respawn initializes a fresh body.
There is no server replay or reconciliation of local movement.

The server stores and relays reported player body states. It never advances the
base arena. When no human owns purgatory NPCs, it advances their service using
advanceArena; this exception does not integrate player-owned movement. Form submissions carry the latest body report; the server uses
that trusted position for proximity checks, validates signature acknowledgement and document order,
and serializes signatures/boarding as before. This deliberately trusts players
rather than attempting to prevent movement cheating.

Remote player bodies use the existing 20 Hz lossy RTC motion channel and its
interpolation, with HTTP fallback. They are kinematic proxies in the local
integrator: collision response moves only the locally owned body. This permits
approximate shared pushing, not a globally deterministic rigid-body simulation.

The lexicographically first connected player soul owns NPC physics. The server
publishes that host ID. Host changes import the latest NPC snapshot; a disconnected
host expires after the existing 12-second presence timeout. When no player is in purgatory, the server advances NPC service on requests,
including rewards. Background-tab throttling can reduce a human host’s updates.

Combat damage is persisted separately from body motion, with an incarnation
identifier and idempotent hit ledger. Movement reports cannot reset damage or
restore retired melee actions. See [combat and worlds](combat-worlds.md).

## Verification

- `scripts/test-client-authority.mjs`: old snapshots delayed by 40/160/320/1500 ms
  cannot overwrite the owning player's position; metadata and reset checks.
- `scripts/test-client-physics.mjs`: actual Worker HTTP routes and SQLite storage
  with two players; client reports are accepted, polling never simulates bodies,
  signatures use the attached fresh body, remote
  proxies stay fixed, disconnect changes host, and reset changes epoch.
- Existing flight, network, physics, audio, boarding and pointer tests still run.
- Browser smoke check in software rendering fallback: join, local walking and
  purgatory transitions and document controls. The cloud browser cannot create WebGL;
  subjective high-frame-rate multiplayer smoothness remains unverified.

The previous time-based reconciliation implementation and its synthetic delayed-
snapshot test have been replaced, rather than layered onto client authority.

Aircraft fuel and ammunition are persisted separately from client motion, with
conditional elapsed-time updates and atomic projectile debits. Owner changes do
not reset them. See [logistics and contracts](logistics-contracts.md), including
the immediate shot prediction and batched debits.

## Tirs d’avion

Les projectiles et le décompte local de munitions sont prédits sans attendre HTTP.
Les débits sont rapportés par lots idempotents en arrière-plan ; les réponses ne
créent pas de projectiles. Le modèle de confiance reste coopératif, comme les
mouvements et impacts. Voir [logistique et contrats](logistics-contracts.md).

## Incarnation, chute et retour courant

Sur Node, une nouvelle incarnation recrée aussi le corps local du bureau pour
éviter de conserver le lieu de mort. Un rapport d’impact vertical est dédupliqué
par joueur/incarnation/tir. Les destinations signées et le secret privé de reprise
du contrat de lit sont détaillés dans [retours terrain](field-update.md).
