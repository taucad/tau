"""Warm native SMLibPy worker: dispatch over smlibpy bodies. Stdout is reserved for NDJSON protocol frames."""

from __future__ import annotations

from contextlib import nullcontext
from enum import Enum
import hashlib
import inspect
import json
import math
import re
import struct
import sys
import tempfile
import time
import types
import base64
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from tau_kernel.analyzer import ParameterSchemaIdentity, analyze_project
from tau_kernel.model import load_entry
from tau_kernel.protocol import Handles, WorkerContext, run_worker
from smlibpy_materials import normalize_output
from smlibpy_mechanisms import read_mechanism

MAX_HANDLES = 32
MAX_COMPUTE_BUNDLE_BYTES = 96 * 1024 * 1024
# EQ16: one control frame carries at most this many descriptors under the 1 MiB frame cap.
MAX_COMPUTE_DESCRIPTORS = 512
# EQ27: retain an operation whose own kernel call took at least this many milliseconds.
COMPUTE_ADMISSION_FLOOR = 5.0
# EQ12: resident bounds for the SMLibPy worker.
MAX_COMPUTE_RESIDENT_BYTES = 256 * 1024 * 1024
MAX_COMPUTE_RESIDENT_ENTRIES = 4096
# D18: cheap conservative provisional charge, reconciled by the exported length off-path.
COMPUTE_BASE_CHARGE_BYTES = 4096
COMPUTE_FACE_CHARGE_BYTES = 512
COMPUTE_CODEC = {"id": "smlibpy.smb", "version": "1"}
PRIMITIVES = ("Box", "Cylinder", "Cone", "Sphere", "Torus")
_DIGEST = re.compile(r"^sha256:[0-9a-f]{64}$")
PARAMETERS = ParameterSchemaIdentity(id="urn:taucad:smlibpy:parameters", name="SMLibPyParameters")
"""How the analyzer names SMLibPy's parameter declaration."""
BUNDLE_MAGIC = b"TAUSMLB1"
"""The mesh bundle's first bytes; the TypeScript kernel reads the format this worker writes."""
CURVE_SAMPLES = 96


class _ComputeBypass(Exception):
    """Internal signal for values outside the deterministic allow-list."""


class _ComputeCancelled(Exception):
    """Cooperative cancellation observed at a safe operation boundary."""


class _OverBudget(Exception):
    """A tessellation produced more triangles than the request allowed; no bundle was written."""

    def __init__(self, triangles: int) -> None:
        super().__init__(f"{triangles} triangles")
        self.triangles = triangles


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
    if isinstance(value, Enum):
        return _compute_value(value.value)
    raise _ComputeBypass()


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


def _smb_bytes(part: Any) -> bytes:
    """SMLib's exact, lossless `.smb` encoding of one body: the compute codec."""

    from smlibpy import save

    with tempfile.TemporaryDirectory(prefix="tau-smlibpy-codec-") as directory:
        path = Path(directory) / "body.smb"
        save(part, path, ascii=False)
        return path.read_bytes()


def _part_from_smb(data: bytes) -> Any:
    from smlibpy import Part, load

    with tempfile.TemporaryDirectory(prefix="tau-smlibpy-codec-") as directory:
        path = Path(directory) / "body.smb"
        path.write_bytes(data)
        part = load(path)
    if not isinstance(part, Part):
        raise ValueError("The .smb bytes do not hold a valid solid")
    return part


def _copy(part: Any) -> Any:
    """An independent body over a copy of the same kernel B-rep."""

    return type(part)._wrap(part._copy_brep())


def _estimate_compute_bytes(part: Any) -> int:
    """Cheap provisional charge from topology size; never an encode for sizing."""

    return COMPUTE_BASE_CHARGE_BYTES + len(part.faces()) * COMPUTE_FACE_CHARGE_BYTES


class _ComputeCache:
    """Worker-lifetime resident cache holding live smlibpy bodies by action digest."""

    def __init__(self) -> None:
        self.residents: dict[str, Any] = {}
        self.actions: dict[str, dict[str, Any]] = {}
        self.charges: dict[str, int] = {}
        self.logical_bytes = 0
        self.evictions = 0
        self.omissions = 0
        self.generation = 0

    def get(self, digest: str) -> Any:
        """Return a copy of one resident, or None. No I/O, codec or mesh work."""

        part = self.residents.get(digest)
        if part is None:
            return None
        self.residents[digest] = self.residents.pop(digest)
        return _copy(part)

    def put(self, digest: str, part: Any, action: dict[str, Any], charge: int) -> None:
        if digest in self.residents:
            return
        self.residents[digest] = _copy(part)
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

    def clear(self, generation: int) -> None:
        self.residents.clear()
        self.actions.clear()
        self.charges.clear()
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
    """Version-pinned synchronous semantic reuse for SMLibPy's deterministic primitives.

    Only primitives are reused: an `.smb` body carries no smlibpy name or color, and a Boolean or feature result is
    recomputed so the caller's metadata survives, as Build123d recomputes its Booleans.
    """

    def __init__(self, cache: _ComputeCache, config: Any, cancelled: Any = None) -> None:
        if not isinstance(config, dict):
            raise TypeError("SMLibPy compute configuration must be an object")
        self.cache = cache
        self.namespace = config.get("namespace")
        self.producer = config.get("producer")
        self.environment = config.get("environment")
        if not isinstance(self.namespace, str) or not isinstance(self.producer, dict):
            raise TypeError("SMLibPy compute identity is invalid")
        self.cancelled = cancelled
        self.announcements: list[dict[str, Any]] = []
        self.hits = 0
        self._patches: list[tuple[Any, str, Any]] = []
        self._fingerprints: dict[str, str] = {}

    def _action(self, operation: str, arguments: Any) -> dict[str, Any]:
        producer = {
            **self.producer,
            "implementationAssets": [*self.producer.get("implementationAssets", []), self._fingerprints[operation]],
        }
        return {
            "schemaVersion": 1,
            "namespace": self.namespace,
            "producer": producer,
            "operation": operation,
            "inputs": [],
            "arguments": arguments,
            "environment": self.environment,
            "codec": COMPUTE_CODEC,
        }

    def _invoke(self, action: dict[str, Any], compute: Any) -> Any:
        if self.cancelled is not None and self.cancelled.is_set():
            raise _ComputeCancelled()
        digest = _action_digest(action)
        cached = self.cache.get(digest)
        if cached is not None:
            self.hits += 1
            return cached
        started = time.perf_counter()
        result = compute()
        duration = (time.perf_counter() - started) * 1000
        if duration >= COMPUTE_ADMISSION_FLOOR:
            charge = _estimate_compute_bytes(result)
            self.cache.put(digest, result, action, charge)
            self.announcements.append(
                {"action": action, "actionDigest": digest, "computeDuration": duration, "estimatedBytes": charge}
            )
        return result

    def _primitive(self, name: str, original: Any, args: tuple[Any, ...], kwargs: dict[str, Any]) -> Any:
        try:
            bound = inspect.signature(original).bind(*args, **kwargs)
            bound.apply_defaults()
            arguments = {key: _compute_value(value) for key, value in bound.arguments.items()}
        except (TypeError, _ComputeBypass):
            return original(*args, **kwargs)
        return self._invoke(self._action(name, arguments), lambda: original(*args, **kwargs))

    def __enter__(self) -> _ComputeAdapter:
        import smlibpy
        import smlibpy.parts

        for name in PRIMITIVES:
            original = getattr(smlibpy.parts, name)
            self._fingerprints[name] = _callable_fingerprint(original)

            def patched(*args: Any, _name: str = name, _original: Any = original, **kwargs: Any) -> Any:
                return self._primitive(_name, _original, args, kwargs)

            for module in (smlibpy, smlibpy.parts):
                self._patches.append((module, name, getattr(module, name)))
                setattr(module, name, patched)
        return self

    def __exit__(self, _error_type: Any, _error: Any, _traceback: Any) -> None:
        for module, name, original in reversed(self._patches):
            setattr(module, name, original)
        self._patches.clear()


def _validate_results(configs: list[dict[str, Any]]) -> None:
    """Validate every final solid (G-F13)."""

    from smlibpy import Part

    for index, config in enumerate(configs):
        if isinstance(config["shape"], Part) and not config["shape"].is_valid():
            raise ValueError(f"main(params) returned an invalid solid at index {index}")


def _load_model(workspace: Path, entry_path: str, parameters: Any, adapter: Any = None) -> tuple[dict[str, Any], list[str]]:
    workspace = workspace.resolve()
    with load_entry(workspace, entry_path, parameters, identity=PARAMETERS, module_prefix="_tau_smlibpy_") as entry:
        configs, resources = normalize_output(entry.result)
        _validate_results(configs)
        params_type = getattr(entry.module, "Params")
        mechanism = read_mechanism(entry.module, params_type(**_validated(entry.analysis, parameters)))
    model: dict[str, Any] = {"shapes": configs, "resources": resources}
    if mechanism is not None:
        model["mechanism"] = mechanism
    return model, entry.dependencies


def _validated(analysis: dict[str, Any], parameters: Any) -> dict[str, Any]:
    from tau_kernel.model import validate_parameters

    return validate_parameters(parameters, analysis["jsonSchema"])


def _bounding_diagonal(configs: list[dict[str, Any]]) -> float:
    """The bounding-box diagonal in millimetres of every shape together; zero when there is nothing to bound."""

    boxes = [config["shape"].bbox() for config in configs]
    if not boxes:
        return 0.0
    low = [min(box.min[axis] for box in boxes) for axis in range(3)]
    high = [max(box.max[axis] for box in boxes) for axis in range(3)]
    return math.dist(low, high)


def _face_runs(item: Any, mesh: Any) -> Any:
    """Each triangle's face index in `item.faces()` order, from the kernel's own polygon owners; `None` for one group."""

    import numpy
    from smlibpy import Face
    from smlibpy._kernel import ext

    if isinstance(item, Face):
        return None
    owners = numpy.asarray(ext.poly_face_indices(mesh._poly.poly, item._brep), dtype=numpy.int64)
    polygons = numpy.asarray(mesh._poly.poly.to_numpy_arrays(face_varying_normals=False)["faces"], dtype=numpy.int64)
    sizes = []
    index = 0
    while index < len(polygons):
        sizes.append(int(polygons[index]))
        index += sizes[-1] + 1
    owner = numpy.repeat(owners, numpy.maximum(numpy.array(sizes, dtype=numpy.int64) - 2, 0))
    return owner if len(owner) == len(mesh.triangles) else None


def _open_edges(meshes: list[Any]) -> int:
    """Edges used by other than two triangles once the meshes' coincident positions are joined; zero when watertight."""

    import numpy

    positions = numpy.concatenate([numpy.round(numpy.asarray(mesh.vertices, dtype=numpy.float64), 6) for mesh in meshes])
    offsets = numpy.cumsum([0] + [len(mesh.vertices) for mesh in meshes[:-1]])
    triangles = numpy.concatenate(
        [numpy.asarray(mesh.triangles, dtype=numpy.int64) + offset for mesh, offset in zip(meshes, offsets)]
    )
    _, welded = numpy.unique(positions, axis=0, return_inverse=True)
    corners = welded.reshape(-1)[triangles]
    edges = numpy.sort(numpy.concatenate([corners[:, [0, 1]], corners[:, [1, 2]], corners[:, [2, 0]]]), axis=1)
    _, counts = numpy.unique(edges, axis=0, return_counts=True)
    return int((counts != 2).sum())


def _surface(item: Any, linear_tolerance: float, angular_tolerance: float) -> tuple[Any, Any, Any]:
    """Tessellate one body, face or mesh in one pass, so faces share their boundary samples and close.

    smlibpy 0.3.5 leaves the seam of a moved torus open in a whole-body mesh although the face alone meshes closed (the
    SMLib kernel's smlibwasm shows the same): for a solid whose body mesh is open, per-face meshes are kept when they
    close better.
    """

    import numpy
    from smlibpy import Mesh, Part, tessellate
    from smlibpy.mesh import merge

    if isinstance(item, Mesh):
        return item, None, item.triangles
    mesh = tessellate(item, linear_tolerance, angular_tolerance)
    if isinstance(item, Part) and len(mesh.triangles) > 0 and _open_edges([mesh]) > 0:
        faces = [tessellate(face, linear_tolerance, angular_tolerance) for face in item.faces()]
        if _open_edges(faces) < _open_edges([mesh]):
            owners = numpy.repeat(numpy.arange(len(faces)), [len(face.triangles) for face in faces])
            merged = merge(faces)
            return merged, owners, merged.triangles
    return mesh, _face_runs(item, mesh), mesh.triangles


def _face_arrays(mesh: Any, owners: Any) -> dict[str, Any]:
    """Face-grouped triangles whose vertices each face owns, with the face's corner normals averaged per vertex.

    Vertices are not shared across faces, so CAD edges stay crisp; within a face the surface is smooth, so the average
    is the surface normal.
    """

    import numpy

    triangles = numpy.asarray(mesh.triangles, dtype=numpy.int64)
    corner_normals = (
        numpy.asarray(mesh.normals, dtype=numpy.float64).reshape(-1, 3, 3)
        if mesh.normals is not None
        else numpy.repeat(numpy.asarray(mesh.triangle_normals, dtype=numpy.float64)[:, None, :], 3, axis=1)
    )
    face_ids = numpy.zeros(len(triangles), dtype=numpy.int64) if owners is None else owners
    positions: list[Any] = []
    normals: list[Any] = []
    indices: list[Any] = []
    groups: list[dict[str, int]] = []
    offset = 0
    start = 0
    for face_id in sorted(set(face_ids.tolist())):
        selected = face_ids == face_id
        used, local = numpy.unique(triangles[selected], return_inverse=True)
        sums = numpy.zeros((len(used), 3))
        numpy.add.at(sums, local.reshape(-1), corner_normals[selected].reshape(-1, 3))
        lengths = numpy.linalg.norm(sums, axis=1, keepdims=True)
        sums = numpy.where(lengths > 0, sums / numpy.where(lengths > 0, lengths, 1), (0.0, 0.0, 1.0))
        positions.append(numpy.asarray(mesh.vertices, dtype=numpy.float64)[used])
        normals.append(sums)
        indices.append(local.reshape(-1) + offset)
        count = int(selected.sum()) * 3
        groups.append({"start": start, "count": count, "faceId": int(face_id)})
        offset += len(used)
        start += count
    empty = numpy.zeros((0, 3))
    return {
        "vertices": numpy.concatenate(positions) if positions else empty,
        "normals": numpy.concatenate(normals) if normals else empty,
        "triangles": numpy.concatenate(indices) if indices else numpy.zeros(0, dtype=numpy.int64),
        "faceGroups": groups,
    }


def _edge_polylines(item: Any, angular_tolerance: float) -> list[tuple[int, Any]]:
    """The B-rep edges as polylines, each with its index in the body's edges, leaving out the seams of closed faces."""

    import numpy
    from smlibpy import Edge, Face, Mesh, Wire
    from smlibpy._kernel import ext, k

    if isinstance(item, Mesh):
        return []
    if isinstance(item, (Edge, Wire)):
        edges = [item] if isinstance(item, Edge) else list(item.edges())
        return [
            (
                index,
                numpy.array([edge.point_at(t / (1 if edge.geom_type == "line" else CURVE_SAMPLES)).to_tuple()
                             for t in range(2 if edge.geom_type == "line" else CURVE_SAMPLES + 1)]),
            )
            for index, edge in enumerate(edges)
        ]
    body = item.to_shell() if isinstance(item, Face) else item
    flat, counts, _ = k.tessellate_boundaries(body._brep, angle_tolerance_deg=angular_tolerance)
    seams = set(ext.seam_edges(body._brep))
    points = numpy.asarray(flat, dtype=numpy.float64).reshape(-1, 3)
    polylines = []
    start = 0
    for index, count in enumerate(counts):
        if count >= 2 and index not in seams:
            polylines.append((index, points[start : start + count]))
        start += count
    return polylines


def _edge_arrays(polylines: list[tuple[int, Any]]) -> dict[str, Any]:
    """Edges as a de-indexed segment soup, one scalar range per edge."""

    import numpy

    lines: list[Any] = []
    groups: list[dict[str, int]] = []
    start = 0
    for edge_id, points in polylines:
        segments = numpy.stack([points[:-1], points[1:]], axis=1).reshape(-1)
        lines.append(segments)
        groups.append({"start": start, "count": len(segments), "edgeId": edge_id})
        start += len(segments)
    return {"lines": numpy.concatenate(lines) if lines else numpy.zeros(0), "edgeGroups": groups}


class _Bundle:
    """The mesh bundle: a JSON header naming slices of one little-endian binary body."""

    def __init__(self) -> None:
        self.body = bytearray()

    def add(self, data: bytes) -> list[int]:
        while len(self.body) % 4:
            self.body.append(0)
        offset = len(self.body)
        self.body.extend(data)
        return [offset, len(data)]

    def floats(self, values: Any) -> list[int]:
        import numpy

        return self.add(numpy.asarray(values, dtype="<f4").reshape(-1).tobytes())

    def indices(self, values: Any) -> list[int]:
        import numpy

        return self.add(numpy.asarray(values, dtype="<u4").reshape(-1).tobytes())

    def write(self, path: Path, header: dict[str, Any]) -> None:
        encoded = json.dumps(header, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")
        encoded += b" " * (-len(encoded) % 4)
        path.write_bytes(BUNDLE_MAGIC + struct.pack("<I", len(encoded)) + encoded + bytes(self.body))


def _mesh_model(
    model: dict[str, Any], path: Path, linear_tolerance: float, angular_tolerance: float, max_triangles: int | None, edges: bool
) -> dict[str, int]:
    """Tessellate every shape, refusing before any array is built when the total exceeds `max_triangles`."""

    from smlibpy import Edge, Wire

    configs = model["shapes"]
    surfaces = [
        None if isinstance(config["shape"], (Edge, Wire)) else _surface(config["shape"], linear_tolerance, angular_tolerance)
        for config in configs
    ]
    triangles = sum(len(surface[2]) for surface in surfaces if surface is not None)
    if max_triangles is not None and triangles > max_triangles:
        raise _OverBudget(triangles)
    bundle = _Bundle()
    shapes: list[dict[str, Any]] = []
    vertices = 0
    for config, surface in zip(configs, surfaces):
        faces = _face_arrays(surface[0], surface[1]) if surface is not None else None
        curve = isinstance(config["shape"], (Edge, Wire))
        lines = _edge_arrays(_edge_polylines(config["shape"], angular_tolerance) if edges or curve else [])
        entry: dict[str, Any] = {key: value for key, value in config.items() if key != "shape" and value is not None}
        entry["faces"] = (
            {
                "vertices": bundle.floats(faces["vertices"]),
                "normals": bundle.floats(faces["normals"]),
                "triangles": bundle.indices(faces["triangles"]),
                "faceGroups": faces["faceGroups"],
            }
            if faces is not None
            else {"vertices": [0, 0], "normals": [0, 0], "triangles": [0, 0], "faceGroups": []}
        )
        entry["edges"] = {"lines": bundle.floats(lines["lines"]), "edgeGroups": lines["edgeGroups"]}
        vertices += 0 if faces is None else len(faces["vertices"])
        shapes.append(entry)
    resources = model["resources"]
    header: dict[str, Any] = {"shapes": shapes}
    if "images" in resources:
        header["images"] = [
            {**{key: value for key, value in image.items() if key != "data"}, "data": bundle.add(image["data"])}
            for image in resources["images"]
        ]
    header.update({key: resources[key] for key in ("textures", "samplers") if key in resources})
    if "mechanism" in model:
        header["mechanism"] = model["mechanism"]
    bundle.write(path, header)
    return {"triangles": triangles, "vertices": vertices}


def _exportable(configs: list[dict[str, Any]]) -> list[Any]:
    """The exact bodies of a model, named and colored for STEP; faces export as sheets, meshes and curves not at all."""

    from smlibpy import Edge, Face, Mesh, Wire

    bodies = []
    for index, config in enumerate(configs):
        shape = config["shape"]
        if isinstance(shape, (Mesh, Edge, Wire)):
            continue
        body = shape.to_shell() if isinstance(shape, Face) else shape
        body = body.named(config["name"] or f"Shape {index + 1}")
        bodies.append(body.colored(config["color"]) if "color" in config else body)
    return bodies


class Worker:
    """SMLibPy's dispatch: retained models, the resident compute cache and the requests over them."""

    def __init__(self, context: WorkerContext) -> None:
        self.workspace = context.workspace
        self.artifacts = context.artifacts
        self.cancelled = context.cancelled
        self.handles = Handles(MAX_HANDLES, "SMLibPy")
        self.compute = _ComputeCache()

    def _import_compute(self, params: dict[str, Any]) -> dict[str, Any]:
        """Adopt one bounded warm bundle; a malformed bundle imports nothing."""

        descriptors = params.get("descriptors")
        if not isinstance(descriptors, list) or len(descriptors) > MAX_COMPUTE_DESCRIPTORS:
            raise ValueError("SMLibPy compute import descriptors are invalid")
        resolved = self.artifacts.confined(
            params.get("bundle"), max_bytes=MAX_COMPUTE_BUNDLE_BYTES, label="SMLibPy compute bundle"
        )
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
                raise ValueError("SMLibPy compute import descriptor is invalid")
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
                raise ValueError("SMLibPy compute import descriptor is invalid")
            data = payload[offset : offset + byte_length]
            offset += byte_length
            if _action_digest(action) != action_digest or _content_digest(data) != content_digest:
                omitted.append(action_digest)
                continue
            try:
                part = _part_from_smb(data)
            except Exception:
                decode_omissions += 1
                omitted.append(action_digest)
                continue
            staged.append((action, action_digest, part, len(data)))
        if offset != len(payload):
            raise ValueError("SMLibPy compute import bundle has trailing bytes")
        self.compute.omissions += decode_omissions
        imported: list[str] = []
        for action, action_digest, part, byte_length in staged:
            self.compute.put(action_digest, part, action, byte_length)
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
            raise ValueError("SMLibPy compute export digests are invalid")
        descriptors: list[dict[str, Any]] = []
        omitted: list[str] = []
        chunks: list[bytes] = []
        for digest in digests:
            part = self.compute.residents.get(digest)
            if part is None:
                omitted.append(digest)
                continue
            data = _smb_bytes(part)
            chunks.append(data)
            descriptors.append(
                {
                    "action": self.compute.actions[digest],
                    "actionDigest": digest,
                    "contentDigest": _content_digest(data),
                    "byteLength": len(data),
                }
            )
        if not descriptors:
            return {"descriptors": [], "omitted": omitted}
        artifact = self.artifacts.create("compute-bundle.bin")
        payload = b"".join(chunks)
        artifact.write_bytes(payload)
        return {
            "descriptors": descriptors,
            "omitted": omitted,
            "bundle": {"artifactPath": str(artifact), "byteLength": len(payload)},
        }

    def _export(self, params: dict[str, Any]) -> dict[str, Any]:
        from smlibpy import X, export_step, export_stl

        model = self.handles[params["handleId"]]
        bodies = _exportable(model["shapes"])
        if not bodies:
            raise ValueError(
                "main(params) returned no exact bodies to export"
                if model["shapes"]
                else "main(params) returned no shapes to export"
            )
        if params.get("coordinateSystem") == "y-up":
            bodies = [body.rotate(X, -90) for body in bodies]
        format_ = params["format"]
        if format_ == "step":
            artifact = self.artifacts.create("step")
            export_step(bodies, artifact, name=bodies[0].name if len(bodies) == 1 else "assembly")
        elif format_ == "stl":
            artifact = self.artifacts.create("stl")
            export_stl(
                bodies,
                artifact,
                tolerance=params["linearTolerance"],
                angle=params["angularTolerance"],
                ascii=not params.get("binary", True),
            )
        else:
            raise ValueError(f"Unsupported SMLibPy export format: {format_}")
        return {"artifactPath": str(artifact), "byteLength": artifact.stat().st_size}

    def dispatch(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        if method == "analyze":
            return analyze_project(
                self.workspace, params["entryPath"], params.get("observedDependencies"), identity=PARAMETERS
            )
        if method == "build":
            adapter = _ComputeAdapter(self.compute, params["compute"], self.cancelled) if "compute" in params else None
            with adapter if adapter is not None else nullcontext():
                model, observed = _load_model(self.workspace, params["entryPath"], params.get("parameters", {}), adapter)
            handle_id = self.handles.retain(model)
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
                raise ValueError("SMLibPy compute clear generation is invalid")
            self.compute.clear(generation)
            return {"generation": generation}
        if method == "compute.stats":
            return self.compute.stats()
        if method == "measure":
            return {"diagonal": _bounding_diagonal(self.handles[params["handleId"]]["shapes"])}
        if method == "mesh":
            # Millimetres and degrees at the protocol boundary, as smlibpy takes them.
            artifact = self.artifacts.create("smlibpy-mesh.bin")
            try:
                counts = _mesh_model(
                    self.handles[params["handleId"]],
                    artifact,
                    params["linearTolerance"],
                    params["angularTolerance"],
                    params.get("maxTriangles"),
                    params.get("edges", True),
                )
            except _OverBudget as exceeded:
                return {"triangles": exceeded.triangles, "vertices": exceeded.triangles * 3}
            return {"artifactPath": str(artifact), "byteLength": artifact.stat().st_size, **counts}
        if method == "export":
            return self._export(params)
        if method == "release":
            self.handles.pop(params["handleId"], None)
            return {}
        if method == "shutdown":
            self.handles.clear()
            self.compute.clear(self.compute.generation)
            return {"shutdown": True}
        raise ValueError(f"Unknown protocol method: {method}")


def main() -> None:
    run_worker(lambda context: Worker(context).dispatch, temporary_prefix="tau-smlibpy-", import_check="smlibpy")


if __name__ == "__main__":
    main()
