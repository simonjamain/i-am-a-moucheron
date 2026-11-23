"""Import the rat enemy (Meshy "Low Poly Mouse", rigged and animated) into a JS module.
Usage: PYTHONPATH=scripts python3 scripts/import-rat.py path/to/mouse-walking.glb
User-supplied Meshy GLB, checked by SHA-256. Unlike the other creatures it
ships a walking clip ("Armature|Unreal Take|baselayer", 1 s, 31 keys) on a
27-bone skeleton exported by Blender: an armature node scaled 0.01 and turned
from Z-up, and a constant 1.8233 scale on `Hips` during the clip.

Output, in model metres (Y up, head +Z, about 1.25 m nose to tail tip):
- the skinned mesh, unchanged apart from the 100x unit scale;
- the bind skeleton without scale (local translation and rotation per bone)
  and its inverse bind matrices;
- the clip resampled at its 30 keys as world-space (model) rotation and
  position of every bone, divided by the Hips scale so the clip plays on the
  bind-size mesh (a uniform rescale: the look is unchanged). The clip walks in
  place; src/rat-model.js turns it into pose deltas and the walker batch
  drives its phase by distance;
- a 512 px JPEG copy of the texture (original in assets/originals/rat/).
"""
import base64, io, json, struct, sys
from pathlib import Path
import numpy as np
from PIL import Image
from meshy_provenance import verify_meshy_source

SOURCE_SHA256 = 'fa7bf0c888f267fea959c05f16d87f6a7cb406baaafcb35a02cc6029f3683eae'
TEXTURE_SIZE = 512
UNIT = 100.0  # Blender centimetres inside a 0.01 armature -> model metres
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


def quat_matrix(q):
    x, y, z, w = q
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def matrix_quat(m):
    # Rotation matrix (orthonormal) -> quaternion [x, y, z, w], w >= 0.
    t = np.trace(m)
    if t > 0:
        s = np.sqrt(t + 1) * 2
        q = [(m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s, s / 4]
    else:
        i = int(np.argmax(np.diag(m)))
        j, k = (i + 1) % 3, (i + 2) % 3
        s = np.sqrt(1 + m[i, i] - m[j, j] - m[k, k]) * 2
        q = [0, 0, 0, 0]
        q[i] = s / 4
        q[j] = (m[j, i] + m[i, j]) / s
        q[k] = (m[k, i] + m[i, k]) / s
        q[3] = (m[k, j] - m[j, k]) / s
    q = np.array(q)
    q /= np.linalg.norm(q)
    return q if q[3] >= 0 else -q


def trs(t, r, s):
    m = np.eye(4)
    m[:3, :3] = quat_matrix(r) * np.array(s)
    m[:3, 3] = t
    return m


def rigid(m, scale):
    # World matrix with a uniform scale -> (rotation quaternion, position * scale).
    r = m[:3, :3]
    r = r / np.cbrt(np.linalg.det(r))
    return matrix_quat(r), m[:3, 3] * scale


assert len(g['meshes']) == 1 and len(g['skins']) == 1 and len(g['animations']) == 1
prim = g['meshes'][0]['primitives'][0]
positions = [p * UNIT for p in read(prim['attributes']['POSITION'])]
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
ibm = read(skin['inverseBindMatrices'])

# Bind skeleton: world rotation/position of every joint, scale removed.
bind = []
for k in range(len(joint_nodes)):
    world = np.linalg.inv(np.array(ibm[k * 16:k * 16 + 16]).reshape(4, 4).T)
    bind.append(rigid(world, UNIT))
bones, inverse = [], []
for k, n in enumerate(joint_nodes):
    q, p = bind[k]
    parent = node_to_joint.get(parents.get(n), -1)
    if parent >= 0:
        pq, pp = bind[parent]
        rp = quat_matrix(pq)
        local_t = rp.T @ (p - pp)
        local_r = matrix_quat(rp.T @ quat_matrix(q))
    else:
        local_t, local_r = p, q
    bones.append({'name': g['nodes'][n]['name'], 'parent': parent,
                  't': [round(float(x), 6) for x in local_t], 'r': [round(float(x), 6) for x in local_r]})
    m = np.eye(4)
    m[:3, :3] = quat_matrix(q)
    m[:3, 3] = p
    inverse += [float(x) for x in np.linalg.inv(m).T.reshape(-1)]

# Clip: sample every channel at the rotation keys (translation and scale are
# two-key constants apart from the Hips bounce).
anim = g['animations'][0]
times = None
tracks = {}
for c in anim['channels']:
    s = anim['samplers'][c['sampler']]
    key_times = read(s['input'])
    values = read(s['output'])
    w = 4 if c['target']['path'] == 'rotation' else 3
    tracks.setdefault(c['target']['node'], {})[c['target']['path']] = (key_times, values, w)
    if c['target']['path'] == 'rotation' and len(key_times) > 2:
        times = key_times if times is None else times
assert len(times) == 31 and abs(times[-1] - times[0] - 1) < 1e-3


def sample(node, path, t, default):
    track = tracks.get(node, {}).get(path)
    if not track:
        return g['nodes'][node].get(path, default)
    key_times, values, w = track
    i = int(np.searchsorted(key_times, t, side='right')) - 1
    i = max(0, min(i, len(key_times) - 2)) if len(key_times) > 1 else 0
    if len(key_times) == 1:
        return values[:w]
    a, b = key_times[i], key_times[i + 1]
    u = 0 if b == a else min(1, max(0, (t - a) / (b - a)))
    va, vb = np.array(values[i * w:i * w + w]), np.array(values[(i + 1) * w:(i + 1) * w + w])
    if w == 4:
        if np.dot(va, vb) < 0:
            vb = -vb
        v = va * (1 - u) + vb * u
        return list(v / np.linalg.norm(v))
    return list(va * (1 - u) + vb * u)


hips = joint_nodes[0]
assert g['nodes'][hips]['name'] == 'Hips'
hips_scale = sample(hips, 'scale', times[0], [1, 1, 1])
assert max(hips_scale) - min(hips_scale) < 1e-4
clip_scale = UNIT / hips_scale[0]
FRAMES = len(times) - 1  # the last key repeats the first
clip = []
for f in range(FRAMES):
    t = times[f]
    world = {}
    def world_of(node):
        if node not in world:
            local = trs(sample(node, 'translation', t, [0, 0, 0]), sample(node, 'rotation', t, [0, 0, 0, 1]),
                        sample(node, 'scale', t, [1, 1, 1]))
            world[node] = local if node not in parents else world_of(parents[node]) @ local
        return world[node]
    for n in joint_nodes:
        q, p = rigid(world_of(n), clip_scale)
        clip += [float(x) for x in q] + [float(x) for x in p]
# Loop check: every rotation track ends where it starts.
for track in tracks.values():
    key_times, values, w = track['rotation']
    a, b = np.array(values[:4]), np.array(values[-4:])
    assert abs(abs(float(np.dot(a, b))) - 1) < 1e-4

assert len(bones) < 256
weights_q = []
for i in range(0, len(weights), 4):
    w = [round(x * 255) for x in weights[i:i + 4]]
    w[w.index(max(w))] += 255 - sum(w)
    weights_q += w

image = g['images'][g['textures'][g['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index']]['source']]
view = g['bufferViews'][image['bufferView']]
png = binary[view.get('byteOffset', 0):view.get('byteOffset', 0) + view['byteLength']]
picture = Image.open(io.BytesIO(png)).convert('RGB').resize((TEXTURE_SIZE, TEXTURE_SIZE), Image.LANCZOS)
out = io.BytesIO()
picture.save(out, 'JPEG', quality=86, optimize=True)
texture = 'data:image/jpeg;base64,' + base64.b64encode(out.getvalue()).decode()

data = {
    'source': {'sha256': SOURCE_SHA256, 'generator': g['asset'].get('generator'), 'triangles': len(indices) // 3,
               'vertices': len(positions) // 3, 'bones': len(bones), 'textureBytes': len(out.getvalue()),
               'clip': anim.get('name'), 'clipSeconds': round(times[-1] - times[0], 4),
               'hipsScale': round(hips_scale[0], 4)},
    'positions': pack('f', positions),
    'uvs': pack('f', uvs),
    'indices': pack('H', indices),
    'joints': pack('B', joints),
    'weights': pack('B', weights_q),
    'bones': bones,
    'inverseBindMatrices': pack('f', inverse),
    # frames x bones x [qx, qy, qz, qw, px, py, pz], model-space world transforms.
    'clip': {'frames': FRAMES, 'transforms': pack('f', clip)},
    'texture': texture,
}
Path('src/rat-data.ts').write_text(
    '// Rat enemy: user-supplied Meshy GLB (rigged, walking clip), generated by\n'
    '// scripts/import-rat.py. Do not edit by hand.\n'
    'export const RAT_DATA = ' + json.dumps(data, separators=(',', ':')) + ';\n')
print(len(bones), 'bones', len(indices) // 3, 'triangles', len(positions) // 3, 'vertices',
      'texture', len(out.getvalue()), 'bytes', FRAMES, 'clip frames, hips scale', hips_scale[0])
