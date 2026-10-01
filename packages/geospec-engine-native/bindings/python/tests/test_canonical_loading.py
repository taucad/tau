"""Canonical authoring regressions; doubles exercise only host ownership."""

import json
from contextvars import Context, copy_context
from dataclasses import FrozenInstanceError
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch

import geospec
from claim_frame import claim_frame


class HostEngine:
    def __init__(self):
        self.requests = []
        self.released = []
        self.closed = 0
        self.frame = None

    def process_request(self, request):
        return json.dumps({"result": {
            "protocolVersion": 3, "registryVersion": 5,
            "canonicalProfile": "geospec-jcs-v1",
            "configuration": {"defaultWorkUnitBudget": 8_000_000},
            "capabilities": ["toHaveBoundingBox"],
        }}).encode()

    def ingest_subject(self, request, primary, resources):
        self.requests.append((json.loads(request), primary, resources))
        return b'{"result":{"subject":{"subjectHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}}'

    def subject_handle(self, request):
        return b'{"result":{"subjectHandle":{"subjectHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","generation":1}}}'

    def release_subject(self, request):
        self.released.append(json.loads(request))
        return b'{}'

    def evaluate_claim(self, request):
        if self.frame is not None:
            return self.frame
        plan = json.dumps({"plan": json.loads(request)["plan"]}).encode()
        return claim_frame(plan, lambda _: b'{"results":[{"status":"passed","assertionPassed":true}]}')

    def close(self):
        self.closed += 1


class CanonicalLoadingTests(unittest.TestCase):
    def test_injected_engine_does_not_import_extension(self):
        native = HostEngine()
        with patch("importlib.import_module", side_effect=ImportError("extension forbidden")):
            with geospec.GeoSpecEngine(native_engine=native) as engine:
                self.assertEqual(engine.registry_version, 5)
        self.assertEqual(native.closed, 1)

    def test_canonical_load_model_is_exported(self):
        self.assertTrue(callable(getattr(geospec, "load_model", None)))

    def test_short_frame_has_typed_transport_error(self):
        native = HostEngine()
        native.frame = b"short"
        with geospec.GeoSpecEngine(native_engine=native, native_module=object()) as engine:
            subject = engine._subject({"result": {"subject": {"subjectHash": "a" * 64}}}, "subject")
            with self.assertRaises(geospec.GeoSpecAssertionError) as raised:
                geospec.expect_geo(subject).to_have_bounding_box({"size": {"x": 1}})
            self.assertEqual(raised.exception.code, "invalid-response")
            self.assertIn("claim evaluation", str(raised.exception))

    def test_injected_engine_rejects_foreign_thread(self):
        native = HostEngine()
        with geospec.GeoSpecEngine(native_engine=native, native_module=object()) as engine:
            errors = []
            def foreign():
                try:
                    engine._ensure_open()
                except Exception as error:
                    errors.append(error)
            thread = threading.Thread(target=foreign)
            thread.start()
            thread.join()
            self.assertEqual(len(errors), 1)
            self.assertIsInstance(errors[0], RuntimeError)
            self.assertIn("owner thread", str(errors[0]))

    def test_rooted_loading_preserves_resources_units_options_and_per_load_identity(self):
        native = HostEngine()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "part.gltf").write_bytes(b"source-one")
            (root / "mesh.bin").write_bytes(b"mesh-bytes")
            with geospec.GeoSpecEngine(native_engine=native, model_root=directory) as engine:
                first = geospec.load_model(file="part.gltf", format="gltf", source_unit="cm", parameters={"release_train": "v1"}, resources=[{"name": "mesh.bin", "source": "mesh.bin"}])
                request, primary, resources = native.requests[0]
                self.assertEqual(primary, b"source-one")
                self.assertEqual(resources, [b"mesh-bytes"])
                self.assertEqual(request["frame"], {"coordinateSystem": "z-up", "sourceUnit": "cm", "outputUnit": "mm"})
                self.assertEqual(first.provenance["parameters"], {"release_train": "v1"})
                with self.assertRaises(TypeError):
                    first.provenance["parameters"]["release_train"] = "altered"
                with self.assertRaises(FrozenInstanceError):
                    first.identity = "forged"
                self.assertEqual(first.provenance["resources"][0]["name"], "mesh.bin")
                (root / "part.gltf").write_bytes(b"source-two")
                second = geospec.load_model(file="part.gltf", format="gltf")
                self.assertNotEqual(first.provenance["sources"], second.provenance["sources"])
                self.assertEqual(native.requests[1][1], b"source-two")
                first.close()
                second.close()
            self.assertEqual(len(native.released), 1)
            self.assertEqual(native.closed, 1)

    def test_code_host_receives_source_parameters_and_export_options(self):
        native = HostEngine()
        requests = []
        def export(options):
            requests.append(options)
            return geospec.GeoSpecModelArtifact(b"exported", "step", "auto", consumed_sources=(("main.ts", options["code"]["main.ts"].encode()), ("dependency.ts", b"dependency")))
        with tempfile.TemporaryDirectory() as root:
            with geospec.GeoSpecEngine(native_engine=native, model_root=root, model_loader=export):
                subject = geospec.load_model(file="main.ts", code={"main.ts": "model"}, format="step", parameters={"width": 12}, mesh=False, mesh_linear_tolerance=0.1, step_streaming="filesystem", ingest_options={"name": "release_train"})
                self.assertEqual(requests[0]["parameters"], {"width": 12})
                self.assertFalse(requests[0]["mesh"])
                self.assertEqual(requests[0]["mesh_linear_tolerance"], 0.1)
                self.assertEqual(native.requests[0][0]["ingestOptions"], {"name": "release_train"})
                self.assertEqual([item["name"] for item in subject.provenance["sources"]], ["main.ts", "dependency.ts"])

    def test_expired_copied_context_wrong_engine_and_forged_subject_refuse(self):
        native = HostEngine()
        with geospec.GeoSpecEngine(native_engine=native) as engine:
            subject = geospec.load_model(source=b"geometry")
            context = copy_context()
            forged = geospec.GeoSpecSubject(engine, "subject", "subjectHash", subject.identity)
            with self.assertRaises(geospec.GeoSpecAssertionError) as raised:
                geospec.expect_geo(forged).not_.to_have_bounding_box({})
            self.assertEqual(raised.exception.code, "invalid-subject")
            with geospec.GeoSpecEngine(native_engine=HostEngine()) as other:
                with self.assertRaisesRegex(ValueError, "different engine"):
                    other.evaluate(subject, "toHaveBoundingBox", [{}], claim_id=None, polarity="positive")
        with self.assertRaisesRegex(RuntimeError, "closed"):
            context.run(geospec.load_model, source=b"geometry")
        with self.assertRaises(geospec.GeoSpecAssertionError) as raised:
            Context().run(geospec.load_model, source=b"geometry")
        self.assertEqual(raised.exception.code, "GEOSPEC_MODEL_HOST_UNAVAILABLE")

    def test_path_escape_and_unsupported_options_do_not_admit(self):
        native = HostEngine()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "outside").symlink_to(root.parent)
            with geospec.GeoSpecEngine(native_engine=native, model_root=directory):
                for path in ("../escaped.glb", "/escaped.glb", "outside/escaped.glb"):
                    with self.subTest(path=path):
                        with self.assertRaises(geospec.GeoSpecAssertionError) as raised:
                            geospec.load_model(file=path)
                        self.assertEqual(raised.exception.code, "GEOSPEC_MODEL_PATH_OUTSIDE_ROOT")
                with self.assertRaises(geospec.GeoSpecAssertionError) as raised:
                    geospec.load_model(source=b"geometry", mesh=False)
                self.assertEqual(raised.exception.code, "GEOSPEC_MODEL_OPTION_UNSUPPORTED")
                with self.assertRaises(geospec.GeoSpecAssertionError) as raised:
                    geospec.load_model(source=b"geometry", typo=True)
                self.assertEqual(raised.exception.code, "invalid-field")
                with self.assertRaises(geospec.GeoSpecAssertionError) as raised:
                    geospec.load_model(source=b"geometry", resources=[{"name": "mesh.bin", "source": b"resource", "typo": True}])
                self.assertEqual(raised.exception.code, "invalid-field")
        self.assertEqual(native.requests, [])

    def test_initialization_failure_closes_provider_once(self):
        native = HostEngine()
        native.process_request = lambda _: b'{"result":{}}'
        with self.assertRaisesRegex(RuntimeError, "protocolVersion"):
            geospec.GeoSpecEngine(native_engine=native)
        self.assertEqual(native.closed, 1)

    def test_non_evaluated_status_never_passes_even_with_bad_provider_boolean(self):
        for status in ("unsupported", "inconclusive", "error", "cancelled"):
            for polarity in ("positive", "negative"):
                with self.subTest(status=status, polarity=polarity):
                    native = HostEngine()
                    with geospec.GeoSpecEngine(native_engine=native) as engine:
                        subject = geospec.load_model(source=b"geometry")
                        result = json.dumps({"results": [{"status": status, "assertionPassed": True}]}).encode()
                        native.frame = claim_frame(b'{"plan":{"claims":[{}]}}', lambda _: result)
                        assertion = geospec.expect_geo(subject)
                        if polarity == "negative":
                            assertion = assertion.not_
                        with self.assertRaises(geospec.GeoSpecAssertionError) as raised:
                            assertion.to_have_bounding_box({})
                        self.assertEqual(raised.exception.result["status"], status)


if __name__ == "__main__":
    unittest.main()
