import json
from types import SimpleNamespace
import unittest

from claim_frame import claim_frame
from geospec import (
    GeoSpecAssertionReport,
    GeoSpecEngine,
    GeoSpecSubject,
    evaluate_geo,
    expect_geo,
)


class FakeNative:
    def __init__(self):
        self.canonical_request = None

    def process_request(self, request):
        return (
            b'{"requestId":"python-initialize","result":{'
            b'"protocolVersion":3,"registryVersion":4,'
            b'"canonicalProfile":"geospec-jcs-v1","configuration":{'
            b'"defaultWorkUnitBudget":10000},"capabilities":['
            b'{"name":"toSatisfyRationalPlate"}]}}'
        )

    def evaluate_claim(self, request):
        return claim_frame(self.canonical_plan(request), self.evaluate_plan)

    def canonical_plan(self, request):
        self.canonical_request = request
        authored = json.loads(request)
        return json.dumps(
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

    def evaluate_plan(self, plan):
        claim_id = json.loads(plan)["plan"]["claims"][0]["claimId"]
        return json.dumps(
            {
                "results": [
                    {
                        "assertionPassed": True,
                        "claimId": claim_id,
                        "diagnostics": [],
                        "status": "passed",
                    }
                ]
            },
            separators=(",", ":"),
        ).encode()


def facade():
    native = FakeNative()
    engine = GeoSpecEngine(
        native_engine=native,
        native_module=SimpleNamespace(),
    )
    return native, engine._subject({"result": {"subject": {"subjectHash": "a" * 64}}}, "part")


class F1AuthoringTests(unittest.TestCase):
    def test_fixed_payload_preserves_id_budget_and_both_polarities(self):
        native, subject = facade()

        for polarity in ("positive", "negative"):
            with self.subTest(polarity=polarity):
                assertion = expect_geo(subject, claim_id=f"f1-target-{polarity}")
                if polarity == "negative":
                    assertion = assertion.not_
                report = assertion.to_satisfy_rational_plate()
                claim = json.loads(native.canonical_request)["plan"]["claims"][0]

                self.assertIsInstance(report, GeoSpecAssertionReport)
                self.assertEqual(
                    claim,
                    {
                        "claimId": f"f1-target-{polarity}",
                        "capability": "toSatisfyRationalPlate",
                        "subjectSlots": ["part"],
                        "payload": {"contract": "geospec.plate-two-windows/v1"},
                        "polarity": polarity,
                        "workUnitBudget": 10_000,
                    },
                )

    def test_fixed_capability_is_nullary_for_direct_evaluation(self):
        _, subject = facade()

        with self.assertRaisesRegex(TypeError, "does not accept arguments"):
            evaluate_geo(
                subject,
                "toSatisfyRationalPlate",
                {"contract": "replacement"},
            )


if __name__ == "__main__":
    unittest.main()
