from __future__ import annotations

import inspect
import io
import json
import os
import runpy
import sys
import tempfile
import threading
import types
import unittest
import uuid
from pathlib import Path
from unittest.mock import MagicMock, PropertyMock, patch

PYTHON_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PYTHON_ROOT))

import worker
from tau_kernel import glb
from tau_kernel.protocol import Artifacts, WorkerContext


def make_worker(root: Path, artifacts: Path) -> worker.Worker:
    return worker.Worker(WorkerContext(root.resolve(), Artifacts(artifacts), threading.Event()))


MODEL = """from dataclasses import dataclass
from build123d import Box

@dataclass(frozen=True)
class Params:
    width: float = 2.0

def main(params: Params):
    return Box(params.width, 3, 4)
"""


HELPER_MODEL = """from dataclasses import dataclass
from build123d import Box

import helper

@dataclass(frozen=True)
class Params:
    depth: float = 3.0

def main(params: Params):
    return Box(helper.WIDTH, params.depth, 4)
"""


CUT_MODEL = """from dataclasses import dataclass
from build123d import Box, Cylinder

@dataclass(frozen=True)
class Params:
    radius: float = 2.0

def main(params: Params):
    return Box(10, 10, 10) - Cylinder(params.radius, 12)
"""


def compute_config() -> dict[str, object]:
    return {
        "namespace": "build123d.operation.v1",
        "producer": {
            "id": "@taucad/build123d-test",
            "version": "test@1",
            "implementationAssets": [f"sha256:{'a' * 64}"],
        },
        "environment": {"platform": "test", "lengthUnit": "millimeter"},
    }


class WorkerTest(unittest.TestCase):
    def test_load_model_success_and_contract_errors(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            entry = root / "main.py"
            entry.write_text(MODEL, encoding="utf-8")
            shapes, observed = worker._load_model(root, "main.py", {"width": 5})
            self.assertEqual(len(shapes), 1)
            self.assertEqual(shapes[0].label, "Shape 1")
            self.assertIn("main.py", observed)

            for empty in ("return None", "return []"):
                entry.write_text(MODEL.replace("return Box(params.width, 3, 4)", empty), encoding="utf-8")
                self.assertEqual(worker._load_model(root, "main.py", {})[0], ())

            cases = (
                (MODEL.replace("return Box(params.width, 3, 4)", "return 1"), "Shape"),
                (MODEL.replace("def main", "async def main"), "Async"),
                (MODEL.replace("def main(params: Params):", "not_main = 1\ndef other(params: Params):"), "callable main"),
                (MODEL.replace("@dataclass(frozen=True)", "@dataclass"), "frozen"),
            )
            for source, message in cases:
                entry.write_text(source, encoding="utf-8")
                with self.subTest(message=message), self.assertRaisesRegex(Exception, message):
                    worker._load_model(root, "main.py", {})

            import build123d

            entry.write_text(MODEL, encoding="utf-8")
            with patch.object(build123d.Shape, "is_valid", new_callable=PropertyMock, return_value=False), self.assertRaisesRegex(
                ValueError, "invalid shape"
            ):
                worker._load_model(root, "main.py", {})
            entry.write_text(
                MODEL.replace(
                    "return Box(params.width, 3, 4)",
                    "left = Box(1, 1, 1); right = Box(2, 1, 1); left.label = 'left'; right.label = 'right'; return [left, right]",
                ),
                encoding="utf-8",
            )
            self.assertEqual([shape.label for shape in worker._load_model(root, "main.py", {})[0]], ["left", "right"])

    def test_duplicate_root_labels_have_distinct_stable_occurrence_ids(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            entry = root / "main.py"
            entry.write_text(MODEL.replace("return Box(params.width, 3, 4)",
                "from build123d import Compound; left = Box(1, 1, 1); right = Box(1, 1, 1); left.label = right.label = 'same'; return Compound(children=[left, right])"))
            declarations = []
            shapes, _ = worker._load_model(root, "main.py", {}, motion=declarations.append)
            components, meshes = worker._topology(shapes, 0.1, 0.1)
            worker.project_mechanism(shapes, components, declarations[0], meshes=meshes)
            self.assertEqual([item["name"] for item in components[1:]], ["same", "same"])
            self.assertEqual([item["id"] for item in components[1:]], ["occurrence:path/0/0", "occurrence:path/0/1"])
            self.assertEqual(set(meshes), {"occurrence:path/0/0", "occurrence:path/0/1"})

    def test_motion_hook_is_evaluated_with_the_native_model(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            entry = root / "main.py"
            entry.write_text(MODEL + "\ndef motion(model): return {'ground': model}\n")
            captured = []
            shapes, _ = worker._load_model(root, "main.py", {}, motion=captured.append)
            self.assertIs(captured[0]["ground"], shapes[0])
            entry.write_text(MODEL + "\nmotion = 42\n")
            with self.assertRaisesRegex(TypeError, "motion must be a callable"):
                worker._load_model(root, "main.py", {}, motion=captured.append)

    def test_geometry_helpers_and_worker_dispatch(self) -> None:
        from build123d import Axis, Box, Compound, Cylinder, Sphere
        import OCP.BRepMesh

        self.assertEqual(worker._component_id("Shape 1", "fallback"), "fallback")
        self.assertEqual(worker._component_id("À Fancy Part", "fallback"), "component:a-fancy-part")
        self.assertEqual(worker._component_id("!!!", "fallback"), "fallback")
        point = types.SimpleNamespace(X=1000, Y=2000, Z=3000)
        self.assertEqual(worker._point(point), (1.0, 3.0, -2.0))

        left = Box(1, 2, 3)
        left.label = "Part"
        right = Box(1, 1, 1)
        right.label = "Part"
        assembly = Compound(children=[left, right])
        assembly.label = "Assembly"
        curved = Cylinder(1, 2)
        curved.label = "Curved"
        components, meshes = worker._topology((assembly, curved), 0.05, 0.1)
        for shape in (Box(1, 2, 3), Cylinder(1, 2), Sphere(1).rotate(Axis.X, 37)):
            mesh = worker._mesh_shape(shape, 0.05, 0.1)
            self.assertEqual(len(mesh["positions"]), len(mesh["normals"]))
            self.assertEqual(len(mesh["uvs"]) * 3, len(mesh["positions"]) * 2)
            self.assertEqual(len(mesh["faceGroups"]), len(shape.faces()))
            self.assertEqual(len(mesh["edgeGroups"]), len(shape.edges()))
            self.assertEqual(sum(group["count"] for group in mesh["faceGroups"]), len(mesh["indices"]))
            self.assertTrue(all(0 <= index < len(mesh["positions"]) // 3 for index in mesh["indices"]))
        self.assertEqual(components[0]["kind"], "assembly")
        self.assertEqual(components[1]["id"], "component:part")
        self.assertEqual(components[2]["id"], "component:part#2")
        self.assertEqual(set(meshes), {"component:part", "component:part#2", "component:curved"})

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            artifacts = root / "artifacts"
            artifacts.mkdir()
            (root / "main.py").write_text(MODEL, encoding="utf-8")
            runtime = make_worker(root, artifacts)
            analysis = runtime.dispatch("analyze", {"entryPath": "main.py"})
            self.assertEqual(analysis["defaultParameters"], {"width": 2.0})
            built = runtime.dispatch("build", {"entryPath": "main.py", "parameters": {"width": 4}})
            handle = built["handleId"]
            mesh_result = runtime.dispatch(
                "mesh", {"handleId": handle, "linearTolerance": 0.05, "angularTolerance": 20}
            )
            self.assertTrue(Path(mesh_result["artifactPath"]).is_file())
            export_result = runtime.dispatch("export", {"handleId": handle, "format": "step"})
            step_path = Path(export_result["artifactPath"])
            self.assertTrue(step_path.read_bytes().startswith(b"ISO-10303-21;"))
            from build123d import import_step

            reimported = import_step(step_path)
            self.assertTrue(reimported.is_valid)
            self.assertAlmostEqual(reimported.volume, 48.0)
            self.assertEqual(tuple(reimported.bounding_box().size), (4.0, 3.0, 4.0))
            self.assertGreater(len(reimported.tessellate(0.05, 0.1)[0]), 0)

            counter = root / "execution-count.txt"
            (root / "main.py").write_text(
                MODEL.replace(
                    "return Box(params.width, 3, 4)",
                    "from pathlib import Path\n    counter = Path(__file__).with_name('execution-count.txt')\n"
                    "    count = int(counter.read_text()) + 1 if counter.exists() else 1\n"
                    "    counter.write_text(str(count))\n    return Box(params.width, 3, 4)",
                ),
                encoding="utf-8",
            )
            retained = runtime.dispatch(
                "build", {"entryPath": "main.py", "parameters": {}, "compute": compute_config()}
            )["handleId"]
            runtime.dispatch("mesh", {"handleId": retained, "linearTolerance": 0.05, "angularTolerance": 20})
            runtime.dispatch("export", {"handleId": retained, "format": "step"})
            self.assertEqual(counter.read_text(encoding="utf-8"), "1")
            with self.assertRaisesRegex(ValueError, "Unsupported"):
                runtime.dispatch("export", {"handleId": handle, "format": "stl"})
            import build123d

            with patch.object(build123d, "export_step", return_value=False), self.assertRaisesRegex(RuntimeError, "failed"):
                runtime.dispatch("export", {"handleId": handle, "format": "step"})
            runtime.handles["empty"] = ()
            empty_mesh = runtime.dispatch("mesh", {"handleId": "empty", "linearTolerance": 0.05, "angularTolerance": 20})
            glb.validate_glb(Path(empty_mesh["artifactPath"]).read_bytes())
            with self.assertRaisesRegex(ValueError, "no shapes"):
                runtime.dispatch("export", {"handleId": "empty", "format": "step"})
            self.assertEqual(runtime.dispatch("release", {"handleId": handle}), {})
            self.assertEqual(runtime.dispatch("shutdown", {}), {"shutdown": True})
            with self.assertRaisesRegex(ValueError, "Unknown"):
                runtime.dispatch("other", {})
            while len(runtime.handles) < worker.MAX_HANDLES:
                runtime.handles.retain(())
            with self.assertRaisesRegex(RuntimeError, "limit"):
                runtime.dispatch("build", {"entryPath": "main.py", "parameters": {}, "compute": compute_config()})

    def test_native_compound_copies_keep_exactly_34_leaf_occurrences(self) -> None:
        from copy import copy
        from build123d import Box, Compound, Location
        template = Box(1, 2, 3)
        children = [copy(template).moved(Location((index * 2, 0, 0))) for index in range(34)]
        model = Compound(label="Planetary parts", children=children)
        for authored in (model, copy(model)):
            self.assertEqual(len(authored.solids()), 34)
            components, meshes = worker._topology((authored,), 0.1, 0.1)
            self.assertEqual(len(components), 35)
            self.assertEqual(len(meshes), 34)
            self.assertEqual(len(components[0]["childIds"]), 34)

    def test_mesh_tolerances_do_not_change_a_retained_shape(self) -> None:
        from build123d import Cylinder

        retained = Cylinder(1, 2)
        exact_before = worker._brep_bytes(retained)
        fine = worker._mesh_shape(retained, 0.05, 0.1)
        coarse = worker._mesh_shape(retained, 0.25, 0.5)
        fine_again = worker._mesh_shape(retained, 0.05, 0.1)
        fresh_coarse = worker._mesh_shape(Cylinder(1, 2), 0.25, 0.5)

        self.assertTrue(fine_again == fine, "fine A changed after coarse B")
        self.assertTrue(coarse == fresh_coarse, "coarse B differs from a fresh shape")
        self.assertEqual(worker._brep_bytes(retained), exact_before, "render changed the exact BRep")

    def test_mesh_is_absolute_in_millimetres_and_degrees(self) -> None:
        """I4: OCCT meshes in absolute mode; the protocol's degrees reach OCCT as radians."""
        import math

        from build123d import Box, Pos, Sphere
        import OCP.BRepMesh

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            artifacts = root / "artifacts"
            artifacts.mkdir()
            runtime = make_worker(root, artifacts)
            runtime.handles["small"] = (Sphere(5),)
            runtime.handles["large"] = (Sphere(500),)
            runtime.handles["empty"] = ()
            runtime.handles["pair"] = (Box(10, 10, 10), Pos(10, 0, 0) * Box(10, 10, 10))

            self.assertAlmostEqual(runtime.dispatch("measure", {"handleId": "small"})["diagonal"], math.sqrt(300), places=6)
            self.assertAlmostEqual(runtime.dispatch("measure", {"handleId": "large"})["diagonal"], math.sqrt(3) * 1000, places=3)
            self.assertEqual(runtime.dispatch("measure", {"handleId": "empty"}), {"diagonal": 0.0})
            self.assertAlmostEqual(runtime.dispatch("measure", {"handleId": "pair"})["diagonal"], math.sqrt(600), places=6)

            with patch.object(
                OCP.BRepMesh,
                "BRepMesh_IncrementalMesh",
                wraps=OCP.BRepMesh.BRepMesh_IncrementalMesh,
            ) as mesher:
                small = runtime.dispatch("mesh", {"handleId": "small", "linearTolerance": 0.05, "angularTolerance": 20})
            _shape, linear, relative, angular, parallel = mesher.call_args.args
            self.assertEqual((linear, relative, parallel), (0.05, False, True))
            self.assertAlmostEqual(angular, math.radians(20))
            self.assertGreater(small["triangles"], 0)
            self.assertGreater(small["vertices"], 0)
            self.assertLessEqual(small["vertices"], small["triangles"] * 3)
            glb.validate_glb(Path(small["artifactPath"]).read_bytes())

            # The same absolute tolerance on a sphere a hundred times larger needs many more triangles.
            large = runtime.dispatch("mesh", {"handleId": "large", "linearTolerance": 0.05, "angularTolerance": 20})
            self.assertGreater(large["triangles"], small["triangles"] * 10)
            # Native UV extraction must reuse the absolute triangulation that the
            # budget counted, including when OCCT achieved deflection exceeds its request.
            for name, emitted in (("small", small), ("large", large)):
                located, counted = worker._triangulate(runtime.handles[name][0], 0.05, math.radians(20))
                arrays = worker._mesh_arrays(runtime.handles[name][0], located, 0.05, math.radians(20))
                self.assertEqual(counted, emitted["triangles"])
                self.assertEqual(len(arrays["indices"]) // 3, counted)
                self.assertEqual(len(arrays["uvs"]) // 2, emitted["vertices"])

            before = set(artifacts.iterdir())
            refused = runtime.dispatch(
                "mesh",
                {"handleId": "small", "linearTolerance": 0.05, "angularTolerance": 20, "maxTriangles": small["triangles"] - 1},
            )
            self.assertEqual(refused, {"triangles": small["triangles"], "vertices": small["triangles"] * 3})
            self.assertEqual(set(artifacts.iterdir()), before, "an over-budget mesh writes no GLB")
            within = runtime.dispatch(
                "mesh",
                {"handleId": "small", "linearTolerance": 0.05, "angularTolerance": 20, "maxTriangles": small["triangles"]},
            )
            self.assertEqual(within["triangles"], small["triangles"])
            self.assertIn("artifactPath", within)

    def test_resident_lineage_hits_are_share_mode_clones_without_codec_work(self) -> None:
        """G-F1/I1/U2: a warm hit is a lineage lookup plus a clone; no codec, no mesh, no I/O."""

        from build123d import Box, Cylinder, Solid
        import build123d.persistence

        cache = worker._ComputeCache()
        with patch.object(worker, "COMPUTE_ADMISSION_FLOOR", 0.0):
            with worker._ComputeAdapter(cache, compute_config()) as cold:
                first = Solid.make_box(10, 11, 12)
                same_run = Solid.make_box(10.0, 11.0, 12.0)
                cut = Box(10, 10, 10) - Cylinder(2, 12)
            self.assertIsNot(first, same_run)
            self.assertEqual(first.volume, same_run.volume)
            self.assertEqual(cold.hits, 1)
            operations = [entry["action"]["operation"] for entry in cold.announcements]
            self.assertEqual(operations[0], "Solid.make_box")
            self.assertNotIn("Shape.cut", operations)
            primitive_digest = cold.announcements[-1]["actionDigest"]
            self.assertGreater(cold.announcements[-1]["estimatedBytes"], worker.COMPUTE_BASE_CHARGE_BYTES)

            with (
                patch.object(build123d.persistence, "serialize_shape", side_effect=AssertionError("hit-path encode")),
                patch.object(
                    build123d.persistence, "deserialize_shape", side_effect=AssertionError("hit-path decode")
                ),
                worker._ComputeAdapter(cache, compute_config()) as warm,
            ):
                restored_cut = Box(10, 10, 10) - Cylinder(2, 12)
        self.assertEqual(warm.announcements, [])
        self.assertGreaterEqual(warm.hits, 2)
        self.assertIsNot(restored_cut, cut)
        resident = cache.residents[primitive_digest]
        clone = cache.get(primitive_digest)
        self.assertIsNot(clone.wrapped, resident.wrapped)
        self.assertTrue(clone.wrapped.IsSame(resident.wrapped))
        self.assertEqual(restored_cut.volume, cut.volume)
        self.assertEqual(tuple(restored_cut.bounding_box().size), tuple(cut.bounding_box().size))
        self.assertEqual(worker._brep_bytes(restored_cut), worker._brep_bytes(cut))

        # EQ27: identity is tracked for every supported operation, but only measured cost admits it (U4).
        floored = worker._ComputeCache()
        with patch.object(worker, "COMPUTE_ADMISSION_FLOOR", 1e9), worker._ComputeAdapter(
            floored, compute_config()
        ) as cheap:
            tracked = Solid.make_box(1, 1, 1)
            # Lineage lives for the build that produced it (D-DT-03), so identity is checked while it runs.
            self.assertIsNotNone(cheap.lineage(tracked))
        self.assertEqual(cheap.announcements, [])
        self.assertEqual(floored.stats()["entries"], 0)

    def test_native_metadata_and_history_survive_resident_and_restored_primitive_reuse(self) -> None:
        from bd_materials import metals
        from build123d import Box, Cylinder, RigidJoint, Select, Solid

        def model(label):
            body = Box(10, 10, 10)
            body.label = label
            body.material = metals.brass()
            RigidJoint("mount", body)
            return body - Cylinder(2, 12)

        native = model("native")
        cache = worker._ComputeCache()
        with patch.object(worker, "COMPUTE_ADMISSION_FLOOR", 0.0):
            for label in ("cold", "warm"):
                with worker._ComputeAdapter(cache, compute_config()) as adapter:
                    result = model(label)
                self.assertEqual(result.label, label)
                self.assertEqual(result.material.material, native.material.material)
                self.assertEqual(len(result.edges(Select.NEW)), 2)
                self.assertEqual(len(result.faces(Select.LAST)), 1)
                self.assertEqual(result.volume, native.volume)
                self.assertIs(result.joints["mount"].parent, result)
                self.assertTrue(all(item["action"]["operation"].startswith("Solid.make_") for item in adapter.announcements))
            self.assertEqual(adapter.hits, 2)
            restored = worker._ComputeCache()
            for digest, shape in cache.residents.items():
                self.assertTrue(restored.adopt(cache.actions[digest], digest, worker._brep_bytes(shape)))
            with worker._ComputeAdapter(restored, compute_config()) as adapter:
                result = model("restored")
            self.assertEqual(adapter.hits, 2)
            self.assertEqual(result.label, "restored")
            self.assertEqual(result.material.material, native.material.material)
            self.assertIs(result.joints["mount"].parent, result)
            self.assertEqual(len(result.edges(Select.NEW)), 2)
            self.assertEqual(len(result.faces(Select.LAST)), 1)

            class NamedSolid(Solid):
                def __init__(self, *args, **kwargs):
                    super().__init__(*args, **kwargs)
                    self.label = "native subclass"

            with worker._ComputeAdapter(cache, compute_config()) as adapter:
                subclass = NamedSolid.make_box(1, 2, 3)
            self.assertIsInstance(subclass, NamedSolid)
            self.assertEqual(subclass.label, "native subclass")
            self.assertEqual(adapter.hits, 0)
            self.assertEqual(adapter.announcements, [])

    def test_lineage_stamps_bypass_mutated_and_unstamped_operands(self) -> None:
        """G-F1/I9/U5: in-place mutation and unknown operands bypass; they never produce a hit."""

        from build123d import Location, Solid

        cache = worker._ComputeCache()
        adapter = worker._ComputeAdapter(cache, compute_config())
        box = Solid.make_box(1, 2, 3)
        stamped = f"sha256:{'1' * 64}"
        cache.stamp(box, stamped)
        self.assertEqual(adapter.lineage(box), stamped)
        # An in-place move keeps the TShape, so the exact result is a placement, never the same key.
        box.move(Location((9, 0, 0)))
        moved = adapter.lineage(box)
        self.assertIsNotNone(moved)
        self.assertNotEqual(moved, stamped)
        self.assertIsNone(adapter.lineage(object()))
        self.assertIsNone(adapter._identify(box.wrapped, worker.MAX_COMPUTE_LINEAGE_DEPTH + 1))

        # A hash-bucket collision that is not a native partner never answers for another shape.
        other = Solid.make_box(4, 5, 6)
        cache.stamps[worker._tshape_key(other.wrapped)] = [(Solid.make_box(7, 8, 9).wrapped, "sha256:x")]
        self.assertIsNone(adapter.lineage(other))

        original = MagicMock(return_value="uncached")
        self.assertEqual(adapter._boolean("cut", original, object(), (), {}), "uncached")
        with adapter:
            unstamped = worker._shape_from_brep(worker._brep_bytes(Solid.make_box(20, 20, 20)))
            self.assertIsNone(adapter.lineage(unstamped))
            bypassed = unstamped.cut(Solid.make_cylinder(2, 30))
        self.assertNotIn("Shape.cut", [entry["action"]["operation"] for entry in adapter.announcements])
        self.assertLess(bypassed.volume, 8000)

    def test_lineage_stamps_are_bounded_by_entry_and_released_when_the_build_ends(self) -> None:
        """D-DT-03: stamps hold native TShapes alive, so they are bounded per entry and live only for one build."""

        from build123d import Solid

        cache = worker._ComputeCache()
        box = Solid.make_box(1, 2, 3)
        with patch.object(worker, "MAX_COMPUTE_STAMPS", 4):
            for index in range(10):
                cache.stamp(box, f"sha256:{index:064x}")
            # One TShape key with many digests is still bounded by entries, not keys.
            self.assertLessEqual(sum(len(entries) for entries in cache.stamps.values()), 4)
        repeated = worker._ComputeCache()
        for _ in range(10):
            repeated.stamp(box, f"sha256:{'4' * 64}")
        self.assertEqual(sum(len(entries) for entries in repeated.stamps.values()), 1)

        resident = worker._ComputeCache()
        with patch.object(worker, "COMPUTE_ADMISSION_FLOOR", 0.0), worker._ComputeAdapter(resident, compute_config()):
            Solid.make_box(30, 30, 30).cut(Solid.make_cylinder(4, 40))
            self.assertNotEqual(resident.stamps, {})
        # No shape of the finished build is reachable any more, so none stays pinned by lineage.
        self.assertEqual(resident.stamps, {})
        self.assertGreaterEqual(resident.stats()["entries"], 1)
        with worker._ComputeAdapter(resident, compute_config()) as again:
            Solid.make_box(30, 30, 30).cut(Solid.make_cylinder(4, 40))
        self.assertEqual(again.hits, 2)

    def test_implementation_fingerprints_invalidate_on_body_constants_and_defaults(self) -> None:
        """G-F6: a changed implementation cannot silently retain old keys; unknown funnels fail closed."""

        def first(scale=2, table={"a": (1, 2)}):
            def inner():
                return 11

            return scale * inner() + len({1, 2})

        def second(scale=2, table={"a": (1, 2)}):
            def inner():
                return 12

            return scale * inner() + len({1, 2})

        def third(scale=3, table={"a": (1, 2)}):
            def inner():
                return 11

            return scale * inner() + len({1, 2})

        self.assertEqual(worker._callable_fingerprint(first), worker._callable_fingerprint(first))
        self.assertNotEqual(worker._callable_fingerprint(first), worker._callable_fingerprint(second))
        self.assertNotEqual(worker._callable_fingerprint(first), worker._callable_fingerprint(third))
        self.assertNotEqual(
            worker._callable_fingerprint(first),
            worker._callable_fingerprint(lambda scale=2, *, keyword=object(): scale),
        )
        with self.assertRaises(worker._ComputeBypass):
            worker._callable_fingerprint(len)
        self.assertEqual(worker._implementation_value(frozenset({1})), ["1"])
        self.assertEqual(worker._implementation_value({"k": None}), {"'k'": "None"})

        from build123d import Solid

        cache = worker._ComputeCache()
        with patch.object(worker, "COMPUTE_ADMISSION_FLOOR", 0.0), worker._ComputeAdapter(
            cache, compute_config()
        ) as adapter:
            Solid.make_box(3, 4, 5)
        assets = adapter.announcements[0]["action"]["producer"]["implementationAssets"]
        self.assertEqual(assets[-1], adapter._fingerprints["Solid.make_box"])
        self.assertEqual(len(assets), 2)

        import build123d

        with (
            patch.object(Solid, "make_box", MagicMock(spec=[])),
            patch.object(build123d.Shape, "cut", MagicMock(spec=[])),
            worker._ComputeAdapter(cache, compute_config()) as closed,
        ):
            self.assertNotIn("Solid.make_box", closed._fingerprints)
            self.assertNotIn("Shape.cut", closed._fingerprints)
            self.assertIn("Solid.make_sphere", closed._fingerprints)
            self.assertIn("Shape.fuse", closed._fingerprints)

    def test_adapter_fails_closed_on_unsafe_values_and_non_shape_results(self) -> None:
        """D3: anything outside the deterministic allow-list bypasses instead of keying a record."""

        with self.assertRaises(worker._ComputeBypass):
            worker._compute_value(float("nan"))
        with self.assertRaises(worker._ComputeBypass):
            worker._compute_value(object())
        with self.assertRaisesRegex(TypeError, "configuration"):
            worker._ComputeAdapter(worker._ComputeCache(), None)
        with self.assertRaisesRegex(TypeError, "identity"):
            worker._ComputeAdapter(worker._ComputeCache(), {"producer": {}})

        cache = worker._ComputeCache()
        adapter = worker._ComputeAdapter(cache, compute_config())
        original = MagicMock(return_value="original-result")
        signature = inspect.signature(lambda value: value)
        self.assertEqual(adapter._primitive("unsafe", original, signature, (object(),), {}), "original-result")
        original.assert_called_once()

        action = {"schemaVersion": 1, "operation": "Solid.make_box", "inputs": [], "arguments": {}}
        self.assertEqual(adapter._invoke(action, lambda: "not-a-shape"), "not-a-shape")
        self.assertEqual(cache.stats()["entries"], 0)

    def test_resident_budget_evicts_and_clear_fences_the_mirror(self) -> None:
        """G-F4: a small budget evicts explicitly; clear fences residency and lineage together."""

        from build123d import Solid

        cache = worker._ComputeCache()
        action = {"operation": "Solid.make_box"}
        with patch.object(worker, "MAX_COMPUTE_RESIDENT_BYTES", 4096):
            cache.put("sha256:a", Solid.make_box(1, 1, 1), action, 4096)
            cache.put("sha256:b", Solid.make_box(2, 2, 2), action, 4096)
        self.assertEqual(cache.stats()["entries"], 1)
        self.assertEqual(cache.evictions, 1)
        self.assertIsNone(cache.get("sha256:a"))
        self.assertIsNotNone(cache.get("sha256:b"))
        cache.put("sha256:b", Solid.make_box(3, 3, 3), action, 4096)
        self.assertEqual(cache.stats()["entries"], 1)
        with patch.object(worker, "MAX_COMPUTE_RESIDENT_ENTRIES", 0):
            cache.put("sha256:c", Solid.make_box(1, 1, 1), action, 1)
        self.assertEqual(cache.stats()["entries"], 0)
        self.assertEqual(cache.stats()["logicalBytes"], 0)

        cache.put("sha256:d", Solid.make_box(1, 1, 1), action, 10)
        cache.clear(7)
        self.assertEqual(cache.generation, 7)
        self.assertEqual(cache.stats()["entries"], 0)
        self.assertEqual(cache.stats()["logicalBytes"], 0)
        self.assertEqual(cache.stamps, {})

    def test_final_validation_repeats_for_every_result(self) -> None:
        """G-F13/EQ28: every fresh final result is validated, including equal action digests."""

        from build123d import Solid

        cache = worker._ComputeCache()
        shape = Solid.make_box(1, 2, 3)
        digest = f"sha256:{'3' * 64}"
        cache.stamp(shape, digest)
        worker._validate_results((shape,))

        import build123d

        with patch.object(build123d.Shape, "is_valid", new_callable=PropertyMock) as is_valid:
            is_valid.return_value = True
            worker._validate_results((shape,))
            fresh = Solid.make_box(4, 5, 6)
            cache.stamp(fresh, digest)
            worker._validate_results((fresh,))
            self.assertEqual(is_valid.call_count, 2)
            is_valid.return_value = False
            with self.assertRaisesRegex(ValueError, "invalid shape"):
                worker._validate_results((fresh,))
            worker._validate_results(())

        adopted = f"sha256:{'5' * 64}"
        self.assertTrue(cache.adopt({"operation": "x"}, adopted, worker._brep_bytes(shape)))
        self.assertFalse(cache.adopt({"operation": "x"}, "sha256:bad", b"not-a-brep"))

    def test_cooperative_cancel_stops_at_a_safe_boundary_and_keeps_the_prefix(self) -> None:
        """G-F5: cancellation preserves the completed resident prefix; the next request still runs."""

        from build123d import Solid

        cache = worker._ComputeCache()
        cancelled = threading.Event()
        with patch.object(worker, "COMPUTE_ADMISSION_FLOOR", 0.0), worker._ComputeAdapter(cache, compute_config(), cancelled) as adapter:
            Solid.make_box(30, 30, 30).cut(Solid.make_cylinder(4, 40))
            prefix = cache.stats()["entries"]
            cancelled.set()
            with self.assertRaises(worker._ComputeCancelled):
                Solid.make_box(31, 31, 31).cut(Solid.make_cylinder(4, 40))
        self.assertGreaterEqual(prefix, 1)
        self.assertEqual(cache.stats()["entries"], prefix)
        self.assertEqual(adapter._patches, [])
        cancelled.clear()
        with worker._ComputeAdapter(cache, compute_config(), cancelled) as resumed:
            Solid.make_box(30, 30, 30).cut(Solid.make_cylinder(4, 40))
        self.assertEqual(resumed.hits, 2)

    def test_compute_bundle_protocol_is_bounded_confined_and_integrity_checked(self) -> None:
        """G-F10: real binary framing with count/byte caps, confined artifacts and no partial import."""

        from build123d import Solid

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            artifacts = root / "artifacts"
            artifacts.mkdir()
            runtime = make_worker(root, artifacts)
            digest = worker._action_digest({"operation": "Solid.make_box"})
            runtime.compute.put(digest, Solid.make_box(6, 7, 8), {"operation": "Solid.make_box"}, 4096)

            missing = f"sha256:{'e' * 64}"
            self.assertEqual(
                runtime.dispatch("compute.export", {"digests": [missing]}),
                {"descriptors": [], "omitted": [missing]},
            )
            with self.assertRaisesRegex(ValueError, "digests are invalid"):
                runtime.dispatch("compute.export", {"digests": [7]})
            import build123d.persistence

            with patch.object(build123d.persistence, "serialize_shape", side_effect=RuntimeError("no codec")):
                self.assertEqual(
                    runtime.dispatch("compute.export", {"digests": [digest]}),
                    {"descriptors": [], "omitted": [digest]},
                )
            exported = runtime.dispatch("compute.export", {"digests": [digest]})
            self.assertEqual(len(exported["descriptors"]), 1)
            self.assertEqual(exported["bundle"]["byteLength"], exported["descriptors"][0]["byteLength"])
            bundle_path = Path(exported["bundle"]["artifactPath"])
            self.assertEqual(bundle_path.parent, artifacts.resolve())
            payload = bundle_path.read_bytes()

            with self.assertRaisesRegex(ValueError, "digests are invalid"):
                runtime.dispatch("compute.export", {"digests": None})
            with self.assertRaisesRegex(ValueError, "digests are invalid"):
                runtime.dispatch("compute.export", {"digests": ["x"] * (worker.MAX_COMPUTE_DESCRIPTORS + 1)})

            def bundle(data: bytes) -> dict[str, object]:
                path = artifacts / f"{uuid.uuid4().hex}.compute-bundle.bin"
                path.write_bytes(data)
                return {"artifactPath": str(path), "byteLength": len(data)}

            fresh = make_worker(root, artifacts)
            imported = fresh.dispatch(
                "compute.import", {"descriptors": exported["descriptors"], "bundle": bundle(payload)}
            )
            self.assertEqual(imported, {"imported": [digest], "omitted": []})
            self.assertIsNotNone(fresh.compute.get(digest))
            self.assertTrue(bundle_path.exists())
            consumed = bundle(payload)
            fresh.dispatch("compute.import", {"descriptors": exported["descriptors"], "bundle": consumed})
            self.assertFalse(Path(str(consumed["artifactPath"])).exists())

            corrupt = [{**exported["descriptors"][0], "contentDigest": f"sha256:{'0' * 64}"}]
            self.assertEqual(
                make_worker(root, artifacts).dispatch(
                    "compute.import", {"descriptors": corrupt, "bundle": bundle(payload)}
                ),
                {"imported": [], "omitted": [digest]},
            )
            unreadable = [{**exported["descriptors"][0], "byteLength": 4}]
            unreadable[0]["contentDigest"] = worker._content_digest(payload[:4])
            unreadable[0]["actionDigest"] = worker._action_digest(unreadable[0]["action"])
            self.assertEqual(
                make_worker(root, artifacts).dispatch(
                    "compute.import", {"descriptors": unreadable, "bundle": bundle(payload[:4])}
                ),
                {"imported": [], "omitted": [digest]},
            )

            with self.assertRaisesRegex(ValueError, "descriptors are invalid"):
                runtime.dispatch("compute.import", {"descriptors": {}, "bundle": bundle(b"")})
            with self.assertRaisesRegex(ValueError, "descriptors are invalid"):
                runtime.dispatch(
                    "compute.import",
                    {"descriptors": [{}] * (worker.MAX_COMPUTE_DESCRIPTORS + 1), "bundle": bundle(b"")},
                )
            with self.assertRaisesRegex(ValueError, "descriptor is invalid"):
                runtime.dispatch("compute.import", {"descriptors": [None], "bundle": bundle(b"")})
            with self.assertRaisesRegex(ValueError, "descriptor is invalid"):
                partial = make_worker(root, artifacts)
                partial.dispatch(
                    "compute.import",
                    {
                        "descriptors": [exported["descriptors"][0], {**exported["descriptors"][0], "byteLength": 99}],
                        "bundle": bundle(payload + b"ab"),
                    },
                )
            self.assertEqual(partial.compute.stats()["entries"], 0)
            with self.assertRaisesRegex(ValueError, "trailing bytes"):
                partial = make_worker(root, artifacts)
                partial.dispatch(
                    "compute.import",
                    {"descriptors": exported["descriptors"], "bundle": bundle(payload + b"x")},
                )
            self.assertEqual(partial.compute.stats()["entries"], 0)
            before = partial.compute.stats()
            with self.assertRaisesRegex(ValueError, "trailing bytes"):
                partial.dispatch(
                    "compute.import",
                    {"descriptors": unreadable, "bundle": bundle(payload[:4] + b"x")},
                )
            self.assertEqual(partial.compute.stats(), before)

            with self.assertRaisesRegex(TypeError, "artifact descriptor"):
                runtime.dispatch("compute.import", {"descriptors": [], "bundle": None})
            with self.assertRaisesRegex(TypeError, "descriptor is invalid"):
                runtime.dispatch("compute.import", {"descriptors": [], "bundle": {"artifactPath": 1, "byteLength": -1}})
            outside = root / "outside.bin"
            outside.write_bytes(b"")
            with self.assertRaisesRegex(ValueError, "escaped"):
                runtime.dispatch(
                    "compute.import",
                    {"descriptors": [], "bundle": {"artifactPath": str(outside), "byteLength": 0}},
                )
            self.assertTrue(outside.exists())
            oversized = bundle(b"ab")
            oversized["byteLength"] = 1
            with self.assertRaisesRegex(ValueError, "invalid size"):
                runtime.dispatch("compute.import", {"descriptors": [], "bundle": oversized})

            self.assertEqual(runtime.dispatch("compute.stats", {}), runtime.compute.stats())
            with self.assertRaisesRegex(ValueError, "clear generation is invalid"):
                runtime.dispatch("compute.clear", {"generation": "9"})
            self.assertEqual(runtime.dispatch("compute.clear", {"generation": 9}), {"generation": 9})
            self.assertEqual(runtime.compute.stats()["entries"], 0)

    def test_build_announces_bounded_admissions_and_cancels_out_of_band(self) -> None:
        """The build result carries bounded descriptors and its stats; a build without compute carries none."""

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            artifacts = root / "artifacts"
            artifacts.mkdir()
            (root / "main.py").write_text(CUT_MODEL, encoding="utf-8")
            runtime = make_worker(root, artifacts)
            with patch.object(worker, "COMPUTE_ADMISSION_FLOOR", 0.0):
                result = runtime.dispatch(
                    "build", {"entryPath": "main.py", "parameters": {}, "compute": compute_config()}
                )
                self.assertGreaterEqual(len(result["compute"]["announcements"]), 1)
                self.assertLessEqual(len(result["compute"]["announcements"]), worker.MAX_COMPUTE_DESCRIPTORS)
                self.assertEqual(result["compute"]["stats"], runtime.compute.stats())
                warm = runtime.dispatch(
                    "build", {"entryPath": "main.py", "parameters": {}, "compute": compute_config()}
                )
            self.assertGreaterEqual(warm["compute"]["hits"], 1)
            self.assertEqual(warm["compute"]["announcements"], [])
            self.assertNotIn("compute", runtime.dispatch("build", {"entryPath": "main.py", "parameters": {}}))

    def test_module_entrypoint(self) -> None:
        with tempfile.TemporaryDirectory(prefix="tau-build123d-") as directory:
            root = Path(directory)
            workspace = root / "workspace"
            artifacts = root / "artifacts"
            stdin = types.SimpleNamespace(
                buffer=io.BytesIO(
                    json.dumps(
                        {"protocolVersion": 1, "requestId": "end", "method": "shutdown", "params": {}}
                    ).encode()
                    + b"\n"
                )
            )
            protocol = io.StringIO()
            redirected = io.StringIO()
            with (
                patch.object(
                    sys,
                    "argv",
                    [
                        "worker.py",
                        "--workspace",
                        str(workspace),
                        "--artifacts",
                        str(artifacts),
                        "--parent-pid",
                        str(os.getppid()),
                    ],
                ),
                patch.object(sys, "stdin", stdin),
                patch("os.dup", side_effect=[10, 11]),
                patch("os.dup2"),
                patch("os.fdopen", side_effect=[protocol, redirected]),
            ):
                runpy.run_path(worker.__file__, run_name="__main__")
            self.assertIn('"type":"ready"', protocol.getvalue())


if __name__ == "__main__":
    unittest.main()
