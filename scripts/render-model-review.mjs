import * as T from '../vendor/three.module.min.js';
import { createGraphics } from '../src/graphics.js';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
const before = execFileSync(
  'git',
  ['show', '11395ff8a0b576e9554f4cd1821f9a5c512fd3cb:src/graphics.js'],
  { encoding: 'utf8' },
);
const old = await import('data:text/javascript;base64,' + Buffer.from(before).toString('base64'));
const scene = new T.Scene(),
  previous = old.createGraphics(T, scene),
  current = createGraphics(T, scene);
const stukaBefore = previous.makeStuka('#a7ad7a'),
  stukaAfter = current.makeStuka('#a7ad7a');
const bombBefore = new T.Mesh(
  new T.SphereGeometry(0.35, 16, 12),
  new T.MeshStandardMaterial({ color: '#3c4937' }),
);
bombBefore.scale.z = 3;
const bombAfter = current.makeBomb();
function panel(model, x, y, size, title) {
  const cam = new T.OrthographicCamera(-size, size, size * 0.62, -size * 0.62, 0.01, 100);
  cam.position.set(7, 4.5, 8);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  model.updateWorldMatrix(true, true);
  const triangles = [],
    light = new T.Vector3(-0.4, 1, 0.6).normalize();
  model.traverseVisible((mesh) => {
    if (!mesh.isMesh) return;
    const g = mesh.geometry,
      position = g.attributes.position,
      index = g.index,
      material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    for (let i = 0; i < (index ? index.count : position.count); i += 3) {
      const points = [0, 1, 2].map((k) =>
        new T.Vector3()
          .fromBufferAttribute(position, index ? index.getX(i + k) : i + k)
          .applyMatrix4(mesh.matrixWorld),
      );
      const normal = new T.Vector3()
        .subVectors(points[1], points[0])
        .cross(new T.Vector3().subVectors(points[2], points[0]))
        .normalize();
      if (normal.dot(new T.Vector3().subVectors(cam.position, points[0])) <= 0) continue;
      const depth =
        points.reduce((v, p) => v + p.clone().applyMatrix4(cam.matrixWorldInverse).z, 0) / 3;
      const shade = 0.5 + 0.5 * Math.max(0, normal.dot(light)),
        color = material.color.clone().multiplyScalar(shade).getStyle();
      const polygon = points
        .map((p) => {
          p.project(cam);
          return `${(x + 285 + p.x * 270).toFixed(2)},${(y + 175 - p.y * 165).toFixed(2)}`;
        })
        .join(' ');
      triangles.push({
        depth,
        svg: `<polygon points="${polygon}" fill="${color}" stroke="${color}" stroke-width=".25"/>`,
      });
    }
  });
  triangles.sort((a, b) => a.depth - b.depth);
  return (
    `<rect x="${x}" y="${y}" width="570" height="350" rx="12" fill="#dce3cc"/><text x="${x + 16}" y="${y + 28}" font-size="19" fill="#163b30">${title}</text>` +
    triangles.map((t) => t.svg).join('')
  );
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="#15352c"/><g font-family="sans-serif"><text x="25" y="32" font-size="22" fill="#e6edcf">VIS-05 · Géométrie réelle · Même projection avant / après</text>${panel(stukaBefore, 20, 55, 4.6, 'Stuka — avant')}${panel(stukaAfter, 610, 55, 4.6, 'Stuka — après')}${panel(bombBefore, 20, 425, 1.2, 'Bombe — avant')}${panel(bombAfter, 610, 425, 1.2, 'Bombe — après')}</g></svg>`;
await writeFile('docs/models-before-after.svg', svg);
