import { BRICK_POSITIONS, BRICK_INDICES } from './meshy-brick-data.js';

// Convert the Meshy front-facing studs to the top, then normalize one brick.
export function brickGeometry(T) {
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(BRICK_POSITIONS, 3));
  geometry.setIndex(BRICK_INDICES);
  geometry.rotateX(-Math.PI / 2);
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
  const columns = Math.max(1, Math.ceil(length / 0.024));
  const pitch = length / columns;
  const bricks = [];
  for (let row = 0; row < 3; row++) {
    const edges =
      row % 2
        ? [0, ...Array.from({ length: columns }, (_, i) => (i + 0.5) * pitch), length]
        : Array.from({ length: columns + 1 }, (_, i) => i * pitch);
    for (let i = 0; i < edges.length - 1; i++)
      bricks.push({
        x: (edges[i] + edges[i + 1]) / 2 - length / 2,
        y: row * 0.006,
        width: Math.max(0.0001, edges[i + 1] - edges[i] - 0.0002),
        color: (i + row * 2) % 4,
      });
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
    transform.scale.set(brick.width, 0.007, 0.008);
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
