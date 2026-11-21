// Uniform horizontal layer, kept at its original altitude when the flight limit
// rises. Integrating along each view ray makes it visible from below and inside.
export const OFFICE_DISTANCE_FOG = 0.018;
export const FOG_START_RATIO = 0.75;
export const OFFICE_CLOUD_TOP = 2.95;
export function officeFogOpacity(height, cloudTop = OFFICE_CLOUD_TOP) {
  const t = Math.max(
    0,
    Math.min(1, (height / Math.max(cloudTop, 0.001) - FOG_START_RATIO) / (1 - FOG_START_RATIO)),
  );
  return 0.65 * t * t * (3 - 2 * t);
}
export function fogOpticalDepth(fromY, toY, distance, cloudTop = OFFICE_CLOUD_TOP) {
  const start = cloudTop * FOG_START_RATIO,
    thickness = cloudTop - start;
  const primitive = (y) => Math.max(0, y - start) ** 2 / (2 * thickness);
  const average =
    Math.abs(toY - fromY) < 1e-6
      ? Math.max(0, fromY - start) / thickness
      : (primitive(toY) - primitive(fromY)) / (toY - fromY);
  return Math.max(0, distance) * average * 9;
}
const installed = new WeakSet();
export function installOfficeFog(T, cloudTop = OFFICE_CLOUD_TOP) {
  if (installed.has(T)) return;
  installed.add(T);
  T.ShaderChunk.fog_pars_vertex += '\n#ifdef USE_FOG\nvarying vec3 vOfficeFogPosition;\n#endif';
  T.ShaderChunk.fog_vertex += `
#ifdef USE_FOG
  vOfficeFogPosition = cameraPosition + vec3(
    dot(viewMatrix[0].xyz, mvPosition.xyz),
    dot(viewMatrix[1].xyz, mvPosition.xyz),
    dot(viewMatrix[2].xyz, mvPosition.xyz));
#endif`;
  T.ShaderChunk.fog_pars_fragment += '\n#ifdef USE_FOG\nvarying vec3 vOfficeFogPosition;\n#endif';
  const start = cloudTop * FOG_START_RATIO,
    thickness = cloudTop - start;
  T.ShaderChunk.fog_fragment = T.ShaderChunk.fog_fragment.replace(
    'float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );',
    `
    float fogStart = ${start.toFixed(7)};
    float fogThickness = ${thickness.toFixed(7)};
    float fogA = max(0.0, cameraPosition.y - fogStart);
    float fogB = max(0.0, vOfficeFogPosition.y - fogStart);
    float fogDY = vOfficeFogPosition.y - cameraPosition.y;
    float fogAverage = abs(fogDY) < 0.000001 ? fogA / fogThickness : (fogB*fogB - fogA*fogA) / (2.0 * fogThickness * fogDY);
    float fogDistance = length(vOfficeFogPosition - cameraPosition);
    float fogFactor = 1.0 - exp(-max(0.0, fogAverage) * fogDistance * 9.0 - fogDensity*fogDensity*vFogDepth*vFogDepth);`,
  );
}

// The clear scene background does not run material fog shaders. Enclose its
// rays on every side, including the open south, with a non-solid backdrop.
// Keep the chase camera inside the atmosphere even near the flight bounds.
export function officeFogCeiling(T, bounds) {
  const margin = 0.25,
    width = (bounds.x + margin) * 2,
    depth = (bounds.z + margin) * 2,
    height = bounds.ceiling + margin,
    material = new T.MeshBasicMaterial({ color: '#829f91', side: T.DoubleSide, fog: true }),
    geometry = new T.BoxGeometry(width, height, depth);
  // Leave the bottom open: this is atmosphere, never a floor or a collider.
  const indices = Array.from(geometry.index.array),
    bottom = geometry.groups[3]; // BoxGeometry face order: +X, −X, +Y, −Y, +Z, −Z.
  geometry.setIndex(indices.filter((_, i) => i < bottom.start || i >= bottom.start + bottom.count));
  geometry.clearGroups();
  const mesh = new T.Mesh(geometry, material);
  mesh.name = 'office-fog-ceiling';
  mesh.position.y = height / 2;
  mesh.userData.projectileSolid = false;
  return mesh;
}
