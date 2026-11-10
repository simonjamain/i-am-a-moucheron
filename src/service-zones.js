// Refuelling zones drawn as translucent green spheres: one around each fixed
// refuel station and one around each living Castor. The radii are the ones the
// paid service actually uses (paid-service.js), so what players see is the
// real reach. A rim-lit shader keeps the inside readable when the camera sits
// in the sphere (the Castor driver always does).
import { CASTOR_SERVICE_RADIUS, SERVICE_RADIUS } from './logistics.js';

export const ZONE_COLOR = '#58e36f';

export function serviceZoneList(installations = [], fleet = []) {
  return [
    ...installations
      .filter((s) => s.kind === 'refuel')
      .map((s) => ({
        key: 'station:' + (s.slot ?? `${s.x},${s.z}`),
        p: [s.x, s.y, s.z],
        radius: SERVICE_RADIUS,
      })),
    ...fleet
      .filter((v) => v.type === 'castor' && v.state.hp > 0)
      .map((v) => ({
        key: 'castor:' + v.id,
        vehicle: v.id,
        p: v.state.p,
        radius: CASTOR_SERVICE_RADIUS,
      })),
  ];
}

function zoneMaterial(T) {
  return new T.ShaderMaterial({
    uniforms: { color: { value: new T.Color(ZONE_COLOR) } },
    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform vec3 color;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        #include <logdepthbuf_fragment>
        float rim = 1.0 - abs(dot(normalize(vNormal), normalize(vView)));
        gl_FragColor = vec4(color, 0.05 + 0.4 * pow(rim, 2.5));
      }`,
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
  });
}

export class ServiceZones {
  constructor(T, scene) {
    this.T = T;
    this.scene = scene;
    this.geometry = new T.SphereGeometry(1, 32, 16);
    this.material = zoneMaterial(T);
    this.meshes = new Map();
  }

  // zones: output of serviceZoneList; `position(zone)` may override a centre
  // (the displayed, smoothed Castor model instead of the raw snapshot).
  update(zones, position = () => null) {
    const seen = new Set();
    for (const zone of zones) {
      seen.add(zone.key);
      let mesh = this.meshes.get(zone.key);
      if (!mesh) {
        mesh = new this.T.Mesh(this.geometry, this.material);
        mesh.name = 'service-zone';
        mesh.renderOrder = 10;
        mesh.castShadow = mesh.receiveShadow = false;
        this.scene.add(mesh);
        this.meshes.set(zone.key, mesh);
      }
      const at = position(zone);
      if (at) mesh.position.copy(at);
      else mesh.position.fromArray(zone.p);
      mesh.scale.setScalar(zone.radius);
    }
    for (const [key, mesh] of this.meshes)
      if (!seen.has(key)) {
        this.scene.remove(mesh);
        this.meshes.delete(key);
      }
  }
}
