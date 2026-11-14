"""Import the three user-supplied Meshy DCA GLBs without decimating the articulated parts."""
import base64
import io
import json
import math
import struct
import sys
from pathlib import Path

from PIL import Image
from meshy_provenance import verify_meshy_source

# Coordinates after converting the barrel axis to -Z, with Y up.
MODELS = {
    'dca': dict(sha='04a00911c0f3a9a17b920d20bc9f19f19562fd5490f063974fe859be93b70946',
                side_axis=True, scale=4.7, base=-.073, pivot=(.055, .035), pitch=.35,
                muzzles=[(-.080, .223, -.472), (.074, .224, -.474)]),
    'dcaRapid': dict(sha='615b5377a05c2e54cae1e3869f6ab4fef9e041bdaabccc211459d2eb6e22cf62',
                     side_axis=False, scale=5, base=-.094, pivot=(.060, -.14), pitch=.455,
                     muzzles=[(-.079, .187, -.474), (.046, .258, -.388),
                              (.045, .187, -.478), (-.080, .259, -.388)]),
    'dcaHeavy': dict(sha='6ec4c317418ca636889fdb14bdad9b5456b3ea393d29afc1bb15e075fa9c1888',
                     side_axis=True, scale=6.7, base=-.14, pivot=(.027, .115), pitch=.37,
                     muzzles=[(-.002, .225, -.452)]),
}


def pack(code, values):
    return base64.b64encode(struct.pack('<' + code * len(values), *values)).decode()


def convert(kind, path):
    config = MODELS[kind]
    verify_meshy_source(path, config['sha'])
    raw = path.read_bytes()
    size = struct.unpack_from('<I', raw, 12)[0]
    gltf = json.loads(raw[20:20 + size])
    data = raw[28 + size:]

    def buffer(index):
        view = gltf['bufferViews'][index]
        start = view.get('byteOffset', 0)
        return data[start:start + view['byteLength']]

    def accessor(index):
        a = gltf['accessors'][index]
        code = {5126: 'f', 5123: 'H', 5125: 'I'}[a['componentType']]
        width = {'VEC2': 2, 'VEC3': 3, 'SCALAR': 1}[a['type']]
        return list(struct.iter_unpack('<' + code * width,
                                       buffer(a['bufferView'])[a.get('byteOffset', 0):][:a['count'] * width * struct.calcsize(code)]))

    prim = gltf['meshes'][0]['primitives'][0]
    attributes = prim['attributes']
    orient = (lambda x, y, z: (-z, y, x)) if config['side_axis'] else (lambda x, y, z: (x, y, z))
    positions = [orient(*p) for p in accessor(attributes['POSITION'])]
    normals = [orient(*n) for n in accessor(attributes['NORMAL'])]
    uvs = accessor(attributes['TEXCOORD_0'])
    flat_indices = [i for (i,) in accessor(prim['indices'])]
    triangles = list(zip(flat_indices[::3], flat_indices[1::3], flat_indices[2::3]))

    # Weld for connectivity only. The exported mesh keeps original UV seams.
    weld = {}
    canonical = [weld.setdefault(tuple(round(v, 5) for v in p), i) for i, p in enumerate(positions)]
    parent = list(range(len(positions)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for tri in triangles:
        a, b, c = [find(canonical[i]) for i in tri]
        parent[b] = parent[c] = a
    shells = {}
    for tri in triangles:
        shells.setdefault(find(canonical[tri[0]]), []).append(tri)

    ground = min(p[1] for p in positions)
    pivot_y, pivot_z = config['pivot']
    scale = config['scale']
    cos, sin = math.cos(config['pitch']), math.sin(config['pitch'])

    def unpitch(x, y, z):
        return (x, y * cos + z * sin, z * cos - y * sin)

    def barrel_point(p):
        x, y, z = p
        return tuple(round(v * scale, 6) for v in unpitch(x, y - pivot_y, z - pivot_z))

    parts = {'base': [], 'mount': [], 'barrels': []}
    for shell in shells.values():
        pts = [positions[i] for tri in shell for i in tri]
        low_y = min(p[1] for p in pts)
        high_y = max(p[1] for p in pts)
        front = min(p[2] for p in pts)
        # The barrels, muzzle brakes and exposed sleeves are separate shells.
        is_barrel = (
            front < -.42 if kind == 'dcaHeavy' else
            front < -.235 and low_y > .014 if kind == 'dcaRapid' else
            (front < -.37 or (-.17 < front < -.12 and low_y > .02 and high_y > .11))
        )
        is_base = high_y < config['base'] or (low_y < ground + .035 and high_y < -.05)
        parts['barrels' if is_barrel else 'base' if is_base else 'mount'].extend(shell)

    meshes = {}
    for name, faces in parts.items():
        remap, pos, nor, uv, idx = {}, [], [], [], []
        for face in faces:
            for i in face:
                if i not in remap:
                    remap[i] = len(remap)
                    x, y, z = positions[i]
                    pos.extend(barrel_point(positions[i]) if name == 'barrels' else
                               (x * scale, (y - ground) * scale, z * scale))
                    nor.extend(unpitch(*normals[i]) if name == 'barrels' else normals[i])
                    uv.extend(uvs[i])
                idx.append(remap[i])
        meshes[name] = dict(positions=pack('f', pos), normals=pack('f', nor),
                            uvs=pack('f', uv), indices=pack('H', idx))

    material = gltf['materials'][prim['material']]['pbrMetallicRoughness']
    texture = gltf['textures'][material['baseColorTexture']['index']]
    img = gltf['images'][texture['source']]
    image = Image.open(io.BytesIO(buffer(img['bufferView']))).convert('RGB')
    image.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
    jpeg = io.BytesIO()
    image.save(jpeg, format='JPEG', quality=88, optimize=True)
    geometry = dict(pivot=[0, round((pivot_y - ground) * scale, 6), round(pivot_z * scale, 6)],
                    muzzles=[barrel_point(p) for p in config['muzzles']])
    print(kind, {name: len(faces) for name, faces in parts.items()}, geometry)
    return dict(parts=meshes, **geometry,
                texture='data:image/jpeg;base64,' + base64.b64encode(jpeg.getvalue()).decode())


if __name__ == '__main__':
    kind, source = sys.argv[1:]
    result = convert(kind, Path(source))
    Path('src/fixed-dca-' + kind + '-data.js').write_text(
        '// Generated by scripts/import-fixed-dca.py.\nexport default ' + json.dumps(result) + ';\n')
