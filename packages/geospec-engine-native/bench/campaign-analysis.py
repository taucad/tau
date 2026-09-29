"""Q7 schema-v2 analysis only: no worker launch, native import, or thresholds fitted to data.

The retained S9/lib.ts estimator is exp(mean(log(B/A))) with floor-rank
percentiles. NumPy supplies PCG64; schema-v1 xorshift controls are not reused.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
import sys

import numpy as np


GATES = ("selectedParity", "targetMatrix", "modeMatrix", "batchThroughput", "processTreeRss", "deliverySizes", "boundaryCopies", "workReuse")
LATENCIES = ("firstActionableReportNs", "suiteReportNs")
STEADY = ("warm-engine-cold-subject", "resident-warm", "incremental-edit")


def hashed(artifact):
    data = Path(artifact["path"]).read_bytes()
    if hashlib.sha256(data).hexdigest() != artifact["sha256"]:
        raise ValueError(f"Frozen artifact differs: {artifact['path']}")
    return data


def journal_rows(artifact):
    """Verify and stream a possibly large complete-report journal, never bulk load it."""
    path = Path(artifact["path"])
    with path.open("rb") as source:
        if hashlib.file_digest(source, "sha256").hexdigest() != artifact["sha256"]:
            raise ValueError("Frozen observation journal differs.")
    with path.open() as source:
        for line in source:
            yield json.loads(line)


def floor_quantile(values, probability):
    ordered = np.sort(values)
    return float(ordered[min(len(ordered) - 1, math.floor(probability * len(ordered)))])


def bootstrap(pairs, *, seed, stream, resamples, tail):
    """Bounded-memory whole-pair resampling; no unpaired arm resampling."""
    values = np.asarray(pairs, dtype=np.float64)
    if values.ndim != 2 or values.shape[1] != 2 or len(values) == 0 or not np.all(np.isfinite(values)) or np.any(values <= 0):
        raise ValueError("Paired metrics must be finite positive numbers.")
    logs = np.log(values[:, 1] / values[:, 0])
    random = np.random.Generator(np.random.PCG64(np.random.SeedSequence(seed, spawn_key=(stream,))))
    boot = np.empty(resamples)
    for start in range(0, resamples, 4096):
        size = min(4096, resamples - start)
        indices = random.integers(0, len(logs), size=(size, len(logs)))
        boot[start:start + size] = np.exp(logs[indices].mean(axis=1))
    return {"ratio": float(np.exp(logs.mean())), "interval": [floor_quantile(boot, tail), floor_quantile(boot, 1 - tail)]}


def simultaneous(pairs, seeds, family_size, stream):
    if len(pairs) != 120 or len(seeds) != 4 or len(set(seeds)) != 4 or family_size < 1:
        raise ValueError("Q7 requires exactly 120 pairs, four distinct seeds and a complete family.")
    tail = 0.01 / family_size / 2
    resamples = max(1_000_000, math.ceil(100 / tail))
    estimates = [bootstrap(pairs, seed=seed, stream=stream, resamples=resamples, tail=tail) for seed in seeds]
    bounds = np.array([estimate["interval"] for estimate in estimates])
    variation = np.ptp(bounds, axis=0)
    return {"ratio": estimates[0]["ratio"], "interval": [float(bounds[:, 0].min()), float(bounds[:, 1].max())], "seedEstimates": estimates, "endpointRanges": variation.tolist(), "stable": bool(np.all(variation <= 0.002)), "resamplesPerSeed": resamples, "tailAlpha": tail, "stream": stream}


def blocking_product_ratio(item, metric):
    return not (item["axis"] == "reference-vs-native" and (metric == "processTreePeakRssBytes" or (item["class"] == "microcase" and metric in LATENCIES)))


def absolute_budget(pairs, backends, budget):
    """Q7 successor bars; immutable reference overages remain diagnostics."""
    exceeded = [max(pair[index] for pair in pairs) > budget for index in (0, 1)]
    return {
        "baseline": exceeded[0], "candidate": exceeded[1],
        "successorExceeded": any(over and backend in ("native", "mixed") for over, backend in zip(exceeded, backends)),
    }


def observed_logical(work):
    """Only exact engine observations establish a comparable logical profile.

    Physical deltas may differ across cold/warm execution. Aggregate counters
    do not replace the independent successor copy/reuse gates.
    """
    observed = (work or {}).get("observations")
    if not isinstance(observed, dict) or observed.get("schema") != "geospec-engine-observations-v1" or observed.get("exact") is not True:
        return None
    if not all(isinstance(observed.get(key), str) and observed[key] for key in ("numericProfile", "scope")):
        return None
    required = {"logical": {"chargedUnits", "claims", "evaluations"}, "physical": {"admissions", "parses", "overlapBuilds"}, "copies": {"inputCopies", "inputBytes", "outputCopies", "outputBytes"}}
    for category, keys in required.items():
        counters = observed.get(category)
        if not isinstance(counters, dict) or not keys.issubset(counters) or not all(isinstance(value, str) and value.isascii() and value.isdecimal() for value in counters.values()):
            return None
    if work.get("engineReportedConsumedWorkUnits") != observed["logical"]["chargedUnits"]:
        return None
    return (observed["numericProfile"], observed["scope"], observed["logical"])


def classify(estimate, *, kind, metric, axis, workload_class):
    if not estimate["stable"]:
        return "inconclusive"
    low, high = estimate["interval"]
    if kind == "aa":
        return "pass" if 0.95 <= low <= 1 <= high <= 1.05 else "inconclusive"
    if kind == "plant":
        return "pass" if low > 1.05 else "inconclusive"
    if metric == "throughputPerSecond":
        return "pass" if low >= (1.15 if axis == "reference-vs-native" else 0.95) else "fail"
    if metric == "processTreePeakRssBytes":
        return "descriptive" if axis == "reference-vs-native" else ("pass" if high <= 1.10 else "fail")
    if axis == "reference-vs-native" and workload_class == "microcase":
        return "descriptive"
    threshold = 1.05 if axis == "native-base-vs-candidate" else 0.80 if workload_class == "ordinary" else 0.85
    return "pass" if high <= threshold else "fail"


def describe(values):
    return {"median": float(np.median(values)), "p95DescriptiveOnly": floor_quantile(values, 0.95), "worst": max(values)}


def validate_reports(actual, expected, backend):
    if backend not in ("legacy", "native", "mixed") or actual != expected or not isinstance(actual, list) or not actual:
        return False
    for report in actual:
        if not isinstance(report, dict) or not isinstance(report.get("status"), str):
            return False
        if backend == "legacy":
            continue
        if not isinstance(report.get("claimId"), str) or not isinstance(report.get("result"), dict) or not isinstance(report.get("resultStatus"), str) or not isinstance(report["result"].get("status"), str) or report.get("resultStatus") != report["result"].get("status"):
            return False
        for key in ("canonicalClaim", "canonicalPlan", "canonicalResult"):
            record = report.get(key)
            if not isinstance(record, dict) or not isinstance(record.get("utf8"), str):
                return False
            data = record["utf8"].encode()
            if record.get("byteLength") != len(data) or record.get("sha256") != hashlib.sha256(data).hexdigest():
                return False
    return True


def first_report_matches(first, expected, backend):
    if not isinstance(first, dict) or first.get("cleanupStarted") is not False or not isinstance(first.get("report"), dict) or not validate_reports(expected, expected, backend):
        return False
    return (first["report"].get("result") if backend == "legacy" else first["report"]) == expected[0]


def admit_product_decisions(hypotheses, cases):
    """Retain estimates but gate case inference on both routes' full calibration."""
    for case_id in {row["caseId"] for row in hypotheses}:
        rows = [row for row in hypotheses if row["caseId"] == case_id]
        controls = [row for row in rows if row["kind"] != "product"]
        case = next(item for item in cases if item["id"] == case_id)
        required = {(phase, kind, metric) for phase in ("aa-baseline", "aa-candidate") for metric in case["metrics"] for kind in (["aa", "plant"] if metric in LATENCIES else ["aa"])}
        actual = {(row["phase"], row["kind"], row["metric"]) for row in controls}
        admitted = actual == required and all(row["decision"] == "pass" for row in controls)
        for row in rows:
            if row["kind"] == "product":
                row["calibrationAdmitted"] = admitted
                row["uncalibratedDecision"] = row["decision"]
                if not admitted and not row["absoluteBudgetExceeded"]:
                    row["decision"] = "inconclusive"


def cache_replay_matches(prefill, replay):
    if not isinstance(prefill, dict) or not isinstance(replay, dict):
        return False
    producer = prefill.get("producer") or {}
    if producer.get("verified") is not True or producer != replay.get("producer"):
        return False
    left, right = prefill.get("flush") or {}, replay.get("flush") or {}
    if not all(type(right.get(key)) in (int, float) and math.isfinite(right[key]) for key in ("reads", "hits", "misses", "writes")):
        return False
    return (
        left.get("sealed") is True and right.get("sealed") is True and left.get("writes", 0) > 0
        and right["reads"] > 0 and right["hits"] == right["reads"] and right["misses"] == 0 and right["writes"] == 0
        and all(value.get(key) == 0 for value in (left, right) for key in ("authenticationFailures", "ioFailures", "rejectedWrites"))
    )


def measurement_contracts(observation, item, manifest, expected, route):
    """Check retained measurement attribution; never infer throughput from latency alone."""
    workloads = {value["id"]: value for value in manifest.get("workloads", [])}
    workload = workloads.get(item.get("workload"), {})
    backend = manifest.get("routes", {}).get(route, {}).get("backend")
    members = workload.get("members")
    if members:
        actual_members = observation.get("members", [])
        instances = (observation.get("result") or {}).get("instances")
        if instances != members or len(actual_members) != len(members) or observation.get("completedSubjects") != len(members):
            return False
        combined = []
        for actual, member in zip(actual_members, members):
            reports = actual.get("suiteReports")
            if actual.get("workload") != member["workload"] or actual.get("successful") is not True or not validate_reports(reports, reports, backend) or not first_report_matches(actual.get("firstReport"), reports, backend):
                return False
            combined.extend(reports)
        if combined != observation.get("suiteReports") or observation.get("completedClaims") != len(combined):
            return False
        if workload["kind"] == "selected-suite":
            leaves = sorted(value["id"] for value in workloads.values() if value["kind"] not in ("selected-suite", "independent-subject-batch"))
            if sorted(member["workload"] for member in members) != leaves:
                return False
    if "throughputPerSecond" in item["metrics"]:
        if workload.get("kind") != "independent-subject-batch" or not members or observation.get("throughputPerSecond") != len(members) * 1_000_000_000 / observation["suiteReportNs"]:
            return False
    if "processTreePeakRssBytes" in item["metrics"]:
        rss = observation.get("processTreeRss") or {}
        samples = rss.get("samples", [])
        if rss.get("complete") is not True or not samples or rss.get("errors") or rss.get("remainingDescendants") or not any(len(sample["processes"]) > 1 for sample in samples):
            return False
        if any(sample["rssBytes"] != sum(process["rssBytes"] for process in sample["processes"]) for sample in samples):
            return False
        if observation.get("processTreePeakRssBytes") != max(sample["rssBytes"] for sample in samples) or rss.get("peakBytes") != observation.get("processTreePeakRssBytes"):
            return False
    if item["mode"] in ("warm-engine-cold-subject", "resident-warm", "incremental-edit"):
        ready = observation.get("stateReady") or {}
        if ready.get("mode") != item["mode"] or not isinstance(observation.get("startupReadyNs"), (int, float)):
            return False
        if item["mode"] != "warm-engine-cold-subject":
            artifact = item.get("prefillExpected", {}).get(route)
            prior_expected = json.loads(hashed(artifact)) if artifact else expected
            if ready.get("retainedSubject") is not True or not validate_reports(ready.get("prefillReports"), prior_expected, backend):
                return False
    if item["mode"] == "persisted-warm":
        prefill = observation.get("persistedPreparation") or {}
        if backend != "native" or manifest.get("routes", {}).get(route, {}).get("cacheContract") != "native-authenticated-overlap-a3" or prefill.get("successful") is not True or not validate_reports(prefill.get("suiteReports"), expected, backend) or not first_report_matches(prefill.get("firstReport"), expected, backend) or not cache_replay_matches((prefill.get("result") or {}).get("cache"), (observation.get("result") or {}).get("cache")):
            return False
    if item["mode"] == "source-to-reward":
        source = (observation.get("result") or {}).get("sourceReward") or {}
        if source.get("cacheState") != "fresh-runtime-memory" or source.get("rawHeadersPreserved") is not True or source.get("lifetimes") != 2:
            return False
        if not source.get("artifact") or not hashed(source["artifact"]):
            return False
    return True

def expected_schedule(cases):
    blocks = []
    for item in cases:
        warmups = 5 if item["mode"] in STEADY else 0
        for phase in ("aa-baseline", "aa-candidate", "product"):
            for pair in range(-warmups, 120):
                blocks.append({"caseId": item["id"], "phase": phase, "pair": pair, "measured": pair >= 0,
                    "order": ["A", "B"] if pair % 2 == 0 else ["B", "A"],
                    "routes": {"A": item["candidate"] if phase == "aa-candidate" else item["baseline"], "B": item["baseline"] if phase == "aa-baseline" else item["candidate"]},
                    "plants": [] if phase == "product" else [metric for metric in item["metrics"] if metric in LATENCIES]})
    return blocks


def analyze(receipt):
    manifest = json.loads(hashed(receipt["manifest"]))
    rows = journal_rows(receipt["observations"])
    campaign = manifest["campaign"]
    result = {"schemaVersion": 2, "campaignId": campaign["id"], "decision": "inconclusive", "method": "whole-pair-log-ratio-percentile", "generator": "numpy.random.PCG64", "numpy": np.__version__, "seeds": campaign["seeds"], "hypotheses": [], "missing": list(manifest["gaps"]), "resourceGates": manifest["gates"]}
    if campaign.get("ready") is not True or campaign.get("frozenProducts") is not True:
        result["missing"].append("campaign was not explicitly ready with frozen products")
    runtime = campaign.get("analysis")
    if not runtime:
        result["missing"].append("pinned analysis runtime absent")
    elif runtime["numpyVersion"] != np.__version__ or Path(runtime["python"]["path"]).resolve() != Path(sys.executable).resolve():
        result["missing"].append("analysis Python/NumPy runtime differs from freeze")
    else:
        hashed(runtime["python"])
    cases = {item["id"]: item for item in campaign["cases"]}
    product_count = sum(sum(blocking_product_ratio(item, metric) for metric in item["metrics"]) for item in cases.values())
    control_count = sum(2 * (len(item["metrics"]) + sum(metric in LATENCIES for metric in item["metrics"])) for item in cases.values())
    family_size = product_count + control_count
    result["familySize"] = family_size
    if manifest["statistics"]["familySize"] != family_size:
        raise ValueError("Hypothesis family does not match the frozen manifest.")
    schedule = manifest["schedule"]
    if schedule != expected_schedule(campaign["cases"]):
        result["missing"].append("schedule is not the complete fixed 120-pair/five-steady-warmup design")
    expected_count = sum(2 + len(block["plants"]) for block in schedule)
    if receipt["state"] != "measured-awaiting-analysis" or receipt["count"] != expected_count:
        result["missing"].append("fixed campaign incomplete; no partial or extended-data decision")
    expected = {(item["id"], name): json.loads(hashed(artifact)) for item in cases.values() for name, artifact in item["expected"].items()}
    grouped = {}
    sequence = 0
    work_by_route = {}
    for block in schedule:
        item = cases[block["caseId"]]
        for arm, metric in [(arm, None) for arm in block["order"]] + [("B", metric) for metric in block["plants"]]:
            row = next(rows, None)
            if row is None:
                break
            route = block["routes"]["A" if metric else arm]
            if row["sequence"] != sequence or row["block"] != block or row["arm"] != arm or row["route"] != route or (row.get("plant") or {}).get("metric") != metric:
                raise ValueError("Observation order differs from predeclared schedule.")
            observation = row["observation"]
            qualification = observation["qualification"]
            backend = manifest.get("routes", {}).get(route, {}).get("backend")
            valid = row["valid"] is True and observation["successful"] is True and qualification.get("evaluationCompleted") is True and qualification.get("expectedMatches") is not False and qualification.get("overlapVerified") is True and validate_reports(observation["suiteReports"], expected[(item["id"], route)], backend) and first_report_matches(observation.get("firstReport"), expected[(item["id"], route)], backend)
            valid = valid and measurement_contracts(observation, item, manifest, expected[(item["id"], route)], route)
            work = (observation.get("result") or {}).get("workCounters")
            # Immutable legacy internals remain unavailable, never invented or
            # required as a condition of its otherwise valid wall/RSS comparison.
            if backend in ("native", "mixed"):
                logical = observed_logical(work)
                if logical is None:
                    missing_work = f"mandatory measured successor work counters absent: {item['id']}/{route}"
                    if missing_work not in result["missing"]:
                        result["missing"].append(missing_work)
                else:
                    profile, scope, counters = logical
                    work_key = (item["id"], route, profile, scope)
                    if work_key in work_by_route and work_by_route[work_key] != counters:
                        result["missing"].append(f"same-profile logical work counters varied at observation {sequence}")
                    work_by_route[work_key] = counters
            if not valid:
                result["missing"].append(f"complete profile validation failed at observation {sequence}")
            group = grouped.setdefault((item["id"], block["phase"], block["pair"]), {})
            # The complete bytes were checked above and remain in the raw
            # journal. Keep only metrics needed for paired resampling in RAM.
            group[metric or arm] = {"observation": {key: observation.get(key) for key in (*LATENCIES, "throughputPerSecond", "processTreePeakRssBytes")}}
            if metric:
                primary = group["A"]["observation"][metric]
                requested = max(8_000_000, 0.25 * primary)
                if row["plant"]["durationNs"] != requested or observation.get("reportPlants", {}).get(metric, 0) < requested:
                    result["missing"].append(f"public plant missing or not derived from paired A at {sequence}")
            elif any(observation.get("reportPlants", {}).values()):
                result["missing"].append(f"unplanted arm carries a delay at {sequence}")
            sequence += 1
    if sequence != expected_count or next(rows, None) is not None:
        result["missing"].append("observation count differs from the complete predeclared schedule")
    for gate in GATES:
        value = manifest["gates"].get(gate)
        if value and json.loads(hashed(value["artifact"])) != value["value"]:
            raise ValueError("Saved independent receipt differs from frozen gate artifact.")
        if not value or not value.get("bound") or value["value"].get("decision") != "pass":
            result["missing"].append(f"mandatory independent gate: {gate}")
    # Missing resource gates do not erase available statistical outcomes. Invalid
    # samples or incomplete schedules, however, must never enter the bootstrap.
    invalid_samples = any(not item.startswith("mandatory ") for item in result["missing"])
    if invalid_samples:
        return result
    stream = 0
    for item in cases.values():
        for phase in ("aa-baseline", "aa-candidate", "product"):
            for metric in item["metrics"]:
                kinds = ["product" if phase == "product" else "aa"] + (["plant"] if phase != "product" and metric in LATENCIES else [])
                for kind in kinds:
                    pairs = []
                    for index in range(120):
                        group = grouped[(item["id"], phase, index)]
                        left = group["A"]["observation"].get(metric)
                        right = group[metric if kind == "plant" else "B"]["observation"].get(metric)
                        if not isinstance(left, (int, float)) or not isinstance(right, (int, float)) or not math.isfinite(left) or not math.isfinite(right) or min(left, right) <= 0:
                            result["missing"].append(f"{item['id']}/{phase}/{metric}: missing actual metric")
                            break
                        pairs.append((left, right))
                    if len(pairs) != 120:
                        continue
                    estimate = simultaneous(pairs, campaign["seeds"], family_size, stream)
                    stream += 1
                    decision = classify(estimate, kind=kind, metric=metric, axis=item["axis"], workload_class=item["class"])
                    budget = item.get("sampleBudgetNs") if item["class"] == "microcase" else {"ordinary": 2_000_000_000, "scale": 5_000_000_000, "suite": 300_000_000_000}[item["class"]]
                    routes = (item["candidate"] if phase == "aa-candidate" else item["baseline"], item["baseline"] if phase == "aa-baseline" else item["candidate"])
                    backends = [manifest.get("routes", {}).get(route, {}).get("backend") for route in routes]
                    absolute = absolute_budget(pairs, backends, budget if metric in LATENCIES else 805_306_368) if kind != "plant" and (metric in LATENCIES or metric == "processTreePeakRssBytes") else None
                    absolute_failed = absolute is not None and absolute["successorExceeded"]
                    if absolute_failed:
                        decision = "fail"
                    result["hypotheses"].append({"caseId": item["id"], "axis": item["axis"], "phase": phase, "kind": kind, "metric": metric, "blockingRatio": kind != "product" or blocking_product_ratio(item, metric), **estimate, "decision": decision, "absoluteBudgetExceeded": absolute_failed, "absoluteBudgetDiagnostics": absolute, "baseline": describe([pair[0] for pair in pairs]), "candidate": describe([pair[1] for pair in pairs])})
    hypotheses = result["hypotheses"]
    admit_product_decisions(hypotheses, list(cases.values()))
    if any(item["decision"] == "fail" for item in hypotheses):
        result["decision"] = "fail"
    elif not result["missing"] and sum(item["blockingRatio"] for item in hypotheses) == family_size and all(item["decision"] in ("pass", "descriptive") for item in hypotheses):
        result["decision"] = "pass"
    return result


if __name__ == "__main__":
    receipt_path, output = map(Path, sys.argv[1:])
    # Exclusive output creation before expensive analysis prohibits overwriting evidence.
    with output.open("x") as target:
        result = analyze(json.loads(receipt_path.read_text()))
        json.dump(result, target, indent=2, allow_nan=False)
        target.write("\n")
    print(json.dumps({"output": str(output), "decision": result["decision"], "hypotheses": len(result["hypotheses"]), "missing": result["missing"]}))
    sys.exit(0 if result["decision"] == "pass" else 1)
