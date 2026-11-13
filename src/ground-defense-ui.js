import { WALL_SEGMENT, HALF_BRICK, wallLength, wallVisualRuns } from './brick-rules.js';
import { createGroundModel } from './ground-model.js';
import { ModelPreview } from './model-preview.js';
import { AirTrails } from './air-trails.js';
import { groundPlacement, airdropPlacement } from './ground-placement.js';
import { deliveryHeightAt } from './delivery.js';
import { lengthPrice } from './ground-defense-state.js';
import { BRICK_PITCH } from './brick-wall.js';
import { sentryAimAngles, sentryAngleDelta, SENTRY_MUZZLE_HEIGHT } from './sentry-model.js';
// One LEGO brick of the wall model (brick-wall.js), and the trail section bounds.
export { BRICK_PITCH };
export const TRAIL_MIN = 0.01;
export const TRAIL_MAX = 0.25;
export const trailBricks = (length) => Math.floor(Math.max(0, length) / BRICK_PITCH);

export class GroundDefenseUI {
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
  }) {
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
    this.airTrails = new AirTrails(T, scene);
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
      ['fan', 'Ventilateur'],
      ['sentry', 'Tourelle auto'],
      ['bunker', 'Bunker LEGO'],
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
    this.fanArrow = new T.ArrowHelper(
      new T.Vector3(0, 0, 1),
      new T.Vector3(),
      0.08,
      0x92effd,
      0.025,
      0.017,
    );
    this.fanArrow.visible = false;
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
    scene.add(this.preview, this.fanArrow, this.dropLine);
  }
  openWheel(source = 'mouse') {
    if (this.radial || !this.available() || !this.enabled() || this.busy) return false;
    this.cancel();
    this.radial = true;
    this.wheelSource = source;
    this.dx = this.dy = 0;
    this.wheel.style.display = 'block';
    this.moveWheel(0, 0);
    return true;
  }
  moveWheel(dx, dy) {
    this.dx += dx;
    this.dy += dy;
    const length = Math.hypot(this.dx, this.dy);
    if (length > 108) {
      this.dx *= 108 / length;
      this.dy *= 108 / length;
    }
    const n = this.tools.length;
    this.sector =
      length < 18 ? -1 : (Math.round((Math.atan2(this.dx, -this.dy) * n) / (2 * Math.PI)) + n) % n;
    this.dot.style.left = 120 + this.dx + 'px';
    this.dot.style.top = 120 + this.dy + 'px';
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
  finishWheel(source = 'mouse') {
    if (!this.radial || this.wheelSource !== source) return false;
    const index = this.sector;
    this.radial = false;
    this.wheelSource = null;
    this.wheel.style.display = 'none';
    if (index >= 0 && this.available() && this.enabled()) this.selectTool(this.tools[index][0]);
    return true;
  }
  handleWheelKey(code, pressed, repeat = false) {
    if (code !== 'KeyG') return false;
    if (pressed) {
      if (repeat) return this.radial && this.wheelSource === 'keyboard';
      return this.openWheel('keyboard');
    }
    if (!this.radial || this.wheelSource !== 'keyboard') return false;
    return this.finishWheel('keyboard');
  }
  // Enter building mode with one tool (Castor defenses: from its driving seat).
  selectTool(kind) {
    if (kind === 'barricade' && this.builder()?.air) {
      this.notify('Le Castor volant ne largue pas de mur LEGO.', 3);
      return false;
    }
    if (['sentry', 'bunker', 'antitank'].includes(kind) && !this.builder()) {
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
  cancel() {
    this.trailAnchor = null;
    this.radial = false;
    this.wheelSource = null;
    this.wheel.style.display = 'none';
    this.active = false;
    this.anchor = null;
    this.preview.visible = false;
    this.fanArrow.visible = false;
    this.dropLine.visible = false;
    this.status.style.display = 'none';
  }
  press() {
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
  async confirm() {
    if (!this.active || this.busy || !this.enabled()) return;
    this.update();
    const candidate = this.candidate;
    if (!this.active || !candidate || candidate.error || candidate.startOnly) return;
    this.anchor = null;
    this.busy = true;
    try {
      const { id, ...body } = candidate.command;
      await this.command({ ...body, ...(id ? { target: id } : {}) });
    } finally {
      this.busy = false;
    }
  }
  // Stopping keeps the section already laid behind the truck, billed pro rata.
  async finishTrail(castor) {
    const from = this.trailAnchor;
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
  trailRequest() {
    return (
      'castor:' +
      (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + ':' + ++this.trailSequence)
    );
  }
  async advanceTrail() {
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
  update() {
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
    this.fanArrow.visible = false;
    this.dropLine.visible = false;
    this.status.style.display = this.active && this.enabled() ? 'block' : 'none';
    if (!this.active || !this.enabled()) {
      this.anchor = null;
      this.airTrails.update(snap);
      return;
    }
    if (this.trailAnchor && this.builder()) {
      this.candidate = null;
      this.status.disabled = false;
      const laid = this.showTrail(this.builder());
      this.status.textContent =
        'Castor · ' +
        (this.mode === 'sticky' ? 'ruban' : 'mur LEGO') +
        ' en continu · ' +
        laid.toFixed(2).replace('.', ',') +
        ' $ en cours · ' +
        (this.mode === 'barricade' ? '0,25 $ / 48 mm' : '1 $ / 20 cm') +
        ' au prorata · Cliquez pour arrêter';
      this.airTrails.update(snap);
      this.advanceTrail();
      return;
    }
    const builder = this.builder();
    if (builder?.air) {
      this.updateAirdrop(builder, snap);
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
          }),
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
      defense: snap.groundDefense,
      dollars: snap.dollars,
      castor: !!this.builder(),
    }));
    this.airTrails.update(
      snap,
      this.mode === 'fan' && c.command && !c.error
        ? { position: c.command.a, angle: c.command.angle, placedAt: 0 }
        : undefined,
    );
    this.status.textContent =
      c.error ||
      (this.busy
        ? 'Envoi…'
        : `${this.anchor ? 'Clic pour terminer' : ['sticky', 'barricade'].includes(this.mode) ? 'Clic pour commencer' : 'Clic'} · ${this.mode === 'repair' ? 'Réparer' : this.mode === 'remove' ? 'Enlever' : 'Poser'} · ${c.price} $ · Échap : quitter`);
    this.status.disabled = !!c.error || this.busy;
    if (!c.center) return;
    const cmd = c.command;
    const target = cmd?.id && snap.groundDefense.structures.find((s) => s.id === cmd.id);
    const kind = target?.kind || this.mode;
    if (['repair', 'remove'].includes(kind)) return;
    const shape = target || cmd;
    const a = shape?.a || c.center;
    const b = shape?.b || (['barricade', 'sticky'].includes(kind) ? [a[0] + 0.024, a[1]] : null);
    const position = target?.position || (b ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : c.center);
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
      this.status.textContent = 'Clic ou E : fixer le début · Échap : quitter';
      this.status.disabled = this.busy;
    }
    if (kind === 'fan' && cmd) {
      this.fanArrow.visible = true;
      this.fanArrow.position.set(position[0], 0.02, position[1]);
      this.fanArrow.setDirection(new this.T.Vector3(Math.sin(angle), 0, Math.cos(angle)));
    }
  }

  // A construction centred on the origin, for previews and falling drops.
  modelOf(kind, length = 0, radius = 0.15) {
    if (kind === 'bunker' || kind === 'antitank')
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
  static shapeOf(command) {
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
  updateAirdrop(builder, snap) {
    const c = (this.candidate = airdropPlacement({
      builder,
      mode: this.mode,
      defense: snap.groundDefense,
      dollars: snap.dollars,
    }));
    const verb =
      this.mode === 'repair' ? 'Réparer' : this.mode === 'remove' ? 'Enlever' : 'Larguer';
    this.status.textContent =
      c.error ||
      (this.busy ? 'Envoi…' : `Clic / Entrée · ${verb} · ${c.price} $ · Échap : quitter`);
    this.status.disabled = !!c.error || this.busy;
    if (!Number.isFinite(c.landingY)) return;
    const line = this.dropLine;
    line.position.set(builder.x, builder.y, builder.z);
    line.scale.set(1, Math.max(1e-4, builder.y - c.landingY), 1);
    line.visible = builder.y > c.landingY;
    const cmd = c.command;
    if (cmd?.action !== 'build') return;
    const shape = GroundDefenseUI.shapeOf(cmd);
    this.previewModel.show(
      'air:' + cmd.kind + ':' + shape.length.toFixed(4),
      () => this.modelOf(cmd.kind, shape.length),
      { x: shape.position[0], y: c.landingY, z: shape.position[1], angle: shape.angle },
      !c.error,
    );
    if (cmd.kind === 'fan') {
      this.fanArrow.visible = true;
      this.fanArrow.position.set(shape.position[0], c.landingY + 0.02, shape.position[1]);
      this.fanArrow.setDirection(
        new this.T.Vector3(Math.sin(shape.angle), 0, Math.cos(shape.angle)),
      );
    }
  }
  // Constructions dropped by a Castor volant, falling until the server builds them.
  renderDrops(snap) {
    const active = new Set();
    const now = this.serverNow();
    for (const drop of snap?.groundDefense?.drops || []) {
      active.add(drop.id);
      let model = this.drops.get(drop.id);
      if (!model) {
        const shape = GroundDefenseUI.shapeOf(drop.command);
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
  showTrail(castor) {
    const a = this.trailAnchor,
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
        }),
      { x: (a[0] + end[0]) / 2, y: 0, z: (a[1] + end[1]) / 2, angle: -angle },
      true,
    );
    return lengthPrice(this.mode, length);
  }

  updateSentryAim(snap) {
    const now = performance.now();
    const dt = this.lastSentryFrame ? Math.min(0.1, (now - this.lastSentryFrame) / 1000) : 1 / 60;
    this.lastSentryFrame = now;
    const weight = 1 - Math.exp(-12 * Math.max(0, dt));
    for (const structure of snap?.groundDefense?.structures || []) {
      if (structure.kind !== 'sentry') continue;
      const model = this.sentries.get(String(structure.id));
      if (!model) continue;
      if (
        structure.hp > 0 &&
        Array.isArray(structure.aimTarget) &&
        structure.aimTarget.length === 3 &&
        structure.aimTarget.every(Number.isFinite)
      ) {
        const { yaw, pitch } = sentryAimAngles(
          [structure.position[0], (structure.y || 0) + SENTRY_MUZZLE_HEIGHT, structure.position[1]],
          structure.aimTarget,
        );
        model.targetYaw = yaw - (structure.angle || 0);
        model.targetPitch = pitch;
      }
      model.yaw.rotation.y += sentryAngleDelta(model.yaw.rotation.y, model.targetYaw) * weight;
      // Short barrel recoil after each authoritative shot (issue #108).
      model.recoil = (model.recoil || 0) * Math.exp(-18 * Math.max(0, dt));
      model.pitch.position.z = (model.basePitchZ ??= model.pitch.position.z) + model.recoil * 0.003;
      model.pitch.rotation.x += (model.targetPitch - model.pitch.rotation.x) * weight;
      model.lens.material.color.set(structure.ammo > 0 ? '#1ecbd9' : '#87574c');
    }
  }
  // World position and direction of a turret's real muzzle, and recoil kick.
  sentryShot(id, target) {
    const model = this.sentries.get(String(id));
    if (!model?.muzzle) return null;
    const T = this.T;
    if (target) {
      // Snap toward the server's target so the tracer leaves along the barrel.
      const origin = model.container.position;
      const angles = sentryAimAngles([origin.x, origin.y + SENTRY_MUZZLE_HEIGHT, origin.z], target);
      if (angles) {
        model.targetYaw = angles.yaw - (model.container.rotation.y || 0);
        model.targetPitch = angles.pitch;
      }
    }
    model.recoil = 1;
    model.container.updateMatrixWorld(true);
    const position = model.muzzle.getWorldPosition(new T.Vector3());
    const direction = target
      ? new T.Vector3().fromArray(target).sub(position).normalize()
      : new T.Vector3(0, 0, -1).applyQuaternion(
          model.muzzle.getWorldQuaternion(new T.Quaternion()),
        );
    return { position, direction };
  }
  static dispose(model) {
    model.traverse((part) => {
      // Meshy T-01 / howitzer geometry and atlases are shared by every copy.
      if (part.userData?.meshyShared) return;
      if (part.isInstancedMesh) part.dispose();
      part.geometry?.dispose();
      if (!part.userData?.sharedMaterial) part.material?.dispose();
    });
  }
  rebuild(structures) {
    // Keep articulated sentries alive across shot/ammo revisions. Rebuilding
    // dozens of meshes and resetting their pivots every 500 ms is expensive.
    const retained = new Map();
    for (const structure of structures) {
      if (structure.kind !== 'sentry') continue;
      const existing = this.sentries.get(String(structure.id));
      if (!existing) continue;
      existing.container.position.set(
        structure.position[0],
        structure.y || 0,
        structure.position[1],
      );
      existing.container.rotation.y = structure.angle || 0;
      retained.set(String(structure.id), existing);
    }
    const keep = new Set([...retained.values()].map((s) => s.container));
    this.sentries = retained;
    for (const child of [...this.models.children]) {
      if (keep.has(child)) continue;
      this.models.remove(child);
      GroundDefenseUI.dispose(child);
    }
    const T = this.T;
    for (const structure of [
      ...structures.filter((s) => s.kind !== 'barricade'),
      ...wallVisualRuns(structures),
    ]) {
      // Occupied fortifications are already rendered with their articulated gun and operator.
      if (structure.kind === 'bunker' || structure.kind === 'antitank') continue;
      if (structure.kind === 'sentry' && this.sentries.has(String(structure.id))) continue;
      const group = createGroundModel(T, structure);
      group.position.y += structure.y || 0; // dropped on furniture by a Castor volant
      if (group.userData.sentry)
        this.sentries.set(String(structure.id), {
          ...group.userData.sentry,
          container: group,
          targetYaw: 0,
          targetPitch: 0,
        });
      this.models.add(group);
    }
  }
  drawRadar(ctx, defense) {
    for (const s of defense?.structures || []) {
      if (s.kind === 'fan') {
        ctx.fillStyle = '#75eaf1';
        ctx.fillRect(108 + s.position[0] / 0.04, 108 + (s.position[1] / 0.04) * 0.88, 4, 4);
      } else if (s.kind === 'bunker' || s.kind === 'antitank') {
        ctx.fillStyle = s.kind === 'bunker' ? '#c6a355' : '#9eb9a0';
        ctx.fillRect(108 + s.position[0] / 0.04, 108 + (s.position[1] / 0.04) * 0.88, 7, 7);
      } else if (s.kind === 'sentry') {
        ctx.fillStyle = s.ammo > 0 ? '#a0c89b' : '#6e6660';
        ctx.fillRect(108 + s.position[0] / 0.04, 108 + (s.position[1] / 0.04) * 0.88, 5, 5);
      } else if (s.kind === 'sugar') {
        ctx.strokeStyle = '#e9d487bb';
        ctx.beginPath();
        ctx.ellipse(
          110 + s.position[0] / 0.04,
          110 + (s.position[1] / 0.04) * 0.88,
          s.radius / 0.04,
          (s.radius / 0.04) * 0.88,
          0,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      } else {
        ctx.strokeStyle = s.kind === 'sticky' ? '#dccda8' : '#bca17a';
        ctx.lineWidth = s.kind === 'sticky' ? 2 : 3;
        ctx.beginPath();
        ctx.moveTo(110 + s.a[0] / 0.04, 110 + (s.a[1] / 0.04) * 0.88);
        ctx.lineTo(110 + s.b[0] / 0.04, 110 + (s.b[1] / 0.04) * 0.88);
        ctx.stroke();
        ctx.lineWidth = 1;
      }
    }
  }
}
