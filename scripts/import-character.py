"""Import a playable character (issues #111 and player appearances) into a JS module.
Usage: PYTHONPATH=scripts python3 scripts/import-character.py <id> path/to/model.glb
Approved user-supplied Meshy + Mixamo GLB, checked by SHA-256. Output keeps the
skinned mesh, the Mixamo skeleton with its bind matrices, the idle/walk/run
clips (rotations quantized to Int16, root translation only, constant scale
tracks dropped) and a 1K JPEG copy of the base colour texture (the original
stays in assets/originals/character/). Ids and output files are listed in
CHARACTERS below and must match src/character-appearances.js.
"""
import base64, io, json, struct, sys
from pathlib import Path
from PIL import Image
from meshy_provenance import verify_meshy_source

# id: (original SHA-256, output module, {gait: clip name in the GLB}). The Meshy
# exports have no idle clip (their unnamed 3 s clip is a crouch-and-jump move,
# and RunFast is unused): character-model.js lowers the arms from the bind pose.
GAITS = {'walk': 'Walking', 'run': 'Running'}
CHARACTERS = {
    'cowboy': ('29cbb213d02d447ddd1624a4e2e4ffaf31c1c8d99715850f90c983b53b0eed0d',
               'src/character-data.js', None),
    'frontier': ('abc715dfbe7c31946911a081958d81468f078a8f74aebd9ee45d4458a8fdb27a',
                 'src/character-frontier-data.js', GAITS),
    'sky-pilot': ('740ecc0ad9ea87c08934f28429bb9d448e4ffe339c29761e640247133174ed8f',
                  'src/character-sky-pilot-data.js', GAITS),
    'toby': ('db97a0ab4d533900aa2704c2110b6c99dd074a732b61380237fba03d6ac82b1a',
             'src/character-toby-data.js', GAITS),
    'sunny': ('da6fd6ce732c40cb35d8efd9ec4983b1d2a463acc3e97f4725e4e4003ad68d49',
              'src/character-sunny-data.js', GAITS),
    'aviator': ('222ea403e1cacf45addd54a3079bbefc7837cc3b80c27b82bee11490d3bd5f5e',
                'src/character-aviator-data.js', GAITS),
    'operator': ('99385d02e3423bc8e63bfe8f764958f0221080d30ac2dd97262098f88a0b602b',
                 'src/character-operator-data.js', GAITS),
}
ident = sys.argv[1]
SOURCE_SHA256, OUTPUT, CLIPS = CHARACTERS[ident]
source = Path(sys.argv[2])
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
    return list(struct.unpack_from('<' + FMT[a['componentType']] * n, binary, v.get('byteOffset', 0) + a.get('byteOffset', 0)))

def pack(fmt, values):
    return base64.b64encode(struct.pack('<' + fmt * len(values), *values)).decode()

assert len(g['meshes']) == 1 and len(g['skins']) == 1
prim = g['meshes'][0]['primitives'][0]
positions = read(prim['attributes']['POSITION'])
uvs = read(prim['attributes']['TEXCOORD_0'])
joints = read(prim['attributes']['JOINTS_0'])
weights = read(prim['attributes']['WEIGHTS_0'])
indices = read(prim['indices'])
skin = g['skins'][0]
joint_nodes = skin['joints']
assert len(joint_nodes) < 256
node_to_joint = {n: i for i, n in enumerate(joint_nodes)}
parents = {}
for i, node in enumerate(g['nodes']):
    for c in node.get('children', []):
        parents[c] = i
bones = []
for n in joint_nodes:
    node = g['nodes'][n]
    bones.append({
        'name': node['name'],
        'parent': node_to_joint.get(parents.get(n), -1),
        't': [round(x, 6) for x in node.get('translation', [0, 0, 0])],
        'r': [round(x, 6) for x in node.get('rotation', [0, 0, 0, 1])],
    })
for n in joint_nodes:
    assert not g['nodes'][n].get('scale') or all(abs(s - 1) < 1e-3 for s in g['nodes'][n]['scale'])
ibm = read(skin['inverseBindMatrices'])
weights_q = [round(w * 255) for w in weights]
hips = node_to_joint[next(i for i, n in enumerate(g['nodes']) if n.get('name') == 'mixamorig:Hips')]
wanted = {name: gait for gait, name in CLIPS.items()} if CLIPS else None
clips = {}
for anim in g['animations']:
    if wanted is not None and anim['name'] not in wanted:
        continue
    tracks = []
    for ch in anim['channels']:
        node = ch['target']['node']
        path = ch['target']['path']
        if node not in node_to_joint or path == 'scale':
            continue
        joint = node_to_joint[node]
        if path == 'translation' and joint != hips:
            continue
        sampler = anim['samplers'][ch['sampler']]
        times = read(sampler['input'])
        values = read(sampler['output'])
        track = {'bone': joint, 'path': path, 'times': pack('f', times)}
        if path == 'rotation':
            track['values'] = pack('h', [max(-32767, min(32767, round(v * 32767))) for v in values])
        else:
            track['values'] = pack('f', values)
        tracks.append(track)
    name = wanted[anim['name']] if wanted else anim['name']
    clips[name] = {'duration': max(read(s['input'])[-1] for s in anim['samplers']), 'tracks': tracks}
assert wanted is None or set(clips) == set(CLIPS), clips.keys()

material = g['materials'][prim.get('material', 0)]
img = g['images'][g['textures'][material['pbrMetallicRoughness']['baseColorTexture']['index']]['source']]
view = g['bufferViews'][img['bufferView']]
encoded = binary[view.get('byteOffset', 0):view.get('byteOffset', 0) + view['byteLength']]
image = Image.open(io.BytesIO(encoded)).convert('RGB').resize((1024, 1024), Image.LANCZOS)
out = io.BytesIO()
image.save(out, 'JPEG', quality=86, optimize=True)
texture = 'data:image/jpeg;base64,' + base64.b64encode(out.getvalue()).decode()

data = {
    'source': {'sha256': SOURCE_SHA256, 'generator': g['asset'].get('generator'), 'triangles': len(indices) // 3,
               'vertices': len(positions) // 3, 'bones': len(bones), 'textureBytes': len(out.getvalue())},
    'positions': pack('f', positions),
    'uvs': pack('f', uvs),
    'indices': pack('H', indices),
    'joints': pack('B', joints),
    'weights': pack('B', weights_q),
    'bones': bones,
    'inverseBindMatrices': pack('f', ibm),
    'clips': clips,
    'texture': texture,
}
Path(OUTPUT).write_text(
    f'// Playable character "{ident}": user-approved Meshy + Mixamo GLB, generated by\n'
    '// scripts/import-character.py. Do not edit by hand.\n'
    'export const CHARACTER_DATA = ' + json.dumps(data, separators=(',', ':')) + ';\n')
print(ident, len(bones), 'bones', len(indices) // 3, 'triangles', {k: len(v['tracks']) for k, v in clips.items()},
      'texture', len(out.getvalue()), 'bytes')
