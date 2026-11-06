"""Validation de provenance pour les GLB d'origine Meshy et leurs dérivés.

La vérification des empreintes approuvées est conservée. Les dérivés doivent
contenir des régions de protection explicites et avoir été validés par la CLI.
N'ajoute aucun nouveau format au runtime du jeu.
"""
import hashlib
import json
from pathlib import Path


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def verify_meshy_source(source, expected_original_sha, original=None):
    source = Path(source)
    source_sha = digest(source)
    if source_sha == expected_original_sha:
        return source_sha
    if original is None:
        raise ValueError(f"Unexpected GLB SHA-256: {source_sha}. Supply the approved ORIGINAL.glb for a derivative.")
    if digest(original) != expected_original_sha:
        raise ValueError("The supplied original GLB does not match its reviewed SHA-256")
    report_path = Path(str(source) + ".report.json")
    report = json.loads(report_path.read_text(encoding="utf8"))
    if report.get("originalSha256") != expected_original_sha or report.get("optimizedSha256") != source_sha:
        raise ValueError("Optimization report does not match the original and derived GLB SHA-256")
    if report.get("monoblocOverride"):
        raise ValueError("Exploratory monobloc reductions are not approved for import")
    if report.get("before", {}).get("meshes") == 1 and not report.get("regions"):
        raise ValueError("A monobloc derivative must declare protected critical regions")
    if not report.get("validation") or not isinstance(report.get("modifiedMeshes"), list):
        raise ValueError("The derivative needs an optimizer validation report")
    before = report.get("before", {}).get("triangles")
    after = report.get("after", {}).get("triangles")
    if not isinstance(before, (int, float)) or not isinstance(after, (int, float)) or after > before:
        raise ValueError("Inconsistent triangle counts in optimizer report")
    return source_sha
