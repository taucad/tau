"""Warm native Build123d worker. Stdout is reserved for NDJSON protocol frames."""

from __future__ import annotations

import argparse
import asyncio
import dataclasses
import importlib
import importlib.util
import json
import math
import os
import re
import signal
import shutil
import sys
import threading
import time
import traceback
import unicodedata
import uuid
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from analyzer import AnalysisIssue, analyze_project
from glb import write_glb

PROTOCOL_VERSION = 1
MAX_FRAME_BYTES = 1_048_576
MAX_HANDLES = 32

_PROTOCOL_OUTPUT = sys.stdout


def _terminate_orphaned_process_tree(temporary_root: Path) -> None:
    """Exit the detached worker group after its Node owner disappears."""

    shutil.rmtree(temporary_root, ignore_errors=True)
    if os.name == "posix":
        try:
            os.killpg(os.getpgrp(), signal.SIGKILL)
        except OSError:
            pass
    os._exit(1)


def _watch_parent(
    parent_pid: int,
    temporary_root: Path,
    current_parent: Any = os.getppid,
    wait: Any = time.sleep,
    terminate: Any = _terminate_orphaned_process_tree,
) -> None:
    while current_parent() == parent_pid:
        wait(0.25)
    terminate(temporary_root)


def _start_parent_watchdog(parent_pid: int, temporary_root: Path) -> None:
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


def _send(frame: dict[str, Any]) -> None:
    encoded = json.dumps(frame, separators=(",", ":"), ensure_ascii=False)
    if len(encoded.encode("utf-8")) > MAX_FRAME_BYTES:
        raise RuntimeError("Protocol response exceeds the maximum frame size")
    _PROTOCOL_OUTPUT.write(encoded + "\n")


def _runtime_issue(error: BaseException, workspace: Path, entry_path: str | None) -> dict[str, Any]:
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


def _project_modules(workspace: Path) -> dict[str, str]:
    result: dict[str, str] = {}
    for name, module in tuple(sys.modules.items()):
        file_name = getattr(module, "__file__", None)
        if not isinstance(file_name, str):
            continue
        path = Path(file_name)
        if not path.is_absolute():
            path = path.absolute()
        if _is_relative_to(path, workspace) and path.suffix == ".py":
            result[name] = path.relative_to(workspace).as_posix()
    return result


def _evict_project_modules(workspace: Path) -> None:
    for name in _project_modules(workspace):
        sys.modules.pop(name, None)
    importlib.invalidate_caches()


def _validate_parameters(parameters: Any, schema: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(parameters, dict):
        raise TypeError("Parameters must be an object")
    properties = schema["properties"]
    unknown = set(parameters) - set(properties)
    if unknown:
        raise TypeError(f"Unknown parameters: {', '.join(sorted(unknown))}")
    validated = {name: definition["default"] for name, definition in properties.items()}
    validated.update(parameters)
    for name, value in validated.items():
        definition = properties[name]
        expected = definition["type"]
        valid = {
            "boolean": type(value) is bool,
            "integer": type(value) is int,
            "number": isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value),
            "string": isinstance(value, str),
        }[expected]
        if not valid:
            raise TypeError(f"Parameter '{name}' must be {expected}")
        if "enum" in definition and value not in definition["enum"]:
            raise ValueError(f"Parameter '{name}' must be one of {definition['enum']}")
        for key, comparison in (
            ("minimum", lambda left, right: left >= right),
            ("maximum", lambda left, right: left <= right),
            ("exclusiveMinimum", lambda left, right: left > right),
            ("exclusiveMaximum", lambda left, right: left < right),
        ):
            if key in definition and not comparison(value, definition[key]):
                raise ValueError(f"Parameter '{name}' violates {key}")
        if "minLength" in definition and len(value) < definition["minLength"]:
            raise ValueError(f"Parameter '{name}' violates minLength")
        if "maxLength" in definition and len(value) > definition["maxLength"]:
            raise ValueError(f"Parameter '{name}' violates maxLength")
        if "pattern" in definition and re.search(definition["pattern"], value) is None:
            raise ValueError(f"Parameter '{name}' violates pattern")
        if "multipleOf" in definition and not math.isclose(value % definition["multipleOf"], 0.0, abs_tol=1e-12):
            raise ValueError(f"Parameter '{name}' violates multipleOf")
    return validated


def _load_model(workspace: Path, entry_path: str, parameters: Any) -> tuple[tuple[Any, ...], list[str]]:
    workspace = workspace.resolve()
    analysis = analyze_project(workspace, entry_path)
    validated = _validate_parameters(parameters, analysis["jsonSchema"])
    _evict_project_modules(workspace)
    before = _project_modules(workspace)
    entry = workspace / entry_path
    module_name = f"_tau_build123d_{uuid.uuid4().hex}"
    spec = importlib.util.spec_from_file_location(module_name, entry)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load Python entry: {entry_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    try:
        spec.loader.exec_module(module)
        params_type = getattr(module, "Params", None)
        main = getattr(module, "main", None)
        if not isinstance(params_type, type) or not dataclasses.is_dataclass(params_type):
            raise TypeError("Params must be a dataclass")
        if not params_type.__dataclass_params__.frozen:
            raise TypeError("Params must be a frozen dataclass")
        if not callable(main):
            raise TypeError("Define a callable main(params) function")
        result = main(params_type(**validated))
        if asyncio.iscoroutine(result):
            result.close()
            raise TypeError("Async main functions are not supported")
        from build123d import Shape

        values = (result,) if isinstance(result, Shape) else tuple(result) if isinstance(result, (list, tuple)) else ()
        if not values or any(not isinstance(shape, Shape) for shape in values):
            raise TypeError("main(params) must return a Shape or a non-empty list/tuple of Shapes")
        if any(not shape.is_valid for shape in values):
            raise ValueError("main(params) returned an invalid shape")
        explicit_labels = [shape.label.strip() for shape in values if shape.label and shape.label.strip()]
        duplicates = sorted({label for label in explicit_labels if explicit_labels.count(label) > 1})
        if duplicates:
            raise ValueError(f"Duplicate explicit shape labels: {', '.join(duplicates)}")
        for index, shape in enumerate(values):
            if not shape.label or not shape.label.strip():
                shape.label = f"Shape {index + 1}"
        observed = sorted(set(_project_modules(workspace).values()) - set(before.values()))
        return values, observed
    finally:
        sys.modules.pop(module_name, None)


def _component_id(label: str, fallback: str) -> str:
    if re.fullmatch(r"Shape[ _]\d+", label):
        return fallback
    slug = unicodedata.normalize("NFKD", label.lower()).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", slug).strip("-")
    return f"component:{slug}" if slug else fallback


def _point(vector: Any) -> tuple[float, float, float]:
    return (float(vector.X) / 1000, float(vector.Z) / 1000, -float(vector.Y) / 1000)


def _normal(a: tuple[float, float, float], b: tuple[float, float, float], c: tuple[float, float, float]) -> tuple[float, float, float]:
    left = (b[0] - a[0], b[1] - a[1], b[2] - a[2])
    right = (c[0] - a[0], c[1] - a[1], c[2] - a[2])
    cross = (
        left[1] * right[2] - left[2] * right[1],
        left[2] * right[0] - left[0] * right[2],
        left[0] * right[1] - left[1] * right[0],
    )
    length = math.hypot(*cross)
    return (0.0, 1.0, 0.0) if length == 0 else tuple(value / length for value in cross)  # type: ignore[return-value]


def _mesh_shape(shape: Any, linear_tolerance: float, angular_tolerance: float) -> dict[str, Any]:
    located = shape.moved(shape.location.inverse() * shape.global_location)
    positions: list[float] = []
    normals: list[float] = []
    indices: list[int] = []
    face_groups: list[dict[str, int]] = []
    for face_id, face in enumerate(located.faces(), 1):
        vertices, triangles = face.tessellate(linear_tolerance, angular_tolerance)
        start = len(indices)
        for triangle in triangles:
            points = [_point(vertices[index]) for index in triangle]
            normal = _normal(*points)
            for point in points:
                positions.extend(point)
                normals.extend(normal)
                indices.append(len(indices))
        face_groups.append({"start": start, "count": len(indices) - start, "faceId": face_id})

    lines: list[float] = []
    line_indices: list[int] = []
    edge_groups: list[dict[str, int]] = []
    for edge_id, edge in enumerate(located.edges(), 1):
        points = [_point(point) for point in edge.positions(deflection=linear_tolerance)]
        start = len(line_indices)
        for first, second in zip(points, points[1:]):
            lines.extend(first)
            lines.extend(second)
            line_indices.extend((len(line_indices), len(line_indices) + 1))
        edge_groups.append({"start": start, "count": len(line_indices) - start, "edgeId": edge_id})
    color = tuple(shape.color) if shape.color is not None else (0.8, 0.8, 0.82, 1.0)
    return {
        "positions": positions,
        "normals": normals,
        "indices": indices,
        "faceGroups": face_groups,
        "lines": lines,
        "lineIndices": line_indices,
        "edgeGroups": edge_groups,
        "color": color,
    }


def _topology(shapes: tuple[Any, ...], linear_tolerance: float, angular_tolerance: float) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    components: list[dict[str, Any]] = []
    meshes: dict[str, dict[str, Any]] = {}
    used_ids: set[str] = set()
    mesh_index = 0

    def unique(base: str) -> str:
        candidate = base
        occurrence = 2
        while candidate in used_ids:
            candidate = f"{base}#{occurrence}"
            occurrence += 1
        used_ids.add(candidate)
        return candidate

    def visit(shape: Any, parent_id: str | None, fallback_name: str) -> str:
        nonlocal mesh_index
        children = list(shape.children)
        label = shape.label.strip() if shape.label and shape.label.strip() else fallback_name
        fallback = f"component:assembly-{len(components)}" if children else f"component:node-{mesh_index}"
        component_id = unique(_component_id(label, fallback))
        component: dict[str, Any] = {
            "id": component_id,
            "name": label,
            "kind": "assembly" if children else "part",
            "selector": f"component/{len(components)}" if children else f"node/{mesh_index}",
            "capabilities": {
                "hasPreciseTopology": True,
                "exports": [
                    {"fidelity": "mesh", "formats": ["glb"], "available": True},
                    {"fidelity": "brep", "formats": ["step", "stp"], "available": True},
                ],
            },
        }
        if parent_id is not None:
            component["parentId"] = parent_id
        components.append(component)
        if children:
            component["childIds"] = [visit(child, component_id, f"Component {index + 1}") for index, child in enumerate(children)]
        else:
            meshes[component_id] = _mesh_shape(shape, linear_tolerance, angular_tolerance)
            mesh_index += 1
        return component_id

    for index, shape in enumerate(shapes):
        visit(shape, None, f"Shape {index + 1}")
    return components, meshes


class Worker:
    def __init__(self, workspace: Path, artifacts: Path) -> None:
        self.workspace = workspace.resolve()
        self.artifacts = artifacts.resolve()
        self.handles: dict[str, tuple[Any, ...]] = {}
        self.seen_requests: set[str] = set()

    def _artifact(self, suffix: str) -> Path:
        path = self.artifacts / f"{uuid.uuid4().hex}.{suffix}"
        if not _is_relative_to(path.resolve(), self.artifacts):
            raise RuntimeError("Artifact path escaped the private directory")
        return path

    def dispatch(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        if method == "analyze":
            return analyze_project(self.workspace, params["entryPath"], params.get("observedDependencies"))
        if method == "build":
            if len(self.handles) >= MAX_HANDLES:
                raise RuntimeError("Retained Build123d handle limit reached")
            shapes, observed = _load_model(self.workspace, params["entryPath"], params.get("parameters", {}))
            handle_id = uuid.uuid4().hex
            self.handles[handle_id] = shapes
            return {"handleId": handle_id, "observedDependencies": observed}
        if method == "mesh":
            shapes = self.handles[params["handleId"]]
            components, meshes = _topology(shapes, params["linearTolerance"], params["angularTolerance"])
            artifact = self._artifact("glb")
            write_glb(artifact, components, meshes)
            return {"artifactPath": str(artifact), "byteLength": artifact.stat().st_size}
        if method == "export":
            if params["format"] != "step":
                raise ValueError(f"Unsupported Build123d export format: {params['format']}")
            shapes = self.handles[params["handleId"]]
            from build123d import Compound, export_step

            artifact = self._artifact("step")
            exported = shapes[0] if len(shapes) == 1 else Compound(children=list(shapes))
            if not export_step(exported, artifact):
                raise RuntimeError("Build123d failed to export STEP")
            return {"artifactPath": str(artifact), "byteLength": artifact.stat().st_size}
        if method == "release":
            self.handles.pop(params["handleId"], None)
            return {}
        if method == "shutdown":
            self.handles.clear()
            return {"shutdown": True}
        raise ValueError(f"Unknown protocol method: {method}")

    def run(self) -> bool:
        importlib.import_module("build123d")
        _send({"protocolVersion": PROTOCOL_VERSION, "type": "ready", "pythonVersion": sys.version.split()[0]})
        for line in sys.stdin.buffer:
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
                if request_id in self.seen_requests:
                    raise ValueError(f"Duplicate protocol request id: {request_id}")
                self.seen_requests.add(request_id)
                entry_path = params.get("entryPath") if isinstance(params.get("entryPath"), str) else None
                result = self.dispatch(method, params)
                _send({"protocolVersion": PROTOCOL_VERSION, "requestId": request_id, "result": result})
                if method == "shutdown":
                    return True
            except AnalysisIssue as error:
                _send(
                    {
                        "protocolVersion": PROTOCOL_VERSION,
                        "requestId": request_id,
                        "error": {"issues": [error.as_dict(entry_path or "main.py")]},
                    }
                )
            except BaseException as error:
                _send(
                    {
                        "protocolVersion": PROTOCOL_VERSION,
                        "requestId": request_id,
                        "error": {"issues": [_runtime_issue(error, self.workspace, entry_path)]},
                    }
                )
        return False


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--artifacts", type=Path, required=True)
    parser.add_argument("--parent-pid", type=int, required=True)
    arguments = parser.parse_args()
    arguments.workspace.mkdir(parents=True, exist_ok=True)
    arguments.artifacts.mkdir(parents=True, exist_ok=True)
    temporary_root = arguments.workspace.resolve().parent
    if arguments.artifacts.resolve().parent != temporary_root or not temporary_root.name.startswith("tau-build123d-"):
        parser.error("workspace and artifacts must share a tau-build123d-* private root")
    sys.path.insert(0, str(arguments.workspace))
    _isolate_stdout()
    _start_parent_watchdog(arguments.parent_pid, temporary_root)
    if not Worker(arguments.workspace, arguments.artifacts).run():
        shutil.rmtree(temporary_root, ignore_errors=True)


if __name__ == "__main__":
    main()
