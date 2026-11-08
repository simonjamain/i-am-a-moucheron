"""Extract the static Meshy GLB POSITION/index buffers, without runtime loaders.
Usage: python scripts/import-meshy-brick.py path/to/brick-2x4.glb
The approved original is checked by SHA-256 (issue #99, reference image approved
by the user). One identity node; other layouts are rejected rather than misplaced.
The brick is untextured on purpose: the game colours each instance.
"""
import sys, json, struct
from pathlib import Path
from meshy_provenance import verify_meshy_source

TASK = '01a1ba16-7dde-758d-82fb-74eb5b54fa80'
SOURCE_SHA256 = '42c02791c2aa331545745e95e62b8b726d078b9371a7b0e7ee3c90539c1365c7'
REFERENCE_SHA256 = '67e97d4add03ba2778612cfb179b30403431061c1a1101b19c48ae5e4861c425'

source = Path(sys.argv[1])
verify_meshy_source(source, SOURCE_SHA256)
raw = source.read_bytes()
size = struct.unpack_from('<I', raw, 12)[0]
gltf = json.loads(raw[20:20+size])
assert len(gltf['nodes']) == 1 and set(gltf['nodes'][0]) <= {'mesh','name'}
binary = raw[28+size:]
def read(index):
    a = gltf['accessors'][index]
    v = gltf['bufferViews'][a['bufferView']]
    fmt = {5126:'f',5123:'H',5125:'I'}[a['componentType']]
    width = {'VEC3':3,'SCALAR':1}[a['type']]
    return list(struct.unpack_from('<'+fmt*(a['count']*width),binary,v.get('byteOffset',0)+a.get('byteOffset',0)))
p = gltf['meshes'][0]['primitives'][0]
positions = read(p['attributes']['POSITION'])
indices = read(p['indices'])
meta = {'sourceTask': TASK, 'sourceSha256': SOURCE_SHA256, 'referenceSha256': REFERENCE_SHA256,
        'up': 'y', 'triangles': len(indices)//3, 'vertices': len(positions)//3}
Path('src/meshy-brick-data.js').write_text(
    '// Meshy image-to-3D task ' + TASK + ' (untextured 2x4 brick, studs along +Y); generated static geometry.\n'
    'export const BRICK_SOURCE=' + json.dumps(meta, separators=(',',':')) + ';\n'
    'export const BRICK_POSITIONS=' + json.dumps([round(x,5) for x in positions], separators=(',',':')) + ';\n'
    'export const BRICK_INDICES=' + json.dumps(indices, separators=(',',':')) + ';\n')
print(meta['vertices'],'vertices',meta['triangles'],'triangles')
