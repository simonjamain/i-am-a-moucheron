> Archive historique : contient des règles remplacées. Pour l’état actuel, lire
> [gameplay](../gameplay.md) et [la carte du code](../code-structure.md).

# Miniature sorties

Furniture uses ROOM_SCALE=12; vehicle geometry and flight dynamics keep their units. A 780-unit desk against a roughly 3-unit midge gives a much stronger miniature scale. The airfield is a small strip at its front edge. Insect raids pass the airfield before crossing the room towards the bin. Flight camera clipping, room limits, wind volume and radar use the enlarged layout.

Plane projectiles travel at 220 units/s with a 0.06-second firing interval. Swept rays over each travelled segment hit the nearest visible insect or teammate geometry, or solid furniture. A projectile applies at most one impact. Remote tracers never apply damage. Plane rounds deal 15 friendly damage; twin DCA guns deal 25 every 0.12 seconds. The cooperative server trusts the shooter's contact report, deduplicates shot IDs in the room and delivers damage to the victim until their HTTP cursor acknowledges it. Damage updates the victim's local HP; zero HP uses the existing death flow.

Boarding now seats the pilot on the parked aircraft. Maj increases throttle, Ctrl reduces throttle and brakes rolling contact; S / down pitches up for takeoff. A wheels-first arrival is landable below 28 horizontal units/s, 5 descent units/s and roughly 28 degrees tilt; other contacts remain crashes. Gentle contact preserves rolling velocity. F exits a stationary plane, leaving it at the actual position. F in flight abandons the aircraft and immediately opens a steerable parachute (3.5 units/s terminal descent). A deployed pilot can land on a desktop, crate or floor. E reenters their own parked plane without repeating the already signed paperwork. An abandoned airborne plane is removed.

Six DCA stations are on the starting desk, second desk, crate and floor. E boards the nearest gun on foot, with a transactional exclusive seat; E leaves it. Mouse or right stick aims; click or Space fires. A disconnected/dead occupant's seat can be reclaimed after the normal presence timeout. Your parked plane stays where you left it while serving a gun.

The physical simulation stays client-owned. Server routes persist mode changes and shared seat ownership, while body reports carry height and canopy state. These are cooperative trust rules, not an anti-cheat system. Remaining simplifications: fixed landing gear, no abandoned-aircraft autopilot, instant parachute deployment, no full walking jump or ragdoll.

NPC service completion is monotonic for the current NPC host: stale snapshots cannot clear a locally set gone flag before it is reported. The server persists the soul's gone status atomically with that report.
