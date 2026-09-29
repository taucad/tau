"""Positive same-artifact C2 conformance through the installed pytest wrapper."""

from hashlib import sha256
import importlib
import json
import os
from pathlib import Path
import sys

from geospec import GeoSpecEngine, expect_geo


def byte_record(value):
    data = bytes(value)
    return {"sha256": sha256(data).hexdigest(), "utf8": data.decode("utf-8")}


def test_actual_tau_exports(geospec_engine, pytestconfig):
    assert isinstance(geospec_engine, GeoSpecEngine)
    assert pytestconfig.pluginmanager.hasplugin("geospec") or pytestconfig.pluginmanager.hasplugin("geospec.pytest_plugin")
    workspace = Path(os.environ["C2_WORKSPACE"])
    manifest_path = Path(os.environ["C2_MANIFEST"])
    manifest = json.loads(manifest_path.read_bytes())
    format = manifest.get("format", "step")
    assert format in ("step", "glb")
    modules = []
    for name in ("geospec._api", "geospec.pytest_plugin", "geospec_engine_native", "geospec_engine_native.geospec_engine_native"):
        path = Path(importlib.import_module(name).__file__).resolve()
        modules.append({"name": name, "path": str(path), "sha256": sha256(path.read_bytes()).hexdigest()})
    output = {
        "route": f"installed-python{sys.version_info.major}.{sys.version_info.minor}-pytest",
        "executable": sys.executable,
        "version": sys.version,
        "modules": modules,
        "exportManifestSha256": sha256(manifest_path.read_bytes()).hexdigest(),
        "admissions": [],
        "rows": [],
    }
    try:
        for record in manifest["records"]:
            path = workspace / record["artifact"]["path"]
            data = path.read_bytes()
            assert sha256(data).hexdigest() == record["artifact"]["sha256"]
            metadata_frame = record["frame"]
            assert metadata_frame == {"coordinateSystem": "z-up", "lengthUnit": "millimeter", "sourceUnit": "mm"}
            admission_frame = {"coordinateSystem": metadata_frame["coordinateSystem"], "sourceUnit": metadata_frame["sourceUnit"] if format == "glb" else "auto", "outputUnit": "mm"}
            output["admissions"].append({"id": record["id"], "metadataFrame": metadata_frame, "frame": admission_frame})
            with GeoSpecEngine(work_unit_budget=1_000_000) as engine:
                subject = engine.ingest_subject(data, format=format, coordinate_system=admission_frame["coordinateSystem"], source_unit=admission_frame["sourceUnit"], output_unit=admission_frame["outputUnit"], ingest_options={}, slot="subject")
                row = {
                    "id": record["id"],
                    "artifactSha256": sha256(data).hexdigest(),
                    "artifactBytes": len(data),
                    "subject": {subject.identity_field: subject.identity},
                    "reports": [],
                }
                output["rows"].append(row)
                claims = [
                    ("toHaveVolume", "to_have_volume", {"value": record["expected"]["volume"], "tolerance": 0.000001}),
                    ("toHaveBoundingBox", "to_have_bounding_box", {"size": record["expected"]["boundingBoxSize"], "tolerance": 0.000001}),
                    ("toBeWatertight", "to_be_watertight", None) if format == "glb" else ("toBeValidBrep", "to_be_valid_brep", {"maxTolerance": 0.01}),
                ]
                for matcher, method, expectation in claims:
                    chain = expect_geo(subject, claim_id=f"c2-{record['id']}-{matcher}")
                    report = getattr(chain, method)() if expectation is None else getattr(chain, method)(expectation)
                    row["reports"].append({
                        "matcher": matcher,
                        "expectation": expectation,
                        "canonicalClaim": byte_record(report.canonical_claim_bytes),
                        "canonicalPlan": byte_record(report.canonical_plan_bytes),
                        "canonicalResult": byte_record(report.canonical_result_bytes),
                        "result": dict(report.result),
                    })
                    assert report.result["status"] == "passed"
            assert sha256(path.read_bytes()).hexdigest() == record["artifact"]["sha256"]
    finally:
        Path(os.environ["C2_PYTHON_OUTPUT"]).write_text(json.dumps(output, indent=2) + "\n")
