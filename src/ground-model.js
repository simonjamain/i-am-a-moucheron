import { splitBarricade } from './ground-defense.js';
import { createBrickWall } from './brick-wall.js';
import { createSentryModel } from './sentry-model.js';

// One model factory for both placed structures and placement previews.
export function createGroundModel(T, structure) {
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
      blade.position.set(0.013 * Math.cos(blade.rotation.z), 0.013 * Math.sin(blade.rotation.z), 0);
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
    const [x, z] = structure.position;
    group.position.set(x, 0, z);
    group.rotation.y = structure.angle || 0;
    const sentry = createSentryModel(T);
    group.userData.sentry = sentry;
    group.add(sentry.group);
  } else if (structure.kind === 'barricade') {
    for (const segment of structure.wholeWall
      ? [structure]
      : splitBarricade(structure.a, structure.b, structure.id || 'preview'))
      group.add(createBrickWall(T, { ...segment, hp: structure.hp }));
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
  return group;
}
