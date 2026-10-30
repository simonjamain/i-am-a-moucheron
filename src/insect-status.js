// Presentation only: these meshes never enter the projectile collision surface.
export function insectScale(type, base, size = 1) {
  return base * size * (type === 'midge' ? 1.35 * 1.5 : 1);
}
export function woundState(health, maximum) {
  const fraction = Math.max(0, Math.min(1, health / Math.max(1, maximum)));
  return {
    fraction,
    visible: fraction > 0 && fraction < 1,
    smoke: fraction > 0 && fraction < 1,
    flames: fraction > 0 && fraction <= 0.3,
  };
}
export class InsectStatus {
  constructor(T, scene, { scale = 1 } = {}) {
    this.T = T;
    this.scene = scene;
    this.scale = scale;
    this.items = new Map();
    this.geometry = new T.PlaneGeometry(1, 1);
    this.smokeGeometry = new T.CircleGeometry(0.5, 8);
    this.flameGeometry = new T.CircleGeometry(0.5, 3);
    this.flameGeometry.rotateZ(Math.PI / 2);
  }
  create(id) {
    const T = this.T,
      root = new T.Group(),
      bar = new T.Group();
    root.add(bar);
    const make = (color, opacity = 1) => {
      const m = new T.Mesh(
        this.geometry,
        new T.MeshBasicMaterial({
          color,
          transparent: true,
          opacity,
          depthWrite: false,
          side: T.DoubleSide,
        }),
      );
      m.userData.projectileSolid = false;
      return m;
    };
    const back = make('#18241b', 0.9),
      fill = make('#9ddd64');
    bar.add(back, fill);
    fill.position.z = 0.001;
    const smoke = Array.from({ length: 3 }, () => {
      const m = make('#536160', 0.5);
      m.geometry = this.smokeGeometry;
      root.add(m);
      return m;
    });
    const flames = Array.from({ length: 2 }, (_, i) => {
      const m = make(i ? '#fff2a4' : '#ff883e', 0.8);
      m.geometry = this.flameGeometry;
      root.add(m);
      return m;
    });
    const item = { root, bar, back, fill, smoke, flames };
    this.items.set(id, item);
    this.scene.add(root);
    return item;
  }
  update(id, model, health, maximum, camera, time = 0, size = 1) {
    const state = woundState(health, maximum);
    if (!state.visible) {
      this.remove(id);
      return;
    }
    const e = this.items.get(id) || this.create(id),
      unit = this.scale * size,
      T = this.T;
    e.root.position.copy(model.position);
    e.root.quaternion.copy(camera.quaternion);
    const distance = camera.position.distanceTo(model.position),
      width = Math.max(1.4 * unit, Math.min(5 * unit, distance * 0.018));
    e.bar.position.set(0, 1.6 * unit, 0);
    e.back.scale.set(width, width * 0.13, 1);
    e.fill.scale.set(width * state.fraction, width * 0.09, 1);
    e.fill.position.x = (-width * (1 - state.fraction)) / 2;
    e.fill.material.color.set(state.flames ? '#ef6845' : '#c8df62');
    for (const [i, puff] of e.smoke.entries()) {
      const age = (time * 0.6 + i / 3) % 1;
      puff.position.set(Math.sin(i * 2.4 + time) * unit * 0.22, unit * (0.4 + age * 1.1), 0);
      puff.scale.setScalar(unit * (0.3 + age * 0.5));
      puff.material.opacity = (1 - age) * (0.25 + 0.35 * (1 - state.fraction));
    }
    for (const [i, flame] of e.flames.entries()) {
      flame.visible = state.flames;
      flame.position.set((i - 0.5) * unit * 0.25, unit * 0.5, unit * 0.05);
      flame.scale.set(unit * 0.35, unit * (0.6 + 0.15 * Math.sin(time * 20 + i)), 1);
      flame.rotation.z = Math.sin(time * 13 + i) * 0.15;
    }
  }
  keep(ids) {
    for (const id of this.items.keys()) if (!ids.has(id)) this.remove(id);
  }
  remove(id) {
    const e = this.items.get(id);
    if (!e) return;
    this.scene.remove(e.root);
    e.root.traverse((o) => o.material?.dispose());
    this.items.delete(id);
  }
  clear() {
    for (const id of this.items.keys()) this.remove(id);
  }
  dispose() {
    this.clear();
    this.geometry.dispose();
    this.smokeGeometry.dispose();
    this.flameGeometry.dispose();
  }
}
