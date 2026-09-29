"""Installed-wheel pytest route for the approved authored matcher corpus."""

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
    GeoSpecSubject,
    evaluate_geo,
    expect_geo,
)


def _required_environment(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"{name} is required.")
    return value


def _write_json(path: str, value: object) -> None:
    Path(path).write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _utf8_record(value: bytes) -> dict[str, object]:
    return {
        "byteLength": len(value),
        "sha256": sha256(value).hexdigest(),
        "utf8": value.decode("utf-8"),
    }


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


def _read_verified(root: Path, fixture: dict[str, object]) -> bytes:
    if "path" in fixture:
        value = (root / str(fixture["path"])).read_bytes()
    elif "utf8" in fixture:
        value = str(fixture["utf8"]).encode("utf-8")
    else:
        value = bytes.fromhex(str(fixture["hex"]))
    expected_length = fixture.get("byteLength", fixture.get("bytes"))
    assert len(value) == expected_length
    assert sha256(value).hexdigest() == fixture["sha256"]
    return value


def _admit_subject(
    native_module: Any,
    row: dict[str, object],
) -> tuple[Any, GeoSpecSubject, dict[str, object]]:
    workspace_root = Path(_required_environment("GEOSPEC_WORKSPACE_ROOT"))
    subject_data = row["subject"]
    native_engine = native_module.Engine()
    primary = _read_verified(workspace_root, subject_data["primary"])
    resources = [
        _read_verified(workspace_root, resource) for resource in subject_data["resources"]
    ]
    receipt_bytes = bytes(
        native_engine.ingest_subject(
            subject_data["ingestRequestUtf8"].encode("utf-8"), primary, resources
        )
    )
    receipt = json.loads(receipt_bytes)
    expected_identity = subject_data["expectedIdentity"]
    actual_identity = receipt["result"]["subject"][expected_identity["field"]]
    assert actual_identity == expected_identity["value"]
    public_engine = GeoSpecEngine(
        work_unit_budget=row["workUnitBudget"],
        native_engine=native_engine,
        native_module=native_module,
    )
    subject = GeoSpecSubject(
        public_engine,
        row["subjectSlot"],
        expected_identity["field"],
        actual_identity,
    )
    return native_engine, subject, {
        "receipt": _utf8_record(receipt_bytes),
        "subject": {
            expected_identity["field"]: actual_identity,
        },
    }


def _report_record(report: Any) -> dict[str, object]:
    return {
        "canonicalClaim": _utf8_record(report.canonical_claim_bytes),
        "canonicalPlan": _utf8_record(report.canonical_plan_bytes),
        "canonicalResult": _utf8_record(report.canonical_result_bytes),
        "claim": dict(report.claim),
        "diagnostics": [dict(value) for value in report.diagnostics],
        "result": dict(report.result),
        "status": report.result.get("status"),
    }


def _error_record(error: BaseException) -> dict[str, object]:
    protocol_error = getattr(error, "protocol_error", None)
    return {
        "name": type(error).__name__,
        "code": getattr(error, "code", None),
        "message": str(error),
        "isGeoSpecAssertionError": isinstance(error, GeoSpecAssertionError),
        "protocolErrorName": type(protocol_error).__name__
        if protocol_error is not None
        else None,
    }


def _compare_outcome(
    row: dict[str, object], outcome: dict[str, object]
) -> dict[str, object]:
    report = outcome.get("report")
    expected = row["expected"]
    oracle = {
        "canonicalClaimEqual": report is not None
        and report["canonicalClaim"]["utf8"] == expected["canonicalClaim"]["utf8"],
        "canonicalPlanEqual": report is not None
        and report["canonicalPlan"]["utf8"] == expected["canonicalPlan"]["utf8"],
        "canonicalResultEqual": None
        if expected["canonicalResult"] is None
        else report is not None
        and report["canonicalResult"]["utf8"]
        == expected["canonicalResult"]["utf8"],
    }
    direct = row.get("frozenDirectB19")
    direct_equal = None
    if direct and direct.get("error"):
        error = outcome.get("error")
        direct_equal = (
            error is not None
            and error.get("protocolErrorName") == direct["error"]["name"]
            and error.get("code") == direct["error"]["code"]
            and error.get("message") == direct["error"]["message"]
        )
    elif direct and direct.get("canonicalPlanUtf8"):
        direct_equal = (
            report is not None
            and report["canonicalPlan"]["utf8"] == direct["canonicalPlanUtf8"]
            and report["canonicalResult"]["utf8"]
            == direct["evaluatePlanResultUtf8"]
        )
    return {"directRouteEqual": direct_equal, "independentOracle": oracle}


def _module_record(module_name: str) -> dict[str, object]:
    module = importlib.import_module(module_name)
    path = Path(module.__file__).resolve()
    return {
        "module": module_name,
        "path": str(path),
        "byteLength": path.stat().st_size,
        "sha256": sha256(path.read_bytes()).hexdigest(),
    }


def _distribution_record(distribution_name: str) -> dict[str, object]:
    distribution = importlib.metadata.distribution(distribution_name)
    return {
        "distribution": distribution_name,
        "version": distribution.version,
        "root": str(Path(distribution.locate_file("")).resolve()),
    }


def _provenance() -> dict[str, object]:
    native_modules = ["geospec_engine_native"]
    try:
        importlib.import_module("geospec_engine_native.geospec_engine_native")
    except ModuleNotFoundError:
        pass
    else:
        native_modules.append("geospec_engine_native.geospec_engine_native")
    plugin_entry_points = [
        {
            "group": entry_point.group,
            "name": entry_point.name,
            "value": entry_point.value,
        }
        for entry_point in importlib.metadata.entry_points(group="pytest11")
        if entry_point.value == "geospec.pytest_plugin"
    ]
    return {
        "sysExecutable": sys.executable,
        "sysVersion": sys.version,
        "sysPath": sys.path,
        "modules": [
            _module_record(name)
            for name in (
                "geospec",
                "geospec._api",
                "geospec.pytest_plugin",
                *native_modules,
                "pytest",
            )
        ],
        "distributions": [
            _distribution_record(name)
            for name in (
                "geospec-engine-native",
                "pytest",
                "pluggy",
                "packaging",
                "iniconfig",
                "Pygments",
            )
        ],
        "pytestPluginEntryPoints": plugin_entry_points,
    }


def test_should_invoke_every_approved_row_through_installed_python_public_api(
    geospec_engine: GeoSpecEngine,
    pytestconfig: pytest.Config,
) -> None:
    assert pytestconfig.pluginmanager.hasplugin("geospec.pytest_plugin") or (
        pytestconfig.pluginmanager.hasplugin("geospec")
    )
    assert isinstance(geospec_engine, GeoSpecEngine)
    native_module = importlib.import_module("geospec_engine_native")
    authoring_map = json.loads(
        Path(_required_environment("GEOSPEC_AUTHORING_MAP")).read_text(encoding="utf-8")
    )
    output: dict[str, object] = {
        "schemaVersion": 1,
        "taskId": authoring_map["taskId"],
        "route": f"python{sys.version_info.major}.{sys.version_info.minor}-pytest",
        "provenance": {**_provenance(), "pluginLoaded": True},
        "rows": [],
    }
    try:
        for row in authoring_map["rows"]:
            try:
                _, subject, admission = _admit_subject(native_module, row)
            except BaseException as caught:
                outcome = {
                    "id": row["id"],
                    "route": output["route"],
                    "routeState": "admission-error",
                    "admission": None,
                    "authoring": row["authoring"]["python"],
                    "argumentsProtocolJson": row["authoring"][
                        "argumentsProtocolJson"
                    ],
                    "error": _error_record(caught),
                    "report": None,
                }
                outcome["comparison"] = _compare_outcome(row, outcome)
                output["rows"].append(outcome)
                continue
            arguments = [
                _restore_python_value(value)
                for value in row["authoring"]["argumentsProtocolJson"]
            ]
            report = None
            error = None
            route_state = "matcher"
            try:
                if row["matcher"]:
                    chain = expect_geo(subject, claim_id=row["claimId"])
                    if row["polarity"] == "negative":
                        chain = chain.not_
                    method = getattr(chain, _snake_case(row["capability"]))
                    report = method(*arguments)
                else:
                    route_state = "ancillary-evaluate-probe"
                    report = evaluate_geo(
                        subject,
                        row["capability"],
                        *arguments,
                        claim_id=row["claimId"],
                        polarity=row["polarity"],
                    )
            except BaseException as caught:
                error = _error_record(caught)
                if isinstance(caught, GeoSpecAssertionError):
                    report = caught.report
            if report is not None and report.result.get("status") != "passed":
                assert error is not None and error["isGeoSpecAssertionError"]
            outcome = {
                "id": row["id"],
                "route": output["route"],
                "routeState": route_state,
                "admission": admission,
                "authoring": row["authoring"]["python"],
                "argumentsProtocolJson": row["authoring"]["argumentsProtocolJson"],
                "error": error,
                "report": _report_record(report) if report is not None else None,
            }
            if not row["matcher"]:
                outcome["publicSurfaceGap"] = (
                    "geospec.evaluate_geo is exported, but its current implementation derives "
                    "matcher kind names and cannot route ancillary capabilities."
                )
            outcome["comparison"] = _compare_outcome(row, outcome)
            output["rows"].append(outcome)
        assert len(output["rows"]) == 312
    finally:
        _write_json(_required_environment("GEOSPEC_PYTHON_OUTPUT"), output)


if __name__ == "__main__":
    qualification = _provenance()
    qualification["pluginImportable"] = bool(
        qualification["pytestPluginEntryPoints"]
    )
    _write_json(
        _required_environment("GEOSPEC_PYTHON_QUALIFICATION"), qualification
    )
