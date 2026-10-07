import hashlib
import json
import sys
from pathlib import Path

import geospec_engine_native
import pytest


CORPUS_PATH = Path(__file__).parents[3] / "conformance" / "early-corpus.json"
CORPUS_BYTES = CORPUS_PATH.read_bytes()
PROFILE_PATH = Path(__file__).parents[3] / "rust/tests/fixtures/current-profile-01/plan-corpus.json"
PROFILE_BYTES = PROFILE_PATH.read_bytes()
NUMERIC_PROFILE_PATH = Path(__file__).parents[3] / "rust/tests/fixtures/current-profile-v6/numeric-profile.txt"
V3_NUMERIC_PROFILE_FIELD = '"numericProfile":"geospec-st-logical-requests-v3"'
STRING_AXIS_IDS = {
    "a2/invalid-claim/string-axis",
    "plan/invalid-claim/string-axis/canonical",
    "plan/invalid-claim/string-axis/evaluate",
}
BBOX_REPAIR_IDS = {
    f"{prefix}{case}{suffix}"
    for prefix, suffix in (("a2/raw/", ""), ("plan/a2/", "/evaluate"))
    for case in ("all-axis-failure-order", "tolerance-outside", "default-tolerance-outside", "zero-tolerance")
}


def project_material_repair(record_id, text):
    if record_id not in BBOX_REPAIR_IDS:
        return text
    old = "Correct the model dimensions, or widen the declared bounding-box tolerance."
    approved = "Correct the model dimensions to match the declared bounds; preserve the authored tolerance."
    parsed = json.loads(text)
    results = parsed["results"] if record_id.startswith("plan/") else parsed["result"]["results"]
    diagnostics = [d for r in results for d in r["diagnostics"]]
    assert sum(d["code"] == "GEOSPEC_BOUNDING_BOX_MISMATCH" and d.get("suggestion") == old for d in diagnostics) == 1
    assert text.count(json.dumps(old)) == 1
    return text.replace(json.dumps(old), json.dumps(approved))


def project_numeric_profile(text, successor):
    return text.replace(
        V3_NUMERIC_PROFILE_FIELD, f'"numericProfile":"{successor}"'
    )


def load_current_corpus(binding_profile="core-only"):
    """Join accepted fixture bytes by ID; never derive expectations from native output."""
    original_hash = "3d43750d055dceec2b7d57c92d4a953c4f7dcd40c2abb1452a82de83ea729476"
    profile_hash = "eb8b42f1591fd2bd695228cdaa3abc4108b411717c468a9e97b724654616221d"
    digest = lambda data: hashlib.sha256(data).hexdigest()
    assert binding_profile in ("core-only", "full-backend")
    assert digest(CORPUS_BYTES) == original_hash
    assert digest(PROFILE_BYTES) == profile_hash
    successor_bytes = NUMERIC_PROFILE_PATH.read_bytes()
    assert digest(successor_bytes) == "c36f2296878e3daa57cc0cdfe8c86dac3b77ed80d6ddbd60de68b31a64bba5f7"
    successor = successor_bytes.decode("utf-8").removesuffix("\n")
    assert successor == "geospec-demand-v6"
    original, profile = json.loads(CORPUS_BYTES), json.loads(PROFILE_BYTES)
    assert original["schemaVersion"] == profile["schemaVersion"] == 1
    assert profile["authority"]["adoptedRuling"] == "W2.C-CURRENT-PROFILE-CONFORMANCE-01"
    assert profile["authority"]["originalCorpusSha256"] == original_hash
    bindings = {row["id"]: row for row in profile["records"]}
    mesh_bindings = {row["id"]: row for row in profile["meshes"]}
    assert len(original["records"]) == len(profile["records"]) == len(bindings) == 320
    assert len(original["meshes"]) == len(profile["meshes"]) == len(mesh_bindings) == 4
    assert {row["id"] for row in original["records"]} == bindings.keys()
    assert {row["id"] for row in original["meshes"]} == mesh_bindings.keys()
    meshes = []
    for mesh in original["meshes"]:
        bound = mesh_bindings[mesh["id"]]
        assert digest(mesh["requestUtf8"].encode()) == bound["originalRequestSha256"]
        assert digest(bound["effectiveRequestUtf8"].encode()) == bound["effectiveRequestSha256"]
        assert digest(bytes.fromhex(mesh["meshHex"])) == mesh["contentHash"] == bound["meshContentHash"]
        meshes.append({**mesh, "requestUtf8": bound["effectiveRequestUtf8"], "expectedUtf8": bound["expectedUtf8"]})
    records = []
    for record in original["records"]:
        bound = bindings[record["id"]]
        assert (bound["operation"], bound["ingest"]) == (record["operation"], record["ingest"])
        source = record["inputUtf8"].encode() if "inputUtf8" in record else bytes.fromhex(record["inputHex"])
        effective = bound["effectiveInputUtf8"].encode() if "effectiveInputUtf8" in bound else bytes.fromhex(bound["effectiveInputHex"])
        assert digest(source) == bound["originalInputSha256"]
        assert digest(effective) == bound["effectiveInputSha256"]
        if bound.get("preservesOriginalBytes"):
            assert effective == source
        joined = {key: value for key, value in record.items() if key not in ("inputUtf8", "inputHex", "expectedUtf8", "expectedCode", "expectedMessage")}
        for key in ("inputUtf8", "inputHex"):
            if "effective" + key[0].upper() + key[1:] in bound:
                joined[key] = bound["effective" + key[0].upper() + key[1:]]
        for key in ("expectedUtf8", "expectedCode", "expectedMessage"):
            if key in bound:
                joined[key] = bound[key]
        if "inputUtf8" in joined:
            joined["inputUtf8"] = project_numeric_profile(joined["inputUtf8"], successor)
        if "expectedUtf8" in joined:
            joined["expectedUtf8"] = project_numeric_profile(project_material_repair(joined["id"], joined["expectedUtf8"]), successor)
        if record["id"] in STRING_AXIS_IDS:
            assert joined["expectedMessage"] == "bounding-box axes must be a finite number."
            joined["expectedMessage"] = "GeoSpec numeric expectation must be an object."
        if binding_profile == "full-backend" and record["id"] == "a1/raw/initialize":
            # Runtime create_engine always supplies OCCT and Manifold. Preserve other bytes.
            core_backends = '"backends":{"brep":false,"csg":false}'
            assert joined["expectedUtf8"].count(core_backends) == 1
            joined["expectedUtf8"] = joined["expectedUtf8"].replace(
                core_backends, '"backends":{"brep":true,"csg":true}'
            )
            capability_end = '],"configuration":'
            minimum_capability = '{"implementation":"implemented","name":"minimumDistance","profile":"geospec-minimum-distance-v1","qualification":"unqualified","registryVersion":5,"scope":"declared-subject-profile"}'
            capabilities = json.loads(joined["expectedUtf8"])["result"]["capabilities"]
            assert joined["expectedUtf8"].count(capability_end) == 1
            assert capabilities[-1]["name"] == "queryPmi"
            assert all(capability["name"] != "minimumDistance" for capability in capabilities)
            joined["expectedUtf8"] = joined["expectedUtf8"].replace(
                capability_end, ',' + minimum_capability + capability_end
            )
        # Same fresh-admission rule as rust/tests/plan_conformance.rs.
        if not record["ingest"] and record["operation"] in ("evaluatePlan", "processRequest") and (
            "expectedUtf8" in record or record["id"] == "plan/unavailable/analyzeBrep/evaluatePlan"
        ):
            joined["ingest"] = [original["meshes"][0]["id"]]
        records.append(joined)
    return {**original, "meshes": meshes, "records": records, "bindingProfile": binding_profile}


CORPUS = load_current_corpus("full-backend")
MESHES = {mesh["id"]: mesh for mesh in CORPUS["meshes"]}
MATERIAL_PATH = Path(__file__).parents[3] / "conformance" / "material-v6.json"
MATERIAL_BYTES = MATERIAL_PATH.read_bytes()
MATERIAL_SHA256 = "45b98aa9bdc83b0846e74837e5891f4d9c7c7a51b6488db2ae23e8ccbe833975"


def load_material_corpus():
    assert hashlib.sha256(MATERIAL_BYTES).hexdigest() == MATERIAL_SHA256
    corpus = json.loads(MATERIAL_BYTES)
    assert corpus["schemaVersion"] == 1
    assert corpus["authority"]["id"] == "material-v6-01"
    assert corpus["authority"]["numericProfile"] == "geospec-demand-v6"
    assert len(corpus["records"]) == len({r["id"] for r in corpus["records"]}) == 46
    assert len(corpus["meshes"]) == len({m["id"] for m in corpus["meshes"]}) == 20
    for mesh in corpus["meshes"]:
        assert mesh["admission"] == "subject" and "meshHex" not in mesh
        primary = bytes.fromhex(mesh["primaryHex"])
        assert len(primary) == mesh["primaryByteLength"]
        assert hashlib.sha256(primary).hexdigest() == mesh["primarySha256"] == mesh["contentHash"]
        assert hashlib.sha256(mesh["requestUtf8"].encode()).hexdigest() == mesh["requestSha256"]
        for resource in mesh["resources"]:
            raw = bytes.fromhex(resource["hex"])
            assert len(raw) == resource["byteLength"]
            assert hashlib.sha256(raw).hexdigest() == resource["sha256"]
    return corpus


MATERIAL = load_material_corpus()
MATERIAL_MESHES = {mesh["id"]: mesh for mesh in MATERIAL["meshes"]}


def test_full_backend_binding_preserves_every_other_frozen_expectation():
    core = load_current_corpus("core-only")
    full = load_current_corpus("full-backend")
    assert full["meshes"] == core["meshes"]
    assert full["equivalentCanonicalGroups"] == core["equivalentCanonicalGroups"]
    assert len(full["records"]) == len(core["records"]) == 320
    changed = 0
    for baseline, row in zip(core["records"], full["records"], strict=True):
        if row["id"] != "a1/raw/initialize":
            assert row == baseline
            continue
        changed += 1
        expected = json.loads(row["expectedUtf8"])
        capability = expected["result"]["capabilities"][-1]
        assert capability == {
            "implementation": "implemented", "name": "minimumDistance",
            "profile": "geospec-minimum-distance-v1", "qualification": "unqualified",
            "registryVersion": 5, "scope": "declared-subject-profile",
        }
        assert sum(item["name"] == "minimumDistance" for item in expected["result"]["capabilities"]) == 1
        restored = row["expectedUtf8"].replace(
            ',' + json.dumps(capability, separators=(',', ':')), ''
        ).replace('"backends":{"brep":true,"csg":true}', '"backends":{"brep":false,"csg":false}')
        assert restored == baseline["expectedUtf8"]
        assert {**row, "expectedUtf8": restored} == baseline
    assert changed == 1
    assert hashlib.sha256(CORPUS_BYTES).hexdigest() == "3d43750d055dceec2b7d57c92d4a953c4f7dcd40c2abb1452a82de83ea729476"
    assert hashlib.sha256(PROFILE_BYTES).hexdigest() == "eb8b42f1591fd2bd695228cdaa3abc4108b411717c468a9e97b724654616221d"


def input_bytes(record):
    if "inputUtf8" in record:
        return record["inputUtf8"].encode()
    return bytes.fromhex(record["inputHex"])


def setup(record, meshes=MESHES):
    engine = geospec_engine_native.Engine()
    admissions = []
    try:
        for mesh_id in record["ingest"]:
            mesh = meshes[mesh_id]
            if mesh.get("admission") == "subject":
                actual = engine.ingest_subject(mesh["requestUtf8"].encode(), bytes.fromhex(mesh["primaryHex"]),
                                               [bytes.fromhex(r["hex"]) for r in mesh["resources"]])
            else:
                actual = engine.ingest_mesh(
                    mesh["requestUtf8"].encode(), bytes.fromhex(mesh["meshHex"])
                )
            expected = mesh["expectedUtf8"].encode()
            assert actual == expected, f"{record['id']}: admission {mesh_id} bytes"
            assert json.loads(actual) == json.loads(expected)
            admissions.append(actual.decode())
    except BaseException:
        engine.close()
        raise
    return engine, admissions


def test_execution_permits_fail_before_cache_open():
    with pytest.raises(ValueError, match="Execution permits must be a positive integer"):
        geospec_engine_native.Engine(execution_permits=0)
    with pytest.raises(ValueError, match="Execution permits must be a positive integer"):
        geospec_engine_native.Engine(
            cache_root="/missing/cache",
            project_root="/missing/project",
            execution_permits=1.5,
        )
    engine = geospec_engine_native.Engine(execution_permits=1)
    engine.close()


def execute(engine, record):
    source = input_bytes(record)
    match record["operation"]:
        case "canonicalize":
            actual = geospec_engine_native.canonicalize(source)
        case "ingestMesh":
            actual = engine.ingest_mesh(source, bytes.fromhex(record["meshHex"]))
        case "processRequest":
            actual = engine.process_request(source)
        case "canonicalPlan":
            actual = engine.canonical_plan(source)
        case "evaluatePlan":
            actual = engine.evaluate_plan(source)
        case operation:
            raise AssertionError(f"unknown corpus operation: {operation}")
    return actual


@pytest.mark.parametrize("record", CORPUS["records"], ids=lambda record: record["id"])
def test_early_byte_facade(record):
    assert CORPUS["schemaVersion"] == 1
    assert (
        hashlib.sha256(CORPUS_BYTES).hexdigest()
        == "3d43750d055dceec2b7d57c92d4a953c4f7dcd40c2abb1452a82de83ea729476"
    )

    engine, _ = setup(record)
    if "expectedCode" in record:
        with pytest.raises(geospec_engine_native.ProtocolError) as raised:
            execute(engine, record)
        assert raised.value.code == record["expectedCode"]
        assert str(raised.value)
        if "expectedMessage" in record:
            assert str(raised.value) == record["expectedMessage"]
        return

    actual = execute(engine, record)
    expected = record["expectedUtf8"].encode()
    assert actual == expected
    assert json.loads(actual) == json.loads(expected)


@pytest.mark.parametrize("record", MATERIAL["records"], ids=lambda record: record["id"])
def test_material_v6_byte_facade(record):
    engine, _ = setup(record, MATERIAL_MESHES)
    try:
        actual = execute(engine, record)
        expected = record["expectedUtf8"].encode()
        assert actual == expected
        assert json.loads(actual) == json.loads(expected)
    finally:
        engine.close()


if __name__ == "__main__":
    material = "--material" in sys.argv
    selected_corpus = MATERIAL if material else CORPUS
    selected_meshes = MATERIAL_MESHES if material else MESHES
    observations = []
    matched = True
    for record in selected_corpus["records"]:
        observation = {
            "id": record["id"],
            "operation": record["operation"],
            "expectedUtf8": record.get("expectedUtf8"),
            "expectedCode": record.get("expectedCode"),
        }
        engine, admissions = setup(record, selected_meshes)
        try:
            actual = execute(engine, record)
            observation.update(
                admissions=admissions,
                actualUtf8=actual.decode(),
                actualCode=None,
                actualMessage=None,
            )
        except geospec_engine_native.ProtocolError as error:
            observation.update(
                admissions=admissions,
                actualUtf8=None,
                actualCode=error.code,
                actualMessage=str(error),
            )
        finally:
            engine.close()
        observation["matched"] = (
            observation["actualUtf8"] == observation["expectedUtf8"]
            and observation["actualCode"] == observation["expectedCode"]
            and (observation["actualCode"] is None or bool(observation["actualMessage"]))
            and ("expectedMessage" not in record or observation["actualMessage"] == record["expectedMessage"])
        )
        matched &= observation["matched"]
        observations.append(observation)

    output = json.dumps(
        {
            "corpusSha256": MATERIAL_SHA256 if material else hashlib.sha256(CORPUS_BYTES).hexdigest(),
            "currentProfileSha256": None if material else hashlib.sha256(PROFILE_BYTES).hexdigest(),
            "bindingProfile": "full-backend",
            "suite": "material" if material else "early",
            "records": observations,
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )
    output_paths = [arg for arg in sys.argv[1:] if arg != "--material"]
    if len(output_paths) == 1:
        Path(output_paths[0]).write_text(output + "\n")
    else:
        print(output)
    raise SystemExit(not matched)
