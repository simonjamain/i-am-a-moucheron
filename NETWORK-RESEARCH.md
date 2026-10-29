# Multiplayer transport research

> Dated research and implementation record. For current ownership and transport,
> read [code structure](docs/code-structure.md) and [operations](docs/operations.md).

Research date: 2026-10-28. Scope: browser game hosted through Sites on a Cloudflare Worker, nominally 5–10 players. These findings describe the source before the network change; implementation decisions and measured results must be recorded separately.

## Existing implementation

Inspection of `src/client.js` found a `setInterval(..., 250)` making `fetch('/api/sync', ...)` calls, guarded by a single pending flag. This is HTTP polling at a maximum of four exchanges per second, not a WebSocket transport. Each request writes the local aircraft state to D1 and returns a room snapshot. `updateOthers()` lerps toward the last received position, without a history buffer or velocity prediction. The first practical bottlenecks are the low update frequency, request/database round trips, and display of stale samples. Changing TCP to UDP alone does not solve those application-level problems.

An HTTPS URL does not establish which lower transport the browser negotiated: HTTP/1.1 and HTTP/2 ordinarily use TCP; HTTP/3 uses QUIC. Therefore the current code is insufficient evidence to claim that every current request uses TCP. Cloudflare lists inbound HTTP/3 separately from WebSockets in its [supported protocols](https://developers.cloudflare.com/workers/reference/protocols/).

## Browser choices

| Option              | Relevant semantics                                                                                                                                                         | Fit here                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| WebSocket           | Persistent reliable, ordered bidirectional messages; Cloudflare describes them as TCP connections.                                                                         | Better than 4 Hz polling, but a Worker alone is not a durable room coordinator.                           |
| WebRTC data channel | Native browser peer connection. Configurable unordered, partially reliable messages. Standard basic stack is SCTP over DTLS over ICE/UDP.                                  | Practical optional direct path for frequent aircraft/purgatory movement snapshots.                        |
| WebTransport        | Browser/server streams plus datagrams; UDP-like unreliable transport when HTTP/3 is available. Requires an actual WebTransport server, not merely ordinary HTTP/3 support. | Desirable future authoritative server transport, but unsupported by the documented Sites runtime surface. |

Sources: [Cloudflare WebSocket documentation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/), [RFC 8831](https://www.rfc-editor.org/rfc/rfc8831.html), [W3C WebRTC specification](https://www.w3.org/TR/webrtc/), [W3C WebTransport specification](https://www.w3.org/TR/webtransport/).

A useful WebRTC channel for replaceable state is `createDataChannel('state', {ordered:false, maxRetransmits:0})`. Each update supersedes previous updates, so retransmitting an obsolete aircraft pose is undesirable. Add application sequence numbers and discard stale/out-of-order packets. Keep authoritative purchases, wave changes, deaths and signatures on a reliable server path. Bound `bufferedAmount` and drop replaceable updates when backlogged; unordered channels still have congestion control and do not make unlimited bandwidth available. The W3C specification defines both reliability options and buffer accounting; RFC 8831 describes the congestion-controlled underlying SCTP transport.

## Hosting constraints

The existing hosting manifest exposes only `d1: DB`, `r2`, and Site identity. The Sites skill documents Worker HTTP-based connections and no raw TCP. Its hosting manifest contract does not offer Durable Object bindings. Cloudflare itself supports Worker WebSockets and Durable Object room coordinators, but that does not establish that this Sites product can provision such a binding. Do not invent a `durable_objects` manifest field or rely on a process-global Worker map for shared room state.

Cloudflare's [protocol table](https://developers.cloudflare.com/workers/reference/protocols/) lists HTTP requests, WebSockets, and HTTP/3 requests, but does not document an incoming WebTransport session API. The official workerd repository has a [WebTransport tracking feature request](https://github.com/cloudflare/workerd/issues/6451). Absence from the documented interface is the reason not to implement a presumed server endpoint here; it is not a claim that Cloudflare will never support it. Supporting an ordinary HTTP/3 request is different from providing WebTransport datagrams: the [W3C specification](https://www.w3.org/TR/webtransport/) requires the server to advertise WebTransport settings and negotiate an extended CONNECT session.

## Signaling, NAT and fallback

WebRTC needs offer/answer and ICE-candidate exchange; the signaling channel is separate from WebRTC and can use the existing same-origin HTTP API. [WebRTC's official getting-started guide](https://webrtc.org/getting-started/peer-connections) explicitly describes HTTP/REST signaling, STUN discovery, TURN relays and trickle ICE.

Without an ICE server, only host candidates are available: some local-network/same-machine connections can succeed, but internet connectivity is not guaranteed. A STUN server helps discover public mappings; it is not a relay and does not solve every NAT/firewall. TURN is needed for relay connectivity where direct paths fail. No TURN server or credentials are provisioned in this project. Do not promise UDP connectivity for every player, hard-code private TURN credentials, or silently make successful play depend on a third-party free relay. Preserve HTTP fallback for each peer and present the actual transport honestly. Adding a managed TURN service can be a later infrastructure decision.

## Recommended bounded implementation

1. Keep the server responsible for membership, waves, kills, death and purgatory authority.
2. Negotiate native WebRTC data channels through same-room authenticated HTTP signaling. Choose a deterministic offerer to avoid negotiation glare; bound and expire signaling records.
3. Send compact movement snapshots around 20 Hz over open channels, subject to a buffer limit. Use the HTTP snapshots whenever a peer is missing, disconnected or stale. Do not send media or request camera/microphone permission for data channels.
4. Introduce a small snapshot history, interpolation and bounded velocity extrapolation. Treat respawn/teleport and life transitions as discontinuities so aircraft do not glide through the room from an old death position. Stop extrapolating after a short timeout rather than letting ghost aircraft fly forever.
5. Keep a reliable fallback and a visible diagnostic with real connected-peer count/transport, packet age and, if measured, RTT. [W3C WebRTC stats](https://www.w3.org/TR/webrtc-stats/) defines selected candidate pair, ICE candidate protocol and round-trip measurements. A WebRTC connection alone does not prove the selected path is UDP; report UDP only when verified from the selected candidate.
6. Test stale/reordered packets, loss of peer connectivity, fallback, room isolation, signaling replay/oversized payloads and simultaneous joins. Compare smooth motion with simulated 250 ms sparse samples. Do not claim measured internet latency improvements from same-machine browser tests.

Native WebRTC is sufficient; a wrapper library cannot provision the missing TURN infrastructure or supply an unsupported Worker WebTransport runtime. A full peer mesh scales as `n*(n-1)/2` connections (45 pairs at 10 players, 4,950 at 100), so cap it and fall back above the prototype's small-group range. A later larger-scale design should use a real authoritative room server/relay with supported hosting.

## Implemented in this iteration

- Native WebRTC motion channel at a target 20 Hz, unordered with zero retransmits. STUN uses Cloudflare’s documented public endpoint (`stun:stun.cloudflare.com:3478`); [Cloudflare ICE configuration](https://developers.cloudflare.com/realtime/sfu/get-started/connection-patterns/) distinguishes discovery from TURN relay. No TURN credentials or external relay were configured.
- Same-room HTTP signaling with a monotonic delivery cursor, negotiation identifiers, bounded request size/rate and a 60 second TTL. Ordinary HTTP snapshots remain at 4 Hz for rules, membership and per-peer fallback. RTC is capped at 12 total room members; larger rooms use the server fallback.
- Pose history buffers: 100 ms RTC / 160 ms HTTP display delay, quaternion interpolation, velocity prediction capped at 150 ms, reset across teleports and life transitions. Includes movement of bodies in purgatory. A stalled RTC peer resumes HTTP rendering after 750 ms.
- Backpressure skips disposable movement packets instead of accumulating them. Selected ICE candidate protocol is read via `getStats()`; the UI only says UDP when measured. No camera or microphone is requested.
- Preserved and completed pending manual three-axis aircraft controls and standard Gamepad API input.

Validation: the automated suite covers signaling isolation/cursors/expiry, full offer/answer handling with queued ICE and stale-session rejection, lossy-channel options, backpressure, stale packets, fallback, mesh cap, position/quaternion/soul interpolation and bounded prediction. A constant-speed simulation with 4 Hz samples and 60 Hz rendering compares frame-to-frame steps; this is a smoothness regression test, not an internet benchmark. Existing flight, gamepad, wave, death, combat and signature tests also pass. Browser checks exercised two real clients, HTTP fallback, and offer/answer exchange. The cloud browser did not establish a direct data channel, so WAN UDP connectivity and measured latency gains remain unverified here.
