"""Import the user's static Drawer Bed; keep source topology and UV coordinates.
Usage: work/venv/bin/python scripts/import-bed.py SOURCE.glb
The approved source is retained outside Git in assets/originals/bed/.
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

SOURCE_SHA256 = '3ddaba9b3f39927101d6a16a429083a0a13811f8b18484e2a0f05a8cf9e64e49'
helper = SourceFileLoader('bed_source', str(Path(__file__).with_name('import-meshy-castor.py'))).load_module()


def main():
    source = Path(sys.argv[1])
    sha = hashlib.sha256(source.read_bytes()).hexdigest()
    if sha != SOURCE_SHA256:
        raise ValueError('unapproved bed source SHA-256')
    vertices, faces, uv, image = helper.load(source)
    lo, hi = vertices.min(0), vertices.max(0)
    scale = 4 / (hi[0] - lo[0])
    points = (vertices - np.array([(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2])) * scale
    tex = uv.copy()
    tex[:, 1] = 1 - tex[:, 1]
    part = {
        'part': 'bed', 'pivot': [0, 0, 0],
        'positions': base64.b64encode(np.rint(points / 0.0005).astype('<i2').tobytes()).decode(),
        'uv': base64.b64encode(np.rint(np.clip(tex, 0, 1) * 65535).astype('<u2').tobytes()).decode(),
        'indices': base64.b64encode(faces.astype('<u2').tobytes()).decode(),
    }
    atlas = io.BytesIO()
    image.resize((1024, 1024), Image.Resampling.LANCZOS).save(atlas, 'JPEG', quality=88, optimize=True)
    data = {
        'source': 'Meshy_AI_Drawer_Bed_1113100645_texture.glb', 'sourceSha256': sha,
        'triangles': len(faces), 'bounds': np.round([points.min(0), points.max(0)], 4).tolist(),
        'doubleSided': True, 'parts': [part],
        'texture': 'data:image/jpeg;base64,' + base64.b64encode(atlas.getvalue()).decode(),
    }
    output = Path('src/meshy-bed-data.js')
    output.write_text('// Imported by scripts/import-bed.py; original triangles and UV retained.\n// prettier-ignore\nexport const MODEL_DATA = ' + json.dumps(data, separators=(',', ':')) + ';\n')
    print(json.dumps({'sourceSha256': sha, 'triangles': len(faces), 'bounds': data['bounds'], 'textureBytes': len(atlas.getvalue()), 'moduleBytes': output.stat().st_size}))


if __name__ == '__main__':
    main()
