// Issue #107: readable ground pheromone trails. A soft ribbon on the floor over a
// darker underlay (contrast on light and dark floors) and chevrons that slide
// toward the bin to show the direction. Geometry helpers are pure and testable.
export const TRAIL = Object.freeze({
  width: 0.045,
  underlay: 0.08,
  height: 0.0035,
  spacing: 0.22,
  speed: 0.18,
  chevron: 0.032,
  maxChevrons: 240,
  color: '#ff8a1f',
  draft: '#fff4d6',
  shadow: '#2b1d0c',
});

// Floor polyline [[x, y, z], …] → cumulative lengths.
export function polylineLengths(points) {
  const lengths = [0];
  for (let i = 1; i < points.length; i++)
    lengths.push(
      lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][2] - points[i - 1][2]),
    );
  return lengths;
}

// Position and unit heading at distance d along the polyline.
export function sampleAt(points, lengths, d) {
  const total = lengths.at(-1);
  const t = Math.max(0, Math.min(total, d));
  let i = 1;
  while (i < lengths.length - 1 && lengths[i] < t) i++;
  const a = points[i - 1],
    b = points[i],
    span = Math.max(1e-12, lengths[i] - lengths[i - 1]),
    u = (t - lengths[i - 1]) / span;
  const dx = (b[0] - a[0]) / span,
    dz = (b[2] - a[2]) / span;
  return { x: a[0] + (b[0] - a[0]) * u, z: a[2] + (b[2] - a[2]) * u, dx, dz };
}

// Flat ribbon of the given width on the floor: two vertices per point, offset
// perpendicular to the averaged heading, with a 0→1 v coordinate across it.
export function ribbonGeometry(points, width, y) {
  const positions = [],
    uvs = [],
    indices = [];
  const lengths = polylineLengths(points);
  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)],
      next = points[Math.min(points.length - 1, i + 1)];
    let dx = next[0] - prev[0],
      dz = next[2] - prev[2];
    const n = Math.hypot(dx, dz) || 1;
    dx /= n;
    dz /= n;
    const px = -dz * (width / 2),
      pz = dx * (width / 2);
    positions.push(
      points[i][0] + px,
      y,
      points[i][2] + pz,
      points[i][0] - px,
      y,
      points[i][2] - pz,
    );
    uvs.push(lengths[i], 0, lengths[i], 1);
    if (i) {
      const k = (i - 1) * 2;
      indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  return { positions, uvs, indices };
}

// Chevron centres for time `seconds`: evenly spaced, drifting toward the end.
export function chevronStations(total, seconds, spacing = TRAIL.spacing, speed = TRAIL.speed) {
  if (!(total > 0)) return [];
  const phase = (((seconds * speed) % spacing) + spacing) % spacing;
  const out = [];
  for (let d = phase; d < total && out.length < TRAIL.maxChevrons; d += spacing) out.push(d);
  return out;
}

// Soft falloff across the ribbon (v = 0..1), opaque in the middle.
function softTexture(T) {
  const size = 32,
    pixels = new Uint8Array(4 * size);
  for (let i = 0; i < size; i++) {
    const v = (i + 0.5) / size,
      a = Math.max(0, 1 - Math.abs(v - 0.5) * 2) ** 0.6;
    // three.js reads alphaMap from the green channel.
    const g = Math.round(255 * a);
    pixels.set([g, g, g, 255], i * 4);
  }
  const texture = new T.DataTexture(pixels, 1, size);
  texture.magFilter = T.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export class PheromoneTrails {
  constructor(T, parent) {
    this.T = T;
    this.parent = parent;
    this.soft = softTexture(T);
    this.paths = [];
    const shape = new T.Shape();
    const c = TRAIL.chevron;
    // Arrowhead pointing +X, drawn in the floor plane after rotation.
    shape.moveTo(c * 0.6, 0);
    shape.lineTo(-c * 0.5, c * 0.5);
    shape.lineTo(-c * 0.2, 0);
    shape.lineTo(-c * 0.5, -c * 0.5);
    shape.closePath();
    this.chevronGeometry = new T.ShapeGeometry(shape);
    this.chevronGeometry.rotateX(-Math.PI / 2);
    this.dummy = new T.Object3D();
  }
  clear() {
    for (const path of this.paths)
      for (const object of path.objects) {
        this.parent.remove(object);
        object.geometry !== this.chevronGeometry && object.geometry.dispose();
        object.material.dispose();
      }
    this.paths = [];
  }
  ribbon(points, width, y, color, opacity) {
    const T = this.T,
      { positions, uvs, indices } = ribbonGeometry(points, width, y);
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    const mesh = new T.Mesh(
      geometry,
      new T.MeshBasicMaterial({
        color,
        alphaMap: this.soft,
        transparent: true,
        opacity,
        depthWrite: false,
        side: T.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    mesh.renderOrder = 3;
    mesh.userData.projectileSolid = false;
    this.parent.add(mesh);
    return mesh;
  }
  set(paths, draft = false) {
    this.clear();
    const T = this.T;
    for (const points of paths) {
      if (points.length < 2) continue;
      const lengths = polylineLengths(points);
      const total = lengths.at(-1);
      const shadow = this.ribbon(points, TRAIL.underlay, TRAIL.height - 0.0005, TRAIL.shadow, 0.4);
      const band = this.ribbon(
        points,
        TRAIL.width,
        TRAIL.height,
        draft ? TRAIL.draft : TRAIL.color,
        draft ? 0.75 : 0.72,
      );
      const count = Math.min(TRAIL.maxChevrons, Math.ceil(total / TRAIL.spacing) + 1);
      const chevrons = new T.InstancedMesh(
        this.chevronGeometry,
        new T.MeshBasicMaterial({
          color: draft ? TRAIL.color : '#fff4d6',
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
        }),
        count,
      );
      chevrons.renderOrder = 4;
      chevrons.frustumCulled = false;
      chevrons.userData.projectileSolid = false;
      this.parent.add(chevrons);
      this.paths.push({ points, lengths, total, chevrons, objects: [shadow, band, chevrons] });
    }
  }
  animate(seconds) {
    for (const { points, lengths, total, chevrons } of this.paths) {
      const stations = chevronStations(total, seconds);
      chevrons.count = Math.min(stations.length, chevrons.instanceMatrix.count);
      for (let i = 0; i < chevrons.count; i++) {
        const s = sampleAt(points, lengths, stations[i]);
        this.dummy.position.set(s.x, TRAIL.height + 0.0004, s.z);
        this.dummy.rotation.set(0, Math.atan2(-s.dz, s.dx), 0);
        this.dummy.updateMatrix();
        chevrons.setMatrixAt(i, this.dummy.matrix);
      }
      chevrons.instanceMatrix.needsUpdate = true;
    }
  }
}
