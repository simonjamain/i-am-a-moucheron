import { MAP } from './scale.js';
export function makeFortificationStation(T, st, { box, cyl }) {
  // Build 3D field fortifications in the same scaled reference coordinates as DCA.
  const root = new T.Group();
  root.position.set(st.x, st.y, st.z);
  root.scale.setScalar(MAP.ratio);
  root.rotation.y = st.angle || 0;
  if (st.kind === 'bunker') {
    const bricks = new T.InstancedMesh(
      new T.BoxGeometry(6.6, 2.5, 3.8),
      new T.MeshStandardMaterial({ color: '#cba45c', roughness: 0.88 }),
      100,
    );
    const dummy = new T.Object3D();
    let count = 0;
    for (let layer = 0; layer < 4; layer++)
      for (let index = -3; index <= 3; index++)
        for (const side of [0, 1, 2]) {
          dummy.position.set(
            side === 2 ? index * 6.7 : side === 0 ? -23 : 23,
            layer * 2.5 + 1.25,
            side === 2 ? -21 : index * 6.7,
          );
          dummy.rotation.set(0, side === 2 ? 0 : Math.PI / 2, 0);
          dummy.updateMatrix();
          bricks.setMatrixAt(count++, dummy.matrix);
        }
    bricks.count = count;
    root.add(bricks);
    box(0, 11.5, 0, 54, 2.2, 47, '#b48e4c', root);
    box(0, 9, 22, 16, 3, 5, '#4a593f', root);
  } else {
    box(0, 1.2, 0, 19, 2.4, 15, '#566b50', root);
    for (const x of [-8, 8]) cyl(x, 2.2, 4, 3, 3, 3, '#283c35', root);
    box(0, 4, 2, 9, 5, 10, '#6b7c5a', root);
  }
  const yaw = new T.Group();
  yaw.position.y = st.kind === 'bunker' ? 12.5 : 5;
  root.add(yaw);
  const pitch = new T.Group();
  yaw.add(pitch);
  const large = st.kind === 'antitank';
  const tube = cyl(
    0,
    0,
    -7,
    large ? 1.3 : 0.6,
    large ? 1.3 : 0.6,
    large ? 21 : 14,
    '#293e36',
    pitch,
  );
  tube.rotation.x = Math.PI / 2;
  box(0, 0, -1, large ? 9 : 5, large ? 6 : 4, large ? 9 : 6, '#607359', yaw);
  const muzzle = new T.Object3D();
  muzzle.position.set(0, 0, large ? -19 : -14);
  pitch.add(muzzle);
  root.userData = { yaw, pitch, muzzles: [muzzle, muzzle], barrel: 0 };
  root.traverse((part) => {
    // box/cyl materials belong to the graphics cache; bunker bricks are private.
    if (part.isMesh) part.userData.sharedMaterial = !part.isInstancedMesh;
  });
  return root;
}
