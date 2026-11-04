"""Extract the static Meshy GLB POSITION/index buffers, without runtime loaders.
Usage: python scripts/import-meshy-brick.py path/to/model.glb
The model uses one identity node; reject other layouts rather than misplacing it.
"""
import sys, json, struct
from pathlib import Path
raw = Path(sys.argv[1]).read_bytes()
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
Path('src/meshy-brick-data.js').write_text('// Meshy task 01a1a7e1-7451-73ec-b5ba-7c98568b5b9a; generated static geometry.\nexport const BRICK_POSITIONS='+json.dumps([round(x,5) for x in positions],separators=(',',':'))+';\nexport const BRICK_INDICES='+json.dumps(indices,separators=(',',':'))+';\n')
print(len(positions)//3,'vertices',len(indices)//3,'triangles')
