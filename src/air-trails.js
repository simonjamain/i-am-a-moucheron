import { PORTALS, enemyRoutePosition } from './routes.js';
import { airField, bendAirPoint } from './air-current.js';

// Each vent gets a single translucent point cloud with immutable local scatter.
export class AirTrails {
  constructor(T, scene) {
    const size = 16,
      pixels = new Uint8Array(size * size * 4).fill(255);
    for (let i = 0; i < size * size; i++) {
      const d =
        Math.hypot(((i % size) + 0.5) / size - 0.5, (Math.floor(i / size) + 0.5) / size - 0.5) * 2;
      pixels[i * 4 + 3] = Math.round(255 * Math.max(0, 1 - d) ** 2);
    }
    const spot = new T.DataTexture(pixels, size, size);
    spot.magFilter = T.LinearFilter;
    spot.needsUpdate = true;
    this.clouds = PORTALS.air.map((_, portalIndex) => {
      const centers = Array.from({ length: 300 }, (_, i) =>
        enemyRoutePosition({ portalIndex }, i / 299),
      );
      const particles = 5,
        positions = new Float32Array(centers.length * particles * 3);
      const offsets = new Float32Array(positions.length);
      let seed = portalIndex + 1;
      const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
      for (let i = 0; i < offsets.length; i++)
        offsets[i] = (random() + random() + random() - 1.5) * 0.07;
      const geometry = new T.BufferGeometry();
      const attribute = new T.BufferAttribute(positions, 3);
      geometry.setAttribute('position', attribute);
      const material = new T.PointsMaterial({
        color: ['#75eaf1', '#ffc483', '#81a9ff', '#dea6f8'][portalIndex],
        map: spot,
        size: 0.035,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
      });
      const cloud = new T.Points(geometry, material);
      cloud.userData.softwareTrail = true;
      cloud.visible = false;
      cloud.frustumCulled = false;
      scene.add(cloud);
      return { cloud, centers, offsets, positions, attribute, particles };
    });
  }
  update(snap, preview) {
    const ports = snap?.preparation?.groups?.filter((g) => !g.ground).map((g) => g.portalIndex);
    const key = [
      snap?.code,
      snap?.base?.epoch,
      snap?.groundDefense?.revision,
      preview?.position.join(','),
      preview?.angle,
    ].join(':');
    const changed = key !== this.key;
    this.key = key;
    // Show the destination shape immediately (already flying insects ease into it).
    const grid = changed && airField(snap?.groundDefense, Infinity, preview);
    this.clouds.forEach(({ cloud, centers, offsets, positions, attribute, particles }, index) => {
      cloud.visible = !!snap?.code && (!ports || ports.includes(index));
      if (!changed) return;
      for (let i = 0; i < centers.length; i++) {
        const p = bendAirPoint([...centers[i]], i / (centers.length - 1), grid);
        for (let j = 0; j < particles; j++)
          for (let a = 0; a < 3; a++) {
            const k = (i * particles + j) * 3 + a;
            positions[k] = p[a] + offsets[k];
          }
      }
      attribute.needsUpdate = true;
    });
  }
}
