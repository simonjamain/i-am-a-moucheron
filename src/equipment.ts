import { footprintInsideCollider, footprintOverlapsCollider } from './oriented-collider.ts';
import { VEHICLES } from './fleet.ts';
import { FIXED_DCA } from './fixed-dca.ts';
import { MAP } from './scale.ts';
import type { Collider } from './oriented-collider.ts';
import type { VehicleProfile } from './fleet.ts';

/** A shop entry: a vehicle bought to place, or a fixed installation. */
export interface ShopItem {
  name: string;
  cost: number;
  kind: 'vehicle' | 'placement';
  description: string;
}
export const SHOP = Object.freeze({
  fighter: {
    name: 'Chasseur biplan supplémentaire',
    cost: 5,
    kind: 'vehicle',
    description: 'Achat à poser, en plus de la réserve gratuite.',
  },
  bomber: {
    name: 'Bombardier biplan supplémentaire',
    cost: 5,
    kind: 'vehicle',
    description: 'Pilote et mitrailleur, 30 bombes ; achat à poser.',
  },
  lightfighter: {
    name: 'Chasseur léger',
    cost: 15,
    kind: 'vehicle',
    description: 'Monoplace rapide, deux mitrailleuses de nez ; achat à poser.',
  },
  medbomber: {
    name: 'Bombardier moyen',
    cost: 15,
    kind: 'vehicle',
    description: 'Pilote et trois mitrailleurs, 50 bombes ; achat à poser.',
  },
  bed: {
    name: 'Lit de réapparition',
    cost: 15,
    kind: 'placement',
    description: 'Signez un contrat personnel au lit pour choisir votre retour après purgatoire.',
  },
  refuel: {
    name: 'Station de ravitaillement',
    cost: 20,
    kind: 'placement',
    description:
      'Répare et recharge automatiquement les véhicules proches, même en mouvement, contre paiement.',
  },
  radar: {
    name: 'Radar',
    cost: 10,
    kind: 'placement',
    description: 'Révèle les ennemis dans un cylindre de rayon 2 m sur la carte.',
  },
  dca: {
    name: 'Flak léger',
    cost: 5,
    kind: 'placement',
    description:
      'Canon fixe avec réserve de 120 obus, rechargeable automatiquement à proximité d’une station ou d’un Castor.',
  },
  dcaRapid: {
    name: 'DCA haute cadence',
    cost: 50,
    kind: 'placement',
    description: 'Quatre mitrailleuses du Spitfire en alternance, 1 000 balles partagées.',
  },
  dcaHeavy: {
    name: 'Flak lourd',
    cost: 30,
    kind: 'placement',
    description: 'Gros canon à fusée de proximité, un obus par seconde.',
  },
  interceptor: {
    name: 'Stuka d’attaque au sol',
    cost: 25,
    kind: 'vehicle',
    description: 'Un exemplaire avec 6 bombes ; remplacement payant après destruction.',
  },
  spitfire: {
    name: 'Spitfire',
    cost: 75,
    kind: 'vehicle',
    description:
      'Six mitrailleuses, 1 000 balles au total ; vitesse +75 %, rotation +45 %. Sans bombes.',
  },
  helicopter: {
    name: 'Hélicoptère d’attaque au sol',
    cost: 50,
    kind: 'vehicle',
    description: 'Deux postes, 200 PV, stationnaire assisté, 30 roquettes et 10 missiles guidés.',
  },
  flaktruck: {
    name: 'Anti-air mobile',
    cost: 15,
    kind: 'vehicle',
    description: 'Conducteur et canon de proximité, 100 obus ; fusée 0,5–20 m, armée à 0,3 s.',
  },
  tank: {
    name: 'Char moyen',
    cost: 5,
    kind: 'vehicle',
    description: 'Un exemplaire, trois postes indépendants ; toutes munitions limitées.',
  },
  castor: {
    name: 'Castor',
    cost: 15,
    kind: 'vehicle',
    description:
      'Camion monoplace rapide avec mitrailleuse et ravitaillement mobile dans un rayon de 50 cm.',
  },
  flyingcastor: {
    name: 'Castor volant',
    cost: 35,
    kind: 'vehicle',
    description:
      'Hélicoptère de soutien : un pilote et trois passagers, largue les constructions du Castor sauf les murs ; ravitaillement mobile 50 cm.',
  },
} satisfies Record<string, ShopItem>);
export type ShopKey = keyof typeof SHOP;
const SHOP_BY_KEY: Readonly<Record<string, ShopItem | undefined>> = SHOP;
const VEHICLE_BY_KEY: Readonly<Record<string, VehicleProfile | undefined>> = VEHICLES;
const FIXED_DCA_BY_KEY: Readonly<
  Record<string, (typeof FIXED_DCA)[keyof typeof FIXED_DCA] | undefined>
> = FIXED_DCA;
/** Room balance multipliers (only the price factor is read here). */
export interface PriceBalance {
  prices: number;
}
export function shopPrice(key: string, installed = 0, balance: PriceBalance | null = null): number {
  if (balance) return Math.round(shopPrice(key, installed) * balance.prices * 100) / 100;
  const item = SHOP_BY_KEY[key];
  if (!item) return Infinity;
  if (['dca', 'refuel', 'radar', 'bed'].includes(key))
    return key === 'dca'
      ? Math.min(40, item.cost + 2 * Math.max(0, installed))
      : item.cost + 2 * Math.max(0, installed);
  return item.cost;
}
export function placementAhead(
  body: { x: number; y: number; z: number; face: number },
  distance = 5,
): { x: number; y: number; z: number } {
  return {
    x: body.x + Math.sin(body.face) * MAP.metres(distance),
    y: body.y,
    z: body.z - Math.cos(body.face) * MAP.metres(distance),
  };
}
// The same footprint/support test runs in the browser and on the server's office
// colliders. Full base support, free headroom and nearby placement.
/** Candidate point; `angle` (yaw) is optional. */
export interface PlacementPoint {
  x: number;
  y: number;
  z: number;
  angle?: number;
}
/** An existing installation that blocks nearby placements. */
export interface OccupiedSpot {
  x: number;
  y: number;
  z: number;
  kind?: string;
  clearance?: number;
}
/** Footprint of a placement: centre, yaw, local half sizes and headroom (metres). */
export interface FootprintQuery {
  x: number;
  y: number;
  z: number;
  angle: number;
  rx: number;
  rz: number;
  height: number;
  /**
   * Vehicles rest on uneven decor (keys, fan blades, books): the support is the
   * highest contact under the hull and the headroom starts a little above it.
   */
  rugged?: boolean;
}
/**
 * The office pack props as placement support, on their real triangles (see
 * docs/collisions.md). The client answers with the decor's collision world; the
 * server trusts the height the client sent (decorTrust). With it, the props'
 * boxes (marked `decor`) no longer support nor block placements.
 */
export interface DecorSupport {
  /** Height of the decor surface carrying the whole footprint, or null. */
  surface(q: FootprintQuery): number | null;
  /** True when no decor stands in the headroom above `y`. */
  clear(q: FootprintQuery, y: number): boolean;
}
/** Collider that may be the box of a pack prop (layouts.ts marks them). */
type MaybeDecor = Collider & { decor?: boolean };
/**
 * Server side of DecorSupport: accepts the height `claimed` by the client when it
 * lies within the box of a prop under the footprint centre (clients are trusted).
 */
export function decorTrust(colliders: readonly Collider[], claimed: number): DecorSupport {
  return {
    surface: (q) =>
      Number.isFinite(claimed) &&
      (colliders as readonly MaybeDecor[]).some(
        (b) =>
          b.decor &&
          q.x >= b.min.x &&
          q.x <= b.max.x &&
          q.z >= b.min.z &&
          q.z <= b.max.z &&
          claimed >= b.min.y - 1e-4 &&
          claimed <= b.max.y + 1e-4,
      )
        ? claimed
        : null,
    clear: () => true,
  };
}
export function supportedPlacement(
  point: PlacementPoint,
  allColliders: readonly Collider[],
  occupied: readonly OccupiedSpot[] = [],
  kind = 'dca',
  decor?: DecorSupport,
): PlacementPoint | null {
  const colliders = decor
    ? (allColliders as readonly MaybeDecor[]).filter((b) => !b.decor)
    : allColliders;
  const profile = VEHICLE_BY_KEY[kind];
  const dca = FIXED_DCA_BY_KEY[kind];
  const localRx = profile
      ? MAP.metres(profile.span / 2 + 1)
      : kind === 'refuel'
        ? MAP.metres(6.1)
        : MAP.metres(kind === 'bed' ? 3 : (dca?.clearance ?? 2.1)),
    localRz = profile
      ? MAP.metres(profile.length / 2 + 1)
      : kind === 'refuel'
        ? MAP.metres(3.7)
        : MAP.metres(kind === 'bed' ? 2.1 : (dca?.clearance ?? 1.5)),
    height = MAP.metres(profile ? 4 : kind === 'refuel' ? 6.3 : (dca?.height ?? 3.2)),
    eps = 1e-5;
  const angle = Number.isFinite(point.angle) ? (point.angle as number) : 0;
  const rx = Math.abs(Math.cos(angle)) * localRx + Math.abs(Math.sin(angle)) * localRz;
  const rz = Math.abs(Math.sin(angle)) * localRx + Math.abs(Math.cos(angle)) * localRz;
  const query: FootprintQuery = {
    x: point.x,
    y: point.y,
    z: point.z,
    angle,
    rx: localRx,
    rz: localRz,
    height,
    ...(profile ? { rugged: true } : {}),
  };
  const boxSurfaces: { max: { y: number } }[] = colliders.filter(
    (box) =>
      point.x - rx >= box.min.x &&
      point.x + rx <= box.max.x &&
      point.z - rz >= box.min.z &&
      point.z + rz <= box.max.z &&
      (!box.oriented || footprintInsideCollider(box, point, localRx, localRz, angle)) &&
      box.max.y <= point.y + MAP.metres(2) &&
      box.max.y >= point.y - MAP.metres(6),
  );
  const decorY = decor?.surface(query);
  const surfaces =
    decorY != null && decorY <= point.y + MAP.metres(2) && decorY >= point.y - MAP.metres(6)
      ? [...boxSurfaces, { max: { y: decorY } }]
      : boxSurfaces;
  surfaces.sort((a, b) => b.max.y - a.max.y);
  for (const surface of surfaces) {
    const y = surface.max.y;
    const blocked = colliders.some(
      (box) =>
        box !== surface &&
        box.max.y > y + eps &&
        box.min.y < y + height &&
        box.max.x > point.x - rx &&
        box.min.x < point.x + rx &&
        box.max.z > point.z - rz &&
        box.min.z < point.z + rz &&
        (!box.oriented || footprintOverlapsCollider(box, point, localRx, localRz, angle)),
    );
    if (
      blocked ||
      (decor && !decor.clear(query, y)) ||
      occupied.some(
        (s) =>
          Math.abs(s.y - y) < height &&
          Math.hypot(s.x - point.x, s.z - point.z) <
            (s.clearance
              ? s.clearance + rx
              : kind === 'refuel' || s.kind === 'refuel'
                ? MAP.metres(6.3) + rx
                : Math.max(
                    MAP.metres(5),
                    rx + MAP.metres(FIXED_DCA_BY_KEY[s.kind ?? '']?.clearance ?? 0),
                  )),
      )
    )
      continue;
    return {
      x: point.x,
      y: y + 0.00005,
      z: point.z,
      ...(Number.isFinite(point.angle) ? { angle } : {}),
    };
  }
  return null;
}

// Include prepaid, unplaced installations in the next quote.
/** The part of a room snapshot that counts purchases. */
export interface PurchaseSnapshot {
  equipment?: readonly { kind: string; free?: boolean }[];
  deliveries?: readonly { item: string }[];
  pendingInstallations?: Partial<Record<string, number>>;
}
export function purchaseCount(snapshot: PurchaseSnapshot, kind: string): number {
  return (
    (snapshot.equipment || []).filter((e) => e.kind === kind && !e.free).length +
    (snapshot.deliveries || []).filter((d) => d.item === kind).length +
    (snapshot.pendingInstallations?.[kind] || 0)
  );
}
