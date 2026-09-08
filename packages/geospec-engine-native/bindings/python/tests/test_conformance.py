import hashlib
import json
import sys
from pathlib import Path

import geospec_engine_native
import pytest


CORPUS_PATH = Path(__file__).parents[3] / "conformance" / "early-corpus.json"
CORPUS_BYTES = CORPUS_PATH.read_bytes()
CORPUS = json.loads(CORPUS_BYTES)
MESHES = {mesh["id"]: mesh for mesh in CORPUS["meshes"]}


def input_bytes(record):
    if "inputUtf8" in record:
        return record["inputUtf8"].encode()
    return bytes.fromhex(record["inputHex"])


def setup(record):
    engine = geospec_engine_native.Engine()
    admissions = []
    for mesh_id in record["ingest"]:
        mesh = MESHES[mesh_id]
        actual = engine.ingest_mesh(
            mesh["requestUtf8"].encode(), bytes.fromhex(mesh["meshHex"])
        )
        expected = mesh["expectedUtf8"].encode()
        assert actual == expected, f"{record['id']}: admission {mesh_id} bytes"
        assert json.loads(actual) == json.loads(expected)
        admissions.append(actual.decode())
    return engine, admissions


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
        return

    actual = execute(engine, record)
    expected = record["expectedUtf8"].encode()
    assert actual == expected
    assert json.loads(actual) == json.loads(expected)


if __name__ == "__main__":
    observations = []
    matched = True
    for record in CORPUS["records"]:
        observation = {
            "id": record["id"],
            "operation": record["operation"],
            "expectedUtf8": record.get("expectedUtf8"),
            "expectedCode": record.get("expectedCode"),
        }
        engine, admissions = setup(record)
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
        observation["matched"] = (
            observation["actualUtf8"] == observation["expectedUtf8"]
            and observation["actualCode"] == observation["expectedCode"]
            and (observation["actualCode"] is None or bool(observation["actualMessage"]))
        )
        matched &= observation["matched"]
        observations.append(observation)

    output = json.dumps(
        {
            "corpusSha256": hashlib.sha256(CORPUS_BYTES).hexdigest(),
            "records": observations,
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )
    if len(sys.argv) == 2:
        Path(sys.argv[1]).write_text(output + "\n")
    else:
        print(output)
    raise SystemExit(not matched)
