// Boarding by aiming at the post itself (docs/ui-guidelines.md, « Monter dans un engin »):
// on the vehicles listed here, no ground circle marks the seats. The player aims at a
// post (cockpit, turret) and clicks; the server only checks that the player stands
// near the vehicle, from any side. Shared by the client and the Node server.
import type { Vec3Like } from './types.ts';

/** Vehicle types boarded by aiming at their posts. */
export const POINT_BOARDING: ReadonlySet<string> = new Set(['medbomber']);
export const pointBoarding = (type: string | null | undefined): boolean =>
  !!type && POINT_BOARDING.has(type);

/** Reach beyond the half-span, in reference metres, within which posts can be boarded. */
export const POST_REACH = 4;

/**
 * An aimable post, in the model's own units (root-local, as the Meshy rig data).
 * `radius` is the generous aiming sphere; `outline` names the highlighted part:
 * `meshes` are mesh names of the model, outlined on screen on hover
 * (src/post-highlight.ts); `clipRadius` keeps only what lies within that distance of
 * `local` (the part of a shared hull, such as the cockpit or a turret glazing).
 */
export interface SeatPost {
  seat: string;
  local: readonly [number, number, number];
  radius: number;
  outline: { meshes: readonly string[]; clipRadius?: number };
}

export const SEAT_POSTS: Readonly<Record<string, readonly SeatPost[]>> = Object.freeze({
  // B3 model (src/b3-model.js): pivots from meshy-b3-data.js. The cockpit and the
  // tail and ventral glazings are part of the hull: their outline is the hull
  // clipped around the post, plus the post's own gun.
  medbomber: [
    {
      seat: 'pilot',
      local: [0, 0.75, -3.4],
      radius: 1.15,
      outline: { meshes: ['meshy-b3-body'], clipRadius: 1.4 },
    },
    {
      seat: 'dorsal',
      local: [0.0029, 1.25, -0.5471],
      radius: 0.9,
      outline: { meshes: ['meshy-b3-dorsal', 'meshy-b3-dorsalGun'] },
    },
    {
      seat: 'tail',
      local: [0.0485, 0.7328, 4.3],
      radius: 0.9,
      outline: { meshes: ['meshy-b3-body', 'meshy-b3-tailGun'], clipRadius: 0.8 },
    },
    {
      seat: 'ventral',
      local: [0.0177, -0.95, 0.95],
      radius: 0.9,
      outline: { meshes: ['meshy-b3-body', 'meshy-b3-ventralGun'], clipRadius: 0.72 },
    },
  ],
});

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
