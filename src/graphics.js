import { addFleetHull } from './meshy-fleet.js';
import { makeB3 } from './b3-model.js';
import { makeH2 } from './h2-model.js';
import { makeM1 } from './m1-model.js';
import { makeCastorMeshy } from './castor-model.js';
import { createCharacter, CHARACTER_HEIGHT, LEGACY_HEIGHT } from './character-model.js';
import { createMidgeRig } from './midge-model.js';
import { WALKERS, walkerStride } from './walker-batch.js';
import { GROUND_LEGS, MIDGE_SPHERE_RADIUS } from './scale.js';
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
    return makeM1(T, scene, color, box, mat);
  }
  function makeFleetPlane(color, type) {
    const g = new T.Group();
    const wing = new T.Group();
    g.add(wing);
    addFleetHull(T, type, { body: g, wing }, mat(color));
    const isStuka = type === 'stuka';
    const prop = new T.Group();
    prop.position.set(0, isStuka ? -0.1 : 0.25, isStuka ? -2.32 : -1.92);
    g.add(prop);
    box(0, 0, 0, 1.65, 0.1, 0.07, '#263d32', prop);
    box(0, 0, 0, 0.1, 1.65, 0.07, '#263d32', prop);
    const pilotMuzzles = [],
      gunMeshes = [];
    for (const side of [-1, 1]) {
      for (const x of isStuka ? [1.35] : [1.35, 1.95, 2.5]) {
        const z = isStuka ? -0.95 : -0.55 * Math.sqrt(1 - (x / 3.1) ** 2) - 0.2;
        const barrel = box(side * x, -0.22, z, 0.065, 0.065, 0.55, '#334a3b', wing);
        const muzzle = new T.Object3D();
        muzzle.position.z = -0.275;
        barrel.add(muzzle);
        pilotMuzzles.push(muzzle);
        gunMeshes.push(barrel);
      }
      if (isStuka) {
        const bomb = makeBomb();
        bomb.scale.setScalar(0.32);
        bomb.position.set(side * 1.6, -0.46, 0.1);
        g.add(bomb);
      }
    }
    g.userData = {
      wing,
      prop,
      gunMeshes,
      pilotMuzzles,
      muzzles: pilotMuzzles,
      vehicleType: isStuka ? 'interceptor' : 'spitfire',
      preserveTexture: true,
    };
    scene.add(g);
    return g;
  }
  function makeSpitfire(color) {
    return makeFleetPlane(color, 'spitfire');
  }
  function makeBomber() {
    return makeB3(T, scene, box);
  }
  function makeStuka(color) {
    return makeFleetPlane(color, 'stuka');
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
    addFleetHull(T, 'tank', { body: g }, mat(color));
    const turrets = [];
    for (const [y, z, length] of [
      [1, 0, 2.8],
      [1.8, 0.7, 1.3],
    ]) {
      const mount = new T.Group();
      mount.position.set(0, y, z);
      g.add(mount);
      const main = turrets.length === 0;
      const armor = new T.Mesh(
        new T.CylinderGeometry(main ? 0.7 : 0.34, main ? 0.9 : 0.42, main ? 0.55 : 0.4, 8),
        mat(color),
      );
      armor.scale.z = main ? 1.1 : 1.25;
      armor.castShadow = armor.receiveShadow = true;
      mount.add(armor);
      if (!main) cyl(0, -0.4, 0, 0.25, 0.3, 0.45, '#364439', mount);
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
    const pilotBarrel = box(0.7, 0.5, -2, 0.09, 0.09, 0.8, '#293e31', g);
    const pilotMuzzle = new T.Object3D();
    pilotMuzzle.position.z = -0.4;
    pilotBarrel.add(pilotMuzzle);
    g.userData = {
      preserveTexture: true,
      turrets,
      pilotMuzzles: [pilotMuzzle],
      prop: new T.Object3D(),
      wing: new T.Object3D(),
    };
    scene.add(g);
    return g;
  }
  function makeCastor() {
    return makeCastorMeshy(T, scene);
  }
  function makeHelicopter(color) {
    return makeH2(T, scene, color, box, mat);
  }
  function makeFlakTruck(color) {
    const g = new T.Group();
    const trailer = new T.Group();
    trailer.position.z = -0.7;
    g.add(trailer);
    addFleetHull(T, 'flaktruck', { body: g, trailer }, mat(color));
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
    g.userData = {
      preserveTexture: true,
      turrets: [mount],
      trailer,
      prop: new T.Object3D(),
      wing: new T.Object3D(),
    };
    scene.add(g);
    return g;
  }
  function insect(type = 'midge') {
    const g = new T.Group();
    g.userData.hitTolerance = type === 'midge' ? 1.2 : 1;
    if (type === 'rat') {
      const body = ball(0, 0.06, 0.35, 0.65, '#887363', g);
      body.scale.set(0.75, 0.55, 1.65);
      const head = ball(0, 0.11, -0.65, 0.43, '#988071', g);
      const nose = ball(0, -0.1, -1.03, 0.16, '#bc8b94', g);
      const paws = [];
      for (const side of [-1, 1]) {
        const ear = ball(side * 0.34, 0.37, -0.7, 0.24, '#bc8b94', g);
        ear.scale.z = 0.38;
        for (const z of [-0.37, 0.74]) {
          const paw = ball(side * 0.48, -0.22, z, 0.19, '#766052', g);
          paws.push(paw);
          paw.scale.set(0.9, 0.6, 1.4);
        }
        for (const z of [-1.02, -0.93]) {
          const whisker = box(side * 0.43, -0.08 + (z + 1), z, 0.76, 0.025, 0.025, '#dfb5a7', g);
          whisker.rotation.z = side * 0.2;
        }
      }
      const tail = new T.Mesh(new T.CylinderGeometry(0.07, 0.045, 2.2, 8), mat('#b58b88'));
      tail.rotation.x = Math.PI / 2;
      tail.position.set(0, -0.05, 1.9);
      g.add(tail);
      g.userData = { wings: [], legs: paws, hitParts: [body, head, nose], disposables: [] };
      scene.add(g);
      return g;
    }
    if (WALKERS[type]) {
      // Rigged Meshy walkers (corpses, purgatory souls, non-WebGL fallback).
      // Living WebGL walkers are drawn by WalkerBatch; hits use the ellipsoid.
      const walker = WALKERS[type];
      const rig = walker.creature.createRig(T);
      rig.mesh.castShadow = true;
      g.add(rig.container);
      g.userData = {
        enemyType: type,
        wings: [],
        legs: [],
        hitParts: [],
        disposables: [rig.mesh.material],
        hitTolerance: 1,
        hitEllipsoid: [...walker.hit.radii],
        hitCentre: [...walker.hit.centre],
        walk: rig,
        // Purgatory souls: walk at their physical speed (world units per second).
        animate(dt, { speed = 0 } = {}) {
          if (speed > 1e-6) rig.pose(rig.phase + (speed * dt) / walkerStride(type, g.scale.x));
        },
      };
      scene.add(g);
      return g;
    }
    if (type === 'spider' || type === 'spiderling') {
      const large = type === 'spider';
      const body = ball(0, 0.06, 0.38, 0.56, large ? '#48362f' : '#66544c', g);
      body.scale.set(0.9, 0.72, 1.12);
      const head = ball(0, 0.02, -0.48, 0.34, '#342e2b', g);
      const legs = [];
      for (const side of [-1, 1])
        for (let i = 0; i < 4; i++) {
          const leg = box(side * 0.64, -0.17, (i - 1.5) * 0.3, 0.82, 0.055, 0.055, '#382d28', g);
          leg.rotation.z = side * 0.38;
          legs.push(leg);
        }
      for (const side of [-1, 1]) ball(side * 0.17, 0.18, -0.71, 0.09, '#d28b47', g);
      g.userData = {
        wings: [],
        legs,
        hitParts: [body, head],
        disposables: [],
        ...(large ? {} : { sphereRadius: 1.2 }),
      };
      scene.add(g);
      return g;
    }
    if (type === 'midge') {
      // Rigged Meshy midge (corpses, non-WebGL fallback). Living WebGL midges
      // are drawn by MidgeBatch; hits use the sphere, not the mesh.
      const rig = createMidgeRig(T);
      rig.mesh.castShadow = true;
      g.add(rig.container);
      g.userData = {
        wings: [],
        legs: [],
        hitParts: [],
        disposables: [rig.mesh.material],
        hitTolerance: 1.2,
        sphereRadius: MIDGE_SPHERE_RADIUS,
        flight: rig,
      };
      scene.add(g);
      return g;
    }
    if (type === 'ant' || type === 'roach') {
      const shell = ball(
        0,
        0,
        0,
        type === 'roach' ? 0.55 : 0.35,
        type === 'roach' ? '#ba8850' : '#c5843b',
        g,
      );
      shell.scale.set(0.7, 0.45, 1.3);
      const head = ball(0, 0, -0.55, 0.25, '#e0bc72', g),
        legs = [];
      if (type === 'ant') ball(0, 0, 0.5, 0.3, '#d59b4d', g);
      for (const side of [-1, 1])
        for (let i = 0; i < 3; i++) {
          const leg = box(
            side * 0.45,
            GROUND_LEGS.y,
            (i - 1) * 0.3,
            GROUND_LEGS.length,
            GROUND_LEGS.thickness,
            0.045,
            '#382c23',
            g,
          );
          leg.rotation.z = side * GROUND_LEGS.tilt;
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
      {
        midge: '#c6b96e',
        dart: '#d78253',
        guard: '#729d8b',
        brute: '#d0a14b',
        mosquito: '#73918d',
      }[type],
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
    if (type === 'mosquito') {
      body.scale.set(0.42, 0.38, 1.7);
      for (const side of [-1, 1]) {
        const feeler = box(side * 0.07, 0.1, -1.1, 0.025, 0.025, 0.6, '#4d6c69', g);
        feeler.rotation.y = side * 0.15;
        for (const z of [-0.35, 0, 0.35]) {
          const leg = box(side * 0.35, -0.45, z, 0.04, 0.65, 0.04, '#4d6c69', g);
          leg.rotation.z = side * 0.25;
          leg.userData.projectileSolid = false;
        }
      }
    }
    if (type === 'dart') {
      body.scale.z = 1.8;
      for (const x of [-0.16, 0.16]) box(x, 0.22, -0.85, 0.04, 0.04, 0.4, '#dbb26d', g);
    }
    g.userData.disposables = [wm];
    g.userData.wings = wings;
    g.userData.hitParts = [body, head, ...wings];
    if (type === 'midge') g.userData.sphereRadius = MIDGE_SPHERE_RADIUS;
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
  // Issue #111: players use the Meshy/Mixamo character. The procedural pivots
  // below stay as an invisible frame (`arms`, `legs`, `rig`) so the pistol, its
  // muzzle (shot origin) and every existing caller keep exactly the same API.
  const PALM = 0.08; // wrist to grip, model metres
  function humanoid(color, saint = false) {
    if (saint) return legacyHumanoid(color, true);
    const g = new T.Group(),
      rig = new T.Group();
    g.add(rig);
    const character = createCharacter(T);
    character.container.scale.setScalar(LEGACY_HEIGHT / CHARACTER_HEIGHT);
    rig.add(character.container);
    const legs = [-0.23, 0.23].map((x) => {
      const pivot = new T.Group();
      pivot.position.set(x, 0.85, 0);
      rig.add(pivot);
      return pivot;
    });
    // Pistol frame on the character's own shoulders: the grip (0.25 below the
    // elbow, see equipPistolModel) lands in the palm when the arm is straight.
    rig.updateMatrixWorld(true);
    const at = (n) =>
      rig.worldToLocal(character.bones['mixamorig' + n].getWorldPosition(new T.Vector3()));
    const arms = ['Left', 'Right'].map((side) => {
      const shoulder = at(side + 'Arm'),
        reach = shoulder.distanceTo(at(side + 'Hand')) + PALM * (LEGACY_HEIGHT / CHARACTER_HEIGHT);
      const pivot = new T.Group();
      pivot.position.copy(shoulder);
      rig.add(pivot);
      const elbow = new T.Group();
      elbow.position.y = 0.25 - reach;
      pivot.add(elbow);
      return { pivot, elbow };
    });
    const down = new T.Vector3(0, -1, 0);
    g.userData = {
      rig,
      legs,
      arms,
      lean: 0,
      leanV: 0,
      character,
      // state: { speed, seated, falling, aim }; aim defaults to the pistol arm.
      animate(dt, state = {}) {
        let aim = state.aim;
        if (aim === undefined && g.userData.pistolMuzzle) {
          arms[1].pivot.updateWorldMatrix(true, false);
          aim = down.clone().applyQuaternion(arms[1].pivot.getWorldQuaternion(new T.Quaternion()));
        }
        character.update(dt, { ...state, aim });
      },
    };
    return g;
  }
  function legacyHumanoid(color, saint = false) {
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
    makeCastor,
    makeHelicopter,
    insect,
    humanoid,
    pm,
  };
}
