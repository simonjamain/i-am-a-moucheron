# Economy, handling and feedback

## Runtime scope

The Node server implements these gameplay rules in RAM, in synchronous domain
operations, with reliable UDP commands. It needs no database, migrations or disk
writes. Restart resets every room. SQL/migration and HTTP references below refer
to the historical Sites backend, retained until VM deployment.
See [UDP server](udp-server.md).

## Input and signatures

A valid local ink stroke submits on pointer-up, never on pointer-cancel. The
client locks the current document while its request is pending. The old 650 ms
minimum animation wait was removed. A stamp appears immediately in an independent
non-interactive overlay, so the next document need not wait for its fade-out.
Only `signature: true` is transmitted; the ink image stays in the local session
archive. The server still checks document order, physical proximity, desk
occupancy and exclusive seat claims. This acknowledgement is not handwriting
verification and adds no anti-cheat claim. All previous array-format submissions
remain compatible. Text was already local and no image upload existed in v021.

E only opens an equipment dossier while on foot, outside an equipment seat.
A/E remain available for flight rudder. F exits equipment, with an optimistic
local transition and rollback if the server refuses. Sync responses are held
while that transition is pending, avoiding a stale snapshot moving the player
back into the cockpit. Entry still waits for authoritative seat allocation;
network round-trip time cannot honestly be removed. There is no added boarding
or exit timer. P toggles the workshop; a signed prepaid order opens placement, E (Enter alias) places, Escape retains the order for later. See [current purchase flow](clean-flight.md#prix-bon-signé-et-pose).

Space toggles the canopy whenever the on-foot body is airborne, including with
a free cursor. All exits and forced ejections start without a parachute. Exit
velocity is inherited, and airborne walking retains inertia. Touch has a canopy
button. Ground contact folds the canopy; a grounded body cannot open it.

## Ballistics and fall model

`ballistics.js` uses gravity and quadratic drag, following the
[NASA drag equation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/drag-equation/)
and [falling-body model](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/falling-object-with-air-resistance/).
The character reference terminal velocity is 54 m/s, close to the approximately
120 mph free-fall reference given by [USPA](https://www.uspa.org/students/your-first-skydive/tandem).
Canopy terminal speed is a game tuning value of 5.5 m/s. The equivalent drag is
k = g / terminal²; body mass is declared as an 80 kg reference, with Cd*A
represented by that combined coefficient. This is the reference-human model
scaled by the map ratio, not a fluid-dynamics simulation of an actual 5 mm human.

A split gravity/exact quadratic-drag integrator stays stable when a canopy opens
at terminal speed. Character integration uses at most 1/240 s substeps. Bullet
and shell drag coefficients are game constants 0.0007 and 0.00015 /reference-m;
projectile collision sweeps run at most 1/120 s per segment. Small arms inherit
carrier velocity. Visual tracer width never enlarges the collision ray.

Projectiles expire after 2 s (small arms), 3 s (shells), collision or fuse, with
an additional 256-active-projectile cap. Vehicle tracer geometries/materials are now recycled in a bounded pool of 256;
expiry and capacity eviction return them to that pool. Other finite effects dispose their own resources. Fallen enemies tumble and fade over 4 s,
collide with the office tops/floor, then dispose their own cloned materials and
geometry; their list is capped at 80. Active hit queries exclude corpses. Flak
has a brief warm flash, dark lobed smoke for 4.8 s and falling metal fragments;
combat effects remain capped at 40. Smoke has no extra damaging lifetime.

## Shared economy

Migration `0008_economy.sql` adds room dollars, upgrades, a soul-reward ledger,
idempotent purchase orders and placed equipment. Each NPC accepted by Saint
Peter earns exactly one shared dollar, guarded in the same compare-and-swap
transaction that marks the soul gone. Office kills earn nothing directly. Shooting a soul in purgatory releases it with the same exact-once reward. NPC service
continues on the server when no dead human currently owns the purgatory. With a
human there, the existing client-hosted physical queue remains authoritative.

The catalog is declarative in `equipment.js`:

The initial DCA costs 4 dollars, Stuka 12 dollars per hull, Spitfire 24 dollars, tank 10 dollars, motor levels 4/9/16,
and ammunition levels 6/12/20. DCA prices rise by 2 dollars per installed gun,
up to 40 dollars. Completed, non-lost waves grant an immediate team stipend;
soul releases remain worth one dollar. See [progression](progression.md) for
the single detailed reference, curve, validation and persistence guarantees.

The historical direct-purchase transaction conditionally inserts an order, debits once, adds the
installation/unlock/upgrade, then marks the order done. Retrying its request ID
cannot debit twice. Competing purchases cannot overspend the room. Conflicting
placements are checked again inside the transaction. A placement must be within
9 reference metres of an alive grounded walker, have full-base support and free
headroom, avoid parked aircraft and other installations. A room allows 24 purchased installations in total.

Placement uses the same test in browser and Worker. At assembly, the Worker's
static collider data is generated from the actual office geometry, including
books and paper stacks. A design edit therefore does not silently leave a second
hand-maintained server surface list behind. Existing game position reports remain
client-trusted; this is cooperative-game consistency, not anti-cheat.

The migration returns users of older static DCA posts to foot mode.
No DCA is supplied free at game start. Purchased installations are replicated
and retain the same ground-ring/two-document access flow. A game reset clears
money, purchases, equipment and unlocks. Saved room state survives page refresh.
The fighter and bomber pads are closer, with doors facing the space between
them; ready unoccupied aircraft from older releases are moved to the new pads.

## Enemy variety and models

`routes.js` declares four wall-vent entries and three floor-level holes, drawn
in the office. A seeded director generates smooth three-dimensional routes per
cluster, with isolated individuals and mid-route branches that later rejoin.
Routes are sampled by arc length for consistent speed and shared arrival timing.
Most aerial waypoints are high, with variable altitude and low approaches. Ants
unlock on wave 3 and roaches on wave 6. Their floor routes avoid the main furniture
supports and finish by climbing toward the bin. They have walking legs instead
of wings. Ground paths use static obstacle-aware A* and simplification, not a dynamic navigation mesh;
arbitrary player-deployed equipment is not dynamically rerouted around.

The bomber now has a rounded fuselage, glazed nose, side windows, engine cowls,
exhausts and belly panels. Gun mounts use a low ring and receiver instead of a
large sphere in the gunner's view, with barrel jacket, ammunition box and grips.
The offset camera is raised further, and its backward offset stays in the
aircraft’s horizontal plane so aiming upward cannot pull it down into the hull.
Projectile origins stay on the muzzle.

Validation: the suite covers purchase concurrency/idempotency, exact-once
rewards including natural NPC service with no human in purgatory, physical
placement on desks/books, denied floating placement, unlocks, reset, terminal
fall/canopy braking, ballistic scale invariance, multiple sources/routes, smoke
expiry and the existing flight, collision, network, document and combat flows.

## Extensions aux dossiers et installations

Les déchirures, annexes, dégâts fractionnaires, prix indépendants des installations
et réserves des avions sont détaillés dans [logistique et contrats](logistics-contracts.md).
La DCA conserve ses deux signatures obligatoires et ses munitions illimitées.
La station gratuite d’Alpha ne fournit pas de DCA gratuite.

## Current character fall and personal respawn

The freefall/canopy reference values earlier in this historical section are
replaced for the character by world-metre gravity, gradual inflation and impact
damage in [field updates](field-update.md). Projectile and aircraft ballistics
retain their separate miniature tuning. Beds use common funds and personal
signed contracts; new loans use 10–20 % per wave without rewriting signed schedules.

Current Node installations use [signed prepaid orders](clean-flight.md#prix-bon-signé-et-pose),
not payment at placement. Their pending counts participate in quotes and the 24-item cap.

Les [retours multijoueurs](multiplayer-return.md) remplacent le déploiement direct
des appareils achetés, la gravité non miniature et les parcours courts. Les achats
de véhicules se signent et se posent à pied, notamment sur le plancher.
