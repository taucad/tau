"""Compare retained ordinary C2 conformance records without invoking native code."""

from hashlib import sha256
import json
from pathlib import Path
import sys

manifest_path, node_path, py313_path, py314_path, output_path = map(Path, sys.argv[1:])
manifest = json.loads(manifest_path.read_bytes())
routes = [json.loads(path.read_bytes()) for path in (node_path, py313_path, py314_path)]
expected_ids = ["baseline", "comment", "dimension", "revert"]
for route in routes:
    assert route["exportManifestSha256"] == sha256(manifest_path.read_bytes()).hexdigest()
    assert [row["id"] for row in route["rows"]] == expected_ids

rows = []
measured = {}
for index, record in enumerate(manifest["records"]):
    peers = [route["rows"][index] for route in routes]
    reference = peers[0]
    if manifest.get("format") == "glb":
        expected_size = {"x": 14 if record["id"] == "dimension" else 10, "y": 20, "z": 30}
        assert record["expected"] == {"volume": expected_size["x"] * 20 * 30, "boundingBoxSize": expected_size}
        metadata_frame = {"coordinateSystem": "z-up", "lengthUnit": "millimeter", "sourceUnit": "mm"}
        admission_frame = {"coordinateSystem": "z-up", "sourceUnit": "mm", "outputUnit": "mm"}
        assert record["frame"] == metadata_frame
        for route, peer in zip(routes, peers, strict=True):
            admission = route["admissions"][index]
            assert admission["id"] == record["id"]
            assert admission["metadataFrame"] == metadata_frame
            assert [report["matcher"] for report in peer["reports"]] == ["toHaveVolume", "toHaveBoundingBox", "toBeWatertight"]
            if "request" in admission:
                for key in ("request", "response"):
                    assert sha256(admission[key]["utf8"].encode()).hexdigest() == admission[key]["sha256"]
                request = json.loads(admission["request"]["utf8"])
                response = json.loads(admission["response"]["utf8"])
                assert request["format"] == "glb" and request["frame"] == admission_frame
                admitted = response["result"]["subject"]
                assert {"subjectHash": admitted["subjectHash"]} == peer["subject"]
                assert admitted["descriptor"]["frame"] == {**admission_frame, "uniformScale": 1}
                assert admitted["descriptor"]["primary"] == {"byteLength": record["artifact"]["byteLength"], "sha256": record["artifact"]["sha256"]}
            else:
                assert admission["frame"] == admission_frame
    assert len(reference["reports"]) == 3
    for peer in peers:
        assert peer["artifactSha256"] == record["artifact"]["sha256"]
        assert peer["artifactBytes"] == record["artifact"]["byteLength"]
        assert peer["subject"] == reference["subject"]
        assert len(peer["reports"]) == len(reference["reports"])
        for actual, expected in zip(peer["reports"], reference["reports"], strict=True):
            assert actual["matcher"] == expected["matcher"]
            assert actual["result"]["status"] == "passed"
            assert actual["result"]["evidence"]["subjectContentHash"] == record["artifact"]["sha256"]
            for key in ("canonicalClaim", "canonicalPlan", "canonicalResult"):
                assert actual[key] == expected[key]
                assert sha256(actual[key]["utf8"].encode()).hexdigest() == actual[key]["sha256"]
    measured[record["id"]] = {report["matcher"]: report["result"]["evidence"]["measured"] for report in reference["reports"]}
    rows.append({"id": record["id"], "artifactSha256": record["artifact"]["sha256"], "subject": reference["subject"], "canonicalClaimPlanResultEqual": True, "measured": measured[record["id"]]})

assert measured["baseline"] == measured["comment"] == measured["revert"]
assert measured["baseline"]["toHaveVolume"] == 6000
assert measured["dimension"]["toHaveVolume"] == 8400
assert measured["dimension"]["toHaveBoundingBox"] != measured["baseline"]["toHaveBoundingBox"]
source_files = {record["id"]: record["source"]["files"] for record in manifest["records"]}
assert source_files["baseline"] == source_files["revert"]
assert source_files["baseline"] != source_files["comment"]
assert source_files["baseline"] != source_files["dimension"]
summary = {"status": "passed", "routes": [route["route"] for route in routes], "claimsPerRoute": 12, "rows": rows, "baselineCommentRevertMeasuredEqual": True, "dimensionMeasuredDistinct": True, "baselineRevertSourceIdentityEqual": True, "baselineRevertArtifactBytesEqual": manifest["records"][0]["artifact"]["sha256"] == manifest["records"][3]["artifact"]["sha256"], "limitation": manifest["runtime"]["limitation"]}
if manifest.get("format") == "glb":
    subjects = {row["id"]: row["subject"] for row in rows}
    assert subjects["baseline"] == subjects["comment"] == subjects["revert"]
    assert subjects["dimension"] != subjects["baseline"]
    assert all(row["measured"]["toBeWatertight"]["watertight"] for row in rows)
    summary.update({"format": "glb", "metadataFrame": metadata_frame, "nativeAdmissionFrame": {**admission_frame, "uniformScale": 1}, "baselineCommentRevertNativeIdentityEqual": True, "dimensionNativeIdentityDistinct": True, "watertightAllStates": True})
output_path.write_text(json.dumps(summary, indent=2) + "\n")
print(json.dumps({"status": "passed", "artifacts": len(rows), "claimsPerRoute": 12, "canonicalEquality": True, "baselineCommentRevertMeasuredEqual": True, "dimensionMeasuredDistinct": True}))
