from __future__ import annotations

import enum
import io
import json
import math
import os
import runpy
import struct
import sys
import tempfile
import threading
import types
import unittest
from pathlib import Path
from typing import Any
from unittest.mock import patch

PYTHON_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PYTHON_ROOT))

import numpy
import smlibpy
import smlibpy.parts
from smlibpy import Box, Circle, Cylinder, Line, Mesh, Part, Polyline, Rectangle, Sphere, Torus, load, tessellate

import worker
from tau_kernel.protocol import Artifacts, WorkerContext

MODEL = """from dataclasses import dataclass
from smlibpy import Box

@dataclass(frozen=True)
class Params:
    width: float = 2.0

def main(params: Params):
    return Box(params.width, 3, 4)
"""

ASSEMBLY = """from dataclasses import dataclass
from smlibpy import Box, Cylinder

@dataclass(frozen=True)
class Params:
    angle: float = 30.0

def main(params: Params):
    return [
        {"shape": Box(10, 10, 2).named("Base"), "color": "#336699", "metalness": 0.2},
        {"shape": Cylinder(2, 8).named("Pin"), "material": {"pbrMetallicRoughness": {"baseColorFactor": [1, 1, 1, 1]}}},
    ]

def mechanism(params: Params):
    return {"links": [{"name": "Base"}, {"name": "Pin"}], "angle": params.angle}
"""

TEXTURED = """from dataclasses import dataclass
from smlibpy import Box

@dataclass(frozen=True)
class Params:
    size: float = 4.0

def main(params: Params):
    return {
        "shapes": [{"shape": Box(params.size, params.size, 1), "material": {"pbrMetallicRoughness": {"baseColorTexture": {"index": 0}}}}],
        "images": [{"mimeType": "image/png", "data": b"\\x89PNG"}],
        "textures": [{"source": 0}],
        "samplers": [{"magFilter": 9729}],
    }
"""

MESHES = """from dataclasses import dataclass
from smlibpy import Line, Sphere, tessellate

@dataclass(frozen=True)
class Params:
    radius: float = 3.0

def main(params: Params):
    return [tessellate(Sphere(params.radius), 0.1, 15), Line((0, 0, 0), (1, 0, 0))]
"""


def compute_config() -> dict[str, Any]:
    return {
        "namespace": "smlibpy.operation.v1",
        "producer": {"id": "@taucad/smlibpy-test", "version": "test@1", "implementationAssets": [f"sha256:{'a' * 64}"]},
        "environment": {"platform": "test", "lengthUnit": "millimeter"},
    }


def read_bundle(path: Path) -> tuple[dict[str, Any], bytes]:
    data = path.read_bytes()
    assert data[:8] == worker.BUNDLE_MAGIC
    (length,) = struct.unpack("<I", data[8:12])
    return json.loads(data[12 : 12 + length]), data[12 + length :]


class Workspace:
    def __init__(self, files: dict[str, str]) -> None:
        self.directory = tempfile.TemporaryDirectory(prefix="tau-smlibpy-test-")
        root = Path(self.directory.name)
        self.workspace = root / "workspace"
        self.artifacts = root / "artifacts"
        self.workspace.mkdir()
        self.artifacts.mkdir()
        for name, text in files.items():
            (self.workspace / name).write_text(text)
        self.cancelled = threading.Event()
        self.worker = worker.Worker(WorkerContext(self.workspace.resolve(), Artifacts(self.artifacts), self.cancelled))

    def __enter__(self) -> Workspace:
        return self

    def __exit__(self, *_: object) -> None:
        self.directory.cleanup()

    def dispatch(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        return self.worker.dispatch(method, params)


class Color(enum.Enum):
    RED = "red"


class ComputeValueTest(unittest.TestCase):
    def test_canonical_values_and_bypasses(self) -> None:
        self.assertEqual(
            worker._compute_value([None, True, 3, "a", 0.0, -0.0, 2.0, 2.5, (1,), Color.RED]),
            [None, True, 3, "a", 0, 0, 2, 2.5, [1], "red"],
        )
        for value in (math.inf, object()):
            with self.subTest(value=value), self.assertRaises(worker._ComputeBypass):
                worker._compute_value(value)

    def test_implementation_values(self) -> None:
        code = compile("x = 1", "<test>", "exec")
        value = worker._implementation_value([None, 1, {"a": {2}}, code, object])
        self.assertEqual(value[:2], ["None", "1"])
        self.assertEqual(value[2], {"'a'": [["2"]][0]})
        self.assertIn("code", value[3])
        self.assertEqual(value[4], repr(object))
        with self.assertRaises(worker._ComputeBypass):
            worker._callable_fingerprint(len)
        self.assertRegex(worker._callable_fingerprint(smlibpy.parts.Box), r"^sha256:")


class CodecTest(unittest.TestCase):
    def test_smb_round_trip_and_refusal(self) -> None:
        part = Box(1, 2, 3)
        data = worker._smb_bytes(part)
        self.assertEqual(data, worker._smb_bytes(Box(1, 2, 3)))
        restored = worker._part_from_smb(data)
        self.assertIsInstance(restored, Part)
        self.assertAlmostEqual(restored.volume, 6.0, places=6)
        with patch("smlibpy.load", return_value=Rectangle(1, 1)), self.assertRaisesRegex(ValueError, "valid solid"):
            worker._part_from_smb(data)
        copy = worker._copy(part)
        self.assertIsNot(copy, part)
        self.assertEqual(worker._estimate_compute_bytes(part), worker.COMPUTE_BASE_CHARGE_BYTES + 6 * 512)


class ComputeCacheTest(unittest.TestCase):
    def test_lru_eviction_clear_and_stats(self) -> None:
        cache = worker._ComputeCache()
        self.assertIsNone(cache.get("missing"))
        cache.put("a", Box(1, 1, 1), {"operation": "Box"}, 10)
        cache.put("a", Box(1, 1, 1), {"operation": "Box"}, 10)
        cache.put("b", Box(2, 2, 2), {"operation": "Box"}, 10)
        self.assertIsInstance(cache.get("a"), Part)
        with patch.object(worker, "MAX_COMPUTE_RESIDENT_BYTES", 25):
            cache.put("c", Box(3, 3, 3), {"operation": "Box"}, 10)
        self.assertEqual(list(cache.residents), ["a", "c"])
        self.assertEqual(cache.stats(), {"entries": 2, "logicalBytes": 20, "evictions": 1, "omissions": 0})
        cache.clear(4)
        self.assertEqual((cache.generation, cache.stats()["entries"], cache.logical_bytes), (4, 0, 0))


class ComputeAdapterTest(unittest.TestCase):
    def test_refuses_invalid_configuration(self) -> None:
        cache = worker._ComputeCache()
        with self.assertRaisesRegex(TypeError, "must be an object"):
            worker._ComputeAdapter(cache, [])
        with self.assertRaisesRegex(TypeError, "identity is invalid"):
            worker._ComputeAdapter(cache, {"namespace": 1, "producer": {}})

    def test_reuses_primitives_and_restores_them(self) -> None:
        cache = worker._ComputeCache()
        original = smlibpy.Box
        with patch.object(worker, "COMPUTE_ADMISSION_FLOOR", -1.0):
            with worker._ComputeAdapter(cache, compute_config()) as adapter:
                self.assertIsNot(smlibpy.Box, original)
                first = smlibpy.Box(1, 2, 3)
                second = smlibpy.parts.Box(1, 2, 3)
                # A numpy scalar is outside the canonical allow-list, so the call is not reused.
                bypassed = smlibpy.Box(1, 2, numpy.float64(3))
                with self.assertRaises(TypeError):
                    smlibpy.Sphere()  # No radius: the signature does not bind, and the original raises.
        self.assertIs(smlibpy.Box, original)
        self.assertIsNotNone(bypassed)
        self.assertEqual(adapter.hits, 1)
        self.assertEqual(len(adapter.announcements), 1)
        self.assertAlmostEqual(first.volume, second.volume)

    def test_skips_fast_operations_and_honours_cancellation(self) -> None:
        cache = worker._ComputeCache()
        with patch.object(worker, "COMPUTE_ADMISSION_FLOOR", math.inf):
            with worker._ComputeAdapter(cache, compute_config()) as adapter:
                smlibpy.Box(1, 1, 1)
        self.assertEqual((adapter.announcements, cache.stats()["entries"]), ([], 0))
        cancelled = threading.Event()
        cancelled.set()
        with worker._ComputeAdapter(cache, compute_config(), cancelled), self.assertRaises(worker._ComputeCancelled):
            smlibpy.Box(1, 1, 1)


class GeometryTest(unittest.TestCase):
    def test_bounding_diagonal(self) -> None:
        self.assertEqual(worker._bounding_diagonal([]), 0.0)
        self.assertAlmostEqual(worker._bounding_diagonal([{"shape": Box(3, 4, 0.0001)}]), 5.0, places=3)

    def test_face_runs(self) -> None:
        box = Box(1, 1, 1)
        mesh = tessellate(box, 0.1, 15)
        owners = worker._face_runs(box, mesh)
        self.assertEqual(sorted(set(owners.tolist())), list(range(6)))
        face = box.faces()[0]
        self.assertIsNone(worker._face_runs(face, tessellate(face, 0.1, 15)))
        # Polygon owners that do not cover the triangles mean one group, not a misassigned face.
        self.assertIsNone(worker._face_runs(box, types.SimpleNamespace(_poly=mesh._poly, triangles=mesh.triangles[:-1])))

    def test_surface_falls_back_to_face_meshes_for_an_open_body_mesh(self) -> None:
        torus = Torus(10, 2).translate(3, 4, 5)
        mesh, owners, triangles = worker._surface(torus, 0.05, 15)
        self.assertEqual(worker._open_edges([mesh]), 0)
        self.assertEqual(len(owners), len(triangles))
        with patch.object(worker, "_open_edges", side_effect=[3, 3, 3]):
            mesh, _, _ = worker._surface(torus, 0.05, 15)
        self.assertGreater(len(mesh.triangles), 0)
        sphere = tessellate(Sphere(2), 0.1, 15)
        self.assertEqual(worker._surface(sphere, 0.1, 15)[1], None)
        _, sketch_owners, _ = worker._surface(Rectangle(2, 1), 0.1, 15)
        self.assertIsNotNone(sketch_owners)

    def test_face_arrays(self) -> None:
        bare = Mesh([(0, 0, 0), (1, 0, 0), (0, 1, 0)], [(0, 1, 2)])
        arrays = worker._face_arrays(bare, None)
        self.assertEqual(arrays["faceGroups"], [{"start": 0, "count": 3, "faceId": 0}])
        numpy.testing.assert_allclose(arrays["normals"], [(0, 0, 1)] * 3)
        empty = worker._face_arrays(Mesh(numpy.zeros((0, 3)), numpy.zeros((0, 3), dtype=int)), None)
        self.assertEqual((len(empty["vertices"]), len(empty["triangles"]), empty["faceGroups"]), (0, 0, []))
        box = Box(1, 1, 1)
        mesh = tessellate(box, 0.1, 15)
        grouped = worker._face_arrays(mesh, worker._face_runs(box, mesh))
        self.assertEqual(len(grouped["faceGroups"]), 6)
        self.assertEqual(len(grouped["vertices"]), 24)

    def test_edge_polylines(self) -> None:
        self.assertEqual(worker._edge_polylines(tessellate(Sphere(1), 0.1, 15), 15), [])
        [(_, line)] = worker._edge_polylines(Line((0, 0, 0), (2, 0, 0)), 15)
        self.assertEqual(len(line), 2)
        [(_, circle)] = worker._edge_polylines(Circle(3).edges()[0], 15)
        self.assertEqual(len(circle), worker.CURVE_SAMPLES + 1)
        self.assertEqual(len(worker._edge_polylines(Polyline((0, 0, 0), (1, 0, 0), (1, 1, 0)), 15)), 2)
        self.assertEqual(len(worker._edge_polylines(Box(1, 1, 1).faces()[0], 15)), 4)
        cylinder = worker._edge_polylines(Cylinder(1, 2), 15)
        self.assertEqual(len(cylinder), 2, "the lateral face's seam is left out")
        empty = worker._edge_arrays([])
        self.assertEqual((len(empty["lines"]), empty["edgeGroups"]), (0, []))
        arrays = worker._edge_arrays([(4, numpy.array([(0, 0, 0), (1, 0, 0), (1, 1, 0)]))])
        self.assertEqual(arrays["edgeGroups"], [{"start": 0, "count": 12, "edgeId": 4}])

    def test_bundle_pads_slices(self) -> None:
        bundle = worker._Bundle()
        self.assertEqual(bundle.add(b"abc"), [0, 3])
        self.assertEqual(bundle.floats([1.0]), [4, 4])
        self.assertEqual(bundle.indices([7]), [8, 4])
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bundle.bin"
            bundle.write(path, {"a": "é"})
            header, body = read_bundle(path)
        self.assertEqual(header, {"a": "é"})
        self.assertEqual(len(body), 12)

    def test_exportable(self) -> None:
        face = Box(1, 1, 1).faces()[0]
        bodies = worker._exportable(
            [
                {"shape": Box(1, 1, 1), "name": None},
                {"shape": face, "name": "Sheet", "color": "#ff0000"},
                {"shape": tessellate(Sphere(1), 0.1, 15), "name": None},
                {"shape": Line((0, 0, 0), (1, 0, 0)), "name": None},
            ]
        )
        self.assertEqual([body.name for body in bodies], ["Shape 1", "Sheet"])
        self.assertEqual(bodies[1].color, "#ff0000")


class WorkerTest(unittest.TestCase):
    def test_analyze_build_mesh_measure_release(self) -> None:
        with Workspace({"main.py": ASSEMBLY}) as space:
            analysis = space.dispatch("analyze", {"entryPath": "main.py"})
            self.assertEqual(analysis["defaultParameters"], {"angle": 30.0})
            built = space.dispatch("build", {"entryPath": "main.py", "parameters": {"angle": 45}})
            self.assertNotIn("compute", built)
            handle = built["handleId"]
            self.assertGreater(space.dispatch("measure", {"handleId": handle})["diagonal"], 10)
            refused = space.dispatch(
                "mesh", {"handleId": handle, "linearTolerance": 0.1, "angularTolerance": 15, "maxTriangles": 1}
            )
            self.assertNotIn("artifactPath", refused)
            self.assertGreater(refused["triangles"], 1)
            meshed = space.dispatch("mesh", {"handleId": handle, "linearTolerance": 0.1, "angularTolerance": 15})
            header, body = read_bundle(Path(meshed["artifactPath"]))
            self.assertEqual(len(body) + len(json.dumps(header)) > 0, True)
            base, pin = header["shapes"]
            self.assertEqual((base["name"], base["color"], base["metalness"]), ("Base", "#336699", 0.2))
            self.assertIn("material", pin)
            self.assertEqual(header["mechanism"]["angle"], 45)
            self.assertEqual(len(base["faces"]["faceGroups"]), 6)
            self.assertGreater(len(base["edges"]["edgeGroups"]), 0)
            bare = space.dispatch(
                "mesh", {"handleId": handle, "linearTolerance": 0.1, "angularTolerance": 15, "edges": False}
            )
            bare_header, _ = read_bundle(Path(bare["artifactPath"]))
            self.assertEqual(bare_header["shapes"][0]["edges"]["edgeGroups"], [])
            self.assertEqual(space.dispatch("release", {"handleId": handle}), {})

    def test_meshes_resources_and_curves(self) -> None:
        with Workspace({"main.py": TEXTURED, "meshes.py": MESHES}) as space:
            handle = space.dispatch("build", {"entryPath": "main.py"})["handleId"]
            meshed = space.dispatch("mesh", {"handleId": handle, "linearTolerance": 0.1, "angularTolerance": 15})
            header, body = read_bundle(Path(meshed["artifactPath"]))
            image = header["images"][0]
            self.assertEqual(body[image["data"][0] : image["data"][0] + image["data"][1]], b"\x89PNG")
            self.assertEqual((header["textures"], header["samplers"]), ([{"source": 0}], [{"magFilter": 9729}]))
            self.assertNotIn("mechanism", header)
            handle = space.dispatch("build", {"entryPath": "meshes.py"})["handleId"]
            meshed = space.dispatch("mesh", {"handleId": handle, "linearTolerance": 0.1, "angularTolerance": 15})
            header, _ = read_bundle(Path(meshed["artifactPath"]))
            sphere, line = header["shapes"]
            self.assertEqual(sphere["edges"]["edgeGroups"], [])
            self.assertEqual(line["faces"]["triangles"], [0, 0])
            self.assertEqual(len(line["edges"]["edgeGroups"]), 1)
            with self.assertRaisesRegex(ValueError, "no exact bodies"):
                space.dispatch("export", {"handleId": handle, "format": "step"})

    def test_exports(self) -> None:
        with Workspace({"main.py": ASSEMBLY, "empty.py": MODEL.replace("return Box(params.width, 3, 4)", "return None")}) as space:
            handle = space.dispatch("build", {"entryPath": "main.py"})["handleId"]
            step = space.dispatch("export", {"handleId": handle, "format": "step", "coordinateSystem": "y-up"})
            text = Path(step["artifactPath"]).read_text()
            self.assertIn("Base", text)
            self.assertIn("ISO-10303-21", text)
            stl = space.dispatch(
                "export",
                {"handleId": handle, "format": "stl", "linearTolerance": 0.1, "angularTolerance": 15, "binary": False},
            )
            self.assertTrue(Path(stl["artifactPath"]).read_text().startswith("solid"))
            binary = space.dispatch(
                "export", {"handleId": handle, "format": "stl", "linearTolerance": 0.1, "angularTolerance": 15}
            )
            self.assertEqual(binary["byteLength"], Path(binary["artifactPath"]).stat().st_size)
            with self.assertRaisesRegex(ValueError, "Unsupported SMLibPy export format"):
                space.dispatch("export", {"handleId": handle, "format": "obj"})
            empty = space.dispatch("build", {"entryPath": "empty.py"})["handleId"]
            with self.assertRaisesRegex(ValueError, "returned no shapes"):
                space.dispatch("export", {"handleId": empty, "format": "step"})
            self.assertEqual(space.dispatch("measure", {"handleId": empty}), {"diagonal": 0.0})

    def test_invalid_solids_are_refused(self) -> None:
        with Workspace({"main.py": MODEL}) as space:
            with patch.object(Part, "is_valid", return_value=False), self.assertRaisesRegex(ValueError, "invalid solid"):
                space.dispatch("build", {"entryPath": "main.py"})

    def test_compute_reuse_round_trip(self) -> None:
        with Workspace({"main.py": MODEL}) as space, patch.object(worker, "COMPUTE_ADMISSION_FLOOR", -1.0):
            built = space.dispatch("build", {"entryPath": "main.py", "compute": compute_config()})
            [announcement] = built["compute"]["announcements"]
            digest = announcement["actionDigest"]
            warm = space.dispatch("build", {"entryPath": "main.py", "compute": compute_config()})
            self.assertEqual(warm["compute"]["hits"], 1)
            missing = f"sha256:{'b' * 64}"
            exported = space.dispatch("compute.export", {"digests": [digest, missing]})
            self.assertEqual(exported["omitted"], [missing])
            self.assertEqual(space.dispatch("compute.export", {"digests": [missing]}), {"descriptors": [], "omitted": [missing]})
            with self.assertRaisesRegex(ValueError, "export digests are invalid"):
                space.dispatch("compute.export", {"digests": ["nope"]})
            payload = Path(exported["bundle"]["artifactPath"]).read_bytes()
            descriptor = exported["descriptors"][0]
            self.assertEqual(space.dispatch("compute.clear", {"generation": 2}), {"generation": 2})
            with self.assertRaisesRegex(ValueError, "clear generation is invalid"):
                space.dispatch("compute.clear", {"generation": "2"})

            def stage(data: bytes) -> dict[str, Any]:
                path = space.artifacts / "warm.bin"
                path.write_bytes(data)
                return {"artifactPath": str(path), "byteLength": len(data)}

            imported = space.dispatch("compute.import", {"descriptors": [descriptor], "bundle": stage(payload)})
            self.assertEqual(imported, {"imported": [digest], "omitted": []})
            self.assertEqual(space.dispatch("compute.stats", {})["entries"], 1)
            tampered = {**descriptor, "contentDigest": f"sha256:{'c' * 64}"}
            self.assertEqual(
                space.dispatch("compute.import", {"descriptors": [tampered], "bundle": stage(payload)})["omitted"], [digest]
            )
            with patch.object(worker, "_part_from_smb", side_effect=ValueError("corrupt")):
                result = space.dispatch("compute.import", {"descriptors": [descriptor], "bundle": stage(payload)})
            self.assertEqual(result["omitted"], [digest])
            self.assertEqual(space.dispatch("compute.stats", {})["omissions"], 1)
            for descriptors, message in (
                ("x", "descriptors are invalid"),
                (["x"], "descriptor is invalid"),
                ([{**descriptor, "byteLength": len(payload) + 1}], "descriptor is invalid"),
            ):
                with self.subTest(message=message), self.assertRaisesRegex(ValueError, message):
                    space.dispatch("compute.import", {"descriptors": descriptors, "bundle": stage(payload)})
            with self.assertRaisesRegex(ValueError, "trailing bytes"):
                space.dispatch("compute.import", {"descriptors": [], "bundle": stage(payload)})

    def test_shutdown_and_unknown_methods(self) -> None:
        with Workspace({"main.py": MODEL}) as space:
            space.dispatch("build", {"entryPath": "main.py"})
            self.assertEqual(space.dispatch("shutdown", {}), {"shutdown": True})
            with self.assertRaisesRegex(ValueError, "Unknown protocol method"):
                space.dispatch("nope", {})

    def test_module_entrypoint(self) -> None:
        with tempfile.TemporaryDirectory(prefix="tau-smlibpy-") as directory:
            root = Path(directory)
            workspace = root / "workspace"
            artifacts = root / "artifacts"
            stdin = types.SimpleNamespace(
                buffer=io.BytesIO(
                    json.dumps({"protocolVersion": 1, "requestId": "end", "method": "shutdown", "params": {}}).encode()
                    + b"\n"
                )
            )
            protocol = io.StringIO()
            redirected = io.StringIO()
            argv = ["worker.py", "--workspace", str(workspace), "--artifacts", str(artifacts), "--parent-pid", str(os.getppid())]
            with (
                patch.object(sys, "argv", argv),
                patch.object(sys, "stdin", stdin),
                patch("os.dup", side_effect=[10, 11]),
                patch("os.dup2"),
                patch("os.fdopen", side_effect=[protocol, redirected]),
            ):
                runpy.run_path(worker.__file__, run_name="__main__")
            self.assertIn('"type":"ready"', protocol.getvalue())


if __name__ == "__main__":
    unittest.main()
