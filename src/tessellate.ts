// Subdivision of a triangle mesh so that no edge is longer than `maxEdge`: an edge that is too
// long is split at its middle, once for every triangle that shares it (so no crack opens), and
// (lengths measured with the per-axis `axes` weights, to cut along some directions only) the triangles are re-cut accordingly, keeping their winding. New vertices take the average of
// the positions and of the UVs of the edge's ends, so a texture mapped on the original
// triangles is unchanged. Used to give the tank's track belts enough vertices to bend.
export interface TriangleMesh {
  /** x, y, z per vertex. */
  positions: Float32Array;
  /** u, v per vertex. */
  uv: Float32Array;
  /** Optional x, y, z per vertex; interpolated like the positions. */
  normals?: Float32Array;
  indices: Uint16Array | Uint32Array;
}

export function tessellate(
  mesh: TriangleMesh,
  maxEdge: number,
  axes: readonly [number, number, number] = [1, 1, 1],
  passes = 8,
): TriangleMesh {
  const positions = Array.from(mesh.positions),
    uv = Array.from(mesh.uv),
    normals = mesh.normals ? Array.from(mesh.normals) : null;
  let indices = Array.from(mesh.indices);
  const length = (a: number, b: number): number =>
    Math.hypot(
      (positions[3 * a] - positions[3 * b]) * axes[0],
      (positions[3 * a + 1] - positions[3 * b + 1]) * axes[1],
      (positions[3 * a + 2] - positions[3 * b + 2]) * axes[2],
    );
  for (let pass = 0; pass < passes; pass++) {
    const middles = new Map<string, number>();
    const middle = (a: number, b: number): number => {
      const key = a < b ? a + ',' + b : b + ',' + a;
      let found = middles.get(key);
      if (found === undefined) {
        found = positions.length / 3;
        for (let k = 0; k < 3; k++)
          positions.push((positions[3 * a + k] + positions[3 * b + k]) / 2);
        if (normals)
          for (let k = 0; k < 3; k++) normals.push((normals[3 * a + k] + normals[3 * b + k]) / 2);
        uv.push((uv[2 * a] + uv[2 * b]) / 2, (uv[2 * a + 1] + uv[2 * b + 1]) / 2);
        middles.set(key, found);
      }
      return found;
    };
    const out: number[] = [];
    let changed = false;
    for (let t = 0; t < indices.length; t += 3) {
      const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
      const ab = length(a, b) > maxEdge,
        bc = length(b, c) > maxEdge,
        ca = length(c, a) > maxEdge;
      const count = +ab + +bc + +ca;
      if (!count) {
        out.push(a, b, c);
        continue;
      }
      changed = true;
      if (count === 3) {
        const [mab, mbc, mca] = [middle(a, b), middle(b, c), middle(c, a)];
        out.push(a, mab, mca, mab, b, mbc, mca, mbc, c, mab, mbc, mca);
      } else if (count === 1) {
        // Rotate so that the long edge is p-q.
        const [p, q, r] = ab ? [a, b, c] : bc ? [b, c, a] : [c, a, b];
        const m = middle(p, q);
        out.push(p, m, r, m, q, r);
      } else {
        // Two long edges meet at v; rotate to (v, x, y) with v-x and y-v long, x-y short.
        const [v, x, y] = ab && bc ? [b, c, a] : bc && ca ? [c, a, b] : [a, b, c];
        const [m1, m2] = [middle(v, x), middle(y, v)];
        out.push(v, m1, m2, m1, x, y, m1, y, m2);
      }
    }
    indices = out;
    if (!changed) break;
  }
  const Index = positions.length / 3 > 65535 ? Uint32Array : Uint16Array;
  return {
    positions: Float32Array.from(positions),
    uv: Float32Array.from(uv),
    ...(normals ? { normals: Float32Array.from(normals) } : {}),
    indices: Index.from(indices),
  };
}
