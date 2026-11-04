import * as T from '../vendor/three.module.min.js';
import { createGraphics } from '../src/graphics.js';
import { mkdir, writeFile } from 'node:fs/promises';
const current = createGraphics(T, new T.Scene());
function panel(model, x, y, size, title) {
  const cam = new T.OrthographicCamera(-size, size, size * 0.62, -size * 0.62, 0.01, 100);
  cam.position.set(7, 4.5, -8);
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
        color = material.color.clone();
      if (material.vertexColors && g.attributes.color)
        color.multiply(
          new T.Color().fromBufferAttribute(g.attributes.color, index ? index.getX(i) : i),
        );
      color.multiplyScalar(shade);
      const fill = color.getStyle();
      const polygon = points
        .map((p) => {
          p.project(cam);
          return `${(x + 285 + p.x * 270).toFixed(2)},${(y + 175 - p.y * 165).toFixed(2)}`;
        })
        .join(' ');
      triangles.push({
        depth,
        svg: `<polygon points="${polygon}" fill="${fill}" stroke="${fill}" stroke-width=".25"/>`,
      });
    }
  });
  triangles.sort((a, b) => a.depth - b.depth);
  return (
    `<rect x="${x}" y="${y}" width="570" height="350" rx="12" fill="#dce3cc"/><text x="${x + 16}" y="${y + 28}" font-size="19" fill="#163b30">${title}</text>` +
    triangles.map((t) => t.svg).join('')
  );
}

const models = [
  current.makeStuka('#7f8844'),
  current.makeSpitfire('#7f8844'),
  current.makeTank('#7f8844'),
  current.makeFlakTruck('#7f8844'),
];
const titles = ['Stuka', 'Spitfire S6', 'Tank T3', 'DCA mobile D2'];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#15352c"/><g font-family="sans-serif"><text x="25" y="32" font-size="22" fill="white">Modèles intégrés — projection CPU des géométries réelles</text>${models.map((m, i) => panel(m, 20 + (i % 2) * 590, 55 + Math.floor(i / 2) * 370, i === 3 ? 5.6 : i === 2 ? 4.2 : 4.6, titles[i])).join('')}</g></svg>`;
await mkdir('tmp/meshy', { recursive: true });
await writeFile('tmp/meshy/fleet-review.svg', svg);
