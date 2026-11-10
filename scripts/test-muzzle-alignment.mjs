import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from '../vendor/three.module.min.js';
import { createGraphics } from '../src/graphics.js';
import { nextPilotMuzzle } from '../src/muzzle.js';
import { CombatEffects } from '../src/combat.js';
import { ACTOR_UNIT } from '../src/scale.js';

const scene = new T.Scene();
const graphics = createGraphics(T, scene);
const effects = new CombatEffects(T, scene);
const variants = [
  ['fighter', graphics.makePlane('#fff'), 2],
  ['interceptor', graphics.makeStuka('#fff'), 2],
  ['spitfire', graphics.makeSpitfire('#fff'), 6],
  ['tank', graphics.makeTank('#fff'), 1],
];

assert.equal(nextPilotMuzzle(T, new T.Group()), null, 'unarmed models have no pilot muzzle');
for (const [name, model, count] of variants) {
  const muzzles = model.userData.pilotMuzzles;
  assert.equal(muzzles?.length, count, name + ' should expose every pilot barrel');
  model.position.set(0.22, 0.93, -1.4);
  model.rotation.set(0.2, 0.6, -0.15);
  model.scale.setScalar(ACTOR_UNIT);
  model.updateWorldMatrix(true, true);

  const expected = muzzles.map((node) => {
    const barrel = node.parent;
    if (!barrel.isMesh) {
      // Remodelled Meshy rigs: the muzzle anchor rides the pivot carrying the
      // sculpted barrel, at its tip (a source vertex lies within 0.15 units).
      const tip = node.getWorldPosition(new T.Vector3());
      let nearest = Infinity;
      barrel.traverse((mesh) => {
        if (!mesh.isMesh) return;
        const p = mesh.geometry.attributes.position;
        for (let i = 0; i < p.count; i++)
          nearest = Math.min(
            nearest,
            mesh.localToWorld(new T.Vector3().fromBufferAttribute(p, i)).distanceTo(tip),
          );
      });
      assert.ok(nearest < 0.15 * ACTOR_UNIT, name + ' muzzle at a sculpted barrel tip');
      return tip;
    }
    assert.equal(node.position.x, 0);
    assert.equal(node.position.y, 0);
    const depth = barrel.geometry.parameters.depth;
    assert.ok(Math.abs(node.position.z + depth / 2) < 1e-12, name + ' muzzle at barrel tip');
    const tip = barrel.localToWorld(new T.Vector3(0, 0, -depth / 2));
    assert.ok(node.getWorldPosition(new T.Vector3()).distanceTo(tip) < 1e-10);
    return tip;
  });
  assert.equal(new Set(expected.map((v) => v.toArray().join(','))).size, count);
  for (let shot = 0; shot < count * 2; shot++) {
    const position = nextPilotMuzzle(T, model);
    assert.ok(position.distanceTo(expected[shot % count]) < 1e-10, name + ' barrel order');
    const direction = new T.Vector3(0, 0, -1).applyQuaternion(model.quaternion);
    effects.muzzle(position, direction);
    const flash = effects.items.at(-1).g;
    assert.ok(flash.position.distanceTo(expected[shot % count]) < 1e-10);
    assert.ok(
      new T.Vector3(0, 0, -1).applyQuaternion(flash.quaternion).distanceTo(direction) < 1e-10,
      name + ' flash faces the projectile direction',
    );
  }
  // Flash origins must continue to follow the model after it moves.
  model.position.x += 0.15;
  const moved = nextPilotMuzzle(T, model);
  assert.ok(moved.distanceTo(expected[0]) > 0.1);
  scene.remove(model);
}
const source = readFileSync('src/client.js', 'utf8');
assert.match(source, /nextPilotMuzzle\(T, me\)/, 'local pilot firing uses the barrel');
assert.match(source, /nextPilotMuzzle\(T, g\)/, 'remote pilot firing uses the barrel');
assert.doesNotMatch(source, /weaponBarrel|new T\.Vector3\(side, 0, -1\.2\)/);
console.log(
  'PASS: pilot muzzle flashes use actual barrel tips, alternating in local and remote firing.',
);
