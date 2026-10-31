// Two bounded-cost presets for the same lights, meshes and 2048² shadow map.
// "landing" remains a candidate until the issue #11 WebGL comparison is accepted.
export const SHADOW_PRESETS = Object.freeze({
  baseline: Object.freeze({ filter: 'soft', ambient: 2.5, sunlight: 3 }),
  landing: Object.freeze({ filter: 'basic', ambient: 1.5, sunlight: 4 }),
});
export function applyShadowPreset(T, renderer, scene, name = 'landing') {
  const preset = SHADOW_PRESETS[name];
  if (!preset) throw Error('Unknown shadow preset: ' + name);
  if (renderer) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = preset.filter === 'basic' ? T.BasicShadowMap : T.PCFSoftShadowMap;
    renderer.shadowMap.needsUpdate = true;
  }
  if (scene) {
    for (const light of scene.children) {
      if (light.isHemisphereLight) light.intensity = preset.ambient;
      if (light.isDirectionalLight) light.intensity = preset.sunlight;
    }
  }
  return preset;
}
