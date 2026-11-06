#!/usr/bin/env node
/**
 * Meshy GLB reduction with glTF Transform IO and meshoptimizer.
 *
 * Intentionally only replaces triangle index buffers. It never rewrites vertex
 * attributes, texture atlases, normals, UV coordinates or joint weights.
 * This is more conservative than a general-purpose GLB optimization pass.
 */
import { NodeIO } from '@gltf-transform/core';
import { MeshoptSimplifier } from 'meshoptimizer';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const io = new NodeIO();
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const bytesOf = (array) => Buffer.from(array.buffer, array.byteOffset, array.byteLength);
const TRIANGLES = 4;
const DEFAULT_PROTECTED = 'rotor|prop|turret|tourelle|canon|barrel|wheel|roue|hinge|pivot|gun';
const TOOL_VERSION = '1.0.0';

function usage() {
  console.log(`Usage:
  optimize INPUT.glb OUTPUT.glb [--ratio 0.5] [--error 0.001] [--protect REGEX] [--overwrite] [--allow-monobloc] [--regions BOXES.json]
  inspect INPUT.glb
  validate ORIGINAL.glb OPTIMIZED.glb
  selftest

Inputs are never modified. UVs, texture image bytes, material settings,
vertex positions, normals, skin attributes and mesh node transforms must
remain identical after roundtrip. Protected named meshes are never simplified.
For game assets requiring independently mobile parts, use an already segmented
GLB. --allow-monobloc explicitly permits exploratory optimization of a single
mesh; it is NOT evidence that a Meshy weapon/rotor was preserved.
`);
}

function parse(args) {
  const flags = { ratio: 0.5, error: 0.001, protect: DEFAULT_PROTECTED, overwrite: false, allowMonobloc: false, regions: null };
  const paths = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--overwrite') flags.overwrite = true;
    else if (arg === '--allow-monobloc') flags.allowMonobloc = true;
    else if (['--ratio', '--error', '--protect', '--regions'].includes(arg)) {
      if (!args[i + 1]) throw Error(`Missing value for ${arg}`);
      flags[arg.slice(2)] = args[++i];
    } else if (arg.startsWith('--')) throw Error(`Unknown option: ${arg}`);
    else paths.push(arg);
  }
  flags.ratio = Number(flags.ratio);
  flags.error = Number(flags.error);
  if (!(flags.ratio > 0 && flags.ratio <= 1)) throw Error('--ratio must be within (0, 1]');
  if (!(flags.error >= 0 && flags.error <= 1)) throw Error('--error must be within [0, 1]');
  flags.protect = new RegExp(flags.protect, 'i');
  return { flags, paths };
}

function countTriangles(document) {
  let triangles = 0, vertices = 0, primitives = 0;
  for (const mesh of document.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    primitives++;
    vertices += prim.getAttribute('POSITION')?.getCount() || 0;
    if (prim.getMode() === TRIANGLES) triangles += (prim.getIndices()?.getCount() || prim.getAttribute('POSITION')?.getCount() || 0) / 3;
  }
  return { triangles, vertices, primitives, meshes: document.getRoot().listMeshes().length };
}

function snapshot(document) {
  const root = document.getRoot();
  // Structural invariants are compared after a read/write roundtrip.
  return {
    nodes: root.listNodes().map((n) => ({
      name: n.getName(),
      mesh: n.getMesh()?.getName() ?? null,
      translation: n.getTranslation(),
      rotation: n.getRotation(),
      scale: n.getScale(),
      children: n.listChildren().map((c) => c.getName()),
    })),
    meshes: root.listMeshes().map((m) => ({
      name: m.getName(),
      primitives: m.listPrimitives().map((p) => ({
        mode: p.getMode(),
        material: p.getMaterial()?.getName() ?? null,
        // All attributes (including UV seams, normals and skinning) are immutable.
        attributes: p.listSemantics().sort().map((semantic) => {
          const attr = p.getAttribute(semantic);
          return [semantic, attr.getType(), attr.getCount(), attr.getNormalized(), sha(bytesOf(attr.getArray()))];
        }),
      })),
    })),
    textures: root.listTextures().map((t) => [t.getName(), t.getMimeType(), sha(t.getImage())]),
    materials: root.listMaterials().map((m) => ({
      name: m.getName(),
      baseColor: m.getBaseColorFactor(),
      metallic: m.getMetallicFactor(),
      roughness: m.getRoughnessFactor(),
      alphaMode: m.getAlphaMode(),
      doubleSided: m.getDoubleSided(),
      textures: [m.getBaseColorTexture(), m.getNormalTexture(), m.getMetallicRoughnessTexture(), m.getEmissiveTexture(), m.getOcclusionTexture()].map((t) => t?.getName() ?? null),
    })),
  };
}

function checkEquivalent(original, variant) {
  const a = snapshot(original), b = snapshot(variant);
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw Error('GLB structure/attributes/materials/textures changed; refusing optimized candidate');
  }
  const am = original.getRoot().listMeshes(), bm = variant.getRoot().listMeshes();
  let sourceTriangles = 0, targetTriangles = 0;
  for (let i = 0; i < am.length; i++) {
    const ap = am[i].listPrimitives(), bp = bm[i].listPrimitives();
    for (let j = 0; j < ap.length; j++) {
      const before = ap[j].getIndices()?.getArray(), after = bp[j].getIndices()?.getArray();
      if (ap[j].getMode() !== TRIANGLES) continue;
      if (!after || after.length % 3) throw Error('Invalid output triangle indices');
      const count = ap[j].getAttribute('POSITION').getCount();
      for (const index of after) if (index >= count) throw Error('Output triangle index out of range');
      const nBefore = before?.length ?? count;
      if (after.length > nBefore) throw Error('Triangle count increased unexpectedly');
      sourceTriangles += nBefore / 3;
      targetTriangles += after.length / 3;
    }
  }
  return { sourceTriangles, targetTriangles };
}

// A region conservatively protects every triangle whose AABB overlaps its box.
async function readRegions(file) {
  if(!file)return [];
  const config=JSON.parse(await readFile(file,'utf8'));
  if(!Array.isArray(config.regions)||!config.regions.length)throw Error('Expected non-empty regions array');
  return config.regions.map((r,i)=>{
    if(!Array.isArray(r.min)||!Array.isArray(r.max)||r.min.length!==3||r.max.length!==3||
       r.min.some((v,k)=>!Number.isFinite(v)||!Number.isFinite(r.max[k])||r.max[k]<v))
      throw Error('Invalid region bounding box at index '+i);
    return {name:r.name||String(i),mesh:r.mesh||null,min:r.min,max:r.max};
  });
}
function partition(indices, positions, regions) {
  const locked=[], free=[];
  for(let i=0;i<indices.length;i+=3) {
    const low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];
    for(let t=0;t<3;t++) for(let axis=0;axis<3;axis++){
      const value=positions[indices[i+t]*3+axis];
      low[axis]=Math.min(low[axis],value); high[axis]=Math.max(high[axis],value);
    }
    const protect=regions.some((r)=>low.every((v,k)=>v<=r.max[k]&&high[k]>=r.min[k]));
    (protect?locked:free).push(indices[i],indices[i+1],indices[i+2]);
  }
  return {locked:Uint32Array.from(locked),free:Uint32Array.from(free)};
}
function assertProtected(original,optimized,regions){
  if(!regions.length)return;
  const a=original.getRoot().listMeshes(),b=optimized.getRoot().listMeshes();
  for(let i=0;i<a.length;i++){
    const zones=regions.filter((r)=>!r.mesh||r.mesh===a[i].getName());
    if(!zones.length)continue;
    const before=a[i].listPrimitives(),after=b[i].listPrimitives();
    for(let j=0;j<before.length;j++){
      if(before[j].getMode()!==TRIANGLES)continue;
      const originalIndices=before[j].getIndices()?.getArray();
      if(!originalIndices)throw Error('Regions require indexed primitives');
      const locked=partition(originalIndices,before[j].getAttribute('POSITION').getArray(),zones).locked;
      const target=after[j].getIndices().getArray();
      const counts=new Map();
      for(let k=0;k<target.length;k+=3){
        const key=Array.from(target.slice(k,k+3)).join(',');
        counts.set(key,(counts.get(key)||0)+1);
      }
      for(let k=0;k<locked.length;k+=3){
        const key=Array.from(locked.slice(k,k+3)).join(',');
        if(!counts.get(key))throw Error('A protected triangle was removed: '+key);
        counts.set(key,counts.get(key)-1);
      }
    }
  }
}
function protectedMeshNames(document, regex) {
  const guarded = new Set();
  for (const mesh of document.getRoot().listMeshes()) if (regex.test(mesh.getName())) guarded.add(mesh);
  for (const node of document.getRoot().listNodes()) if (node.getMesh() && regex.test(node.getName())) guarded.add(node.getMesh());
  return guarded;
}

async function optimize(input, output, flags) {
  if (path.resolve(input) === path.resolve(output)) throw Error('Original and output paths must be different');
  if (!flags.overwrite && existsSync(output)) throw Error(`Output exists (use --overwrite to replace): ${output}`);
  if (!input.toLowerCase().endsWith('.glb') || !output.toLowerCase().endsWith('.glb')) throw Error('Use GLB input/output paths');
  const originalBytes = await readFile(input);
  const doc = await io.read(input);
  const baseline = await io.read(input);
  const root = doc.getRoot();
  const regions=await readRegions(flags.regions);
  if (root.listMeshes().length === 1 && !flags.allowMonobloc && !regions.length) throw Error('Single-mesh input: define --regions for critical parts, or pass --allow-monobloc for exploratory use');
  if (!root.listMeshes().length) throw Error('Input contains no meshes');
  const protectedMeshes = protectedMeshNames(doc, flags.protect);
  const report = {
    version: TOOL_VERSION, engine: '@gltf-transform/core 4.5.1 + meshoptimizer 1.3.0',
    input: path.basename(input), output: path.basename(output),
    originalSha256: sha(originalBytes),
    ratio: flags.ratio, error: flags.error, protectedPattern: flags.protect.source,
    monoblocOverride: flags.allowMonobloc,
    regions,
    before: countTriangles(doc),
    preservedMeshes: [], modifiedMeshes: [], warnings: [],
  };
  await MeshoptSimplifier.ready;
  for (const mesh of root.listMeshes()) {
    if (protectedMeshes.has(mesh)) {
      report.preservedMeshes.push(mesh.getName());
      continue;
    }
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== TRIANGLES) {
        report.warnings.push(`Unsupported primitive mode in ${mesh.getName()}`);
        continue;
      }
      const positions = prim.getAttribute('POSITION');
      if (!positions || !(positions.getArray() instanceof Float32Array)) throw Error('Only Float32 POSITION accessors supported (no quantized attributes)');
      const array = positions.getArray();
      const rawIndices = prim.getIndices()?.getArray();
      const count = positions.getCount();
      const indices = rawIndices ? Uint32Array.from(rawIndices) : Uint32Array.from({length: count}, (_,i) => i);
      if (indices.length % 3) throw Error('Non-triangle index count');
      if (indices.length <= 3) continue;
      const applicable=regions.filter((r)=>!r.mesh||r.mesh===mesh.getName());
      if(applicable.length&&!rawIndices)throw Error('Region protection needs indexed triangles');
      const {locked,free}=partition(indices,array,applicable);
      const target=Math.max(3,Math.floor(free.length*flags.ratio/3)*3);
      const [simplified,measuredError]=free.length>3
        ? MeshoptSimplifier.simplify(free,array,3,target,flags.error,['LockBorder'])
        : [free,0];
      const kept=Uint32Array.from([...locked,...simplified]);
      if(kept.length && kept.length < indices.length){
        const narrowed=count<=65535?Uint16Array.from(kept):kept;
        prim.setIndices(doc.createAccessor().setBuffer(root.listBuffers()[0]).setType('SCALAR').setArray(narrowed));
        report.modifiedMeshes.push({name:mesh.getName(), trianglesBefore:indices.length/3, trianglesAfter:kept.length/3, lockedTriangles:locked.length/3, measuredError});
      }
    }
  }
  report.after = countTriangles(doc);
  checkEquivalent(baseline, doc);
  assertProtected(baseline,doc,regions);
  if (report.after.triangles >= report.before.triangles) report.warnings.push('No geometry reduction achieved within constraints');
  // Write candidate to a temporary file; do not replace an existing output until validated.
  await mkdir(path.dirname(output), { recursive: true });
  const tmp = `${output}.tmp-${process.pid}.glb`;
  try {
    await io.write(tmp, doc);
    const roundtrip = await io.read(tmp);
    report.validation = checkEquivalent(baseline, roundtrip);
    assertProtected(baseline,roundtrip,regions);
    if (protectedMeshes.size) {
      const beforeMeshes = baseline.getRoot().listMeshes();
      const afterMeshes = roundtrip.getRoot().listMeshes();
      for (const mesh of protectedMeshes) {
        const id = root.listMeshes().indexOf(mesh);
        const source = beforeMeshes[id].listPrimitives().map((p) => p.getIndices()?.getArray() || []);
        const out = afterMeshes[id].listPrimitives().map((p) => p.getIndices()?.getArray() || []);
        if (JSON.stringify(source.map((a)=>Array.from(a))) !== JSON.stringify(out.map((a)=>Array.from(a)))) {
          throw Error(`Protected mesh ${mesh.getName()} was changed`);
        }
      }
    }
    const fs = await import('node:fs/promises');
    await fs.rename(tmp, output);
    report.bytes = {before:originalBytes.byteLength, after:(await stat(output)).size};
    report.optimizedSha256 = sha(await readFile(output));
    await writeFile(`${output}.report.json`, JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    const fs = await import('node:fs/promises');
    await fs.rm(tmp, {force:true}).catch(()=>{});
  }
}

async function run(argv) {
  const [cmd, ...args] = argv;
  if (!cmd || cmd === 'help' || cmd === '--help') return usage();
  if (cmd === 'selftest') return import('./test.mjs');
  const {flags,paths} = parse(args);
  if (cmd === 'inspect' && paths.length === 1) {
    const doc = await io.read(paths[0]);
    return console.log(JSON.stringify({sha256:sha(await readFile(paths[0])), bytes:(await stat(paths[0])).size, ...countTriangles(doc), meshes:doc.getRoot().listMeshes().map((m)=>({name:m.getName(), triangles:m.listPrimitives().reduce((n,p)=>n+(p.getIndices()?.getCount()||0)/3,0)}))},null,2));
  }
  if (cmd === 'validate' && paths.length === 2) {
    const original=await io.read(paths[0]),optimized=await io.read(paths[1]);
    const result=checkEquivalent(original,optimized);
    assertProtected(original,optimized,await readRegions(flags.regions));
    return console.log(JSON.stringify({valid:true,...result}));
  }
  if (cmd === 'optimize' && paths.length === 2) return optimize(paths[0],paths[1],flags);
  throw Error('Invalid arguments; use "help"');
}

run(process.argv.slice(2)).catch((e) => { console.error('Asset optimizer:', e.message); process.exitCode=1; });
