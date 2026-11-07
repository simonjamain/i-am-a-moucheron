"""Convert the seven *reviewed* Meshy GLBs into indexed textured browser meshes.

Usage: python3 scripts/import-meshy-textures.py m1|h2|stuka|spitfire|tank|flaktruck SOURCE.glb [OUT]
The accepted GLB hashes are pinned to the original reviewed models.\nFor an optimized derivative, supply OUT and the verified ORIGINAL.glb as fourth argument. No Meshy call,
network or runtime GLTF dependency is needed. Python deps: trimesh, numpy, Pillow.
We preserve UV seams and animations rather than running non-texture-aware decimation.
"""
import base64
import hashlib
import io
import json
from meshy_provenance import verify_meshy_source
from pathlib import Path
import sys

import numpy as np
import trimesh

CONFIG = {
    'm1': ('f576a15791f513c5af145556f9c499d4a2ae64b4c4d4fc16f75e4b8077ce66c6','meshy-m1-data.js','M1_DATA'),
    'h2': ('148472fadbaf69bdb02fa365a7c3581e04d550eff2f55c6177e3d25183b513de','meshy-h2-data.js','H2_DATA'),
    'stuka': ('a98ad764232edf10d892e2eb4496a062cc82f4ea6147c17a2873e6ca7e029d95','meshy-stuka-data.js','MODEL_DATA'),
    'spitfire': ('8e3bf0b0d947cb57e74deb0ce713c67acdecd8ed22790de6cf23fdbb735785f9','meshy-spitfire-data.js','MODEL_DATA'),
    'tank': ('6aca60a17506abd27334d3450392b6df3d0a3b6d2250e608aaefc0fcda0eb0bb','meshy-tank-data.js','MODEL_DATA'),
    'flaktruck': ('d8ec0b4f3f0e1e205c0bff1f8cd2b18dedd52dec93521e283d8f3e6ef7067bac','meshy-flaktruck-data.js','MODEL_DATA'),
}


def rotated(mesh):
    v = mesh.vertices
    mesh.vertices = np.column_stack((-v[:,2], v[:,1], v[:,0]))
    return mesh


def transform(mesh, name):
    rotated(mesh)
    centers = mesh.triangles_center
    pivot = {}
    keep = np.ones(len(centers), dtype=bool)
    labels = np.full(len(centers), 'body', dtype='<U12')
    if name == 'm1':
        prop = centers[:,2] < -.73
        wing = (~prop) & (abs(centers[:,0])>.22) & (centers[:,1]>.065) & (centers[:,2]>-.42) & (centers[:,2]<.1)
        labels[wing]='wing'
        labels[prop]='prop'
        scale=5.6/np.ptp(mesh.vertices[:,0])
        mesh.vertices *= scale
        mesh.vertices[:,1]+=-1.05-mesh.vertices[:,1].min()
        mesh.vertices[:,2]-=(mesh.vertices[:,2].min()+mesh.vertices[:,2].max())/2
        pivot['prop']=mesh.triangles_center[prop].mean(axis=0)
        pivot['prop'][0] = 0
    elif name=='h2':
        rgb=mesh.visual.to_color().vertex_colors[:,:3]
        from scipy.spatial import cKDTree
        tree=cKDTree(mesh.vertices)
        rgb=rgb[tree.query(centers)[1]].astype(float)
        rotor=(centers[:,1]>.19)&(centers[:,2]<.65)
        tail=(~rotor)&(centers[:,2]>.70)&(centers[:,1]>.04)&(mesh.triangles[:,:,0].max(axis=1)<-.035)&(rgb.mean(axis=1)<105)&(np.ptp(rgb,axis=1)<20)
        barrel=centers[:,2]<-.86
        labels[rotor]='rotor'
        labels[tail]='tailRotor'
        keep=~barrel
        scale=8.4/np.ptp(mesh.vertices[:,2])
        source_vertices=mesh.vertices.copy()
        mesh.vertices *= scale
        mesh.vertices[:,1]+=-1.1-mesh.vertices[:,1].min()
        mesh.vertices[:,2]+=-3.2-mesh.vertices[:,2].min()
        delta_y=-1.1-source_vertices[:,1].min()*scale
        delta_z=-3.2-source_vertices[:,2].min()*scale
        pivot['rotor']=np.array([0,.216*scale+delta_y,-.1*scale+delta_z])
        pivot['tailRotor']=np.array([-.04*scale,.183*scale+delta_y,.843*scale+delta_z])
    else:
        width,height,length,floor={
            'stuka':(7.7,1.9,4.6,-1.05),
            'spitfire':(6.2,1.6,3.8,-1.05),
            'tank':(3.55,1.45,4.1,-.8),
            'flaktruck':(2.3,2.4,9.0,-.8),
        }[name]
        raw=mesh.vertices.copy()
        v=mesh.vertices.copy()
        for axis,size in [(0,width),(1,height),(2,length)]:
            v[:,axis]=(v[:,axis]-v[:,axis].min())/np.ptp(v[:,axis])*size
        v[:,0]-=width/2
        v[:,1]+=floor
        v[:,2]-=length/2
        if name=='flaktruck':
            rz=raw[:,2];split=-.19
            v[:,2]=np.where(rz<split,-4.3+(rz-rz.min())/(split-rz.min())*3.6,-.7+(rz-split)/(rz.max()-split)*5.4)
        mesh.vertices=v
        centers=mesh.triangles_center
        if name in ('stuka','spitfire'):
            labels[(abs(centers[:,0])>.62)&(centers[:,2]<.7)&(centers[:,1]>-.45)]='wing'
        if name=='flaktruck':
            labels[centers[:,2]>-.7]='trailer'
            pivot['trailer']=np.array([0,0,-.7])
    return labels,keep,pivot


def image_jpeg(mesh):
    texture=mesh.visual.material.baseColorTexture.convert('RGB')
    texture.thumbnail((1024,1024))
    out=io.BytesIO()
    texture.save(out,format='JPEG',quality=88,optimize=True)
    return out.getvalue()


def pack(mesh, labels,keep,pivots):
    output=[]
    for part in dict.fromkeys(labels):
        selected=np.flatnonzero(keep&(labels==part))
        if not len(selected): continue
        submesh=mesh.submesh([selected],append=True)
        assert len(submesh.faces)>0
        pivot=pivots.get(part,np.zeros(3))
        points=submesh.vertices-pivot
        uv=submesh.visual.uv.copy()
        # trimesh V axis is bottom-up, whereas ThreeJS texture.flipY=false expects glTF top-down.
        uv[:,1]=1-uv[:,1]
        assert np.max(abs(points))<16,'signed int16 position overflow'
        assert len(points)<65536,'Uint16 indices overflow'
        assert np.isfinite(points).all() and np.isfinite(uv).all()
        assert uv.min()>-0.05 and uv.max()<1.05, 'Unexpected texture UV range'
        arr=np.rint(points/.0005).astype('<i2')
        uvs=np.rint(np.clip(uv,0,1)*65535).astype('<u2')
        faces=submesh.faces.flatten().astype('<u2')
        output.append(dict(part=part,pivot=np.round(pivot,5).tolist(),
                           positions=base64.b64encode(arr.tobytes()).decode('ascii'),
                           uv=base64.b64encode(uvs.tobytes()).decode('ascii'),
                           indices=base64.b64encode(faces.tobytes()).decode('ascii')))
    return output


def main():
    name=sys.argv[1]
    source=Path(sys.argv[2])
    expected,filename,export=CONFIG[name]
    digest=hashlib.sha256(source.read_bytes()).hexdigest()
    # Optional verified derivative input: name INPUT.glb OUT.js ORIGINAL.glb
    original_source=Path(sys.argv[4]) if len(sys.argv)>4 else None
    verify_meshy_source(source,expected,original_source)
    scene=trimesh.load(source,force='scene')
    assert len(scene.geometry)==1
    mesh=scene.to_mesh()
    assert hasattr(mesh.visual,'uv') and hasattr(mesh.visual.material,'baseColorTexture')
    atlas=image_jpeg(mesh)
    labels,keep,pivots=transform(mesh,name)
    parts=pack(mesh,labels,keep,pivots)
    data=dict(parts=parts, texture='data:image/jpeg;base64,'+base64.b64encode(atlas).decode('ascii'))
    output=Path(sys.argv[3]) if len(sys.argv)>3 else Path('src')/filename
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(f'// Generated from verified original Meshy GLB SHA-256 {digest}.\n// prettier-ignore\nexport const {export} = '+json.dumps(data,separators=(',',':'))+';\n')
    print(json.dumps(dict(name=name,sha256=digest,triangles=sum(len(p['indices'])*3//4//6 for p in parts), parts=len(parts),atlas_bytes=len(atlas),js_bytes=output.stat().st_size)))

if __name__=='__main__': main()
