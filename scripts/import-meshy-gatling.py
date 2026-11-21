"""Import the Meshy "Sentinel Sentry" GLB as the articulated Gatling turret.

Usage:
  python3 scripts/import-meshy-gatling.py --source gatling.glb --output src [--texture-size 1024]

The approved original is one monobloc mesh (one UV atlas). It is split, by
connected component and without touching any UV, into three rigid pieces that
share the single atlas:
  socle  fixed tripod and turntable (maxY < -0.15)
  tete   yaw head: housing, radar, ammo box and belt
  rotor  the six barrels and their two collars (every component reaching x < -0.3)
  anneau the circular base of the bundle (rear plate and front rim of the housing
         opening): it does not spin
The whole upper unit (head, ring, bundle) tilts about a horizontal axis at the top of
the turntable (`elevation`); only the rotor spins, around the axis of the bundle. The bundle axis is fitted
on the six barrels and the rotor is straightened onto it (about 2 degrees), so
the rotation is exact. Output frame: game axes (-Z forward), origin on the
ground under the yaw axis; rotor vertices are relative to its pivot (the centre
of the housing opening, on the axis). The original GLB is never modified; its
SHA-256 is pinned below.
"""
import argparse
import base64
import hashlib
import io
import json
from collections import defaultdict
from pathlib import Path

import numpy as np
import trimesh
from PIL import Image

SOURCE_SHA256 = 'a2a4e7eb9b42aed070b12c1a004ef4b998275b205c033f451f8dda9b39c07920'
SOURCE_NAME = 'Meshy_AI_Sentinel_Sentry_1121103608_texture.glb'
YAW_X, YAW_Z = 0.128, 0.0  # vertical yaw axis, from the tripod and turntable
PIVOT_X = -0.095  # plane of the housing opening, in source X (barrels point to -X)


def components(mesh):
    keyed = np.round(mesh.vertices, 5)
    _, inv = np.unique(keyed, axis=0, return_inverse=True)
    inv = inv.ravel()
    parent = list(range(inv.max() + 1))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for tri in mesh.faces:
        a, b, c = inv[tri]
        parent[find(b)] = find(a)
        parent[find(c)] = find(a)
    groups = defaultdict(list)
    for index, tri in enumerate(mesh.faces):
        groups[find(inv[tri[0]])].append(index)
    return [np.array(f) for f in groups.values()]


def rotation_between(a, b):
    a = a / np.linalg.norm(a)
    b = b / np.linalg.norm(b)
    v = np.cross(a, b)
    c = float(np.dot(a, b))
    if np.linalg.norm(v) < 1e-12:
        return np.eye(3)
    k = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + k + k @ k / (1 + c)


def encode_part(name, vertices, uv, faces, pivot):
    # Re-index only the vertices this piece uses.
    used = np.unique(faces)
    remap = np.full(len(vertices), -1, dtype=np.int64)
    remap[used] = np.arange(len(used))
    pos = vertices[used]
    if np.max(np.abs(pos)) > 16 or len(used) > 65535:
        raise ValueError(f'{name}: unsupported 16-bit vertex positions')
    enc = lambda raw: base64.b64encode(raw).decode('ascii')
    return {
        'part': name,
        'pivot': [round(float(v), 5) for v in pivot],
        'positions': enc(np.rint(pos / 0.0005).astype('<i2').tobytes()),
        'uv': enc(np.rint(np.clip(uv[used], 0, 1) * 65535).astype('<u2').tobytes()),
        'indices': enc(remap[faces].astype('<u2').ravel().tobytes()),
        'triangles': int(len(faces)),
        'vertices': int(len(used)),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--texture-size', type=int, default=1024)
    args = parser.parse_args()
    digest = hashlib.sha256(args.source.read_bytes()).hexdigest()
    if digest != SOURCE_SHA256:
        raise ValueError(f'rejected original GLB sha256 {digest} != approved {SOURCE_SHA256}')
    scene = trimesh.load(args.source, force='scene', process=False)
    if len(scene.geometry) != 1:
        raise ValueError('expected one monobloc mesh')
    mesh = next(iter(scene.geometry.values()))
    vertices = np.asarray(mesh.vertices, dtype=np.float64)
    faces = np.asarray(mesh.faces, dtype=np.int64)
    uv = np.asarray(mesh.visual.uv, dtype=np.float64).copy()
    uv[:, 1] = 1 - uv[:, 1]  # same convention as the other Meshy importers
    tex = mesh.visual.material.baseColorTexture
    if not isinstance(tex, Image.Image):
        raise ValueError('missing embedded base color texture')

    rotor, base, head = [], [], []
    tubes = []
    for comp in components(mesh):
        pts = vertices[np.unique(faces[comp])]
        if pts[:, 0].min() < -0.3:
            rotor.append(comp)
            # A barrel is a long component; the collars are short in X.
            if pts[:, 0].max() - pts[:, 0].min() > 0.2:
                tubes.append(pts)
        elif pts[:, 1].max() < -0.15:
            base.append(comp)
        else:
            head.append(comp)
    if len(rotor) != 8 or len(tubes) != 6:
        raise ValueError(f'expected 6 barrels + 2 collars, got {len(tubes)} + {len(rotor) - len(tubes)}')

    # Fit the bundle axis: centroid of all rotor vertices, direction from the
    # centres of the front and rear halves of each barrel.
    rotor_pts = vertices[np.unique(faces[np.concatenate(rotor)])]
    centroid = rotor_pts.mean(axis=0)
    directions = []
    for pts in tubes:
        front = pts[pts[:, 0] < pts[:, 0].min() + 0.08].mean(axis=0)
        rear = pts[pts[:, 0] > pts[:, 0].max() - 0.08].mean(axis=0)
        directions.append((front - rear) / np.linalg.norm(front - rear))
    axis = np.mean(directions, axis=0)
    axis /= np.linalg.norm(axis)
    # Point of the axis in the opening plane.
    pivot_src = centroid + axis * ((PIVOT_X - centroid[0]) / axis[0])
    straighten = rotation_between(axis, np.array([-1.0, 0.0, 0.0]))
    tilt = float(np.degrees(np.arccos(np.clip(np.dot(axis, [-1, 0, 0]), -1, 1))))

    # The base ring: remaining components centred on the bundle axis around the
    # opening plane (the rear plate and the front rim of the housing).
    ring = []
    for comp in list(head):
        pts = vertices[np.unique(faces[comp])]
        centre = (pts.min(axis=0) + pts.max(axis=0)) / 2
        radius = np.hypot(pts[:, 1] - pivot_src[1], pts[:, 2] - pivot_src[2]).max()
        if (
            -0.16 < pts[:, 0].min() and pts[:, 0].max() < -0.03
            and abs(centre[1] - pivot_src[1]) < 0.02 and abs(centre[2] - pivot_src[2]) < 0.02
            and radius < 0.13
        ):
            ring.append(comp)
            head = [c for c in head if c is not comp]
    if len(ring) != 2:
        raise ValueError(f'expected 2 ring components (plate + rim), got {len(ring)}')

    ground = vertices[:, 1].min()
    # Source (x, y, z) -> game: x' = -(z - zc), y' = y - ground, z' = x - xc.
    def to_game(p):
        p = np.atleast_2d(p)
        return np.stack([-(p[:, 2] - YAW_Z), p[:, 1] - ground, p[:, 0] - YAW_X], axis=1)

    game = to_game(vertices)
    rotor_ids = np.unique(faces[np.concatenate(rotor)])
    ring_ids = np.unique(faces[np.concatenate(ring)])
    pivot_game = to_game(pivot_src)[0]
    mask = np.zeros(len(vertices), dtype=bool)
    mask[rotor_ids] = True
    mask[ring_ids] = True
    # Straighten the rotor about the pivot (in game axes: the source rotation
    # expressed through the same axis permutation).
    perm = np.array([[0, 0, -1], [0, 1, 0], [1, 0, 0]], dtype=np.float64)  # source -> game
    r_game = perm @ straighten @ perm.T
    game[mask] = (game[mask] - pivot_game) @ r_game.T + pivot_game

    parts = []
    parts.append(encode_part('socle', game, uv, faces[np.concatenate(base)], [0, 0, 0]))
    parts.append(encode_part('tete', game, uv, faces[np.concatenate(head)], [0, 0, 0]))
    rotor_local = game - pivot_game
    parts.append(encode_part('rotor', rotor_local, uv, faces[np.concatenate(rotor)], pivot_game))
    parts.append(encode_part('anneau', rotor_local, uv, faces[np.concatenate(ring)], pivot_game))

    # Barrel centres at the muzzle, relative to the (now straight) axis.
    tip_z = float(rotor_local[rotor_ids][:, 2].min())
    tips = []
    for pts in tubes:
        g = ((to_game(pts) - pivot_game) @ r_game.T)
        front = g[g[:, 2] < g[:, 2].min() + 0.04].mean(axis=0)
        tips.append([round(float(front[0]), 4), round(float(front[1]), 4)])
    radius = float(np.mean([np.hypot(*t) for t in tips]))
    bounds = [np.round(game.min(axis=0), 4).tolist(), np.round(game.max(axis=0), 4).tolist()]

    size = args.texture_size
    resized = tex.convert('RGB').resize((size, size), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    resized.save(buf, format='WEBP', quality=86, method=6)
    result = {
        'sourceName': SOURCE_NAME,
        'sourceSha256': digest,
        'sourceTextureResolution': list(tex.size),
        'atlasResolution': [size, size],
        'triangles': int(len(faces)),
        'vertices': int(len(vertices)),
        'bounds': bounds,
        # Elevation pivot of the whole upper unit: top of the turntable, on the yaw axis.
        'elevation': [0, round(float(vertices[np.unique(faces[np.concatenate(base)])][:, 1].max() - ground), 4), 0],
        'rotor': {
            'barrels': 6,
            'tips': tips,
            'barrelRadius': round(radius, 4),
            'tipZ': round(tip_z, 4),
            'straightenedDegrees': round(tilt, 3),
        },
        'parts': parts,
        'texture': 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode('ascii'),
    }
    args.output.mkdir(parents=True, exist_ok=True)
    path = args.output / 'meshy-gatling-data.js'
    path.write_text(
        '// Generated by scripts/import-meshy-gatling.py from the SHA-pinned original Meshy GLB.\n'
        '// prettier-ignore\n'
        'export const MODEL_DATA = ' + json.dumps(result, separators=(',', ':')) + ';\n',
        encoding='utf8',
    )
    report = {
        'output': str(path),
        'bytes': path.stat().st_size,
        'pivot': result['parts'][2]['pivot'],
        'rotor': result['rotor'],
        'bounds': bounds,
        'parts': [{k: p[k] for k in ('part', 'triangles', 'vertices')} for p in parts],
    }
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
