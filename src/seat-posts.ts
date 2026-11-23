// Boarding by aiming at the post itself (docs/ui-guidelines.md, « Monter dans un engin »):
// no ground circle marks the seats. The player aims at a post (cockpit, turret) and
// clicks; the server only checks that the player stands near the vehicle, from any
// side. Shared by the client and the Node server.
import type { Vec3Like } from './types.ts';

/** Reach beyond the vehicle's half-size, in reference metres, within which posts can be boarded. */
export const POST_REACH = 4;

/**
 * An aimable post, in the model's own units (root-local, as the Meshy rig data).
 * `seats` are the crew seats it gives access to: the first free one is boarded (a
 * passenger cabin holds several). `radius` is the generous aiming sphere; `outline`
 * names the highlighted part: `meshes` are mesh names of the model, outlined on screen
 * on hover (src/post-highlight.ts); `clipRadius` keeps only what lies within that
 * distance of `local` (the part of a shared hull, such as the cockpit or a glazing).
 */
export interface SeatPost {
  seats: readonly string[];
  local: readonly [number, number, number];
  radius: number;
  outline: { meshes: readonly string[]; clipRadius?: number };
}

const post = (
  seats: string | readonly string[],
  local: readonly [number, number, number],
  radius: number,
  meshes: readonly string[],
  clipRadius?: number,
): SeatPost =>
  Object.freeze({
    seats: typeof seats === 'string' ? [seats] : seats,
    local,
    radius,
    outline: clipRadius ? { meshes, clipRadius } : { meshes },
  });

// Posts placed on each model's real parts (cockpit glazing, turret, hatch), checked on
// side, top and three-quarter renders. Nose towards -Z. A cockpit that is part of the
// hull is outlined as the hull clipped around the post.
export const SEAT_POSTS: Readonly<Record<string, readonly SeatPost[]>> = Object.freeze({
  // Biplane fighter: open cockpit behind the upper wing.
  fighter: [post('pilot', [0, 0.35, -0.45], 0.65, ['meshy-biplane-body'], 0.7)],
  // M1 light fighter: glazed cabin under the high wing.
  lightfighter: [post('pilot', [0, 0.35, -1.1], 0.65, ['meshy-m1-body'], 0.75)],
  spitfire: [post('pilot', [0, 0.5, -0.5], 0.6, ['meshy-spitfire-body'], 0.7)],
  // Stuka: long greenhouse canopy.
  interceptor: [post('pilot', [0, 1.2, -0.75], 0.95, ['meshy-stuka-body'], 1)],
  // Biplane bomber: pilot's open cockpit, dorsal gun ring behind it.
  bomber: [
    post('pilot', [0, 1.2, -1.7], 0.95, ['meshy-biplane-bomber-body'], 0.95),
    post(
      'dorsal',
      [0, 1.4, 0.8],
      0.9,
      ['meshy-biplane-bomber-body', 'meshy-biplane-bomber-dorsalGun'],
      0.7,
    ),
  ],
  // B3 model (src/b3-model.ts): pivots from meshy-b3-data.ts. The cockpit and the
  // tail and ventral glazings are part of the hull: their outline is the hull
  // clipped around the post, plus the post's own gun.
  medbomber: [
    post('pilot', [0, 0.75, -3.4], 1.15, ['meshy-b3-body'], 1.4),
    post('dorsal', [0.0029, 1.25, -0.5471], 0.9, ['meshy-b3-dorsal', 'meshy-b3-dorsalGun']),
    post('tail', [0.0485, 0.7328, 4.3], 0.9, ['meshy-b3-body', 'meshy-b3-tailGun'], 0.8),
    post('ventral', [0.0177, -0.95, 0.95], 0.9, ['meshy-b3-body', 'meshy-b3-ventralGun'], 0.72),
  ],
  // T3 tank: driver's hatch on the glacis, the turret, the machine gun on its roof.
  tank: [
    post('pilot', [0, 0.45, -1.25], 0.8, ['meshy-tank-body'], 0.6),
    post('cannon', [0, 0.85, 0.35], 0.75, [
      'meshy-tank-cannon',
      'meshy-tank-cannonGun',
      'meshy-tank-cannonBarrel',
    ]),
    post('top', [-0.28, 1.35, 0.15], 0.35, ['meshy-tank-top', 'meshy-tank-topGun']),
  ],
  // H2 helicopter: tandem cockpit, gunner (copilot) in front and below the pilot.
  helicopter: [
    post('pilot', [0, 0.5, -1.3], 0.75, ['meshy-h2-body'], 0.65),
    post('copilot', [0, 0.15, -2.4], 0.75, ['meshy-h2-body'], 0.65),
  ],
  // D2 anti-air truck: the cab, and the gun on its trailer.
  flaktruck: [
    post('pilot', [0, 0.9, -3], 0.8, ['meshy-flaktruck-body'], 0.9),
    post('cannon', [0, 1.1, 3], 0.9, ['meshy-flaktruck-cannon', 'meshy-flaktruck-cannonGun']),
  ],
  // Castor: a single seat in a cab as wide as the truck; the whole truck is its post.
  castor: [
    post('pilot', [0, 1.1, 0], 3.2, [
      'meshy-castor-body',
      'meshy-castor-turret',
      'meshy-castor-gun',
      ...[0, 1, 2, 3, 4, 5].map((i) => 'meshy-castor-wheel' + i),
    ]),
  ],
  // Flying Castor: the cockpit in the nose; one cabin for the three passengers.
  flyingcastor: [
    post('pilot', [0, 1, -2.2], 1.1, ['meshy-flying-castor-body'], 0.9),
    post(
      ['passenger1', 'passenger2', 'passenger3'],
      [0, 0.9, 0.4],
      1.1,
      ['meshy-flying-castor-body'],
      1.3,
    ),
  ],
});

/** Reach of a vehicle's posts, in reference metres from its centre. */
export const postReach = (profile: { span: number; length: number }): number =>
  Math.max(profile.span, profile.length) / 2 + POST_REACH;

/** The first free seat of a post, given the seats already taken. */
export function freeSeat(post: SeatPost, taken: readonly { seat: string }[]): string | undefined {
  return post.seats.find((seat) => !taken.some((t) => t.seat === seat));
}

export interface PostSphere {
  seat: string;
  centre: Vec3Like;
  radius: number;
}

/**
 * Nearest post hit by a ray (origin, normalised direction), or null. A post behind
 * the origin is never picked; when the ray starts inside a sphere, that post wins.
 */
export function pickPost(
  origin: Vec3Like,
  direction: Vec3Like,
  posts: readonly PostSphere[],
): { seat: string; distance: number } | null {
  let best: { seat: string; distance: number } | null = null;
  for (const post of posts) {
    const ox = origin[0] - post.centre[0],
      oy = origin[1] - post.centre[1],
      oz = origin[2] - post.centre[2];
    const b = ox * direction[0] + oy * direction[1] + oz * direction[2];
    const c = ox * ox + oy * oy + oz * oz - post.radius * post.radius;
    const disc = b * b - c;
    if (disc < 0) continue;
    const root = Math.sqrt(disc);
    const t = -b - root >= 0 ? -b - root : -b + root;
    if (t < 0) continue;
    if (!best || t < best.distance) best = { seat: post.seat, distance: t };
  }
  return best;
}

/**
 * Post aimed at along a ray, given the first point where the ray meets the vehicle's
 * own surface (`surface`, or null when it misses the model). A surface point inside
 * posts' spheres picks the post it lies deepest in (a roof gun beats the turret
 * around it). Otherwise the spheres give a generous margin around small parts, unless
 * the surface hides the post (a wing, the far side of the hull).
 */
export function aimPost(
  origin: Vec3Like,
  direction: Vec3Like,
  posts: readonly PostSphere[],
  surface: { point: Vec3Like; distance: number } | null,
): { seat: string; distance: number } | null {
  if (surface) {
    let best: PostSphere | null = null,
      depth = 1;
    for (const post of posts) {
      const d =
        Math.hypot(
          surface.point[0] - post.centre[0],
          surface.point[1] - post.centre[1],
          surface.point[2] - post.centre[2],
        ) / post.radius;
      if (d < depth) {
        depth = d;
        best = post;
      }
    }
    if (best) return { seat: best.seat, distance: surface.distance };
  }
  const hit = pickPost(origin, direction, posts);
  if (!hit) return null;
  const radius = posts.find((post) => post.seat === hit.seat)!.radius;
  if (surface && surface.distance < hit.distance - radius * 0.5) return null;
  return hit;
}
