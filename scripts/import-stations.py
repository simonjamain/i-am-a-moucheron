"""Import approved issue #171 station GLBs, preserving every triangle and UV.
Usage: python scripts/import-stations.py refuel|radar SOURCE.glb
Radar antenna islands are detached above the vertical bearing; the mast/base
remain fixed. Textures are copied to a 1K JPEG atlas, originals stay outside Git.
"""
import base64
import hashlib
import io
import json
import sys
from pathlib import Path
from importlib.machinery import SourceFileLoader
import numpy as np
from PIL import Image

helper = SourceFileLoader('castor_import', str(Path(__file__).with_name('import-meshy-castor.py'))).load_module()

def main():
    kind, source = sys.argv[1], Path(sys.argv[2])
    approved = {
        'refuel': 'c38cb36c8c26192f11badb1d6b706641c07c993a0bf82f4a60257b45edb59652',
        'radar': 'a8533b347155c382e4bbef3deee890c92cdcaad87e75900cad3e96b2bf0d3e13',
    }
    sha = hashlib.sha256(source.read_bytes()).hexdigest()
    if sha != approved[kind]:
        raise ValueError('unapproved source SHA-256')
    v, faces, uv, image = helper.load(source)
    comps = helper.islands(v, faces)
    lo, hi = v.min(0), v.max(0)
    scale = (4 / (hi[1] - lo[1])) if kind == 'radar' else (4 / (hi[0] - lo[0]))
    offset = np.array([(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2])
    points = (v - offset) * scale
    selections = [('base', np.arange(len(faces)), np.zeros(3))]
    if kind == 'radar':
        antenna = [c for c in comps if v[np.unique(faces[c])][:, 1].min() >= 0.04]
        if sorted(map(len, antenna)) != [10, 12, 12, 16, 18, 92]:
            raise ValueError('unexpected antenna islands')
        moving = np.concatenate(antenna)
        pivot = (np.array([0, 0.0437, 0]) - offset) * scale
        selections = [('base', np.setdiff1d(np.arange(len(faces)), moving), np.zeros(3)), ('antenna', moving, pivot)]
    parts = []
    for name, selected, pivot in selections:
        used, indices = np.unique(faces[selected], return_inverse=True)
        pos = points[used] - pivot
        tex = uv[used].copy(); tex[:, 1] = 1 - tex[:, 1]
        parts.append({'part': name, 'pivot': np.round(pivot, 4).tolist(),
            'positions': base64.b64encode(np.rint(pos / 0.0005).astype('<i2').tobytes()).decode(),
            'uv': base64.b64encode(np.rint(np.clip(tex, 0, 1) * 65535).astype('<u2').tobytes()).decode(),
            'indices': base64.b64encode(indices.astype('<u2').tobytes()).decode()})
    out = io.BytesIO()
    image.resize((1024, 1024), Image.Resampling.LANCZOS).save(out, 'JPEG', quality=88, optimize=True)
    data = {'source': source.name, 'sourceSha256': sha, 'triangles': len(faces), 'bounds': np.round([points.min(0), points.max(0)], 4).tolist(), 'parts': parts,
        'texture': 'data:image/jpeg;base64,' + base64.b64encode(out.getvalue()).decode()}
    target = Path(f'src/meshy-{kind}-data.js')
    target.write_text('// Imported by scripts/import-stations.py; source geometry and UV retained.\n// prettier-ignore\nexport const MODEL_DATA = ' + json.dumps(data, separators=(',', ':')) + ';\n')
    print(kind, sha, len(faces), 'triangles', len(out.getvalue()), 'atlas bytes', target.stat().st_size, 'JS bytes')

if __name__ == '__main__':
    main()
