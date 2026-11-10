"""Convert the user's remodelled Meshy vehicles (one textured mesh each, whose
movable pieces are separate islands) into articulated, offline game modules.

Usage:
  python3 scripts/import-meshy-vehicle.py VEHICLE SOURCE.glb [--debug]
  VEHICLE: spitfire | tank | flaktruck | helicopter | bomber | fighter | interceptor

Each vehicle spec selects islands (welded connectivity, ignoring UV seams) for
every articulated node, gives its pivot and, for guns, the barrel direction.
Every source triangle and UV is kept; only the texture is resized. Geometry is
stored in each node's local frame (guns aligned on -Z, as aimGun expects), and
anchors (muzzles, weapon origins) are exported in their node's frame. The
numbers the physics shares with the model (gun pivots, barrel lengths, trailer
hitch and hulls, helicopter weapon origins) go to src/vehicle-anchors.js.
"""
import base64
import hashlib
import io
import json
import re
from pathlib import Path
import sys

import numpy as np
import trimesh
from PIL import Image
from trimesh.graph import connected_components

ANCHORS_FILE = Path('src/vehicle-anchors.js')


# ---------------------------------------------------------------- loading
def load(path):
    scene = trimesh.load(path, force='scene')
    nodes = scene.graph.nodes_geometry
    if len(nodes) != 1:
        raise ValueError(f'expected one Meshy mesh, found {len(nodes)}')
    matrix, name = scene.graph[nodes[0]]
    mesh = scene.geometry[name].copy()
    mesh.apply_transform(matrix)
    uv = getattr(mesh.visual, 'uv', None)
    image = getattr(mesh.visual.material, 'baseColorTexture', None)
    if uv is None or image is None:
        raise ValueError('missing original Meshy UV or baseColorTexture')
    uv = np.asarray(uv, dtype=float)
    if uv.shape != (len(mesh.vertices), 2) or not np.isfinite(uv).all():
        raise ValueError('invalid UVs')
    return np.asarray(mesh.vertices, dtype=float), np.asarray(mesh.faces), uv, image.convert('RGB')


class Island:
    def __init__(self, index, faces, vertices, face_ids):
        self.id = index
        self.faces = face_ids
        v = vertices[np.unique(faces[face_ids])]
        self.lo, self.hi = v.min(0), v.max(0)
        self.c = (self.lo + self.hi) / 2
        self.sz = self.hi - self.lo
        self.n = len(face_ids)


def islands(vertices, faces):
    welded = trimesh.Trimesh(vertices.copy(), faces.copy(), process=False)
    welded.merge_vertices(merge_tex=True, merge_norm=True)
    comps = connected_components(welded.face_adjacency, nodes=np.arange(len(faces)), min_len=1)
    comps = sorted(comps, key=lambda c: (-len(c), int(np.min(c))))
    return [Island(i, faces, vertices, np.asarray(c)) for i, c in enumerate(comps)]


# Meshy vehicles face -X with the span along Z; the game flies toward -Z.
ORIENT = np.array([[0, 0, -1], [0, 1, 0], [1, 0, 0]], dtype=float)  # game = ORIENT @ source


def rot_y(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def rot_x(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def quaternion(m):
    # Shepperd's method: stable for every rotation, including half turns.
    t = np.trace(m)
    if t > 0:
        r = np.sqrt(1 + t) * 2
        q = [(m[2, 1] - m[1, 2]) / r, (m[0, 2] - m[2, 0]) / r, (m[1, 0] - m[0, 1]) / r, r / 4]
    else:
        k = int(np.argmax(np.diag(m)))
        i, j = k, (k + 1) % 3
        l = (k + 2) % 3
        r = np.sqrt(1 + m[i, i] - m[j, j] - m[l, l]) * 2
        q = [0.0, 0.0, 0.0, (m[l, j] - m[j, l]) / r]
        q[i] = r / 4
        q[j] = (m[j, i] + m[i, j]) / r
        q[l] = (m[l, i] + m[i, l]) / r
    return q


# ---------------------------------------------------------------- specs
def SPITFIRE_GUN(i):
    return i.sz[0] < 0.03 and abs(i.c[0] + 0.22) < 0.01 and abs(i.c[2]) > 0.2


def FLAK_MOUNT(i):
    # Rotating gun carriage on the trailer turntable (island 18), railings excluded.
    post = i.sz[0] < 0.008 and i.sz[2] < 0.008
    return i.c[1] > 0.0 and np.hypot(i.c[0] - 0.32, i.c[2]) < 0.08 and i.sz[0] < 0.2 and not post


def FLAK_AXIS(H):
    # Yaw axis: turntable centre, at the carriage's lowest point.
    c = H.center(18)
    return np.array([c[0], H.box(18)[1][1], c[2]])


def FLAK_DIRECTION(H):
    # Twin barrels point backward and up at rest; orient toward their muzzles.
    d = H.axis(12, 13)
    tips = (H.front(12, low=False) + H.front(13, low=False)) / 2
    return d if np.dot(tips - H.center(12, 13), d) > 0 else -d


def FLAK_MUZZLE(H):
    pivot = H.pivot('cannonGun')
    d = FLAK_DIRECTION(H)
    tips = (H.front(12, low=False) + H.front(13, low=False)) / 2
    return pivot + d * np.dot(tips - pivot, d)


def FLAK_SHARED(H, m):
    hitch = H.pivot('trailer')
    gun = H.pivot('cannonGun')
    bounds = np.array(m['bounds'])
    trailer = H.box(*[i.id for i in H.islands(lambda i: i.c[0] > 0.1)])
    tractor = H.box(*[i.id for i in H.islands(lambda i: i.c[0] <= 0.1)])
    return dict(
        hitch=r4(hitch),
        gunOffset=r4(gun - hitch),
        gunLength=r4(np.linalg.norm(FLAK_MUZZLE(H) - gun)),
        tractorBox=r4([tractor[0], tractor[1]]),
        trailerBox=r4([trailer[0] - hitch, trailer[1] - hitch]),
        length=r4(bounds[1][2] - bounds[0][2]),
    )


# Gunner turrets of the B3: muzzle-end hint in game space for each gun pair.
B3_TOWARD = {(9, 13): (0, 0, -1), (10, 11): (0, 0, 1), (12, 14): (0, -1, 0)}


def B3_TIPS(H, guns):
    """Muzzle end and root end of twin guns (game space)."""
    axis = int(np.argmax(np.max([H.isl_size(g) for g in guns], axis=0)))
    a = np.mean([H.front(g, axis=axis, low=True) for g in guns], axis=0)
    b = np.mean([H.front(g, axis=axis, low=False) for g in guns], axis=0)
    return (a, b) if np.dot(a - b, B3_TOWARD[guns]) > 0 else (b, a)


def B3_ROOT(H, guns):
    return B3_TIPS(H, guns)[1]


def B3_AIM(H, guns):
    tip, root = B3_TIPS(H, guns)
    return tip - root


def B3_MUZZLE(H, node, guns):
    # On the barrel axis through the pivot, so aimGun points exactly at it.
    pivot = H.pivot(node)
    d = np.array([0.0, 0.0, -1.0]) if node == 'dorsalGun' else B3_AIM(H, guns)
    d = d / np.linalg.norm(d)
    return pivot + d * np.dot(B3_TIPS(H, guns)[0] - pivot, d)


def STUKA_GUN(H, wing):
    # Leading edge of a wing at 40 % of its span from the root.
    lo, hi = H.box(wing)
    x = 0.6 * lo[0] + 0.4 * hi[0] if abs(lo[0]) < abs(hi[0]) else 0.6 * hi[0] + 0.4 * lo[0]
    near = H.island_points(wing)
    band = near[np.abs(near[:, 0] - x) < 0.08 * (hi[0] - lo[0])]
    return band[np.argmin(band[:, 2])]  # a real leading-edge vertex


def TANK_TURRET(i):
    return -0.13 <= i.c[0] <= 0.31 and abs(i.c[2]) < 0.19 and i.lo[1] >= 0.008

# Predicates use the Meshy source frame (-X forward, +Y up, span along Z).
def r4(v, digits=4):
    # Rounded plain floats, without negative zeros.
    return (np.round(np.asarray(v, dtype=float), digits) + 0.0).tolist()


def ids(*values):
    return lambda i: i.id in values


SPECS = {
    'spitfire': dict(
        output='src/meshy-spitfire-data.js', export='MODEL_DATA',
        fit=('x', 6.2), gear=1.05,
        nodes=[
            dict(name='prop', select=lambda i: i.c[0] < -0.3, pivot=('center', 'largest')),
            dict(name='wing', select=SPITFIRE_GUN, split=dict(island=0, test=lambda c: abs(c[2]) > 0.075),
                 pivot=('origin',)),
        ],
        anchors=[dict(name='gun', node='wing', each=SPITFIRE_GUN)],
    ),
    'tank': dict(
        output='src/meshy-tank-data.js', export='MODEL_DATA',
        fit=('z', 4.3), gear=0.8,
        nodes=[
            # Main gun: barrel, mantlet and coaxial gun elevate together.
            # The elevation pivot sits on the barrel axis, so the physics origin
            # (pivot + direction x length) is exactly the drawn muzzle.
            dict(name='cannonGun', parent='cannon', select=ids(2, 32, 121, 4, 26),
                 pivot=('fn', lambda H: [H.front(2)[0], H.front(2)[1], H.center(17)[2]])),
            # Commander machine gun on the roof: pintle (yaw) and gun (pitch).
            dict(name='topGun', parent='top', select=lambda i: i.c[1] > 0.225 and abs(i.c[2] - 0.06) < 0.035,
                 pivot=('fn', lambda H: [H.front(11)[0], H.front(11)[1], H.center(36, 51)[2]])),
            dict(name='top', parent='cannon', select=ids(36, 51),
                 pivot=('fn', lambda H: [H.front(11)[0], H.box(36, 51)[0][1], H.center(36, 51)[2]])),
            dict(name='cannon', select=TANK_TURRET,
                 pivot=('fn', lambda H: [H.front(2)[0], H.box(17)[0][1], H.center(17)[2]])),
        ],
        anchors=[
            dict(name='muzzle', node='cannonGun', fn=lambda H: [H.front(2)]),
            dict(name='coax', node='cannonGun', fn=lambda H: [H.front(4)]),
            dict(name='topMuzzle', node='topGun', fn=lambda H: [H.front(11)]),
            dict(name='hullGun', node='body', fn=lambda H: [H.front(5)]),
        ],
        shared=lambda H, m: dict(gunPivot=r4(H.pivot('cannonGun')),
                                 gunLength=r4(H.pivot('cannonGun')[2] - H.front(2)[2])),
    ),
    'flaktruck': dict(
        output='src/meshy-flaktruck-data.js', export='MODEL_DATA',
        fit=('z', 8.6), gear=0.8,
        nodes=[
            dict(name='cannonGun', parent='cannon', select=ids(12, 13, 50),
                 pivot=('fn', lambda H: [*FLAK_AXIS(H)[[0]], H.front(12, low=True)[1], FLAK_AXIS(H)[2]]),
                 aim=lambda H: FLAK_DIRECTION(H)),
            dict(name='cannon', parent='trailer', select=FLAK_MOUNT,
                 pivot=('fn', lambda H: FLAK_AXIS(H)), aim=lambda H: FLAK_DIRECTION(H), elevate=False),
            # Everything behind the hitch swings with the trailer.
            dict(name='trailer', select=lambda i: i.c[0] > 0.1,
                 pivot=('fn', lambda H: [0.0, H.center(47)[1], H.front(47)[2]])),
        ],
        anchors=[dict(name='muzzle', node='cannonGun', fn=lambda H: [FLAK_MUZZLE(H)])],
        shared=lambda H, m: FLAK_SHARED(H, m),
    ),
    'helicopter': dict(
        output='src/meshy-h2-data.js', export='H2_DATA',
        fit=('z', 7.5), gear=1.1,
        nodes=[
            dict(name='rotor', select=lambda i: i.c[1] > 0.095 and i.c[0] < 0.3,
                 pivot=('fn', lambda H: H.center(4))),
            dict(name='tailRotor', select=lambda i: i.c[0] > 0.36 and i.c[1] > 0.05,
                 pivot=('fn', lambda H: H.center(27))),
            dict(name='gunBarrel', parent='gun', select=ids(12, 14),
                 pivot=('fn', lambda H: H.center(22))),
            dict(name='gun', select=ids(22), pivot=('fn', lambda H: H.center(22))),
        ],
        anchors=[dict(name='muzzle', node='gunBarrel', fn=lambda H: [(H.front(12) + H.front(14)) / 2])],
        # Weapon origins for side +1 (game +X); the physics mirrors them.
        shared=lambda H, m: dict(
            rocket=r4(max((H.front(i) for i in (1, 3)), key=lambda p: p[0])),
            missile=r4(np.mean([p for p in (H.front(i) for i in (5, 6, 7, 8)) if p[0] > 0], axis=0)),
        ),
    ),
    'bomber': dict(
        output='src/meshy-b3-data.js', export='B3_DATA',
        fit=('x', 11.3), gear=1.45,
        nodes=[
            dict(name='wing', select=ids(22, 23), pivot=('origin',)),
            dict(name='propLeft', select=lambda i: abs(i.c[0] + 0.205) < 0.02 and 0.05 < i.c[2] < 0.2,
                 pivot=('center', 'largest')),
            dict(name='propRight', select=lambda i: abs(i.c[0] + 0.205) < 0.02 and -0.2 < i.c[2] < -0.05,
                 pivot=('center', 'largest')),
            # Dorsal turret: dome yaws, twin guns elevate on the barrel axis.
            dict(name='dorsalGun', parent='dorsal', select=ids(9, 13),
                 pivot=('fn', lambda H: [H.center(1)[0], H.center(9, 13)[1], H.center(1)[2]])),
            dict(name='dorsal', select=ids(1),
                 pivot=('fn', lambda H: [H.center(1)[0], H.box(1)[0][1], H.center(1)[2]])),
            # Tail guns face backward at rest; the glazed housing stays in the hull.
            dict(name='tailGun', parent='tail', select=ids(10, 11, 44),
                 pivot=('fn', lambda H: B3_ROOT(H, (10, 11))), aim=lambda H: B3_AIM(H, (10, 11))),
            dict(name='tail', pivot=('fn', lambda H: B3_ROOT(H, (10, 11))),
                 aim=lambda H: B3_AIM(H, (10, 11)), elevate=False),
            # Ventral guns hang below the fuselage, pointing down and back.
            dict(name='ventralGun', parent='ventral', select=ids(12, 14),
                 pivot=('fn', lambda H: B3_ROOT(H, (12, 14))), aim=lambda H: B3_AIM(H, (12, 14))),
            dict(name='ventral', pivot=('fn', lambda H: B3_ROOT(H, (12, 14))),
                 aim=lambda H: B3_AIM(H, (12, 14)), elevate=False),
        ],
        anchors=[
            dict(name='dorsalMuzzle', node='dorsalGun', fn=lambda H: [B3_MUZZLE(H, 'dorsalGun', (9, 13))]),
            dict(name='tailMuzzle', node='tailGun', fn=lambda H: [B3_MUZZLE(H, 'tailGun', (10, 11))]),
            dict(name='ventralMuzzle', node='ventralGun', fn=lambda H: [B3_MUZZLE(H, 'ventralGun', (12, 14))]),
        ],
    ),
    # M1 light fighter (remodel of the remodel, v267): propeller and the two
    # sculpted nose machine guns. Damage no longer deforms the wing, so the
    # hull keeps it whole.
    'fighter': dict(
        output='src/meshy-m1-data.js', export='M1_DATA',
        fit=('x', 5.6), gear=1.05,
        nodes=[dict(name='prop', select=lambda i: i.c[0] < -0.33, pivot=('center', 'largest'))],
        anchors=[dict(name='gun', node='body', each=lambda i: i.id in (3, 4))],
    ),
    # Stuka: gull wings (separate islands), propeller; the belly bomb stays on
    # the hull. Its two wing guns fire from the leading edge at 40 % span.
    'interceptor': dict(
        output='src/meshy-stuka-data.js', export='MODEL_DATA',
        fit=('x', 7.7), gear=1.05,
        nodes=[
            dict(name='prop', select=lambda i: abs(i.c[0] + 0.335) < 0.01 and i.n > 30,
                 pivot=('fn', lambda H: H.center(17))),
            dict(name='wing', select=ids(5, 6), pivot=('origin',)),
        ],
        anchors=[dict(name='gun', node='wing', fn=lambda H: [STUKA_GUN(H, 5), STUKA_GUN(H, 6)])],
    ),
}


# ---------------------------------------------------------------- import
def main():
    vehicle, source = sys.argv[1], Path(sys.argv[2])
    debug = '--debug' in sys.argv
    spec = SPECS[vehicle]
    sha = hashlib.sha256(source.read_bytes()).hexdigest()
    vertices, faces, uv, image = load(source)
    isl = islands(vertices, faces)

    # Assign faces to nodes (first match wins), the rest is the body.
    owner = np.full(len(faces), 'body', dtype=object)
    groups = {}
    for node in spec['nodes']:
        chosen = [i for i in isl if node.get('select') and node['select'](i) and owner[i.faces[0]] == 'body']
        for i in chosen:
            owner[i.faces] = node['name']
        split = node.get('split')
        if split:
            island = isl[split['island']]
            cent = vertices[faces[island.faces]].mean(1)
            moved = island.faces[[split['test'](c) for c in cent]]
            owner[moved] = node['name']
        groups[node['name']] = [i.id for i in chosen]
    if debug:
        # Inspection aid: islands and node groups for scratch renders.
        dump = sys.argv[sys.argv.index('--debug') + 1]
        comp = np.zeros(len(faces), int)
        for i in isl:
            comp[i.faces] = i.id
        buf = io.BytesIO()
        image.save(buf, 'JPEG', quality=80)
        names = [n['name'] for n in spec['nodes']]
        hl = [[int(i) for i in sorted(set(comp[owner == name]))] for name in names]
        for k, name in enumerate(names):
            comp[owner == name] = 1000 + k
        Path(dump).write_text(json.dumps({
            'pos': vertices.flatten().round(5).tolist(), 'uv': uv.flatten().round(5).tolist(),
            'idx': faces.flatten().tolist(), 'comp': comp.tolist(),
            'tex': 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()}))
        print(json.dumps({'nodes': names, 'hl': hl}))
        return

    # Scale and place: fitted dimension in game axes, wheels at -gear.
    game_all = vertices @ ORIENT.T
    lo, hi = game_all.min(0), game_all.max(0)
    axis = 'xyz'.index(spec['fit'][0])
    scale = spec['fit'][1] / (hi[axis] - lo[axis])
    offset = (lo + hi) / 2
    offset[1] = lo[1] + spec['gear'] / scale

    def game(points):
        return (np.asarray(points) @ ORIENT.T - offset) * scale

    class Helper:
        """Game-space measurements for pivot, aim and anchor functions."""

        def box(self, *ids_):
            v = game(vertices[np.unique(faces[np.concatenate([isl[i].faces for i in ids_])])])
            return v.min(0), v.max(0)

        def center(self, *ids_):
            lo_, hi_ = self.box(*ids_)
            return (lo_ + hi_) / 2

        def front(self, i, axis=0, low=True):
            # Centre of an island's end face along a source axis (default: its -X tip).
            island = isl[i] if isinstance(i, (int, np.integer)) else i
            v = vertices[np.unique(faces[island.faces])]
            edge = island.lo[axis] if low else island.hi[axis]
            near = np.abs(v[:, axis] - edge) <= 0.15 * island.sz[axis] + 1e-9
            tip = v[near].mean(0)
            tip[axis] = edge
            return game(tip[None])[0]

        def axis(self, *ids_):
            # Principal direction of islands (unit, game space), sign left to the caller.
            v = game(vertices[np.unique(faces[np.concatenate([isl[i].faces for i in ids_])])])
            v = v - v.mean(0)
            return np.linalg.svd(v, full_matrices=False)[2][0]

        def island_points(self, i):
            return game(vertices[np.unique(faces[isl[i].faces])])

        def isl_size(self, i):
            return isl[i].sz

        def pivot(self, name):
            return nodes[name]['pivot']

        def islands(self, test):
            return [i for i in isl if test(i)]

    H = Helper()
    nodes = {'body': dict(name='body', parent=None, pivot=np.zeros(3), R=np.eye(3))}
    pending = list(spec['nodes'])
    while pending:
        ready = [n for n in pending if n.get('parent', 'body') in nodes]
        if not ready:
            raise ValueError('node hierarchy has a cycle')
        for node in ready:
            pending.remove(node)
            selected = owner == node['name']
            kind = node.get('pivot', ('center',))[0]
            if kind == 'origin':
                pivot = np.zeros(3)
            elif kind == 'center':
                big = max((isl[i] for i in groups[node['name']]), key=lambda i: i.n)
                v = game(vertices[np.unique(faces[big.faces if node['pivot'][1:] == ('largest',) else selected])])
                pivot = (v.min(0) + v.max(0)) / 2
            elif kind == 'fn':
                pivot = np.asarray(node['pivot'][1](H), dtype=float)
            else:
                raise ValueError(kind)
            R = np.eye(3)
            if 'aim' in node:  # barrel direction at rest, re-aligned to -Z
                d = np.asarray(node['aim'](H), dtype=float)
                d /= np.linalg.norm(d)
                yaw = np.arctan2(-d[0], -d[2])
                pitch = np.arcsin(np.clip(d[1], -1, 1))
                R = rot_y(yaw) @ (rot_x(pitch) if node.get('elevate', True) else np.eye(3))
            nodes[node['name']] = dict(name=node['name'], parent=node.get('parent', 'body'), pivot=pivot, R=R)

    out = io.BytesIO()
    image.resize((1024, 1024), Image.Resampling.LANCZOS).save(out, format='JPEG', quality=88, optimize=True)
    jpeg = out.getvalue()

    parts, triangles = [], 0
    for name, node in nodes.items():
        selection = np.flatnonzero(owner == name)
        if len(selection) == 0:
            continue
        used, local = np.unique(faces[selection], return_inverse=True)
        pts = (game(vertices[used]) - node['pivot']) @ node['R']  # R^T (p - pivot)
        if len(used) > 65535 or np.max(np.abs(pts)) >= 16:
            raise ValueError(f'{name}: 16-bit budget exceeded')
        tex = np.clip(uv[used] * [1, -1] + [0, 1], 0, 1)  # trimesh UV is bottom-up
        indices = local.reshape(-1, 3).flatten().astype('<u2')
        triangles += len(indices) // 3
        parts.append({
            'part': name,
            'pivot': r4(node['pivot']),
            'positions': base64.b64encode(np.rint(pts / 0.0005).astype('<i2').tobytes()).decode('ascii'),
            'uv': base64.b64encode(np.rint(tex * 65535).astype('<u2').tobytes()).decode('ascii'),
            'indices': base64.b64encode(indices.tobytes()).decode('ascii'),
        })
    if triangles != len(faces):
        raise ValueError('source triangles lost')

    rig = []
    for name, node in nodes.items():
        if name == 'body':
            continue
        parent = nodes[node['parent']]
        position = parent['R'].T @ (node['pivot'] - parent['pivot'])
        rest = parent['R'].T @ node['R']
        rig.append({'name': name, 'parent': node['parent'], 'pivot': r4(node['pivot']),
                    'position': r4(position), 'quaternion': r4(quaternion(rest), 6)})

    anchors = []
    for a in spec.get('anchors', []):
        node = nodes[a['node']]
        points = []
        if 'each' in a:
            points = [H.front(i) for i in isl if a['each'](i)]
        else:
            points = [np.asarray(p, dtype=float) for p in a['fn'](H)]
        for k, p in enumerate(sorted(points, key=lambda p: (round(float(p[0]), 3), round(float(p[2]), 3)))):
            local = node['R'].T @ (p - node['pivot'])
            anchors.append({'name': a['name'], 'node': a['node'], 'at': r4(local), 'world': r4(p)})

    allv = game(vertices)
    model = {
        'source': source.name,
        'sourceSha256': sha,
        'triangles': triangles,
        'scale': round(float(scale), 5),
        'bounds': r4([allv.min(0), allv.max(0)]),
        'rig': rig,
        'anchors': anchors,
        'parts': parts,
        'texture': 'data:image/jpeg;base64,' + base64.b64encode(jpeg).decode('ascii'),
    }
    target = Path(spec['output'])
    target.write_text(
        f'// Imported by scripts/import-meshy-vehicle.py {vehicle} from {source.name}, SHA256 {sha}.\n'
        + '// prettier-ignore\n'
        + f'export const {spec["export"]} = ' + json.dumps(model, separators=(',', ':')) + ';\n',
        encoding='utf-8',
    )
    if 'shared' in spec:
        write_shared(vehicle, spec['shared'](H, model))
    print(json.dumps({
        'vehicle': vehicle, 'sourceSha256': sha, 'triangles': triangles, 'islands': len(isl),
        'scale': model['scale'], 'bounds': model['bounds'],
        'rig': {r['name']: r['pivot'] for r in rig},
        'anchors': [(a['name'], a['world']) for a in anchors],
        'atlasBytes': len(jpeg), 'jsBytes': target.stat().st_size,
    }, indent=1))


def write_shared(vehicle, values):
    # One generated, server-safe module keeps the physics in step with models.
    current = {}
    if ANCHORS_FILE.exists():
        match = re.search(r'VEHICLE_ANCHORS = (\{.*\});', ANCHORS_FILE.read_text(), re.S)
        if match:
            current = json.loads(match.group(1))
    current[vehicle] = values
    ANCHORS_FILE.write_text(
        '// Generated by scripts/import-meshy-vehicle.py: model-unit points shared by the\n'
        + '// articulated Meshy models and the physics (multiply by ACTOR_UNIT).\n'
        + '// prettier-ignore\n'
        + 'export const VEHICLE_ANCHORS = ' + json.dumps(current, indent=1, sort_keys=True) + ';\n',
        encoding='utf-8',
    )


if __name__ == '__main__':
    main()
