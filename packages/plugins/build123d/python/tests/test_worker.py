from __future__ import annotations

import asyncio
import base64
import hashlib
import importlib.util
import inspect
import io
import json
import os
import queue
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


MODEL = """from dataclasses import dataclass
from build123d import Box

@dataclass(frozen=True)
class Params:
    width: float = 2.0

def main(params: Params):
    return Box(params.width, 3, 4)
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
    def test_parent_watchdog_terminates_an_orphaned_worker_group(self) -> None:
        temporary_root = Path("/tmp/tau-build123d-test")
        liveness = iter((True, True, False))
        waits: list[float] = []
        terminations: list[Path] = []
        worker._watch_parent(42, temporary_root, lambda _pid: next(liveness), waits.append, terminations.append)
        self.assertEqual(waits, [0.25, 0.25])
        self.assertEqual(terminations, [temporary_root])

        with patch("worker.os.kill") as kill:
            self.assertTrue(worker._parent_is_alive(42))
            kill.assert_called_once_with(42, 0)
        with patch("worker.os.kill", side_effect=PermissionError):
            self.assertTrue(worker._parent_is_alive(42))
        with patch("worker.os.kill", side_effect=ProcessLookupError):
            self.assertFalse(worker._parent_is_alive(42))

        with (
            patch("worker.shutil.rmtree") as remove_tree,
            patch("worker.os.killpg") as kill_group,
            patch("worker.os.getpgrp", return_value=7),
            patch("worker.os._exit") as exit_process,
        ):
            worker._terminate_orphaned_process_tree(temporary_root)
        remove_tree.assert_called_once_with(temporary_root, ignore_errors=True)
        kill_group.assert_called_once_with(7, worker.signal.SIGKILL)
        exit_process.assert_called_once_with(1)

        with patch("worker.shutil.rmtree"), patch("worker.os.killpg", side_effect=OSError), patch(
            "worker.os._exit"
        ) as exit_process:
            worker._terminate_orphaned_process_tree(temporary_root)
        exit_process.assert_called_once_with(1)

        with (
            patch("worker.shutil.rmtree"),
            patch.object(worker.os, "name", "nt"),
            patch("worker.os.killpg") as kill_group,
            patch("worker.os._exit") as exit_process,
        ):
            worker._terminate_orphaned_process_tree(temporary_root)
        kill_group.assert_not_called()
        exit_process.assert_called_once_with(1)

        thread = MagicMock()
        with (
            patch("worker.threading.Thread", return_value=thread) as thread_type,
            patch("worker._parent_is_alive", return_value=False),
        ):
            worker._start_parent_watchdog(42, temporary_root)
        thread_type.assert_not_called()
        with (
            patch("worker.threading.Thread", return_value=thread) as thread_type,
            patch("worker._parent_is_alive", return_value=True),
        ):
            worker._start_parent_watchdog(42, temporary_root)
        thread_type.assert_called_once_with(
            target=worker._watch_parent,
            args=(42, temporary_root),
            name="tau-parent-watchdog",
            daemon=True,
        )
        thread.start.assert_called_once()

    def test_protocol_output_and_stdout_isolation(self) -> None:
        output = io.StringIO()
        with patch.object(worker, "_PROTOCOL_OUTPUT", output):
            worker._send({"ok": True})
            self.assertEqual(output.getvalue(), '{"ok":true}\n')
            with patch.object(worker, "MAX_FRAME_BYTES", 1), self.assertRaisesRegex(RuntimeError, "exceeds"):
                worker._send({"long": True})

        protocol = io.StringIO()
        redirected = io.StringIO()
        with (
            patch("worker.os.dup", side_effect=[10, 11]),
            patch("worker.os.dup2") as dup2,
            patch("worker.os.fdopen", side_effect=[protocol, redirected]),
            patch.object(worker.sys, "stdout", io.StringIO()),
        ):
            worker._isolate_stdout()
            dup2.assert_called_once_with(2, 1)
            self.assertIs(worker._PROTOCOL_OUTPUT, protocol)
            self.assertIs(worker.sys.stdout, redirected)

    def test_runtime_issue_locations(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            code = compile("raise ValueError('boom')", str(root / "main.py"), "exec")
            try:
                exec(code, {})
            except ValueError as error:
                issue = worker._runtime_issue(error, root, "fallback.py")
            self.assertEqual(issue["location"]["fileName"], "main.py")
            error = ValueError("outside")
            self.assertEqual(worker._runtime_issue(error, root, "fallback.py")["location"]["fileName"], "fallback.py")
            self.assertNotIn("location", worker._runtime_issue(ValueError(), root, None))

    def test_project_modules_and_eviction(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            parent = Path(directory).resolve()
            root = parent / "workspace"
            root.mkdir()
            (root / "package").mkdir()
            (root / "real").mkdir()
            (root / "link").symlink_to(root / "real", target_is_directory=True)
            sibling = parent / "workspace-sibling"
            sibling.mkdir()
            module_paths = {
                "tau_test_project": root / "module.py",
                "tau_test_package": root / "package" / "module.py",
                "tau_test_linked": root / "link" / "module.py",
                "tau_test_sibling": sibling / "module.py",
            }
            loaded_modules = []
            for name, path in module_paths.items():
                path.write_text("VALUE = 1\n", encoding="utf-8")
                spec = importlib.util.spec_from_file_location(name, path)
                assert spec is not None and spec.loader is not None
                module = importlib.util.module_from_spec(spec)
                sys.modules[name] = module
                spec.loader.exec_module(module)
                loaded_modules.append(module)
            project_module, package_module, linked_module, sibling_module = loaded_modules
            native_module = types.ModuleType("tau_test_native")
            native_module.__file__ = str(root / "module.so")
            no_file = types.ModuleType("tau_test_none")
            relative_module = types.ModuleType("tau_test_relative")
            relative_module.__file__ = "relative.py"
            dot_py_module = types.ModuleType("tau_test_dot_py")
            dot_py_module.__file__ = str(root / ".py")
            modules = (
                project_module,
                package_module,
                linked_module,
                sibling_module,
                native_module,
                no_file,
                relative_module,
                dot_py_module,
            )
            for module in modules:
                sys.modules[module.__name__] = module
            try:
                class ModuleSnapshot(dict[str, object]):
                    copies = 0

                    def copy(self) -> dict[str, object]:
                        self.copies += 1
                        return super().copy()

                pathlib_result = {}
                for name, module in tuple(sys.modules.items()):
                    file_name = getattr(module, "__file__", None)
                    if not isinstance(file_name, str):
                        continue
                    path = Path(file_name)
                    if not path.is_absolute():
                        path = path.absolute()
                    if worker._is_relative_to(path, root) and path.suffix == ".py":
                        pathlib_result[name] = path.relative_to(root).as_posix()
                self.assertEqual(worker._project_modules(root), pathlib_result)
                self.assertEqual(
                    worker._project_modules(root),
                    {
                        project_module.__name__: "module.py",
                        package_module.__name__: "package/module.py",
                        linked_module.__name__: "link/module.py",
                    },
                )
                snapshot = ModuleSnapshot(sys.modules)
                with patch.object(worker.sys, "modules", snapshot):
                    self.assertEqual(worker._project_modules(root), pathlib_result)
                self.assertEqual(snapshot.copies, 1)
                with patch("worker.importlib.invalidate_caches") as invalidate:
                    worker._evict_project_modules(root)
                    invalidate.assert_called_once()
                self.assertNotIn(project_module.__name__, sys.modules)
                self.assertNotIn(package_module.__name__, sys.modules)
                self.assertNotIn(linked_module.__name__, sys.modules)
                self.assertIn(sibling_module.__name__, sys.modules)
            finally:
                for module in modules:
                    sys.modules.pop(module.__name__, None)

    def test_parameter_validation(self) -> None:
        schema = {
            "properties": {
                "enabled": {"type": "boolean", "default": True},
                "count": {"type": "integer", "default": 2, "minimum": 1, "maximum": 3, "multipleOf": 1},
                "ratio": {"type": "number", "default": 1.5, "exclusiveMinimum": 0, "exclusiveMaximum": 2},
                "name": {"type": "string", "default": "part", "enum": ["part"], "minLength": 1, "maxLength": 5, "pattern": "^p"},
            }
        }
        self.assertEqual(worker._validate_parameters({"count": 3}, schema)["count"], 3)
        cases = (
            ([], "object"),
            ({"other": 1}, "Unknown"),
            ({"enabled": 1}, "must be boolean"),
            ({"count": True}, "must be integer"),
            ({"ratio": float("inf")}, "must be number"),
            ({"name": "other"}, "one of"),
            ({"count": 0}, "minimum"),
            ({"count": 4}, "maximum"),
            ({"ratio": 0}, "exclusiveMinimum"),
            ({"ratio": 2}, "exclusiveMaximum"),
            ({"name": "partsx"}, "one of"),
        )
        for value, message in cases:
            with self.subTest(value=value), self.assertRaisesRegex((TypeError, ValueError), message):
                worker._validate_parameters(value, schema)
        string_schema = {
            "properties": {"name": {"type": "string", "default": "a", "minLength": 1, "maxLength": 1, "pattern": "^a"}}
        }
        with self.assertRaisesRegex(ValueError, "minLength"):
            worker._validate_parameters({"name": ""}, string_schema)
        with self.assertRaisesRegex(ValueError, "maxLength"):
            worker._validate_parameters({"name": "aa"}, string_schema)
        with self.assertRaisesRegex(ValueError, "pattern"):
            worker._validate_parameters({"name": "b"}, string_schema)
        multiple_schema = {"properties": {"count": {"type": "integer", "default": 2, "multipleOf": 2}}}
        with self.assertRaisesRegex(ValueError, "multipleOf"):
            worker._validate_parameters({"count": 3}, multiple_schema)

    def test_load_model_success_and_contract_errors(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            entry = root / "main.py"
            entry.write_text(MODEL, encoding="utf-8")
            shapes, observed = worker._load_model(root, "main.py", {"width": 5})
            self.assertEqual(len(shapes), 1)
            self.assertEqual(shapes[0].label, "Shape 1")
            self.assertIn("main.py", observed)

            cases = (
                (MODEL.replace("return Box(params.width, 3, 4)", "return []"), "non-empty"),
                (MODEL.replace("return Box(params.width, 3, 4)", "return 1"), "Shape"),
                (MODEL.replace("def main", "async def main"), "Async"),
                (MODEL.replace("def main(params: Params):", "not_main = 1\ndef other(params: Params):"), "callable main"),
                (MODEL.replace("@dataclass(frozen=True)", "@dataclass"), "frozen"),
                (
                    MODEL.replace(
                        "return Box(params.width, 3, 4)",
                        "left = Box(1, 1, 1); right = Box(1, 1, 1); left.label = right.label = 'same'; return [left, right]",
                    ),
                    "Duplicate",
                ),
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

            with patch("worker.importlib.util.spec_from_file_location", return_value=None), self.assertRaisesRegex(RuntimeError, "Unable"):
                entry.write_text(MODEL, encoding="utf-8")
                worker._load_model(root, "main.py", {})

            analysis = {"jsonSchema": {"properties": {}}, "defaultParameters": {}, "resolved": [], "unresolved": []}
            for source, message in (
                ("Params = 1\ndef main(params): return 1\n", "dataclass"),
                ("from dataclasses import dataclass\n@dataclass\nclass Params: pass\ndef main(params): return 1\n", "frozen"),
            ):
                entry.write_text(source, encoding="utf-8")
                with (
                    self.subTest(message=message),
                    patch("worker.analyze_project", return_value=analysis),
                    self.assertRaisesRegex(TypeError, message),
                ):
                    worker._load_model(root, "main.py", {})

    def test_geometry_helpers_and_worker_dispatch(self) -> None:
        from build123d import Axis, Box, Compound, Cylinder, Sphere
        import OCP.BRepMesh

        self.assertEqual(worker._component_id("Shape 1", "fallback"), "fallback")
        self.assertEqual(worker._component_id("À Fancy Part", "fallback"), "component:a-fancy-part")
        self.assertEqual(worker._component_id("!!!", "fallback"), "fallback")
        point = types.SimpleNamespace(X=1000, Y=2000, Z=3000)
        self.assertEqual(worker._point(point), (1.0, 3.0, -2.0))
        self.assertEqual(worker._normal((0, 0, 0), (1, 0, 0), (0, 1, 0)), (0, 0, 1))
        self.assertEqual(worker._normal((0, 0, 0), (0, 0, 0), (0, 0, 0)), (0, 1, 0))

        left = Box(1, 2, 3)
        left.label = "Part"
        right = Box(1, 1, 1)
        right.label = "Part"
        assembly = Compound(children=[left, right])
        assembly.label = "Assembly"
        curved = Cylinder(1, 2)
        curved.label = "Curved"
        with patch.object(
            OCP.BRepMesh,
            "BRepMesh_IncrementalMesh",
            wraps=OCP.BRepMesh.BRepMesh_IncrementalMesh,
        ) as mesher:
            components, meshes = worker._topology((assembly, curved), 0.05, 0.1)
        self.assertEqual(mesher.call_count, 3)

        expected_meshes = (
            (Box(1, 2, 3), "dd048e009580e5949fa0594ce451430b1b18ba3b5e4c90ac5df0e8c2b11d0da1"),
            (Cylinder(1, 2), "bf6edd7f1145fa7bd324815e3d7eaad8e8bd3eb5fbb5a83d3e804ee8a9cfa360"),
            (Sphere(1).rotate(Axis.X, 37), "fe39af035cbf1d1d46a2321640cbe0ed49102512669bf8b1656999023b67009e"),
        )
        for shape, expected in expected_meshes:
            mesh = worker._mesh_shape(shape, 0.05, 0.1)
            encoded = json.dumps(mesh, sort_keys=True, separators=(",", ":")).encode()
            self.assertEqual(hashlib.sha256(encoded).hexdigest(), expected)
        self.assertEqual(components[0]["kind"], "assembly")
        self.assertEqual(components[1]["id"], "component:part")
        self.assertEqual(components[2]["id"], "component:part#2")
        self.assertEqual(set(meshes), {"component:part", "component:part#2", "component:curved"})

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            artifacts = root / "artifacts"
            artifacts.mkdir()
            (root / "main.py").write_text(MODEL, encoding="utf-8")
            runtime = worker.Worker(root, artifacts)
            with self.assertRaisesRegex(RuntimeError, "escaped"):
                runtime._artifact("../../../../escape")
            analysis = runtime.dispatch("analyze", {"entryPath": "main.py"})
            self.assertEqual(analysis["defaultParameters"], {"width": 2.0})
            built = runtime.dispatch("build", {"entryPath": "main.py", "parameters": {"width": 4}})
            handle = built["handleId"]
            mesh_result = runtime.dispatch(
                "mesh", {"handleId": handle, "linearTolerance": 0.05, "angularTolerance": 0.1}
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
            runtime.dispatch("mesh", {"handleId": retained, "linearTolerance": 0.05, "angularTolerance": 0.1})
            runtime.dispatch("export", {"handleId": retained, "format": "step"})
            self.assertEqual(counter.read_text(encoding="utf-8"), "1")
            with self.assertRaisesRegex(ValueError, "Unsupported"):
                runtime.dispatch("export", {"handleId": handle, "format": "stl"})
            import build123d

            with patch.object(build123d, "export_step", return_value=False), self.assertRaisesRegex(RuntimeError, "failed"):
                runtime.dispatch("export", {"handleId": handle, "format": "step"})
            self.assertEqual(runtime.dispatch("release", {"handleId": handle}), {})
            self.assertEqual(runtime.dispatch("shutdown", {}), {"shutdown": True})
            with self.assertRaisesRegex(ValueError, "Unknown"):
                runtime.dispatch("other", {})
            runtime.handles = {str(index): () for index in range(worker.MAX_HANDLES)}
            with self.assertRaisesRegex(RuntimeError, "limit"):
                runtime.dispatch("build", {"entryPath": "main.py", "parameters": {}, "compute": compute_config()})

    def test_mesh_shape_reads_the_component_triangulation_directly(self) -> None:
        from build123d import Cylinder, Face
        from OCP.Poly import Poly_Triangulation

        with (
            patch.object(Face, "tessellate", side_effect=AssertionError("per-face tessellation")),
            patch.object(Poly_Triangulation, "Triangles", side_effect=AssertionError("bulk triangle wrapper")),
        ):
            mesh = worker._mesh_shape(Cylinder(1, 2), 0.05, 0.1)
        self.assertGreater(len(mesh["positions"]), 0)
        self.assertEqual(len(mesh["positions"]), len(mesh["normals"]))
        self.assertEqual(len(mesh["positions"]), len(mesh["indices"]) * 3)

        from OCP.BRep import BRep_Tool

        with patch.object(BRep_Tool, "Triangulation_s", return_value=None), self.assertRaisesRegex(
            AttributeError, "NbNodes"
        ):
            worker._mesh_shape(Cylinder(1, 2), 0.05, 0.1)

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
            self.assertIn("Shape.cut", operations)
            cut_digest = cold.announcements[-1]["actionDigest"]
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
        self.assertGreaterEqual(warm.hits, 3)
        self.assertIsNot(restored_cut, cut)
        resident = cache.residents[cut_digest]
        clone = cache.get(cut_digest)
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
        self.assertEqual(cheap.announcements, [])
        self.assertEqual(floored.stats()["entries"], 0)
        self.assertIsNotNone(cheap.lineage(tracked))

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

        while len(cache.stamps) < worker.MAX_COMPUTE_STAMPS:
            cache.stamps[len(cache.stamps) + 1_000_000] = []
        cache.stamp(Solid.make_box(1, 1, 1), f"sha256:{'2' * 64}")
        self.assertEqual(len(cache.stamps), worker.MAX_COMPUTE_STAMPS)

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

        self.assertTrue(worker._is_cancel_frame(b'{"method":"cancel"}'))
        self.assertFalse(worker._is_cancel_frame(b'{"method":"build"}'))
        self.assertFalse(worker._is_cancel_frame(b"not json"))
        self.assertFalse(worker._is_cancel_frame(b"[]"))

        cache = worker._ComputeCache()
        cancelled = threading.Event()
        with worker._ComputeAdapter(cache, compute_config(), cancelled) as adapter:
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
        self.assertEqual(resumed.hits, 1)

    def test_compute_bundle_protocol_is_bounded_confined_and_integrity_checked(self) -> None:
        """G-F10: real binary framing with count/byte caps, confined artifacts and no partial import."""

        from build123d import Solid

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            artifacts = root / "artifacts"
            artifacts.mkdir()
            runtime = worker.Worker(root, artifacts)
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

            fresh = worker.Worker(root, artifacts)
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
                worker.Worker(root, artifacts).dispatch(
                    "compute.import", {"descriptors": corrupt, "bundle": bundle(payload)}
                ),
                {"imported": [], "omitted": [digest]},
            )
            unreadable = [{**exported["descriptors"][0], "byteLength": 4}]
            unreadable[0]["contentDigest"] = worker._content_digest(payload[:4])
            unreadable[0]["actionDigest"] = worker._action_digest(unreadable[0]["action"])
            self.assertEqual(
                worker.Worker(root, artifacts).dispatch(
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
                partial = worker.Worker(root, artifacts)
                partial.dispatch(
                    "compute.import",
                    {
                        "descriptors": [exported["descriptors"][0], {**exported["descriptors"][0], "byteLength": 99}],
                        "bundle": bundle(payload + b"ab"),
                    },
                )
            self.assertEqual(partial.compute.stats()["entries"], 0)
            with self.assertRaisesRegex(ValueError, "trailing bytes"):
                partial = worker.Worker(root, artifacts)
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
        """The build result carries bounded descriptors; a cancel frame never consumes a request slot."""

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            artifacts = root / "artifacts"
            artifacts.mkdir()
            (root / "main.py").write_text(CUT_MODEL, encoding="utf-8")
            runtime = worker.Worker(root, artifacts)
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

            frames: queue.Queue = queue.Queue()
            runtime.cancelled.clear()
            runtime._read_frames(frames, iter([b'{"method":"cancel"}\n', b'{"method":"mesh"}\n']))
            self.assertTrue(runtime.cancelled.is_set())
            self.assertEqual(frames.get(), b'{"method":"mesh"}\n')
            self.assertIsNone(frames.get())

    def test_run_protocol_errors_and_shutdown(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            artifacts = root / "artifacts"
            artifacts.mkdir()
            (root / "main.py").write_text(MODEL, encoding="utf-8")
            frames = [
                {"protocolVersion": 1, "requestId": "a", "method": "analyze", "params": {"entryPath": "main.py"}},
                {"protocolVersion": 1, "requestId": "syntax", "method": "analyze", "params": {"entryPath": "bad.py"}},
                {"protocolVersion": 1, "requestId": "a", "method": "analyze", "params": {}},
                {"protocolVersion": 2},
                {"protocolVersion": 1, "requestId": 1, "method": "x", "params": []},
                {"protocolVersion": 1, "requestId": "z", "method": "other", "params": {"entryPath": "main.py"}},
                {"protocolVersion": 1, "requestId": "end", "method": "shutdown", "params": {}},
            ]
            (root / "bad.py").write_text("(", encoding="utf-8")
            stdin = types.SimpleNamespace(buffer=io.BytesIO(b"".join(json.dumps(frame).encode() + b"\n" for frame in frames)))
            sent: list[dict[str, object]] = []
            with (
                patch.object(worker.sys, "stdin", stdin),
                patch("worker._send", side_effect=sent.append),
                patch("worker.importlib.import_module", wraps=worker.importlib.import_module) as import_module,
            ):
                self.assertTrue(worker.Worker(root, artifacts).run())
            import_module.assert_any_call("build123d")
            self.assertEqual(sent[0]["type"], "ready")
            self.assertIn("result", sent[1])
            self.assertEqual(sent[-1]["result"], {"shutdown": True})
            self.assertGreaterEqual(sum("error" in frame for frame in sent), 4)

            oversized = types.SimpleNamespace(buffer=[b"x" * (worker.MAX_FRAME_BYTES + 1)])
            sent.clear()
            with patch.object(worker.sys, "stdin", oversized), patch("worker._send", side_effect=sent.append):
                self.assertFalse(worker.Worker(root, artifacts).run())
            self.assertIn("error", sent[-1])

    def test_main_creates_directories_and_runs_worker(self) -> None:
        with tempfile.TemporaryDirectory(prefix="tau-build123d-") as directory:
            root = Path(directory)
            workspace = root / "workspace"
            artifacts = root / "artifacts"
            fake_worker = MagicMock()
            fake_worker.run.return_value = True
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
                patch("worker._isolate_stdout"),
                patch("worker._start_parent_watchdog") as start_watchdog,
                patch("worker.Worker", return_value=fake_worker),
            ):
                worker.main()
            self.assertTrue(workspace.is_dir())
            self.assertTrue(artifacts.is_dir())
            start_watchdog.assert_called_once_with(os.getppid(), root.resolve())
            fake_worker.run.assert_called_once()

            orphan_root = root / "tau-build123d-orphan"
            orphan_worker = MagicMock()
            orphan_worker.run.return_value = False
            with (
                patch.object(
                    sys,
                    "argv",
                    [
                        "worker.py",
                        "--workspace",
                        str(orphan_root / "workspace"),
                        "--artifacts",
                        str(orphan_root / "artifacts"),
                        "--parent-pid",
                        str(os.getppid()),
                    ],
                ),
                patch("worker._isolate_stdout"),
                patch("worker._start_parent_watchdog"),
                patch("worker.Worker", return_value=orphan_worker),
            ):
                worker.main()
            self.assertFalse(orphan_root.exists())

            invalid_roots = (
                (root / "other-workspace", root / "other-parent" / "artifacts"),
                (root / "not-private" / "workspace", root / "not-private" / "artifacts"),
            )
            for invalid_workspace, invalid_artifacts in invalid_roots:
                with (
                    self.subTest(workspace=invalid_workspace),
                    patch.object(
                        sys,
                        "argv",
                        [
                            "worker.py",
                            "--workspace",
                            str(invalid_workspace),
                            "--artifacts",
                            str(invalid_artifacts),
                            "--parent-pid",
                            str(os.getppid()),
                        ],
                    ),
                    self.assertRaises(SystemExit),
                ):
                    worker.main()

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
