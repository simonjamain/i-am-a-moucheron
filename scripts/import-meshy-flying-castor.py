"""Convert the user-approved Castor volant GLB (Meshy "Rescue Rotorcraft", one
textured mesh) into the game's offline, indexed, UV-textured module.

Usage: python3 scripts/import-meshy-flying-castor.py SOURCE.glb

The tandem rotors are disconnected islands above the fuselage: they are split
geometrically (welded connectivity, ignoring UV seams), never by simplification:
every source triangle and its original UV is kept. Each rotor (hub cap and three
blades) is stored around its own vertical axis; the pylons stay on the body.
Fail closed if the expected rotor islands cannot be identified.
"""
import base64
import io
import json
from pathlib import Path
import sys

import numpy as np
import trimesh
from PIL import Image
from trimesh.graph import connected_components

from meshy_provenance import verify_meshy_source

SOURCE_NAME = 'Meshy_AI_Rescue_Rotorcraft_1113100652_texture.glb'
SOURCE_SHA256 = 'dfcd21c08858057e13e78849a4156dd2f68c645edcd203f33acb7138806de691'
OUTPUT = Path('src/meshy-flying-castor-data.js')
GAME_LENGTH = 9.0  # model units (x ACTOR_UNIT in game), nose to tail
GEAR = 1.0  # model origin height above the skids' contact plane
ROTOR_FLOOR = 0.165  # source units: rotor islands start above the pylon tops
# Source -X forward: front rotor near x = -0.25, rear rotor near x = +0.28.
HUBS = {'rotorFront': -0.25, 'rotorRear': 0.28}


def load(path):
    scene = trimesh.load(path, force='scene')
    nodes = scene.graph.nodes_geometry
    if len(nodes) != 1:
        raise ValueError(f'expected one Meshy mesh, found {len(nodes)}')
    transform, name = scene.graph[nodes[0]]
    mesh = scene.geometry[name].copy()
    mesh.apply_transform(transform)
    uv = getattr(mesh.visual, 'uv', None)
    image = getattr(mesh.visual.material, 'baseColorTexture', None)
    if uv is None or image is None:
        raise ValueError('missing original Meshy UV or baseColorTexture')
    uv = np.asarray(uv, dtype=float)
    if uv.shape != (len(mesh.vertices), 2) or not np.isfinite(uv).all():
        raise ValueError('invalid UVs')
    return np.asarray(mesh.vertices, dtype=float), np.asarray(mesh.faces), uv, image.convert('RGB')


def islands(vertices, faces):
    welded = trimesh.Trimesh(vertices.copy(), faces.copy(), process=False)
    welded.merge_vertices(merge_tex=True, merge_norm=True)
    return connected_components(welded.face_adjacency, nodes=np.arange(len(faces)), min_len=1)


def orient(p):
    # Meshy vehicles face -X; the game flies toward -Z (proper rotation, no mirror).
    return np.column_stack((-p[:, 2], p[:, 1], p[:, 0]))


def main():
    source = Path(sys.argv[1])
    sha = verify_meshy_source(source, SOURCE_SHA256)
    vertices, faces, uv, image = load(source)
    comps = islands(vertices, faces)
    rotors = {name: [] for name in HUBS}
    for c in comps:
        v = vertices[np.unique(faces[c])]
        lo, hi = v.min(0), v.max(0)
        centre = (lo + hi) / 2
        if lo[1] < ROTOR_FLOOR or abs(centre[2]) > 0.2:
            continue
        name = min(HUBS, key=lambda n: abs(centre[0] - HUBS[n]))
        if abs(centre[0] - HUBS[name]) < 0.2:
            rotors[name].append(c)
    counts = {n: len(c) for n, c in rotors.items()}
    if counts != {'rotorFront': 5, 'rotorRear': 8}:
        raise ValueError(f'unexpected rotor islands: {counts}')

    lo, hi = vertices.min(0), vertices.max(0)
    scale = GAME_LENGTH / (hi[0] - lo[0])
    offset = (lo + hi) / 2
    offset[1] = lo[1] + GEAR / scale

    def game(points):
        return orient((points - offset) * scale)

    pieces = []
    for name, comp in rotors.items():
        selection = np.concatenate(comp)
        # Spin axis: centre of the topmost island (the hub cap), at the rotor's base.
        cap = max(comp, key=lambda c: vertices[np.unique(faces[c])][:, 1].max())
        cap_v = game(vertices[np.unique(faces[cap])])
        all_v = game(vertices[np.unique(faces[selection])])
        pivot = np.array([(cap_v[:, 0].min() + cap_v[:, 0].max()) / 2, all_v[:, 1].min(),
                          (cap_v[:, 2].min() + cap_v[:, 2].max()) / 2])
        pieces.append((name, selection, pivot))
    moving = np.concatenate([p[1] for p in pieces])
    body = np.setdiff1d(np.arange(len(faces)), moving)
    pieces.insert(0, ('body', body, np.zeros(3)))

    out = io.BytesIO()
    image.resize((1024, 1024), Image.Resampling.LANCZOS).save(out, format='JPEG', quality=88, optimize=True)
    jpeg = out.getvalue()

    parts, triangles = [], 0
    for name, selection, pivot in pieces:
        used, local = np.unique(faces[selection], return_inverse=True)
        pts = game(vertices[used]) - pivot
        if len(used) > 65535 or np.max(np.abs(pts)) >= 16:
            raise ValueError(f'{name}: 16-bit budget exceeded')
        tex = uv[used].copy()
        tex[:, 1] = 1 - tex[:, 1]  # trimesh exposes bottom-up UVs; the game texture has flipY=false
        tex = np.clip(tex, 0, 1)
        indices = local.reshape(-1, 3).flatten().astype('<u2')
        triangles += len(indices) // 3
        parts.append({
            'part': name,
            'pivot': np.round(pivot, 4).tolist(),
            'positions': base64.b64encode(np.rint(pts / 0.0005).astype('<i2').tobytes()).decode('ascii'),
            'uv': base64.b64encode(np.rint(tex * 65535).astype('<u2').tobytes()).decode('ascii'),
            'indices': base64.b64encode(indices.tobytes()).decode('ascii'),
        })
    if triangles != len(faces):
        raise ValueError('source triangles lost')
    allv = game(vertices)
    model = {
        'source': SOURCE_NAME,
        'sourceSha256': sha,
        'triangles': triangles,
        'scale': round(float(scale), 5),
        'bounds': np.round([allv.min(0), allv.max(0)], 4).tolist(),
        'parts': parts,
        'texture': 'data:image/jpeg;base64,' + base64.b64encode(jpeg).decode('ascii'),
    }
    OUTPUT.write_text(
        '// Imported by scripts/import-meshy-flying-castor.py from ' + SOURCE_NAME + ', SHA256 ' + sha + '.\n'
        + '// prettier-ignore\n'
        + 'export const MODEL_DATA = ' + json.dumps(model, separators=(',', ':')) + ';\n',
        encoding='utf-8',
    )
    print(json.dumps({
        'sourceSha256': sha,
        'triangles': triangles,
        'islands': len(comps),
        'rotorIslands': counts,
        'scale': model['scale'],
        'bounds': model['bounds'],
        'pivots': {p['part']: p['pivot'] for p in parts},
        'atlasBytes': len(jpeg),
        'jsBytes': OUTPUT.stat().st_size,
    }, indent=1))


if __name__ == '__main__':
    main()
