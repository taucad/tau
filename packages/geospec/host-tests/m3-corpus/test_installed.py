"""Installed CPython pytest routes for the shared M3 corpus."""

from __future__ import annotations

from hashlib import sha256
import importlib
import importlib.metadata
import json
import os
from pathlib import Path
import re
import sys
from typing import Any

import pytest

from geospec import (
    GeoSpecAssertionError,
    GeoSpecEngine,
    GeoSpecRegex,
    expect_geo,
    query_geo,
)


def _required_environment(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"{name} is required.")
    return value


def _byte_record(value: bytes) -> dict[str, object]:
    data = bytes(value)
    return {
        "byteLength": len(data),
        "sha256": sha256(data).hexdigest(),
        "utf8": data.decode("utf-8"),
    }


def _binary_record(value: bytes) -> dict[str, object]:
    data = bytes(value)
    return {"byteLength": len(data), "sha256": sha256(data).hexdigest()}


def _error_record(error: BaseException) -> dict[str, object]:
    return {
        "name": type(error).__name__,
        "constructorName": type(error).__name__,
        "code": getattr(error, "code", None),
        "message": str(error),
        "assertionError": isinstance(error, GeoSpecAssertionError),
        "protocolError": type(error).__name__ == "ProtocolError",
        "structuredGeoSpec": (
            {
                "claimId": error.report.result.get("claimId"),
                "diagnostics": [dict(value) for value in error.report.diagnostics],
                "status": error.report.result.get("status"),
            }
            if isinstance(error, GeoSpecAssertionError) and error.report is not None
            else None
        ),
    }


class _RecordingNativeEngine:
    def __init__(self, native_module: Any) -> None:
        self.native = native_module.Engine()
        self.calls: list[dict[str, object]] = []

    def _forward(
        self,
        operation: str,
        input_bytes: bytes,
        invoke: Any,
        **extra: object,
    ) -> bytes:
        record: dict[str, object] = {
            "operation": operation,
            "input": _byte_record(input_bytes),
            **extra,
        }
        self.calls.append(record)
        try:
            output = bytes(invoke())
        except BaseException as error:
            record["error"] = _error_record(error)
            raise
        record["output"] = _byte_record(output)
        return output

    def process_request(self, request: bytes) -> bytes:
        return self._forward(
            "processRequest", request, lambda: self.native.process_request(request)
        )

    def ingest_subject(
        self, request: bytes, primary: bytes, resources: list[bytes]
    ) -> bytes:
        return self._forward(
            "ingestSubject",
            request,
            lambda: self.native.ingest_subject(request, primary, resources),
            primary=_binary_record(primary),
            resources=[_binary_record(value) for value in resources],
        )

    def ingest_mesh(self, request: bytes, mesh: bytes) -> bytes:
        return self._forward(
            "ingestMesh", request, lambda: self.native.ingest_mesh(request, mesh)
        )

    def subject_handle(self, request: bytes) -> bytes:
        return self._forward(
            "subjectHandle", request, lambda: self.native.subject_handle(request)
        )

    def release_subject(self, request: bytes) -> bytes:
        return self._forward(
            "releaseSubject", request, lambda: self.native.release_subject(request)
        )

    def canonical_plan(self, request: bytes) -> bytes:
        return self._forward(
            "canonicalPlan", request, lambda: self.native.canonical_plan(request)
        )

    def evaluate_plan(self, plan: bytes) -> bytes:
        return self._forward(
            "evaluatePlan", plan, lambda: self.native.evaluate_plan(plan)
        )


def _read_fixture(fixture: dict[str, object]) -> bytes:
    value = Path(str(fixture["path"])).read_bytes()
    assert len(value) == fixture["byteLength"]
    assert sha256(value).hexdigest() == fixture["sha256"]
    return value


def _restore_python_value(value: object) -> object:
    if isinstance(value, list):
        return [_restore_python_value(entry) for entry in value]
    if isinstance(value, dict):
        if (
            value.get("type") == "regexp"
            and isinstance(value.get("pattern"), str)
            and isinstance(value.get("flags"), str)
        ):
            return GeoSpecRegex(value["pattern"], value["flags"])
        return {key: _restore_python_value(entry) for key, entry in value.items()}
    return value


def _snake_case(value: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", value).lower()


def _report_record(report: Any) -> dict[str, object]:
    return {
        "canonicalClaim": _byte_record(report.canonical_claim_bytes),
        "canonicalPlan": _byte_record(report.canonical_plan_bytes),
        "canonicalResult": _byte_record(report.canonical_result_bytes),
        "claim": dict(report.claim),
        "claimId": report.result.get("claimId"),
        "diagnostics": [dict(value) for value in report.diagnostics],
        "evidence": report.result.get("evidence"),
        "polarity": report.claim.get("polarity"),
        "result": dict(report.result),
        "status": report.result.get("status"),
    }


def _module_record(name: str) -> dict[str, object]:
    module = importlib.import_module(name)
    path = Path(module.__file__).resolve()
    return {
        "module": name,
        "path": str(path),
        "byteLength": path.stat().st_size,
        "sha256": sha256(path.read_bytes()).hexdigest(),
    }


def _provenance() -> dict[str, object]:
    return {
        "sysExecutable": sys.executable,
        "sysVersion": sys.version,
        "sysPath": sys.path,
        "pytest": pytest.__version__,
        "modules": [
            _module_record("geospec"),
            _module_record("geospec._api"),
            _module_record("geospec.pytest_plugin"),
            _module_record("geospec_engine_native"),
            _module_record("geospec_engine_native.geospec_engine_native"),
        ],
        "pluginEntryPoints": [
            {
                "group": entry.group,
                "name": entry.name,
                "value": entry.value,
            }
            for entry in importlib.metadata.entry_points(group="pytest11")
            if entry.value == "geospec.pytest_plugin"
        ],
    }


def _evaluate_row(
    recorder: _RecordingNativeEngine,
    subject: Any,
    row: dict[str, object],
) -> tuple[Any, dict[str, object] | None]:
    report = None
    failure = None
    try:
        if row["expected"]["protocolError"] is not None:
            recorder.canonical_plan(row["authoredRequestUtf8"].encode("utf-8"))
        elif not row["matcher"]:
            report = query_geo(
                subject,
                row["capability"],
                _restore_python_value(row["authoring"]["queryPayload"]),
                claim_id=row["claimId"],
            )
        else:
            chain = expect_geo(subject, claim_id=row["claimId"])
            if row["polarity"] == "negative":
                chain = chain.not_
            method = getattr(chain, _snake_case(row["capability"]))
            arguments = [
                _restore_python_value(value)
                for value in row["authoring"]["argumentsProtocolJson"]
            ]
            report = method(*arguments)
    except BaseException as error:
        failure = _error_record(error)
        if isinstance(error, GeoSpecAssertionError) and error.report is not None:
            report = error.report
    return report, failure


def run_installed_row(native_module: Any, row: dict[str, object], route: str) -> dict[str, object]:
    recorder = _RecordingNativeEngine(native_module)
    engine = None
    subject = None
    report = None
    failure = None
    warmup_record = None
    evaluation_calls: list[dict[str, object]] = []
    route_state = "construction"
    try:
        engine = GeoSpecEngine(
            work_unit_budget=row["workUnitBudget"],
            native_engine=recorder,
            native_module=native_module,
        )
        route_state = "admission"
        admission = row["admission"]
        frame = admission["frame"]
        resources = [
            (str(fixture["name"]), _read_fixture(fixture))
            for fixture in row["subject"]["resources"]
        ]
        subject = engine.ingest_subject(
            _read_fixture(row["subject"]["primary"]),
            format=admission["format"],
            coordinate_system=frame["coordinateSystem"],
            source_unit=frame["sourceUnit"],
            output_unit=frame["outputUnit"],
            ingest_options=admission["ingestOptions"],
            resources=resources,
            slot=row["subjectSlot"],
        )
        assert subject.identity_field == row["identityField"]
        if row["expectedIdentity"] is not None:
            assert subject.identity == row["expectedIdentity"]
        route_state = "evaluation"
        warmup = row.get("warmup")
        if warmup is not None:
            start = len(recorder.calls)
            # Python's public budget belongs to the Engine. Prepare the retained
            # cache through the existing byte API with the independently authored
            # warmup budget; the tested row below still uses the public matcher.
            warmup_plan = recorder.canonical_plan(warmup["authoredRequestUtf8"].encode("utf-8"))
            warmup_result = recorder.evaluate_plan(warmup_plan)
            warmup_claim = json.loads(warmup_plan)["plan"]["claims"][0]
            warmup_value = json.loads(warmup_result)["results"][0]
            warmup_record = {
                "route": "direct-core-byte-api-cache-preparation",
                "calls": recorder.calls[start:],
                "error": None,
                "report": {
                    "canonicalClaim": _byte_record(native_module.canonicalize(
                        json.dumps(warmup_claim, separators=(",", ":")).encode("utf-8")
                    )),
                    "canonicalPlan": _byte_record(warmup_plan),
                    "canonicalResult": _byte_record(warmup_result),
                    "claim": warmup_claim,
                    "claimId": warmup_value["claimId"],
                    "status": warmup_value["status"],
                    "result": warmup_value,
                },
            }
        start = len(recorder.calls)
        report, failure = _evaluate_row(recorder, subject, row)
        evaluation_calls = recorder.calls[start:]
        route_state = "evaluated"
    except BaseException as error:
        failure = _error_record(error)
        route_state = f"{route_state}-error"
    finally:
        cleanup_error = None
        try:
            if subject is not None:
                subject.close()
            if engine is not None:
                engine.close()
        except BaseException as error:
            cleanup_error = _error_record(error)
    initialize = [call for call in recorder.calls if call["operation"] == "processRequest"]
    admissions = [call for call in recorder.calls if call["operation"] == "ingestSubject"]
    handles = [call for call in recorder.calls if call["operation"] == "subjectHandle"]
    releases = [call for call in recorder.calls if call["operation"] == "releaseSubject"]
    cleanup_status = "cleanup-error"
    if cleanup_error is None:
        cleanup_status = (
            "released"
            if subject is not None and len(releases) == 1
            else "not-acquired"
        )
    return {
        "id": row["id"],
        "route": route,
        "routeState": route_state,
        "authoring": row["authoring"],
        "admittedIdentity": (
            {
                "field": row["identityField"],
                "expected": row["expectedIdentity"],
                "actual": subject.identity if subject is not None else None,
            }
            if subject is not None
            else None
        ),
        "error": failure,
        "report": _report_record(report) if report is not None else None,
        "publicSurfaceLimitation": (
            "Ancillary queries are positive-only in the public Python surface; "
            "this frozen negative control remains a direct canonical-plan probe."
            if row["expected"]["protocolError"] is not None
            else None
        ),
        "stages": {
            "initialize": initialize,
            "admission": admissions,
            "subjectHandle": handles,
            "warmup": warmup_record,
            "evaluation": evaluation_calls,
            "cleanup": {
                "status": cleanup_status,
                "calls": releases,
                "close": "GeoSpecEngine.close",
                "error": cleanup_error,
            },
        },
    }


def _compare_verdict(row: dict[str, Any], outcome: dict[str, Any]) -> dict[str, Any]:
    """Gate declared verdicts without deriving an oracle from captured geometry."""
    expected = row["expected"]
    report = outcome.get("report")
    failure = outcome.get("error")
    protocol = expected.get("protocolError")
    status = expected.get("status")
    if status == "full" and expected.get("canonicalResultUtf8"):
        status = next(
            (
                result.get("status")
                for result in json.loads(expected["canonicalResultUtf8"])["results"]
                if result.get("claimId") == row["claimId"]
            ),
            None,
        )
    known = status in {
        "passed", "failed", "unsupported", "refused", "invalid", "cancelled", "engine-error"
    }
    status_equal = (
        report is not None and report.get("status") == status
        if known and not protocol else None
    )
    hard_failures = []
    if protocol:
        if not (
            failure
            and failure.get("protocolError") is True
            and failure.get("code") == protocol["code"]
            and failure.get("message") == protocol["message"]
            and report is None
        ):
            hard_failures.append("canonical-plan-protocol-error")
    else:
        if not known:
            hard_failures.append("expected-status-authority")
        elif not status_equal:
            hard_failures.append("expected-status")
        if not report or not all(
            report.get(field, {}).get("utf8")
            for field in ("canonicalClaim", "canonicalPlan", "canonicalResult")
        ):
            hard_failures.append("missing-report")
        if failure and (not row["matcher"] or (report or {}).get("status") == "passed"):
            hard_failures.append("unexpected-error")
        if row["matcher"] and report and report.get("status") != "passed":
            structured = bool(failure) and (
                failure.get("assertionError") is True
                or (failure.get("structuredGeoSpec") or {}).get("claimId")
                == report.get("claimId")
            )
            if not structured:
                hard_failures.append("unstructured-assertion-error")
    if outcome.get("stages", {}).get("cleanup", {}).get("status") != "released":
        hard_failures.append("cleanup")
    return {
        "expectedStatus": status if known else None,
        "statusEqual": status_equal,
        "statusAuthority": (
            "independent-protocol-error" if protocol
            else "independent-verdict" if known else "withheld"
        ),
        "hardFailures": hard_failures,
    }


def test_should_exercise_complete_selected_corpus_through_installed_pytest(
    geospec_engine: GeoSpecEngine,
    pytestconfig: pytest.Config,
) -> None:
    assert isinstance(geospec_engine, GeoSpecEngine)
    assert pytestconfig.pluginmanager.hasplugin("geospec.pytest_plugin") or (
        pytestconfig.pluginmanager.hasplugin("geospec")
    )
    native_module = importlib.import_module("geospec_engine_native")
    campaign = json.loads(
        Path(_required_environment("GEOSPEC_INSTALLED_MAP")).read_text(
            encoding="utf-8"
        )
    )
    route = f"python{sys.version_info.major}.{sys.version_info.minor}-pytest"
    output: dict[str, object] = {
        "schemaVersion": 1,
        "taskId": campaign["taskId"],
        "route": route,
        "sourceCorpusFingerprint": campaign["sourceCorpusFingerprint"],
        "provenance": _provenance(),
        "rows": [],
    }
    try:
        for row in campaign["rows"]:
            outcome = run_installed_row(native_module, row, route)
            output["rows"].append(outcome)
            outcome["comparison"] = _compare_verdict(row, outcome)
        assert len(output["rows"]) == len(campaign["rows"])
        failures = [
            f"{outcome['id']}: {failure}"
            for outcome in output["rows"]
            for failure in outcome["comparison"]["hardFailures"]
        ]
        assert not failures, failures
    finally:
        Path(_required_environment("GEOSPEC_PYTHON_OUTPUT")).write_text(
            json.dumps(output, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
