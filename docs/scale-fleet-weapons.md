# Map units, fleet and weapons

`src/scale.js` is the only miniature-ratio declaration. `MAPS.office` is 3/1000;
`MAPS.purgatory` is 1/1. A designer can use `mapScale(1,1000)`, `(2,1000)` or
`(100,1000)`. The world and office furniture use SI metres. Actor reference
metres are multiplied by the map ratio. The office desk surface is 0.9 m;
the human mesh is calibrated to 1.8 reference metres, hence 5.4 mm here.
`ACTOR_UNIT` converts the retained aircraft mesh's 5.6-unit wingspan to a
10.4-reference-metre fighter. The independent insect reference body is 0.9 m.

Flight integrates reference-space speed, force and gravity, then converts linear
velocity back to world metres. Angular rates and cooldowns are time quantities
and do not scale. Walking, parachutes, gun muzzle offsets, projectiles, fuse
ranges, blast radius, collision padding, cameras, hit effects and spatial sound
attenuation use the same conversion. The ground arena retains actor-local planar
coordinates for its shared physics; `baseWorld` is its explicit world seam.
The render clock catches up as far as 250 ms using fixed flight steps, so 10–20
FPS no longer discards visible simulation time at every frame. Long hidden-tab
intervals still do not fast-forward the local aircraft.

Reference tuning is deliberately a game model: fighter cap 70 m/s, bomber cap
52.5 m/s with lower thrust and angular authority, raid speed 60 km/h. The raid
is parameterized by arc length and shared by client and server, including its
leak deadline. Weapon rounds use 820 m/s, shell rounds 800 m/s, all multiplied
by the map ratio. The Anti-Aircraft Museum lists an 800 m/s muzzle velocity for
its L/60 40 mm Bofors:
https://ilmatorjuntamuseo.fi/ilmatorjuntamuseo/kokoelman_helmet/40-itk-36-59-galileo-bofors/
The 0.7 s game cadence, distance-programmed airburst, 100–1200 m reference fuse
and 8 m blast radius are gameplay choices; this is not a historical fuze simulation.
Early impacts before arming are inert. Blasts use falloff and solid-furniture
occlusion, and can damage teammates and shared hulls. Two separate yaw/pitch
joints keep the DCA trunnion anchored; alternating muzzle objects determine the
actual projectile origin. Fighter rounds use a small uniform angular cone;
flashes are short-lived, bounded geometry at the firing muzzle.

The Node runtime owns shared hulls and exclusive seat leases in RAM. Only the
pilot's lease can update a hull transform; gunners publish aim and fire independently.
The fighter and bomber each have one living starter, replaced only on destruction.
Purchased Stukas and tanks are not automatically replaced. Board selection binds
the two signatures to the exact vehicle and role. Exiting frees only that seat;
other occupants and the hull remain. Destruction frees every occupant, including
when the final motion arrives without a later client death command. Canopies start
closed and remain manually controlled. Disconnected seats expire under the
presence timeout. A former occupant cannot overwrite a reclaimed seat's aircraft.
Damage shot IDs are idempotent. See [vehicles and bank](vehicles-bank.md) for
current access circles, models, armament and lifecycle.

The signed sheet is a centred HTML overlay with a paper stack, immediate local
SIGNÉ animation and completed sheet thumbnails. A valid stroke submits on pointer-up. The independent stamp overlay does not
block the next document. Only confirmed documents enter the archive; there is
no minimum animation wait. See [signature handling](economy-physics.md).

Mission start schedules the first wave at +10 s. Finishing a wave schedules the
next at +10 s. Manual start can shorten subsequent breaks; a conditional update
serializes concurrent automatic starts. Poll-triggered transitions use a shared
wall clock, with no unsupported server timer process. With no connected clients,
the next polling request advances the due transition. Migration 0006 resets the
old arbitrary-coordinate sessions instead of reading their numbers as metres.

## Revision 020: collisions, movement and depth

Projectile ray queries traverse visible physical meshes only (`nearestMeshHit`).
Camera-facing Sprite labels cannot intercept a shot or require a raycast camera.
The regression includes the actual hull-plus-Sprite hierarchy that crashed.

Ground controls target a 6 m/s reference run (18 mm/s on this map), retaining
acceleration and braking. Falling integrates 9.81 m/s² reference gravity with
quadratic drag in substeps no larger than 1/240 s; free-fall terminal speed is
54 m/s and deployed-canopy terminal speed 5.5 m/s, all scaled. This keeps an
accelerating trajectory and gives consistent descent across visible frame rates.

The current raid uses seeded arc-length routes with preserved effective speed,
aerial detours and obstacle-aware ground paths. See
[route calibration](vehicles-bank.md#trajets-et-crashs).

WebGL uses a logarithmic depth buffer for millimetre actors in a metre-sized room.
Runway markings have distinct elevations and polygon offsets. Binder page edges
stand clear of their covers; stacked paper sheets have small gaps. Each free role has an entry ring around its landed vehicle; it
sits above the runway with polygon offset and no depth write; it still respects
solid-object occlusion rather than appearing through furniture.

Les réserves finies des avions, les teintes et inscriptions de carrosserie, les
clauses d’armement et les radars sont décrits dans
[logistique et contrats](logistics-contracts.md). La DCA et le pistolet restent
à munitions illimitées ; la panne sèche supprime la poussée, sans figer le vol.
