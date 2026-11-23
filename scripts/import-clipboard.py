"""Import the clipboard supplied by the project owner (Saint Pierre's counter).
Usage: python3 -I scripts/import-clipboard.py assets/originals/clipboard/Clipboard.glb

The source GLB (THREE.GLTFExporter, 104 triangles, three plain materials, no
texture) stays out of Git in assets/originals/ (ignored). This writes
src/clipboard-data.ts: positions and normals in metres, triangles grouped by
material colour.

Frame: Y up, the board lying flat, its bottom at y = 0 and centred in x and z;
the clip is at -Z (the top of the sheet, away from the reader). Scale: the board's
length becomes CLIPBOARD_LENGTH metres (a real letter clipboard).
"""
import hashlib
import json
import struct
import sys
from pathlib import Path

import numpy as np

SOURCE_SHA256 = '502a61ce32aa1bb1de2e1c82ab8b0eddc5d7165f24e6f48973579cffd37d234e'
CLIPBOARD_LENGTH = 0.32  # metres, clip included
OUT = Path(__file__).resolve().parent.parent / 'src' / 'clipboard-data.ts'


def accessor(gltf, binary, index):
    a = gltf['accessors'][index]
    view = gltf['bufferViews'][a['bufferView']]
    width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}[a['type']]
    dtype = {5126: np.float32, 5123: np.uint16, 5125: np.uint32}[a['componentType']]
    size = np.dtype(dtype).itemsize
    stride = view.get('byteStride') or width * size
    start = view['byteOffset'] + a.get('byteOffset', 0)
    rows = [
        np.frombuffer(binary, dtype=dtype, count=width, offset=start + i * stride)
        for i in range(a['count'])
    ]
    return np.array(rows)


def main():
    source = Path(sys.argv[1])
    raw = source.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    if sha != SOURCE_SHA256:
        raise SystemExit('unexpected source SHA-256: ' + sha)
    size = struct.unpack_from('<I', raw, 12)[0]
    gltf = json.loads(raw[20:20 + size])
    binary = raw[20 + size + 8:]
    nodes = gltf['nodes']
    # Scene chain: root (node 2, x0.01) > node 1 > the clipboard (node 0).
    world = np.array(nodes[2]['matrix']).reshape(4, 4).T @ np.array(nodes[0]['matrix']).reshape(4, 4).T
    linear = world[:3, :3]
    primitive = gltf['meshes'][0]['primitives'][0]
    positions = accessor(gltf, binary, primitive['attributes']['POSITION']).astype(float)
    normals = accessor(gltf, binary, primitive['attributes']['NORMAL']).astype(float)
    positions = positions @ linear.T + world[:3, 3]
    normals = normals @ np.linalg.inv(linear)
    normals /= np.linalg.norm(normals, axis=1, keepdims=True)
    # The board lies along x with its clip at -x: turn it so the clip is at -z.
    turn = np.array([[0, 0, 1], [0, 1, 0], [-1, 0, 0]], dtype=float)
    positions = positions @ turn.T
    normals = normals @ turn.T
    lo, hi = positions.min(0), positions.max(0)
    scale = CLIPBOARD_LENGTH / (hi[2] - lo[2])
    positions = (positions - [(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2]) * scale
    groups = {}
    for p in gltf['meshes'][0]['primitives']:
        material = gltf['materials'][p['material']]
        colour = material['pbrMetallicRoughness']['baseColorFactor'][:3]
        name = material['name']
        entry = groups.setdefault(name, {'name': name, 'color': [round(c, 4) for c in colour], 'indices': []})
        entry['indices'] += accessor(gltf, binary, p['indices']).ravel().astype(int).tolist()
    data = {
        'source': source.name,
        'sourceSha256': sha,
        'triangles': sum(len(g['indices']) for g in groups.values()) // 3,
        'size': [round(v, 4) for v in (positions.max(0) - positions.min(0)).tolist()],
        'positions': [round(v, 5) for v in positions.ravel().tolist()],
        'normals': [round(v, 4) for v in normals.ravel().tolist()],
        'groups': list(groups.values()),
    }
    OUT.write_text(
        '// Imported by scripts/import-clipboard.py from the owner-supplied clipboard;\n'
        '// metres, Y up, flat, clip toward -Z. Colours are the source materials (linear).\n'
        '// prettier-ignore\n'
        'export const CLIPBOARD_DATA = ' + json.dumps(data, separators=(',', ':')) + ' as const;\n'
    )
    print('clipboard:', data['triangles'], 'triangles, size', data['size'], 'm ->', OUT)


if __name__ == '__main__':
    main()
