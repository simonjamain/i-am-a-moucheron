"""Import the mosquito enemy (Meshy "Low Poly Mosquito", rigged) into a JS module.
Usage: PYTHONPATH=scripts python3 scripts/import-mosquito.py path/to/mosquito.glb
User-supplied Meshy GLB, checked by SHA-256. It carries a 62-bone Meshy
SmartRig skeleton but no animation: the flight cycle is procedural
(src/mosquito-model.ts). Output keeps the skinned mesh, the skeleton with its
bind matrices and a 512 px JPEG copy of the texture (the original stays in
assets/originals/mosquito/, outside Git). No geometry, UV or texture is changed.

Weight fixes, all rigid re-bindings of whole parts (same as the bee):
- each wing (one shell per side, three Meshy bones) follows its wing root
  bone at 100 %, so the beat never bends the membrane;
- the body shell and the head parts (eyes, proboscis) lose their weight on
  the wing and leg bones: it goes to the bone each chain hangs from, so
  beating wings and dangling legs never drag the body;
- each leg shell keeps only its own chain; stray weight goes to its hub.
"""
import base64, io, json, struct, sys
from pathlib import Path
import numpy as np
from PIL import Image
from meshy_provenance import verify_meshy_source

SOURCE_SHA256 = 'c13dff6e04419ca34cc7a9f7e42df1593bd1e0dbbb7350c75e005224784d1c15'
TEXTURE_SIZE = 512
# Wing chains (root first), +X (the mosquito's left, it faces +Z) first.
WINGS = [('Bone_034', 'Bone_033', 'Bone_032'), ('Bone_037', 'Bone_036', 'Bone_035')]
# Leg chains (hip to toe), front to rear, +X first.
LEGS = [
    ['Bone_013', 'Bone_012', 'Bone_011', 'Bone_010', 'Bone_009', 'Bone_008'],
    ['Bone_019', 'Bone_018', 'Bone_017', 'Bone_016', 'Bone_015', 'Bone_014'],
    ['Bone_031', 'Bone_030', 'Bone_029', 'Bone_028', 'Bone_027', 'Bone_026'],
    ['Bone_025', 'Bone_024', 'Bone_023', 'Bone_022', 'Bone_021', 'Bone_020'],
    ['Bone_043', 'Bone_042', 'Bone_041', 'Bone_040', 'Bone_039', 'Bone_038'],
    ['Bone_049', 'Bone_048', 'Bone_047', 'Bone_046', 'Bone_045', 'Bone_044'],
]
source = Path(sys.argv[1])
verify_meshy_source(source, SOURCE_SHA256)
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
ibm = read(skin['inverseBindMatrices'])
index = {b['name']: i for i, b in enumerate(bones)}

# Shells: triangles joined, plus vertices that share a position (flat-shaded
# low poly splits every UV seam).
P = np.array(positions).reshape(-1, 3)
parent_of = list(range(len(P)))
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
for v, p in enumerate(P):
    key = tuple(np.round(p, 4))
    if key in seen:
        parent_of[find(v)] = find(seen[key])
    else:
        seen[key] = v
roots = {}
for v in range(len(P)):
    roots.setdefault(find(v), []).append(v)
shells = sorted(roots.values(), key=len, reverse=True)
assert len(shells) == 12, len(shells)  # body, six legs, two wings, eyes and proboscis
body = shells[0]


def dominant(verts):
    count = {}
    for v in verts:
        for k in range(4):
            if weights[v * 4 + k] > 0.05:
                count[joints[v * 4 + k]] = count.get(joints[v * 4 + k], 0) + 1
    return count


def rebind(v, remap):
    slots = {}
    for k in range(4):
        j, w = joints[v * 4 + k], weights[v * 4 + k]
        if w <= 0:
            continue
        j = remap(j)
        slots[j] = slots.get(j, 0) + w
    ranked = sorted(slots.items(), key=lambda kv: -kv[1])[:4]
    total = sum(w for _, w in ranked)
    ranked += [(0, 0)] * (4 - len(ranked))
    joints[v * 4:v * 4 + 4] = [j for j, _ in ranked]
    weights[v * 4:v * 4 + 4] = [w / total for _, w in ranked]


wing_info = []
claimed = set()
for side, names in enumerate(WINGS):
    root = names[0]
    chain = {index[n] for n in names}
    parts = [s for s in shells[1:] if sum(n for j, n in dominant(s).items() if j in chain) > 0.8 * len(s)]
    assert len(parts) == 1, (root, len(parts))
    n = 0
    for s in parts:
        for v in s:
            joints[v * 4:v * 4 + 4] = [index[root], 0, 0, 0]
            weights[v * 4:v * 4 + 4] = [1, 0, 0, 0]
        n += len(s)
        claimed.add(id(s))
    xs = P[[v for s in parts for v in s]][:, 0]
    assert np.sign(xs.mean()) == (1 if side == 0 else -1)
    wing_info.append({'bone': root, 'vertices': n})

# Legs: each shell keeps its own chain, the rest goes to its hub.
leg_moved = 0
for chain in LEGS:
    own = {index[n] for n in chain}
    hub = bones[index[chain[0]]]['parent']
    parts = [s for s in shells[1:] if id(s) not in claimed and sum(n for j, n in dominant(s).items() if j in own) > 0.6 * len(s)]
    assert len(parts) == 1, (chain[0], len(parts))
    claimed.add(id(parts[0]))
    for v in parts[0]:
        for k in range(4):
            if weights[v * 4 + k] > 0 and joints[v * 4 + k] not in own:
                leg_moved += 1
        rebind(v, lambda j: j if j in own else hub)
assert len(claimed) == 8  # eyes and proboscis keep their head bones
# Body and head parts: weight on wing or leg bones goes to the bone the chain
# hangs from.
hub_of = {}
for names in WINGS:
    for name in names:
        hub_of[index[name]] = bones[index[names[0]]]['parent']
for chain in LEGS:
    for name in chain:
        hub_of[index[name]] = bones[index[chain[0]]]['parent']
moved = 0
for v in [v for s in shells if id(s) not in claimed for v in s]:
    moved += sum(1 for k in range(4) if weights[v * 4 + k] > 0 and joints[v * 4 + k] in hub_of)
    rebind(v, lambda j: hub_of.get(j, j))

assert len(bones) < 256
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
    'source': {'sha256': SOURCE_SHA256, 'generator': g['asset'].get('generator'), 'triangles': len(indices) // 3,
               'vertices': len(positions) // 3, 'bones': len(bones), 'textureBytes': len(out.getvalue()),
               'rigidWings': wing_info, 'bodyWeightsMoved': moved, 'legWeightsMoved': leg_moved},
    'positions': pack('f', positions),
    'uvs': pack('f', uvs),
    'indices': pack('H', indices),
    'joints': pack('B', joints),
    'weights': pack('B', weights_q),
    'bones': bones,
    'inverseBindMatrices': pack('f', ibm),
    'texture': texture,
}
Path('src/mosquito-data.ts').write_text(
    '// Mosquito enemy: user-supplied Meshy GLB (rigged, no clip), generated by\n'
    '// scripts/import-mosquito.py. Do not edit by hand.\n'
    'export const MOSQUITO_DATA = ' + json.dumps(data, separators=(',', ':')) + ';\n')
print(len(bones), 'bones', len(indices) // 3, 'triangles', len(positions) // 3, 'vertices',
      'texture', len(out.getvalue()), 'bytes', wing_info, 'body moved', moved, 'legs moved', leg_moved)
