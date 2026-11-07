import { VEHICLES } from './fleet.js';
import { SENTRY } from './ground-sentry.js';
import { FORTIFICATIONS } from './ground-fortifications.js';
import { distanceToSegment } from './ground-defense.js';
import { FIXED_DCA_AMMO, PISTOL_CAPACITY } from './ground-ammo.js';
import { ammoCapacity, FUEL_SECONDS, SERVICE_RADIUS, SERVICE_SECONDS } from './logistics.js';

export const SERVICE_RATES = Object.freeze({
  hp: 0.01,
  fuel: 1 / 60,
  machineGun: 0.001,
  shell: 0.1,
  bomb: 0.2,
  missile: 0.5,
});

export function ammoServiceRate(key) {
  if (key === 'missile') return SERVICE_RATES.missile;
  if (key === 'bomb') return SERVICE_RATES.bomb;
  if (['rocket', 'he', 'ap', 'proximity'].includes(key)) return SERVICE_RATES.shell;
  return SERVICE_RATES.machineGun;
}

// No landed/velocity checks: stations work for aircraft in flight.
function serviceSources(installations, fleet) {
  return [
    ...installations
      .filter((s) => s.kind === 'refuel')
      .map((s) => ({ p: [s.x, s.y, s.z], radius: SERVICE_RADIUS })),
    ...fleet
      .filter((s) => s.type === 'castor' && s.state.hp > 0)
      .map((s) => ({ p: s.state.p, radius: 0.5 })),
  ];
}

export function withinService(v, installations, fleet = []) {
  if (v.state.hp <= 0) return false;
  if (v.type === 'castor') return true;
  const sources = serviceSources(installations, fleet);
  return sources.some(
    ({ p, radius }) => Math.hypot(...v.state.p.map((n, i) => n - p[i])) <= radius,
  );
}

// Max-min fairness by dollars spent per recipient, not by number of guns.
export function fairServiceShares(needs, dollars) {
  const shares = needs.map(() => 0);
  let budget = Math.max(0, Number.isFinite(dollars) ? dollars : 0);
  let active = needs
    .map((cost, index) => ({ cost: Math.max(0, cost), index }))
    .filter((v) => v.cost > 0);
  while (active.length && budget > 1e-10) {
    const share = budget / active.length;
    const small = active.filter(({ cost, index }) => cost - shares[index] <= share);
    if (!small.length) {
      for (const { index } of active) shares[index] += share;
      break;
    }
    for (const { cost, index } of small) {
      const amount = Math.max(0, cost - shares[index]);
      shares[index] += amount;
      budget -= amount;
    }
    const done = new Set(small.map(({ index }) => index));
    active = active.filter(({ index }) => !done.has(index));
  }
  return shares;
}

// Server-only transaction: all sources and consumers share the same room budget.
// Called once per second by the authoritative room, never per client snapshot.
export function advancePaidService(
  fleet,
  installations,
  dollars,
  balance = {},
  seconds = 1,
  groundDefense = null,
  infantry = [],
) {
  const dt = Math.max(0, Math.min(5, Number.isFinite(seconds) ? seconds : 0));
  const jobs = [];
  for (const v of fleet) {
    v.supplies.servicing = withinService(v, installations, fleet);
    if (!v.supplies.servicing || !dt) continue;
    const needs = [];
    const maxHP = VEHICLES[v.type]?.maxHP || 100;
    const hp = Math.min(Math.max(0, maxHP - v.state.hp), maxHP * dt * 0.1);
    if (hp > 0)
      needs.push({ cost: hp * SERVICE_RATES.hp, apply: (f) => (v.state.hp += hp * f) });
    for (const key of ['engine', 'wing']) {
      if (!Number.isFinite(v.state[key])) continue;
      const change = Math.min(Math.max(0, 1 - v.state[key]), dt * 0.1);
      if (change > 0)
        needs.push({ cost: change, apply: (f) => (v.state[key] += change * f) });
    }
    const cap = FUEL_SECONDS * (balance.fuel ?? 1);
    const fuel = Math.min(Math.max(0, cap - v.supplies.fuel), (cap * dt) / SERVICE_SECONDS);
    if (fuel > 0)
      needs.push({ cost: fuel * SERVICE_RATES.fuel, apply: (f) => (v.supplies.fuel += fuel * f) });
    for (const [key, current] of Object.entries(v.supplies.ammo || {})) {
      const capAmmo = ammoCapacity(v.type, key, balance.ammo === undefined ? null : balance);
      const amount = Math.min(
        Math.max(0, capAmmo - current),
        (capAmmo * dt) / SERVICE_SECONDS,
      );
      if (amount > 0)
        needs.push({
          cost: amount * ammoServiceRate(key),
          apply: (f) => (v.supplies.ammo[key] += amount * f),
        });
    }
    const cost = needs.reduce((sum, n) => sum + n.cost, 0);
    if (cost > 0) jobs.push({ needs, cost, mark: () => v.supplies.revision++ });
  }
  // A character on foot only receives rounds at a physical service source.
  // The purgatories have no service stations; each new incarnation starts
  // with a finite magazine and must use the paperwork exit if it runs dry.
  if (dt && infantry.length) {
    const sources = serviceSources(installations, fleet);
    for (const { pilot, position } of infantry) {
      if (
        pilot.life !== 'alive' ||
        pilot.mode !== 'foot' ||
        !Array.isArray(position) ||
        !Number.isFinite(pilot.pistolAmmo)
      )
        continue;
      if (
        !sources.some(
          ({ p, radius }) =>
            Math.hypot(...position.map((n, i) => n - p[i])) <= radius,
        )
      )
        continue;
      const amount = Math.min(
        Math.max(0, PISTOL_CAPACITY - pilot.pistolAmmo),
        (PISTOL_CAPACITY * dt) / SERVICE_SECONDS,
      );
      const cost = amount * SERVICE_RATES.machineGun;
      if (cost > 0)
        jobs.push({
          cost,
          needs: [{ cost, apply: (fraction) => (pilot.pistolAmmo += amount * fraction) }],
          mark: () => {},
        });
    }
  }
  // Fixed DCA guns also compete for the same budget; no remote top-ups.
  // A shell requires a real supply source near the fixed emplacement.
  if (dt) {
    const sources = serviceSources(installations, fleet);
    for (const gun of installations) {
      const fortification = FORTIFICATIONS[gun.kind];
      const capacity = fortification?.ammo ?? FIXED_DCA_AMMO;
      if ((gun.kind !== 'dca' && !fortification) || !Number.isFinite(gun.ammo) || gun.ammo >= capacity || gun.hp === 0)
        continue;
      if (
        !sources.some(
          ({ p, radius }) =>
            Math.hypot(gun.x - p[0], gun.y - p[1], gun.z - p[2]) <= radius,
        )
      )
        continue;
      const quantity = Math.min(
        capacity - gun.ammo,
        (capacity * dt) / SERVICE_SECONDS,
      );
      const cost = quantity * (gun.kind === 'bunker' ? SERVICE_RATES.machineGun : SERVICE_RATES.shell);
      if (cost > 0)
        jobs.push({
          cost,
          needs: [{ cost, apply: (fraction) => (gun.ammo += quantity * fraction) }],
          mark: () => {},
        });
    }
  }
  // Barricades compete in the same fair, paid allocation as vehicles; the
  // nearest point of a segment (not just its center) must be within the
  // spherical service zone. Ruined segments (0 HP) stay ruined, preserving
  // ground navigation; rebuilding one requires a future explicit action.
  let wallsChanged = false;
  if (dt && groundDefense?.structures?.length) {
    const sources = serviceSources(installations, fleet);
    for (const wall of groundDefense.structures) {
      if (
        !['barricade', 'sentry', 'bunker', 'antitank'].includes(wall.kind) ||
        !Number.isFinite(wall.hp) ||
        !Number.isFinite(wall.maxHp) ||
        wall.hp <= 0 ||
        wall.hp >= wall.maxHp
      )
        continue;
      if (
        !sources.some(({ p, radius }) =>
          ['sentry', 'bunker', 'antitank'].includes(wall.kind)
            ? Math.hypot(wall.position[0] - p[0], p[1] - 0.025, wall.position[1] - p[2]) <= radius
            : Math.hypot(distanceToSegment([p[0], p[2]], wall.a, wall.b), p[1] - 0.01) <= radius,
        )
      )
        continue;
      const amount = Math.min(wall.maxHp - wall.hp, wall.maxHp * dt * 0.1);
      const cost = amount * SERVICE_RATES.hp;
      jobs.push({
        cost,
        needs: [
          {
            cost,
            apply: (fraction) => {
              wall.hp = Math.min(wall.maxHp, wall.hp + amount * fraction);
              wallsChanged = true;
            },
          },
        ],
        mark: () => {},
      });
    }
    for (const sentry of groundDefense.structures) {
      if (sentry.kind !== 'sentry' || sentry.hp <= 0 || sentry.ammo >= SENTRY.ammo) continue;
      if (!sources.some(({ p, radius }) =>
        Math.hypot(sentry.position[0] - p[0], p[1] - 0.025, sentry.position[1] - p[2]) <= radius,
      )) continue;
      const amount = Math.min(SENTRY.ammo - sentry.ammo, (SENTRY.ammo * dt) / SERVICE_SECONDS);
      const cost = amount * SERVICE_RATES.machineGun;
      if (cost > 0) jobs.push({
        cost,
        needs: [{ cost, apply: (fraction) => {
          sentry.ammo += amount * fraction;
          groundDefense.revision++;
        } }],
        mark: () => {},
      });
    }
  }
  const shares = fairServiceShares(jobs.map((job) => job.cost), dollars);
  let spent = 0;
  for (const [index, job] of jobs.entries()) {
    const paid = Math.min(job.cost, shares[index]);
    if (paid <= 0) continue;
    for (const need of job.needs) need.apply(paid / job.cost);
    job.mark();
    spent += paid;
  }
  if (wallsChanged) groundDefense.revision++;
  return {
    dollars: Math.round((dollars - spent) * 1e6) / 1e6,
    spent,
    recipients: jobs.length,
  };
}
