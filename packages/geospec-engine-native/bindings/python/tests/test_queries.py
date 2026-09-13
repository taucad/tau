"""Ordinary Python transport units; doubles provide no native parity evidence."""
import json
import re
from types import SimpleNamespace
import unittest

from geospec import (
    GeoSpecAssertionError,
    GeoSpecEngine,
    GeoSpecRegex,
    GeoSpecSubject,
    expect_geo,
    query_geo,
)


def encoded(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode()


class Native:
    def __init__(self):
        self.requests = []
        self.initializations = 0
        self.status = "passed"
        self.error = None

    def process_request(self, request):
        self.initializations += 1
        return encoded({"result": {
            "protocolVersion": 3,
            "registryVersion": 5,
            "canonicalProfile": "geospec-jcs-v1",
            "configuration": {"defaultWorkUnitBudget": 12345},
            "capabilities": [
                "analyzeMesh", "analyzeBrep", "inspectGeometry",
                "analyzeMeshOverlap", "queryPmi", "toHaveNoComponentInterference",
            ],
        }})

    def canonical_plan(self, request):
        self.requests.append(json.loads(request))
        if self.error is not None:
            raise self.error
        self.plan = encoded({"plan": self.requests[-1]["plan"]})
        return self.plan

    def evaluate_plan(self, plan):
        claim = json.loads(plan)["plan"]["claims"][0]
        self.result = encoded({"results": [{
            "claimId": claim["claimId"],
            "status": self.status,
            "diagnostics": [{"code": "UNIT_DIAGNOSTIC", "message": "unit result"}],
            "evidence": {"unprojected": {"part_id": 1, "partId": 2}},
        }]})
        return self.result


def subject_and_native():
    native = Native()
    engine = GeoSpecEngine(
        native_engine=native,
        native_module=SimpleNamespace(canonicalize=lambda value: value),
    )
    return GeoSpecSubject(engine, "part", "subjectHash", "a" * 64), native


class QueryTests(unittest.TestCase):
    def test_five_queries_send_raw_payload_and_positive_claim(self):
        subject, native = subject_and_native()
        for capability, payload in (
            ("analyzeMesh", None),
            ("analyzeBrep", None),
            ("inspectGeometry", {"selectors": ["housing.bore"], "evidence": ["bounds"]}),
            ("analyzeMeshOverlap", {"pairs": [{"left": "A", "right": "B"}]}),
            ("queryPmi", {"maxRecords": 7, "maxOutputBytes": 10000}),
        ):
            with self.subTest(capability=capability):
                query_geo(subject, capability, payload, claim_id="chosen")
                self.assertEqual(native.requests[-1], {
                    "method": "submitClaims",
                    "requestId": "python-chosen",
                    "protocolVersion": 3,
                    "registryVersion": 5,
                    "canonicalProfile": "geospec-jcs-v1",
                    "plan": {
                        "subjects": [subject.plan_entry()],
                        "claims": [{
                            "claimId": "chosen",
                            "capability": capability,
                            "subjectSlots": ["part"],
                            "payload": payload,
                            "polarity": "positive",
                            "workUnitBudget": 12345,
                        }],
                    },
                })

    def test_query_returns_complete_report_for_every_result_status(self):
        subject, native = subject_and_native()
        for status in ("passed", "refused", "failed"):
            with self.subTest(status=status):
                native.status = status
                report = query_geo(subject, "analyzeMesh")
                claim = native.requests[-1]["plan"]["claims"][0]
                self.assertEqual(report.canonical_claim_bytes, encoded(claim))
                self.assertEqual(report.canonical_plan_bytes, native.plan)
                self.assertEqual(report.canonical_result_bytes, native.result)
                self.assertEqual(dict(report.claim), claim)
                self.assertEqual(dict(report.result), json.loads(native.result)["results"][0])
                self.assertEqual(report.diagnostics, tuple(report.result["diagnostics"]))
                self.assertEqual(report.passed, status == "passed")

    def test_explicit_query_id_preserves_shared_matcher_sequence(self):
        subject, native = subject_and_native()
        query_geo(subject, "analyzeMesh")
        query_geo(subject, "analyzeBrep", claim_id="chosen")
        expect_geo(subject).to_have_no_component_interference({})
        subject.engine.query(subject, "inspectGeometry", {"selectors": []})
        claims = [request["plan"]["claims"][0] for request in native.requests]
        self.assertEqual(
            [claim["claimId"] for claim in claims],
            ["geospec-claim-1", "chosen", "geospec-claim-2", "geospec-claim-3"],
        )
        self.assertEqual(claims[2]["payload"], {
            "kind": "componentInterference", "arguments": [{}],
        })
        self.assertEqual(native.initializations, 1)

    def test_query_reuses_literal_key_and_explicit_regex_serialization(self):
        subject, native = subject_and_native()
        payload = {
            "selectors": [{"name": GeoSpecRegex("^c[AB]", "i")}],
            "metadata_key": {"part_id": 1, "partId": 2},
        }
        query_geo(subject, "inspectGeometry", payload)
        authored = native.requests[-1]["plan"]["claims"][0]["payload"]
        self.assertEqual(authored, {
            "selectors": [{"name": {"type": "regexp", "pattern": "^c[AB]", "flags": "i"}}],
            "metadata_key": {"part_id": 1, "partId": 2},
        })
        query_geo(subject, "inspectGeometry", authored)
        self.assertEqual(native.requests[-1]["plan"]["claims"][0]["payload"], authored)
        with self.assertRaisesRegex(TypeError, "GeoSpecRegex"):
            query_geo(subject, "inspectGeometry", {"selectors": [re.compile(r"\w")]})

    def test_omitted_payload_is_null_and_core_payload_error_is_unchanged(self):
        subject, native = subject_and_native()
        query_geo(subject, "analyzeMesh")
        self.assertIsNone(native.requests[-1]["plan"]["claims"][0]["payload"])

        class ProtocolError(Exception):
            code = "invalid-claim"

        error = ProtocolError("analyzeMesh payload must be null or omitted.")
        native.error = error
        with self.assertRaises(ProtocolError) as raised:
            query_geo(subject, "analyzeMesh", {})
        self.assertIs(raised.exception, error)
        self.assertEqual(raised.exception.code, "invalid-claim")
        self.assertEqual(str(raised.exception), "analyzeMesh payload must be null or omitted.")
        self.assertEqual(native.requests[-1]["plan"]["claims"][0]["payload"], {})

    def test_matcher_nonpass_still_raises_assertion_error(self):
        subject, native = subject_and_native()
        native.status = "failed"
        with self.assertRaises(GeoSpecAssertionError) as raised:
            expect_geo(subject).to_have_no_component_interference({})
        self.assertEqual(raised.exception.canonical_result_bytes, native.result)
        self.assertEqual(raised.exception.result["status"], "failed")


if __name__ == "__main__":
    unittest.main()
