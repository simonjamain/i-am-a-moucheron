import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';

const io = new NodeIO();
const root = await mkdtemp(path.join(tmpdir(),'moucheron-assets-'));
const bin = fileURLToPath(new URL('./cli.mjs',import.meta.url));
const run = (...args) => spawnSync(process.execPath,[bin,...args],{encoding:'utf8'});
const original=path.join(root,'original.glb'),result=path.join(root,'optimized.glb');
try {
  const document = new Document();
  const scene = document.createScene('fixture');
  const texture = document.createTexture('Atlas').setMimeType('image/png').setImage(Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==','base64'
  ));
  const material = document.createMaterial('paint').setBaseColorTexture(texture);
  const rows = 12, vertices=[], uv=[], indices=[];
  for(let y=0;y<=rows;y++)for(let x=0;x<=rows;x++){
    vertices.push(x/rows,y/rows,0);
    uv.push(x/rows,y/rows);
  }
  for(let y=0;y<rows;y++)for(let x=0;x<rows;x++){
    const p=y*(rows+1)+x; indices.push(p,p+1,p+rows+1,p+1,p+rows+2,p+rows+1);
  }
  const body = document.createMesh('fuselage').addPrimitive(document.createPrimitive()
    .setMaterial(material)
    .setAttribute('POSITION',document.createAccessor().setType('VEC3').setArray(new Float32Array(vertices)))
    .setAttribute('TEXCOORD_0',document.createAccessor().setType('VEC2').setArray(new Float32Array(uv)))
    .setIndices(document.createAccessor().setType('SCALAR').setArray(new Uint16Array(indices))));
  const turret = document.createMesh('turret').addPrimitive(document.createPrimitive()
    .setMaterial(material)
    .setAttribute('POSITION',document.createAccessor().setType('VEC3').setArray(new Float32Array([0,0,1,1,0,1,0,1,1])))
    .setAttribute('TEXCOORD_0',document.createAccessor().setType('VEC2').setArray(new Float32Array([0,0,1,0,0,1])))
    .setIndices(document.createAccessor().setType('SCALAR').setArray(new Uint16Array([0,1,2]))));
  scene.addChild(document.createNode('body').setMesh(body));
  scene.addChild(document.createNode('turret mount').setMesh(turret));
  await io.write(original,document);
  const a=run('optimize',original,result,'--ratio','0.25','--error','1');
  assert.equal(a.status,0,a.stderr);
  const b=run('validate',original,result);
  assert.equal(b.status,0,b.stderr);
  const report=JSON.parse(await readFile(result+'.report.json','utf8'));
  assert.ok(report.after.triangles < report.before.triangles, 'body triangles reduced');
  assert.equal(report.preservedMeshes[0], 'turret');
  assert.equal(report.validation.sourceTriangles, report.before.triangles);
  assert.equal(run('optimize',original,result).status,1, 'no accidental overwrite');
  assert.equal(run('optimize',original,original).status,1, 'input is immutable');
  const bad=path.join(root,'broken.glb');
  await writeFile(bad,Buffer.from('not glb'));
  assert.equal(run('inspect',bad).status,1,'reject invalid GLB');
  console.log('PASS: GLB roundtrip, UV/atlas and named turret unchanged; geometry reduced; immutability enforced');
} finally { await rm(root,{recursive:true,force:true}); }
