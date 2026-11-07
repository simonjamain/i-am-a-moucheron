/**
 * CI-only integration test: run the real Docker glTF Transform / meshoptimizer
 * on the indexed geometry and UVs of each approved, embedded Meshy T-01 part.
 *
 * The runtime keeps WebP textures; glTF fixture uses a small PNG because
 * NodeIO's core texture IO may not register EXT_texture_webp. This checks
 * geometry+UV with actual Meshy positions and triangles, NOT the exact source
 * GLBs or the quality of their 2K images. Never publish these test variants.
 */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { Document, NodeIO } from '@gltf-transform/core';

const SRC = process.env.T01_DATA_ROOT || '/game-src';
const OUT = process.env.T01_OUTPUT_ROOT || '/assets/optimized';
const io = new NodeIO();
const texturePng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==',
  'base64',
);
const kinds = ['socle', 'tete', 'canon', 'capteur'];
const readSigned = (raw) => Float32Array.from(
  Array.from({ length: raw.length / 2 }, (_, i) => raw.readInt16LE(i * 2) * 0.0005),
);
const readUnsigned = (raw, div = 1) => Float32Array.from(
  Array.from({ length: raw.length / 2 }, (_, i) => raw.readUInt16LE(i * 2) / div),
);
const run = (...args) => {
  const result = spawnSync(process.execPath, ['/opt/assets/cli.mjs', ...args], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 5,
  });
  assert.equal(result.status, 0, `${args[0]} failed:\n${result.stderr}\n${result.stdout}`);
};
await mkdir(OUT, { recursive: true });
const summary = [];
for (const kind of kinds) {
  const text = await readFile(`${SRC}/meshy-t01-${kind}-data.js`, 'utf8');
  const marker = 'export const MODEL_DATA = ';
  assert.ok(text.includes(marker));
  const data = JSON.parse(text.slice(text.indexOf(marker) + marker.length).trim().replace(/;$/, ''));
  const part = data.parts[0];
  assert.equal(data.parts.length, 1);
  const document = new Document();
  const buffer = document.createBuffer('T-01 Meshy');
  const texture = document.createTexture('CI-pixel-only').setMimeType('image/png').setImage(texturePng);
  const material = document.createMaterial('UV test material').setBaseColorTexture(texture);
  const positions = readSigned(Buffer.from(part.positions, 'base64'));
  const uvs = readUnsigned(Buffer.from(part.uv, 'base64'), 65535);
  const indices = Uint16Array.from(readUnsigned(Buffer.from(part.indices, 'base64')));
  const primitive = document.createPrimitive()
    .setMaterial(material)
    .setAttribute('POSITION', document.createAccessor().setBuffer(buffer).setType('VEC3').setArray(positions))
    .setAttribute('TEXCOORD_0', document.createAccessor().setBuffer(buffer).setType('VEC2').setArray(uvs))
    .setIndices(document.createAccessor().setBuffer(buffer).setType('SCALAR').setArray(indices));
  const mesh = document.createMesh(`t01-${kind}`).addPrimitive(primitive);
  document.createScene('T-01').addChild(document.createNode(kind).setMesh(mesh));
  const original = `${OUT}/t01-${kind}-before.glb`;
  const optimized = `${OUT}/t01-${kind}-candidate.glb`;
  await io.write(original, document);
  // Only one Meshy part per test GLB: it is already independently animated.
  run('optimize', original, optimized, '--ratio', '0.75', '--error', '0.005', '--allow-monobloc', '--protect', '^$');
  run('validate', original, optimized);
  const report = JSON.parse(await readFile(`${optimized}.report.json`, 'utf8'));
  assert.equal(report.before.triangles, data.triangles);
  assert.ok(report.after.triangles <= data.triangles);
  const row = {
    kind,
    sourceTask: data.sourceTask,
    trianglesBefore: report.before.triangles,
    trianglesAfter: report.after.triangles,
    geometryReductionPercent: Math.round(1000 * (1 - report.after.triangles / data.triangles)) / 10,
    optimizerWarnings: report.warnings,
    uvMaterialsAndPixelFixtureValidated: true,
  };
  summary.push(row);
  console.log(JSON.stringify(row));
}
await writeFile(`${OUT}/t01-optimizer-summary.json`, JSON.stringify({
  source: 'Four Meshy-derived indexed meshes from embedded JS data, not original GLB byte streams',
  texture: 'One-pixel PNG is a placeholder, not the original Meshy WebP/PBR atlas',
  opts: { ratio: 0.75, error: 0.005, allowMonobloc: true, protect: '^$' },
  variantsAreExploratoryAndNotCommitted: true,
  modules: summary,
}, null, 2) + '\n');
console.log('All four Meshy-derived T-01 geometry/UV optimization trials validated');
