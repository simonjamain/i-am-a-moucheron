import { WALL_SEGMENT, HALF_BRICK, wallLength, wallVisualRuns } from './brick-rules.ts';
import { createGroundModel } from './ground-model.ts';
import { ModelPreview } from './model-preview.ts';
import { groundPlacement, airdropPlacement } from './ground-placement.ts';
import { deliveryHeightAt } from './delivery.ts';
import { lengthPrice } from './ground-defense-state.ts';
import { BRICK_PITCH } from './brick-wall.ts';
import {
  sentryAimAngles,
  sentryAngleDelta,
  SENTRY_MUZZLE_HEIGHT,
  SENTRY_MIN_ELEVATION,
  SENTRY_MAX_ELEVATION,
} from './sentry-model.ts';
import {
  GATLING_MIN_ELEVATION,
  GATLING_MAX_ELEVATION,
  GATLING_MUZZLE_HEIGHT,
  GATLING_MAX_SPIN,
  stepGatlingSpin,
  firingBarrel,
} from './gatling-model.ts';
import { GATLING, isTurret } from './ground-sentry.ts';
import type * as THREE from 'three/webgpu';
import type { Three } from './types.ts';
import type { GroundDefenseState, GroundDrop, GroundStructure } from './ground-defense-state.ts';
import type { GroundPoint } from './ground-defense.ts';
import type { PlacementPreview } from './ground-placement.ts';
import type { GroundModelStructure } from './ground-model.ts';
import type { WallStructure } from './brick-rules.ts';
import type { Delivery } from './delivery.ts';
import type { SpinState } from './gatling-model.ts';

/** The DOM calls made here; tests pass a small fake document. */
interface UIDocument {
  createElement<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K];
  body: { append(...nodes: Node[]): void };
}
/** The Castor (ground truck or Castor volant) the player builds from. */
interface CastorBuilder {
  air?: boolean;
  grounded?: boolean;
  /** Rear point [x, z] where trails are laid. */
  rear: [number, number];
  direction?: number[];
  x: number;
  y: number;
  z: number;
  yaw?: number;
  landingY?: number;
}
interface FootState {
  grounded?: boolean;
  parachute?: unknown;
  x: number;
  y: number;
  z: number;
}
interface AimPoint {
  x: number;
  y: number;
  z: number;
}
/** The room snapshot fields read here. */
interface UISnapshot {
  code?: string;
  base?: { epoch?: number } | null;
  groundDefense: GroundDefenseState;
  dollars: number;
}
/** A preview or airdrop build command, as read for its pose. */
interface PreviewCommand {
  action?: string;
  kind?: string;
  id?: string;
  a?: number[];
  b?: number[] | null;
  angle?: number;
}
interface CommandShape {
  a: readonly number[];
  b?: readonly number[] | null;
  angle?: number;
}
interface FortificationPose {
  kind: string;
  x: number;
  y: number;
  z: number;
  angle: number;
}
/** An articulated turret (T-01 sentry or Gatling) kept alive across rebuilds. */
interface TurretView {
  kind: string;
  container: THREE.Group;
  yaw: THREE.Group;
  pitch: THREE.Group;
  lens: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  muzzle: THREE.Group;
  /** Gatling only. */
  barrel?: THREE.Group;
  spin?: THREE.Group;
  barrels?: THREE.Group[];
  spinState?: SpinState;
  targetYaw: number;
  targetPitch: number;
  recoil?: number;
  basePitchZ?: number;
  queued?: number;
  queuedTarget?: readonly number[];
  nextShotAt?: number;
  fireUntil?: number;
}
/** A falling drop as `deliveryHeightAt` reads it (`fromY` stands for `y`, `item` unused). */
type FallingDrop = GroundDrop & Delivery;
/** The traversed object fields `dispose` reads. */
interface DisposablePart {
  userData?: { meshyShared?: unknown; sharedMaterial?: unknown };
  isInstancedMesh?: boolean;
  dispose?: () => void;
  geometry?: { userData?: { shared?: unknown }; dispose(): void };
  material?: { userData?: { sharedMaterial?: unknown }; dispose(): void };
}
/** One continuous Gatling gunfire loop. */
interface GatlingSound {
  key: string;
  position: AimPoint;
  rate: number;
  level: number;
  distance: number;
}
interface GroundDefenseUIOptions {
  T: Three;
  scene: THREE.Object3D;
  document: UIDocument;
  command: (order: Record<string, unknown>) => Promise<unknown>;
  snapshot: () => UISnapshot | null | undefined;
  available: () => boolean;
  notify: (message: string, seconds: number) => void;
  releaseMouse: () => void;
  captureMouse: () => void;
  foot: () => FootState | null | undefined;
  aim?: () => AimPoint | null | undefined;
  builder?: () => CastorBuilder | null | undefined;
  fortificationModel?: (pose: FortificationPose) => THREE.Group | null | undefined;
  enabled: () => boolean;
  serverNow?: () => number;
}

// Barrel pivot height and elevation limits of each turret model.
const turretGeometry = (kind: string) =>
  kind === 'gatling'
    ? {
        height: GATLING_MUZZLE_HEIGHT,
        limits: { min: GATLING_MIN_ELEVATION, max: GATLING_MAX_ELEVATION },
      }
    : {
        height: SENTRY_MUZZLE_HEIGHT,
        limits: { min: SENTRY_MIN_ELEVATION, max: SENTRY_MAX_ELEVATION },
      };
// A Gatling keeps spinning (and its sound running) this long after its last round.
const GATLING_TAIL_MS = 250;
// Local pitch-pivot kick of one Gatling round, in model units (T-01: 0.003).
const GATLING_RECOIL = 0.014;
// One LEGO brick of the wall model (brick-wall.js), and the trail section bounds.
export { BRICK_PITCH };
export const TRAIL_MIN = 0.01;
export const TRAIL_MAX = 0.25;
export const trailBricks = (length: number): number =>
  Math.floor(Math.max(0, length) / BRICK_PITCH);

export class GroundDefenseUI {
  serverNow: () => number;
  drops: Map<string, THREE.Object3D>;
  dropModels: THREE.Group;
  foot: () => FootState | null | undefined;
  fortificationModel: GroundDefenseUIOptions['fortificationModel'];
  builder: () => CastorBuilder | null | undefined;
  trailAnchor: number[] | null;
  trailSequence: number;
  aim: GroundDefenseUIOptions['aim'];
  enabled: () => boolean;
  captureMouse: () => void;
  rotation: number;
  active: boolean;
  busy: boolean;
  T: Three;
  scene: THREE.Object3D;
  command: GroundDefenseUIOptions['command'];
  snapshot: GroundDefenseUIOptions['snapshot'];
  available: () => boolean;
  notify: GroundDefenseUIOptions['notify'];
  releaseMouse: () => void;
  mode: string;
  key: string;
  models: THREE.Group;
  sentries: Map<string, TurretView>;
  lastSentryFrame: number;
  tools: [string, string][];
  wheel: HTMLElement;
  dot: HTMLElement;
  status: HTMLButtonElement;
  previewModel: ModelPreview;
  preview: THREE.Group;
  dropLine: THREE.Line<THREE.BufferGeometry, THREE.LineDashedMaterial>;
  radial?: boolean;
  wheelSource?: string | null;
  dx?: number;
  dy?: number;
  sector?: number;
  anchor?: GroundPoint | null;
  candidate?: PlacementPreview | null;
  roomKey?: string;
  constructor({
    T,
    scene,
    document,
    command,
    snapshot,
    available,
    notify,
    releaseMouse,
    captureMouse,
    foot,
    aim,
    builder = () => null,
    fortificationModel,
    enabled,
    serverNow = () => Date.now(),
  }: GroundDefenseUIOptions) {
    this.serverNow = serverNow;
    this.drops = new Map(); // falling Castor volant constructions, by drop id
    this.dropModels = new T.Group();
    scene.add(this.dropModels);
    this.foot = foot;
    this.fortificationModel = fortificationModel;
    this.builder = builder;
    this.trailAnchor = null;
    this.trailSequence = 0;
    this.aim = aim;
    this.enabled = enabled;
    this.captureMouse = captureMouse;
    this.rotation = 0;
    this.active = false;
    this.busy = false;
    this.T = T;
    this.scene = scene;
    this.command = command;
    this.snapshot = snapshot;
    this.available = available;
    this.notify = notify;
    this.releaseMouse = releaseMouse;
    this.mode = 'barricade';
    this.key = '';
    this.models = new T.Group();
    this.sentries = new Map();
    this.lastSentryFrame = 0;
    scene.add(this.models);
    // Issue #135: no HUD "Défense" button or tool panel; the G / middle-click
    // wheel is the tool selector (and the only entry into building mode).
    this.tools = [
      ['barricade', 'Barricade'],
      ['sugar', 'Sucre'],
      ['sticky', 'Ruban'],
      ['repair', 'Réparer'],
      ['remove', 'Enlever'],
      ['sentry', 'Tourelle auto'],
      ['antitank', 'Canon anti-matériel'],
    ];
    this.wheel = document.createElement('div');
    this.wheel.style.cssText =
      'display:none;position:fixed;z-index:40;left:50%;top:50%;transform:translate(-50%,-50%);width:340px;height:340px;border-radius:50%;border:2px solid #cbdca3;pointer-events:none;color:white;text-align:center';
    this.tools.forEach(([, label], i) => {
      const angle = (i * 2 * Math.PI) / this.tools.length;
      const item = document.createElement('strong');
      item.textContent = label;
      item.style.cssText =
        'position:absolute;transform:translate(-50%,-50%);font-size:12px;left:' +
        (50 + 32 * Math.sin(angle)) +
        '%;top:' +
        (50 - 32 * Math.cos(angle)) +
        '%';
      this.wheel.append(item);
    });
    this.dot = document.createElement('span');
    this.dot.style.cssText =
      'position:absolute;width:8px;height:8px;border-radius:50%;background:white;transform:translate(-50%,-50%)';
    this.wheel.append(this.dot);
    document.body.append(this.wheel);
    this.status = document.createElement('button');
    this.status.style.cssText =
      'position:fixed;bottom:65px;left:50%;transform:translateX(-50%);z-index:18;padding:10px;display:none';
    this.status.onclick = () => this.press();
    document.body.append(this.status);
    this.previewModel = new ModelPreview(T, scene);
    this.preview = this.previewModel.root;
    this.preview.visible = false;
    // Castor volant: vertical guide from the helicopter to the landing point.
    this.dropLine = new T.Line(
      new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3(0, -1, 0)]),
      new T.LineDashedMaterial({
        color: 0xd5ef73,
        dashSize: 0.01,
        gapSize: 0.008,
        transparent: true,
        opacity: 0.8,
      }),
    );
    this.dropLine.computeLineDistances();
    this.dropLine.visible = false;
    scene.add(this.preview, this.dropLine);
  }
  openWheel(source = 'mouse'): boolean {
    if (this.radial || !this.available() || !this.enabled() || this.busy) return false;
    this.cancel();
    this.radial = true;
    this.wheelSource = source;
    this.dx = this.dy = 0;
    this.wheel.style.display = 'block';
    this.moveWheel(0, 0);
    return true;
  }
  moveWheel(dx: number, dy: number): void {
    this.dx! += dx;
    this.dy! += dy;
    const length = Math.hypot(this.dx!, this.dy!);
    if (length > 108) {
      this.dx! *= 108 / length;
      this.dy! *= 108 / length;
    }
    const n = this.tools.length;
    this.sector =
      length < 18
        ? -1
        : (Math.round((Math.atan2(this.dx!, -this.dy!) * n) / (2 * Math.PI)) + n) % n;
    this.dot.style.left = 120 + this.dx! + 'px';
    this.dot.style.top = 120 + this.dy! + 'px';
    const sectors = this.tools.map(
      (_, i) =>
        (i === this.sector ? '#53754d' : '#19352fee') +
        ' ' +
        (i * 360) / n +
        'deg ' +
        (((i + 1) * 360) / n - 1) +
        'deg, #90a78a ' +
        (((i + 1) * 360) / n - 1) +
        'deg ' +
        ((i + 1) * 360) / n +
        'deg',
    );
    this.wheel.style.background =
      'conic-gradient(from ' + -180 / n + 'deg,' + sectors.join(',') + ')';
  }
  finishWheel(source = 'mouse'): boolean {
    if (!this.radial || this.wheelSource !== source) return false;
    const index = this.sector!;
    this.radial = false;
    this.wheelSource = null;
    this.wheel.style.display = 'none';
    if (index >= 0 && this.available() && this.enabled()) this.selectTool(this.tools[index][0]);
    return true;
  }
  handleWheelKey(code: string, pressed: boolean, repeat = false): boolean | undefined {
    if (code !== 'KeyG') return false;
    if (pressed) {
      if (repeat) return this.radial && this.wheelSource === 'keyboard';
      return this.openWheel('keyboard');
    }
    if (!this.radial || this.wheelSource !== 'keyboard') return false;
    return this.finishWheel('keyboard');
  }
  // Enter building mode with one tool (Castor defenses: from its driving seat).
  selectTool(kind: string): boolean {
    if (kind === 'barricade' && this.builder()?.air) {
      this.notify('Le Castor volant ne largue pas de mur LEGO.', 3);
      return false;
    }
    if (['sentry', 'antitank'].includes(kind) && !this.builder()) {
      this.notify('Construisez cette défense depuis un Castor.', 3);
      return false;
    }
    this.anchor = null;
    this.trailAnchor = null;
    this.mode = kind;
    this.active = true;
    this.captureMouse();
    return true;
  }
  cancel(): void {
    this.trailAnchor = null;
    this.radial = false;
    this.wheelSource = null;
    this.wheel.style.display = 'none';
    this.active = false;
    this.anchor = null;
    this.preview.visible = false;
    this.dropLine.visible = false;
    this.status.style.display = 'none';
  }
  press(): void {
    if (!this.enabled() || this.busy) return;
    const castor = this.builder();
    if (castor?.air) {
      this.confirm();
      return;
    }
    if (castor && ['barricade', 'sticky'].includes(this.mode)) {
      if (this.trailAnchor) this.finishTrail(castor);
      else this.trailAnchor = castor.rear;
      return;
    }
    this.update();
    if (
      !this.anchor &&
      this.active &&
      this.candidate?.center &&
      ['barricade', 'sticky'].includes(this.mode)
    )
      this.anchor = this.candidate.center;
    else this.confirm();
  }
  async confirm(): Promise<void> {
    if (!this.active || this.busy || !this.enabled()) return;
    this.update();
    const candidate = this.candidate;
    if (!this.active || !candidate || candidate.error || candidate.startOnly) return;
    this.anchor = null;
    this.busy = true;
    try {
      const { id, ...body } = candidate.command!;
      await this.command({ ...body, ...(id ? { target: id } : {}) });
    } finally {
      this.busy = false;
    }
  }
  // Stopping keeps the section already laid behind the truck, billed pro rata.
  async finishTrail(castor: CastorBuilder): Promise<void> {
    const from = this.trailAnchor!;
    this.trailAnchor = null;
    this.previewModel.clear();
    const raw = Math.hypot(castor.rear[0] - from[0], castor.rear[1] - from[1]);
    const distance = this.mode === 'barricade' ? wallLength(raw) : raw;
    if (
      distance < (this.mode === 'barricade' ? HALF_BRICK : TRAIL_MIN) ||
      distance > TRAIL_MAX ||
      this.busy ||
      !this.enabled()
    )
      return;
    this.busy = true;
    try {
      await this.command({
        action: 'build',
        kind: this.mode,
        a: from,
        b: from.map((v, k) => v + ((castor.rear[k] - v) * distance) / raw),
        request: this.trailRequest(),
      });
    } finally {
      this.busy = false;
    }
  }
  trailRequest(): string {
    return (
      'castor:' +
      (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + ':' + ++this.trailSequence)
    );
  }
  async advanceTrail(): Promise<void> {
    const castor = this.builder();
    if (
      !castor ||
      !castor.grounded ||
      castor.y >= 0.025 ||
      !this.enabled() ||
      !this.trailAnchor ||
      this.busy
    )
      return;
    const from = this.trailAnchor;
    const distance = Math.hypot(castor.rear[0] - from[0], castor.rear[1] - from[1]);
    // Commit 48 mm LEGO / 20 cm tape sections (billed pro rata); the bricks in between are shown
    // one by one by the trail preview.
    const step = this.mode === 'barricade' ? WALL_SEGMENT : 0.2;
    if (distance + 1e-9 < step) return;
    if (distance > TRAIL_MAX) {
      this.trailAnchor = null;
      this.notify('Trajet de construction interrompu : trop éloigné.', 3);
      return;
    }
    const to = from.map((n, i) => n + ((castor.rear[i] - n) * Math.min(step, distance)) / distance);
    this.busy = true;
    try {
      const request = this.trailRequest();
      const accepted = await this.command({
        action: 'build',
        kind: this.mode,
        a: from,
        b: to,
        request,
      });
      if (accepted === false) this.trailAnchor = null;
      else this.trailAnchor = to;
    } finally {
      this.busy = false;
    }
  }
  update(): void {
    const snap = this.snapshot();
    if (!this.available() || (this.radial && !this.enabled())) this.cancel();
    const key = [snap?.code, snap?.base?.epoch, snap?.groundDefense?.revision].join(':');
    if (key !== this.key) {
      if (this.roomKey !== [snap?.code, snap?.base?.epoch].join(':')) {
        this.cancel();
        this.sentries.clear();
        this.lastSentryFrame = 0;
      }
      this.roomKey = [snap?.code, snap?.base?.epoch].join(':');
      this.key = key;
      this.rebuild(snap?.groundDefense?.structures || []);
    }
    this.updateSentryAim(snap);
    this.renderDrops(snap);
    this.preview.visible = false;
    this.dropLine.visible = false;
    this.status.style.display = this.active && this.enabled() ? 'block' : 'none';
    if (!this.active || !this.enabled()) {
      this.anchor = null;
      return;
    }
    if (this.trailAnchor && this.builder()) {
      this.candidate = null;
      this.status.disabled = false;
      const laid = this.showTrail(this.builder()!);
      this.status.textContent =
        'Castor · ' +
        (this.mode === 'sticky' ? 'ruban' : 'mur LEGO') +
        ' en continu · ' +
        laid.toFixed(2).replace('.', ',') +
        ' $ en cours · ' +
        (this.mode === 'barricade' ? '0,25 $ / 48 mm' : '1 $ / 20 cm') +
        ' au prorata · Cliquez pour arrêter';
      this.advanceTrail();
      return;
    }
    const builder = this.builder();
    if (builder?.air) {
      this.updateAirdrop(builder, snap!);
      return;
    }
    if (builder?.grounded && builder.y < 0.025 && this.mode === 'barricade' && !this.trailAnchor) {
      const a = builder.rear;
      const heading = builder.direction || [0, 1];
      const b = a.map((v, k) => v + heading[k] * WALL_SEGMENT);
      this.candidate = { center: a, startOnly: true };
      this.status.disabled = this.busy;
      this.status.textContent = 'Castor · Clic pour commencer · 0,25 $ / 48 mm · Échap : quitter';
      this.previewModel.show(
        'castor-wall-start',
        () =>
          createGroundModel(this.T, {
            kind: 'barricade',
            hp: 100,
            a: [-WALL_SEGMENT / 2, 0],
            b: [WALL_SEGMENT / 2, 0],
          } as GroundModelStructure),
        {
          x: (a[0] + b[0]) / 2,
          y: 0,
          z: (a[1] + b[1]) / 2,
          angle: -Math.atan2(heading[1], heading[0]),
        },
        true,
      );
      return;
    }
    const c = (this.candidate = groundPlacement({
      anchor: this.anchor,
      foot: this.foot(),
      aim: this.aim?.(),
      mode: this.mode,
      rotation: this.rotation,
      defense: snap!.groundDefense,
      dollars: snap!.dollars,
      castor: !!this.builder(),
    }));
    this.status.textContent =
      c.error ||
      (this.busy
        ? 'Envoi…'
        : `${this.anchor ? 'Clic pour terminer' : ['sticky', 'barricade'].includes(this.mode) ? 'Clic pour commencer' : 'Clic'} · ${this.mode === 'repair' ? 'Réparer' : this.mode === 'remove' ? 'Enlever' : 'Poser'} · ${c.price} $ · Échap : quitter`);
    this.status.disabled = !!c.error || this.busy;
    if (!c.center) return;
    const cmd = c.command as PreviewCommand | undefined;
    const target = (cmd?.id && snap!.groundDefense.structures.find((s) => s.id === cmd.id)) as
      GroundStructure | undefined;
    const kind = target?.kind || this.mode;
    if (['repair', 'remove'].includes(kind)) return;
    const shape = target || cmd;
    const a = shape?.a || c.center!;
    const b = shape?.b || (['barricade', 'sticky'].includes(kind) ? [a[0] + 0.024, a[1]] : null);
    const position = target?.position || (b ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : c.center!);
    const length = b ? Math.hypot(b[0] - a[0], b[1] - a[1]) : 0;
    const angle = b ? -Math.atan2(b[1] - a[1], b[0] - a[0]) : shape?.angle || 0;
    const previewKey = kind + ':' + length.toFixed(4);
    this.previewModel.show(
      previewKey,
      () => this.modelOf(kind, length, target?.radius),
      { x: position[0], y: 0, z: position[1], angle },
      !c.error,
    );
    if (c.startOnly) {
      this.status.textContent = 'Clic : fixer le début · Échap : quitter';
      this.status.disabled = this.busy;
    }
  }

  // A construction centred on the origin, for previews and falling drops.
  modelOf(kind: string, length = 0, radius = 0.15): THREE.Group | null | undefined {
    if (kind === 'antitank')
      return this.fortificationModel?.({ kind, x: 0, y: 0.00005, z: 0, angle: 0 });
    return createGroundModel(this.T, {
      kind,
      position: [0, 0],
      angle: 0,
      hp: 100,
      radius: radius || 0.15,
      a: [-length / 2, 0],
      b: [length / 2, 0],
    });
  }
  // Pose (centre, length, angle) of a build command, as previews draw it.
  static shapeOf(command: CommandShape): {
    position: readonly number[];
    length: number;
    angle: number;
  } {
    const { a, b } = command;
    if (!b) return { position: a, length: 0, angle: command.angle || 0 };
    return {
      position: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
      length: Math.hypot(b[0] - a[0], b[1] - a[1]),
      angle: -Math.atan2(b[1] - a[1], b[0] - a[0]),
    };
  }
  // Castor volant: see-through preview where the construction will land,
  // straight below the helicopter and turned like it, with a vertical guide.
  updateAirdrop(builder: CastorBuilder, snap: UISnapshot): void {
    const c = (this.candidate = airdropPlacement({
      builder,
      mode: this.mode,
      defense: snap.groundDefense,
      dollars: snap.dollars,
    }));
    const verb =
      this.mode === 'repair' ? 'Réparer' : this.mode === 'remove' ? 'Enlever' : 'Larguer';
    this.status.textContent =
      c.error || (this.busy ? 'Envoi…' : `Clic · ${verb} · ${c.price} $ · Échap : quitter`);
    this.status.disabled = !!c.error || this.busy;
    if (!Number.isFinite(c.landingY)) return;
    const line = this.dropLine;
    line.position.set(builder.x, builder.y, builder.z);
    line.scale.set(1, Math.max(1e-4, builder.y - c.landingY!), 1);
    line.visible = builder.y > c.landingY!;
    const cmd = c.command as PreviewCommand | undefined;
    if (cmd?.action !== 'build') return;
    const shape = GroundDefenseUI.shapeOf(cmd as CommandShape);
    this.previewModel.show(
      'air:' + cmd.kind + ':' + shape.length.toFixed(4),
      () => this.modelOf(cmd.kind!, shape.length),
      { x: shape.position[0], y: c.landingY!, z: shape.position[1], angle: shape.angle },
      !c.error,
    );
  }
  // Constructions dropped by a Castor volant, falling until the server builds them.
  renderDrops(snap: UISnapshot | null | undefined): void {
    const active = new Set<string>();
    const now = this.serverNow();
    for (const drop of (snap?.groundDefense?.drops || []) as FallingDrop[]) {
      active.add(drop.id);
      let model: THREE.Object3D | null | undefined = this.drops.get(drop.id);
      if (!model) {
        const shape = GroundDefenseUI.shapeOf(drop.command as CommandShape);
        model = this.modelOf(drop.kind, shape.length);
        if (!model) continue;
        model.userData.shape = shape;
        this.dropModels.add(model);
        this.drops.set(drop.id, model);
      }
      const { position, angle } = model.userData.shape;
      model.position.set(position[0], deliveryHeightAt(drop, now), position[1]);
      model.rotation.y = angle;
    }
    for (const [key, model] of this.drops)
      if (!active.has(key)) {
        this.dropModels.remove(model);
        GroundDefenseUI.dispose(model);
        this.drops.delete(key);
      }
  }

  // Live section between the last committed point and the truck's rear. The
  // brick count only grows by whole bricks, so bricks appear one at a time and
  // the instanced preview is rebuilt only when a brick is added.
  showTrail(castor: CastorBuilder): number {
    const a = this.trailAnchor!,
      b = castor.rear;
    const length = Math.min(TRAIL_MAX, Math.hypot(b[0] - a[0], b[1] - a[1]));
    const bricks =
      this.mode === 'barricade' ? Math.floor((length + 1e-9) / HALF_BRICK) : trailBricks(length);
    if (!bricks) {
      this.preview.visible = false;
      return 0;
    }
    const shown = bricks * (this.mode === 'barricade' ? HALF_BRICK : BRICK_PITCH);
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const end = [a[0] + Math.cos(angle) * shown, a[1] + Math.sin(angle) * shown];
    this.previewModel.show(
      'trail:' + this.mode + ':' + bricks,
      () =>
        createGroundModel(this.T, {
          kind: this.mode,
          position: [0, 0],
          angle: 0,
          hp: 100,
          a: [-shown / 2, 0],
          b: [shown / 2, 0],
        } as unknown as GroundModelStructure),
      { x: (a[0] + end[0]) / 2, y: 0, z: (a[1] + end[1]) / 2, angle: -angle },
      true,
    );
    return lengthPrice(this.mode, length);
  }

  updateSentryAim(snap: UISnapshot | null | undefined): void {
    const now = performance.now();
    const dt = this.lastSentryFrame ? Math.min(0.1, (now - this.lastSentryFrame) / 1000) : 1 / 60;
    this.lastSentryFrame = now;
    const weight = 1 - Math.exp(-12 * Math.max(0, dt));
    for (const structure of snap?.groundDefense?.structures || []) {
      if (!isTurret(structure.kind)) continue;
      const model = this.sentries.get(String(structure.id));
      if (!model) continue;
      const gatling = model.kind === 'gatling';
      const { height, limits } = turretGeometry(model.kind);
      if (
        structure.hp! > 0 &&
        Array.isArray(structure.aimTarget) &&
        structure.aimTarget.length === 3 &&
        structure.aimTarget.every(Number.isFinite)
      ) {
        const { yaw, pitch } = sentryAimAngles(
          [structure.position![0], (structure.y || 0) + height, structure.position![1]],
          structure.aimTarget,
          limits,
        );
        model.targetYaw = yaw - (structure.angle || 0);
        model.targetPitch = pitch;
      }
      model.yaw.rotation.y += sentryAngleDelta(model.yaw.rotation.y, model.targetYaw) * weight;
      // Short barrel recoil after each authoritative shot (issue #108).
      model.recoil = (model.recoil || 0) * Math.exp(-(gatling ? 30 : 18) * Math.max(0, dt));
      // The Gatling kicks its barrel assembly only; the whole head tilts with `pitch`.
      const kick = model.barrel || model.pitch;
      kick.position.z =
        (model.basePitchZ ??= kick.position.z) + model.recoil * (gatling ? GATLING_RECOIL : 0.003);
      model.pitch.rotation.x += (model.targetPitch - model.pitch.rotation.x) * weight;
      if (gatling) {
        // The whole bundle (barrels and collars) turns about the central axis;
        // it only winds up while rounds are really leaving the turret.
        stepGatlingSpin(model.spinState!, dt, structure.hp! > 0 && now < (model.fireUntil || 0));
        model.spin!.rotation.z = model.spinState!.angle;
      }
      model.lens.material.color.set(structure.ammo! > 0 ? '#1ecbd9' : '#87574c');
    }
  }
  // A Gatling effect from the server carries `shots` rounds for the last 250 ms:
  // they are released one by one at the weapon's cadence (see takeGatlingShots).
  noteGatlingBurst(
    id: string | number,
    shots = 1,
    target: readonly number[] | null = null,
    now = performance.now(),
  ): boolean {
    const model = this.sentries.get(String(id));
    if (model?.kind !== 'gatling') return false;
    model.queued = Math.min(6, (model.queued || 0) + Math.max(1, shots));
    if (target) model.queuedTarget = target;
    model.nextShotAt = Math.max(model.nextShotAt || 0, now);
    model.fireUntil = Math.max(
      model.fireUntil || 0,
      now + model.queued * GATLING.intervalMs + GATLING_TAIL_MS,
    );
    return true;
  }
  // Rounds due now: [{ id, target }]. At most two per call so a stalled frame never dumps a burst.
  takeGatlingShots(now = performance.now()): { id: string; target?: readonly number[] }[] {
    const due: { id: string; target?: readonly number[] }[] = [];
    for (const [id, model] of this.sentries) {
      if (model.kind !== 'gatling' || !model.queued) continue;
      let taken = 0;
      while (model.queued > 0 && now >= model.nextShotAt! && taken < 2) {
        model.queued--;
        taken++;
        due.push({ id, target: model.queuedTarget });
        model.nextShotAt! += GATLING.intervalMs;
      }
      if (now - model.nextShotAt! > 300) model.nextShotAt = now;
    }
    return due;
  }
  // Continuous gunfire loops: one per firing Gatling (the three nearest to the
  // listener), pitched and cadenced by the rotor speed, instead of a sound per round.
  gatlingSounds(
    listener: AimPoint | null | undefined,
    now = performance.now(),
    limit = 3,
  ): GatlingSound[] {
    const sounds: GatlingSound[] = [];
    for (const [id, model] of this.sentries) {
      if (model.kind !== 'gatling' || !(now < (model.fireUntil || 0))) continue;
      const p = model.container.position;
      const position = { x: p.x, y: p.y + GATLING_MUZZLE_HEIGHT, z: p.z };
      const spin = Math.min(1, model.spinState!.speed / GATLING_MAX_SPIN);
      sounds.push({
        key: 'gatling-' + id,
        position,
        rate: 0.55 + 0.45 * spin,
        level: 0.5 + 0.5 * spin,
        distance: listener
          ? Math.hypot(position.x - listener.x, position.y - listener.y, position.z - listener.z)
          : 0,
      });
    }
    return sounds.sort((a, b) => a.distance - b.distance).slice(0, limit);
  }
  // World position and direction of a turret's real muzzle, and recoil kick.
  sentryShot(
    id: string | number,
    target?: readonly number[] | null,
  ): { position: THREE.Vector3; direction: THREE.Vector3 } | null {
    const model = this.sentries.get(String(id));
    if (!model?.muzzle) return null;
    const T = this.T;
    const gatling = model.kind === 'gatling';
    const { height, limits } = turretGeometry(model.kind);
    if (target) {
      // Snap toward the server's target so the tracer leaves along the barrel.
      const origin = model.container.position;
      const angles = sentryAimAngles([origin.x, origin.y + height, origin.z], target, limits);
      if (angles) {
        model.targetYaw = angles.yaw - (model.container.rotation.y || 0);
        model.targetPitch = angles.pitch;
      }
    }
    model.recoil = gatling ? Math.min(1, (model.recoil || 0) + 0.6) : 1;
    model.container.updateMatrixWorld(true);
    // Each Gatling round leaves from the barrel that is at the top of the bundle.
    const node = gatling
      ? model.barrels![firingBarrel(model.spinState!.angle)] || model.muzzle
      : model.muzzle;
    const position = node.getWorldPosition(new T.Vector3());
    const direction = target
      ? new T.Vector3().fromArray(target).sub(position).normalize()
      : new T.Vector3(0, 0, -1).applyQuaternion(
          model.muzzle.getWorldQuaternion(new T.Quaternion()),
        );
    return { position, direction };
  }
  static dispose(model: THREE.Object3D): void {
    model.traverse((part: DisposablePart) => {
      // Meshy T-01 / howitzer geometry and atlases are shared by every copy.
      if (part.userData?.meshyShared) return;
      if (part.isInstancedMesh) part.dispose!();
      if (!part.geometry?.userData?.shared) part.geometry?.dispose();
      if (!part.userData?.sharedMaterial && !part.material?.userData?.sharedMaterial)
        part.material?.dispose();
    });
  }
  rebuild(structures: GroundStructure[]): void {
    // Keep articulated sentries alive across shot/ammo revisions. Rebuilding
    // dozens of meshes and resetting their pivots every 500 ms is expensive.
    const retained = new Map<string, TurretView>();
    for (const structure of structures) {
      if (!isTurret(structure.kind)) continue;
      const existing = this.sentries.get(String(structure.id));
      // An upgraded turret changes model: it is rebuilt below.
      if (!existing || existing.kind !== structure.kind) continue;
      existing.container.position.set(
        structure.position![0],
        structure.y || 0,
        structure.position![1],
      );
      existing.container.rotation.y = structure.angle || 0;
      retained.set(String(structure.id), existing);
    }
    const keep = new Set<THREE.Object3D>([...retained.values()].map((s) => s.container));
    this.sentries = retained;
    for (const child of [...this.models.children]) {
      if (keep.has(child)) continue;
      this.models.remove(child);
      GroundDefenseUI.dispose(child);
    }
    const T = this.T;
    for (const structure of [
      ...structures.filter((s) => s.kind !== 'barricade'),
      ...wallVisualRuns(structures as (GroundStructure & WallStructure)[]),
    ]) {
      // Occupied fortifications are already rendered with their articulated gun and operator.
      if (structure.kind === 'antitank') continue;
      if (isTurret(structure.kind) && this.sentries.has(String(structure.id))) continue;
      const group = createGroundModel(T, structure as unknown as GroundModelStructure);
      group.position.y += structure.y || 0; // dropped on furniture by a Castor volant
      if (group.userData.sentry)
        this.sentries.set(String(structure.id), {
          ...group.userData.sentry,
          kind: structure.kind,
          container: group,
          targetYaw: 0,
          targetPitch: 0,
        });
      this.models.add(group);
    }
  }
  drawRadar(
    ctx: CanvasRenderingContext2D,
    defense: { structures?: readonly GroundStructure[] } | null | undefined,
  ): void {
    for (const s of defense?.structures || []) {
      if (s.kind === 'antitank') {
        ctx.fillStyle = '#9eb9a0';
        ctx.fillRect(108 + s.position![0] / 0.04, 108 + (s.position![1] / 0.04) * 0.88, 7, 7);
      } else if (isTurret(s.kind)) {
        ctx.fillStyle = s.ammo! > 0 ? '#a0c89b' : '#6e6660';
        ctx.fillRect(108 + s.position![0] / 0.04, 108 + (s.position![1] / 0.04) * 0.88, 5, 5);
      } else if (s.kind === 'sugar') {
        ctx.strokeStyle = '#e9d487bb';
        ctx.beginPath();
        ctx.ellipse(
          110 + s.position![0] / 0.04,
          110 + (s.position![1] / 0.04) * 0.88,
          s.radius! / 0.04,
          (s.radius! / 0.04) * 0.88,
          0,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      } else {
        ctx.strokeStyle = s.kind === 'sticky' ? '#dccda8' : '#bca17a';
        ctx.lineWidth = s.kind === 'sticky' ? 2 : 3;
        ctx.beginPath();
        ctx.moveTo(110 + s.a![0] / 0.04, 110 + (s.a![1] / 0.04) * 0.88);
        ctx.lineTo(110 + s.b![0] / 0.04, 110 + (s.b![1] / 0.04) * 0.88);
        ctx.stroke();
        ctx.lineWidth = 1;
      }
    }
  }
}
