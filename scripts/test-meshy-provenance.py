"""Contract tests for optional Meshy derived GLB provenance, without private Meshy files."""
import hashlib
import json
import tempfile
from pathlib import Path
from meshy_provenance import verify_meshy_source

with tempfile.TemporaryDirectory() as dir:
    original = Path(dir) / "original.glb"
    derived = Path(dir) / "derived.glb"
    original.write_bytes(b"approved original")
    derived.write_bytes(b"modified derivative")
    src = hashlib.sha256(original.read_bytes()).hexdigest()
    dst = hashlib.sha256(derived.read_bytes()).hexdigest()
    assert verify_meshy_source(original, src) == src
    report = {
        "originalSha256": src, "optimizedSha256": dst,
        "before": {"meshes": 1, "triangles": 90},
        "after": {"triangles": 60},
        "modifiedMeshes": [{"name": "body"}],
        "validation": {"sourceTriangles": 90, "targetTriangles": 60},
        "regions": [{"name": "rotor", "min": [0,0,0], "max": [1,1,1]}],
        "monoblocOverride": False,
    }
    path = Path(str(derived) + ".report.json")
    path.write_text(json.dumps(report))
    assert verify_meshy_source(derived, src, original) == dst
    for changed in [
        {"originalSha256": "wrong"},
        {"optimizedSha256": "wrong"},
        {"monoblocOverride": True},
        {"regions": []},
        {"validation": None},
        {"after": {"triangles": 100}},
    ]:
        bad = {**report, **changed}
        path.write_text(json.dumps(bad))
        try:
            verify_meshy_source(derived, src, original)
        except ValueError:
            pass
        else:
            raise AssertionError(f"Invalid derivative was accepted: {changed}")
    for args in [(derived, src, None), (derived, "wrong", original)]:
        try:
            verify_meshy_source(*args)
        except (ValueError, FileNotFoundError):
            pass
        else:
            raise AssertionError("Invalid source accepted")
print("PASS: verified originals and provenance-checked derived Meshy files")
