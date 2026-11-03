// Compact tactical construction surface; the server validates every command.
export class GroundDefenseUI {
  constructor({ T, scene, document, command, snapshot, available, notify, releaseMouse }) {
    this.T = T;
    this.scene = scene;
    this.command = command;
    this.snapshot = snapshot;
    this.available = available;
    this.notify = notify;
    this.releaseMouse = releaseMouse;
    this.mode = 'barricade';
    this.opened = false;
    this.start = null;
    this.pointer = null;
    this.key = '';
    this.models = new T.Group();
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
    for (const [kind, label] of [
      ['barricade', 'Barricade'],
      ['sugar', 'Sucre'],
      ['sticky', 'Ruban'],
      ['repair', 'Réparer'],
      ['remove', 'Enlever'],
    ]) {
      const button = document.createElement('button');
      button.textContent = label;
      button.onclick = () => {
        this.mode = kind;
        this.start = null;
        this.buttons.querySelectorAll('button').forEach((b) => {
          b.style.fontWeight = b === button ? 'bold' : 'normal';
        });
        this.paint();
      };
      this.buttons.append(button);
    }
    this.buttons.querySelector('button').style.fontWeight = 'bold';
    this.canvas = document.createElement('canvas');
    this.canvas.width = 420;
    this.canvas.height = 350;
    this.canvas.style.cssText =
      'width:100%;height:auto;background:#223935;border:1px solid #6f8b81;touch-action:none';
    this.hint = document.createElement('p');
    this.hint.style.cssText = 'font-size:12px;line-height:1.4;margin:8px 0 0';
    this.hint.textContent =
      'Au sol : cliquez et étirez les murs ou rubans. Cliquez pour poser du sucre ou agir sur un segment.';
    this.panel.append(top, this.buttons, this.canvas, this.hint);
    document.body.append(this.trigger, this.panel);
    this.trigger.onclick = () => this.setOpen(!this.opened);
    this.canvas.addEventListener('pointerdown', (e) => this.down(e));
    this.canvas.addEventListener('pointermove', (e) => this.move(e));
    this.canvas.addEventListener('pointerup', (e) => this.up(e));
    this.canvas.addEventListener('pointercancel', () => {
      this.start = null;
      this.pointer = null;
      this.paint();
    });
  }
  setOpen(open) {
    this.opened = open && this.available();
    this.panel.style.display = this.opened ? 'block' : 'none';
    if (this.opened) this.releaseMouse();
    else this.start = null;
    this.paint();
  }
  point(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const z = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    return [-4.12 + x * 8.24, -3.51 + z * 7.02];
  }
  screen(position) {
    return [((position[0] + 4.12) / 8.24) * 420, ((position[1] + 3.51) / 7.02) * 350];
  }
  down(event) {
    if (!this.opened) return;
    event.preventDefault();
    this.canvas.setPointerCapture(event.pointerId);
    this.pointer = event.pointerId;
    this.start = this.point(event);
    this.end = this.start;
    this.paint();
  }
  move(event) {
    if (this.pointer !== event.pointerId) return;
    this.end = this.point(event);
    this.paint();
  }
  async up(event) {
    if (this.pointer !== event.pointerId) return;
    event.preventDefault();
    this.pointer = null;
    const a = this.start;
    const b = this.point(event);
    this.start = null;
    this.paint();
    if (!this.snapshot()?.base?.epoch) return;
    if (this.mode === 'repair' || this.mode === 'remove') {
      const target = this.nearest(b);
      if (!target) {
        this.notify('Aucune construction à proximité de ce point.', 2);
        return;
      }
      await this.command({ action: this.mode, target: target.id });
    } else if (this.mode === 'sugar') {
      await this.command({ action: 'build', kind: 'sugar', a });
    } else if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 0.002) {
      await this.command({ action: 'build', kind: this.mode, a, b });
    }
  }
  nearest(point) {
    const structures = this.snapshot()?.groundDefense?.structures || [];
    return structures
      .map((s) => ({
        structure: s,
        distance: Math.hypot(
          point[0] - (s.position?.[0] ?? (s.a[0] + s.b[0]) / 2),
          point[1] - (s.position?.[1] ?? (s.a[1] + s.b[1]) / 2),
        ),
      }))
      .filter((s) => s.distance < 0.15)
      .sort((a, b) => a.distance - b.distance)[0]?.structure;
  }
  paint() {
    if (!this.opened) return;
    const ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, 420, 350);
    ctx.fillStyle = '#273c37';
    ctx.fillRect(0, 0, 420, 350);
    ctx.strokeStyle = '#45655d';
    for (let x = 0; x <= 420; x += 42) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 350);
      ctx.stroke();
    }
    for (let y = 0; y <= 350; y += 35) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(420, y);
      ctx.stroke();
    }
    for (const s of this.snapshot()?.groundDefense?.structures || []) {
      const point = s.position ? this.screen(s.position) : null;
      if (s.kind === 'sugar') {
        ctx.strokeStyle = '#e8d68a';
        ctx.beginPath();
        ctx.arc(...point, (s.radius / 8.24) * 420, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#f9eee2';
        ctx.fillRect(point[0] - 4, point[1] - 4, 8, 8);
      } else {
        const a = this.screen(s.a);
        const b = this.screen(s.b);
        ctx.beginPath();
        ctx.moveTo(...a);
        ctx.lineTo(...b);
        ctx.lineWidth = s.kind === 'sticky' ? 5 : 3;
        ctx.strokeStyle = s.kind === 'sticky' ? '#ded0a8' : s.hp ? '#cba36b' : '#614b37';
        ctx.stroke();
        ctx.lineWidth = 1;
      }
    }
    if (this.start && this.end) {
      const a = this.screen(this.start);
      const b = this.screen(this.end);
      ctx.strokeStyle = '#a7ece0';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(...a);
      ctx.lineTo(...b);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    const bin = this.screen([3, -2.7]);
    ctx.fillStyle = '#fff0a2';
    ctx.beginPath();
    ctx.arc(...bin, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  update() {
    const snap = this.snapshot();
    this.trigger.hidden = !this.available();
    if (!this.available() && this.opened) this.setOpen(false);
    if (!snap) return;
    const key = [snap.code, snap.base?.epoch, snap.groundDefense?.revision].join(':');
    if (key !== this.key) {
      this.key = key;
      this.paint();
      this.rebuild(snap.groundDefense?.structures || []);
    }
  }
  rebuild(structures) {
    for (const child of [...this.models.children]) {
      this.models.remove(child);
      child.traverse((part) => part.geometry?.dispose());
    }
    const T = this.T;
    for (const structure of structures) {
      const group = new T.Group();
      if (structure.kind === 'sugar') {
        const [x, z] = structure.position;
        const paper = new T.Mesh(
          new T.BoxGeometry(0.042, 0.002, 0.03),
          new T.MeshBasicMaterial({ color: '#f5ece2' }),
        );
        paper.position.set(x, 0.002, z);
        group.add(paper);
        for (let i = 0; i < 6; i++) {
          const grain = new T.Mesh(
            new T.BoxGeometry(0.002, 0.002, 0.002),
            new T.MeshBasicMaterial({ color: '#faf9ed' }),
          );
          grain.position.set(
            x - 0.015 + (i % 3) * 0.009,
            0.003,
            z + 0.02 + Math.floor(i / 3) * 0.006,
          );
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
        ring.position.set(x, 0.002, z);
        group.add(ring);
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
      }
      this.models.add(group);
    }
  }
  drawRadar(ctx, defense) {
    for (const s of defense?.structures || []) {
      if (s.kind === 'sugar') {
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
