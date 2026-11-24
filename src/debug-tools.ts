// Debug mode (« Debug : ON ») test tools, client side:
//  - two extra shop columns (P): « Mannequins » and « Ennemis réels », one card
//    per species, plus « Retirer les mannequins »;
//  - placement mode: aim, click (or E) to place one enemy, Échap to stop;
//  - the last damage taken by each dummy, in large print above it;
//  - every enemy's hit volume (wireframe), always on;
//  - turret (sphere + floor circle) and sugar (floor circle) ranges;
//  - every collision volume of the room (walls, furniture, fans, built
//    structures): wireframe edges over faintly tinted boxes.
// The server stays authoritative (labCommand 'place' / 'clear-dummies').
import type * as THREE from 'three/webgpu';
import { DEBUG_ENEMY_TYPES, type DebugEnemyKind } from './debug-enemies.ts';
import type { EnemyType, Three } from './types.ts';
import { ENEMY_POWER } from './waves.ts';

/** Hit volume as insect-hits.js tests it: ellipsoid or sphere proxy. */
export interface HitProxy {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
  userData: {
    hitEllipsoid?: number[];
    hitCentre?: number[];
    hitTolerance?: number;
    sphereRadius?: number;
  };
}
interface Structure {
  kind: string;
  id?: string;
  position?: [number, number];
  y?: number;
  radius?: number;
}
interface Profile {
  type: EnemyType;
  name: string;
  ground?: boolean;
  dummy?: unknown;
}
export interface DebugToolsOptions {
  T: Three;
  scene: THREE.Scene;
  document: Document;
  /** Places one enemy; resolves to false when refused. */
  command: (body: Record<string, unknown>) => Promise<boolean>;
  notify: (text: string, seconds?: number) => void;
  /** Aimed surface point (top faces only), or null. */
  aimSurface: () => THREE.Vector3 | null;
  camera: THREE.Camera;
  closeShop: () => void;
  names: Readonly<Record<EnemyType, string>>;
  grounded: Readonly<Record<EnemyType, boolean>>;
  symbols: Readonly<Record<string, string>>;
  sentryRange: number;
}
/** Colour of the room's collision volumes in debug mode (cyan, unlike hit volumes). */
export const COLLIDER_COLOR = 0x46d2ff;
/** Colour of the props' triangle colliders in debug mode (office-collision.ts). */
export const MESH_COLLIDER_COLOR = 0xffd23f;
/** Hover distance of a placed flyer in front of the camera, in metres. */
export const FLYER_HOVER_DISTANCE = 0.1;
/** Window of the cumulated damage shown under a dummy's last hit. */
export const DAMAGE_WINDOW_S = 3;
export const COLUMN_TITLES: Readonly<Record<DebugEnemyKind, string>> = Object.freeze({
  dummy: 'Mannequins',
  live: 'Ennemis réels',
});

// Last hit and recent total of one dummy, from its cumulated damage.
export class DamageMeter {
  last = 0;
  total = 0;
  hits: { at: number; amount: number }[] = [];
  seen = 0;
  // `damage` only grows (server and local predictions take the maximum).
  update(damage: number, now: number): boolean {
    let changed = false;
    if (damage > this.seen + 1e-9) {
      const amount = damage - this.seen;
      this.seen = damage;
      this.last = amount;
      this.hits.push({ at: now, amount });
      changed = true;
    }
    const before = this.hits.length;
    this.hits = this.hits.filter((h) => now - h.at <= DAMAGE_WINDOW_S);
    if (this.hits.length !== before) changed = true;
    this.total = this.hits.reduce((n, h) => n + h.amount, 0);
    return changed;
  }
}
export const formatDamage = (value: number): string =>
  String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

interface Label {
  sprite: THREE.Sprite;
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
  meter: DamageMeter;
  text: string;
}

export class DebugTools {
  T: Three;
  options: DebugToolsOptions;
  kind: DebugEnemyKind | null = null;
  type: EnemyType | null = null;
  busy = false;
  target: THREE.Vector3 | null = null;
  marker: THREE.Group;
  status: HTMLDivElement;
  hitboxes: THREE.InstancedMesh;
  ranges: THREE.Group;
  rangeKey = '';
  colliders: THREE.Group;
  colliderKey = '';
  labels = new Map<number, Label>();
  labelWave = -1;
  matrix: THREE.Matrix4;
  local: THREE.Matrix4;
  constructor(options: DebugToolsOptions) {
    const { T, scene, document } = options;
    this.T = T;
    this.options = options;
    this.matrix = new T.Matrix4();
    this.local = new T.Matrix4();
    // Placement marker: a floor ring and a vertical tick at the aimed point.
    this.marker = new T.Group();
    const ring = new T.Mesh(
      new T.RingGeometry(0.008, 0.011, 24).rotateX(-Math.PI / 2),
      new T.MeshBasicMaterial({ color: 0xd5ef73, depthTest: false, transparent: true }),
    );
    const tick = new T.Mesh(
      new T.CylinderGeometry(0.0008, 0.0008, 0.03, 6).translate(0, 0.015, 0),
      new T.MeshBasicMaterial({ color: 0xd5ef73, depthTest: false, transparent: true }),
    );
    this.marker.add(ring, tick);
    this.marker.renderOrder = 20;
    this.marker.visible = false;
    this.status = document.createElement('div');
    this.status.className = 'debugPlacement hidden';
    document.body.append(this.status);
    this.hitboxes = this.hitboxMesh(64);
    this.ranges = new T.Group();
    this.colliders = new T.Group();
    this.colliders.name = 'debug-colliders';
    scene.add(this.marker, this.hitboxes, this.ranges, this.colliders);
  }
  hitboxMesh(capacity: number): THREE.InstancedMesh {
    const T = this.T;
    const mesh = new T.InstancedMesh(
      new T.IcosahedronGeometry(1, 2),
      new T.MeshBasicMaterial({
        color: 0xff5ad2,
        wireframe: true,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
      capacity,
    );
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.renderOrder = 10;
    mesh.userData.projectileSolid = false;
    return mesh;
  }
  get active(): boolean {
    return !!this.kind;
  }

  // Shop columns (debug only): one card per species and kind.
  shopSections(): HTMLElement[] {
    const { document, names, symbols } = this.options;
    return (['dummy', 'live'] as const).map((kind) => {
      const section = document.createElement('section'),
        heading = document.createElement('h3');
      section.className = 'debugColumn';
      section.dataset.debug = kind;
      heading.textContent = COLUMN_TITLES[kind];
      section.append(heading);
      for (const type of DEBUG_ENEMY_TYPES) {
        const card = document.createElement('button'),
          picture = document.createElement('div'),
          title = document.createElement('h4');
        card.type = 'button';
        card.className = 'shopCard debugCard';
        card.dataset.debug = kind;
        card.dataset.enemy = type;
        picture.className = 'shopPicture';
        picture.textContent = symbols[type] || '?';
        title.textContent = names[type];
        const power = document.createElement('small');
        power.className = 'debugPower';
        power.textContent =
          'puissance ' + String(Math.round(ENEMY_POWER[type] * 100) / 100).replace('.', ',');
        card.append(picture, title, power);
        card.onclick = () => this.begin(kind, type);
        section.append(card);
      }
      if (kind === 'dummy') {
        const clear = document.createElement('button');
        clear.type = 'button';
        clear.className = 'shopCard debugCard debugClear';
        clear.textContent = 'Retirer les mannequins';
        clear.onclick = () => void this.clearDummies();
        section.append(clear);
      }
      return section;
    });
  }
  begin(kind: DebugEnemyKind, type: EnemyType): void {
    this.kind = kind;
    this.type = type;
    this.options.closeShop();
    this.render();
  }
  cancel(): void {
    this.kind = this.type = null;
    this.target = null;
    this.marker.visible = false;
    this.status.classList.add('hidden');
  }
  async clearDummies(): Promise<void> {
    if (await this.options.command({ action: 'clear-dummies' }))
      this.options.notify('Mannequins retirés', 2);
  }
  // Point where the chosen species would be placed: on the aimed surface for
  // walkers; in the air for flyers, in front of the camera (short of a surface).
  aim(): THREE.Vector3 | null {
    const { T, options } = this;
    if (!this.type) return null;
    const surface = options.aimSurface();
    if (options.grounded[this.type]) return surface;
    const origin = options.camera.getWorldPosition(new T.Vector3()),
      direction = options.camera.getWorldDirection(new T.Vector3());
    const distance = surface
      ? Math.min(FLYER_HOVER_DISTANCE, origin.distanceTo(surface) * 0.8)
      : FLYER_HOVER_DISTANCE;
    return origin.addScaledVector(direction, distance);
  }
  render(): void {
    if (!this.kind || !this.type) return;
    this.target = this.aim();
    this.marker.visible = !!this.target;
    if (this.target) this.marker.position.copy(this.target);
    const name = this.options.names[this.type];
    this.status.textContent =
      (this.kind === 'dummy' ? 'Mannequin' : 'Ennemi réel') +
      ' · ' +
      name +
      (this.target
        ? ' · Clic : poser'
        : this.options.grounded[this.type]
          ? ' · Visez le sol ou un meuble'
          : ' · Visez un point de la pièce') +
      ' · Échap : quitter';
    this.status.classList.remove('hidden');
  }
  async press(): Promise<void> {
    if (!this.kind || !this.type || this.busy) return;
    this.render();
    const p = this.target;
    if (!p) return;
    const camera = this.options.camera.getWorldPosition(new this.T.Vector3());
    this.busy = true;
    try {
      await this.options.command({
        action: 'place',
        kind: this.kind,
        type: this.type,
        p: [p.x, p.y, p.z],
        // A dummy faces the player who placed it.
        dir: [camera.x - p.x, camera.z - p.z],
      });
    } finally {
      this.busy = false;
    }
  }

  // Wireframe of every enemy's hit volume (insect-hits.js tolerance included).
  showHitboxes(models: Iterable<HitProxy>, enabled: boolean): void {
    if (!enabled) {
      this.hitboxes.count = 0;
      return;
    }
    const T = this.T;
    const list = [...models];
    if (list.length > this.hitboxes.instanceMatrix.count) {
      const old = this.hitboxes;
      this.hitboxes = this.hitboxMesh(Math.max(list.length, old.instanceMatrix.count * 2));
      old.parent?.add(this.hitboxes);
      old.removeFromParent();
      old.geometry.dispose();
      (old.material as THREE.Material).dispose();
      old.dispose();
    }
    let n = 0;
    const s = new T.Vector3();
    for (const model of list) {
      const u = model.userData,
        tolerance = u.hitTolerance || 1;
      if (u.hitEllipsoid) {
        const [cx, cy, cz] = u.hitCentre || [0, 0, 0];
        const [rx, ry, rz] = u.hitEllipsoid;
        this.matrix.compose(model.position, model.quaternion, model.scale);
        this.local
          .makeScale(rx * tolerance, ry * tolerance, rz * tolerance)
          .setPosition(cx, cy, cz);
        this.matrix.multiply(this.local);
      } else if (u.sphereRadius) {
        const r =
          ((u.sphereRadius * tolerance) / 1.2) *
          Math.max(Math.abs(model.scale.x), Math.abs(model.scale.y), Math.abs(model.scale.z));
        this.matrix.compose(model.position, model.quaternion, s.set(r, r, r));
      } else continue;
      this.hitboxes.setMatrixAt(n++, this.matrix);
    }
    this.hitboxes.count = n;
    this.hitboxes.instanceMatrix.needsUpdate = true;
  }

  // Collision volumes: boxes (one batch of edges and one of faces) and the
  // triangle colliders of the props (world triangles, 9 floats each; edges only,
  // in another colour).
  showColliders(
    boxes: readonly THREE.Box3[],
    enabled: boolean,
    meshes: readonly Float32Array[] = [],
  ): void {
    const T = this.T;
    let key = '';
    if (enabled) {
      let sum = 0;
      for (const b of boxes)
        sum += b.min.x + 3 * b.min.y + 7 * b.min.z + 11 * b.max.x + 13 * b.max.y + 17 * b.max.z;
      for (const t of meshes) sum += t.length + (t[0] ?? 0) + 3 * (t[t.length - 1] ?? 0);
      key = boxes.length + '/' + meshes.length + ':' + sum.toFixed(5);
    }
    if (key === this.colliderKey) return;
    this.colliderKey = key;
    for (const child of [...this.colliders.children]) {
      child.removeFromParent();
      const mesh = child as THREE.Mesh;
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      (mesh as unknown as THREE.InstancedMesh).dispose?.();
    }
    if (!enabled) return;
    if (meshes.length) {
      const segments: number[] = [];
      for (const t of meshes) {
        for (let i = 0; i < t.length; i += 9)
          for (const [a, b] of [
            [0, 3],
            [3, 6],
            [6, 0],
          ])
            segments.push(
              t[i + a],
              t[i + a + 1],
              t[i + a + 2],
              t[i + b],
              t[i + b + 1],
              t[i + b + 2],
            );
      }
      const geometry = new T.BufferGeometry();
      geometry.setAttribute('position', new T.Float32BufferAttribute(segments, 3));
      const wire = new T.LineSegments(
        geometry,
        new T.LineBasicMaterial({ color: MESH_COLLIDER_COLOR, transparent: true, opacity: 0.55 }),
      );
      wire.userData.projectileSolid = false;
      wire.frustumCulled = false;
      wire.renderOrder = 10;
      this.colliders.add(wire);
    }
    if (!boxes.length) return;
    const color = COLLIDER_COLOR;
    const faces = new T.InstancedMesh(
      new T.BoxGeometry(1, 1, 1),
      new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, depthWrite: false }),
      boxes.length,
    );
    const corners: number[] = [];
    const size = new T.Vector3(),
      centre = new T.Vector3(),
      matrix = new T.Matrix4();
    boxes.forEach((b, i) => {
      b.getSize(size).max(new T.Vector3(1e-4, 1e-4, 1e-4));
      b.getCenter(centre);
      faces.setMatrixAt(i, matrix.makeScale(size.x, size.y, size.z).setPosition(centre));
      const x = [b.min.x, b.max.x],
        y = [b.min.y, b.max.y],
        z = [b.min.z, b.max.z];
      for (const j of [0, 1])
        for (const k of [0, 1]) {
          corners.push(x[0], y[j], z[k], x[1], y[j], z[k]);
          corners.push(x[j], y[0], z[k], x[j], y[1], z[k]);
          corners.push(x[j], y[k], z[0], x[j], y[k], z[1]);
        }
    });
    faces.instanceMatrix.needsUpdate = true;
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(corners, 3));
    const edges = new T.LineSegments(
      geometry,
      new T.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }),
    );
    for (const o of [faces, edges]) {
      o.userData.projectileSolid = false;
      o.frustumCulled = false;
      o.renderOrder = 10;
    }
    this.colliders.add(faces, edges);
  }

  // Turret range (sphere + circle at its base) and sugar attraction (circle).
  showRanges(structures: readonly Structure[] | undefined, enabled: boolean): void {
    const T = this.T,
      list = enabled
        ? (structures || []).filter((s) => ['sentry', 'gatling', 'sugar'].includes(s.kind))
        : [];
    const key = JSON.stringify(list.map((s) => [s.kind, s.id, s.position, s.y, s.radius]));
    if (key === this.rangeKey) return;
    this.rangeKey = key;
    for (const child of [...this.ranges.children]) {
      child.removeFromParent();
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
      (mesh.material as THREE.Material)?.dispose();
    }
    for (const s of list) {
      if (!s.position) continue;
      const sentry = s.kind === 'sentry' || s.kind === 'gatling',
        radius = sentry ? this.options.sentryRange : s.radius || 0,
        color = sentry ? 0xff8a3d : 0xe9d487,
        y = s.y || 0;
      if (!(radius > 0)) continue;
      const ring = new T.Mesh(
        new T.RingGeometry(radius * 0.985, radius, 96).rotateX(-Math.PI / 2),
        new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }),
      );
      ring.position.set(s.position[0], y + 0.0015, s.position[1]);
      ring.userData.projectileSolid = false;
      this.ranges.add(ring);
      if (sentry) {
        // Same centre as fireGroundSentries: 2.5 cm above the turret's support.
        const bubble = new T.Mesh(
          new T.SphereGeometry(radius, 48, 24),
          new T.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.07,
            depthWrite: false,
            side: T.DoubleSide,
          }),
        );
        bubble.position.set(s.position[0], y + 0.025, s.position[1]);
        bubble.userData.projectileSolid = false;
        this.ranges.add(bubble);
      }
    }
  }

  // Large « −38 » above each dummy, with the total of the last 3 seconds.
  showDummyDamage(
    models: ReadonlyMap<number, HitProxy>,
    roster: readonly Profile[],
    damageOf: (index: number) => number,
    wave: number,
    now: number,
  ): void {
    if (wave !== this.labelWave) {
      for (const label of this.labels.values()) this.disposeLabel(label);
      this.labels.clear();
      this.labelWave = wave;
    }
    const seen = new Set<number>();
    for (const [index, model] of models) {
      const profile = roster[index];
      if (!profile?.dummy) continue;
      seen.add(index);
      let label = this.labels.get(index);
      if (!label) label = this.createLabel(index);
      label.meter.update(damageOf(index), now);
      const text = label.meter.hits.length
        ? '−' + formatDamage(label.meter.last) + '|3 s : ' + formatDamage(label.meter.total)
        : label.meter.seen > 0
          ? '−' + formatDamage(label.meter.last) + '|'
          : profile.name + '|';
      if (text !== label.text) this.drawLabel(label, text);
      const u = model.userData,
        top =
          (u.hitEllipsoid ? u.hitEllipsoid[1] + (u.hitCentre?.[1] || 0) : u.sphereRadius || 1) *
          Math.abs(model.scale.y);
      label.sprite.position.copy(model.position).y += top * 1.6 + 0.004;
    }
    for (const [index, label] of this.labels)
      if (!seen.has(index)) {
        this.disposeLabel(label);
        this.labels.delete(index);
      }
  }
  createLabel(index: number): Label {
    const T = this.T,
      canvas = this.options.document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const texture = new T.CanvasTexture(canvas);
    const sprite = new T.Sprite(
      new T.SpriteMaterial({ map: texture, depthTest: false, sizeAttenuation: false }),
    );
    sprite.scale.set(0.16, 0.08, 1);
    sprite.renderOrder = 30;
    sprite.userData.projectileSolid = false;
    this.options.scene.add(sprite);
    const label = { sprite, canvas, texture, meter: new DamageMeter(), text: '' };
    this.labels.set(index, label);
    return label;
  }
  drawLabel(label: Label, text: string): void {
    label.text = text;
    const [main, sub] = text.split('|');
    const g = label.canvas.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, 256, 128);
    g.textAlign = 'center';
    g.lineJoin = 'round';
    // Largest size (64 px) that fits the label's width.
    const fit = (weight: number, size: number, text: string): void => {
      g.font = `${weight} ${size}px system-ui, sans-serif`;
      const width = g.measureText(text).width;
      if (width > 236)
        g.font = `${weight} ${Math.floor((size * 236) / width)}px system-ui, sans-serif`;
    };
    fit(800, 64, main);
    g.lineWidth = 8;
    g.strokeStyle = '#1a1a1a';
    g.fillStyle = main.startsWith('−') ? '#ffd23d' : '#f2f2e6';
    g.strokeText(main, 128, 68);
    g.fillText(main, 128, 68);
    if (sub) {
      fit(700, 30, sub);
      g.lineWidth = 6;
      g.fillStyle = '#f2f2e6';
      g.strokeText(sub, 128, 112);
      g.fillText(sub, 128, 112);
    }
    label.texture.needsUpdate = true;
  }
  disposeLabel(label: Label): void {
    label.sprite.removeFromParent();
    label.sprite.material.dispose();
    label.texture.dispose();
  }
}
