"""Warm native Build123d worker: dispatch over OCP objects. Stdout is reserved for NDJSON protocol frames."""

from __future__ import annotations

import base64
from contextlib import nullcontext
import hashlib
import inspect
import json
import math
import re
import time
import types
import unicodedata
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from tau_kernel.analyzer import ParameterSchemaIdentity, analyze_project
from tau_kernel.glb import write_glb
from tau_kernel.model import load_entry
from tau_kernel.protocol import Handles, WorkerContext, run_worker
from native_materials import material_dependencies, tessellate_surface
from mechanisms import project_mechanism

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
PARAMETERS = ParameterSchemaIdentity(id="urn:taucad:build123d:parameters", name="Build123dParameters")
"""How the analyzer names Build123d's parameter declaration."""
GLB_GENERATOR = "@taucad/build123d"


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
        # BRep bytes do not carry native ShapeHistory, material or Python attributes.
        # Boolean results must be recomputed so native provenance and caller metadata survive.
        reusable = action["operation"].startswith("Solid.make_")
        cached = self.cache.get(digest) if reusable else None
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
        if reusable and duration >= COMPUTE_ADMISSION_FLOOR:
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
                if _shape_type is not Solid:
                    return _original.__func__(_shape_type, *args, **kwargs)
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


def _validate_results(values: tuple[Any, ...]) -> None:
    """Validate every final result (G-F13)."""

    for shape in values:
        if not shape.is_valid:
            raise ValueError("main(params) returned an invalid shape")


def _load_model(workspace: Path, entry_path: str, parameters: Any, adapter: Any = None, motion: Any = None) -> tuple[tuple[Any, ...], list[str]]:
    workspace = workspace.resolve()
    with load_entry(workspace, entry_path, parameters, identity=PARAMETERS, module_prefix="_tau_build123d_") as entry:
        result = entry.result
        from build123d import Shape

        # None or an empty list is an empty scene, like the TypeScript kernels' empty main().
        if result is None:
            values: tuple[Any, ...] = ()
        elif isinstance(result, Shape):
            values = (result,)
        elif isinstance(result, (list, tuple)) and all(isinstance(shape, Shape) for shape in result):
            values = tuple(result)
        else:
            raise TypeError("main(params) must return None, a Shape or a list/tuple of Shapes")
        _validate_results(values)
        resources = material_dependencies(values, workspace, entry.analysis["resolved"])
        if motion is not None:
            declaration = getattr(entry.module, "motion", None)
            if declaration is not None and not callable(declaration):
                raise TypeError("motion must be a callable motion(model) function")
            motion(declaration(result) if declaration is not None else None)
        for index, shape in enumerate(values):
            if not shape.label or not shape.label.strip():
                shape.label = f"Shape {index + 1}"
    return values, sorted(set(entry.dependencies) | set(resources))


def _component_id(label: str, fallback: str) -> str:
    if re.fullmatch(r"Shape[ _]\d+", label):
        return fallback
    slug = unicodedata.normalize("NFKD", label.lower()).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", slug).strip("-")
    return f"component:{slug}" if slug else fallback


def _point(vector: Any) -> tuple[float, float, float]:
    return (float(vector.X) / 1000, float(vector.Z) / 1000, -float(vector.Y) / 1000)


class _OverBudget(Exception):
    """A tessellation produced more triangles than the request allowed; no GLB was written."""

    def __init__(self, triangles: int) -> None:
        super().__init__(f"{triangles} triangles")
        self.triangles = triangles


def _bounding_diagonal(shapes: tuple[Any, ...]) -> float:
    """The bounding-box diagonal in millimetres of every shape together; zero when there is nothing to bound."""
    from OCP.Bnd import Bnd_Box
    from OCP.BRepBndLib import BRepBndLib

    box = Bnd_Box()
    for shape in shapes:
        BRepBndLib.AddOptimal_s(shape.wrapped, box, False, False)
    if box.IsVoid():
        return 0.0
    return math.sqrt(box.SquareExtent())


def _triangulate(shape: Any, linear_tolerance: float, angular_tolerance: float) -> tuple[Any, int]:
    """Mesh a detached, located copy in OCCT's absolute mode and count its triangles.

    `linear_tolerance` is a chordal deviation in millimetres and `angular_tolerance` an angle in radians.
    """
    from OCP.BRep import BRep_Tool
    from OCP.BRepBuilderAPI import BRepBuilderAPI_Copy
    from OCP.BRepMesh import BRepMesh_IncrementalMesh
    from OCP.TopLoc import TopLoc_Location

    # OCCT stores triangulation on BRep faces. `moved` shares those faces, so
    # copy geometry without mesh data before applying this render's tolerance.
    copied = BRepBuilderAPI_Copy()
    copied.Perform(shape.wrapped, True, False)
    detached = _cast_shape(copied.Shape())
    located = detached.located(shape.global_location)
    # I4: absolute deflection, so the tolerance is a length and density does not depend on each edge's size.
    BRepMesh_IncrementalMesh(located.wrapped, linear_tolerance, False, angular_tolerance, True)
    triangles = 0
    for face in located.faces():
        triangulation = BRep_Tool.Triangulation_s(face.wrapped, TopLoc_Location())
        triangles += triangulation.NbTriangles() if triangulation is not None else 0
    return located, triangles


def _mesh_shape(shape: Any, linear_tolerance: float, angular_tolerance: float) -> dict[str, Any]:
    located, _triangles = _triangulate(shape, linear_tolerance, angular_tolerance)
    return _mesh_arrays(shape, located, linear_tolerance, angular_tolerance)


def _edge_points(shape: Any, linear_tolerance: float, angular_tolerance: float) -> list[list[Any]]:
    """Read the surface's own boundary samples, retaining native edge order and seams.

    Build123D shape equality is OCCT IsSame (location matters, orientation does not),
    so a shared edge is emitted once. Free edges have no face triangulation and use
    OCCT's angular-and-chordal discretizer, with the same effective tolerances.
    """
    from build123d import Vector
    from OCP.BRep import BRep_Tool
    from OCP.BRepAdaptor import BRepAdaptor_Curve
    from OCP.GCPnts import GCPnts_TangentialDeflection
    from OCP.TopLoc import TopLoc_Location

    edges = shape.edges()
    points = {}
    for face in shape.faces():
        location = TopLoc_Location()
        triangulation = BRep_Tool.Triangulation_s(face.wrapped, location)
        if triangulation is None:
            continue
        for edge in face.edges():
            if edge in points:
                continue
            polygon = BRep_Tool.PolygonOnTriangulation_s(edge.wrapped, triangulation, location)
            if polygon is None:
                continue
            nodes = polygon.Nodes()
            points[edge] = [
                Vector(triangulation.Node(nodes.Value(index)).Transformed(location.Transformation()))
                for index in range(nodes.Lower(), nodes.Upper() + 1)
            ]
    for edge in edges:
        if edge not in points:
            curve = GCPnts_TangentialDeflection(
                BRepAdaptor_Curve(edge.wrapped), angular_tolerance, linear_tolerance, 2, 1e-9, 1e-7
            )
            points[edge] = [Vector(curve.Value(index)) for index in range(1, curve.NbPoints() + 1)]
    return [points[edge] for edge in edges]


def _mesh_arrays(shape: Any, located: Any, linear_tolerance: float, angular_tolerance: float) -> dict[str, Any]:
    # _triangulate has already meshed absolutely. Native tessellate_with_uvs
    # reuses that triangulation and supplies smooth normals and native face UVs.
    surface = tessellate_surface(located, linear_tolerance, angular_tolerance, pretriangulated=True)

    lines: list[float] = []
    line_indices: list[int] = []
    edge_groups: list[dict[str, int]] = []
    for edge_id, edge in enumerate(_edge_points(located, linear_tolerance, angular_tolerance), 1):
        points = [_point(point) for point in edge]
        start = len(line_indices)
        for first, second in zip(points, points[1:]):
            lines.extend(first)
            lines.extend(second)
            line_indices.extend((len(line_indices), len(line_indices) + 1))
        edge_groups.append({"start": start, "count": len(line_indices) - start, "edgeId": edge_id})
    color = tuple(shape.color) if shape.color is not None else (0.8, 0.8, 0.82, 1.0)
    return {
        **surface,
        "nativeMaterial": shape.material,
        "lines": lines,
        "lineIndices": line_indices,
        "edgeGroups": edge_groups,
        "color": color,
    }


def _topology(
    shapes: tuple[Any, ...],
    linear_tolerance: float,
    angular_tolerance: float,
    max_triangles: int | None = None,
) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    """Components and their meshes. Raises `_OverBudget` before building any mesh arrays when the
    triangulated parts together exceed `max_triangles`."""
    components: list[dict[str, Any]] = []
    leaves: list[tuple[str, Any]] = []
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
            leaves.append((component_id, shape))
            mesh_index += 1
        return component_id

    for index, shape in enumerate(shapes):
        visit(shape, None, f"Shape {index + 1}")
    triangulated = [
        (component_id, shape, *_triangulate(shape, linear_tolerance, angular_tolerance))
        for component_id, shape in leaves
    ]
    triangles = sum(count for _component_id, _shape, _located, count in triangulated)
    if max_triangles is not None and triangles > max_triangles:
        raise _OverBudget(triangles)
    meshes = {
        component_id: _mesh_arrays(shape, located, linear_tolerance, angular_tolerance)
        for component_id, shape, located, _count in triangulated
    }
    return components, meshes


class Worker:
    """Build123d's dispatch: retained shapes, the resident compute cache and the requests over them."""

    def __init__(self, context: WorkerContext) -> None:
        self.workspace = context.workspace
        self.artifacts = context.artifacts
        self.cancelled = context.cancelled
        self.handles = Handles(MAX_HANDLES, "Build123d")
        self.motion: dict[str, Any] = {}
        self.compute = _ComputeCache()

    def _import_compute(self, params: dict[str, Any]) -> dict[str, Any]:
        """Adopt one bounded warm bundle; a malformed bundle imports nothing."""

        descriptors = params.get("descriptors")
        if not isinstance(descriptors, list) or len(descriptors) > MAX_COMPUTE_DESCRIPTORS:
            raise ValueError("Build123d compute import descriptors are invalid")
        resolved = self.artifacts.confined(
            params.get("bundle"), max_bytes=MAX_COMPUTE_BUNDLE_BYTES, label="Build123d compute bundle"
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
        artifact = self.artifacts.create("compute-bundle.bin")
        payload = b"".join(chunks)
        artifact.write_bytes(payload)
        return {
            "descriptors": descriptors,
            "omitted": omitted,
            "bundle": {"artifactPath": str(artifact), "byteLength": len(payload)},
        }

    def dispatch(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        if method == "analyze":
            return analyze_project(
                self.workspace, params["entryPath"], params.get("observedDependencies"), identity=PARAMETERS
            )
        if method == "build":
            adapter = (
                _ComputeAdapter(self.compute, params["compute"], self.cancelled) if "compute" in params else None
            )
            motion: list[Any] = []
            with adapter if adapter is not None else nullcontext():
                shapes, observed = _load_model(
                    self.workspace, params["entryPath"], params.get("parameters", {}), adapter, motion.append
                )
            handle_id = self.handles.retain(shapes)
            self.motion[handle_id] = motion[0]
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
        if method == "measure":
            return {"diagonal": _bounding_diagonal(self.handles[params["handleId"]])}
        if method == "mesh":
            # Millimetres and degrees at the protocol boundary; OCCT takes the angle in radians.
            shapes = self.handles[params["handleId"]]
            try:
                components, meshes = _topology(
                    shapes,
                    params["linearTolerance"],
                    math.radians(params["angularTolerance"]),
                    params.get("maxTriangles"),
                )
            except _OverBudget as exceeded:
                return {"triangles": exceeded.triangles, "vertices": exceeded.triangles * 3}
            triangles = sum(len(mesh["indices"]) // 3 for mesh in meshes.values())
            vertices = sum(len(mesh["positions"]) // 3 for mesh in meshes.values())
            projection = project_mechanism(shapes, components, self.motion.get(params["handleId"]), meshes=meshes)
            artifact = self.artifacts.create("glb")
            write_glb(artifact, components, meshes, topology_metadata=projection, generator=GLB_GENERATOR)
            return {
                "artifactPath": str(artifact),
                "byteLength": artifact.stat().st_size,
                "triangles": triangles,
                "vertices": vertices,
                "mechanismDiagnostics": projection.get("mechanismDiagnostics", []),
                **{key: projection[key] for key in ("mechanism", "mechanismIntent") if key in projection},
            }
        if method == "export":
            if params["format"] != "step":
                raise ValueError(f"Unsupported Build123d export format: {params['format']}")
            shapes = self.handles[params["handleId"]]
            if not shapes:
                raise ValueError("main(params) returned no shapes to export")
            from build123d import Compound, export_step

            artifact = self.artifacts.create("step")
            exported = shapes[0] if len(shapes) == 1 else Compound(children=list(shapes))
            if not export_step(exported, artifact):
                raise RuntimeError("Build123d failed to export STEP")
            return {"artifactPath": str(artifact), "byteLength": artifact.stat().st_size}
        if method == "release":
            self.handles.pop(params["handleId"], None)
            self.motion.pop(params["handleId"], None)
            return {}
        if method == "shutdown":
            self.handles.clear()
            self.motion.clear()
            self.compute.clear(self.compute.generation)
            return {"shutdown": True}
        raise ValueError(f"Unknown protocol method: {method}")


def main() -> None:
    run_worker(lambda context: Worker(context).dispatch, temporary_prefix="tau-build123d-", import_check="build123d")


if __name__ == "__main__":
    main()
