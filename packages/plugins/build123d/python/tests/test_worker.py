from __future__ import annotations

import asyncio
import io
import json
import os
import runpy
import sys
import tempfile
import types
import unittest
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


class WorkerTest(unittest.TestCase):
    def test_parent_watchdog_terminates_an_orphaned_worker_group(self) -> None:
        temporary_root = Path("/tmp/tau-build123d-test")
        parents = iter((42, 42, 1))
        waits: list[float] = []
        terminations: list[Path] = []
        worker._watch_parent(42, temporary_root, lambda: next(parents), waits.append, terminations.append)
        self.assertEqual(waits, [0.25, 0.25])
        self.assertEqual(terminations, [temporary_root])

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
        with patch("worker.threading.Thread", return_value=thread) as thread_type:
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
            root = Path(directory).resolve()
            project_module = types.ModuleType("tau_test_project")
            project_module.__file__ = str(root / "module.py")
            native_module = types.ModuleType("tau_test_native")
            native_module.__file__ = str(root / "module.so")
            no_file = types.ModuleType("tau_test_none")
            relative_module = types.ModuleType("tau_test_relative")
            relative_module.__file__ = "relative.py"
            sys.modules[project_module.__name__] = project_module
            sys.modules[native_module.__name__] = native_module
            sys.modules[no_file.__name__] = no_file
            sys.modules[relative_module.__name__] = relative_module
            try:
                self.assertEqual(worker._project_modules(root), {project_module.__name__: "module.py"})
                with patch("worker.importlib.invalidate_caches") as invalidate:
                    worker._evict_project_modules(root)
                    invalidate.assert_called_once()
                self.assertNotIn(project_module.__name__, sys.modules)
            finally:
                for name in (project_module.__name__, native_module.__name__, no_file.__name__, relative_module.__name__):
                    sys.modules.pop(name, None)

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
        from build123d import Box, Compound

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
        components, meshes = worker._topology((assembly,), 0.05, 0.1)
        self.assertEqual(components[0]["kind"], "assembly")
        self.assertEqual(components[1]["id"], "component:part")
        self.assertEqual(components[2]["id"], "component:part#2")
        self.assertEqual(set(meshes), {"component:part", "component:part#2"})

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
            retained = runtime.dispatch("build", {"entryPath": "main.py", "parameters": {}})["handleId"]
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
                runtime.dispatch("build", {"entryPath": "main.py", "parameters": {}})

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
