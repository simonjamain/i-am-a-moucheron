import { hitUserData } from './insect-hits.ts';
import { buildMeshyRig, gunMount } from './meshy-rig.ts';
import { rigWheels } from './aircraft-wheels.ts';
import { MODEL_DATA as SPITFIRE } from './meshy-spitfire-data.ts';
import { MODEL_DATA as TANK } from './meshy-tank-data.ts';
import { MODEL_DATA as FLAKTRUCK } from './meshy-flaktruck-data.ts';
import { MODEL_DATA as STUKA } from './meshy-stuka-data.ts';
import { AXLE_PARTS } from './tank-gear.ts';
import { prepareBelts, prepareSuspension } from './track-suspension.ts';
import { makeH2 } from './h2-model.ts';
import { makeBiplane, makeBiplaneBomber } from './biplane-model.ts';
import { makeM1 } from './m1-model.ts';
import { makeB3 } from './b3-model.ts';
import { makeCastorMeshy } from './castor-model.ts';
import { makeFlyingCastorMeshy } from './flying-castor-model.ts';
import { createCharacter, CHARACTER_HEIGHT, LEGACY_HEIGHT } from './character-model.ts';
import { createMidgeRig } from './midge-model.ts';
import { WALKERS, walkerStride } from './walker-batch.ts';
import { FLYERS } from './flyer-batch.ts';
import { TAU } from './rigged-creature.ts';
import type { CreatureRig } from './rigged-creature.ts';
import {
  FLYER_HIT_TOLERANCE,
  GROUND_LEGS,
  MIDGE_HIT_TOLERANCE,
  MIDGE_SPHERE_RADIUS,
} from './scale.ts';
import type * as THREE from 'three/webgpu';
import type { Three } from './types.ts';
import type { WalkerType } from './walker-batch.ts';
import type { FlyerType } from './flyer-batch.ts';

/** A colour accepted by `MeshStandardMaterial({ color })`. */
type Color = THREE.ColorRepresentation;
type Character = ReturnType<typeof createCharacter>;
/** The model factory every scene module receives (`createGraphics(T, scene)`). */
export type Graphics = ReturnType<typeof createGraphics>;

export function createGraphics(T: Three, scene: THREE.Object3D) {
  const materials = new Map<Color, THREE.MeshStandardMaterial>();
  function mat(c: Color): THREE.MeshStandardMaterial {
    if (!materials.has(c))
      materials.set(c, new T.MeshStandardMaterial({ color: c, roughness: 0.75 }));
    return materials.get(c)!;
  }
  function box(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    c: Color,
    parent: THREE.Object3D = scene,
  ) {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat(c));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function cyl(
    x: number,
    y: number,
    z: number,
    rt: number,
    rb: number,
    h: number,
    c: Color,
    parent: THREE.Object3D = scene,
  ) {
    const m = new T.Mesh(new T.CylinderGeometry(rt, rb, h, 28), mat(c));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function ball(
    x: number,
    y: number,
    z: number,
    r: number,
    c: Color,
    parent: THREE.Object3D = scene,
  ) {
    const m = new T.Mesh(new T.SphereGeometry(r, 12, 8), mat(c));
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  }
  function textLabel(text: string, color = '#d5ef73', scale = 12): THREE.Sprite {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 128;
    const ctx = c.getContext('2d')!;
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
  // `color` is kept for callers; the Meshy biplane carries its own livery.
  function makePlane(color?: Color) {
    return makeBiplane(T, scene);
  }
  // Remodelled Spitfire: real propeller, wings and six wing-gun muzzles.
  function makeSpitfire() {
    const { root: g, nodes, anchors } = buildMeshyRig(T, SPITFIRE, 'spitfire');
    g.userData = {
      wing: nodes.wing,
      prop: nodes.prop,
      gunMeshes: [],
      pilotMuzzles: anchors.gun,
      muzzles: anchors.gun,
      vehicleType: 'spitfire',
      preserveTexture: true,
    };
    rigWheels(g, nodes, 'spitfire');
    scene.add(g);
    return g;
  }
  function makeBomber() {
    return makeBiplaneBomber(T, scene);
  }
  // The original light fighter and four-seat medium bomber (shop purchases).
  function makeLightFighter() {
    const g = makeM1(T, scene);
    g.userData.vehicleType = 'lightfighter';
    return g;
  }
  function makeMediumBomber() {
    return makeB3(T, scene);
  }
  // Remodelled Stuka: gull wings, propeller and two wing guns; its belly bomb
  // is part of the hull.
  function makeStuka() {
    const { root: g, nodes, anchors } = buildMeshyRig(T, STUKA, 'stuka');
    g.userData = {
      wing: nodes.wing,
      prop: nodes.prop,
      gunMeshes: [],
      pilotMuzzles: anchors.gun,
      muzzles: anchors.gun,
      vehicleType: 'interceptor',
      preserveTexture: true,
    };
    rigWheels(g, nodes, 'interceptor');
    scene.add(g);
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
  // Remodelled T3: turret with elevating gun and coaxial MG, roof MG on its
  // own pintle (carried by the turret), hull MG for the driver.
  function makeTank() {
    const { root: g, nodes, anchors } = buildMeshyRig(T, TANK, 'tank');
    const main = gunMount(nodes.cannon, nodes.cannonGun, anchors.muzzle[0], anchors.coax[0]);
    main.userData.barrel = nodes.cannonBarrel; // slides back when the gun fires
    const top = gunMount(nodes.top, nodes.topGun, anchors.topMuzzle[0]);
    // Running gear (parts of the rig): the road wheels, idlers and sprockets spin with their
    // track; the two belts are meshes of their own (the deformable tracks draw them).
    const gear = [
      ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => nodes['roadWheel' + i]),
      ...[0, 1].map((i) => nodes['idler' + i]),
      ...[0, 1].map((i) => nodes['sprocket' + i]),
    ];
    for (const wheel of gear) {
      const geometry = (wheel.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh)
        .geometry;
      geometry.computeBoundingBox();
      wheel.userData.radius = (geometry.boundingBox!.max.y - geometry.boundingBox!.min.y) / 2;
    }
    // Deformable tracks: own, finely cut belt geometry, and wheels that ride the terrain.
    const tracks = [nodes.trackL, nodes.trackR];
    prepareBelts(T, tracks);
    g.userData = {
      preserveTexture: true,
      runningGear: gear,
      tracks,
      suspension: prepareSuspension(nodes, AXLE_PARTS),
      turrets: [main, top],
      pilotMuzzles: anchors.hullGun,
      prop: new T.Object3D(),
      wing: new T.Object3D(),
    };
    scene.add(g);
    return g;
  }
  function makeCastor() {
    return makeCastorMeshy(T, scene);
  }
  function makeFlyingCastor() {
    return makeFlyingCastorMeshy(T, scene);
  }
  // `color` is kept for callers; the Meshy H2 carries its own livery.
  function makeHelicopter(color?: Color) {
    return makeH2(T, scene);
  }
  // Remodelled D2: truck towing an articulated trailer whose carriage yaws
  // and whose twin guns elevate; pivots match src/vehicle-anchors.ts.
  function makeFlakTruck() {
    const { root: g, nodes, anchors } = buildMeshyRig(T, FLAKTRUCK, 'flaktruck');
    g.userData = {
      preserveTexture: true,
      turrets: [gunMount(nodes.cannon, nodes.cannonGun, anchors.muzzle[0])],
      trailer: nodes.trailer,
      // Wheels (parts of the rig): the tractor's six, steered and spun, and the trailer's four.
      truckWheels: [0, 1, 2, 3, 4, 5].map((i) => nodes['wheel' + i]),
      trailerWheels: [0, 1, 2, 3].map((i) => nodes['trailerWheel' + i]),
      prop: new T.Object3D(),
      wing: new T.Object3D(),
    };
    scene.add(g);
    return g;
  }

  function insect(type: string = 'midge'): THREE.Group {
    const g = new T.Group();
    g.userData.hitTolerance = type === 'midge' ? MIDGE_HIT_TOLERANCE : 1;
    if ((WALKERS as Record<string, unknown>)[type]) {
      // Rigged Meshy walkers (corpses, purgatory souls, non-WebGL fallback).
      // Living WebGL walkers are drawn by WalkerBatch; hits use the ellipsoid.
      const walker = WALKERS[type as WalkerType];
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
        animate(dt: number, { speed = 0 }: { speed?: number } = {}) {
          if (speed > 1e-6)
            rig.pose(rig.phase + (speed * dt) / walkerStride(type as WalkerType, g.scale.x));
        },
      };
      scene.add(g);
      return g;
    }
    if ((FLYERS as Record<string, unknown>)[type]) {
      // Rigged Meshy flyers (corpses, purgatory souls, non-WebGL fallback).
      // Living WebGL flyers are drawn by FlyerBatch; hits use the ellipsoid.
      const flyer = FLYERS[type as FlyerType];
      const rig: CreatureRig & { animate?: (ms: number, phase?: number) => CreatureRig } =
        flyer.creature.createRig(T);
      rig.mesh.castShadow = true;
      // Flight cycle at time `ms` for a flyer whose roster phase is in radians.
      rig.animate = (ms: number, phase = 0) => rig.pose(ms / 1000 / flyer.flight.loop + phase / TAU);
      g.add(rig.container);
      g.userData = {
        enemyType: type,
        wings: [],
        legs: [],
        hitParts: [],
        disposables: [rig.mesh.material],
        hitTolerance: FLYER_HIT_TOLERANCE,
        ...hitUserData(flyer.hit),
        flight: rig,
        // Purgatory souls keep beating their wings.
        animate(dt: number) {
          rig.pose(rig.phase + dt / flyer.flight.loop);
        },
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
        hitTolerance: MIDGE_HIT_TOLERANCE,
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
        legs: THREE.Mesh[] = [];
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
      (
        {
          midge: '#c6b96e',
        } as Record<string, string>
      )[type],
      g,
    );
    const wm = new T.MeshStandardMaterial({
      color: '#edf2d5',
      transparent: true,
      opacity: 0.55,
      side: T.DoubleSide,
    });
    const wings: THREE.Mesh[] = [];
    for (const s of [-1, 1]) {
      const w = new T.Mesh(new T.SphereGeometry(1, 8, 6), wm);
      w.scale.set(1, 0.025, 0.45);
      w.position.set(s * 0.8, 0.15, 0);
      g.add(w);
      wings.push(w);
    }
    g.userData.disposables = [wm];
    g.userData.wings = wings;
    g.userData.hitParts = [body, head, ...wings];
    if (type === 'midge') g.userData.sphereRadius = MIDGE_SPHERE_RADIUS;
    scene.add(g);
    return g;
  }
  function pm(
    parent: THREE.Object3D,
    w: number,
    h: number,
    d: number,
    color: Color,
    x = 0,
    y = 0,
    z = 0,
  ) {
    const m = new T.Mesh(
      new T.BoxGeometry(w, h, d),
      new T.MeshStandardMaterial({ color, roughness: 0.8 }),
    );
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }
  // Issue #111: players use the Meshy/Mixamo character, the same model and
  // animations everywhere (office, purgatory, turret seat). Nobody carries a weapon.
  // `appearance`: id from character-appearances.ts (default if unknown or not
  // loaded yet). userData.setAppearance(id) swaps the model in place, keeping
  // everything attached to the group.
  // The second argument is no longer used (it chose the former blocky Saint Pierre).
  function humanoid(color?: Color, _unused = false, appearance?: unknown): THREE.Group {
    const g = new T.Group();
    let character: Character;
    function wear(id: unknown) {
      if (character) g.remove(character.container);
      character = createCharacter(T, id);
      character.container.scale.setScalar(LEGACY_HEIGHT / CHARACTER_HEIGHT);
      g.add(character.container);
      g.userData.character = character;
      g.userData.appearance = character.appearance;
    }
    g.userData = {
      setAppearance(id: unknown) {
        if (id !== character.appearance) wear(id);
      },
      // state: { speed, seated, falling, parachute }
      animate(dt: number, state: Parameters<Character['update']>[1] = {}) {
        character.update(dt, state);
      },
    };
    wear(appearance);
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
    makeLightFighter,
    makeMediumBomber,
    makeStuka,
    makeBomb,
    makeTank,
    makeFlakTruck,
    makeCastor,
    makeFlyingCastor,
    makeHelicopter,
    insect,
    humanoid,
    pm,
  };
}
