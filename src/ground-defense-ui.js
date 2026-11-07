import { createBrickWall } from './brick-wall.js';
import { AirTrails } from './air-trails.js';
import { groundPlacement } from './ground-placement.js';
import { createSentryModel, sentryAimAngles, sentryAngleDelta, SENTRY_MUZZLE_HEIGHT } from './sentry-model.js';
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
    enabled,
  }) {
    this.foot = foot;
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
    this.opened = false;
    this.key = '';
    this.airTrails = new AirTrails(T, scene);
    this.models = new T.Group();
    this.sentries = new Map();
    this.lastSentryFrame = 0;
    scene.add(this.models);
    this.trigger = document.createElement('button');
    this.trigger.textContent = 'Défense';
    this.trigger.setAttribute('aria-label', 'Construire les défenses terrestres');
    this.trigger.style.cssText =
      'position:fixed;right:16px;bottom:16px;z-index:18;padding:10px 15px;cursor:pointer';
    this.panel = document.createElement('section');
    this.panel.style.cssText =
      'position:fixed;right:16px;bottom:62px;z-index:20;background:#17252beF;color:white;' +
      'border:1px solid #7f9b93;padding:12px;border-radius:8px;width:min(450px,90vw);' +
      'box-shadow:0 8px 36px #0009;display:none';
    const top = document.createElement('div');
    top.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px';
    const heading = document.createElement('strong');
    heading.textContent = 'Défense de la poubelle';
    const close = document.createElement('button');
    close.textContent = 'Fermer';
    close.onclick = () => this.setOpen(false);
    top.append(heading, close);
    this.buttons = document.createElement('div');
    this.buttons.style.cssText = 'display:flex;gap:5px;flex-wrap:wrap;margin:8px 0';
    this.tools = [
      ['barricade', 'Barricade'],
      ['sugar', 'Sucre'],
      ['sticky', 'Ruban'],
      ['repair', 'Réparer'],
      ['remove', 'Enlever'],
      ['fan', 'Ventilateur'],
      ['sentry', 'Tourelle auto'],
      ['bunker', 'Bunker LEGO'],
      ['antitank', 'Canon lourd'],
    ];
    for (const [kind, label] of this.tools) {
      const button = document.createElement('button');
      button.textContent = label;
      button.onclick = () => {
        if (
          ['sentry', 'bunker', 'antitank'].includes(kind) &&
          (!this.builder() || !this.snapshot()?.blueprintLevels?.[kind])
        ) {
          this.notify('Débloquez ce plan par une carte et conduisez le Castor.', 3);
          return;
        }
        this.trailAnchor = null;
        this.mode = kind;
        this.buttons.querySelectorAll('button').forEach((b) => {
          b.style.fontWeight = b === button ? 'bold' : 'normal';
        });
        this.active = true;
        this.setOpen(false);
        this.captureMouse();
      };
      this.buttons.append(button);
    }
    this.buttons.querySelector('button').style.fontWeight = 'bold';
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
    this.hint = document.createElement('p');
    this.hint.textContent =
      'Cliquez pour ancrer un mur ou un ruban, visez la fin puis cliquez pour terminer. E confirme aussi, R oriente les objets ponctuels, Échap pour quitter. Barricade / ruban : 1 $ par tranche de 20 cm, sucre : 3 $, ventilateur : 4 $, réparation : 1 $.';
    this.panel.append(top, this.buttons, this.hint);
    this.status = document.createElement('button');
    this.status.style.cssText =
      'position:fixed;bottom:65px;left:50%;transform:translateX(-50%);z-index:18;padding:10px;display:none';
    this.status.onclick = () => this.press();
    document.body.append(this.trigger, this.panel, this.status);
    this.preview = new T.Mesh(
      new T.BoxGeometry(1, 1, 1),
      new T.MeshBasicMaterial({
        color: '#a7ece0',
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    );
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
    scene.add(this.preview, this.fanArrow);
    this.trigger.onclick = () => this.setOpen(!this.opened);
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
    if (index >= 0 && this.available() && this.enabled())
      this.buttons.querySelectorAll('button')[index].onclick();
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
  setOpen(open) {
    this.anchor = null;
    if (open) this.trailAnchor = null;
    this.opened = open && this.available();
    this.panel.style.display = this.opened ? 'block' : 'none';
    if (this.opened) {
      this.active = false;
      this.releaseMouse();
    }
  }
  cancel() {
    this.trailAnchor = null;
    this.radial = false;
    this.wheelSource = null;
    this.wheel.style.display = 'none';
    this.active = false;
    this.setOpen(false);
    this.preview.visible = false;
    this.fanArrow.visible = false;
    this.status.style.display = 'none';
  }
  press() {
    if (!this.enabled() || this.busy) return;
    const castor = this.builder();
    if (castor && ['barricade', 'sticky'].includes(this.mode)) {
      this.trailAnchor = this.trailAnchor ? null : castor.rear;
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
    // Preserve the existing tariff: one dollar per 20 cm of wall or tape.
    if (distance < 0.18) return;
    if (distance > 0.25) {
      this.trailAnchor = null;
      this.notify('Trajet de construction interrompu : trop éloigné.', 3);
      return;
    }
    const to = from.map((n, i) => n + ((castor.rear[i] - n) * Math.min(0.2, distance)) / distance);
    this.busy = true;
    try {
      const request =
        'castor:' +
        (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + ':' + ++this.trailSequence);
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
    this.trigger.hidden = !this.available();
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
    this.preview.visible = false;
    this.fanArrow.visible = false;
    this.status.style.display = this.active && this.enabled() ? 'block' : 'none';
    if (!this.active || !this.enabled()) {
      this.anchor = null;
      this.airTrails.update(snap);
      return;
    }
    if (this.trailAnchor && this.builder()) {
      this.candidate = null;
      this.status.disabled = false;
      this.status.textContent =
        'Castor · ' + this.mode + ' en continu · 1 $ / 20 cm · Cliquez pour arrêter';
      this.airTrails.update(snap);
      this.advanceTrail();
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
      blueprintLevels: snap.blueprintLevels,
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
    if (!this.anchor && ['barricade', 'sticky'].includes(this.mode)) {
      this.preview.position.set(c.center[0], 0.005, c.center[1]);
      this.preview.scale.set(0.008, 0.01, 0.008);
      this.preview.rotation.y = 0;
      this.preview.material.color.set('#a7ece0');
      this.preview.visible = true;
      this.status.textContent = 'Clic ou E : fixer le début · Échap : quitter';
      this.status.disabled = this.busy;
      return;
    }
    const cmd = c.command;
    const target = cmd?.id && snap.groundDefense.structures.find((s) => s.id === cmd.id);
    const shape = target || cmd;
    const a = shape?.a,
      b = shape?.b;
    const x = a && b ? (a[0] + b[0]) / 2 : (target?.position || c.center)[0];
    const z = a && b ? (a[1] + b[1]) / 2 : (target?.position || c.center)[1];
    const kind = target?.kind || this.mode;
    this.preview.position.set(x, kind === 'sugar' ? 0.002 : kind === 'sticky' ? 0.001 : 0.01, z);
    this.preview.scale.set(
      a && b ? Math.hypot(b[0] - a[0], b[1] - a[1]) : 0.042,
      kind === 'sticky' || kind === 'sugar' ? 0.002 : 0.02,
      kind === 'sticky' || kind === 'sugar' ? 0.03 : 0.008,
    );
    this.preview.rotation.y = a && b ? -Math.atan2(b[1] - a[1], b[0] - a[0]) : shape?.angle || 0;
    this.preview.material.color.set(c.error ? '#ed665b' : '#a7ece0');
    this.preview.visible = true;
    if (this.mode === 'fan' && cmd) {
      this.fanArrow.visible = true;
      this.fanArrow.position.set(x, 0.02, z);
      this.fanArrow.setDirection(new this.T.Vector3(Math.sin(cmd.angle), 0, Math.cos(cmd.angle)));
    }
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
          [structure.position[0], SENTRY_MUZZLE_HEIGHT, structure.position[1]],
          structure.aimTarget,
        );
        model.targetYaw = yaw - (structure.angle || 0);
        model.targetPitch = pitch;
      }
      model.yaw.rotation.y +=
        sentryAngleDelta(model.yaw.rotation.y, model.targetYaw) * weight;
      model.pitch.rotation.x += (model.targetPitch - model.pitch.rotation.x) * weight;
      model.lens.material.color.set(structure.ammo > 0 ? '#1ecbd9' : '#87574c');
    }
  }
  rebuild(structures) {
    // Keep articulated sentries alive across shot/ammo revisions. Rebuilding
    // dozens of meshes and resetting their pivots every 500 ms is expensive.
    const retained = new Map();
    for (const structure of structures) {
      if (structure.kind !== 'sentry') continue;
      const existing = this.sentries.get(String(structure.id));
      if (!existing) continue;
      existing.container.position.set(structure.position[0], 0, structure.position[1]);
      existing.container.rotation.y = structure.angle || 0;
      retained.set(String(structure.id), existing);
    }
    const keep = new Set([...retained.values()].map((s) => s.container));
    this.sentries = retained;
    for (const child of [...this.models.children]) {
      if (keep.has(child)) continue;
      this.models.remove(child);
      child.traverse((part) => {
        // Meshy T-01 geometry/atlases are cached across all turrets.
        if (part.userData?.meshyShared) return;
        if (part.isInstancedMesh) part.dispose();
        part.geometry?.dispose();
        part.material?.dispose();
      });
    }
    const T = this.T;
    for (const structure of structures) {
      // Occupied fortifications are already rendered with their articulated gun and operator.
      if (structure.kind === 'bunker' || structure.kind === 'antitank') continue;
      const group = new T.Group();
      if (structure.kind === 'fan') {
        group.position.set(structure.position[0], 0.032, structure.position[1]);
        group.rotation.y = structure.angle;
        const hoop = new T.Mesh(
          new T.TorusGeometry(0.027, 0.002, 6, 20),
          new T.MeshBasicMaterial({ color: '#71a2a7' }),
        );
        group.add(hoop);
        for (let i = 0; i < 3; i++) {
          const blade = new T.Mesh(
            new T.BoxGeometry(0.024, 0.009, 0.004),
            new T.MeshBasicMaterial({ color: '#dcdfcf' }),
          );
          blade.rotation.z = (i * 2 * Math.PI) / 3;
          blade.position.set(
            0.013 * Math.cos(blade.rotation.z),
            0.013 * Math.sin(blade.rotation.z),
            0,
          );
          group.add(blade);
        }
        const nose = new T.Mesh(
          new T.ConeGeometry(0.008, 0.018, 6),
          new T.MeshBasicMaterial({ color: '#e9ad58' }),
        );
        nose.rotation.x = Math.PI / 2;
        nose.position.z = 0.01;
        group.add(nose);
      } else if (structure.kind === 'sugar') {
        const [x, z] = structure.position;
        const paper = new T.Mesh(
          new T.BoxGeometry(0.042, 0.002, 0.03),
          new T.MeshBasicMaterial({ color: '#f5ece2' }),
        );
        paper.position.set(0, 0.002, 0);
        group.position.set(x, 0, z);
        group.rotation.y = structure.angle || 0;
        group.add(paper);
        // Two printed stripes and a lifted paper lip mark the torn opening.
        for (const offset of [-0.008, -0.004, 0.014]) {
          const fold = new T.Mesh(
            new T.BoxGeometry(0.04, 0.001, 0.003),
            new T.MeshBasicMaterial({ color: offset > 0 ? '#c8ae88' : '#548ba1' }),
          );
          fold.position.set(0, 0.0035, offset);
          if (offset > 0) fold.rotation.x = -0.55;
          group.add(fold);
        }
        for (let i = 0; i < 6; i++) {
          const grain = new T.Mesh(
            new T.BoxGeometry(0.002, 0.002, 0.002),
            new T.MeshBasicMaterial({ color: '#faf9ed' }),
          );
          grain.position.set(-0.015 + (i % 3) * 0.009, 0.003, 0.02 + Math.floor(i / 3) * 0.006);
          group.add(grain);
        }
        const ring = new T.Mesh(
          new T.RingGeometry(structure.radius - 0.002, structure.radius, 56),
          new T.MeshBasicMaterial({
            color: '#e9d487',
            side: T.DoubleSide,
            transparent: true,
            opacity: 0.55,
          }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(0, 0.002, 0);
        group.add(ring);
      } else if (structure.kind === 'sentry') {
        if (this.sentries.has(String(structure.id))) continue;
        const [x, z] = structure.position;
        group.position.set(x, 0, z);
        group.rotation.y = structure.angle || 0;
        const sentry = createSentryModel(T);
        this.sentries.set(String(structure.id), {
          ...sentry,
          container: group,
          targetYaw: 0,
          targetPitch: 0,
        });
        group.add(sentry.group);
      } else if (structure.kind === 'barricade') {
        group.add(createBrickWall(T, structure));
      } else {
        const dx = structure.b[0] - structure.a[0];
        const dz = structure.b[1] - structure.a[1];
        const length = Math.hypot(dx, dz);
        const x = (structure.a[0] + structure.b[0]) / 2;
        const z = (structure.a[1] + structure.b[1]) / 2;
        const intact = structure.kind !== 'barricade' || structure.hp > 0;
        const mesh = new T.Mesh(
          new T.BoxGeometry(
            length,
            structure.kind === 'sticky' ? 0.001 : 0.02,
            structure.kind === 'sticky' ? 0.03 : 0.008,
          ),
          new T.MeshBasicMaterial({
            color: structure.kind === 'sticky' ? '#dcd3a8' : intact ? '#ab8354' : '#574637',
            transparent: structure.kind === 'sticky',
            opacity: structure.kind === 'sticky' ? 0.6 : 1,
          }),
        );
        mesh.position.set(x, structure.kind === 'sticky' ? 0.001 : 0.01, z);
        mesh.rotation.y = -Math.atan2(dz, dx);
        mesh.visible = intact;
        group.add(mesh);
        if (structure.kind === 'sticky') {
          const sheen = new T.Mesh(
            new T.BoxGeometry(length, 0.0002, 0.003),
            new T.MeshBasicMaterial({ color: '#f8efcf' }),
          );
          sheen.position.set(0, 0.0006, 0.01);
          mesh.add(sheen);
        }
      }
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
