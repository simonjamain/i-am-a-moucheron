// Issue #106: no per-player or per-vehicle colour identity. Meshy models keep
// their textures untouched; procedural models keep their original base colour,
// on a private material so dirt can still tint it.
import type * as THREE from 'three/webgpu';
import type { Three } from './types.ts';

type InscriptionMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
/** Vehicle model root; userData carries the livery bookkeeping. */
export type LiveryModel = THREE.Object3D & {
  userData: {
    preserveTexture?: boolean;
    paint?: THREE.MeshStandardMaterial;
    baseColor?: THREE.Color;
    inscriptionKey?: string;
    inscriptions?: InscriptionMesh[];
  };
};
export interface InscribedVehicle {
  type: string;
  seats: readonly { seat: string; pilot?: string | null }[];
}

export function paintVehicle(
  T: Three,
  model: LiveryModel,
  _sequence: unknown,
  baseColor: THREE.ColorRepresentation,
): void {
  if (model.userData.preserveTexture || model.userData.paint) return;
  const old = new T.Color(baseColor);
  const paint = new T.MeshStandardMaterial({ color: old.clone(), roughness: 0.75 });
  model.traverse((o) => {
    const mesh = o as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    if (mesh.isMesh && mesh.material?.color?.equals(old)) mesh.material = paint;
  });
  model.userData.paint = paint;
  model.userData.baseColor = old;
}
export function updateInscriptions(
  T: Three,
  model: LiveryModel,
  vehicle: InscribedVehicle,
  pilots: readonly { id: string; name?: string }[],
  canvasFactory: () => HTMLCanvasElement = () => document.createElement('canvas'),
): void {
  const names = vehicle.seats.map((s) => [
    s.seat,
    pilots.find((p) => p.id === s.pilot)?.name || '',
  ]);
  const key = JSON.stringify(names);
  if (model.userData.inscriptionKey === key) return;
  for (const mesh of model.userData.inscriptions || []) {
    model.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.map!.dispose();
    mesh.material.dispose();
  }
  model.userData.inscriptionKey = key;
  const inscriptions: InscriptionMesh[] = (model.userData.inscriptions = []);
  for (const [seat, name] of names) {
    if (!name) continue;
    const canvas = canvasFactory();
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#182f2a';
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#fff3ce';
    ctx.font = 'bold 64px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(name, 256, 87, 490);
    for (const side of [-1, 1]) {
      const texture = new T.CanvasTexture(canvas);
      const mesh = new T.Mesh(
        new T.PlaneGeometry(
          vehicle.type === 'medbomber' ? 1.35 : vehicle.type === 'bomber' ? 1.0 : 0.8,
          0.2,
        ),
        new T.MeshBasicMaterial({
          map: texture,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        }),
      );
      mesh.rotation.y = (side * Math.PI) / 2;
      // Plates sit on the fuselage side of the biplane models (fuselage centre
      // 0.31 high on the fighter, 0.5 on the bomber).
      if (vehicle.type === 'medbomber')
        mesh.position.set(
          side * 0.665,
          -0.12,
          seat === 'pilot' ? -1.7 : seat === 'tail' ? 2.2 : seat === 'ventral' ? 1 : 0,
        );
      else if (vehicle.type === 'lightfighter') mesh.position.set(side * 0.405, -0.12, 0.2);
      else
        mesh.position.set(
          side * (vehicle.type === 'bomber' ? 0.46 : 0.34),
          vehicle.type === 'bomber' ? 0.42 : 0.3,
          vehicle.type === 'bomber' ? (seat === 'pilot' ? -0.4 : 1.4) : 0.2,
        );
      mesh.userData.projectileSolid = false;
      model.add(mesh);
      inscriptions.push(mesh);
    }
  }
}
