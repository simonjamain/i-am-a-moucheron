import { PORTALS, portalExit } from './routes.ts';
import { activeLayout } from './layouts.ts';
import { PheromoneTrails } from './pheromone-trail.ts';
import type * as THREE from 'three/webgpu';
import type { EnemyType, Three } from './types.ts';
import type { GroundStructure } from './ground-defense-state.ts';
import type { PlacementPreview } from './ground-placement.ts';
import type { PredictedGroundPath } from './wave-ground-paths.ts';

/** Announced pack of the prepared wave (server/wave-preparation.js). */
export interface ForecastGroup {
  type: EnemyType;
  portalIndex: number;
  ground?: boolean;
}
/** Snapshot fields read by the forecast. */
export interface ForecastSnapshot {
  preparation?: { id: unknown; groups?: readonly ForecastGroup[] } | null;
  groundDefense: { navigationRevision: number; structures: readonly GroundStructure[] };
}
export type TextLabel = (text: string, color?: string, scale?: number) => THREE.Object3D;

export const speciesSymbols: Readonly<Record<EnemyType, string>> = {
  ant: '🐜',
  roach: '🪳',
  rat: '🐀',
  spider: '🕷',
  spiderling: '🕷',
  midge: '🪰',
  guard: '🐝',
  brute: '🪲🛡',
  mosquito: '🦟',
};
export const entranceLabel = (group: { ground?: boolean; portalIndex: number }): string =>
  (group.ground ? 'S' : 'A') + (group.portalIndex + 1);

type Disposable = THREE.Object3D & {
  geometry?: THREE.BufferGeometry;
  material?: THREE.Material & { map?: THREE.Texture | null };
};
function dispose(group: THREE.Object3D): void {
  for (const child of [...group.children] as Disposable[]) {
    child.geometry?.dispose();
    child.material?.map?.dispose();
    child.material?.dispose();
    group.remove(child);
  }
}

export class WaveForecastScene {
  T: Three;
  textLabel: TextLabel;
  markers: THREE.Group;
  lines: THREE.Group;
  trails: PheromoneTrails;
  prepId?: unknown;
  key?: string | null;
  rendered?: string | null;
  busy?: boolean;
  nextAt?: number;
  draft?: boolean;
  worker?: Worker;
  entrances!: ForecastGroup[];
  constructor(T: Three, scene: THREE.Object3D, textLabel: TextLabel) {
    this.T = T;
    this.textLabel = textLabel;
    this.markers = new T.Group();
    this.lines = new T.Group();
    scene.add(this.markers, this.lines);
    this.trails = new PheromoneTrails(T, scene);
  }
  update(
    snap: ForecastSnapshot | null | undefined,
    candidate: PlacementPreview | null | undefined,
    now: number,
  ): void {
    const prep = snap?.preparation;
    if (this.prepId !== prep?.id) {
      this.prepId = prep?.id;
      this.drawMarkers(prep?.groups || []);
      this.key = null;
      this.rendered = null;
      dispose(this.lines);
      this.trails.clear();
    }
    if (!snap || !prep || !this.entrances.length) return;
    this.trails.animate(now / 1000);
    let cmd = (!candidate?.error && candidate?.command) || null;
    if (
      cmd?.action === 'repair' ||
      (cmd?.action === 'remove' &&
        !snap.groundDefense.structures.some((s) => s.id === cmd!.id && s.kind === 'barricade'))
    )
      cmd = null;
    // While walking, coalesce requests. The expensive navigation grid is built
    // off the render thread; stale snapshots and stale drafts never overwrite it.
    const key = [
      prep.id,
      activeLayout().id,
      snap.groundDefense.navigationRevision,
      JSON.stringify(cmd || null),
    ].join(':');
    this.key = key;
    if (this.busy || this.rendered === key || now < (this.nextAt || 0)) return;
    if (!this.worker) {
      this.worker = new Worker(new URL('./wave-ground-worker.js', import.meta.url), {
        type: 'module',
      });
      this.worker.onmessage = ({
        data,
      }: MessageEvent<{ key: string; paths: PredictedGroundPath[] }>) => {
        this.busy = false;
        if (this.key !== data.key) return;
        this.rendered = data.key;
        this.drawPaths(data.paths);
      };
    }
    // Keep the colour paired with this exact request, including async replies.
    this.draft = !!cmd;
    this.busy = true;
    this.nextAt = now + 110;
    this.worker.postMessage({
      key,
      layout: activeLayout().id,
      groups: this.entrances,
      walls: snap.groundDefense.structures.filter((s) => s.kind === 'barricade'),
      command: cmd || null,
    });
  }
  drawMarkers(groups: readonly ForecastGroup[]): void {
    dispose(this.markers);
    const portals = new Map<string, { group: ForecastGroup; symbols: Set<string> }>();
    for (const group of groups) {
      const id = entranceLabel(group);
      if (!portals.has(id)) portals.set(id, { group, symbols: new Set() });
      portals.get(id)!.symbols.add(speciesSymbols[group.type]);
    }
    this.entrances = [];
    for (const [id, { group, symbols }] of portals) {
      const [x, y, z] = portalExit(PORTALS[group.ground ? 'ground' : 'air'][group.portalIndex]);
      const label = this.textLabel(
        id + '  ' + [...symbols].join(' '),
        group.ground ? '#f2d391' : '#a8d4ff',
        1,
      );
      label.position.set(x, y + 0.1, z);
      this.markers.add(label);
      if (group.ground) this.entrances.push(group);
    }
  }
  drawPaths(paths: readonly PredictedGroundPath[]): void {
    dispose(this.lines);
    this.trails.set(
      paths.filter((path) => path.points.length).map((path) => path.points),
      !!this.draft,
    );
    for (const path of paths) {
      if (path.points.length) continue;
      const label = this.textLabel('Passage fermé', '#ffb08f', 0.8);
      label.position.set(path.origin[0], path.origin[1] + 0.19, path.origin[2]);
      this.lines.add(label);
    }
  }
}
