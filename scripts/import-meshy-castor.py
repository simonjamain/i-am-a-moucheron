"""Convert the three original textured Meshy G1 Castor GLBs to indexed, UV-textured game assets.

Usage: python3 scripts/import-meshy-castor.py body|turret|wheel SOURCE.glb
No external 3D loader or CDN is needed by the Three.js runtime. Fail closed when
the source loses its original UV or base-color texture.
"""
import base64
import hashlib
import io
import json
import math
from pathlib import Path
import sys

import numpy as np
import trimesh
from PIL import Image

TASKS = {
    'body': '01a1afc9-29f8-771d-8efc-493296643670',
    'turret': '01a1afc9-3823-7324-ae2b-56cd8adf4c34',
    'wheel': '01a1afc9-4756-727e-8b75-cf19b054f6d4',
}
OUTPUT = {kind: Path(f'src/meshy-castor-{kind}-data.js') for kind in TASKS}


def load_parts(path):
    scene = trimesh.load(path, force='scene')
    parts = []
    for node in scene.graph.nodes_geometry:
        matrix, geometry_name = scene.graph[node]
        mesh = scene.geometry[geometry_name].copy()
        if not isinstance(mesh, trimesh.Trimesh) or len(mesh.faces) == 0:
            continue
        mesh.apply_transform(matrix)
        visual = mesh.visual
        uv = getattr(visual, 'uv', None)
        material = getattr(visual, 'material', None)
        img = getattr(material, 'baseColorTexture', None)
        if img is None:
            img = getattr(material, 'image', None)
        if uv is None or img is None:
            raise ValueError(f'{node}: missing original Meshy UV or baseColorTexture')
        if not isinstance(img, Image.Image):
            img = Image.fromarray(np.asarray(img))
        uv = np.asarray(uv)
        if uv.shape != (len(mesh.vertices), 2) or not np.isfinite(uv).all():
            raise ValueError(f'{node}: invalid UVs')
        parts.append((mesh, img.convert('RGB')))
    if not parts:
        raise ValueError('No textured Meshy triangles in source')
    return parts


def orient(pts, kind, spans):
    # Meshy reference vehicles face -X; the game drives toward -Z.
    if kind in ('body', 'turret'):
        if spans[0] > spans[2]:
            return np.column_stack((-pts[:, 2], pts[:, 1], pts[:, 0]))
        return pts
    thin = int(np.argmin(spans))
    # Turn the wheel's thin axle direction onto X without mirroring geometry.
    if thin == 2:
        return np.column_stack((-pts[:, 2], pts[:, 1], pts[:, 0]))
    if thin == 1:
        return np.column_stack((pts[:, 1], pts[:, 2], pts[:, 0]))
    return pts


def normalize(parts, kind):
    raw = np.vstack([m.vertices for m, _ in parts])
    spans = np.ptp(raw, axis=0)
    if np.any(spans < 1e-6):
        raise ValueError(f'{kind}: degenerate component bounds')
    vertices = [orient(m.vertices, kind, spans) for m, _ in parts]
    all_pts = np.vstack(vertices)
    lo, hi = all_pts.min(axis=0), all_pts.max(axis=0)
    sizes = hi - lo
    if kind == 'body':
        limits = np.array([5.5, 3.1, 8.5])
    elif kind == 'turret':
        limits = np.array([2.1, 1.5, 3.0])
    else:
        limits = np.array([0.65, 1.7, 1.7])
    scale = min(limits / sizes)
    offsets = (lo + hi) / 2
    if kind == 'body':
        offsets[1] = lo[1] + 0.8 / scale
    # Wheel/turret models are centered on their independently animated pivots.
    for (mesh, _), v in zip(parts, vertices):
        mesh.vertices = (v - offsets) * scale
    after = np.vstack([m.vertices for m, _ in parts])
    return {
        'scale': float(scale),
        'bounds': np.round([after.min(axis=0), after.max(axis=0)], 4).tolist(),
        'orientation': 'Meshy X-forward rotated to game -Z' if spans[0] > spans[2] and kind != 'wheel' else 'adaptive',
    }


def atlas_for(parts):
    # Pack the actual source images, preserving each mesh's UV islands.
    images = []
    lookup = {}
    mapping = []
    for _, image in parts:
        out = io.BytesIO()
        image.save(out, format='PNG')
        key = hashlib.sha256(out.getvalue()).hexdigest()
        if key not in lookup:
            lookup[key] = len(images)
            images.append(image)
        mapping.append(lookup[key])
    if len(images) > 16:
        raise ValueError('Too many original materials for a 1024px atlas')
    cols = math.ceil(math.sqrt(len(images)))
    rows = math.ceil(len(images) / cols)
    tile = min(1024 // cols, 1024 // rows)
    atlas = Image.new('RGB', (cols * tile, rows * tile), (24, 24, 24))
    for index, image in enumerate(images):
        atlas.paste(
            image.resize((tile, tile), Image.Resampling.LANCZOS),
            ((index % cols) * tile, (index // cols) * tile),
        )
    buf = io.BytesIO()
    atlas.save(buf, format='JPEG', quality=88, optimize=True)
    return buf.getvalue(), mapping, cols, rows


def encode(parts, kind, mapping, columns, rows):
    packed = []
    triangles = 0
    for (mesh, _), tile_index in zip(parts, mapping):
        # Chunks keep each indexed mesh within the Uint16 vertex limit.
        for start in range(0, len(mesh.faces), 9000):
            selection = np.arange(start, min(start + 9000, len(mesh.faces)))
            segment = mesh.submesh([selection], append=True)
            if len(segment.vertices) > 65535:
                raise ValueError('16-bit index budget exceeded')
            pts = np.asarray(segment.vertices)
            if not np.isfinite(pts).all() or np.max(np.abs(pts)) >= 16:
                raise ValueError('Out-of-range 16-bit positions')
            uv = np.asarray(segment.visual.uv, dtype=float).copy()
            if uv.shape != (len(segment.vertices), 2):
                raise ValueError('Original UV lost during submesh extraction')
            uv[:, 0] = (np.clip(uv[:, 0], 0, 1) + tile_index % columns) / columns
            uv[:, 1] = (1 - np.clip(uv[:, 1], 0, 1) + tile_index // columns) / rows
            p = np.rint(pts / 0.0005).astype('<i2')
            u = np.rint(uv * 65535).astype('<u2')
            indices = segment.faces.flatten().astype('<u2')
            triangles += len(indices) // 3
            packed.append({
                'part': kind,
                'pivot': [0, 0, 0],
                'positions': base64.b64encode(p.tobytes()).decode('ascii'),
                'uv': base64.b64encode(u.tobytes()).decode('ascii'),
                'indices': base64.b64encode(indices.tobytes()).decode('ascii'),
            })
    return packed, triangles


def main():
    kind, source = sys.argv[1:3]
    if kind not in TASKS:
        raise ValueError(f'Unknown Castor component {kind}')
    source = Path(source)
    sha = hashlib.sha256(source.read_bytes()).hexdigest()
    parts = load_parts(source)
    meta = normalize(parts, kind)
    jpeg, mapping, columns, rows = atlas_for(parts)
    output, triangles = encode(parts, kind, mapping, columns, rows)
    if not 500 <= triangles <= 300000:
        raise ValueError(f'Unexpected Meshy triangle count {triangles}')
    model = {
        'sourceTask': TASKS[kind],
        'sourceSha256': sha,
        'triangles': triangles,
        'bounds': meta['bounds'],
        'parts': output,
        'texture': 'data:image/jpeg;base64,' + base64.b64encode(jpeg).decode('ascii'),
    }
    target = OUTPUT[kind]
    target.write_text(
        '// Imported from original textured Meshy task ' + TASKS[kind] + ', SHA256 ' + sha + '.\n'
        + '// prettier-ignore\n'
        + 'export const MODEL_DATA = ' + json.dumps(model, separators=(',', ':')) + ';\n',
        encoding='utf-8',
    )
    print(json.dumps({
        'component': kind,
        'sourceSha256': sha,
        'triangles': triangles,
        'sourceMeshes': len(parts),
        'indexedParts': len(output),
        'atlasBytes': len(jpeg),
        'jsBytes': target.stat().st_size,
        **meta,
    }))


if __name__ == '__main__':
    main()
