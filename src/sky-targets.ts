// What a shot can hit in Saint Pierre's sky (docs/purgatory-sky.md): the insects'
// souls of the queue, and Saint Pierre and the VIP guard (at their posts, or as
// souls in the queue once killed). Each target is a sphere in the world (office
// metres); the client reports hits with the 'purgatory-hit' command.
import type * as THREE from 'three/webgpu';
import { blastDamage } from './combat.ts';
import { InsectHitboxes } from './insect-hitboxes.ts';
import type { Rapier } from './physics-world.ts';
import type { Three } from './types.ts';

export type Vec3 = readonly [number, number, number];
export interface SkyTarget {
  /** 'soul': a soul of the queue (key: its id); 'staff': Saint Pierre or the guard at his post. */
  kind: 'soul' | 'staff';
  key: number | string;
  center: Vec3;
  radius: number;
  /** Saint Pierre's or the guard's: hurt by the damage (an insect's soul is freed by any hit). */
  staff: boolean;
}
/** A hit reported to the server: [kind, key, damage]. */
export type SkyHit = [SkyTarget['kind'], SkyTarget['key'], number];

/**
 * The targets of Saint Pierre's sky as volumes in a Rapier world (spheres, one per target,
 * moved onto the targets each frame): shots read them with a ray, blasts with a radius.
 */
export class SkyTargets {
  private boxes: InsectHitboxes;
  private proxies = new Map<string, THREE.Object3D>();
  private byKey = new Map<string, SkyTarget>();
  private T: Three;

  constructor(T: Three, R: Rapier) {
    this.T = T;
    this.boxes = new InsectHitboxes(T, R);
  }

  /** Brings the volumes in line with the targets of this frame. */
  sync(targets: readonly SkyTarget[]): void {
    this.byKey.clear();
    const models = new Map<string, THREE.Object3D>();
    for (const t of targets) {
      const key = t.kind + ':' + t.key;
      this.byKey.set(key, t);
      let proxy = this.proxies.get(key);
      if (!proxy) this.proxies.set(key, (proxy = new this.T.Object3D()));
      proxy.userData.hitEllipsoid = [t.radius, t.radius, t.radius];
      proxy.position.set(t.center[0], t.center[1], t.center[2]);
      models.set(key, proxy);
    }
    for (const key of this.proxies.keys()) if (!models.has(key)) this.proxies.delete(key);
    this.boxes.sync(models);
  }

  /** Nearest target along a bullet's step, within `far` (unit `dir`). */
  nearest(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    far: number,
  ): { target: SkyTarget; distance: number } | null {
    const hit = this.boxes.nearest(origin, dir, far);
    const target = hit && this.byKey.get(hit.id as string);
    return hit && target ? { target, distance: hit.distance } : null;
  }

  /** Hits of a blast at `point`: the usual blast damage, falling off to its edge. */
  blast(point: THREE.Vector3, radius: number): SkyHit[] {
    const hits: SkyHit[] = [];
    for (const { id, distance } of this.boxes.within(point, radius)) {
      const t = this.byKey.get(id as string);
      const damage = t ? blastDamage(distance, radius) : 0;
      if (t && damage > 0) hits.push([t.kind, t.key, damage]);
    }
    return hits;
  }
}
