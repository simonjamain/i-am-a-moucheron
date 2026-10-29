> Archive historique : contient des règles remplacées. Pour l’état actuel, lire
> [gameplay](../gameplay.md) et [la carte du code](../code-structure.md).

# I am a moucheron — prototype 001

Browser co-op aerial combat in a giant office. Each player enters a nickname and room code without an account and receives their own plane. Typical target: 5–10 players; no 100-player claim without measurement.

## Implemented scope

Independent planes, shared wave state and enemy kills, 3D office, simple aerodynamic forces, wind, collisions, damage affecting wing lift and engine thrust, automatic provisional respawn after 5 seconds. D1 stores rooms and player snapshots. Client renders at display rate and sends position at 4 Hz. Client-authoritative flight and hit detection are a prototype compromise, not a production anti-cheat model.

## Required next steps

- Multi-seat aircraft with separate pilot and gunner roles (explicit core requirement; not yet implemented).
- Tune and validate aerodynamics and collisions with actual players.
- Test latency and load at 5–10 players; choose dedicated real-time transport before scaling.
- Replace provisional auto-respawn with the purgatory mechanic below.

## Purgatory — future mechanic, user proposal 28 October 2026

On death, a player enters a queue before Saint Peter and must sign resurrection paperwork before returning to the spawn. Enemies killed are in the same purgatory, ordered by their deaths. Each enemy occupies the counter for a few seconds on average. Killing many enemies in quick succession therefore creates a longer queue. A player can beat up enemies one by one ahead of them to move toward the counter faster and complete their resurrection paperwork.

Additional user decision: several players may be in the purgatory together. They can fight and knock each other out to reach resurrection sooner. The purgatory is therefore shared between players.

Not yet decided: exact service time, knockout duration, anti-blocking rules, and what happens to enemies after processing. Do not assume enemies resurrect into the combat map.

## Purgatoire (prototype 002)

La file est commune au salon et conservée côté serveur. Un moucheron abattu entre une seule fois, dans l’ordre des validations serveur. Un crash (ou R) place le pilote dans cette même file. Les moucherons passent trois secondes au guichet ; les joueurs signent trois documents, dans l’ordre, avant de retrouver un avion intact à la base.

Un coup vise uniquement l’âme immédiatement devant soi. Trois coups permettent d’échanger les places et assomment la cible pendant deux secondes ; cela fonctionne aussi entre joueurs. Intervalle minimal de 650 ms entre les coups. La file continue pendant le combat et entre les vagues. Les pilotes déconnectés sont retirés après douze secondes, pour ne pas bloquer le guichet. Les ennemis traités quittent le purgatoire sans revenir dans la vague.

L’interface est pour l’instant un guichet et une file interactifs, pas un espace 3D avec déplacements libres. Les règles de file, les coups, l’assommement et les signatures sont contrôlés par le serveur ; le modèle de vol reste simulé par les clients.

## Flight revision 004

Reference: Spitfire LF Mk IX turn-fighter role, https://wiki.warthunder.com/unit/spitfire_ix . This is a miniature assisted model, not a replica of War Thunder flight data. Left/right requests 55-degree bank with coordinated yaw, automatic leveling on release; A/D allow manual rolling. Angular response time constant 0.11 s, speed-dependent authority, 129 deg/s maximum roll target and 64 deg/s pitch target. Lift uses angle of attack, smooth stall, induced drag and damage. Tested bidirectional trajectory, leveling, pitch, low-speed control, stall, wing damage, 60-second numerical stability, and served flight module.

## Multiplayer motion and manual flight

The movement path now prefers a bounded WebRTC mesh (nominal 5–10 players; maximum 12 for RTC), at 20 Hz, without ordered delivery or packet retransmission. The server still owns game-rule events, membership, purgatory order and signatures. The existing 4 Hz HTTP snapshots are the fallback when RTC is unsupported, blocked, stale, or above the mesh cap. Both paths feed interpolation and short bounded prediction. See ../../NETWORK-RESEARCH.md for source references, tradeoffs and verification limits.

Aircraft have three independent manual axes: arrows for roll/pitch, physical Q/E keys for rudder (A/E on AZERTY), no auto-level or yaw instructor. Standard mapped gamepads provide analog sticks, rudder, throttle triggers and fire. No physical controller is attached to the verification environment; input mapping is covered with synthetic standard-pad samples.

## Mouse aim (prototype 007)

Desktop defaults to mouse aim: pointer movement rotates a persistent world-space requested direction using camera axes. A separate camera rig smoothly follows that direction and keeps the horizon stable except near the poles. White circle: requested direction. Small green reticle: actual aircraft boresight. These are projected separately. The aircraft instructor produces bounded pitch/roll/rudder inputs consumed by the unchanged physical flight step; it never sets aircraft orientation or velocity.

Implementation is independent JavaScript, inspired by the aim/camera separation described in Brian Hernandez’s MouseFlight README and controller source: https://github.com/brihernandez/MouseFlight and https://github.com/brihernandez/MouseFlight/blob/master/Assets/MouseFlight/Scripts/MouseFlightController.cs . No Unity code or assets were copied. This is a first tuning pass for the miniature office, not a reproduction of War Thunder’s proprietary instructor.

M or the mode button switches to unrestricted manual three-axis flight. Keyboard axis inputs override the corresponding instructor axis while held. Active gamepad sticks temporarily select manual flight; mouse movement takes back mouse control. Coarse-pointer devices retain tactile manual controls. Left click/Space fires; wheel adjusts throttle. Optional pointer capture removes screen-edge limits; Escape, blur, crash and opening Help release it, and capture failure leaves ordinary mouse aiming usable. Cursor motion over UI and purgatory signatures does not steer the aircraft.

Validation: persistent target, horizontal/vertical/screen-relative aiming, six-direction convergence at controlled airspeed, bounded physical commands, no orientation teleport, 60-second wind/damage stability, vertical camera stability and frame-rate-independent damping pass. Existing manual roll, gamepad, multiplayer and purgatory suites pass. Browser QA verified default mode, distinct reticle positions after mouse movement, and switching manual/mouse. The local cloud browser refused pointer capture; the failure path remained usable. No physical gamepad is attached to this environment.

## Physical purgatory melee (prototype 008)

This supersedes the FIFO purgatory rules above. Birth order only places new bodies; it grants no signing or attack priority. A visible circular desk zone determines who can sign. The nearest conscious body to its centre occupies it; physical separation prevents bodies sharing a point. Every document submission rechecks the server-owned arena at submission time, including knockdown state. Moving or getting pushed outside interrupts access. Enemy service time accumulates only while physically occupying the desk, and resets on displacement.

Shared deterministic 2.5D physics integrates acceleration, drag, bounded velocities, inverse-mass collision impulses, separation and walls. A swept fist segment against torso collision circles selects any physical target in front; there is no queue-neighbour selection, place swapping, client-supplied target or trusted client body pose. Jabs alternate hands (wind-up, active window, recovery), heavy pushes trade speed for displacement, guard protects the facing side, and a short dash repositions the body. Loss of balance causes a brief knockdown; downed targets can be pushed but hits do not prolong the KO. Provoked moucherons can retaliate.

The worker advances a persisted arena on incoming requests at a fixed 60 Hz simulation step, with a bounded catch-up window. A D1 compare-and-swap revision plus a unique operation nonce serializes concurrent input, attack and signing commits in an atomic batch. The client sends movement intentions, not authoritative positions, and predicts the same engine for display. Dead players poll at a target 10 Hz; flight retains its existing network cadence. This is not a dedicated continuous physics server or full skeletal ragdoll simulation.

Avatars now have shoulder/elbow/hip pivots, alternating punch/guard poses, walk cycles, spring-driven impact lean, knockout/recovery poses, glove volumes and impact feedback. Jab: Space or A/Cross; push: F or Y/Triangle; guard: Shift or LB/L1; dash: X or B/Circle. Touch buttons are supplied.

Verification includes swept contact and misses, behind/range exclusions, wind-up/recovery and single-hit enforcement, directional guard, impulse and KO, input expiry, dash cooldown, stable twelve-body crowd collisions, NPC retaliation, actual-position signing, forged-pose rejection, loss/reacquisition of desk access, drawn signatures and concurrent contenders. Browser checks used two clients for movement, physical desk entry, a shared hit and signature form visibility. Existing flight/mouse/gamepad/multiplayer tests remain passing.

## Spatial sound (prototype 009)

Every diegetic sound is mono and routed through its own Web Audio PannerNode (HRTF, inverse-distance attenuation), then master gain and a dynamics compressor. AudioListener position and forward/up vectors follow the active flight or purgatory camera in the same world coordinates. There is no stereo-only bypass for world effects, media capture, external audio service, reverb/occlusion simulation or claimed native Doppler effect.

Procedural buffers cover propeller engines (pitch follows throttle/speed), fan, insect buzz, gunshots, hits/crashes, punches/blocks/KO, footsteps, dash/whoosh, pen/paper, desk stamps, entry/respawn and wave cues. Loops follow visible nearby actors, with bounded voice counts and shared cached buffers. Purgatory stamps and dashes are replicated as authoritative arena events; hits reuse the existing replicated impact events. Office effects are suppressed in purgatory and scene changes stop old emitters.

The context is created/resumed only by a user gesture. Master volume and mute persist locally. Mute/hidden-tab/scene changes stop sources; ended nodes disconnect. At most 20 loops and 24 one-shots coexist. No missing/blocked audio API may prevent gameplay. Sounds are an initial synthesized palette, not recorded aircraft or foley assets.

Validation: tests cover finite normalized mono synthesis, the complete source→gain→HRTF panner→master→compressor→destination graph, listener/source transforms, pitch, cooldown, bounded voices, mute/gain, hidden tab, scene isolation, disposal and reopening. Browser QA verified user-gesture activation, mute and continued gameplay without Web Audio errors. No subjective listening or headphone calibration was performed in this environment.

## Physical base and boarding dossiers (prototype 010)

Joining now creates a physical on-foot body on the desk, reusing the purgatory humanoid at a miniature scale. The base arena uses the same shared impulse/separation engine, bounded to the desktop, with solid fuselage/wing obstacles for parked aircraft. Ground intentions and collisions are server-owned; local prediction provides smooth movement. Avatars and parked planes are visible to other players, including from the air. Ground audio uses world-space footfalls and shared stamp events.

Each active pilot receives a reserved numbered aircraft bay. A single atomic SQLite slot-allocation statement protects simultaneous joins; expired slots can be reused, and an old conflicting session must rejoin. The grid defines up to 100 bays for identity/allocation, not a 100-player performance guarantee. Current nominal group size remains 5–10, with the existing RTC mesh cap unchanged.

At the assigned access circle, E / A-Cross / the interaction button opens two drawn-signature documents. Each server submission validates signature shape, current authoritative position, correct document order, and pilot state. The second valid document atomically boards the pilot into their own aircraft. Foot mode cannot update aircraft transforms, shoot aircraft weapons, or remotely board. The current prototype assigns the player's aircraft; shared crew seats or boarding another pilot's plane are not introduced here. Death, resurrection and room reset clear boarding paperwork and return the player on foot.

The common dossier panel is used for boarding and Saint Pierre: readable paper layout, issuer/code, pilot and aircraft metadata, document progress, purpose text, a baseline-guided signature surface, sampled/smoothed pen strokes, undo-last-stroke, clear, close/reopen, validation status and stamp feedback. Mouse and touch use Pointer Events. Signatures remain drawn, not typed; ink is discarded after validation and is not retained as a personal-signature record. The position is rechecked for every document, including if a body is displaced while writing.

Tests cover concurrent bay reservation, grounded spawn, solid hulls, collision bounds, actual access proximity, invalid/blank/out-of-order documents, interrupted/reacquired access, atomic boarding, remote pose/fire rejection, independent dossiers, resurrection to foot mode and reset. Existing flight, mouse, purgatory, multiplayer and audio suites pass. Browser QA exercised walking, the first boarding document, undo, the second signature, successful flight transition, and the reused purgatory panel. Physical-touch-device testing was not available.

## Prototype 011 — marche en troisième personne

Caméra rapprochée commune à la base et au purgatoire, à hauteur du personnage, avec suivi amorti. Déplacement relatif à son azimut, diagonales normalisées et transformation inverse des coordonnées de la base. Clic droit glissé ou glissement tactile sur le décor pour orbiter ; stick droit pour tourner ; molette pour la distance (3,2–9 m), élévation bornée. Caméra rapprochée devant les colliders du bureau. Dossiers et aide neutralisent les intentions de marche ; les collisions et signatures restent autoritaires. Tests automatisés existants, build et contrôle visuel de marche à la base et du cadrage au purgatoire ; manette et tactile sans matériel réel.
