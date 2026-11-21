// Mesure de la puissance pratique des équipements (docs/stats.md).
//
// Unité commune : la puissance des ennemis (src/enemy-power.ts). Chaque dégât
// effectif crédite le poste qui l'a infligé de `dégâts / PV × puissance` de
// l'ennemi touché, sans « dernier coup » ni dégâts en trop. Le temps d'occupation
// des postes donne la puissance par minute de joueur, comparable entre véhicules à
// un ou plusieurs postes. Tout reste en RAM ; un fichier optionnel survit au
// redémarrage (STATS_FILE).
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { SHOP } from '../src/equipment.ts';
import { VEHICLES } from '../src/fleet.ts';

/** Salle de jeu : seul ce que le registre lit est utilisé. */
export type StatsRoom = Record<string, any>;

export interface SeatSample {
  item: string;
  seat: string;
  /** Puissance créditée pendant la vague. */
  power: number;
  air: number;
  ground: number;
  /** Secondes d'occupation du poste pendant la vague. */
  seconds: number;
  weapons: Record<string, number>;
  n: number;
  wave: number;
}
export interface ItemSample {
  item: string;
  /** Secondes pendant lesquelles au moins un poste était tenu. */
  vehicleSeconds: number;
  seats: number;
  bought: number;
  boughtDollars: number;
  serviceDollars: number;
  lost: number;
  n: number;
  wave: number;
}
export interface WaveSample {
  wave: number;
  n: number;
  power: number;
  killed: number;
  leaked: number;
  lost: boolean;
}
export interface VersionData {
  seats: SeatSample[];
  items: ItemSample[];
  waves: WaveSample[];
}
export interface StatsSource {
  item: string;
  seat: string;
  weapon: string;
}

/** Mesures en dessous de ce nombre de minutes de joueur : « données insuffisantes ». */
export const MIN_HUMAN_MINUTES = 10;
/** Écart au prix équitable au-delà duquel un équipement est jugé sous/sur-payé. */
export const FAIR_BAND = 0.3;
/** Étalon : le chasseur biplan gratuit, « joueur de base » de l'issue 210. */
export const BASELINE = { item: 'fighter', seat: 'pilot' };
const KEEP = { seats: 4000, items: 2000, waves: 1000 };

const SEAT_KEY = (item: string, seat: string) => item + '|' + seat;

interface SeatCell {
  power: number;
  air: number;
  ground: number;
  seconds: number;
  weapons: Record<string, number>;
}
interface ItemCell {
  vehicleSeconds: number;
  seats: number;
  bought: number;
  boughtDollars: number;
  serviceDollars: number;
  lost: number;
}
interface Accumulator {
  seats: Map<string, SeatCell>;
  items: Map<string, ItemCell>;
  markedAt: number;
}

const median = (sorted: number[], q: number) => {
  if (!sorted.length) return null;
  const at = (sorted.length - 1) * q,
    low = Math.floor(at),
    high = Math.ceil(at);
  return sorted[low] + (sorted[high] - sorted[low]) * (at - low);
};
const round = (value: number | null, digits = 3) =>
  value === null || !Number.isFinite(value) ? null : Number(value.toFixed(digits));

export function itemName(item: string): string {
  // Short vehicle names first: « supplémentaire » is shop wording, not an identity.
  const vehicle = (VEHICLES as Record<string, { name?: string }>)[item]?.name;
  if (vehicle) return vehicle;
  const named = (SHOP as Record<string, { name?: string }>)[item]?.name;
  if (named) return named;
  const special: Record<string, string> = {
    pistol: 'Pistolet (à pied)',
    sentry: 'Tourelle automatique du Castor',
    bunker: 'Bunker LEGO',
    antitank: 'Canon antichar',
  };
  return special[item] || item;
}

export class StatsLedger {
  version: number;
  file: string | null;
  since: number;
  data: Record<string, VersionData> = {};
  private acc = new WeakMap<object, Accumulator>();
  private dirty = false;
  private savedAt = 0;

  constructor({ version = 0, file = null }: { version?: number; file?: string | null } = {}) {
    this.version = version;
    this.file = file;
    this.since = Date.now();
    if (file) this.load();
  }

  private mine(): VersionData {
    return (this.data[String(this.version)] ??= { seats: [], items: [], waves: [] });
  }
  private room(r: StatsRoom, now = 0): Accumulator {
    let a = this.acc.get(r);
    if (!a) this.acc.set(r, (a = { seats: new Map(), items: new Map(), markedAt: now }));
    return a;
  }
  private seatCell(r: StatsRoom, item: string, seat: string): SeatCell {
    const map = this.room(r).seats,
      key = SEAT_KEY(item, seat);
    let cell = map.get(key);
    if (!cell) map.set(key, (cell = { power: 0, air: 0, ground: 0, seconds: 0, weapons: {} }));
    return cell;
  }
  private itemCell(r: StatsRoom, item: string): ItemCell {
    const map = this.room(r).items;
    let cell = map.get(item);
    if (!cell)
      map.set(
        item,
        (cell = {
          vehicleSeconds: 0,
          seats: 1,
          bought: 0,
          boughtDollars: 0,
          serviceDollars: 0,
          lost: 0,
        }),
      );
    return cell;
  }

  /** Puissance créditée à un poste, par catégorie de cible. */
  credit(r: StatsRoom, source: StatsSource, power: number, target: 'air' | 'ground') {
    if (!(power > 0)) return;
    const cell = this.seatCell(r, source.item, source.seat);
    cell.power += power;
    cell[target] += power;
    cell.weapons[source.weapon] = (cell.weapons[source.weapon] || 0) + power;
  }
  /** Secondes écoulées depuis le dernier appel (0 si la salle n'était pas suivie). */
  step(r: StatsRoom, now: number, tracking: boolean): number {
    const a = this.room(r, now),
      dt = Math.min(2000, Math.max(0, now - a.markedAt)) / 1000;
    a.markedAt = now;
    return tracking ? dt : 0;
  }
  occupy(r: StatsRoom, item: string, seat: string, seconds: number) {
    this.seatCell(r, item, seat).seconds += seconds;
  }
  vehicleTime(r: StatsRoom, item: string, seats: number, seconds: number) {
    const cell = this.itemCell(r, item);
    cell.vehicleSeconds += seconds;
    cell.seats = seats;
  }
  purchase(r: StatsRoom, item: string, dollars: number) {
    const cell = this.itemCell(r, item);
    cell.bought++;
    cell.boughtDollars += dollars;
  }
  service(r: StatsRoom, item: string, dollars: number) {
    if (dollars > 0) this.itemCell(r, item).serviceDollars += dollars;
  }
  loss(r: StatsRoom, item: string) {
    this.itemCell(r, item).lost++;
  }

  /** Fin de vague : les compteurs de la salle deviennent des échantillons. */
  flush(r: StatsRoom, wave: WaveSample) {
    const a = this.room(r),
      mine = this.mine(),
      { n } = wave;
    for (const [key, cell] of a.seats) {
      if (!cell.power && !cell.seconds) continue;
      const [item, seat] = key.split('|');
      mine.seats.push({ item, seat, n, wave: wave.wave, ...cell });
    }
    for (const [item, cell] of a.items) {
      if (!cell.vehicleSeconds && !cell.bought && !cell.serviceDollars && !cell.lost) continue;
      mine.items.push({ item, n, wave: wave.wave, ...cell });
    }
    mine.waves.push(wave);
    a.seats.clear();
    a.items.clear();
    for (const list of ['seats', 'items', 'waves'] as const)
      if (mine[list].length > KEEP[list]) mine[list].splice(0, mine[list].length - KEEP[list]);
    this.dirty = true;
    this.save();
  }
  /** Vide l'accumulateur d'une salle réinitialisée, sans l'enregistrer. */
  discard(r: StatsRoom) {
    this.acc.delete(r);
  }

  // ---------------------------------------------------------------- rapport

  report(filter: { version?: number; n?: string; wave?: string } = {}) {
    const version = filter.version ?? this.version,
      data = this.data[String(version)] ?? { seats: [], items: [], waves: [] };
    const inN = (n: number) => {
      const bucket = filter.n;
      if (!bucket || bucket === 'all') return true;
      const [low, high] = bucket.split('-').map(Number);
      return n >= low && n <= (high || Infinity);
    };
    const inWave = (wave: number) => {
      const bucket = filter.wave;
      if (!bucket || bucket === 'all') return true;
      const [low, high] = bucket.split('-').map(Number);
      return wave >= low && wave <= (high || Infinity);
    };
    const seats = data.seats.filter((s) => inN(s.n) && inWave(s.wave)),
      items = data.items.filter((s) => inN(s.n) && inWave(s.wave)),
      waves = data.waves.filter((s) => inN(s.n) && inWave(s.wave));

    // Poste par poste : puissance par minute de joueur, pondérée et dispersée.
    const bySeat = new Map<string, SeatSample[]>();
    for (const s of seats) {
      const key = SEAT_KEY(s.item, s.seat);
      bySeat.set(key, [...(bySeat.get(key) || []), s]);
    }
    const rows = [...bySeat.entries()].map(([key, list]) => {
      const [item, seat] = key.split('|');
      const power = list.reduce((n, s) => n + s.power, 0),
        seconds = list.reduce((n, s) => n + s.seconds, 0),
        air = list.reduce((n, s) => n + s.air, 0),
        ground = list.reduce((n, s) => n + s.ground, 0);
      const rates = list
        .filter((s) => s.seconds >= 20)
        .map((s) => s.power / (s.seconds / 60))
        .sort((a, b) => a - b);
      const weapons: Record<string, number> = {};
      for (const s of list)
        for (const [w, p] of Object.entries(s.weapons)) weapons[w] = (weapons[w] || 0) + p;
      return {
        item,
        name: itemName(item),
        seat,
        samples: list.length,
        humanMinutes: seconds / 60,
        power,
        air,
        ground,
        rate: seconds > 0 ? power / (seconds / 60) : null,
        p25: median(rates, 0.25),
        median: median(rates, 0.5),
        p75: median(rates, 0.75),
        weapons,
        enough: seconds / 60 >= MIN_HUMAN_MINUTES,
      };
    });
    const baseline = rows.find((x) => x.item === BASELINE.item && x.seat === BASELINE.seat),
      baseRate = baseline?.enough ? baseline.rate : null;

    // Équipement par équipement : coût réel, occupation et efficacité par dollar.
    const byItem = new Map<string, ItemSample[]>();
    for (const s of items) byItem.set(s.item, [...(byItem.get(s.item) || []), s]);
    const itemRows = [...new Set([...byItem.keys(), ...rows.map((x) => x.item)])].map((item) => {
      const list = byItem.get(item) || [],
        mine = rows.filter((x) => x.item === item);
      const vehicleSeconds = list.reduce((n, s) => n + s.vehicleSeconds, 0),
        seatCount = list.at(-1)?.seats ?? 1,
        boughtDollars = list.reduce((n, s) => n + s.boughtDollars, 0),
        serviceDollars = list.reduce((n, s) => n + s.serviceDollars, 0),
        power = mine.reduce((n, x) => n + x.power, 0),
        humanSeconds = mine.reduce((n, x) => n + x.humanMinutes * 60, 0);
      const cost = boughtDollars + serviceDollars,
        price = (SHOP as Record<string, { cost: number }>)[item]?.cost ?? null;
      return {
        item,
        name: itemName(item),
        price,
        seats: seatCount,
        vehicleMinutes: vehicleSeconds / 60,
        occupancy: vehicleSeconds > 0 ? humanSeconds / (vehicleSeconds * seatCount) : null,
        bought: list.reduce((n, s) => n + s.bought, 0),
        boughtDollars,
        serviceDollars,
        lost: list.reduce((n, s) => n + s.lost, 0),
        power,
        humanMinutes: humanSeconds / 60,
        powerPerDollar: boughtDollars > 0 && cost > 0 ? power / cost : null,
        enough: humanSeconds / 60 >= MIN_HUMAN_MINUTES,
      };
    });
    const ratios = itemRows
      .filter((x) => x.enough && x.powerPerDollar !== null)
      .map((x) => x.powerPerDollar as number)
      .sort((a, b) => a - b);
    const reference = median(ratios, 0.5);
    const baseCost = (SHOP as Record<string, { cost: number }>)[BASELINE.item]?.cost ?? 1;
    const itemsOut = itemRows
      .map((x) => {
        const fair =
          x.enough && x.powerPerDollar !== null && reference ? x.powerPerDollar / reference : null;
        const status = !x.enough
          ? 'insuffisant'
          : fair === null
            ? 'gratuit'
            : fair > 1 + FAIR_BAND
              ? 'sous-payé'
              : fair < 1 - FAIR_BAND
                ? 'sur-payé'
                : 'aligné';
        return {
          ...x,
          priceRelative: x.price === null ? null : round(x.price / baseCost),
          fairRatio: round(fair),
          fairPrice: fair !== null && x.price !== null ? round(x.price * fair, 1) : null,
          status,
          occupancy: round(x.occupancy),
          powerPerDollar: round(x.powerPerDollar),
          vehicleMinutes: round(x.vehicleMinutes, 1),
          humanMinutes: round(x.humanMinutes, 1),
          power: round(x.power, 2),
        };
      })
      .sort((a, b) => (b.fairRatio ?? -1) - (a.fairRatio ?? -1));

    const rowsOut = rows
      .map((x) => ({
        ...x,
        index: baseRate && x.enough && x.rate !== null ? round(x.rate / baseRate) : null,
        rate: round(x.rate),
        p25: round(x.p25),
        median: round(x.median),
        p75: round(x.p75),
        humanMinutes: round(x.humanMinutes, 1),
        power: round(x.power, 2),
        air: round(x.air, 2),
        ground: round(x.ground, 2),
        weapons: Object.fromEntries(
          Object.entries(x.weapons).map(([w, p]) => [w, round(p, 2) as number]),
        ),
      }))
      .sort((a, b) => (b.index ?? -1) - (a.index ?? -1));

    const wavePower = waves.reduce((n, w) => n + w.power, 0);
    return {
      version,
      versions: Object.keys(this.data)
        .map(Number)
        .sort((a, b) => b - a),
      since: this.since,
      generatedAt: Date.now(),
      filter: { n: filter.n || 'all', wave: filter.wave || 'all' },
      constants: { minHumanMinutes: MIN_HUMAN_MINUTES, fairBand: FAIR_BAND, baseline: BASELINE },
      waves: {
        count: waves.length,
        power: round(wavePower, 1),
        killed: round(
          waves.reduce((n, w) => n + w.killed, 0),
          1,
        ),
        leaked: round(
          waves.reduce((n, w) => n + w.leaked, 0),
          1,
        ),
        lost: waves.filter((w) => w.lost).length,
      },
      rows: rowsOut,
      items: itemsOut,
    };
  }

  // ------------------------------------------------------------ persistance

  save(force = false) {
    if (!this.file || !this.dirty) return;
    const now = Date.now();
    if (!force && now - this.savedAt < 30_000) return;
    this.savedAt = now;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const temporary = this.file + '.tmp';
      writeFileSync(temporary, JSON.stringify({ format: 1, since: this.since, data: this.data }));
      renameSync(temporary, this.file);
      this.dirty = false;
    } catch (error) {
      // Les statistiques ne doivent jamais gêner le jeu.
      console.error('stats: écriture impossible', (error as Error).message);
    }
  }
  private load() {
    try {
      const saved = JSON.parse(readFileSync(this.file as string, 'utf8'));
      if (saved?.format === 1 && saved.data && typeof saved.data === 'object') {
        this.data = saved.data;
        if (Number.isFinite(saved.since)) this.since = saved.since;
      }
    } catch {
      // Premier démarrage ou fichier illisible : on repart de zéro.
    }
  }
}
