import { PORTALS } from './routes.js';
import { OFFICE_LAYOUT } from './layout.js';
import { ACTOR_UNIT } from './scale.js';
export function createOffice(T, scene, { box, cyl, ball, mat, textLabel }) {
  const colliders = [],
    solidObjects = [];
  const register = (m) => {
    m.updateWorldMatrix(true, true);
    colliders.push(new T.Box3().setFromObject(m));
    solidObjects.push(m);
    return m;
  };
  const solid = (...args) => register(box(...args));
  const round = (...args) => register(cyl(...args));
  scene.add(new T.HemisphereLight('#eff3dd', '#50634e', 2.5));
  const sun = new T.DirectionalLight('#fff4d9', 3);
  sun.position.set(-3, 6, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 0.01, far: 15 });
  sun.shadow.bias = -0.00001;
  scene.add(sun);
  solid(0, -0.04, 0, 8.4, 0.08, 7.2, '#7b8675');
  solid(0, 1.5, -3.6, 8.4, 3, 0.08, '#b7c0ac');
  solid(-4.2, 1.5, 0, 0.08, 3, 7.2, '#b4c6b7');
  solid(4.2, 1.5, 0, 0.08, 3, 7.2, '#adc0b1');
  for (let x = -4; x < 4.2; x += 0.3) box(x, 0.0002, 0, 0.002, 0.0004, 7.2, '#657963');
  solid(-4.145, 1.7, -0.6, 0.025, 1.3, 2, '#e4ecd5');
  for (const z of [-1.25, -0.6, 0.05]) solid(-4.12, 1.7, z, 0.035, 1.3, 0.035, '#678a78');
  solid(-4.12, 1.7, -0.6, 0.035, 0.035, 2, '#678a78');
  function desktop(d) {
    const top = solid(d.x, d.y - 0.025, d.z, d.w, 0.05, d.d, '#c7b38e');
    top.geometry.dispose();
    top.geometry = new T.BoxGeometry(d.w, 0.05, d.d, 28, 1, 20);
    for (const dx of [-d.w / 2 + 0.07, d.w / 2 - 0.07])
      for (const dz of [-d.d / 2 + 0.07, d.d / 2 - 0.07])
        solid(d.x + dx, (d.y - 0.05) / 2, d.z + dz, 0.055, d.y - 0.05, 0.055, '#425d50');
    solid(d.x, d.y - 0.13, d.z - d.d / 2 + 0.04, d.w - 0.12, 0.18, 0.035, '#77917d');
  }
  OFFICE_LAYOUT.desks.forEach(desktop);
  function computer(x, z) {
    solid(x, 1.16, z, 0.55, 0.34, 0.04, '#244b42');
    solid(x, 1.16, z + 0.022, 0.51, 0.3, 0.003, '#82ac9c');
    solid(x, 0.955, z, 0.045, 0.09, 0.055, '#365e51');
    solid(x, 0.91, z + 0.025, 0.2, 0.02, 0.14, '#365e51');
    solid(x, 0.915, z + 0.23, 0.44, 0.03, 0.15, '#405b50');
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 14; c++)
        solid(x - 0.2 + c * 0.03, 0.934, z + 0.175 + r * 0.024, 0.024, 0.008, 0.018, '#b3c0a9');
    solid(x + 0.34, 0.916, z + 0.23, 0.065, 0.032, 0.11, '#466658');
    solid(x + 0.34, 0.933, z + 0.2, 0.005, 0.008, 0.025, '#91b29b');
  }
  computer(-2.05, 1.17);
  computer(1.7, -1.65);
  // Books, binder seams, paper stack, pen tray, pencil, lamp, speakers and mouse mat.
  for (let i = 0; i < 3; i++) {
    solid(-1.02, 0.915 + i * 0.035, 1.23, 0.25, 0.03, 0.35, ['#79977a', '#bdbb8e', '#d0b67f'][i]);
    solid(-1.02, 0.916 + i * 0.035, 1.4075, 0.23, 0.024, 0.003, '#efe4c6');
  }
  solid(2.25, 0.903, -1.34, 0.38, 0.006, 0.32, '#284d43');
  for (let i = 0; i < 5; i++) solid(1.05, 0.9006 + i * 0.0012, -1.1, 0.21, 0.001, 0.29, '#eee8d2');
  const pencil = solid(2.12, 0.91, -1.12, 0.19, 0.009, 0.009, '#dbab5d');
  pencil.rotation.y = 0.35;
  colliders[colliders.length - 1].setFromObject(pencil);
  solid(2.12, 0.906, -1.04, 0.22, 0.012, 0.06, '#5b7660');
  for (const x of [-2.45, -1.65]) {
    solid(x, 1.01, 1.18, 0.09, 0.22, 0.1, '#2b4a40');
    round(x, 1.02, 1.235, 0.032, 0.032, 0.008, '#7d9682');
  }
  const cup = round(1.08, 1.015, -1.65, 0.045, 0.04, 0.23, '#eee7cd');
  round(1.08, 1.132, -1.65, 0.04, 0.04, 0.003, '#4c382a');
  const handle = new T.Mesh(new T.TorusGeometry(0.04, 0.008, 8, 20), mat('#eee7cd'));
  handle.position.set(1.135, 1.01, -1.65);
  scene.add(handle);
  register(handle);
  round(-1.02, 0.91, 1.85, 0.07, 0.08, 0.02, '#506956');
  solid(-1.02, 1.08, 1.85, 0.018, 0.32, 0.018, '#668571');
  solid(-1.02, 1.24, 1.8, 0.15, 0.035, 0.14, '#c9d8b7');
  solid(0.85, 0.095, 2.35, 0.6, 0.19, 0.45, '#9c9e7a');
  solid(0.85, 0.198, 2.35, 0.62, 0.016, 0.47, '#b8b88d');
  // Chair legs and seats are solid, with open paths between the legs.
  for (const p of [
    { x: -1.75, z: 0.6 },
    { x: 1.8, z: -2.25 },
  ]) {
    solid(p.x, 0.45, p.z, 0.48, 0.07, 0.46, '#526e5a');
    solid(p.x, 0.72, p.z - 0.2, 0.48, 0.5, 0.055, '#5e7a65');
    for (const x of [-0.19, 0.19])
      for (const z of [-0.18, 0.18]) solid(p.x + x, 0.21, p.z + z, 0.035, 0.42, 0.035, '#3d594b');
  }
  // Storage shelf and folders on the far wall.
  for (const x of [-2.8, -1.5]) solid(x, 0.8, -3.3, 0.045, 1.6, 0.38, '#5a725b');
  for (const y of [0.12, 0.65, 1.2, 1.6]) solid(-2.15, y, -3.3, 1.4, 0.035, 0.4, '#91a37e');
  for (let i = 0; i < 11; i++)
    solid(-2.7 + i * 0.1, 0.89, -3.3, 0.07, 0.44, 0.29, ['#c5b57e', '#6f8c77', '#96aaa0'][i % 3]);
  const bin = new T.Group();
  bin.position.set(OFFICE_LAYOUT.bin.x, 0, OFFICE_LAYOUT.bin.z);
  scene.add(bin);
  round(0, 0.15, 0, 0.16, 0.12, 0.3, '#3c5748', bin);
  round(0, 0.305, 0, 0.167, 0.167, 0.015, '#79947a', bin);
  round(0, 0.313, 0, 0.145, 0.145, 0.003, '#243b2e', bin);
  for (let i = 0; i < 6; i++)
    register(
      ball(Math.sin(i * 2.4) * 0.09, 0.315, Math.cos(i * 2.4) * 0.09, 0.033, '#c6c5a3', bin),
    );
  const fanGroup = new T.Group();
  fanGroup.position.set(...OFFICE_LAYOUT.fan.position);
  scene.add(fanGroup);
  const foot = round(0, -0.4025, 0, 0.12, 0.14, 0.035, '#365c4d', fanGroup);
  const stand = solid(0, -0.1925, 0, 0.026, 0.385, 0.026, '#365c4d', fanGroup);
  const fanRing = new T.Mesh(new T.TorusGeometry(0.18, 0.012, 10, 40), mat('#4f785f'));
  fanRing.rotation.y = Math.PI / 2;
  fanGroup.add(fanRing);
  register(fanRing);
  const rotor = new T.Group();
  fanGroup.add(rotor);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2,
      blade = box(0, Math.cos(a) * 0.075, Math.sin(a) * 0.075, 0.018, 0.14, 0.05, '#cddab6', rotor);
    blade.rotation.x = a;
  }
  register(ball(0, 0, 0, 0.035, '#d5ef73', fanGroup));
  // Cage rods surround the moving blades; the collision volume stays stable.
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    solid(0.018, Math.cos(a) * 0.085, Math.sin(a) * 0.085, 0.012, 0.17, 0.007, '#64836b', fanGroup);
  }
  const bounds = new T.Box3().setFromCenterAndSize(
    new T.Vector3(...OFFICE_LAYOUT.fan.position),
    new T.Vector3(0.07, 0.38, 0.38),
  );
  colliders.push(bounds);
  const winds = [];
  for (let i = 0; i < 16; i++) winds.push(box(0, 0, 0, 0.025, 0.001, 0.001, '#d0e2b4'));
  for (const [x, y, z] of PORTALS.air) {
    const side = Math.abs(x) > 4;
    const panel = solid(x, y, z, side ? 0.018 : 0.34, 0.24, side ? 0.34 : 0.018, '#304a43');
    for (let j = -2; j <= 2; j++) {
      if (side) box(x + (x < 0 ? 0.012 : -0.012), y + j * 0.035, z, 0.02, 0.012, 0.3, '#8c9b87');
      else box(x, y + j * 0.035, z + 0.012, 0.3, 0.012, 0.02, '#8c9b87');
    }
  }
  for (const [x, y, z] of PORTALS.ground) {
    const hole = ball(x, y + 0.035, z, 0.075, '#14231e');
    hole.scale.set(Math.abs(x) > 4 ? 0.12 : 1, 0.85, Math.abs(x) > 4 ? 1 : 0.12);
  }
  const b = OFFICE_LAYOUT.base,
    u = ACTOR_UNIT,
    strip = box(
      b.originX,
      b.deckY + 0.01 * u,
      b.originZ - 15 * u,
      64 * u,
      0.015 * u,
      35 * u,
      '#234e40',
    );
  strip.material = strip.material.clone();
  Object.assign(strip.material, {
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  strip.geometry.dispose();
  strip.geometry = new T.BoxGeometry(64 * u, 0.015 * u, 35 * u, 32, 1, 18);
  for (let x = -29; x < 30; x += 6.4)
    for (let z = 0; z < 32; z += 6) {
      const marking = box(
        b.originX + x * u,
        b.deckY + 0.04 * u,
        b.originZ - z * u,
        0.12 * u,
        0.015 * u,
        2 * u,
        '#d7ee8b',
      );
      marking.material = marking.material.clone();
      Object.assign(marking.material, {
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
    }
  const label = textLabel('BASE ALPHA · 3 / 1000', '#e2f1bd', 28 * u);
  label.position.set(b.originX, b.deckY + 5 * u, b.originZ + 2 * u);
  scene.add(label);
  return { colliders, solidObjects, fanGroup, rotor, winds };
}
