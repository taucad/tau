"""Rooted host loading; geometry and verdicts remain engine-owned."""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from contextvars import ContextVar
from dataclasses import dataclass
import hashlib
from pathlib import Path
import threading
from types import MappingProxyType
from typing import Literal, TypedDict, Unpack

from ._api import GeoSpecAssertionError, GeoSpecEngine, GeoSpecSubject, _active_engine, _wire_value

GeoSpecModelFormat = Literal["glb", "gltf", "step", "stp"]
GeoSpecModelUnit = Literal["mm", "cm", "m", "in", "ft", "auto"]


class GeoSpecModelResource(TypedDict):
    """One named resource, read from owned bytes or the configured root."""

    name: str
    source: bytes | str


class GeoSpecLoadModelOptions(TypedDict, total=False):
    """Canonical model request. Select exactly one of file and source."""

    file: str
    source: bytes | str
    code: Mapping[str, str]
    format: GeoSpecModelFormat
    parameters: Mapping[str, object]
    source_unit: GeoSpecModelUnit
    resources: Sequence[GeoSpecModelResource]
    ingest_options: Mapping[str, object]
    mesh: bool
    mesh_linear_tolerance: float
    mesh_angular_tolerance_degrees: float
    step_streaming: Literal["auto", "native-stream", "filesystem"]
    name: str
    path: str


@dataclass(frozen=True, slots=True)
class GeoSpecModelArtifact:
    """Owned host export plus the exact source closure consumed by that export.

    A compiler host schedules its own RPC on the engine owner thread and returns
    completed bytes. It must honor request parameters/export options or refuse.
    """

    primary: bytes
    format: GeoSpecModelFormat
    source_unit: GeoSpecModelUnit
    resources: Sequence[tuple[str, bytes]] = ()
    consumed_sources: Sequence[tuple[str, bytes]] = ()
    coordinate_system: Literal["z-up", "y-up"] = "z-up"
    output_unit: Literal["mm"] = "mm"


GeoSpecModelLoader = Callable[[GeoSpecLoadModelOptions], GeoSpecModelArtifact]


class _ModelScope:
    """One lazy framework-owned engine; copied expired contexts cannot revive it."""

    def __init__(self, factory: Callable[[], GeoSpecEngine]) -> None:
        self.factory = factory
        self.engine: GeoSpecEngine | None = None
        self.closed = False
        self.owner_thread = threading.get_ident()

    def get_engine(self) -> GeoSpecEngine:
        if threading.get_ident() != self.owner_thread:
            raise RuntimeError("GeoSpec test scopes must run on their owner thread.")
        if self.closed:
            raise GeoSpecAssertionError("This GeoSpec test scope has ended.", code="invalid-subject")
        if self.engine is None:
            self.engine = self.factory()
        self.engine._ensure_open()
        return self.engine

    def close(self) -> None:
        if threading.get_ident() != self.owner_thread:
            raise RuntimeError("GeoSpec test scopes must close on their owner thread.")
        if self.closed:
            return
        self.closed = True
        if self.engine is not None:
            self.engine.close()


_active_scope: ContextVar[_ModelScope | None] = ContextVar("geospec_model_scope", default=None)


def _rooted_path(engine: GeoSpecEngine, path: str) -> Path:
    if engine._model_root is None:
        raise GeoSpecAssertionError("Configure model_root on the GeoSpec host before reading files.", code="GEOSPEC_MODEL_HOST_UNAVAILABLE")
    root = Path(engine._model_root).resolve()
    candidate = Path(path)
    if candidate.is_absolute() or ".." in candidate.parts:
        raise GeoSpecAssertionError("Model paths must be relative to the configured root.", code="GEOSPEC_MODEL_PATH_OUTSIDE_ROOT")
    resolved = (root / candidate).resolve()
    if not resolved.is_relative_to(root):
        raise GeoSpecAssertionError("Model path resolves outside the configured root.", code="GEOSPEC_MODEL_PATH_OUTSIDE_ROOT")
    return resolved


def _read(engine: GeoSpecEngine, source: bytes | str) -> bytes:
    if isinstance(source, bytes):
        return source
    if isinstance(source, str):
        return _rooted_path(engine, source).read_bytes()
    raise TypeError("Model sources must be bytes or rooted relative paths.")


def _identity(name: str, content: bytes) -> Mapping[str, object]:
    if not isinstance(name, str) or not isinstance(content, bytes):
        raise TypeError("Host artifacts and consumed_sources must contain (name, bytes) pairs.")
    return MappingProxyType({"name": name, "byteLength": len(content), "sha256": hashlib.sha256(content).hexdigest()})


def _freeze_metadata(value: object) -> object:
    if isinstance(value, dict):
        return MappingProxyType({key: _freeze_metadata(entry) for key, entry in value.items()})
    if isinstance(value, list):
        return tuple(_freeze_metadata(entry) for entry in value)
    return value


def load_model(**options: Unpack[GeoSpecLoadModelOptions]) -> GeoSpecSubject:
    """Load actual geometry through the active rooted host, retaining per-load identity.

    Use an engine context for standalone code or configure geospec_engine_factory
    once in conftest.py. Code models require a completed synchronous host export.
    """

    engine = _active_engine.get()
    if engine is None:
        scope = _active_scope.get()
        if scope is None:
            raise GeoSpecAssertionError("No GeoSpec model host is configured for this test.", code="GEOSPEC_MODEL_HOST_UNAVAILABLE")
        engine = scope.get_engine()
    engine._ensure_open()
    if not engine._has_lifecycle:
        raise GeoSpecAssertionError("A model host must provide subject_handle and release_subject ownership.", code="GEOSPEC_MODEL_HOST_UNAVAILABLE")
    if ("file" in options) == ("source" in options):
        raise TypeError("Select exactly one of file and source.")
    unknown = set(options).difference(GeoSpecLoadModelOptions.__annotations__)
    if unknown:
        raise GeoSpecAssertionError(f"Unknown model fields: {', '.join(sorted(unknown))}.", code="invalid-field")
    _wire_value({key: value for key, value in options.items() if key not in ("source", "resources")})
    for resource in options.get("resources", ()):
        if not isinstance(resource, Mapping) or set(resource) != {"name", "source"}:
            raise GeoSpecAssertionError("Model resources require exactly name and source fields.", code="invalid-field")
        if not isinstance(resource["name"], str):
            raise TypeError("Model resource names must be strings.")
        if isinstance(resource["source"], str):
            _rooted_path(engine, resource["source"])
        elif not isinstance(resource["source"], bytes):
            raise TypeError("Model resource sources must be bytes or rooted relative paths.")
    format = options.get("format", "glb")
    if format not in ("glb", "gltf", "step", "stp"):
        raise GeoSpecAssertionError(f"GeoSpec cannot admit model format '{format}'.", code="GEOSPEC_MODEL_FORMAT_UNSUPPORTED")
    file = options.get("file")
    code = options.get("code")
    if file is not None:
        _rooted_path(engine, file)
    if code is not None:
        if file is None or file not in code:
            raise TypeError("Inline code requires a file naming its entry in code.")
        for path, text in code.items():
            _rooted_path(engine, path)
            if not isinstance(text, str):
                raise TypeError("Inline code values must be strings.")
    runtime_load = code is not None or (file is not None and Path(file).suffix.lower() not in (".glb", ".gltf", ".step", ".stp"))
    if runtime_load:
        if engine._model_loader is None:
            raise GeoSpecAssertionError("Configure a model_loader on the GeoSpec host to export code models.", code="GEOSPEC_MODEL_HOST_UNAVAILABLE")
        if "source_unit" in options:
            raise GeoSpecAssertionError("The model host export owns source units; remove source_unit.", code="GEOSPEC_MODEL_FRAME_OVERRIDE")
        artifact = engine._model_loader(options)
        if not isinstance(artifact, GeoSpecModelArtifact):
            raise TypeError("model_loader must return a completed GeoSpecModelArtifact on its owner thread.")
        if not artifact.consumed_sources:
            raise GeoSpecAssertionError("The model host must report its consumed source bytes.", code="GEOSPEC_MODEL_SOURCE_IDENTITY_MISSING")
        if artifact.format != format or artifact.coordinate_system != "z-up" or artifact.output_unit != "mm":
            raise GeoSpecAssertionError("The model host must honor requested format and canonical Z-up millimetre output.", code="GEOSPEC_MODEL_EXPORT_INTENT_MISMATCH")
    else:
        unsupported = set(options).intersection(("mesh", "mesh_linear_tolerance", "mesh_angular_tolerance_degrees", "step_streaming"))
        if unsupported:
            raise GeoSpecAssertionError(f"Direct model admission does not support options: {', '.join(sorted(unsupported))}.", code="GEOSPEC_MODEL_OPTION_UNSUPPORTED")
        source = options["source"] if "source" in options else options["file"]
        primary = _read(engine, source)
        resource_options = options.get("resources", ())
        resources = tuple((item["name"], _read(engine, item["source"])) for item in resource_options)
        source_name = file or options.get("path") or (source if isinstance(source, str) else "<bytes>")
        artifact = GeoSpecModelArtifact(primary, format, options.get("source_unit", "auto" if format in ("step", "stp") else "m"), resources, ((source_name, primary),))
    primary_identity = _identity(options.get("name", file or "<model>"), artifact.primary)
    resource_identity = tuple(_identity(name, binary) for name, binary in artifact.resources)
    source_identity = tuple(_identity(name, binary) for name, binary in artifact.consumed_sources)
    subject = engine.ingest_subject(
        artifact.primary,
        format="step" if artifact.format == "stp" else artifact.format,
        coordinate_system=artifact.coordinate_system,
        source_unit=artifact.source_unit,
        output_unit=artifact.output_unit,
        resources=artifact.resources,
        ingest_options=options.get("ingest_options"),
    )
    object.__setattr__(subject, "provenance", MappingProxyType({
        "primary": primary_identity,
        "resources": resource_identity,
        "sources": source_identity,
        "parameters": _freeze_metadata(_wire_value(options.get("parameters", {}))),
        "options": _freeze_metadata(_wire_value({key: value for key, value in options.items() if key not in ("source", "code", "resources")})),
        "subjectIdentity": subject.identity,
    }))
    return subject
