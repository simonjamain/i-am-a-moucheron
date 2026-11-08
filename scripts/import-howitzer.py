"""Import the anti-materiel howitzer (issue #113) into a local JS module.
Usage: PYTHONPATH=scripts python3 scripts/import-howitzer.py path/to/field-howitzer.glb
User-supplied Meshy GLB (smart topology, one mesh), checked by SHA-256. The mesh
is made of disconnected shells; each shell is assigned whole to a moving part,
never cut: carriage (fixed), left/right wheel (spin on the axle), cradle
(elevation around the trunnion, with the shield) and tube (recoil inside the
cradle). Positions, normals and UVs are kept; the 2K PNG atlas becomes a 1K JPEG
(the original stays in assets/originals/howitzer/).
Model axes: barrel towards -X, axle along Z, Y up.
"""
import base64, io, json, struct, sys
from pathlib import Path
from PIL import Image
from meshy_provenance import verify_meshy_source

SOURCE_SHA256 = '5d30ba36257eba9893dabba6548cc8e86ee0db8a816c8b509b386408e46b3c5c'
source = Path(sys.argv[1])
verify_meshy_source(source, SOURCE_SHA256)
raw = source.read_bytes()
size = struct.unpack_from('<I', raw, 12)[0]
g = json.loads(raw[20:20 + size])
binary = raw[28 + size:]
FMT = {5126: 'f', 5123: 'H', 5125: 'I'}
WIDTH = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}

def read(index):
    a = g['accessors'][index]
    v = g['bufferViews'][a['bufferView']]
    n = a['count'] * WIDTH[a['type']]
    return list(struct.unpack_from('<' + FMT[a['componentType']] * n, binary, v.get('byteOffset', 0) + a.get('byteOffset', 0)))

def pack(fmt, values):
    return base64.b64encode(struct.pack('<' + fmt * len(values), *values)).decode()

assert len(g['nodes']) == 1 and set(g['nodes'][0]) <= {'mesh', 'name'}, 'expected one identity node'
prim = g['meshes'][0]['primitives'][0]
P = read(prim['attributes']['POSITION'])
N = read(prim['attributes']['NORMAL'])
UV = read(prim['attributes']['TEXCOORD_0'])
I = read(prim['indices'])
vertex = lambda i: P[3 * i:3 * i + 3]

# Shells: vertices welded by position (UV seams split them in the file).
weld = {}
canon = [weld.setdefault(tuple(round(c, 5) for c in vertex(i)), i) for i in range(len(P) // 3)]
parent = list(range(len(canon)))
def find(a):
    while parent[a] != a:
        parent[a] = parent[parent[a]]
        a = parent[a]
    return a
for t in range(0, len(I), 3):
    a, b, c = (find(canon[i]) for i in I[t:t + 3])
    parent[b] = a
    parent[find(c)] = a
shells = {}
for t in range(0, len(I), 3):
    shells.setdefault(find(canon[I[t]]), []).append(t)

WHEEL_CENTER = (0.0325, -0.066)  # axle centre seen from the side (X, Y)
def classify(tris):
    pts = [vertex(i) for t in tris for i in I[t:t + 3]]
    lo = [min(p[k] for p in pts) for k in range(3)]
    hi = [max(p[k] for p in pts) for k in range(3)]
    side = max(abs(lo[2]), abs(hi[2]))
    reach = max(((p[0] - WHEEL_CENTER[0]) ** 2 + (p[1] - WHEEL_CENTER[1]) ** 2) ** 0.5 for p in pts)
    if reach <= 0.088 and min(abs(lo[2]), abs(hi[2])) >= 0.075 and lo[2] * hi[2] > 0:
        return 'wheelLeft' if lo[2] > 0 else 'wheelRight'
    if hi[0] <= -0.03 and lo[1] >= 0:
        return 'tube'  # muzzle brake, tube and collar: recoil
    if lo[1] >= -0.036 and side <= 0.066 and lo[0] >= -0.06:
        return 'cradle'  # breech, recoil cylinders, sleeve
    if lo[0] >= -0.035 and hi[0] <= 0.165 and hi[1] >= 0.1 and side <= 0.1:
        return 'cradle'  # trunnion ring and shield ride with the barrel
    return 'carriage'

parts = {}
for tris in shells.values():
    parts.setdefault(classify(tris), []).extend(tris)
counts = {k: len(v) for k, v in parts.items()}
# Lock the reviewed segmentation (see docs/asset-pipeline.md).
assert counts == {'carriage': 1315, 'wheelLeft': 356, 'wheelRight': 372, 'tube': 321, 'cradle': 558}, counts

def bounds(tris):
    pts = [vertex(i) for t in tris for i in I[t:t + 3]]
    return [min(p[k] for p in pts) for k in range(3)], [max(p[k] for p in pts) for k in range(3)]

out_parts = {}
for name, tris in parts.items():
    remap, pos, nor, uv, idx = {}, [], [], [], []
    for t in sorted(tris):
        for i in I[t:t + 3]:
            if i not in remap:
                remap[i] = len(remap)
                pos += P[3 * i:3 * i + 3]
                nor += N[3 * i:3 * i + 3]
                uv += UV[2 * i:2 * i + 2]
            idx.append(remap[i])
    out_parts[name] = {'positions': pack('f', pos), 'normals': pack('f', nor), 'uvs': pack('f', uv),
                       'indices': pack('H', idx)}

lo, hi = bounds([t for v in parts.values() for t in v])
tube_lo, tube_hi = bounds(parts['tube'])
wheels = {}
for side in ('wheelLeft', 'wheelRight'):
    a, b = bounds(parts[side])
    wheels[side] = [round((a[k] + b[k]) / 2, 5) for k in range(3)]
wa, wb = bounds(parts['wheelLeft'])
pivots = {
    'ground': round(lo[1], 5),
    'axle': [round((wheels['wheelLeft'][0] + wheels['wheelRight'][0]) / 2, 5), round(wheels['wheelLeft'][1], 5), 0],
    'wheelLeft': wheels['wheelLeft'],
    'wheelRight': wheels['wheelRight'],
    'wheelRadius': round((wb[1] - wa[1]) / 2, 5),
    # Trunnion: the fixed U bracket holds the cradle ring here (axis along Z).
    'trunnion': [0.157, 0.045, 0],
    # Bore axis exit at the muzzle brake face.
    'muzzle': [round(tube_lo[0], 5), round((tube_lo[1] + tube_hi[1]) / 2, 5), 0],
    'tubeLength': round(tube_hi[0] - tube_lo[0], 5),
}

img = g['images'][0]
view = g['bufferViews'][img['bufferView']]
png = binary[view.get('byteOffset', 0):view.get('byteOffset', 0) + view['byteLength']]
image = Image.open(io.BytesIO(png)).convert('RGB').resize((1024, 1024), Image.LANCZOS)
out = io.BytesIO()
image.save(out, 'JPEG', quality=86, optimize=True)

data = {
    'source': {'sha256': SOURCE_SHA256, 'generator': g['asset'].get('generator'), 'triangles': len(I) // 3,
               'vertices': len(P) // 3, 'shells': len(shells), 'parts': counts, 'textureBytes': len(out.getvalue())},
    'pivots': pivots,
    'parts': out_parts,
    'texture': 'data:image/jpeg;base64,' + base64.b64encode(out.getvalue()).decode(),
}
Path('src/howitzer-data.js').write_text(
    '// Anti-materiel howitzer (issue #113): user-supplied Meshy GLB split into moving\n'
    '// parts by scripts/import-howitzer.py. Do not edit by hand.\n'
    'export const HOWITZER_DATA = ' + json.dumps(data, separators=(',', ':')) + ';\n')
print(len(shells), 'shells', counts, 'pivots', pivots, 'texture', len(out.getvalue()), 'bytes')
