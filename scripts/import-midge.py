"""Import the midge enemy (Meshy "Angry Little Fly", rigged) into a local JS module.
Usage: PYTHONPATH=scripts python3 scripts/import-midge.py path/to/angry-little-fly.glb
User-supplied Meshy GLB, checked by SHA-256. The GLB carries a 38-bone Meshy
SmartRig skeleton but no animation: the flight cycle is procedural
(src/midge-model.js). Output keeps the skinned mesh, the skeleton with its bind
matrices plus two added wing bones, and a 512 px JPEG copy of the 2K texture (the original stays in
assets/originals/midge/, outside Git).
"""
import base64, io, json, struct, sys
from pathlib import Path
from PIL import Image
from meshy_provenance import verify_meshy_source

SOURCE_SHA256 = '5db0deca500732e4980bea1daf16fc412d5ed04aaeaf26cf73c0de7bd81bf404'
TEXTURE_SIZE = 512
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


assert len(g['meshes']) == 1 and len(g['skins']) == 1
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

# The Meshy rig weights both wings on the abdomen bone. Each wing is a separate
# shell (no shared vertex with the body): give each its own bone, hinged at the
# shell's innermost vertices and parented to the thorax, so they can flap.
import numpy as np
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
    key = tuple(np.round(p, 5))
    if key in seen:
        parent_of[find(v)] = find(seen[key])
    else:
        seen[key] = v
shells = {}
for v in range(len(P)):
    shells.setdefault(find(v), []).append(v)
THORAX = 'Bone_003'
thorax = next(i for i, b in enumerate(bones) if b['name'] == THORAX)
thorax_world = np.linalg.inv(np.array(ibm[thorax * 16:thorax * 16 + 16]).reshape(4, 4).T)
wings = []
for verts in shells.values():
    box_min, box_max = P[verts].min(0), P[verts].max(0)
    # Wing shells: high on the back (above y 0.7), lateral, behind the head.
    if box_min[1] > 0.7 and box_max[2] < 0.2 and min(abs(box_min[0]), abs(box_max[0])) > 0.1:
        wings.append(sorted(verts))
assert len(wings) == 2, len(wings)
wings.sort(key=lambda vs: -P[vs[0]][0])  # +X first: the fly faces +Z, so +X is its left
WING_NAMES = ['Wing_L', 'Wing_R']
wing_info = []
for name, verts in zip(WING_NAMES, wings):
    ax = np.abs(P[verts][:, 0])
    root = P[verts][ax < ax.min() + 0.06]
    hinge = root.mean(0)
    hinge[0] = np.sign(hinge[0]) * ax.min()
    world = np.eye(4)
    world[:3, 3] = hinge
    local = np.linalg.inv(thorax_world) @ world
    m = local[:3, :3]
    # Rotation matrix -> quaternion (x, y, z, w); m is a pure rotation here.
    w = np.sqrt(max(0, 1 + m[0, 0] + m[1, 1] + m[2, 2])) / 2
    q = [(m[2, 1] - m[1, 2]) / (4 * w), (m[0, 2] - m[2, 0]) / (4 * w), (m[1, 0] - m[0, 1]) / (4 * w), w]
    joint = len(bones)
    bones.append({'name': name, 'parent': thorax, 't': [round(float(x), 6) for x in local[:3, 3]],
                  'r': [round(float(x), 6) for x in q]})
    inverse = np.eye(4)
    inverse[:3, 3] = -hinge
    ibm += [float(x) for x in inverse.T.reshape(-1)]
    for v in verts:
        joints[v * 4:v * 4 + 4] = [joint, 0, 0, 0]
        weights[v * 4:v * 4 + 4] = [1, 0, 0, 0]
    wing_info.append({'bone': name, 'vertices': len(verts), 'hinge': [round(float(x), 4) for x in hinge]})
assert len(bones) < 256
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
    'source': {'sha256': SOURCE_SHA256, 'generator': g['asset'].get('generator'), 'triangles': len(indices) // 3,
               'vertices': len(positions) // 3, 'bones': len(bones), 'textureBytes': len(out.getvalue()),
               'addedWingBones': wing_info},
    'positions': pack('f', positions),
    'uvs': pack('f', uvs),
    'indices': pack('H', indices),
    'joints': pack('B', joints),
    'weights': pack('B', weights_q),
    'bones': bones,
    'inverseBindMatrices': pack('f', ibm),
    'texture': texture,
}
Path('src/midge-data.js').write_text(
    '// Midge enemy: user-supplied Meshy GLB (rigged, no clip), generated by\n'
    '// scripts/import-midge.py. Do not edit by hand.\n'
    'export const MIDGE_DATA = ' + json.dumps(data, separators=(',', ':')) + ';\n')
print(len(bones), 'bones', len(indices) // 3, 'triangles', len(positions) // 3, 'vertices',
      'texture', len(out.getvalue()), 'bytes')
