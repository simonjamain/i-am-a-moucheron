import { vehicleHue } from './logistics.js';
export function playerInitials(name) {
  const words = String(name || '?')
    .trim()
    .split(/[\s_-]+/u)
    .filter(Boolean);
  return (
    words.length > 1
      ? words
          .slice(0, 2)
          .map((w) => Array.from(w)[0])
          .join('')
      : Array.from(words[0] || '?')
          .slice(0, 2)
          .join('')
  )
    .toLocaleUpperCase('fr')
    .slice(0, 4);
}
export function identifyPlayer(
  T,
  person,
  player,
  canvasFactory = () => document.createElement('canvas'),
) {
  const key = String(player.colorSequence) + ':' + player.name;
  if (person.userData.identity === key) return;
  for (const mesh of person.userData.initials || []) {
    mesh.removeFromParent();
    mesh.material.map.dispose();
    mesh.material.dispose();
    mesh.geometry.dispose();
  }
  const colour = new T.Color().setHSL(vehicleHue(player.colorSequence || 0) / 360, 0.65, 0.53);
  person.traverse((o) => {
    if (o.isMesh && o.userData.personalCloth) {
      o.material.color.copy(colour);
    }
  });
  const canvas = canvasFactory();
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#172c28';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#fff9df';
  ctx.textAlign = 'center';
  ctx.font = 'bold 148px sans-serif';
  ctx.fillText(playerInitials(player.name), 128, 181, 240);
  const meshes = [];
  // Humanoids may give their own torso placement (issue #111 character).
  const badge = person.userData.badge;
  for (const side of [-1, 1]) {
    const texture = new T.CanvasTexture(canvas);
    const mesh = new T.Mesh(
      new T.PlaneGeometry(badge?.size ?? 0.68, badge?.size ?? 0.68),
      new T.MeshBasicMaterial({
        map: texture,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    mesh.userData.projectileSolid = false;
    if (badge) badge.anchors[side < 0 ? 0 : 1].add(mesh);
    else {
      mesh.position.set(0, 1.35, side * 0.256);
      if (side < 0) mesh.rotation.y = Math.PI;
      person.userData.rig.add(mesh);
    }
    meshes.push(mesh);
  }
  person.userData.initials = meshes;
  person.userData.identity = key;
}

export function disposePlayerIdentity(person) {
  for (const mesh of person?.userData.initials || []) {
    mesh.removeFromParent();
    mesh.geometry.dispose();
    mesh.material.map.dispose();
    mesh.material.dispose();
  }
  if (person) {
    person.userData.initials = [];
    person.userData.identity = null;
  }
}
