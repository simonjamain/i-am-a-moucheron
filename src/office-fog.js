// Uniform horizontal layer in the upper quarter of the office. The integral
// along each view ray makes it visible from below as well as from inside.
export const OFFICE_DISTANCE_FOG = 0.018;
export const FOG_START_RATIO = 0.75;
export function officeFogOpacity(height, ceiling) {
  const t = Math.max(
    0,
    Math.min(1, (height / Math.max(ceiling, 0.001) - FOG_START_RATIO) / (1 - FOG_START_RATIO)),
  );
  return 0.65 * t * t * (3 - 2 * t);
}
export function fogOpticalDepth(fromY, toY, distance, ceiling) {
  const start = ceiling * FOG_START_RATIO,
    thickness = ceiling - start;
  const primitive = (y) => Math.max(0, y - start) ** 2 / (2 * thickness);
  const average =
    Math.abs(toY - fromY) < 1e-6
      ? Math.max(0, fromY - start) / thickness
      : (primitive(toY) - primitive(fromY)) / (toY - fromY);
  return Math.max(0, distance) * average * 9;
}
const installed = new WeakSet();
export function installOfficeFog(T, ceiling) {
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
  const start = ceiling * FOG_START_RATIO,
    thickness = ceiling - start;
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

// The office has no rendered roof. This non-solid cap gives the background
// rays an endpoint in the same fog field; it adds no collision surface.
export function officeFogCeiling(T, bounds) {
  const mesh = new T.Mesh(
    new T.PlaneGeometry(bounds.x * 2, bounds.z * 2),
    new T.MeshBasicMaterial({ color: '#829f91', side: T.DoubleSide, fog: true }),
  );
  mesh.name = 'office-fog-ceiling';
  mesh.rotation.x = Math.PI / 2;
  mesh.position.y = bounds.ceiling;
  mesh.userData.projectileSolid = false;
  return mesh;
}
