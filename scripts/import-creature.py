"""Import a rigged Meshy creature (no clip) into a local JS module.
Usage: PYTHONPATH=scripts python3 scripts/import-creature.py <species> path/to/model.glb
Species: ant (Red Ant Warrior), spider (Spotted Velvet Spider), roach (Low Poly
Cockroach). User-supplied
GLBs checked by SHA-256. Output keeps the skinned mesh, the Meshy SmartRig
skeleton with its bind matrices and a 512 px JPEG copy of the 2K texture (the
original stays in assets/originals/<species>/, outside Git). Gaits are
procedural (src/ant-model.js, src/spider-model.js, src/roach-model.js).

A species may list its leg chains (`legs`, bone names from hip to foot) and a
body `hub` bone: each welded shell then keeps only the leg chain it belongs to,
and weight that the Meshy rig spread on other legs' bones moves to the hub, so
a step never drags the carapace or a neighbouring leg. Geometry, UVs and
textures are unchanged.
"""
import base64, io, json, struct, sys
from pathlib import Path
from PIL import Image
from meshy_provenance import verify_meshy_source

SPECIES = {
    'ant': {
        'sha256': '12064094b4fe8ea01f88eabab6760b1ac71d635dc80425d3a92cdc81edb2b4cd',
        'output': 'src/ant-data.js',
        'constant': 'ANT_DATA',
        'label': 'Ant enemy (Meshy "Red Ant Warrior", rigged, no clip)',
    },
    'spider': {
        'sha256': 'e8d8f32d7739467f6758b4220dc373bfcbacae42a004fdc4d29bbfc36d1c3faa',
        'output': 'src/spider-data.js',
        'constant': 'SPIDER_DATA',
        'label': 'Spider enemy (Meshy "Spotted Velvet Spider", rigged, no clip)',
    },
    'roach': {
        'sha256': '4ca70cae6e412b2787c81aa7cddd49c7f382b501859a1a8fc29ab3644c155fc3',
        'output': 'src/roach-data.js',
        'constant': 'ROACH_DATA',
        'label': 'Cockroach enemy (Meshy "Low Poly Cockroach", rigged, no clip)',
        'hub': 'Bone_001',
        'legs': [
            ['Bone_017', 'Bone_016', 'Bone_015', 'Bone_014'],  # front +X
            ['Bone_021', 'Bone_020', 'Bone_019', 'Bone_018'],  # front -X
            ['Bone_009', 'Bone_008', 'Bone_007', 'Bone_006'],  # middle +X
            ['Bone_013', 'Bone_012', 'Bone_011', 'Bone_010'],  # middle -X
            ['Bone_025', 'Bone_024', 'Bone_023', 'Bone_022'],  # rear +X
            ['Bone_029', 'Bone_028', 'Bone_027', 'Bone_026'],  # rear -X
        ],
    },
}
TEXTURE_SIZE = 512
species = SPECIES[sys.argv[1]]
source = Path(sys.argv[2])
verify_meshy_source(source, species['sha256'])
raw = source.read_bytes()
size = struct.unpack_from('<I', raw, 12)[0]
g = json.loads(raw[20:20 + size])
binary = raw[28 + size:]
FMT = {5126: 'f', 5123: 'H', 5125: 'I', 5121: 'B'}
WIDTH = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def read(index):
    a = g['accessors'][index]
    v = g['bufferViews'][a['bufferView']]
    n = a['count'] * WIDTH[a['type']]
    return list(struct.unpack_from('<' + FMT[a['componentType']] * n, binary,
                                   v.get('byteOffset', 0) + a.get('byteOffset', 0)))


def pack(fmt, values):
    return base64.b64encode(struct.pack('<' + fmt * len(values), *values)).decode()


assert len(g['meshes']) == 1 and len(g['skins']) == 1 and not g.get('animations')
prim = g['meshes'][0]['primitives'][0]
positions = read(prim['attributes']['POSITION'])
uvs = read(prim['attributes']['TEXCOORD_0'])
joints = read(prim['attributes']['JOINTS_0'])
weights = read(prim['attributes']['WEIGHTS_0'])
indices = read(prim['indices'])
assert max(indices) < 65536
skin = g['skins'][0]
joint_nodes = skin['joints']
node_to_joint = {n: i for i, n in enumerate(joint_nodes)}
parents = {}
for i, node in enumerate(g['nodes']):
    for c in node.get('children', []):
        parents[c] = i
bones = []
for n in joint_nodes:
    node = g['nodes'][n]
    assert all(abs(s - 1) < 1e-3 for s in node.get('scale', [1, 1, 1]))
    bones.append({
        'name': node['name'],
        'parent': node_to_joint.get(parents.get(n), -1),
        't': [round(x, 6) for x in node.get('translation', [0, 0, 0])],
        'r': [round(x, 6) for x in node.get('rotation', [0, 0, 0, 1])],
    })
assert len(bones) < 256
ibm = read(skin['inverseBindMatrices'])


def clean_leg_weights(chains, hub):
    """Welded shells keep weight only on their own leg chain; the rest of the
    leg-bone weight goes to the hub. Returns the number of moved influences."""
    index = {b['name']: i for i, b in enumerate(bones)}
    owner = {index[name]: c for c, chain in enumerate(chains) for name in chain}
    count = len(positions) // 3
    parent_of = list(range(count))

    def find(x):
        while parent_of[x] != x:
            parent_of[x] = parent_of[parent_of[x]]
            x = parent_of[x]
        return x
    for t in range(0, len(indices), 3):
        a = find(indices[t])
        for k in (1, 2):
            parent_of[find(indices[t + k])] = a
    seen = {}
    for v in range(count):
        key = tuple(round(x, 4) for x in positions[v * 3:v * 3 + 3])
        if key in seen:
            parent_of[find(v)] = find(seen[key])
        else:
            seen[key] = v
    shells = {}
    for v in range(count):
        shells.setdefault(find(v), []).append(v)
    moved = 0
    for verts in shells.values():
        totals = {}
        for v in verts:
            for k in range(4):
                c = owner.get(joints[v * 4 + k])
                if c is not None:
                    totals[c] = totals.get(c, 0) + weights[v * 4 + k]
        mass = sum(sum(weights[v * 4:v * 4 + 4]) for v in verts)
        best = max(totals, key=totals.get) if totals else None
        own = best if best is not None and totals[best] > mass / 2 else None
        for v in verts:
            slots = {}
            for k in range(4):
                j, w = joints[v * 4 + k], weights[v * 4 + k]
                if w <= 0:
                    continue
                if j in owner and owner[j] != own:
                    j, moved = index[hub], moved + 1
                slots[j] = slots.get(j, 0) + w
            ranked = sorted(slots.items(), key=lambda kv: -kv[1])[:4]
            total = sum(w for _, w in ranked)
            ranked += [(0, 0)] * (4 - len(ranked))
            joints[v * 4:v * 4 + 4] = [j for j, _ in ranked]
            weights[v * 4:v * 4 + 4] = [w / total for _, w in ranked]
    return moved


moved = clean_leg_weights(species['legs'], species['hub']) if 'legs' in species else None
# Renormalise the four weights after 8-bit quantisation (sum exactly 255).
weights_q = []
for i in range(0, len(weights), 4):
    w = [round(x * 255) for x in weights[i:i + 4]]
    w[w.index(max(w))] += 255 - sum(w)
    weights_q += w

img = g['images'][0]
view = g['bufferViews'][img['bufferView']]
png = binary[view.get('byteOffset', 0):view.get('byteOffset', 0) + view['byteLength']]
image = Image.open(io.BytesIO(png)).convert('RGB').resize((TEXTURE_SIZE, TEXTURE_SIZE), Image.LANCZOS)
out = io.BytesIO()
image.save(out, 'JPEG', quality=86, optimize=True)
texture = 'data:image/jpeg;base64,' + base64.b64encode(out.getvalue()).decode()

data = {
    'source': {'sha256': species['sha256'], 'generator': g['asset'].get('generator'),
               'triangles': len(indices) // 3, 'vertices': len(positions) // 3, 'bones': len(bones),
               'textureBytes': len(out.getvalue()),
               **({'legWeightsMoved': moved} if moved is not None else {})},
    'positions': pack('f', positions),
    'uvs': pack('f', uvs),
    'indices': pack('H', indices),
    'joints': pack('B', joints),
    'weights': pack('B', weights_q),
    'bones': bones,
    'inverseBindMatrices': pack('f', ibm),
    'texture': texture,
}
Path(species['output']).write_text(
    '// ' + species['label'] + ': user-supplied GLB, generated by\n'
    '// scripts/import-creature.py. Do not edit by hand.\n'
    'export const ' + species['constant'] + ' = ' + json.dumps(data, separators=(',', ':')) + ';\n')
print(sys.argv[1], len(bones), 'bones', len(indices) // 3, 'triangles', len(positions) // 3, 'vertices',
      'texture', len(out.getvalue()), 'bytes')
