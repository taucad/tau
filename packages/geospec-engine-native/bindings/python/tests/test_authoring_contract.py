import json
import math
import re
from types import SimpleNamespace
import unittest

from geospec import GeoSpecEngine, GeoSpecRegex, GeoSpecSubject, evaluate_geo, expect_geo


class FakeNative:
    def __init__(self):
        self.canonical_request = None

    def process_request(self, request):
        return (
            b'{"requestId":"python-initialize","result":{'
            b'"protocolVersion":3,"registryVersion":4,'
            b'"canonicalProfile":"geospec-jcs-v1","configuration":{'
            b'"defaultWorkUnitBudget":8000000},"capabilities":['
            b'{"name":"toHaveAuthoringContract"}]}}'
        )

    def canonical_plan(self, request):
        self.canonical_request = request
        authored = json.loads(request)
        return json.dumps(
            {
                "canonicalProfile": "geospec-jcs-v1",
                "numericProfile": "geospec-st-v1",
                "plan": authored["plan"],
                "protocolVersion": 3,
                "registryVersion": 4,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode()

    def evaluate_plan(self, plan):
        return b'{"results":[{"claimId":"unit","diagnostics":[],"status":"passed"}]}'


def facade():
    native = FakeNative()
    engine = GeoSpecEngine(
        native_engine=native,
        native_module=SimpleNamespace(canonicalize=lambda value: value),
    )
    return native, GeoSpecSubject(engine, "subject", "subjectHash", "a" * 64)


def authored_arguments(native):
    request = json.loads(native.canonical_request)
    return request["plan"]["claims"][0]["payload"]["arguments"]


class AuthoringContractTests(unittest.TestCase):
    def test_component_kind_original24_source_spellings(self):
        # Spelling-only unit control: JS matchers.ts and Rust registry.rs.
        # This table is not a host semantics catalog or native parity evidence.
        expected_kinds = {
            "toHaveBoundingBox": "boundingBox",
            "toHaveConnectedComponents": "connectedComponents",
            "toBeWatertight": "watertight",
            "toHaveNoComponentInterference": "componentInterference",
            "toHaveAssemblyOccurrences": "assemblyOccurrences",
            "toHaveSpatialRelationships": "spatialRelationships",
            "toHaveMeshIntegrity": "meshIntegrity",
            "toHaveNoDiagnostics": "noDiagnostics",
            "toHaveSurfaceArea": "surfaceArea",
            "toHaveVolume": "volume",
            "toHaveMass": "mass",
            "toHaveCenterOfMass": "centerOfMass",
            "toBeValidBrep": "validBrep",
            "toHaveTopologyCounts": "topologyCounts",
            "toHaveStepUnits": "stepUnits",
            "toHaveProductStructure": "productStructure",
            "toHavePlanarFace": "planarFace",
            "toHaveCylindricalFace": "cylindricalFace",
            "toHaveCircularHole": "circularHole",
            "toHaveCircularHolePattern": "circularHolePattern",
            "toHaveChamferFeature": "chamferFeature",
            "toHaveFilletFeature": "filletFeature",
            "toHaveMinimumWallThickness": "minimumWallThickness",
            "toHaveVoidContinuity": "voidContinuity",
        }
        native, subject = facade()
        subject.engine.capabilities = tuple(expected_kinds)
        for capability, kind in expected_kinds.items():
            with self.subTest(capability=capability):
                evaluate_geo(subject, capability, {}, claim_id="unit")
                claim = json.loads(native.canonical_request)["plan"]["claims"][0]
                self.assertEqual(claim["capability"], capability)
                self.assertEqual(claim["payload"], {"kind": kind, "arguments": [{}]})

    def test_component_kind_ergonomic_method_preserves_both_polarities(self):
        native, subject = facade()
        subject.engine.capabilities = ("toHaveNoComponentInterference",)
        expected = {"part_id": "snake", "partId": "camel"}
        for polarity in ("positive", "negative"):
            with self.subTest(polarity=polarity):
                assertion = expect_geo(subject, claim_id="unit")
                if polarity == "negative":
                    assertion = assertion.not_
                assertion.to_have_no_component_interference(expected)
                claim = json.loads(native.canonical_request)["plan"]["claims"][0]
                self.assertEqual(claim, {
                    "claimId": "unit",
                    "capability": "toHaveNoComponentInterference",
                    "subjectSlots": ["subject"],
                    "payload": {"kind": "componentInterference", "arguments": [expected]},
                    "polarity": polarity,
                    "workUnitBudget": 8_000_000,
                })

    def test_nested_mapping_keys_are_preserved_exactly(self):
        native, subject = facade()
        authored = {
            "part_id": "snake",
            "partId": "camel",
            "nested_items": [
                {"part_id": "nested-snake", "partId": "nested-camel"}
            ],
        }

        evaluate_geo(subject, "toHaveAuthoringContract", authored, claim_id="unit")

        self.assertEqual(authored_arguments(native), [authored])

    def test_matcher_snake_name_does_not_rewrite_keyword_expectation_keys(self):
        native, subject = facade()

        expect_geo(subject, claim_id="unit").to_have_authoring_contract(
            selector_name={"face_group_id": "front_face"},
            metadata_key="release_train",
        )

        self.assertEqual(
            authored_arguments(native),
            [
                {
                    "selector_name": {"face_group_id": "front_face"},
                    "metadata_key": "release_train",
                }
            ],
        )

    def test_explicit_geospec_regex_has_exact_wire_bytes(self):
        native, subject = facade()

        evaluate_geo(
            subject,
            "toHaveAuthoringContract",
            {"selector": GeoSpecRegex(r"\w", "imsu")},
            claim_id="unit",
        )

        self.assertIn(
            b'"arguments":[{"selector":{"type":"regexp","pattern":"\\\\w",'
            b'"flags":"imsu"}}]',
            native.canonical_request,
        )

    def test_python_compiled_regex_is_refused_with_explicit_direction(self):
        _, subject = facade()

        with self.assertRaisesRegex(TypeError, "GeoSpecRegex"):
            expect_geo(subject).to_have_authoring_contract(
                selector=re.compile(r"\w")
            )

    def test_numeric_conversion_rules_are_unchanged(self):
        native, subject = facade()
        maximum = 9_007_199_254_740_991

        evaluate_geo(
            subject,
            "toHaveAuthoringContract",
            {"maximum": maximum, "finite": 1.25},
            claim_id="unit",
        )
        self.assertEqual(
            authored_arguments(native),
            [{"maximum": maximum, "finite": 1.25}],
        )

        with self.assertRaisesRegex(ValueError, "safe-integer"):
            evaluate_geo(
                subject,
                "toHaveAuthoringContract",
                {"value": maximum + 1},
                claim_id="unit",
            )
        with self.assertRaisesRegex(ValueError, "non-finite"):
            evaluate_geo(
                subject,
                "toHaveAuthoringContract",
                {"value": math.inf},
                claim_id="unit",
            )


if __name__ == "__main__":
    unittest.main()
