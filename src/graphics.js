export function createGraphics(T, scene) {
  const materials = new Map();
  function mat(c) {
    if (!materials.has(c))
      materials.set(c, new T.MeshStandardMaterial({ color: c, roughness: 0.75 }));
    return materials.get(c);
  }
  function box(x, y, z, w, h, d, c, parent = scene) {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat(c));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function cyl(x, y, z, rt, rb, h, c, parent = scene) {
    const m = new T.Mesh(new T.CylinderGeometry(rt, rb, h, 28), mat(c));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function ball(x, y, z, r, c, parent = scene) {
    const m = new T.Mesh(new T.SphereGeometry(r, 12, 8), mat(c));
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  }
  function textLabel(text, color = '#d5ef73', scale = 12) {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 128;
    const ctx = c.getContext('2d');
    ctx.font = 'bold 70px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.fillText(text, 512, 90);
    const tex = new T.CanvasTexture(c);
    const s = new T.Sprite(
      new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }),
    );
    s.scale.set(scale, scale / 8, 1);
    return s;
  }
  function makePlane(color) {
    const g = new T.Group();
    box(0, 0, 0, 0.8, 0.65, 3.3, color, g);
    const wing = box(0, 0, 0.2, 5.6, 0.13, 0.95, color, g);
    box(0, 0.25, 1.2, 1.9, 0.1, 0.6, color, g);
    box(0, 0.6, 1.2, 0.12, 0.8, 0.7, color, g);
    box(0, 0.42, -0.35, 0.5, 0.32, 0.9, '#254b47', g);
    const prop = box(0, 0, -1.9, 2.1, 0.12, 0.1, '#263d32', g);
    ball(0, 0, -1.7, 0.35, '#e4e5c3', g);
    // Fixed miniature landing gear rests on the deck at the shared parked pose.
    for (const x of [-0.5, 0.5]) {
      box(x, -0.5, -0.6, 0.1, 0.5, 0.1, '#465f51', g);
      const wheel = cyl(x, -0.75, -0.6, 0.3, 0.3, 0.16, '#263d32', g);
      wheel.rotation.z = Math.PI / 2;
    }
    const tailWheel = cyl(0, -0.88, 1.25, 0.17, 0.17, 0.12, '#263d32', g);
    tailWheel.rotation.z = Math.PI / 2;
    const cowl = cyl(0, 0, -1.05, 0.41, 0.41, 1.1, '#b7c9a1', g);
    cowl.rotation.x = Math.PI / 2;
    const gunMeshes = [];
    for (const x of [-1.35, 1.35]) {
      gunMeshes.push(box(x, 0.03, -0.9, 0.085, 0.085, 0.7, '#334a3b', g));
      box(x, -0.08, 0.2, 0.035, 0.12, 0.85, '#bcc998', g);
    }
    for (const x of [-0.44, 0.44])
      for (let i = 0; i < 4; i++) box(x, 0.12, -1.35 + i * 0.18, 0.1, 0.1, 0.1, '#5c6351', g);
    box(0, 0.47, -0.12, 0.52, 0.035, 0.035, '#c3d2ad', g);
    box(0, 0.47, -0.6, 0.52, 0.035, 0.035, '#c3d2ad', g);
    g.userData = { wing, prop, gunMeshes };
    scene.add(g);
    return g;
  }
  function makeSpitfire(color) {
    const g = makePlane(color);
    g.userData.wing.visible = false;
    for (const gun of g.userData.gunMeshes) gun.visible = false;
    // Elliptical wings and six barrels distinguish the S6.
    const outline = new T.Shape();
    outline.absellipse(0, 0, 3.1, 0.7, 0, Math.PI * 2, false, 0);
    const wing = new T.Mesh(
      new T.ExtrudeGeometry(outline, { depth: 0.1, bevelEnabled: false, curveSegments: 24 }),
      mat(color),
    );
    wing.rotation.x = Math.PI / 2;
    wing.position.z = 0.15;
    g.add(wing);
    g.userData.wing = wing;
    const muzzles = [];
    for (const side of [-1, 1])
      for (const x of [1.35, 1.95, 2.5]) {
        const z = -0.55 * Math.sqrt(1 - (x / 3.1) ** 2) + 0.15;
        box(side * x, 0.03, z - 0.17, 0.065, 0.065, 0.4, '#334a3b', g);
        const muzzle = new T.Object3D();
        muzzle.position.set(side * x, 0.03, z - 0.37);
        g.add(muzzle);
        muzzles.push(muzzle);
      }
    g.userData.muzzles = muzzles;
    g.userData.vehicleType = 'spitfire';
    return g;
  }
  function makeBomber(color) {
    const g = new T.Group();
    const fuselage = ball(0, 0, 0, 1, color, g);
    fuselage.scale.set(0.66, 0.5, 3.6);
    box(0, -0.1, 0, 1.05, 0.62, 5.8, color, g);
    const nose = ball(0, 0.06, -3.1, 0.63, '#6f9290', g);
    nose.scale.set(0.8, 0.75, 1.1);
    for (const x of [-0.35, 0.35]) box(x, 0.48, -2.6, 0.045, 0.08, 1.1, '#a9bda7', g);
    for (let z = -1.6; z < 2.4; z += 0.65)
      for (const x of [-0.65, 0.65]) box(x, 0.13, z, 0.025, 0.19, 0.3, '#344d48', g);
    box(0, -0.47, 0.5, 0.7, 0.035, 2.5, '#596a52', g);
    const wing = box(0, 0, -0.3, 11.3, 0.2, 1.6, color, g);
    box(0, 0.25, 3.1, 4, 0.15, 1, color, g);
    for (const x of [-1.5, 1.5]) box(x, 0.85, 3.1, 0.16, 1.3, 0.9, color, g);
    box(0, 0.5, -2.1, 0.9, 0.55, 1.7, '#436762', g);
    const props = [];
    for (const x of [-2.6, 2.6]) {
      const nacelle = ball(x, 0, -0.8, 0.55, color, g);
      nacelle.scale.set(0.7, 0.75, 2.1);
      const cowling = cyl(x, 0, -1.6, 0.42, 0.44, 0.55, '#aeb597', g);
      cowling.rotation.x = Math.PI / 2;
      for (let j = 0; j < 4; j++)
        box(x + 0.43, 0.05, -1.3 + j * 0.24, 0.08, 0.1, 0.12, '#4a5143', g);
      const prop = box(x, 0, -2, 2.2, 0.13, 0.1, '#29483a', g);
      props.push(prop);
    }
    for (const x of [-0.8, 0.8]) {
      box(x, -0.7, -1.4, 0.12, 0.8, 0.12, '#4b6254', g);
      const w = cyl(x, -1.1, -1.4, 0.35, 0.35, 0.2, '#263d32', g);
      w.rotation.z = Math.PI / 2;
    }
    const wheel = cyl(0, -1.28, 2.7, 0.17, 0.17, 0.12, '#263d32', g);
    wheel.rotation.z = Math.PI / 2;
    const turrets = [];
    for (const z of [0.1, 2.9]) {
      const pivot = new T.Group();
      pivot.position.set(0, 0.8, z);
      g.add(pivot);
      const ring = cyl(0, -0.18, 0, 0.42, 0.46, 0.16, '#657d6c', pivot);
      box(0, -0.08, 0.18, 0.42, 0.22, 0.38, '#718574', pivot);
      const pitch = new T.Group();
      pivot.add(pitch);
      box(0, 0, -0.65, 0.1, 0.1, 1.3, '#263e32', pitch);
      box(0, -0.05, 0.05, 0.25, 0.19, 0.46, '#384d3a', pitch);
      box(0.23, -0.05, 0.1, 0.22, 0.24, 0.3, '#a39569', pitch);
      for (let j = 0; j < 6; j++)
        box(0.09, 0, -0.3 - j * 0.12, 0.015, 0.045, 0.045, '#899281', pitch);
      const jacket = cyl(0, 0, -0.72, 0.07, 0.07, 0.75, '#48594d', pitch);
      jacket.rotation.x = Math.PI / 2;
      for (const x of [-0.12, 0.12]) box(x, -0.17, 0.3, 0.045, 0.22, 0.045, '#3e4d3c', pitch);
      const muzzle = new T.Object3D();
      muzzle.position.set(0, 0, -1.3);
      pitch.add(muzzle);
      pivot.userData = { pitch, muzzle };
      turrets.push(pivot);
    }
    g.userData = { wing, prop: props[0], props, turrets };
    scene.add(g);
    return g;
  }
  function makeStuka(color) {
    const g = makePlane(color);
    g.userData.wing.visible = false;
    for (const side of [-1, 1]) {
      const inner = box(side * 1.1, -0.18, 0.1, 2.3, 0.16, 1.2, color, g);
      inner.rotation.z = side * -0.18;
      const outer = box(side * 2.8, -0.16, 0.1, 2.1, 0.12, 0.85, color, g);
      outer.rotation.z = side * 0.1;
      const strut = cyl(side * 1.25, -0.5, -0.55, 0.055, 0.055, 0.55, '#364438', g);
      strut.rotation.z = side * 0.14;
      const wheel = cyl(side * 1.29, -0.8, -0.55, 0.22, 0.22, 0.18, '#26352e', g);
      wheel.rotation.z = Math.PI / 2;
      const fairing = ball(side * 1.29, -0.74, -0.55, 0.2, color, g);
      fairing.scale.set(0.55, 1, 1.7);
      box(side * 2.3, -0.27, -0.25, 1.25, 0.035, 0.18, '#526b56', g);
      const bomb = makeBomb();
      bomb.scale.setScalar(0.32);
      bomb.position.set(side * 1.6, -0.46, 0.1);
      g.add(bomb);
    }
    box(0, 0.38, 0.15, 0.6, 0.4, 1.8, '#496565', g);
    g.userData.vehicleType = 'interceptor';
    return g;
  }
  function makeBomb() {
    const g = new T.Group();
    const body = ball(0, 0, 0, 0.35, '#3c4937', g);
    body.scale.set(1, 1, 2.6);
    const nose = ball(0, 0, -0.65, 0.25, '#536044', g);
    nose.scale.z = 1.3;
    box(0, 0, 0.73, 0.9, 0.045, 0.5, '#59664b', g);
    box(0, 0, 0.73, 0.045, 0.9, 0.5, '#59664b', g);
    g.userData.projectileSolid = false;
    return g;
  }
  function makeTank(color) {
    const g = new T.Group();
    box(0, 0.05, 0, 2.6, 0.9, 3.8, color, g);
    box(0, 0.55, 0, 2.15, 0.4, 3.2, color, g);
    for (const side of [-1, 1]) {
      box(side * 1.5, -0.1, 0, 0.55, 0.9, 4.1, '#28372e', g);
      for (let i = 0; i < 7; i++) {
        const wheel = cyl(side * 1.65, -0.1, -1.5 + i * 0.5, 0.32, 0.32, 0.18, '#59654b', g);
        wheel.rotation.z = Math.PI / 2;
      }
    }
    const turrets = [];
    for (const [y, z, length] of [
      [1, 0, 2.8],
      [1.8, 0.7, 1.3],
    ]) {
      const mount = new T.Group();
      mount.position.set(0, y, z);
      g.add(mount);
      box(0, 0, 0, 1.2, 0.55, 1.5, color, mount);
      const pitch = new T.Group();
      mount.add(pitch);
      box(0, 0, -length / 2, 0.15, 0.15, length, '#364439', pitch);
      const muzzle = new T.Object3D();
      muzzle.position.set(0, 0, -length);
      pitch.add(muzzle);
      const coaxMuzzle = new T.Object3D();
      coaxMuzzle.position.set(0.3, 0, -length);
      pitch.add(coaxMuzzle);
      if (turrets.length === 0) box(0.3, 0, -length / 2, 0.065, 0.065, length, '#293e31', pitch);
      mount.userData = { pitch, muzzle, coaxMuzzle };
      turrets.push(mount);
    }
    box(0.7, 0.5, -2, 0.09, 0.09, 0.8, '#293e31', g);
    g.userData = { turrets, prop: new T.Object3D(), wing: new T.Object3D() };
    scene.add(g);
    return g;
  }
  function makeHelicopter(color) {
    const g = new T.Group();
    box(0, 0, 0, 1.5, 1.3, 4.6, color, g);
    box(0, 0.6, -1.8, 0.95, 0.7, 1.4, '#254b47', g);
    box(0, 1.05, -0.7, 1, 0.7, 1.1, '#254b47', g);
    box(0, 0.25, 3, 0.4, 0.45, 3.5, color, g);
    box(0, 0.9, 4.6, 0.12, 1.7, 0.8, color, g);
    box(0, 0, 0.2, 5.4, 0.17, 0.9, color, g);
    for (const side of [-1, 1]) {
      const pod = cyl(side * 2.15, -0.25, -0.4, 0.4, 0.4, 1.8, '#364439', g);
      pod.rotation.x = Math.PI / 2;
      box(side * 0.65, -0.75, 0, 0.2, 0.5, 2.5, '#28372e', g);
    }
    cyl(0, 1.15, 0, 0.12, 0.12, 1, color, g);
    const rotor = new T.Group();
    rotor.position.y = 1.7;
    g.add(rotor);
    box(0, 0, 0, 8.6, 0.06, 0.18, '#28372e', rotor);
    box(0, 0, 0, 0.18, 0.06, 8.6, '#28372e', rotor);
    const mount = new T.Group();
    mount.position.set(0, -0.65, -2);
    g.add(mount);
    const pitch = new T.Group();
    mount.add(pitch);
    box(0.15, 0, -0.6, 0.12, 0.12, 1.2, '#364439', pitch);
    const muzzle = new T.Object3D();
    muzzle.position.set(0.15, 0, -1.2);
    pitch.add(muzzle);
    mount.userData = { pitch, muzzle };
    g.userData = { turrets: [mount], rotor, prop: new T.Object3D(), wing: new T.Object3D() };
    scene.add(g);
    return g;
  }
  function makeFlakTruck(color) {
    const g = new T.Group();
    box(0, 0, -2.5, 1.65, 0.5, 3.6, color, g);
    box(0, 0.9, -3.1, 1.8, 1.5, 1.6, color, g);
    box(0, 1.12, -3.92, 1.5, 0.55, 0.04, '#254b47', g);
    const trailer = new T.Group();
    trailer.position.z = -0.7;
    g.add(trailer);
    box(0, 0.15, 2.3, 2.1, 0.4, 5.4, color, trailer);
    for (const [parent, zs] of [
      [g, [-3.3, -1.4]],
      [trailer, [3.2, 4.1]],
    ])
      for (const z of zs)
        for (const side of [-1, 1]) {
          const wheel = cyl(side * 1, -0.25, z, 0.5, 0.5, 0.3, '#28372e', parent);
          wheel.rotation.z = Math.PI / 2;
        }
    const mount = new T.Group();
    mount.position.set(0, 1, 3.2);
    trailer.add(mount);
    cyl(0, -0.3, 0, 0.75, 0.9, 0.6, color, mount);
    const pitch = new T.Group();
    mount.add(pitch);
    box(0, 0, -1.4, 0.16, 0.16, 2.8, '#364439', pitch);
    const muzzle = new T.Object3D();
    muzzle.position.z = -2.8;
    pitch.add(muzzle);
    mount.userData = { pitch, muzzle, coaxMuzzle: muzzle };
    g.userData = { turrets: [mount], trailer, prop: new T.Object3D(), wing: new T.Object3D() };
    scene.add(g);
    return g;
  }
  function insect(type = 'midge') {
    const g = new T.Group();
    g.userData.hitTolerance = type === 'midge' ? 1.2 : 1;
    if (type === 'ant' || type === 'roach') {
      const shell = ball(
        0,
        0,
        0,
        type === 'roach' ? 0.55 : 0.35,
        type === 'roach' ? '#775033' : '#4f3026',
        g,
      );
      shell.scale.set(0.7, 0.45, 1.3);
      const head = ball(0, 0, -0.55, 0.25, '#392c21', g),
        legs = [];
      if (type === 'ant') ball(0, 0, 0.5, 0.3, '#5e3b29', g);
      for (const side of [-1, 1])
        for (let i = 0; i < 3; i++) {
          const leg = box(side * 0.45, -0.1, (i - 1) * 0.3, 0.65, 0.035, 0.045, '#382c23', g);
          leg.rotation.z = side * 0.3;
          legs.push(leg);
        }
      for (const x of [-0.12, 0.12]) {
        const antenna = box(x, 0.06, -0.87, 0.025, 0.025, 0.5, '#49362b', g);
        antenna.rotation.y = x * 3;
      }
      g.userData = { wings: [], legs, hitParts: [shell, head], disposables: [], hitTolerance: 1 };
      scene.add(g);
      return g;
    }
    const body = ball(0, 0, 0, 0.5, '#393e2b', g);
    body.scale.set(0.7, 0.7, 1.4);
    const head = ball(
      0,
      0.18,
      -0.55,
      0.3,
      { midge: '#c6b96e', dart: '#d78253', guard: '#729d8b', brute: '#d0a14b' }[type],
      g,
    );
    const wm = new T.MeshStandardMaterial({
      color: '#edf2d5',
      transparent: true,
      opacity: 0.55,
      side: T.DoubleSide,
    });
    const wings = [];
    for (const s of [-1, 1]) {
      const w = new T.Mesh(new T.SphereGeometry(1, 8, 6), wm);
      w.scale.set(1, 0.025, 0.45);
      w.position.set(s * 0.8, 0.15, 0);
      g.add(w);
      wings.push(w);
    }
    if (type === 'guard' || type === 'brute') {
      const shell = ball(0, 0.12, 0.12, 0.53, type === 'brute' ? '#be8c3d' : '#527e70', g);
      shell.scale.set(0.76, 0.55, 1.2);
      for (const z of [-0.2, 0.15, 0.5]) box(0, 0.36, z, 0.72, 0.05, 0.1, '#273d33', g);
    }
    if (type === 'dart') {
      body.scale.z = 1.8;
      for (const x of [-0.16, 0.16]) box(x, 0.22, -0.85, 0.04, 0.04, 0.4, '#dbb26d', g);
    }
    g.userData.disposables = [wm];
    g.userData.wings = wings;
    g.userData.hitParts = [body, head, ...wings];
    scene.add(g);
    return g;
  }
  function pm(parent, w, h, d, color, x = 0, y = 0, z = 0) {
    const m = new T.Mesh(
      new T.BoxGeometry(w, h, d),
      new T.MeshStandardMaterial({ color, roughness: 0.8 }),
    );
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }
  function humanoid(color, saint = false) {
    const g = new T.Group(),
      rig = new T.Group();
    g.add(rig);
    const shirt = pm(rig, 0.8, 1.05, 0.5, color, 0, 1.3);
    shirt.userData.personalCloth = true;
    const head = ball(0, 2.12, 0, 0.34, '#edc7a0', rig);
    for (const x of [-0.13, 0.13]) ball(x, 2.17, 0.3, 0.045, '#263a43', rig);
    pm(rig, 0.12, 0.13, 0.13, '#d5aa88', 0, 2.02, 0.34);
    const legs = [];
    for (const x of [-0.23, 0.23]) {
      const pivot = new T.Group();
      pivot.position.set(x, 0.85, 0);
      rig.add(pivot);
      pm(pivot, 0.28, 0.72, 0.3, '#304552', 0, -0.35);
      pm(pivot, 0.32, 0.18, 0.5, '#233441', 0, -0.7, 0.1);
      legs.push(pivot);
    }
    const arms = [];
    for (const x of [-0.5, 0.5]) {
      const pivot = new T.Group();
      pivot.position.set(x, 1.7, 0.1);
      rig.add(pivot);
      const sleeve = pm(pivot, 0.26, 0.42, 0.28, color, 0, -0.2);
      sleeve.userData.personalCloth = true;
      const elbow = new T.Group();
      elbow.position.y = -0.4;
      pivot.add(elbow);
      const forearm = pm(elbow, 0.24, 0.36, 0.26, color, 0, -0.18);
      forearm.userData.personalCloth = true;
      ball(0, -0.43, 0.05, 0.2, saint ? '#edc7a0' : '#e5b75c', elbow);
      arms.push({ pivot, elbow });
    }
    g.userData = { rig, legs, arms, lean: 0, leanV: 0 };
    if (saint) {
      pm(rig, 0.65, 0.38, 0.6, '#eeeece', 0, 1.93, 0.1);
      const halo = new T.Mesh(new T.TorusGeometry(0.5, 0.05, 8, 24), mat('#ffda65'));
      halo.rotation.x = Math.PI / 2;
      halo.position.y = 2.8;
      rig.add(halo);
    }
    return g;
  }

  return {
    mat,
    box,
    cyl,
    ball,
    textLabel,
    makePlane,
    makeSpitfire,
    makeBomber,
    makeStuka,
    makeBomb,
    makeTank,
    makeFlakTruck,
    makeHelicopter,
    insect,
    humanoid,
    pm,
  };
}
