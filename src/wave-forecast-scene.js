import { PORTALS, portalExit } from './routes.js';
import { PheromoneTrails } from './pheromone-trail.js';

export const speciesSymbols = {
  ant: '🐜',
  roach: '🪳',
  rat: '🐀',
  spider: '🕷',
  spiderling: '🕷',
  midge: '🪰',
  dart: '🪰➚',
  guard: '🪲',
  brute: '🐝',
  mosquito: '🦟',
};
export const entranceLabel = (group) => (group.ground ? 'S' : 'A') + (group.portalIndex + 1);

function dispose(group) {
  for (const child of [...group.children]) {
    child.geometry?.dispose();
    child.material?.map?.dispose();
    child.material?.dispose();
    group.remove(child);
  }
}

export class WaveForecastScene {
  constructor(T, scene, textLabel) {
    this.T = T;
    this.textLabel = textLabel;
    this.markers = new T.Group();
    this.lines = new T.Group();
    scene.add(this.markers, this.lines);
    this.trails = new PheromoneTrails(T, scene);
  }
  update(snap, candidate, now) {
    const prep = snap?.preparation;
    if (this.prepId !== prep?.id) {
      this.prepId = prep?.id;
      this.drawMarkers(prep?.groups || []);
      this.key = null;
      this.rendered = null;
      dispose(this.lines);
      this.trails.clear();
    }
    if (!prep || !this.entrances.length) return;
    this.trails.animate(now / 1000);
    let cmd = !candidate?.error && candidate?.command;
    if (
      cmd?.action === 'repair' ||
      (cmd?.action === 'remove' &&
        !snap.groundDefense.structures.some(
          (s) => s.id === cmd.id && ['barricade', 'bunker'].includes(s.kind),
        ))
    )
      cmd = null;
    // While walking, coalesce requests. The expensive navigation grid is built
    // off the render thread; stale snapshots and stale drafts never overwrite it.
    const key = [prep.id, snap.groundDefense.navigationRevision, JSON.stringify(cmd || null)].join(
      ':',
    );
    this.key = key;
    if (this.busy || this.rendered === key || now < (this.nextAt || 0)) return;
    if (!this.worker) {
      this.worker = new Worker(new URL('./wave-ground-worker.js', import.meta.url), {
        type: 'module',
      });
      this.worker.onmessage = ({ data }) => {
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
      groups: this.entrances,
      walls: snap.groundDefense.structures.filter((s) => ['barricade', 'bunker'].includes(s.kind)),
      command: cmd || null,
    });
  }
  drawMarkers(groups) {
    dispose(this.markers);
    const portals = new Map();
    for (const group of groups) {
      const id = entranceLabel(group);
      if (!portals.has(id)) portals.set(id, { group, symbols: new Set() });
      portals.get(id).symbols.add(speciesSymbols[group.type]);
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
  drawPaths(paths) {
    dispose(this.lines);
    this.trails.set(
      paths.filter((path) => path.points.length).map((path) => path.points),
      this.draft,
    );
    for (const path of paths) {
      if (path.points.length) continue;
      const label = this.textLabel('Passage fermé', '#ffb08f', 0.8);
      label.position.set(path.origin[0], path.origin[1] + 0.19, path.origin[2]);
      this.lines.add(label);
    }
  }
}
