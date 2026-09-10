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
import queue
import re
import signal
import shutil
import sys
import threading
import time
import traceback
import types
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
MAX_COMPUTE_BUNDLE_BYTES = 96 * 1024 * 1024
# EQ16: one control frame carries at most this many descriptors under the 1 MiB frame cap.
MAX_COMPUTE_DESCRIPTORS = 512
# EQ27: retain an operation whose own kernel call took at least this many milliseconds.
COMPUTE_ADMISSION_FLOOR = 5.0
# EQ12: resident bounds for the Build123d worker.
MAX_COMPUTE_RESIDENT_BYTES = 256 * 1024 * 1024
MAX_COMPUTE_RESIDENT_ENTRIES = 4096
MAX_COMPUTE_STAMPS = 16384
MAX_COMPUTE_LINEAGE_DEPTH = 8
# D18: cheap conservative provisional charge, reconciled by the exported length off-path.
COMPUTE_BASE_CHARGE_BYTES = 4096
COMPUTE_FACE_CHARGE_BYTES = 512
_DIGEST = re.compile(r"^sha256:[0-9a-f]{64}$")

_PROTOCOL_OUTPUT = sys.stdout


def _is_cancel_frame(line: bytes) -> bool:
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
    prefix = os.path.join(str(workspace.resolve()), "")
    result: dict[str, str] = {}
    for name, module in sys.modules.copy().items():
        file_name = getattr(module, "__file__", None)
        if not isinstance(file_name, str):
            continue
        if not os.path.isabs(file_name):
            file_name = os.path.abspath(file_name)
        if file_name.startswith(prefix) and file_name.endswith(".py") and os.path.basename(file_name) != ".py":
            result[name] = os.path.relpath(file_name, workspace).replace(os.sep, "/")
    return result


def _evict_project_modules(workspace: Path) -> None:
    for name in _project_modules(workspace):
        sys.modules.pop(name, None)
    importlib.invalidate_caches()


class _ComputeBypass(Exception):
    """Internal signal for values outside the deterministic allow-list."""


class _ComputeCancelled(Exception):
    """Cooperative cancellation observed at a safe operation boundary."""


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


def _cast_shape(wrapped: Any) -> Any:
    from build123d import Compound

    return Compound.cast(wrapped)


def _shape_from_brep(data: bytes) -> Any:
    from build123d import Compound
    from build123d.persistence import deserialize_shape

    return Compound.cast(deserialize_shape(data))


def _content_digest(data: bytes) -> str:
    return f"sha256:{hashlib.sha256(data).hexdigest()}"


def _action_digest(action: dict[str, Any]) -> str:
    return _content_digest(_canonical_compute_value(action).encode())


def _implementation_value(value: Any) -> Any:
    """Represent one implementation constant, including nested code, by value."""

    if value is None or type(value) in (bool, int, float, str):
        return repr(value)
    if isinstance(value, (list, tuple, set, frozenset)):
        return [_implementation_value(item) for item in value]
    if isinstance(value, dict):
        return {repr(key): _implementation_value(item) for key, item in value.items()}
    if isinstance(value, types.CodeType):
        return _implementation_fingerprint(value)
    return repr(value)


def _implementation_fingerprint(code: types.CodeType) -> dict[str, Any]:
    return {
        "code": base64.b64encode(code.co_code).decode("ascii"),
        "consts": _implementation_value(code.co_consts),
        "names": list(code.co_names),
        "varnames": list(code.co_varnames),
        "argcount": code.co_argcount,
        "kwonlyargcount": code.co_kwonlyargcount,
        "flags": code.co_flags,
    }


def _callable_fingerprint(function: Any) -> str:
    """Digest one patched implementation by body, constants, nested code and defaults."""

    code = getattr(function, "__code__", None)
    if not isinstance(code, types.CodeType):
        raise _ComputeBypass()
    return _content_digest(
        _canonical_compute_value(
            {
                "qualname": getattr(function, "__qualname__", ""),
                "implementation": _implementation_fingerprint(code),
                "defaults": _implementation_value(getattr(function, "__defaults__", None)),
                "kwdefaults": _implementation_value(getattr(function, "__kwdefaults__", None)),
            }
        ).encode()
    )


def _detached(wrapped: Any) -> Any:
    """A private wrapper over the same native TShape, immune to a caller's in-place move."""

    return wrapped.Located(wrapped.Location())


def _tshape_key(wrapped: Any) -> int:
    """Stable key for the underlying native TShape, independent of location and orientation."""

    from OCP.TopLoc import TopLoc_Location

    return hash(wrapped.Located(TopLoc_Location()))


def _direct_children(wrapped: Any) -> list[Any]:
    from OCP.TopoDS import TopoDS_Iterator

    iterator = TopoDS_Iterator(wrapped)
    children: list[Any] = []
    while iterator.More() and len(children) < MAX_COMPUTE_STAMPS:
        children.append(iterator.Value())
        iterator.Next()
    return children


def _placement(wrapped: Any) -> dict[str, Any]:
    """Canonical absolute placement: the exact location matrix plus orientation."""

    transformation = wrapped.Location().Transformation()
    return {
        "matrix": [
            _compute_value(transformation.Value(row, column)) for row in range(1, 4) for column in range(1, 5)
        ],
        "orientation": int(wrapped.Orientation()),
    }


def _estimate_compute_bytes(shape: Any) -> int:
    """Cheap provisional charge from topology size; never an encode for sizing."""

    from OCP.TopAbs import TopAbs_ShapeEnum
    from OCP.TopExp import TopExp_Explorer

    explorer = TopExp_Explorer(shape.wrapped, TopAbs_ShapeEnum.TopAbs_FACE)
    faces = 0
    while explorer.More():
        faces += 1
        explorer.Next()
    return COMPUTE_BASE_CHARGE_BYTES + faces * COMPUTE_FACE_CHARGE_BYTES


class _ComputeCache:
    """Worker-lifetime resident lineage cache holding live native shapes."""

    def __init__(self) -> None:
        self.residents: dict[str, Any] = {}
        self.actions: dict[str, dict[str, Any]] = {}
        self.charges: dict[str, int] = {}
        self.stamps: dict[int, list[tuple[Any, str]]] = {}
        self.logical_bytes = 0
        self.evictions = 0
        self.omissions = 0
        self.generation = 0

    def stamp(self, shape: Any, digest: str) -> None:
        """Record lineage against the native TShape, holding a reference so it cannot be aliased."""

        wrapped = shape.wrapped
        while len(self.stamps) >= MAX_COMPUTE_STAMPS:
            self.stamps.pop(next(iter(self.stamps)))
        self.stamps.setdefault(_tshape_key(wrapped), []).append((_detached(wrapped), digest))

    def partners(self, wrapped: Any) -> list[tuple[Any, str]]:
        """Stamped shapes sharing this native TShape, verified past the hash bucket."""

        return [entry for entry in self.stamps.get(_tshape_key(wrapped), ()) if entry[0].IsPartner(wrapped)]

    def get(self, digest: str) -> Any:
        """Return a share-mode clone of one resident, or None. No I/O, codec or mesh work."""

        shape = self.residents.get(digest)
        if shape is None:
            return None
        self.residents[digest] = self.residents.pop(digest)
        return _cast_shape(_detached(shape.wrapped))

    def put(self, digest: str, shape: Any, action: dict[str, Any], charge: int) -> None:
        if digest in self.residents:
            return
        wrapped = shape.wrapped
        self.residents[digest] = _cast_shape(_detached(wrapped))
        self.actions[digest] = action
        self.charges[digest] = charge
        self.logical_bytes += charge
        while self.residents and (
            self.logical_bytes > MAX_COMPUTE_RESIDENT_BYTES or len(self.residents) > MAX_COMPUTE_RESIDENT_ENTRIES
        ):
            self._evict(next(iter(self.residents)))

    def _evict(self, digest: str) -> None:
        self.residents.pop(digest, None)
        self.actions.pop(digest, None)
        self.logical_bytes -= self.charges.pop(digest, 0)
        self.evictions += 1

    def adopt(self, action: dict[str, Any], digest: str, data: bytes) -> bool:
        """Import warm bytes. Integrity is proven; validity is not, so it is not recorded."""

        try:
            shape = _shape_from_brep(data)
        except Exception:
            self.omissions += 1
            return False
        self.put(digest, shape, action, len(data))
        return True

    def clear(self, generation: int) -> None:
        self.residents.clear()
        self.actions.clear()
        self.charges.clear()
        self.stamps.clear()
        self.logical_bytes = 0
        self.generation = generation

    def stats(self) -> dict[str, Any]:
        return {
            "entries": len(self.residents),
            "logicalBytes": self.logical_bytes,
            "evictions": self.evictions,
            "omissions": self.omissions,
        }


class _ComputeAdapter:
    """Version-pinned synchronous semantic reuse for deterministic Build123d operations."""

    _primitive_names = ("make_box", "make_cone", "make_cylinder", "make_sphere", "make_torus")

    def __init__(self, cache: _ComputeCache, config: Any, cancelled: Any = None) -> None:
        if not isinstance(config, dict):
            raise TypeError("Build123d compute configuration must be an object")
        self.cache = cache
        self.namespace = config.get("namespace")
        self.producer = config.get("producer")
        self.environment = config.get("environment")
        if not isinstance(self.namespace, str) or not isinstance(self.producer, dict):
            raise TypeError("Build123d compute identity is invalid")
        self.cancelled = cancelled
        self.announcements: list[dict[str, Any]] = []
        self.hits = 0
        self._patches: list[tuple[type[Any], str, Any]] = []
        self._fingerprints: dict[str, str] = {}

    def _action(self, operation: str, inputs: list[dict[str, str]], arguments: Any) -> dict[str, Any]:
        producer = {
            **self.producer,
            "implementationAssets": [
                *self.producer.get("implementationAssets", []),
                self._fingerprints[operation],
            ],
        }
        return {
            "schemaVersion": 1,
            "namespace": self.namespace,
            "producer": producer,
            "operation": operation,
            "inputs": inputs,
            "arguments": arguments,
            "environment": self.environment,
            "codec": {"id": "build123d.bintools-brep", "version": "1"},
        }

    def lineage(self, shape: Any) -> str | None:
        """Identify a live shape by lineage alone; an unknown operand is a bypass, never a hit."""

        return self._identify(getattr(shape, "wrapped", None), 0)

    def _identify(self, wrapped: Any, depth: int) -> str | None:
        if wrapped is None or depth > MAX_COMPUTE_LINEAGE_DEPTH:
            return None
        partners = self.cache.partners(wrapped)
        for stamped, digest in partners:
            if stamped.IsSame(wrapped) and stamped.Orientation() == wrapped.Orientation():
                return digest
        if partners:
            return self._derive("Shape.located", [partners[0][1]], wrapped)
        children = _direct_children(wrapped)
        sources = [self._identify(child, depth + 1) for child in children]
        if not sources or any(source is None for source in sources):
            self.cache.omissions += 1
            return None
        return self._derive("Shape.compose", sources, wrapped)

    def _derive(self, operation: str, sources: list[str], wrapped: Any) -> str:
        """Name a placement or composition of already identified shapes. Never a stored result."""

        action = {
            "schemaVersion": 1,
            "namespace": self.namespace,
            "producer": self.producer,
            "operation": operation,
            "inputs": [
                {"kind": "action", "role": f"source:{index}", "digest": digest}
                for index, digest in enumerate(sources)
            ],
            "arguments": _placement(wrapped),
            "environment": self.environment,
            "codec": {"id": "build123d.bintools-brep", "version": "1"},
        }
        digest = _action_digest(action)
        self.cache.stamps.setdefault(_tshape_key(wrapped), []).append((_detached(wrapped), digest))
        return digest

    def _checkpoint(self) -> None:
        if self.cancelled is not None and self.cancelled.is_set():
            raise _ComputeCancelled()

    def _invoke(self, action: dict[str, Any], compute: Any) -> Any:
        self._checkpoint()
        digest = _action_digest(action)
        cached = self.cache.get(digest)
        if cached is not None:
            self.hits += 1
            self.cache.stamp(cached, digest)
            return cached
        started = time.perf_counter()
        result = compute()
        duration = (time.perf_counter() - started) * 1000
        from build123d import Shape

        if not isinstance(result, Shape) or result.wrapped is None:
            return result
        self.cache.stamp(result, digest)
        if duration >= COMPUTE_ADMISSION_FLOOR:
            charge = _estimate_compute_bytes(result)
            self.cache.put(digest, result, action, charge)
            self.announcements.append(
                {
                    "action": action,
                    "actionDigest": digest,
                    "computeDuration": duration,
                    "estimatedBytes": charge,
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
            lineage = [self.lineage(item) for item in (shape, *operands)]
            if any(digest is None for digest in lineage):
                raise _ComputeBypass()
            inputs = [
                {"kind": "action", "role": "receiver" if index == 0 else f"operand:{index - 1}", "digest": digest}
                for index, digest in enumerate(lineage)
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
            try:
                self._fingerprints[f"Solid.{name}"] = _callable_fingerprint(original)
            except _ComputeBypass:
                continue
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
            try:
                self._fingerprints[f"Shape.{name}"] = _callable_fingerprint(original)
            except _ComputeBypass:
                continue

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


def _validate_results(values: tuple[Any, ...]) -> None:
    """Validate every final result (G-F13)."""

    for shape in values:
        if not shape.is_valid:
            raise ValueError("main(params) returned an invalid shape")


def _load_model(workspace: Path, entry_path: str, parameters: Any, adapter: Any = None) -> tuple[tuple[Any, ...], list[str]]:
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
        _validate_results(values)
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
    from OCP.BRep import BRep_Tool
    from OCP.BRepMesh import BRepMesh_IncrementalMesh
    from OCP.TopAbs import TopAbs_Orientation
    from OCP.TopLoc import TopLoc_Location

    located = shape.moved(shape.location.inverse() * shape.global_location)
    BRepMesh_IncrementalMesh(located.wrapped, linear_tolerance, True, angular_tolerance, True)
    positions: list[float] = []
    normals: list[float] = []
    indices: list[int] = []
    face_groups: list[dict[str, int]] = []
    for face_id, face in enumerate(located.faces(), 1):
        location = TopLoc_Location()
        triangulation = BRep_Tool.Triangulation_s(face.wrapped, location)
        transform = location.Transformation()
        vertices = []
        for index in range(1, triangulation.NbNodes() + 1):
            point = triangulation.Node(index).Transformed(transform)
            vertices.append((float(point.X()) / 1000, float(point.Z()) / 1000, -float(point.Y()) / 1000))
        reverse = face.wrapped.Orientation() == TopAbs_Orientation.TopAbs_REVERSED
        start = len(indices)
        for triangle_index in range(1, triangulation.NbTriangles() + 1):
            first, second, third = triangulation.Triangle(triangle_index).Get()
            triangle = (first - 1, third - 1, second - 1) if reverse else (first - 1, second - 1, third - 1)
            points = [vertices[index] for index in triangle]
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
        self.compute = _ComputeCache()
        self.cancelled = threading.Event()

    def _artifact(self, suffix: str) -> Path:
        path = self.artifacts / f"{uuid.uuid4().hex}.{suffix}"
        if not _is_relative_to(path.resolve(), self.artifacts):
            raise RuntimeError("Artifact path escaped the private directory")
        return path

    def _confined(self, descriptor: Any) -> Path:
        """Resolve one caller-named bundle inside the private artifact directory."""

        if not isinstance(descriptor, dict):
            raise TypeError("Build123d compute bundle must be an artifact descriptor")
        path_value = descriptor.get("artifactPath")
        byte_length = descriptor.get("byteLength")
        if not isinstance(path_value, str) or type(byte_length) is not int or byte_length < 0:
            raise TypeError("Build123d compute bundle descriptor is invalid")
        path = Path(path_value)
        resolved = path.resolve(strict=True)
        if path.is_symlink() or resolved.parent != self.artifacts:
            raise ValueError("Build123d compute bundle escaped the private artifact directory")
        if byte_length > MAX_COMPUTE_BUNDLE_BYTES or resolved.stat().st_size != byte_length:
            raise ValueError("Build123d compute bundle has an invalid size")
        return resolved

    def _import_compute(self, params: dict[str, Any]) -> dict[str, Any]:
        """Adopt one bounded warm bundle; a malformed bundle imports nothing."""

        descriptors = params.get("descriptors")
        if not isinstance(descriptors, list) or len(descriptors) > MAX_COMPUTE_DESCRIPTORS:
            raise ValueError("Build123d compute import descriptors are invalid")
        resolved = self._confined(params.get("bundle"))
        try:
            payload = resolved.read_bytes()
        finally:
            resolved.unlink(missing_ok=True)
        staged: list[tuple[dict[str, Any], str, Any, int]] = []
        omitted: list[str] = []
        decode_omissions = 0
        offset = 0
        for descriptor in descriptors:
            if not isinstance(descriptor, dict):
                raise ValueError("Build123d compute import descriptor is invalid")
            action = descriptor.get("action")
            action_digest = descriptor.get("actionDigest")
            content_digest = descriptor.get("contentDigest")
            byte_length = descriptor.get("byteLength")
            if (
                not isinstance(action, dict)
                or not isinstance(action_digest, str)
                or not _DIGEST.fullmatch(action_digest)
                or not isinstance(content_digest, str)
                or not _DIGEST.fullmatch(content_digest)
                or type(byte_length) is not int
                or byte_length < 0
                or offset + byte_length > len(payload)
            ):
                raise ValueError("Build123d compute import descriptor is invalid")
            data = payload[offset : offset + byte_length]
            offset += byte_length
            if _action_digest(action) != action_digest or _content_digest(data) != content_digest:
                omitted.append(action_digest)
                continue
            try:
                shape = _shape_from_brep(data)
            except Exception:
                decode_omissions += 1
                omitted.append(action_digest)
                continue
            staged.append((action, action_digest, shape, len(data)))
        if offset != len(payload):
            raise ValueError("Build123d compute import bundle has trailing bytes")
        self.compute.omissions += decode_omissions
        imported: list[str] = []
        for action, action_digest, shape, byte_length in staged:
            self.compute.put(action_digest, shape, action, byte_length)
            imported.append(action_digest)
        return {"imported": imported, "omitted": omitted}

    def _export_compute(self, params: dict[str, Any]) -> dict[str, Any]:
        """Encode selected admitted residents. Runs only after the runtime permits publication."""

        digests = params.get("digests")
        if (
            not isinstance(digests, list)
            or len(digests) > MAX_COMPUTE_DESCRIPTORS
            or any(not isinstance(digest, str) or not _DIGEST.fullmatch(digest) for digest in digests)
        ):
            raise ValueError("Build123d compute export digests are invalid")
        descriptors: list[dict[str, Any]] = []
        omitted: list[str] = []
        chunks: list[bytes] = []
        for digest in digests:
            shape = self.compute.residents.get(digest)
            action = self.compute.actions.get(digest)
            if shape is None or action is None:
                omitted.append(digest)
                continue
            try:
                data = _brep_bytes(shape)
            except Exception:
                omitted.append(digest)
                continue
            chunks.append(data)
            descriptors.append(
                {
                    "action": action,
                    "actionDigest": digest,
                    "contentDigest": _content_digest(data),
                    "byteLength": len(data),
                }
            )
        if not descriptors:
            return {"descriptors": [], "omitted": omitted}
        artifact = self._artifact("compute-bundle.bin")
        payload = b"".join(chunks)
        artifact.write_bytes(payload)
        return {
            "descriptors": descriptors,
            "omitted": omitted,
            "bundle": {"artifactPath": str(artifact), "byteLength": len(payload)},
        }

    def dispatch(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        if method == "analyze":
            return analyze_project(self.workspace, params["entryPath"], params.get("observedDependencies"))
        if method == "build":
            if len(self.handles) >= MAX_HANDLES:
                raise RuntimeError("Retained Build123d handle limit reached")
            adapter = (
                _ComputeAdapter(self.compute, params["compute"], self.cancelled) if "compute" in params else None
            )
            with adapter if adapter is not None else nullcontext():
                shapes, observed = _load_model(
                    self.workspace, params["entryPath"], params.get("parameters", {}), adapter
                )
            handle_id = uuid.uuid4().hex
            self.handles[handle_id] = shapes
            return {
                "handleId": handle_id,
                "observedDependencies": observed,
                **(
                    {
                        "compute": {
                            "announcements": adapter.announcements[:MAX_COMPUTE_DESCRIPTORS],
                            "hits": adapter.hits,
                            "stats": self.compute.stats(),
                        }
                    }
                    if adapter is not None
                    else {}
                ),
            }
        if method == "compute.import":
            return self._import_compute(params)
        if method == "compute.export":
            return self._export_compute(params)
        if method == "compute.clear":
            generation = params.get("generation")
            if type(generation) is not int:
                raise ValueError("Build123d compute clear generation is invalid")
            self.compute.clear(generation)
            return {"generation": generation}
        if method == "compute.stats":
            return self.compute.stats()
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
            self.compute.clear(self.compute.generation)
            return {"shutdown": True}
        raise ValueError(f"Unknown protocol method: {method}")

    def _read_frames(self, frames: Any, stream: Any) -> None:
        """Read protocol frames, observing out-of-band cancellation while a build runs."""

        for line in stream:
            if _is_cancel_frame(line):
                self.cancelled.set()
                continue
            frames.put(line)
        frames.put(None)

    def run(self, stream: Any = None) -> bool:
        importlib.import_module("build123d")
        _send({"protocolVersion": PROTOCOL_VERSION, "type": "ready", "pythonVersion": sys.version.split()[0]})
        frames: queue.Queue[bytes | None] = queue.Queue()
        reader = threading.Thread(
            target=self._read_frames, args=(frames, sys.stdin.buffer if stream is None else stream), daemon=True
        )
        reader.start()
        for line in iter(frames.get, None):
            self.cancelled.clear()
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
