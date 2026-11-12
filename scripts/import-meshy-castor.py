"""Convert the user's remodelled G1 Castor GLB (one textured mesh, cleanly split
into separate islands) into the game's offline, indexed, UV-textured module.

Usage: python3 scripts/import-meshy-castor.py SOURCE.glb

The source is one Meshy mesh whose movable pieces are disconnected islands. They
are separated geometrically (welded connectivity, ignoring UV seams), never by
simplification: every source triangle and its original UV is kept. Fail closed
if the expected six wheels and turret pieces cannot be identified.
"""
import base64
import hashlib
import io
import json
from pathlib import Path
import sys

import numpy as np
import trimesh
from PIL import Image
from trimesh.graph import connected_components

SOURCE_NAME = 'Meshy_AI_Tactical_Rescue_Rover_1110083041_texture_1.glb'
OUTPUT = Path('src/meshy-castor-data.js')
# Calibrated game length (model units, multiplied by ACTOR_UNIT in game);
# matches the previous Castor's 6.08 length so gameplay sizes are unchanged.
GAME_LENGTH = 6.1
GEAR = 0.8  # model origin height above the wheels' contact plane


def load(path):
    scene = trimesh.load(path, force='scene')
    meshes = [scene.geometry[g].copy() for _, g in (scene.graph[n] for n in scene.graph.nodes_geometry)]
    if len(meshes) != 1:
        raise ValueError(f'expected one Meshy mesh, found {len(meshes)}')
    node = scene.graph.nodes_geometry[0]
    mesh = meshes[0]
    mesh.apply_transform(scene.graph[node][0])
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
    # Meshy vehicles face -X; the game drives toward -Z (proper rotation, no mirror).
    return np.column_stack((-p[:, 2], p[:, 1], p[:, 0]))


def classify(vertices, faces, comps):
    """Return face index arrays per articulated part (source -X forward frame)."""
    wheels, turret = [], []
    for c in comps:
        v = vertices[np.unique(faces[c])]
        lo, hi = v.min(0), v.max(0)
        size = hi - lo
        # Tyres: big low islands, one per side, each narrower than half the width.
        if hi[1] < -0.1 and len(c) > 60 and size[2] < 0.12 and size[0] > 0.15:
            wheels.append(c)
        # Roof turret: ring, head, hatch and barrel above the cab (front half).
        elif lo[1] >= 0.095 and hi[0] <= -0.13 and lo[0] >= -0.43 and np.abs(v[:, 2]).max() < 0.07:
            turret.append(c)
    if len(wheels) != 6 or len(turret) != 5:
        raise ValueError(f'unexpected articulation islands: {len(wheels)} wheels, {len(turret)} turret')
    return wheels, turret


def main():
    source = Path(sys.argv[1])
    sha = hashlib.sha256(source.read_bytes()).hexdigest()
    vertices, faces, uv, image = load(source)
    comps = islands(vertices, faces)
    wheels, turret = classify(vertices, faces, comps)
    lo, hi = vertices.min(0), vertices.max(0)
    scale = GAME_LENGTH / (hi[0] - lo[0])
    offset = (lo + hi) / 2
    offset[1] = lo[1] + GEAR / scale

    def game(points):
        return orient((points - offset) * scale)

    # Turret yaw pivot: centre of its lowest island (the ring). The whole head
    # including the barrel elevates around the head's centre, as before.
    ring = min(turret, key=lambda c: vertices[np.unique(faces[c])][:, 1].min())
    ring_v = game(vertices[np.unique(faces[ring])])
    head = [c for c in turret if c is not ring]
    head_v = game(vertices[np.unique(faces[np.concatenate(head)])])
    yaw_pivot = np.array([(ring_v[:, 0].min() + ring_v[:, 0].max()) / 2, ring_v[:, 1].min(),
                          (ring_v[:, 2].min() + ring_v[:, 2].max()) / 2])
    pitch_y = (head_v[:, 1].min() + head_v[:, 1].max()) / 2
    pitch_pivot = np.array([yaw_pivot[0], pitch_y, yaw_pivot[2]])
    barrel = min(head, key=lambda c: game(vertices[np.unique(faces[c])])[:, 2].min())
    barrel_v = game(vertices[np.unique(faces[barrel])])
    tip = barrel_v[np.argmin(barrel_v[:, 2])]
    muzzle = np.array([pitch_pivot[0], tip[1], barrel_v[:, 2].min()])

    pieces = []
    for i, c in enumerate(sorted(wheels, key=lambda c: tuple(np.round(game(vertices[np.unique(faces[c])]).mean(0)[[2, 0]], 3)))):
        v = game(vertices[np.unique(faces[c])])
        center = (v.min(0) + v.max(0)) / 2
        pieces.append((f'wheel{i}', c, center))
    pieces.append(('turret', ring, yaw_pivot))
    pieces.append(('gun', np.concatenate(head), pitch_pivot))
    # Outer axle endcaps are the rims, authored as part of the fixed axle
    # islands. Move those triangles with each tyre, retaining their UVs.
    all_game = game(vertices)
    tri = all_game[faces]
    for i, (name, selection, pivot) in enumerate(pieces[:6]):
        rims = np.flatnonzero(np.all(tri[:, :, 0] * np.sign(pivot[0]) > 1.4, axis=1)
            & np.all(np.abs(tri[:, :, 2] - pivot[2]) < .4, axis=1)
            & np.all(tri[:, :, 1] < .1, axis=1))
        pieces[i] = (name, np.union1d(selection, rims), pivot)
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
    wheel_radius = float(np.mean([(np.ptp(game(vertices[np.unique(faces[c])])[:, 1])) / 2 for c in wheels]))
    allv = game(vertices)
    model = {
        'source': SOURCE_NAME,
        'sourceSha256': sha,
        'triangles': triangles,
        'scale': round(float(scale), 5),
        'bounds': np.round([allv.min(0), allv.max(0)], 4).tolist(),
        'wheelRadius': round(wheel_radius, 4),
        'muzzle': np.round(muzzle - pitch_pivot, 4).tolist(),
        'parts': parts,
        'texture': 'data:image/jpeg;base64,' + base64.b64encode(jpeg).decode('ascii'),
    }
    OUTPUT.write_text(
        '// Imported by scripts/import-meshy-castor.py from ' + SOURCE_NAME + ', SHA256 ' + sha + '.\n'
        + '// prettier-ignore\n'
        + 'export const MODEL_DATA = ' + json.dumps(model, separators=(',', ':')) + ';\n',
        encoding='utf-8',
    )
    print(json.dumps({
        'sourceSha256': sha,
        'triangles': triangles,
        'islands': len(comps),
        'scale': model['scale'],
        'bounds': model['bounds'],
        'wheelRadius': model['wheelRadius'],
        'pivots': {p['part']: p['pivot'] for p in parts},
        'muzzle': model['muzzle'],
        'atlasBytes': len(jpeg),
        'jsBytes': OUTPUT.stat().st_size,
    }, indent=1))


if __name__ == '__main__':
    main()
