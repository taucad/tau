import hashlib
import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from test_conformance import CORPUS

from claim_frame import claim_frame
from geospec import (
    GeoSpecAssertionError,
    GeoSpecEngine,
    GeoSpecSubject,
    evaluate_geo,
    expect_geo,
)

MESHES = CORPUS["meshes"]
IDENTITY_PATH = (
    Path(__file__).parents[3] / "conformance" / "subject-identity-instance-v2-controls.json"
)
IDENTITY_BYTES = IDENTITY_PATH.read_bytes()
assert hashlib.sha256(IDENTITY_BYTES).hexdigest() == (
    "d9835326d035508ba095f22697c76650ffa1e25957b78da7683b89a1cb106849"
)
IDENTITY = json.loads(IDENTITY_BYTES)


def record(record_id):
    return next(value for value in CORPUS["records"] if value["id"] == record_id)


def admitted_case(case_id):
    canonical = record(f"plan/a2/{case_id}/canonical")
    evaluated = record(f"plan/a2/{case_id}/evaluate")
    request = json.loads(canonical["inputUtf8"])
    plan = request["plan"]
    claim = plan["claims"][0]
    subject_entry = plan["subjects"][0]
    mesh = next(
        value
        for value in MESHES
        if value["contentHash"] == subject_entry["contentHash"]
    )
    engine = GeoSpecEngine(work_unit_budget=claim["workUnitBudget"])
    subject = engine.ingest_mesh(
        bytes.fromhex(mesh["meshHex"]),
        slot=subject_entry["slot"],
    )
    expected = claim["payload"].get("expected")
    return engine, subject, claim, canonical, evaluated, expected


def test_positive_assertion_retains_exact_native_plan_and_result_bytes():
    _, subject, claim, canonical, evaluated, expected = admitted_case(
        "asymmetric-all-fields"
    )

    report = expect_geo(subject, claim_id=claim["claimId"]).to_have_bounding_box(
        expected
    )

    assert report.passed
    assert report.canonical_plan_bytes == canonical["expectedUtf8"].encode()
    assert report.canonical_result_bytes == evaluated["expectedUtf8"].encode()
    assert json.loads(report.canonical_claim_bytes) == json.loads(
        canonical["expectedUtf8"]
    )["plan"]["claims"][0]


def test_negative_assertion_is_decided_once_by_native_result():
    _, subject, claim, canonical, evaluated, expected = admitted_case(
        "negative-unsatisfied"
    )

    report = expect_geo(subject, claim_id=claim["claimId"]).not_.to_have_bounding_box(
        expected
    )

    assert report.passed
    assert report.canonical_plan_bytes == canonical["expectedUtf8"].encode()
    assert report.canonical_result_bytes == evaluated["expectedUtf8"].encode()


def test_failed_negative_raises_with_complete_canonical_evidence():
    _, subject, claim, canonical, evaluated, expected = admitted_case(
        "negative-satisfied"
    )

    with pytest.raises(GeoSpecAssertionError) as raised:
        expect_geo(subject, claim_id=claim["claimId"]).not_.to_have_bounding_box(
            expected
        )

    error = raised.value
    assert error.report is not None
    assert error.canonical_plan_bytes == canonical["expectedUtf8"].encode()
    assert error.canonical_result_bytes == evaluated["expectedUtf8"].encode()
    assert error.result["status"] == "failed"
    assert error.diagnostics


def test_refusal_and_malformed_inputs_cannot_pass_a_negative_assertion():
    engine, subject, _, _, _, expected = admitted_case("negative-unsatisfied")
    missing = GeoSpecSubject(
        engine,
        "missing",
        subject.identity_field,
        "0" * 64,
    )

    with pytest.raises(GeoSpecAssertionError) as refused:
        expect_geo(missing).not_.to_have_bounding_box(expected)
    assert refused.value.protocol_error is not None
    assert refused.value.code == "invalid-claim"

    with pytest.raises(GeoSpecAssertionError) as malformed:
        expect_geo(subject).not_.to_have_bounding_box(size={"x": float("nan")})
    assert malformed.value.report is None


def test_evaluate_geo_returns_a_report_without_asserting():
    _, subject, claim, _, _, expected = admitted_case("all-axis-failure-order")

    report = evaluate_geo(
        subject,
        claim["capability"],
        expected,
        claim_id=claim["claimId"],
        polarity=claim["polarity"],
    )

    assert not report.passed
    assert report.result["status"] == "failed"


def test_safe_integer_boundary_is_enforced_before_json_rounding():
    _, subject, _, _, _, _ = admitted_case("asymmetric-all-fields")

    with pytest.raises(GeoSpecAssertionError) as raised:
        expect_geo(subject).to_have_bounding_box(size={"x": 9_007_199_254_740_992})

    assert isinstance(raised.value.protocol_error, ValueError)


def test_pytest_fixture_uses_the_same_native_engine(geospec_engine):
    assert "toHaveBoundingBox" in geospec_engine.capabilities
    assert len(geospec_engine.capabilities) == 31


@pytest.mark.parametrize("ingest_options", [None, {"name": "assembly.part#0"}])
def test_binary_subject_transport_keeps_geometry_out_of_json_and_preserves_order(
    ingest_options,
):
    primary = b'{"asset":{"version":"2.0"}}'
    first = b"resource-one-payload"
    second = b"resource-two-payload"

    class Native:
        def process_request(self, request):
            return json.dumps(
                {
                    "requestId": "python-initialize",
                    "result": {
                        "protocolVersion": 3,
                        "registryVersion": 4,
                        "canonicalProfile": "geospec-jcs-v1",
                        "configuration": {"defaultWorkUnitBudget": 8_000_000},
                        "capabilities": [{"name": "toHaveBoundingBox"}],
                    },
                },
                separators=(",", ":"),
            ).encode()

        def ingest_subject(self, request, supplied_primary, supplied_resources):
            parsed = json.loads(request)
            assert supplied_primary is primary
            assert supplied_resources[0] is first
            assert supplied_resources[1] is second
            assert parsed == {
                "method": "ingestSubject",
                "requestId": "python-ingest-part",
                "protocolVersion": 3,
                "registryVersion": 4,
                "canonicalProfile": "geospec-jcs-v1",
                "format": "gltf",
                "frame": {
                    "coordinateSystem": "z-up",
                    "sourceUnit": "mm",
                    "outputUnit": "mm",
                },
                "ingestOptions": {} if ingest_options is None else ingest_options,
                "primaryByteLength": len(primary),
                "resources": [
                    {"name": "a.bin", "byteLength": len(first)},
                    {"name": "b.bin", "byteLength": len(second)},
                ],
            }
            assert "asset" not in request.decode()
            assert "resource-one-payload" not in request.decode()
            assert "resource-two-payload" not in request.decode()
            return (
                b'{"requestId":"python-ingest-part","result":{"subject":'
                b'{"subjectHash":"abc","format":"gltf"}}}'
            )

    native = Native()
    engine = GeoSpecEngine(
        native_engine=native,
        native_module=object(),
    )

    subject = engine.ingest_subject(
        primary,
        format="gltf",
        coordinate_system="z-up",
        source_unit="mm",
        output_unit="mm",
        ingest_options=ingest_options,
        resources=(("a.bin", first), ("b.bin", second)),
        slot="part",
    )

    assert subject.identity_field == "subjectHash"
    assert subject.identity == "abc"
    assert engine.configuration["defaultWorkUnitBudget"] == 8_000_000


def test_engine_default_budget_is_emitted_explicitly_without_host_lowering():
    class Native:
        def process_request(self, request):
            return (
                b'{"requestId":"python-initialize","result":{'
                b'"protocolVersion":3,"registryVersion":4,'
                b'"canonicalProfile":"geospec-jcs-v1","configuration":{'
                b'"defaultWorkUnitBudget":8000000},"capabilities":['
                b'{"name":"toHaveBoundingBox"}]}}'
            )

        def evaluate_claim(self, request):
            return claim_frame(self.canonical_plan(request), self.evaluate_plan)

        def canonical_plan(self, request):
            authored = json.loads(request)
            claim = authored["plan"]["claims"][0]
            assert claim["workUnitBudget"] == 8_000_000
            assert claim["payload"] == {
                "kind": "boundingBox",
                "arguments": [{"size": {"x": 1}}],
            }
            return json.dumps(
                {
                    "canonicalProfile": "geospec-jcs-v1",
                    "numericProfile": "geospec-st-v1",
                    "plan": authored["plan"],
                    "protocolVersion": 3,
                    "registryVersion": 4,
                },
                separators=(",", ":"),
            ).encode()

        def evaluate_plan(self, plan):
            return (
                b'{"results":[{"claimId":"budget","diagnostics":[],'
                b'"status":"passed"}]}'
            )

    native = Native()
    engine = GeoSpecEngine(
        native_engine=native,
        native_module=SimpleNamespace(),
    )
    subject = GeoSpecSubject(engine, "subject", "subjectHash", "a" * 64)

    report = evaluate_geo(
        subject,
        "toHaveBoundingBox",
        {"size": {"x": 1}},
        claim_id="budget",
    )

    assert report.passed


@pytest.mark.parametrize("row_id", ["A-scale1", "A-scale10", "B-scale1", "B-scale10"])
def test_actual_runtime_admits_resource_backed_gltf_with_independent_identity(row_id):
    row = next(value for value in IDENTITY["rows"] if value["id"] == row_id)
    source_unit = "cm" if row_id.endswith("scale10") else "mm"
    engine = GeoSpecEngine(work_unit_budget=8_000_000)

    subject = engine.ingest_subject(
        IDENTITY["primaryUtf8"].encode(),
        format="gltf",
        coordinate_system="z-up",
        source_unit=source_unit,
        output_unit="mm",
        resources=(("mesh.bin", bytes.fromhex(row["resourceHex"])),),
        slot="part",
    )

    assert subject.identity_field == "subjectHash"
    assert subject.identity == row["subjectHash"]
    assert json.dumps(subject.plan_entry(), separators=(",", ":")) == row[
        "planSubjectUtf8"
    ]


@pytest.mark.parametrize(
    "control", IDENTITY["orderControls"], ids=lambda value: value["id"]
)
def test_unconsumed_resource_order_does_not_change_actual_subject_identity(control):
    row = next(value for value in IDENTITY["rows"] if value["id"] == "A-scale1")
    available = {
        "mesh.bin": bytes.fromhex(row["resourceHex"]),
        "unused.bin": bytes.fromhex(control["unusedHex"]),
    }
    engine = GeoSpecEngine(work_unit_budget=8_000_000)

    subject = engine.ingest_subject(
        IDENTITY["primaryUtf8"].encode(),
        format="gltf",
        coordinate_system="z-up",
        source_unit="mm",
        output_unit="mm",
        resources=tuple((name, available[name]) for name in control["bundleOrder"]),
        slot="part",
    )

    # The frozen order control carries the historical v1 hash; the v2 row
    # independently binds the same resource closure under the current profile.
    assert subject.identity == row["subjectHash"]
