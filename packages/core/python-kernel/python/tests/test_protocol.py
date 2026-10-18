from __future__ import annotations

import io
import json
import os
import queue
import sys
import tempfile
import threading
import types
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

PYTHON_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PYTHON_ROOT))

from tau_kernel import protocol
from tau_kernel.analyzer import AnalysisIssue


def context(root: Path) -> protocol.WorkerContext:
    artifacts = root / "artifacts"
    artifacts.mkdir(exist_ok=True)
    return protocol.WorkerContext(root.resolve(), protocol.Artifacts(artifacts), threading.Event())


def arguments(workspace: Path, artifacts: Path) -> list[str]:
    return ["worker.py", "--workspace", str(workspace), "--artifacts", str(artifacts), "--parent-pid", str(os.getppid())]


class ProtocolTest(unittest.TestCase):
    def test_parent_watchdog_terminates_an_orphaned_worker_group(self) -> None:
        temporary_root = Path("/tmp/tau-test-kernel-test")
        liveness = iter((True, True, False))
        waits: list[float] = []
        terminations: list[Path] = []
        protocol._watch_parent(42, temporary_root, lambda _pid: next(liveness), waits.append, terminations.append)
        self.assertEqual(waits, [0.25, 0.25])
        self.assertEqual(terminations, [temporary_root])

        with patch("tau_kernel.protocol.os.kill") as kill:
            self.assertTrue(protocol._parent_is_alive(42))
            kill.assert_called_once_with(42, 0)
        with patch("tau_kernel.protocol.os.kill", side_effect=PermissionError):
            self.assertTrue(protocol._parent_is_alive(42))
        with patch("tau_kernel.protocol.os.kill", side_effect=ProcessLookupError):
            self.assertFalse(protocol._parent_is_alive(42))

        with (
            patch("tau_kernel.protocol.os.name", "posix"),
            patch("tau_kernel.protocol.signal.SIGKILL", 9, create=True),
            patch("tau_kernel.protocol.shutil.rmtree") as remove_tree,
            patch("tau_kernel.protocol.os.killpg", create=True) as kill_group,
            patch("tau_kernel.protocol.os.getpgrp", return_value=7, create=True),
            patch("tau_kernel.protocol.os._exit") as exit_process,
        ):
            protocol._terminate_orphaned_process_tree(temporary_root)
        remove_tree.assert_called_once_with(temporary_root, ignore_errors=True)
        kill_group.assert_called_once_with(7, 9)
        exit_process.assert_called_once_with(1)

        with (
            patch("tau_kernel.protocol.os.name", "posix"),
            patch("tau_kernel.protocol.signal.SIGKILL", 9, create=True),
            patch("tau_kernel.protocol.os.getpgrp", return_value=7, create=True),
            patch("tau_kernel.protocol.shutil.rmtree"),
            patch("tau_kernel.protocol.os.killpg", side_effect=OSError, create=True),
            patch("tau_kernel.protocol.os._exit") as exit_process,
        ):
            protocol._terminate_orphaned_process_tree(temporary_root)
        exit_process.assert_called_once_with(1)

        with (
            patch("tau_kernel.protocol.shutil.rmtree"),
            patch.object(protocol.os, "name", "nt"),
            patch("tau_kernel.protocol.os.killpg", create=True) as kill_group,
            patch("tau_kernel.protocol.os._exit") as exit_process,
        ):
            protocol._terminate_orphaned_process_tree(temporary_root)
        kill_group.assert_not_called()
        exit_process.assert_called_once_with(1)

        thread = MagicMock()
        with (
            patch("tau_kernel.protocol.threading.Thread", return_value=thread) as thread_type,
            patch("tau_kernel.protocol._parent_is_alive", return_value=False),
        ):
            protocol._start_parent_watchdog(42, temporary_root)
        thread_type.assert_not_called()
        with (
            patch("tau_kernel.protocol.threading.Thread", return_value=thread) as thread_type,
            patch("tau_kernel.protocol._parent_is_alive", return_value=True),
        ):
            protocol._start_parent_watchdog(42, temporary_root)
        thread_type.assert_called_once_with(
            target=protocol._watch_parent,
            args=(42, temporary_root),
            name="tau-parent-watchdog",
            daemon=True,
        )
        thread.start.assert_called_once()

    def test_protocol_output_and_stdout_isolation(self) -> None:
        output = io.StringIO()
        with patch.object(protocol, "_PROTOCOL_OUTPUT", output):
            protocol.send({"ok": True})
            self.assertEqual(output.getvalue(), '{"ok":true}\n')
            with patch.object(protocol, "MAX_FRAME_BYTES", 1), self.assertRaisesRegex(RuntimeError, "exceeds"):
                protocol.send({"long": True})

        output_stream = io.StringIO()
        redirected = io.StringIO()
        with (
            patch("tau_kernel.protocol.os.dup", side_effect=[10, 11]),
            patch("tau_kernel.protocol.os.dup2") as dup2,
            patch("tau_kernel.protocol.os.fdopen", side_effect=[output_stream, redirected]),
            patch.object(protocol.sys, "stdout", io.StringIO()),
        ):
            protocol._isolate_stdout()
            dup2.assert_called_once_with(2, 1)
            self.assertIs(protocol._PROTOCOL_OUTPUT, output_stream)
            self.assertIs(protocol.sys.stdout, redirected)

    def test_runtime_issue_locations(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            code = compile("raise ValueError('boom')", str(root / "main.py"), "exec")
            try:
                exec(code, {})
            except ValueError as error:
                issue = protocol.runtime_issue(error, root, "fallback.py")
            self.assertEqual(issue["location"]["fileName"], "main.py")
            error = ValueError("outside")
            self.assertEqual(protocol.runtime_issue(error, root, "fallback.py")["location"]["fileName"], "fallback.py")
            self.assertNotIn("location", protocol.runtime_issue(ValueError(), root, None))


    def test_cancel_frames_are_read_out_of_band(self) -> None:
        self.assertTrue(protocol.is_cancel_frame(b'{"method":"cancel"}'))
        self.assertFalse(protocol.is_cancel_frame(b'{"method":"build"}'))
        self.assertFalse(protocol.is_cancel_frame(b"not json"))
        self.assertFalse(protocol.is_cancel_frame(b"[]"))

        frames: queue.Queue = queue.Queue()
        cancelled = threading.Event()
        protocol._read_frames(frames, iter([b'{"method":"cancel"}\n', b'{"method":"mesh"}\n']), cancelled)
        self.assertTrue(cancelled.is_set())
        self.assertEqual(frames.get(), b'{"method":"mesh"}\n')
        self.assertIsNone(frames.get())

    def test_artifacts_stay_inside_the_private_directory(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            artifacts = protocol.Artifacts(root / "artifacts")
            (root / "artifacts").mkdir()
            created = artifacts.create("glb")
            self.assertEqual((created.parent, created.suffix), (root / "artifacts", ".glb"))
            with self.assertRaisesRegex(RuntimeError, "escaped"):
                artifacts.create("../../../../escape")

            def bundle(data: bytes, name: str = "bundle.bin") -> dict[str, object]:
                path = root / "artifacts" / name
                path.write_bytes(data)
                return {"artifactPath": str(path), "byteLength": len(data)}

            self.assertEqual(
                artifacts.confined(bundle(b"ab"), max_bytes=2, label="Bundle"), root / "artifacts" / "bundle.bin"
            )
            with self.assertRaisesRegex(TypeError, "Bundle must be an artifact descriptor"):
                artifacts.confined(None, max_bytes=2, label="Bundle")
            for descriptor in (
                {"artifactPath": 1, "byteLength": 0},
                {"artifactPath": "x", "byteLength": True},
                {"artifactPath": "x", "byteLength": -1},
            ):
                with self.subTest(descriptor=descriptor), self.assertRaisesRegex(TypeError, "Bundle descriptor is invalid"):
                    artifacts.confined(descriptor, max_bytes=2, label="Bundle")
            outside = root / "outside.bin"
            outside.write_bytes(b"")
            with self.assertRaisesRegex(ValueError, "Bundle escaped"):
                artifacts.confined({"artifactPath": str(outside), "byteLength": 0}, max_bytes=2, label="Bundle")
            link = root / "artifacts" / "link.bin"
            link.symlink_to(root / "artifacts" / "bundle.bin")
            with self.assertRaisesRegex(ValueError, "Bundle escaped"):
                artifacts.confined({"artifactPath": str(link), "byteLength": 2}, max_bytes=2, label="Bundle")
            with self.assertRaisesRegex(ValueError, "Bundle has an invalid size"):
                artifacts.confined(bundle(b"abc", "large.bin"), max_bytes=2, label="Bundle")
            mismatched = bundle(b"ab", "short.bin")
            mismatched["byteLength"] = 1
            with self.assertRaisesRegex(ValueError, "Bundle has an invalid size"):
                artifacts.confined(mismatched, max_bytes=2, label="Bundle")

    def test_handles_are_bounded(self) -> None:
        handles = protocol.Handles(2, "Test")
        first = handles.retain("a")
        handles.retain("b")
        self.assertEqual(handles[first], "a")
        with self.assertRaisesRegex(RuntimeError, "Retained Test handle limit reached"):
            handles.retain("c")
        handles.pop(first)
        self.assertEqual(len(handles), 1)

    def test_serve_answers_errors_and_shutdown(self) -> None:
        def dispatch(method: str, params: dict[str, object]) -> dict[str, object]:
            if method == "echo":
                return {"echo": params}
            if method == "analyze":
                raise AnalysisIssue("bad syntax", "PYTHON_SYNTAX", 2, 3)
            if method == "shutdown":
                return {"shutdown": True}
            raise ValueError(f"Unknown protocol method: {method}")

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            frames = [
                {"protocolVersion": 1, "requestId": "a", "method": "echo", "params": {"value": 1}},
                {"protocolVersion": 1, "requestId": "syntax", "method": "analyze", "params": {"entryPath": "bad.py"}},
                {"protocolVersion": 1, "requestId": "default-entry", "method": "analyze", "params": {}},
                {"protocolVersion": 1, "requestId": "a", "method": "echo", "params": {}},
                {"protocolVersion": 2},
                {"protocolVersion": 1, "requestId": 1, "method": "x", "params": []},
                {"protocolVersion": 1, "requestId": "z", "method": "other", "params": {"entryPath": "main.py"}},
                {"protocolVersion": 1, "requestId": "end", "method": "shutdown"},
            ]
            stdin = types.SimpleNamespace(
                buffer=io.BytesIO(b"".join(json.dumps(frame).encode() + b"\n" for frame in frames))
            )
            sent: list[dict[str, object]] = []
            with (
                patch.object(protocol.sys, "stdin", stdin),
                patch("tau_kernel.protocol.send", side_effect=sent.append),
                patch("tau_kernel.protocol.importlib.import_module") as import_module,
            ):
                self.assertTrue(protocol.serve(dispatch, context(root), import_check="tau_test_library"))
            import_module.assert_called_once_with("tau_test_library")
            self.assertEqual(sent[0]["type"], "ready")
            self.assertEqual(sent[1], {"protocolVersion": 1, "requestId": "a", "result": {"echo": {"value": 1}}})
            self.assertEqual(sent[2]["error"]["issues"][0]["location"]["fileName"], "bad.py")
            self.assertEqual(sent[3]["error"]["issues"][0]["location"]["fileName"], "main.py")
            self.assertIn("Duplicate", sent[4]["error"]["issues"][0]["message"])
            self.assertIn("Unsupported", sent[5]["error"]["issues"][0]["message"])
            self.assertIn("invalid fields", sent[6]["error"]["issues"][0]["message"])
            self.assertEqual(sent[7]["error"]["issues"][0]["location"]["fileName"], "main.py")
            self.assertEqual(sent[-1]["result"], {"shutdown": True})

            oversized = [b"x" * (protocol.MAX_FRAME_BYTES + 1)]
            sent.clear()
            with (
                patch("tau_kernel.protocol.send", side_effect=sent.append),
                patch("tau_kernel.protocol.importlib.import_module"),
            ):
                self.assertFalse(
                    protocol.serve(dispatch, context(root), import_check="tau_test_library", stream=oversized)
                )
            self.assertIn("exceeds", sent[-1]["error"]["issues"][0]["message"])

    def test_run_worker_checks_the_private_root_and_removes_an_orphaned_one(self) -> None:
        with tempfile.TemporaryDirectory(prefix="tau-test-kernel-") as directory:
            root = Path(directory)
            workspace = root / "workspace"
            artifacts = root / "artifacts"
            created: list[protocol.WorkerContext] = []

            def create_dispatch(worker_context: protocol.WorkerContext) -> protocol.Dispatch:
                created.append(worker_context)
                return MagicMock(return_value={})

            with (
                patch.object(sys, "argv", arguments(workspace, artifacts)),
                patch.object(sys, "path", list(sys.path)),
                patch("tau_kernel.protocol._isolate_stdout"),
                patch("tau_kernel.protocol._start_parent_watchdog") as start_watchdog,
                patch("tau_kernel.protocol.serve", return_value=True) as serve,
            ):
                protocol.run_worker(create_dispatch, temporary_prefix="tau-test-kernel-", import_check="tau_test_library")
                self.assertEqual(sys.path[0], str(workspace))
            self.assertTrue(workspace.is_dir())
            self.assertTrue(artifacts.is_dir())
            start_watchdog.assert_called_once_with(os.getppid(), root.resolve())
            self.assertEqual(
                (created[0].workspace, created[0].artifacts.root), (workspace.resolve(), artifacts.resolve())
            )
            self.assertIs(serve.call_args.args[1], created[0])
            self.assertEqual(serve.call_args.kwargs, {"import_check": "tau_test_library"})

            orphan_root = root / "tau-test-kernel-orphan"
            with (
                patch.object(sys, "argv", arguments(orphan_root / "workspace", orphan_root / "artifacts")),
                patch.object(sys, "path", list(sys.path)),
                patch("tau_kernel.protocol._isolate_stdout"),
                patch("tau_kernel.protocol._start_parent_watchdog"),
                patch("tau_kernel.protocol.serve", return_value=False),
            ):
                protocol.run_worker(create_dispatch, temporary_prefix="tau-test-kernel-", import_check="tau_test_library")
            self.assertFalse(orphan_root.exists())

            invalid_roots = (
                (root / "other-workspace", root / "other-parent" / "artifacts"),
                (root / "not-private" / "workspace", root / "not-private" / "artifacts"),
            )
            for invalid_workspace, invalid_artifacts in invalid_roots:
                with (
                    self.subTest(workspace=invalid_workspace),
                    patch.object(sys, "argv", arguments(invalid_workspace, invalid_artifacts)),
                    patch("sys.stderr", io.StringIO()) as stderr,
                    self.assertRaises(SystemExit),
                ):
                    protocol.run_worker(
                        create_dispatch, temporary_prefix="tau-test-kernel-", import_check="tau_test_library"
                    )
                self.assertIn("must share a tau-test-kernel-* private root", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
