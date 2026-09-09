import json
from types import SimpleNamespace
import unittest

from geospec import (
    GeoSpecAssertionError,
    GeoSpecAssertionReport,
    GeoSpecEngine,
    GeoSpecSubject,
    evaluate_geo,
    expect_geo,
)


class FakeNative:
    def __init__(self, status="passed"):
        self.canonical_request = None
        self.returned_plan = None
        self.returned_result = None
        self.status = status

    def process_request(self, request):
        return (
            b'{"requestId":"python-initialize","result":{'
            b'"protocolVersion":3,"registryVersion":4,'
            b'"canonicalProfile":"geospec-jcs-v1","configuration":{'
            b'"defaultWorkUnitBudget":12345},"capabilities":['
            b'{"name":"toSatisfyRationalPlate"},'
            b'{"name":"toSatisfyParallelPlaneDistance"}]}}'
        )

    def canonical_plan(self, request):
        self.canonical_request = request
        authored = json.loads(request)
        self.returned_plan = json.dumps(
            {
                "canonicalProfile": "geospec-jcs-v1",
                "numericProfile": "geospec-st-logical-requests-v2",
                "plan": authored["plan"],
                "protocolVersion": 3,
                "registryVersion": 4,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode()
        return self.returned_plan

    def evaluate_plan(self, plan):
        claim_id = json.loads(plan)["plan"]["claims"][0]["claimId"]
        self.returned_result = json.dumps(
            {
                "results": [
                    {
                        "assertionPassed": self.status == "passed",
                        "claimId": claim_id,
                        "diagnostics": (
                            []
                            if self.status == "passed"
                            else [
                                {
                                    "code": "GEOSPEC_PARALLEL_PLANE_DISTANCE_MISMATCH",
                                    "message": "distance mismatch",
                                    "severity": "error",
                                }
                            ]
                        ),
                        "status": self.status,
                    }
                ]
            },
            separators=(",", ":"),
        ).encode()
        return self.returned_result


def facade(status="passed"):
    native = FakeNative(status)
    engine = GeoSpecEngine(
        native_engine=native,
        native_module=SimpleNamespace(canonicalize=lambda value: value),
    )
    return native, GeoSpecSubject(engine, "part", "subjectHash", "b" * 64)


class F2AuthoringTests(unittest.TestCase):
    def test_fixed_payload_preserves_polarity_ids_budget_and_canonical_bytes(self):
        native, subject = facade()

        cases = (
            ("positive", None, "geospec-claim-1"),
            ("negative", "f2-explicit-negative", "f2-explicit-negative"),
        )
        for polarity, claim_id, expected_claim_id in cases:
            with self.subTest(polarity=polarity):
                assertion = expect_geo(subject, claim_id=claim_id)
                if polarity == "negative":
                    assertion = assertion.not_
                report = assertion.to_satisfy_parallel_plane_distance()
                claim = json.loads(native.canonical_request)["plan"]["claims"][0]

                self.assertIsInstance(report, GeoSpecAssertionReport)
                self.assertEqual(
                    claim,
                    {
                        "claimId": expected_claim_id,
                        "capability": "toSatisfyParallelPlaneDistance",
                        "subjectSlots": ["part"],
                        "payload": {
                            "contract": "geospec.pmi.parallel-plane-distance/v1"
                        },
                        "polarity": polarity,
                        "workUnitBudget": 12_345,
                    },
                )
                self.assertEqual(report.canonical_plan_bytes, native.returned_plan)
                self.assertEqual(report.canonical_result_bytes, native.returned_result)

    def test_fixed_capability_is_nullary_for_direct_evaluation(self):
        _, subject = facade()

        with self.assertRaisesRegex(TypeError, "does not accept arguments"):
            evaluate_geo(
                subject,
                "toSatisfyParallelPlaneDistance",
                {"contract": "replacement"},
            )

    def test_failed_assertion_retains_the_complete_report(self):
        native, subject = facade("failed")

        with self.assertRaises(GeoSpecAssertionError) as caught:
            expect_geo(subject, claim_id="f2-failed").to_satisfy_parallel_plane_distance()

        self.assertEqual(caught.exception.canonical_plan_bytes, native.returned_plan)
        self.assertEqual(caught.exception.canonical_result_bytes, native.returned_result)
        self.assertEqual(caught.exception.report.result["claimId"], "f2-failed")


if __name__ == "__main__":
    unittest.main()
