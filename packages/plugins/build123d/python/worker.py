"""Warm native Build123d worker. Stdout is reserved for NDJSON protocol frames."""

from __future__ import annotations

import argparse
import asyncio
import base64
from contextlib import nullcontext
import dataclasses
import hashlib
import importlib
import importlib.util
import inspect
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
MAX_COMPUTE_PRELOAD_BYTES = 96 * 1024 * 1024
_DIGEST = re.compile(r"^sha256:[0-9a-f]{64}$")

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


class _ComputeBypass(Exception):
    """Internal signal for values outside the deterministic allow-list."""


def _canonical_compute_value(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def _compute_value(value: Any) -> Any:
    if value is None or type(value) in (bool, int, str):
        return value
    if type(value) is float:
        if not math.isfinite(value):
            raise _ComputeBypass()
        return 0 if value == 0 else int(value) if value.is_integer() else value
    if isinstance(value, (list, tuple)):
        return [_compute_value(item) for item in value]
    from build123d import Plane

    if isinstance(value, Plane):
        return {
            "origin": _compute_value(tuple(value.origin)),
            "xDirection": _compute_value(tuple(value.x_dir)),
            "zDirection": _compute_value(tuple(value.z_dir)),
        }
    raise _ComputeBypass()


def _brep_bytes(shape: Any) -> bytes:
    from build123d.persistence import serialize_shape

    return serialize_shape(shape.wrapped)


def _shape_from_brep(data: bytes) -> Any:
    from build123d import Compound
    from build123d.persistence import deserialize_shape

    return Compound.cast(deserialize_shape(data))


def _content_digest(data: bytes) -> str:
    return f"sha256:{hashlib.sha256(data).hexdigest()}"


class _ComputeAdapter:
    """Version-pinned synchronous semantic reuse for deterministic Build123d operations."""

    _primitive_names = ("make_box", "make_cone", "make_cylinder", "make_sphere", "make_torus")

    def __init__(self, artifacts: Path, config: Any) -> None:
        if not isinstance(config, dict):
            raise TypeError("Build123d compute configuration must be an object")
        self.artifacts = artifacts.resolve()
        self.namespace = config.get("namespace")
        self.producer = config.get("producer")
        self.environment = config.get("environment")
        if not isinstance(self.namespace, str) or not isinstance(self.producer, dict):
            raise TypeError("Build123d compute identity is invalid")
        self.available: dict[str, bytes] = {}
        self.publications: list[dict[str, Any]] = []
        self._patches: list[tuple[type[Any], str, Any]] = []
        self._read_preload(config.get("preload"))

    def _read_preload(self, descriptor: Any) -> None:
        if not isinstance(descriptor, dict):
            raise TypeError("Build123d compute preload must be an artifact descriptor")
        path_value = descriptor.get("artifactPath")
        byte_length = descriptor.get("byteLength")
        if not isinstance(path_value, str) or type(byte_length) is not int or byte_length < 0:
            raise TypeError("Build123d compute preload descriptor is invalid")
        path = Path(path_value)
        resolved = path.resolve(strict=True)
        if path.is_symlink() or resolved.parent != self.artifacts:
            raise ValueError("Build123d compute preload escaped the private artifact directory")
        try:
            if byte_length > MAX_COMPUTE_PRELOAD_BYTES or resolved.stat().st_size != byte_length:
                raise ValueError("Build123d compute preload has an invalid size")
            payload = json.loads(resolved.read_bytes())
        finally:
            resolved.unlink(missing_ok=True)
        if not isinstance(payload, dict) or payload.get("schemaVersion") != 1 or not isinstance(payload.get("entries"), list):
            raise ValueError("Build123d compute preload is invalid")
        for entry in payload["entries"]:
            self._add_prepared(entry)

    def _add_prepared(self, entry: Any) -> None:
        if not isinstance(entry, dict):
            raise ValueError("Build123d compute preload entry is invalid")
        canonical_action = entry.get("canonicalAction")
        content_digest = entry.get("contentDigest")
        action_digest = entry.get("actionDigest")
        encoded = entry.get("bytes")
        if (
            not isinstance(canonical_action, str)
            or not isinstance(content_digest, str)
            or not _DIGEST.fullmatch(content_digest)
            or not isinstance(action_digest, str)
            or not _DIGEST.fullmatch(action_digest)
            or not isinstance(encoded, str)
        ):
            raise ValueError("Build123d compute preload entry identity is invalid")
        try:
            action = json.loads(canonical_action)
            data = base64.b64decode(encoded, validate=True)
        except (ValueError, json.JSONDecodeError) as error:
            raise ValueError("Build123d compute preload entry payload is invalid") from error
        if _content_digest(data) != content_digest:
            raise ValueError("Build123d compute preload content digest is invalid")
        key = _canonical_compute_value(action)
        previous = self.available.get(key)
        if previous is not None and previous != data:
            raise ValueError("Build123d compute preload contains conflicting artifacts")
        self.available[key] = data

    def _action(self, operation: str, inputs: list[dict[str, str]], arguments: Any) -> dict[str, Any]:
        return {
            "schemaVersion": 1,
            "namespace": self.namespace,
            "producer": self.producer,
            "operation": operation,
            "inputs": inputs,
            "arguments": arguments,
            "environment": self.environment,
            "codec": {"id": "build123d.bintools-brep", "version": "1"},
        }

    def _invoke(self, action: dict[str, Any], compute: Any) -> Any:
        key = _canonical_compute_value(action)
        cached = self.available.get(key)
        if cached is not None:
            return _shape_from_brep(cached)
        result = compute()
        try:
            data = _brep_bytes(result)
        except Exception:
            return result
        self.available[key] = data
        self.publications.append(
            {
                "action": action,
                "bytes": base64.b64encode(data).decode("ascii"),
                "mediaType": "application/vnd.opencascade.brep",
            }
        )
        return result

    def _primitive(self, name: str, original: Any, signature: inspect.Signature, args: tuple[Any, ...], kwargs: dict[str, Any]) -> Any:
        try:
            bound = signature.bind(*args, **kwargs)
            bound.apply_defaults()
            arguments = {key: _compute_value(value) for key, value in bound.arguments.items()}
        except (TypeError, _ComputeBypass):
            return original(*args, **kwargs)
        return self._invoke(self._action(f"Solid.{name}", [], arguments), lambda: original(*args, **kwargs))

    def _boolean(self, name: str, original: Any, shape: Any, args: tuple[Any, ...], kwargs: dict[str, Any]) -> Any:
        try:
            signature = inspect.signature(original)
            bound = signature.bind(shape, *args, **kwargs)
            bound.apply_defaults()
            operand_name = "to_fuse" if name == "fuse" else "to_cut"
            operands = bound.arguments[operand_name]
            shape_inputs = (shape, *operands)
            inputs = [
                {"kind": "content", "role": "receiver" if index == 0 else f"operand:{index - 1}", "digest": _content_digest(_brep_bytes(item))}
                for index, item in enumerate(shape_inputs)
            ]
            arguments = (
                {"glue": _compute_value(bound.arguments["glue"]), "tolerance": _compute_value(bound.arguments["tol"])}
                if name == "fuse"
                else {}
            )
        except (KeyError, TypeError, _ComputeBypass, AttributeError):
            return original(shape, *args, **kwargs)
        return self._invoke(
            self._action(f"Shape.{name}", inputs, arguments),
            lambda: original(shape, *args, **kwargs),
        )

    def __enter__(self) -> _ComputeAdapter:
        from build123d import Shape, Solid

        for name in self._primitive_names:
            descriptor = inspect.getattr_static(Solid, name)
            original = getattr(Solid, name)
            signature = inspect.signature(original)

            def patched(
                _shape_type: type[Any],
                *args: Any,
                _name: str = name,
                _original: Any = original,
                _signature: inspect.Signature = signature,
                **kwargs: Any,
            ) -> Any:
                return self._primitive(_name, _original, _signature, args, kwargs)

            self._patches.append((Solid, name, descriptor))
            setattr(Solid, name, classmethod(patched))
        for name in ("fuse", "cut"):
            descriptor = inspect.getattr_static(Shape, name)
            original = getattr(Shape, name)

            def patched(shape: Any, *args: Any, _name: str = name, _original: Any = original, **kwargs: Any) -> Any:
                return self._boolean(_name, _original, shape, args, kwargs)

            self._patches.append((Shape, name, descriptor))
            setattr(Shape, name, patched)
        return self

    def __exit__(self, _error_type: Any, _error: Any, _traceback: Any) -> None:
        for shape_type, name, descriptor in reversed(self._patches):
            setattr(shape_type, name, descriptor)
        self._patches.clear()


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

    def _write_compute_publications(self, adapter: _ComputeAdapter) -> dict[str, Any] | None:
        if not adapter.publications:
            return None
        artifact = self._artifact("compute-publications.json")
        payload = json.dumps({"publications": adapter.publications}, separators=(",", ":"), ensure_ascii=False).encode()
        try:
            artifact.write_bytes(payload)
        except OSError:
            artifact.unlink(missing_ok=True)
            return None
        return {"artifactPath": str(artifact), "byteLength": len(payload)}

    def dispatch(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        if method == "analyze":
            return analyze_project(self.workspace, params["entryPath"], params.get("observedDependencies"))
        if method == "build":
            if len(self.handles) >= MAX_HANDLES:
                raise RuntimeError("Retained Build123d handle limit reached")
            adapter = _ComputeAdapter(self.artifacts, params["compute"]) if "compute" in params else None
            with adapter if adapter is not None else nullcontext():
                shapes, observed = _load_model(self.workspace, params["entryPath"], params.get("parameters", {}))
            handle_id = uuid.uuid4().hex
            self.handles[handle_id] = shapes
            compute_artifact = self._write_compute_publications(adapter) if adapter is not None else None
            return {
                "handleId": handle_id,
                "observedDependencies": observed,
                **({"computeArtifact": compute_artifact} if compute_artifact else {}),
            }
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
