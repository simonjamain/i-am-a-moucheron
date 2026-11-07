// Low-poly fallback for the T-01 automatic turret.
// Fixed base, yaw housing and pitchable single cannon are independent nodes.
// The approved textured Meshy GLB must be inspected and imported separately.
export const SENTRY_MIN_ELEVATION = (-10 * Math.PI) / 180;
export const SENTRY_MAX_ELEVATION = Math.PI / 2;
export const SENTRY_MUZZLE_HEIGHT = 0.033;

export function sentryAimAngles(origin, target) {
  if (
    !Array.isArray(origin) ||
    !Array.isArray(target) ||
    origin.length !== 3 ||
    target.length !== 3 ||
    !origin.every(Number.isFinite) ||
    !target.every(Number.isFinite)
  )
    throw new Error('Sentry aim requires finite 3D positions');
  const dx = target[0] - origin[0];
  const dy = target[1] - origin[1];
  const dz = target[2] - origin[2];
  // The gun's zero-elevation forward axis is local -Z.
  const yaw = Math.atan2(-dx, -dz);
  const pitch = Math.max(
    SENTRY_MIN_ELEVATION,
    Math.min(SENTRY_MAX_ELEVATION, Math.atan2(dy, Math.hypot(dx, dz))),
  );
  return { yaw, pitch };
}

export function sentryAngleDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export function createSentryModel(T) {
  const model = new T.Group();
  model.name = 't01';
  const olive = new T.MeshStandardMaterial({
    color: '#687747',
    roughness: 0.9,
    metalness: 0.08,
    flatShading: true,
  });
  const oliveDark = new T.MeshStandardMaterial({
    color: '#40523b',
    roughness: 0.9,
    metalness: 0.08,
    flatShading: true,
  });
  const sand = new T.MeshStandardMaterial({
    color: '#c5ab7b',
    roughness: 0.92,
    flatShading: true,
  });
  const dark = new T.MeshStandardMaterial({
    color: '#303538',
    roughness: 0.68,
    metalness: 0.35,
    flatShading: true,
  });
  const yellow = new T.MeshStandardMaterial({
    color: '#f5c22c',
    roughness: 0.86,
    flatShading: true,
  });
  const orange = new T.MeshStandardMaterial({
    color: '#e37e30',
    roughness: 0.9,
    flatShading: true,
  });
  const eye = new T.MeshStandardMaterial({
    color: '#1ecbd9',
    roughness: 0.23,
    metalness: 0.2,
    emissive: '#073d45',
    flatShading: true,
  });

  function mesh(parent, geometry, material, x, y, z, name) {
    const part = new T.Mesh(geometry, material);
    part.position.set(x, y, z);
    part.name = name;
    part.castShadow = true;
    part.receiveShadow = true;
    parent.add(part);
    return part;
  }
  function box(parent, size, location, material, name) {
    return mesh(parent, new T.BoxGeometry(...size), material, ...location, name);
  }
  // Ground-anchored reinforced polygonal plinth, four sand-colored feet.
  mesh(model, new T.CylinderGeometry(0.025, 0.027, 0.012, 8), olive, 0, 0.007, 0, 'socle');
  mesh(model, new T.CylinderGeometry(0.019, 0.019, 0.006, 8), dark, 0, 0.016, 0, 'pivot-yaw');
  for (const x of [-1, 1])
    for (const z of [-1, 1]) {
      box(model, [0.015, 0.008, 0.015], [x * 0.021, 0.005, z * 0.021], sand, 'patte');
      box(model, [0.012, 0.003, 0.012], [x * 0.021, 0.01, z * 0.021], oliveDark, 'patte-boulon');
    }
  // Two yellow warning inserts read clearly even when the miniature is distant.
  for (const x of [-0.012, 0.012]) {
    const marker = box(model, [0.006, 0.004, 0.0015], [x, 0.01, -0.023], yellow, 'warning');
    marker.rotation.z = 0.35;
  }
  const yaw = new T.Group();
  yaw.name = 'rotation-horizontale';
  yaw.position.y = 0.02;
  model.add(yaw);

  box(yaw, [0.035, 0.018, 0.033], [0, 0.009, 0], olive, 'carter');
  for (const x of [-1, 1]) {
    const plate = box(
      yaw,
      [0.005, 0.014, 0.032],
      [x * 0.019, 0.009, 0],
      sand,
      'blindage-lateral',
    );
    plate.rotation.z = x * 0.12;
    box(yaw, [0.007, 0.008, 0.006], [x * 0.015, 0.012, -0.017], yellow, 'carenage-avant');
  }
  box(yaw, [0.02, 0.003, 0.023], [0, 0.02, 0], oliveDark, 'toit');
  // Explicitly visible optical sight and independent radar antenna.
  box(yaw, [0.012, 0.011, 0.009], [-0.005, 0.025, -0.008], dark, 'optique');
  const lens = mesh(
    yaw,
    new T.CylinderGeometry(0.0039, 0.0039, 0.0015, 8),
    eye,
    -0.005,
    0.025,
    -0.013,
    'lentille',
  );
  lens.rotation.x = Math.PI / 2;
  const radar = new T.Group();
  radar.name = 'radar-independant';
  radar.position.set(0.003, 0.032, 0.002);
  yaw.add(radar);
  box(radar, [0.004, 0.009, 0.004], [0, 0.003, 0], dark, 'support');
  const panel = box(radar, [0.018, 0.005, 0.013], [0, 0.009, 0], sand, 'capteur-superieur');
  panel.rotation.x = -0.18;

  box(yaw, [0.002, 0.02, 0.002], [0.017, 0.025, 0.009], dark, 'antenne');
  mesh(yaw, new T.SphereGeometry(0.0025, 6, 4), yellow, 0.017, 0.036, 0.009, 'balise');
  box(yaw, [0.004, 0.006, 0.015], [-0.019, 0.006, 0.008], orange, 'cable');

  const pitch = new T.Group();
  pitch.name = 'elevation-canon';
  pitch.position.set(0.006, 0.011, -0.015);
  yaw.add(pitch);
  box(pitch, [0.015, 0.013, 0.017], [0, 0, -0.005], dark, 'culasse');
  box(pitch, [0.011, 0.009, 0.013], [0, 0, -0.013], sand, 'cache-canon');
  const barrel = mesh(
    pitch,
    new T.CylinderGeometry(0.0026, 0.0035, 0.042, 8),
    dark,
    0,
    0,
    -0.033,
    'canon-unique',
  );
  barrel.rotation.x = Math.PI / 2;
  const muzzle = mesh(
    pitch,
    new T.CylinderGeometry(0.0041, 0.0041, 0.006, 8),
    oliveDark,
    0,
    0,
    -0.054,
    'frein-de-bouche',
  );
  muzzle.rotation.x = Math.PI / 2;
  return { group: model, yaw, pitch, radar, lens, muzzle };
}
