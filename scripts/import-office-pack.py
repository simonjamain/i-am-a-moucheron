"""Import the purchased "Cartoon Office Pack" (BloxBits, Extra edition) into the game.
Usage: python3 scripts/import-office-pack.py PATH/Cartoon_Office_Pack_Extra_All.glb

The source GLB (converted from the pack's FBX, one shared 1024 px atlas, 179
objects) is licensed to the project owner and is NEVER committed: keep it in
assets/originals/office-pack/ (ignored by Git). See src/office-pack-LICENSE.md.

Only the objects of MODELS are exported (those the layouts place; add a name here
and re-run to use another one of the pack's 179 objects):
- src/office-pack-data.ts: geometry (int16 positions at 0.5 mm, uint16 UVs and
  indices) and the original PNG atlas, for the client renderer;
- src/office-pack-catalog.ts: bounds and triangle count of each model, pure data
  shared by the server, the workers and the layouts (hitboxes).

Frame: Y up, metres, origin of each object kept where the pack's author put it
(floor centre for furniture, back face for wall-mounted items, which face +X).
Scale: one wall module (5.4 pack units) is exactly 1.2 m, so the 8.4 x 7.2 m room
is 7 x 6 modules; every object keeps its proportions (uniform scale only).
"""
import base64
import hashlib
import json
import struct
import sys
from pathlib import Path

import numpy as np

SOURCE_SHA256 = '5de660c51c77718f3a3545acb07bed1d70d251998cd268b9a5c9624302363aab'
WALL_MODULE = 1.2  # metres per wall module
MODELS = [
    # Room shell
    'Wall', 'Wall_Half', 'Wall_Corner', 'Wall_Window', 'Wall_Door', 'Office_Door', 'Wall_Vent',
    # Furniture
    'Desk', 'Office_Chair_Blue', 'Office_Chair_Grey', 'Executive_Chair_Black', 'Visitor_Chair_Grey',
    'Filing_Cabinet', 'Bookshelf', 'Photocopier', 'Water_Cooler', 'Plant_Tall', 'Plant_Snake_Large',
    'File_Box', 'File_Box_Empty', 'Cubicle_Panel', 'Cubicle_Panel_Half', 'Whiteboard', 'Trash_Bin',
    'Coat_Rack', 'Kitchen_Counter', 'Coffee_Maker', 'Microwave', 'Vending_Machine', 'Sofa_Grey',
    'Coffee_Table',
    # On desks
    'CRT_Monitor', 'CRT_Monitor_Off', 'CRT_Monitor_BSOD', 'Computer_Tower', 'Keyboard', 'Mouse',
    'Desk_Phone', 'Desk_Lamp', 'Desk_Lamp_Red', 'Banker_Lamp', 'Mug', 'Mug_Red', 'Mug_Yellow',
    'Mug_Dark', 'Paper_Stack', 'Paper_Stack_Tall', 'Paper_Stack_Small',
    'Folder_Stack', 'Pen_Cup', 'Stapler', 'Pencil', 'Paper_Tray', 'Desk_Calendar', 'Desk_Fan',
    'Water_Bottle', 'Plant_Cactus',
    # On the floor
    'Paper_Crumpled', 'Paper_Crumpled_Pile', 'Paper_Crumpled_Yellow', 'Paper_Crumpled_Sheet',
    # On the walls
    'Wall_Clock', 'Wall_Calendar', 'Corkboard', 'Fire_Extinguisher', 'Wall_Outlet', 'Light_Switch',
    # Hanging from the ceiling
    'Ceiling_Fan',
]
COMPONENTS = {5126: ('f', 4), 5125: ('I', 4), 5123: ('H', 2), 5121: ('B', 1)}
WIDTH = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


def load(path):
    raw = path.read_bytes()
    size = struct.unpack_from('<I', raw, 12)[0]
    gltf = json.loads(raw[20:20 + size])
    binary = raw[28 + size:]

    def read(index):
        acc = gltf['accessors'][index]
        view = gltf['bufferViews'][acc['bufferView']]
        fmt, step = COMPONENTS[acc['componentType']]
        width = WIDTH[acc['type']]
        start = view.get('byteOffset', 0) + acc.get('byteOffset', 0)
        stride = view.get('byteStride', step * width)
        out = np.empty((acc['count'], width), dtype=np.float64)
        for i in range(acc['count']):
            out[i] = struct.unpack_from('<' + fmt * width, binary, start + i * stride)
        return out

    image = gltf['images'][0]
    view = gltf['bufferViews'][image['bufferView']]
    png = binary[view.get('byteOffset', 0):view.get('byteOffset', 0) + view['byteLength']]
    return gltf, read, png


def main():
    source = Path(sys.argv[1])
    sha = hashlib.sha256(source.read_bytes()).hexdigest()
    if sha != SOURCE_SHA256:
        raise SystemExit('unexpected source SHA-256 ' + sha)
    gltf, read, png = load(source)
    nodes = {n['name']: n for n in gltf['nodes'] if 'mesh' in n}
    wall = gltf['accessors'][gltf['meshes'][nodes['Wall']['mesh']]['primitives'][0]['attributes']['POSITION']]
    unit = WALL_MODULE / (wall['max'][1] - wall['min'][1])
    parts, catalog = [], {}
    for name in MODELS:
        node = nodes[name]
        rotation = np.array(node['matrix']).reshape(4, 4).T[:3, :3]
        assert np.allclose(rotation, [[1, 0, 0], [0, 0, 1], [0, -1, 0]], atol=1e-5), name
        prims = gltf['meshes'][node['mesh']]['primitives']
        assert len(prims) == 1 and prims[0].get('material', 0) == 0, name
        attrs = prims[0]['attributes']
        points = read(attrs['POSITION']) @ rotation.T * unit
        uv = read(attrs['TEXCOORD_0'])
        faces = (read(prims[0]['indices'])[:, 0].astype(int) if 'indices' in prims[0]
                 else np.arange(len(points))).reshape(-1, 3)
        q = np.rint(points / 0.0005).astype('<i2')
        t = np.rint(np.clip(uv, 0, 1) * 65535).astype('<u2')
        # The pack ships triangle soups: weld identical (position, UV) corners.
        keys = np.concatenate([q.astype(np.int64), t.astype(np.int64)], axis=1)
        unique, inverse = np.unique(keys, axis=0, return_inverse=True)
        inverse = inverse.reshape(-1)
        faces = inverse[faces]
        faces = faces[(faces[:, 0] != faces[:, 1]) & (faces[:, 1] != faces[:, 2]) & (faces[:, 0] != faces[:, 2])]
        assert len(unique) < 65536, name
        parts.append({
            'part': name,
            'positions': base64.b64encode(unique[:, :3].astype('<i2').tobytes()).decode(),
            'uv': base64.b64encode(unique[:, 3:].astype('<u2').tobytes()).decode(),
            'indices': base64.b64encode(faces.astype('<u2').tobytes()).decode(),
        })
        lo = unique[:, :3].min(0) * 0.0005
        hi = unique[:, :3].max(0) * 0.0005
        catalog[name] = {'min': np.round(lo, 4).tolist(), 'max': np.round(hi, 4).tolist(), 'triangles': len(faces)}
    data = {
        'source': source.name, 'sourceSha256': sha, 'unit': round(unit, 6),
        'triangles': sum(c['triangles'] for c in catalog.values()), 'doubleSided': False,
        'parts': parts, 'texture': 'data:image/png;base64,' + base64.b64encode(png).decode(),
    }
    header = ('// Generated by scripts/import-office-pack.py from the purchased "Cartoon Office Pack"\n'
              '// (BloxBits). Licensed for this game only: see src/office-pack-LICENSE.md. Do not\n'
              '// extract, reuse or redistribute. Do not edit by hand.\n')
    Path('src/office-pack-data.ts').write_text(
        header + '// prettier-ignore\nexport const MODEL_DATA = ' + json.dumps(data, separators=(',', ':')) + ';\n')
    rows = ',\n'.join(f'  {name}: {json.dumps(c, separators=(", ", ": "))}' for name, c in catalog.items())
    Path('src/office-pack-catalog.ts').write_text(
        header
        + '// Bounds (metres, Y up, model origin) and triangle count of each imported model.\n'
        + 'export interface OfficeModelBounds {\n  min: readonly [number, number, number];\n'
        + '  max: readonly [number, number, number];\n  triangles: number;\n}\n'
        + '// prettier-ignore\nconst TABLE = {\n' + rows + ',\n} as const;\n'
        + 'export type OfficeModel = keyof typeof TABLE;\n'
        + 'export const OFFICE_MODELS: Readonly<Record<OfficeModel, OfficeModelBounds>> = TABLE;\n'
        + f'export const OFFICE_PACK_UNIT = {round(unit, 6)};\n')
    print(json.dumps({'models': len(MODELS), 'triangles': data['triangles'], 'unit': unit,
                      'dataBytes': Path('src/office-pack-data.ts').stat().st_size}))


if __name__ == '__main__':
    main()
