"""Thin Python authoring facade over canonical native plans and results."""

from __future__ import annotations

from dataclasses import dataclass
import importlib
import json
import math
import re
from types import MappingProxyType
from typing import Any, Mapping, Protocol, Sequence

_MAX_SAFE_INTEGER = 9_007_199_254_740_991


class _NativeEngine(Protocol):
    def ingest_subject(
        self,
        request: bytes,
        primary: bytes,
        resources: Sequence[bytes],
    ) -> bytes: ...

    def ingest_mesh(self, request: bytes, mesh: bytes) -> bytes: ...

    def subject_handle(self, request: bytes) -> bytes: ...

    def release_subject(self, request: bytes) -> bytes: ...

    def process_request(self, request: bytes) -> bytes: ...

    def canonical_plan(self, request: bytes) -> bytes: ...

    def evaluate_plan(self, plan: bytes) -> bytes: ...


@dataclass(frozen=True, slots=True)
class GeoSpecRegex:
    """An ECMAScript pattern sent unchanged to the Rust selector engine."""

    pattern: str
    flags: str = ""


@dataclass(slots=True)
class GeoSpecSubject:
    """One engine-owned subject and its canonical plan identity."""

    engine: GeoSpecEngine
    slot: str
    identity_field: str
    identity: str
    _handle: Mapping[str, object] | None = None
    _closed: bool = False

    def plan_entry(self) -> dict[str, object]:
        if self._closed:
            raise RuntimeError("GeoSpec subject is closed.")
        return {"slot": self.slot, self.identity_field: self.identity}

    def close(self) -> None:
        """Release this subject's current engine generation."""

        if self._closed:
            return
        self.engine._release_subject(self)
        self._closed = True

    def __enter__(self) -> GeoSpecSubject:
        if self._closed:
            raise RuntimeError("GeoSpec subject is closed.")
        return self

    def __exit__(self, _type: object, _value: object, _traceback: object) -> None:
        self.close()

    def __del__(self) -> None:
        try:
            self.close()
        except Exception:
            pass


@dataclass(frozen=True, slots=True)
class GeoSpecAssertionReport:
    """Canonical bytes and structured result for one assertion."""

    canonical_claim_bytes: bytes
    canonical_plan_bytes: bytes
    canonical_result_bytes: bytes
    claim: Mapping[str, object]
    result: Mapping[str, object]

    @property
    def diagnostics(self) -> tuple[Mapping[str, object], ...]:
        values = self.result.get("diagnostics", ())
        if not isinstance(values, list):
            return ()
        return tuple(value for value in values if isinstance(value, dict))

    @property
    def passed(self) -> bool:
        assertion_passed = self.result.get("assertionPassed")
        if isinstance(assertion_passed, bool):
            return assertion_passed
        return self.result.get("status") == "passed"


class GeoSpecAssertionError(AssertionError):
    """A failed or non-evaluated GeoSpec assertion."""

    def __init__(
        self,
        message: str,
        *,
        report: GeoSpecAssertionReport | None = None,
        code: str | None = None,
        protocol_error: Exception | None = None,
    ) -> None:
        super().__init__(message)
        self.report = report
        self.diagnostics = report.diagnostics if report is not None else ()
        self.claim = report.claim if report is not None else None
        self.result = report.result if report is not None else None
        self.code = code
        self.protocol_error = protocol_error
        self.canonical_claim_bytes = (
            report.canonical_claim_bytes if report is not None else None
        )
        self.canonical_plan_bytes = (
            report.canonical_plan_bytes if report is not None else None
        )
        self.canonical_result_bytes = (
            report.canonical_result_bytes if report is not None else None
        )

    @classmethod
    def from_report(cls, report: GeoSpecAssertionReport) -> GeoSpecAssertionError:
        messages = [
            value
            for diagnostic in report.diagnostics
            if isinstance((value := diagnostic.get("message")), str)
        ]
        message = "\n".join(messages) or (
            f"GeoSpec assertion '{report.claim.get('claimId', '<unknown>')}' "
            f"ended with status '{report.result.get('status', '<unknown>')}'."
        )
        code = next(
            (
                value
                for diagnostic in report.diagnostics
                if isinstance((value := diagnostic.get("code")), str)
            ),
            None,
        )
        return cls(message, report=report, code=code)

    @classmethod
    def from_protocol_error(cls, error: Exception) -> GeoSpecAssertionError:
        code = getattr(error, "code", None)
        if not isinstance(code, str):
            code = None
        return cls(str(error), code=code, protocol_error=error)


class GeoSpecEngine:
    """Owner-thread native engine used by Python assertions."""

    def __init__(
        self,
        *,
        work_unit_budget: int | None = None,
        native_engine: _NativeEngine | None = None,
        native_module: Any | None = None,
    ) -> None:
        if native_module is None:
            native_module = importlib.import_module("geospec_engine_native")
        self._native_module = native_module
        self._native = (
            native_engine if native_engine is not None else native_module.Engine()
        )
        self._next_claim = 0
        self._next_lifecycle = 0
        self._handles: list[Mapping[str, object]] = []
        self._closed = False
        subject_handle = getattr(self._native, "subject_handle", None)
        release_subject = getattr(self._native, "release_subject", None)
        if callable(subject_handle) != callable(release_subject):
            raise RuntimeError(
                "GeoSpec native lifecycle requires subject_handle and release_subject together."
            )
        self._has_lifecycle = callable(subject_handle)
        if native_engine is None and not self._has_lifecycle:
            raise RuntimeError(
                "Installed GeoSpec native Engine does not expose subject lifecycle operations."
            )
        initialized = _decode_object(
            self._native.process_request(
                _json_bytes(
                    {
                        "method": "initialize",
                        "requestId": "python-initialize",
                        "protocolVersion": 3,
                        "registryVersion": 5,
                        "canonicalProfile": "geospec-jcs-v1",
                    }
                )
            ),
            "initialize response",
        )
        result = _required_object(initialized, "result", "initialize response")
        self.protocol_version = _required_int(result, "protocolVersion")
        self.registry_version = _required_int(result, "registryVersion")
        self.canonical_profile = _required_str(result, "canonicalProfile")
        configuration = result.get("configuration")
        if configuration is not None and not isinstance(configuration, dict):
            raise RuntimeError(
                "GeoSpec initialize field 'configuration' must be an object."
            )
        self.configuration = (
            MappingProxyType(configuration) if configuration is not None else None
        )
        if work_unit_budget is None:
            if configuration is None:
                raise RuntimeError(
                    "GeoSpec initialize response has no default work-unit budget."
                )
            work_unit_budget = _required_int(configuration, "defaultWorkUnitBudget")
        _validate_work_unit_budget(work_unit_budget)
        self._work_unit_budget = work_unit_budget
        values = result.get("capabilities")
        if not isinstance(values, list):
            raise RuntimeError("GeoSpec initialize response has no capabilities array.")
        capabilities: list[str] = []
        for value in values:
            if isinstance(value, str):
                capabilities.append(value)
            elif isinstance(value, dict) and isinstance(value.get("name"), str):
                capabilities.append(value["name"])
            else:
                raise RuntimeError(
                    "GeoSpec initialize returned an invalid capability entry."
                )
        self.capabilities = tuple(capabilities)

    def close(self) -> None:
        """Release every subject generation owned by this engine facade."""

        if self._closed:
            return
        first_error: Exception | None = None
        for handle in tuple(self._handles):
            try:
                self._release_handle(handle)
            except Exception as error:
                if first_error is None:
                    first_error = error
        if first_error is not None:
            raise first_error
        self._closed = True

    def __enter__(self) -> GeoSpecEngine:
        if self._closed:
            raise RuntimeError("GeoSpec engine is closed.")
        return self

    def __exit__(self, _type: object, _value: object, _traceback: object) -> None:
        self.close()

    def __del__(self) -> None:
        try:
            self.close()
        except Exception:
            pass

    def _ensure_open(self) -> None:
        if self._closed:
            raise RuntimeError("GeoSpec engine is closed.")

    def ingest_mesh(
        self,
        mesh: bytes,
        *,
        slot: str = "subject",
    ) -> GeoSpecSubject:
        self._ensure_open()
        import hashlib

        mesh = _required_bytes(mesh, "mesh")
        digest = hashlib.sha256(mesh).hexdigest()
        response = _decode_object(
            self._native.ingest_mesh(
                _json_bytes(
                    {
                        "method": "ingestSubject",
                        "requestId": f"python-ingest-{slot}",
                        "protocolVersion": self.protocol_version,
                        "registryVersion": self.registry_version,
                        "canonicalProfile": self.canonical_profile,
                        "contentHash": digest,
                        "format": "mesh-buffer-v1",
                        "frame": {"coordinateSystem": "z-up", "unit": "mm"},
                    }
                ),
                mesh,
            ),
            "ingest response",
        )
        return self._subject(response, slot)

    def ingest_subject(
        self,
        primary: bytes,
        *,
        format: str,
        coordinate_system: str,
        source_unit: str,
        output_unit: str,
        ingest_options: Mapping[str, object] | None = None,
        resources: Sequence[tuple[str, bytes]] = (),
        slot: str = "subject",
    ) -> GeoSpecSubject:
        """Admit owned buffers, preserving literal format-specific options.

        Omitted options become an empty object. The core validates supported
        options and derives the applied scale from the source/output units.
        """

        self._ensure_open()
        primary = _required_bytes(primary, "primary")
        if ingest_options is not None and not isinstance(ingest_options, Mapping):
            raise TypeError("ingest_options must be a mapping.")
        options = {} if ingest_options is None else _wire_value(ingest_options)
        metadata: list[dict[str, object]] = []
        binary_resources: list[bytes] = []
        for index, resource in enumerate(resources):
            if not isinstance(resource, tuple) or len(resource) != 2:
                raise TypeError(f"resources[{index}] must be a (name, bytes) tuple.")
            name, binary = resource
            if not isinstance(name, str):
                raise TypeError(f"resources[{index}] name must be a string.")
            binary = _required_bytes(binary, f"resources[{index}] bytes")
            metadata.append({"name": name, "byteLength": len(binary)})
            binary_resources.append(binary)
        response = _decode_object(
            self._native.ingest_subject(
                _json_bytes(
                    {
                        "method": "ingestSubject",
                        "requestId": f"python-ingest-{slot}",
                        "protocolVersion": self.protocol_version,
                        "registryVersion": self.registry_version,
                        "canonicalProfile": self.canonical_profile,
                        "format": format,
                        "frame": {
                            "coordinateSystem": coordinate_system,
                            "sourceUnit": source_unit,
                            "outputUnit": output_unit,
                        },
                        "ingestOptions": options,
                        "primaryByteLength": len(primary),
                        "resources": metadata,
                    }
                ),
                primary,
                binary_resources,
            ),
            "ingest response",
        )
        return self._subject(response, slot)

    def _subject(
        self,
        response: Mapping[str, object],
        slot: str,
    ) -> GeoSpecSubject:
        subject = _required_object(
            _required_object(response, "result", "ingest response"),
            "subject",
            "ingest response result",
        )
        for field in ("subjectHash", "contentHash"):
            identity = subject.get(field)
            if isinstance(identity, str):
                handle = self._acquire_handle(field, identity)
                value = GeoSpecSubject(self, slot, field, identity, handle)
                if handle is not None:
                    self._handles.append(handle)
                return value
        raise RuntimeError("GeoSpec ingest response has no subject identity.")

    def _acquire_handle(
        self, identity_field: str, identity: str
    ) -> Mapping[str, object] | None:
        if not self._has_lifecycle:
            return None
        self._next_lifecycle += 1
        response = _decode_object(
            self._native.subject_handle(
                _json_bytes(
                    {
                        "method": "subjectHandle",
                        "requestId": f"python-subject-handle-{self._next_lifecycle}",
                        "protocolVersion": self.protocol_version,
                        "registryVersion": self.registry_version,
                        "canonicalProfile": self.canonical_profile,
                        identity_field: identity,
                    }
                )
            ),
            "subject handle response",
        )
        handle = _required_object(
            _required_object(response, "result", "subject handle response"),
            "subjectHandle",
            "subject handle response result",
        )
        return MappingProxyType(handle)

    def _release_handle(self, handle: Mapping[str, object]) -> None:
        if handle not in self._handles:
            return
        if self._handles.count(handle) > 1:
            self._handles.remove(handle)
            return
        self._next_lifecycle += 1
        self._native.release_subject(
            _json_bytes(
                {
                    "method": "releaseSubject",
                    "requestId": f"python-release-subject-{self._next_lifecycle}",
                    "protocolVersion": self.protocol_version,
                    "registryVersion": self.registry_version,
                    "canonicalProfile": self.canonical_profile,
                    "subjectHandle": dict(handle),
                }
            )
        )
        if handle in self._handles:
            self._handles.remove(handle)

    def _release_subject(self, subject: GeoSpecSubject) -> None:
        if subject.engine is not self:
            raise ValueError("GeoSpec subject belongs to a different engine.")
        if subject._handle is not None:
            self._release_handle(subject._handle)

    def evaluate(
        self,
        subject: GeoSpecSubject,
        capability: str,
        arguments: Sequence[object],
        *,
        claim_id: str | None,
        polarity: str,
    ) -> GeoSpecAssertionReport:
        if capability == "toSatisfyRationalPlate":
            if arguments:
                raise TypeError(
                    "to_satisfy_rational_plate() does not accept arguments."
                )
            payload: object = {"contract": "geospec.plate-two-windows/v1"}
        elif capability == "toSatisfyParallelPlaneDistance":
            if arguments:
                raise TypeError(
                    "to_satisfy_parallel_plane_distance() does not accept arguments."
                )
            payload = {"contract": "geospec.pmi.parallel-plane-distance/v1"}
        else:
            payload = {"kind": _matcher_kind(capability), "arguments": list(arguments)}
        return self._evaluate_payload(
            subject,
            capability,
            payload,
            claim_id=claim_id,
            polarity=polarity,
        )

    def query(
        self,
        subject: GeoSpecSubject,
        capability: str,
        payload: object = None,
        *,
        claim_id: str | None = None,
    ) -> GeoSpecAssertionReport:
        """Return a complete positive query report, including refusals or failures."""

        if capability not in (
            "analyzeMesh", "analyzeBrep", "inspectGeometry", "analyzeMeshOverlap", "queryPmi"
        ):
            raise ValueError(f"GeoSpec capability '{capability}' is not a query.")
        return self._evaluate_payload(
            subject, capability, payload, claim_id=claim_id, polarity="positive"
        )

    def _evaluate_payload(
        self,
        subject: GeoSpecSubject,
        capability: str,
        payload: object,
        *,
        claim_id: str | None,
        polarity: str,
    ) -> GeoSpecAssertionReport:
        self._ensure_open()
        if subject.engine is not self:
            raise ValueError("GeoSpec subject belongs to a different engine.")
        if capability not in self.capabilities:
            raise ValueError(f"GeoSpec capability '{capability}' is not advertised.")
        if polarity not in ("positive", "negative"):
            raise ValueError("polarity must be 'positive' or 'negative'.")
        if claim_id is None:
            self._next_claim += 1
            claim_id = f"geospec-claim-{self._next_claim}"
        claim = {
            "claimId": claim_id,
            "capability": capability,
            "subjectSlots": [subject.slot],
            "payload": _wire_value(payload),
            "polarity": polarity,
            "workUnitBudget": self._work_unit_budget,
        }
        request = {
            "method": "submitClaims",
            "requestId": f"python-{claim_id}",
            "protocolVersion": self.protocol_version,
            "registryVersion": self.registry_version,
            "canonicalProfile": self.canonical_profile,
            "plan": {"subjects": [subject.plan_entry()], "claims": [claim]},
        }
        canonical_plan = bytes(self._native.canonical_plan(_json_bytes(request)))
        parsed_plan = _decode_object(canonical_plan, "canonical plan")
        plan = _required_object(parsed_plan, "plan", "canonical plan")
        claims = plan.get("claims")
        if (
            not isinstance(claims, list)
            or len(claims) != 1
            or not isinstance(claims[0], dict)
        ):
            raise RuntimeError(
                "GeoSpec canonical plan did not return exactly one claim."
            )
        canonical_claim = bytes(
            self._native_module.canonicalize(_json_bytes(claims[0]))
        )
        canonical_result = bytes(self._native.evaluate_plan(canonical_plan))
        parsed_result = _decode_object(canonical_result, "canonical result")
        results = parsed_result.get("results")
        if (
            not isinstance(results, list)
            or len(results) != 1
            or not isinstance(results[0], dict)
        ):
            raise RuntimeError(
                "GeoSpec canonical result did not return exactly one result."
            )
        return GeoSpecAssertionReport(
            canonical_claim,
            canonical_plan,
            canonical_result,
            MappingProxyType(claims[0]),
            MappingProxyType(results[0]),
        )


class _Expectation:
    def __init__(
        self,
        subject: GeoSpecSubject,
        *,
        claim_id: str | None,
        polarity: str,
    ) -> None:
        self._subject = subject
        self._claim_id = claim_id
        self._polarity = polarity

    @property
    def not_(self) -> _Expectation:
        polarity = "negative" if self._polarity == "positive" else "positive"
        return _Expectation(self._subject, claim_id=self._claim_id, polarity=polarity)

    def __getattr__(self, name: str) -> Any:
        capability = _snake_to_camel(name)
        if capability not in self._subject.engine.capabilities:
            raise AttributeError(name)

        def assertion(*arguments: object, **expected: object) -> GeoSpecAssertionReport:
            if arguments and expected:
                raise TypeError(
                    "Use positional arguments or keyword expectation fields, not both."
                )
            authored = arguments if arguments else ((expected,) if expected else ())
            try:
                report = evaluate_geo(
                    self._subject,
                    capability,
                    *authored,
                    claim_id=self._claim_id,
                    polarity=self._polarity,
                )
            except GeoSpecAssertionError:
                raise
            except TypeError:
                raise
            except Exception as error:
                raise GeoSpecAssertionError.from_protocol_error(error) from error
            if not report.passed:
                raise GeoSpecAssertionError.from_report(report)
            return report

        return assertion


def expect_geo(
    subject: GeoSpecSubject,
    *,
    claim_id: str | None = None,
) -> _Expectation:
    """Create a positive assertion chain for an ingested subject."""

    return _Expectation(subject, claim_id=claim_id, polarity="positive")


def evaluate_geo(
    subject: GeoSpecSubject,
    capability: str,
    *arguments: object,
    claim_id: str | None = None,
    polarity: str = "positive",
) -> GeoSpecAssertionReport:
    """Evaluate one matcher and retain its canonical plan and result bytes."""

    return subject.engine.evaluate(
        subject,
        capability,
        arguments,
        claim_id=claim_id,
        polarity=polarity,
    )


def query_geo(
    subject: GeoSpecSubject,
    capability: str,
    payload: object = None,
    *,
    claim_id: str | None = None,
) -> GeoSpecAssertionReport:
    """Query native geometry and retain the complete report without asserting."""

    return subject.engine.query(subject, capability, payload, claim_id=claim_id)


def _wire_value(value: object) -> object:
    if value is None or isinstance(value, (str, bool)):
        return value
    if isinstance(value, int):
        if abs(value) > _MAX_SAFE_INTEGER:
            raise ValueError(
                "GeoSpec integers must be within the exact safe-integer range."
            )
        return value
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("GeoSpec claims cannot contain non-finite numbers.")
        return value
    if isinstance(value, GeoSpecRegex):
        return {"type": "regexp", "pattern": value.pattern, "flags": value.flags}
    if isinstance(value, re.Pattern):
        raise TypeError(
            "Python re.Pattern semantics are not portable to ECMAScript; "
            "use GeoSpecRegex(pattern, flags) explicitly."
        )
    if isinstance(value, Mapping):
        result: dict[str, object] = {}
        for key, entry in value.items():
            if not isinstance(key, str):
                raise TypeError("GeoSpec object keys must be strings.")
            result[key] = _wire_value(entry)
        return result
    if isinstance(value, (list, tuple)):
        return [_wire_value(entry) for entry in value]
    raise TypeError(f"Unsupported GeoSpec claim value: {type(value).__name__}.")


def _matcher_kind(capability: str) -> str:
    if capability == "toHaveNoComponentInterference":
        return "componentInterference"
    for prefix in ("toHave", "toBe"):
        if capability.startswith(prefix) and len(capability) > len(prefix):
            suffix = capability[len(prefix) :]
            return suffix[0].lower() + suffix[1:]
    raise ValueError(f"GeoSpec capability '{capability}' is not a matcher.")


def _snake_to_camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(part[:1].upper() + part[1:] for part in tail)


def _json_bytes(value: object) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
    ).encode("utf-8")


def _decode_object(value: bytes, label: str) -> dict[str, object]:
    decoded = json.loads(bytes(value))
    if not isinstance(decoded, dict):
        raise RuntimeError(f"GeoSpec {label} must be an object.")
    return decoded


def _required_object(
    value: Mapping[str, object], key: str, label: str
) -> dict[str, object]:
    result = value.get(key)
    if not isinstance(result, dict):
        raise RuntimeError(f"GeoSpec {label} has no object field '{key}'.")
    return result


def _required_int(value: Mapping[str, object], key: str) -> int:
    result = value.get(key)
    if not isinstance(result, int) or isinstance(result, bool):
        raise RuntimeError(f"GeoSpec initialize field '{key}' must be an integer.")
    return result


def _required_str(value: Mapping[str, object], key: str) -> str:
    result = value.get(key)
    if not isinstance(result, str):
        raise RuntimeError(f"GeoSpec initialize field '{key}' must be a string.")
    return result


def _required_bytes(value: object, label: str) -> bytes:
    if not isinstance(value, bytes):
        raise TypeError(f"{label} must be bytes.")
    return value


def _validate_work_unit_budget(value: object) -> None:
    if not isinstance(value, int) or isinstance(value, bool):
        raise TypeError("work_unit_budget must be an integer.")
    if value < 1 or value > _MAX_SAFE_INTEGER:
        raise ValueError("work_unit_budget must be a positive safe integer.")
