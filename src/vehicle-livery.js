import { vehicleHue } from './logistics.js';
// Meshes fixed to the hull, with ordinary depth testing. No camera-facing labels.
export function paintVehicle(T, model, sequence, baseColor) {
  const old = new T.Color(baseColor);
  const paint = new T.MeshStandardMaterial({
    color: new T.Color().setHSL(vehicleHue(sequence) / 360, 0.58, 0.57),
    roughness: 0.75,
  });
  model.traverse((o) => {
    if (o.isMesh && o.material?.color?.equals(old)) o.material = paint;
  });
  model.userData.paint = paint;
}
export function updateInscriptions(
  T,
  model,
  vehicle,
  pilots,
  canvasFactory = () => document.createElement('canvas'),
) {
  const names = vehicle.seats.map((s) => [
    s.seat,
    pilots.find((p) => p.id === s.pilot)?.name || '',
  ]);
  const key = JSON.stringify(names);
  if (model.userData.inscriptionKey === key) return;
  for (const mesh of model.userData.inscriptions || []) {
    model.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.map.dispose();
    mesh.material.dispose();
  }
  model.userData.inscriptionKey = key;
  model.userData.inscriptions = [];
  for (const [seat, name] of names) {
    if (!name) continue;
    const canvas = canvasFactory();
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#182f2a';
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#fff3ce';
    ctx.font = 'bold 64px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(name, 256, 87, 490);
    for (const side of [-1, 1]) {
      const texture = new T.CanvasTexture(canvas);
      const mesh = new T.Mesh(
        new T.PlaneGeometry(vehicle.type === 'bomber' ? 1.35 : 0.8, 0.2),
        new T.MeshBasicMaterial({
          map: texture,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        }),
      );
      mesh.rotation.y = (side * Math.PI) / 2;
      mesh.position.set(
        side * (vehicle.type === 'bomber' ? 0.665 : 0.405),
        -0.12,
        vehicle.type === 'bomber' ? (seat === 'pilot' ? -1.7 : seat === 'tail' ? 2.2 : 0) : 0.2,
      );
      mesh.userData.projectileSolid = false;
      model.add(mesh);
      model.userData.inscriptions.push(mesh);
    }
  }
}
