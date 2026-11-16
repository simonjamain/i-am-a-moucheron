"""Reassign the six outer axle endcaps (rims) to their adjacent tyre groups.
Works on the existing UV-preserving embedded import; no source download needed.
Idempotent: all triangles, atlas and pivots are retained, only ownership changes.
"""
import base64
import json
from pathlib import Path
import numpy as np

path = Path('src/meshy-castor-data.js')
text = path.read_text()
prefix, raw = text.split('export const MODEL_DATA = ', 1)
data = json.loads(raw.rstrip().removesuffix(';'))

def decode(p):
    return (np.frombuffer(base64.b64decode(p['positions']), '<i2').reshape(-1, 3).astype(float) * .0005,
            np.frombuffer(base64.b64decode(p['uv']), '<u2').reshape(-1, 2),
            np.frombuffer(base64.b64decode(p['indices']), '<u2').reshape(-1, 3))

def encode(p, v, uv, f):
    used, indices = np.unique(f, return_inverse=True)
    p['positions'] = base64.b64encode(np.rint(v[used] / .0005).astype('<i2').tobytes()).decode()
    p['uv'] = base64.b64encode(uv[used].astype('<u2').tobytes()).decode()
    p['indices'] = base64.b64encode(indices.astype('<u2').tobytes()).decode()

body = data['parts'][0]
v, uv, faces = decode(body)
moved = []
for wheel in data['parts'][1:7]:
    pivot = np.array(wheel['pivot'])
    tri = v[faces]
    # The source has one axle island per pair: its outer planar endcaps are
    # the rims; the central axle and its cylinder remain fixed to the hull.
    selection = np.flatnonzero(np.all(tri[:,:,0] * np.sign(pivot[0]) > 1.4, axis=1) &
        np.all(np.abs(tri[:,:,2] - pivot[2]) < .4, axis=1) & np.all(tri[:,:,1] < .1, axis=1))
    if not len(selection):
        continue
    wv, wuv, wf = decode(wheel)
    used, local = np.unique(faces[selection], return_inverse=True)
    encode(wheel, np.concatenate((wv, v[used] - pivot)), np.concatenate((wuv, uv[used])),
        np.concatenate((wf, local.reshape(-1, 3) + len(wv))))
    moved.extend(selection.tolist())
if moved:
    if len(moved) != 53: raise ValueError(f'expected 53 rim triangles, got {len(moved)}')
    encode(body, v, uv, np.delete(faces, moved, axis=0))
    path.write_text(prefix + 'export const MODEL_DATA = ' + json.dumps(data, separators=(',', ':')) + ';\n')
print('Castor rim triangles moved:', len(moved))
