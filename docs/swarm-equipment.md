# Swarms, equipment and feedback

## Tracers and mounts

`tracers.js` draws each small-calibre shot as an unlit ivory core plus a coloured
additive halo and an 11-reference-metre streak. A bounded minimum projected width
improves distant readability; collision still uses the actual swept segment,
not the exaggerated visual width/length. Shells have a shorter orange streak.
Every tracer owns and disposes its materials/geometry. The existing 256-projectile
cap remains. Local and remote vehicle shots share their hull hue; personal pistol shots use the same luminous style. See [current projectile rules](clean-flight.md#provenance-et-mire).

Bomber dorsal and tail turrets now have one barrel each, a yaw joint, a separate
elevation joint and an explicit muzzle node. `aimGun` uses the parent's inverse
orientation before computing yaw and pitch; no uncontrolled roll. Both local
and remote shots originate at that node. `gunnerView` sits behind, above and to
the right of the gun so its firing line is visible. DCA seats, shields and
turntables rotate with azimuth; barrels and breeches rotate about the trunnion.

F uses `equipmentExitAction` independently of flight/crew classification and
pointer capture. It exits pilot, dorsal and tail seats, or a DCA, while ignoring
text inputs, forms, repeats and dead players. A grounded aircraft still must be
stopped. An airborne exit frees only that player, in freefall with a closed canopy. Other occupants remain aboard.

## Difficulty and flock flow

`waves.js` is shared with the Worker. A seeded PRNG keyed by room, wave and start
time builds a roster from an increasing integer budget. Aerial costs are 1 / 3 / 6 / 12;
health is 100 / 200 / 400 / 800 PV for midge / dart / guard / brute. Darts unlock on
wave 4, guards on 8, brutes on 12. Ants (from wave 1) and roaches (wave 6) add ground variants;
see `waves.js` for the complete catalog and `routes.js` for entry sources. They have distinct size, colour, speed and
infestation cost. Budget is capped at 2400 and visible population at 180; at
that ceiling, remaining budget is consolidated into one brute with its normal 800 PV. The
first wave has four midges plus four ants and follows extended room-wide routes, with timing derived from the actual route.
See [progression](progression.md) for budgets, elite limits and timings. Later compositions
vary randomly while sharing an exact budget across clients.

The movement is a **bounded deterministic flock-flow model**, inspired by
[Craig Reynolds' Boids](https://www.red3d.com/cwr/boids/) and his
[steering behaviours](https://www.red3d.com/cwr/steer/gdc99/): route-guided clusters,
smooth individual wandering, local separation, cohesion and heading alignment.
It evaluates offsets directly from absolute game time rather than integrating
chaotic steering from each client's frame history. Late joiners therefore get
the same positions without a new real-time authoritative swarm server. This is
not an unrestricted Boids simulation. Local neighbour scans are bounded at 180
entities; route offsets fade at entry/bin so the server's arrival deadline stays
consistent. Rendered heading follows actual displacement; wings have individual
phase and type-dependent cadence. All clients retain the same ghost steering
neighbours until wave end, so stale kill messages cannot shift the flock.

`enemy_damage` records one hit per room/wave/enemy/shooter/shot, then aggregates
shared health. Atomic batches insert a kill and one purgatory soul only after
health is exhausted. Machine guns deal 75 base damage; direct flak hits deal 200 and
airbursts fall from 80 to 20 damage. See [combat-worlds](combat-worlds.md). Hit reporting retains the game's existing client-trusted collision
model; this is not competitive anti-cheat. Vehicle/insect impacts now cost the hull 5% of the insect’s remaining HP once per contact; stronger healthy types therefore cause more damage and infestation on arrival. The purgatory admits at most 24 NPC bodies at a time
(with all player bodies); further souls wait persistently offstage so a large
wave cannot flood its physical crowd simulation. Shared in-game purchases and upgrades are described in
[economy-physics.md](economy-physics.md); no persistent cross-game progression exists.

## Common equipment access and documents

All current equipment (fighter, bomber seats, DCA) has a ground ring and a fresh
two-document dossier on every entry, including re-entry. Physical proximity is
checked on selection and each signature; final seat claims remain exclusive.
DCA uses `equipment-select` / `equipment-sign`, while the fleet retains its
existing seat-specific endpoints. The common paper interface handles all three
contexts: fleet, DCA and purgatory. The direct DCA-entry route refuses unsigned
access. The legacy fleet API remains for compatibility with older clients; the
published UI always uses the dossier flow.

Active sheets are flat, with larger, shorter copy. Every confirmed document is
kept, drawn as overlapping cards with a horizontal scrollbar and total count.
The archive is restored from sessionStorage per room, lasts through deaths and
is cleared when a connected player receives a game reset. It is local browser
session history, not shared server storage. Only confirmed signatures enter it;
rejected requests preserve ink and remain retryable.

## Sound

All new sounds remain procedural mono sources through the existing HRTF graph:
a rising/falling air-raid siren on wave start, soft office hum, countdown ticks,
boarding/exiting cues, armour impacts, kill confirmation, heavier flak reports,
wave-clear and defeat motifs. Mute, gain, scene isolation and hidden-tab cleanup
remain. The siren source is actually in the scaled office, replacing an obsolete
pre-scale coordinate that made the old wave cue nearly inaudible.

The [latest return lot](multiplayer-return.md) adds early ants, extended routes,
player initials and midge-only extra 20% hit tolerance. Other enemy sizes remain unchanged.
