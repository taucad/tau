"""Actual installed Python assertions; complete reports precede ACK and cleanup."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import struct
import sys
import time

from geospec import GeoSpecAssertionError, GeoSpecEngine, expect_geo


def tetrahedron() -> bytes:
    positions = (0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1)
    indices = (0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3)
    return b"GSM1" + struct.pack("<II12d12I", 4, 4, *positions, *indices)


def byte_record(value: bytes) -> dict:
    return {"byteLength": len(value), "sha256": hashlib.sha256(value).hexdigest(), "utf8": value.decode()}


def record(report) -> dict:
    return {
        "claimId": report.result["claimId"], "status": report.result["status"],
        "resultStatus": report.result["status"],
        "canonicalClaim": byte_record(report.canonical_claim_bytes),
        "canonicalPlan": byte_record(report.canonical_plan_bytes),
        "canonicalResult": byte_record(report.canonical_result_bytes),
        "result": dict(report.result),
    }


def emit(event: str, **fields) -> None:
    metric = {"first-report": "firstActionableReportNs", "suite-report": "suiteReportNs"}.get(event)
    planted = 0
    if metric and os.environ.get("GEOSPEC_CAMPAIGN_PLANT_METRIC") == metric:
        duration = float(os.environ["GEOSPEC_CAMPAIGN_PLANT_NS"])
        if duration <= 0:
            raise ValueError("A positive predeclared public-report plant is required.")
        started = time.monotonic_ns()
        time.sleep(duration / 1_000_000_000)
        planted = time.monotonic_ns() - started
    print(json.dumps({"event": event, **fields, "plantedDelayNs": planted}), flush=True)


workload = sys.argv[3]
prepared = json.loads(Path(os.environ["GEOSPEC_PREPARED_WORKLOAD"]).read_text())
methods = {"toHaveBoundingBox": "to_have_bounding_box", "toHaveSurfaceArea": "to_have_surface_area", "toHaveVolume": "to_have_volume", "toBeValidBrep": "to_be_valid_brep"}
claims = prepared["claims"] if prepared else [{"claimId": "benchmark-common-tetrahedron-bounds", "capability": "toHaveBoundingBox", "payload": {"expected": {"min": {"x": 0, "y": 0, "z": 0}, "max": {"x": 1, "y": 1, "z": 1}, "tolerance": 0}}}]
state = json.loads(os.environ.get("GEOSPEC_CAMPAIGN_STATE", '{"mode":"cold-process"}'))

observation_start = None


def observation():
    operation = getattr(engine, "observations", None)
    return json.loads(operation()) if operation else None


def ready(**fields):
    global observation_start
    observation_start = observation()
    emit("state-ready", mode=state["mode"], **fields)
    if sys.stdin.buffer.read(1) != b"\n":
        raise RuntimeError("Parent did not acknowledge the prepared state.")

def evaluate(claim):
    if claim["capability"] == "analyzeMeshOverlap":
        return record(engine.query(subject, claim["capability"], claim["payload"], claim_id=claim["claimId"]))
    try:
        return record(getattr(expect_geo(subject, claim_id=claim["claimId"]), methods[claim["capability"]])(claim["payload"]["expected"]))
    except GeoSpecAssertionError as error:
        if error.report is None:
            raise
        return record(error.report)

cache_options = json.loads(os.environ["GEOSPEC_CAMPAIGN_CACHE"]) if "GEOSPEC_CAMPAIGN_CACHE" in os.environ else None
engine = GeoSpecEngine(work_unit_budget=8_000_000 if prepared else 10_000, **({"cache_root": cache_options["root"], "project_root": cache_options["projectRoot"]} if cache_options else {}))
subject = None
try:
    if state["mode"] == "warm-engine-cold-subject":
        ready(retainedSubject=False, initialization="installed Python engine constructed; lazy backend work remains timed")
    if prepared:
        source = prepared["subject"]
        resources = [(Path(row["path"]).name, Path(row["path"]).read_bytes()) for row in source["resources"]] if source["format"] == "gltf" else []
        subject = engine.ingest_subject(Path(source["primary"]["path"]).read_bytes(), format=source["format"], coordinate_system="z-up", source_unit="auto" if source["format"] == "step" else "mm", output_unit="mm", resources=resources, slot="subject")
    else:
        subject = engine.ingest_mesh(tetrahedron(), slot="subject")
    if state["mode"] in ("resident-warm", "incremental-edit"):
        prior = state.get("prior") if state["mode"] == "incremental-edit" else prepared
        if not prior or prior["subject"]["primary"]["sha256"] != prepared["subject"]["primary"]["sha256"] or prior["subject"]["resources"] != prepared["subject"]["resources"]:
            raise ValueError("Resident/claims-only prefill requires identical subject bytes.")
        ready(retainedSubject=True, prefillReports=[evaluate(claim) for claim in prior["claims"]], preparedClaims=prior["claims"])
    reports = []
    for claim in claims:
        reports.append(evaluate(claim))
        if len(reports) == 1:
            emit("first-report", workload=workload, boundary="installed-python-public-matcher-settled", report=reports[0], cleanupStarted=False)
    emit("suite-report", reports=reports, cleanupStarted=False)
    if sys.stdin.buffer.read(1) != b"\n":
        raise RuntimeError("Parent did not acknowledge the complete public suite.")
    observation_end = observation()
    subject.close()
    subject = None
    producer = json.loads(engine.cache_producer_identity) if cache_options else None
    engine.close()
    cache = {"producer": producer, "flush": json.loads(engine.cache_flush_result)} if cache_options else {}
    successful = len(reports) == len(claims) and all(row["status"] in ("passed", "failed") for row in reports)
    emit("complete", result={"workCounters": {"engineReportedConsumedWorkUnits": None, "observationStart": observation_start, "observationEnd": observation_end}, "cache": cache, "kind": "public-consumer-event", "workload": workload, "successful": successful, "routeState": "public-consumer-settled", "cleanup": {"status": "released", "close": "closed"}, "firstReportAcknowledgedBeforeCleanup": True})
finally:
    if subject is not None:
        subject.close()
    engine.close()
