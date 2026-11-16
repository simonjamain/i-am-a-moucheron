import { BRICK_PITCH, HALF_BRICK, WALL_ROWS, wallLength } from './brick-rules.js';
export { BRICK_PITCH } from './brick-rules.js';
import { BRICK_POSITIONS, BRICK_INDICES, BRICK_SOURCE } from './meshy-brick-data.js';

// Office metres. A row is one brick body tall; the 2×4 brick is half as deep as
// it is long (issue #99, approved reference). Studs rise above the body.
export const BRICK_ROW = 0.006;
export const BRICK_DEPTH = BRICK_PITCH / 2;
// Share of the normalized model height taken by the body, below the studs.
const BODY_SHARE = 0.787;
export const BRICK_HEIGHT = BRICK_ROW / BODY_SHARE;

// Normalize one brick to a unit box resting on y = 0, studs up.
export function brickGeometry(T) {
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(BRICK_POSITIONS, 3));
  geometry.setIndex(BRICK_INDICES);
  if (BRICK_SOURCE?.up !== 'y') geometry.rotateX(-Math.PI / 2);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const size = box.getSize(new T.Vector3());
  const center = box.getCenter(new T.Vector3());
  geometry.translate(-center.x, -box.min.y, -center.z);
  geometry.scale(1 / size.x, 1 / size.y, 1 / size.z);
  geometry.computeVertexNormals();
  return geometry;
}

// Integer columns fill the chosen length; half bricks stagger alternate rows.
export function brickLayout(length) {
  const span = wallLength(length);
  const bricks = [];
  for (let row = 0; row < WALL_ROWS; row++) {
    for (let x = 0, i = 0; x < span - 1e-9; i++) {
      const width = Math.min(BRICK_PITCH, span - x);
      bricks.push({
        x: x + width / 2 - length / 2 + row * HALF_BRICK,
        y: row * BRICK_ROW,
        width: width - 0.0002,
        color: (i + row * 2) % 4,
      });
      x += width;
    }
  }
  return bricks;
}
export function createBrickWall(T, structure) {
  const length = Math.hypot(structure.b[0] - structure.a[0], structure.b[1] - structure.a[1]);
  const bricks = brickLayout(length);
  const mesh = new T.InstancedMesh(brickGeometry(T), new T.MeshLambertMaterial(), bricks.length);
  const transform = new T.Object3D();
  const palette = ['#cc4938', '#e5b63e', '#417dab', '#609254'];
  bricks.forEach((brick, i) => {
    transform.position.set(brick.x, brick.y, 0);
    transform.scale.set(brick.width, BRICK_HEIGHT, BRICK_DEPTH);
    transform.updateMatrix();
    mesh.setMatrixAt(i, transform.matrix);
    mesh.setColorAt(i, new T.Color(palette[brick.color]));
  });
  mesh.position.set(
    (structure.a[0] + structure.b[0]) / 2,
    0,
    (structure.a[1] + structure.b[1]) / 2,
  );
  mesh.rotation.y = -Math.atan2(structure.b[1] - structure.a[1], structure.b[0] - structure.a[0]);
  mesh.visible = structure.hp > 0;
  mesh.computeBoundingSphere();
  return mesh;
}
