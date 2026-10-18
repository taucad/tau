"""The JSON-lines worker protocol every Tau Python kernel speaks. Stdout is reserved for protocol frames.

A kernel's worker module supplies one `dispatch(method, params)` over its library and calls `run_worker`, which owns
the rest: the private-root check, stdout isolation, the parent watchdog, the `ready` handshake, request framing and
validation, out-of-band cancellation, structured issues and shutdown.
"""

from __future__ import annotations

import argparse
import importlib
import json
import os
import queue
import shutil
import signal
import sys
import threading
import time
import traceback
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from tau_kernel.analyzer import AnalysisIssue

PROTOCOL_VERSION = 1
MAX_FRAME_BYTES = 1_048_576

_PROTOCOL_OUTPUT = sys.stdout

Dispatch = Callable[[str, dict[str, Any]], dict[str, Any]]
"""Answer one request: the method name and its parameters to the JSON result."""


def is_cancel_frame(line: bytes) -> bool:
    """Recognize the out-of-band cancel notification without consuming a request slot."""

    try:
        request = json.loads(line)
    except ValueError:
        return False
    return isinstance(request, dict) and request.get("method") == "cancel"


def _terminate_orphaned_process_tree(temporary_root: Path) -> None:
    """Exit the detached worker group after its Node owner disappears."""

    shutil.rmtree(temporary_root, ignore_errors=True)
    if os.name == "posix":
        try:
            os.killpg(os.getpgrp(), signal.SIGKILL)
        except OSError:
            pass
    os._exit(1)


def _parent_is_alive(parent_pid: int) -> bool:
    """Probe the supervising process without signalling it.

    The sandbox reparents this worker through its wrapper chain, and denies signals to
    processes outside the sandbox with EPERM; only ESRCH proves the supervisor is gone.
    """
    try:
        os.kill(parent_pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def _watch_parent(
    parent_pid: int,
    temporary_root: Path,
    parent_is_alive: Any = _parent_is_alive,
    wait: Any = time.sleep,
    terminate: Any = _terminate_orphaned_process_tree,
) -> None:
    while parent_is_alive(parent_pid):
        wait(0.25)
    terminate(temporary_root)


def _start_parent_watchdog(parent_pid: int, temporary_root: Path) -> None:
    if not _parent_is_alive(parent_pid):
        # A PID namespace (Linux Bubblewrap) hides the supervisor entirely; there the sandbox
        # itself dies with its parent, and a supervisor already gone closes stdin instead.
        return
    threading.Thread(
        target=_watch_parent,
        args=(parent_pid, temporary_root),
        name="tau-parent-watchdog",
        daemon=True,
    ).start()


def _isolate_stdout() -> None:
    """Reserve the original stdout descriptor for protocol output."""

    global _PROTOCOL_OUTPUT
    _PROTOCOL_OUTPUT = os.fdopen(os.dup(1), "w", encoding="utf-8", buffering=1)
    os.dup2(2, 1)
    sys.stdout = os.fdopen(os.dup(2), "w", encoding="utf-8", buffering=1)


def send(frame: dict[str, Any]) -> None:
    """Write one protocol frame, refusing one over the frame cap."""

    encoded = json.dumps(frame, separators=(",", ":"), ensure_ascii=False)
    if len(encoded.encode("utf-8")) > MAX_FRAME_BYTES:
        raise RuntimeError("Protocol response exceeds the maximum frame size")
    _PROTOCOL_OUTPUT.write(encoded + "\n")


def runtime_issue(error: BaseException, workspace: Path, entry_path: str | None) -> dict[str, Any]:
    """The structured issue for an exception, located at the innermost project frame, else at the entry."""

    workspace = workspace.resolve()
    location: dict[str, Any] | None = None
    for frame in reversed(traceback.extract_tb(error.__traceback__)):
        try:
            relative = Path(frame.filename).resolve().relative_to(workspace).as_posix()
        except ValueError:
            continue
        location = {
            "fileName": relative,
            "startLineNumber": frame.lineno,
            "startColumn": 1,
        }
        break
    if location is None and entry_path is not None:
        location = {"fileName": entry_path, "startLineNumber": 1, "startColumn": 1}
    return {
        "message": str(error) or type(error).__name__,
        "code": "PYTHON_RUNTIME",
        "type": "runtime",
        "severity": "error",
        **({"location": location} if location else {}),
    }


def _is_relative_to(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


class Artifacts:
    """The private directory a worker writes artifacts into and reads caller-named bundles from."""

    def __init__(self, root: Path) -> None:
        self.root = root.resolve()

    def create(self, suffix: str) -> Path:
        """A fresh artifact path inside the private directory."""

        path = self.root / f"{uuid.uuid4().hex}.{suffix}"
        if not _is_relative_to(path.resolve(), self.root):
            raise RuntimeError("Artifact path escaped the private directory")
        return path

    def confined(self, descriptor: Any, *, max_bytes: int, label: str) -> Path:
        """Resolve one caller-named `{artifactPath, byteLength}` file directly inside the private directory."""

        if not isinstance(descriptor, dict):
            raise TypeError(f"{label} must be an artifact descriptor")
        path_value = descriptor.get("artifactPath")
        byte_length = descriptor.get("byteLength")
        if not isinstance(path_value, str) or type(byte_length) is not int or byte_length < 0:
            raise TypeError(f"{label} descriptor is invalid")
        path = Path(path_value)
        resolved = path.resolve(strict=True)
        if path.is_symlink() or resolved.parent != self.root:
            raise ValueError(f"{label} escaped the private artifact directory")
        if byte_length > max_bytes or resolved.stat().st_size != byte_length:
            raise ValueError(f"{label} has an invalid size")
        return resolved


class Handles(dict[str, Any]):
    """Values a worker retains between requests under opaque ids, at most `limit` at a time."""

    def __init__(self, limit: int, label: str) -> None:
        super().__init__()
        self.limit = limit
        self.label = label

    def retain(self, value: Any) -> str:
        """Retain one value and return its id."""

        if len(self) >= self.limit:
            raise RuntimeError(f"Retained {self.label} handle limit reached")
        handle_id = uuid.uuid4().hex
        self[handle_id] = value
        return handle_id


@dataclass(frozen=True)
class WorkerContext:
    """What a kernel's dispatch is created with: its workspace, its artifacts and the request's cancellation."""

    workspace: Path
    artifacts: Artifacts
    cancelled: threading.Event


def _read_frames(frames: Any, stream: Any, cancelled: threading.Event) -> None:
    """Read protocol frames, observing out-of-band cancellation while a request runs."""

    for line in stream:
        if is_cancel_frame(line):
            cancelled.set()
            continue
        frames.put(line)
    frames.put(None)


def serve(dispatch: Dispatch, context: WorkerContext, *, import_check: str, stream: Any = None) -> bool:
    """Answer requests until shutdown (`True`) or the end of input (`False`).

    `import_check` names the kernel's library, imported before the `ready` frame so the first request is warm.
    """

    importlib.import_module(import_check)
    send({"protocolVersion": PROTOCOL_VERSION, "type": "ready", "pythonVersion": sys.version.split()[0]})
    frames: queue.Queue[bytes | None] = queue.Queue()
    reader = threading.Thread(
        target=_read_frames,
        args=(frames, sys.stdin.buffer if stream is None else stream, context.cancelled),
        daemon=True,
    )
    reader.start()
    seen_requests: set[str] = set()
    for line in iter(frames.get, None):
        context.cancelled.clear()
        entry_path: str | None = None
        request_id = "unknown"
        try:
            if len(line) > MAX_FRAME_BYTES:
                raise ValueError("Protocol request exceeds the maximum frame size")
            request = json.loads(line)
            if not isinstance(request, dict) or request.get("protocolVersion") != PROTOCOL_VERSION:
                raise ValueError("Unsupported protocol frame or version")
            request_id = request.get("requestId")
            method = request.get("method")
            params = request.get("params", {})
            if not isinstance(request_id, str) or not isinstance(method, str) or not isinstance(params, dict):
                raise ValueError("Protocol request has invalid fields")
            if request_id in seen_requests:
                raise ValueError(f"Duplicate protocol request id: {request_id}")
            seen_requests.add(request_id)
            entry_path = params.get("entryPath") if isinstance(params.get("entryPath"), str) else None
            result = dispatch(method, params)
            send({"protocolVersion": PROTOCOL_VERSION, "requestId": request_id, "result": result})
            if method == "shutdown":
                return True
        except AnalysisIssue as error:
            send(
                {
                    "protocolVersion": PROTOCOL_VERSION,
                    "requestId": request_id,
                    "error": {"issues": [error.as_dict(entry_path or "main.py")]},
                }
            )
        except BaseException as error:
            send(
                {
                    "protocolVersion": PROTOCOL_VERSION,
                    "requestId": request_id,
                    "error": {"issues": [runtime_issue(error, context.workspace, entry_path)]},
                }
            )
    return False


def run_worker(create_dispatch: Callable[[WorkerContext], Dispatch], *, temporary_prefix: str, import_check: str) -> None:
    """The worker's entry point: parse the session's arguments, then serve the kernel's dispatch.

    The workspace and artifacts must share one private root named `<temporary_prefix>*`, the directory the kernel's
    workspace mirror created; the worker removes it when its input ends without a shutdown.
    """

    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--artifacts", type=Path, required=True)
    parser.add_argument("--parent-pid", type=int, required=True)
    arguments = parser.parse_args()
    arguments.workspace.mkdir(parents=True, exist_ok=True)
    arguments.artifacts.mkdir(parents=True, exist_ok=True)
    temporary_root = arguments.workspace.resolve().parent
    if arguments.artifacts.resolve().parent != temporary_root or not temporary_root.name.startswith(temporary_prefix):
        parser.error(f"workspace and artifacts must share a {temporary_prefix}* private root")
    sys.path.insert(0, str(arguments.workspace))
    _isolate_stdout()
    _start_parent_watchdog(arguments.parent_pid, temporary_root)
    context = WorkerContext(
        workspace=arguments.workspace.resolve(), artifacts=Artifacts(arguments.artifacts), cancelled=threading.Event()
    )
    if not serve(create_dispatch(context), context, import_check=import_check):
        shutil.rmtree(temporary_root, ignore_errors=True)
