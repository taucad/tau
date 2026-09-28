"""Host-only synthetic statistics/report checks. Never loads a geometry product."""
import importlib.util
import json
import math
import shutil
import subprocess
import sys
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np

spec = importlib.util.spec_from_file_location("campaign_analysis", Path(__file__).with_name("campaign-analysis.py"))
analysis = importlib.util.module_from_spec(spec)
spec.loader.exec_module(analysis)


class CampaignAnalysisTests(unittest.TestCase):
    def test_absolute_bars_follow_successor_routes_without_erasing_reference(self):
        pairs = [(3_000_000_000, 1_000_000_000)] * 120
        value = analysis.absolute_budget(pairs, ["legacy", "native"], 2_000_000_000)
        self.assertEqual(value, {"baseline": True, "candidate": False, "successorExceeded": False})
        self.assertTrue(analysis.absolute_budget(pairs, ["native", "native"], 2_000_000_000)["successorExceeded"])
        self.assertTrue(analysis.absolute_budget([(1, 805_306_369)], ["legacy", "mixed"], 805_306_368)["successorExceeded"])
        self.assertFalse(analysis.absolute_budget([(3_000_000_000, 3_000_000_000)], ["legacy", "legacy"], 2_000_000_000)["successorExceeded"])
        self.assertTrue(analysis.absolute_budget([(3_000_000_000, 3_000_000_000)], ["native", "native"], 2_000_000_000)["successorExceeded"])

    def test_observed_logical_comparison_excludes_physical_warmth(self):
        observed = {"schema": "geospec-engine-observations-v1", "numericProfile": "geospec-st-logical-requests-v3", "scope": "engine-methods", "exact": True,
                    "logical": {"chargedUnits": "9007199254740993", "claims": "1", "evaluations": "1"},
                    "physical": {"admissions": "1", "parses": "1", "overlapBuilds": "1"},
                    "copies": {"inputCopies": "1", "inputBytes": "64", "outputCopies": "1", "outputBytes": "256"}}
        cold = {"engineReportedConsumedWorkUnits": "9007199254740993", "observations": observed}
        warm = json.loads(json.dumps(cold))
        warm["observations"]["physical"]["overlapBuilds"] = "0"
        warm["observations"]["copies"]["inputBytes"] = "0"
        self.assertEqual(analysis.observed_logical(cold), analysis.observed_logical(warm))
        self.assertIsNone(analysis.observed_logical({"engineReportedConsumedWorkUnits": None}))

    def test_pairs_stay_together_with_large_shared_drift(self):
        pairs = [(10 ** (index % 9), 1.25 * 10 ** (index % 9)) for index in range(120)]
        value = analysis.bootstrap(pairs, seed=17, stream=0, resamples=8192, tail=0.005)
        self.assertAlmostEqual(value["ratio"], 1.25)
        self.assertTrue(all(abs(bound - 1.25) < 1e-12 for bound in value["interval"]))

    def test_floor_percentiles_match_retained_s9_helper(self):
        self.assertEqual(analysis.floor_quantile([4, 3, 2, 1], 0.5), 3)
        self.assertEqual(analysis.floor_quantile([4, 3, 2, 1], 1), 4)

    def test_pcg64_whole_pair_result_matches_scalar_log_bootstrap(self):
        pairs = [(10, 11), (20, 18), (30, 33), (100, 80)]
        seed, stream, count, tail = 29, 3, 1024, 0.01
        value = analysis.bootstrap(pairs, seed=seed, stream=stream, resamples=count, tail=tail)
        random = np.random.Generator(np.random.PCG64(np.random.SeedSequence(seed, spawn_key=(stream,))))
        logs = [math.log(right / left) for left, right in pairs]
        samples = []
        for _ in range(count):
            indices = random.integers(0, len(pairs), size=len(pairs))
            samples.append(math.exp(sum(logs[index] for index in indices) / len(pairs)))
        samples.sort()
        np.testing.assert_allclose(value["interval"], [samples[math.floor(tail * count)], samples[math.floor((1 - tail) * count)]], rtol=0, atol=1e-15)

    def test_numpy_estimator_matches_existing_typescript_analysis_helper(self):
        pairs = [(10, 11), (20, 18), (30, 33), (100, 80)]
        random = np.random.Generator(np.random.PCG64(np.random.SeedSequence(29, spawn_key=(3,))))
        indices = random.integers(0, len(pairs), size=(1024, len(pairs))).flatten().tolist()
        module = Path(__file__).with_name("lib.ts").resolve().as_uri()
        script = "import {pairedInterval} from " + json.dumps(module) + ";let text='';for await(const chunk of process.stdin)text+=chunk;const input=JSON.parse(text);let i=0;console.log(JSON.stringify(pairedInterval({pairs:input.pairs,resamples:1024,alpha:0.02,random:()=>input.indices[i++]/4})));"
        completed = subprocess.run([shutil.which("node"), "--input-type=module", "-e", script], input=json.dumps({"pairs": [{"baseline": left, "candidate": right} for left, right in pairs], "indices": indices}), text=True, capture_output=True, check=True)
        retained = json.loads(completed.stdout)
        current = analysis.bootstrap(pairs, seed=29, stream=3, resamples=1024, tail=0.01)
        np.testing.assert_allclose(current["interval"], retained["interval"], rtol=0, atol=1e-15)
        self.assertAlmostEqual(current["ratio"], retained["ratio"], places=15)

    def test_simultaneous_profile_fixes_budget_seeds_and_endpoint_stability(self):
        # Substitute only the expensive numerical kernel here to observe its
        # exact production arguments. The real PCG64 kernel is tested above.
        with patch.object(analysis, "bootstrap", side_effect=[{"ratio": 1, "interval": [0.999, 1.001]}, {"ratio": 1, "interval": [0.9991, 1.0011]}, {"ratio": 1, "interval": [0.9992, 1.0012]}, {"ratio": 1, "interval": [0.9993, 1.0013]}]) as kernel:
            result = analysis.simultaneous([(100, 100)] * 120, [101, 202, 303, 404], 100, 7)
        self.assertEqual(kernel.call_count, 4)
        self.assertEqual([call.kwargs["seed"] for call in kernel.call_args_list], [101, 202, 303, 404])
        self.assertEqual(result["resamplesPerSeed"], 2_000_000)
        self.assertEqual(result["tailAlpha"], 0.00005)
        self.assertTrue(result["stable"])
        self.assertEqual(result["interval"], [0.999, 1.0013])
        with patch.object(analysis, "bootstrap", side_effect=[{"ratio": 1, "interval": [0.999, 1.001]}] * 3 + [{"ratio": 1, "interval": [1.003, 1.005]}]):
            unstable = analysis.simultaneous([(100, 100)] * 120, [101, 202, 303, 404], 1, 0)
        self.assertFalse(unstable["stable"])
        self.assertEqual(analysis.classify(unstable, kind="aa", metric="suiteReportNs", axis="native-base-vs-candidate", workload_class="suite"), "inconclusive")

    def test_controls_and_conjunctive_directions_are_distinct(self):
        classify = lambda bounds, kind, metric, axis="native-base-vs-candidate", cls="ordinary": analysis.classify({"stable": True, "interval": bounds}, kind=kind, metric=metric, axis=axis, workload_class=cls)
        self.assertEqual(classify([0.999, 1.001], "aa", "firstActionableReportNs"), "pass")
        self.assertEqual(classify([1.01, 1.02], "aa", "firstActionableReportNs"), "inconclusive")
        self.assertEqual(classify([1.24, 1.26], "plant", "suiteReportNs"), "pass")
        self.assertEqual(classify([0.79, 0.80], "product", "firstActionableReportNs", "reference-vs-native"), "pass")
        self.assertEqual(classify([0.80, 0.81], "product", "firstActionableReportNs", "reference-vs-native"), "fail")
        self.assertEqual(classify([1.15, 1.20], "product", "throughputPerSecond", "reference-vs-native"), "pass")
        self.assertEqual(classify([0.94, 1], "product", "throughputPerSecond"), "fail")
        self.assertEqual(classify([1, 1.10], "product", "processTreePeakRssBytes"), "pass")
        self.assertEqual(classify([1, 1.11], "product", "processTreePeakRssBytes"), "fail")

    def test_complete_expected_failed_report_remains_valid(self):
        reports = [{"status": "failed", "result": {"status": "failed", "actual": 0.49999999999999994}}]
        self.assertTrue(analysis.validate_reports(reports, json.loads(json.dumps(reports)), "legacy"))
        self.assertFalse(analysis.validate_reports(reports, [{"status": "passed"}], "legacy"))

    def test_complete_synthetic_journal_preserves_failed_verdicts_and_separate_gates(self):
        with tempfile.TemporaryDirectory(prefix="geospec-host-parser-") as directory:
            root = Path(directory)
            def artifact(name, value):
                path = root / name
                path.write_text(value)
                return {"path": str(path), "sha256": analysis.hashlib.sha256(path.read_bytes()).hexdigest()}
            canonical = {"utf8": '{"status":"failed"}', "byteLength": 19, "sha256": analysis.hashlib.sha256(b'{"status":"failed"}').hexdigest()}
            reports = [{"claimId": "strict", "status": "failed", "resultStatus": "failed", "result": {"status": "failed", "value": 0.49999999999999994}, **{key: canonical for key in ("canonicalClaim", "canonicalPlan", "canonicalResult")}}]
            expected = artifact("expected.json", json.dumps(reports))
            item = {"id": "synthetic-box", "workload": "synthetic-box", "mode": "cold-process", "baseline": "a", "candidate": "b", "axis": "native-base-vs-candidate", "class": "ordinary", "metrics": ["firstActionableReportNs"], "expected": {"a": expected, "b": expected}}
            schedule = analysis.expected_schedule([item])
            rows = []
            for block in schedule:
                for arm, metric in [(arm, None) for arm in block["order"]] + [("B", metric) for metric in block["plants"]]:
                    route = block["routes"]["A" if metric else arm]
                    duration = 100_000_000 if route == "a" else 90_000_000
                    planted = max(8_000_000, 0.25 * duration) if metric else 0
                    observation = {"firstReport": {"report": reports[0], "cleanupStarted": False}, "successful": True, "firstActionableReportNs": duration + planted, "suiteReportNs": duration + planted + 1, "suiteReports": reports, "qualification": {"evaluationCompleted": True, "expectedMatches": True, "overlapVerified": True}, "reportPlants": {"firstActionableReportNs": planted, "suiteReportNs": 0}, "result": {"workCounters": {"engineReportedConsumedWorkUnits": "1", "observations": {"schema": "geospec-engine-observations-v1", "numericProfile": "geospec-st-logical-requests-v3", "exact": True, "scope": "engine-methods", "logical": {"chargedUnits": "1", "claims": "1", "evaluations": "1"}, "physical": {"admissions": "1", "parses": "1", "overlapBuilds": "0"}, "copies": {"inputCopies": "1", "inputBytes": "64", "outputCopies": "1", "outputBytes": "128"}, "unavailable": []}}}}
                    rows.append({"sequence": len(rows), "block": block, "arm": arm, "route": route, "plant": {"metric": metric, "durationNs": planted} if metric else None, "valid": True, "observation": observation})
            runtime = {"python": {"path": sys.executable, "sha256": analysis.hashlib.sha256(Path(sys.executable).read_bytes()).hexdigest()}, "numpyVersion": np.__version__}
            manifest = {"routes": {"a": {"backend": "native"}, "b": {"backend": "native"}}, "campaign": {"id": "synthetic-only-not-a-product-campaign", "ready": True, "frozenProducts": True, "analysis": runtime, "seeds": [1, 2, 3, 4], "cases": [item]}, "statistics": {"familySize": 5}, "schedule": schedule, "gaps": [], "gates": {}}
            receipt = {"manifest": artifact("manifest.json", json.dumps(manifest)), "observations": artifact("observations.jsonl", "\n".join(map(json.dumps, rows))), "state": "measured-awaiting-analysis", "count": len(rows)}
            def exact_constant_interval(pairs, seeds, family_size, stream):
                self.assertEqual(len(pairs), 120)
                self.assertEqual(seeds, [1, 2, 3, 4])
                self.assertEqual(family_size, 5)
                ratios = [right / left for left, right in pairs]
                self.assertTrue(all(ratio == ratios[0] for ratio in ratios))
                return {"stable": True, "ratio": ratios[0], "interval": [ratios[0], ratios[0]]}
            # Closed-form bounds for constant ratios isolate streaming/joining
            # from the separately exercised real NumPy resampling kernel.
            with patch.object(analysis, "simultaneous", side_effect=exact_constant_interval) as estimates:
                result = analysis.analyze(receipt)
            self.assertEqual(estimates.call_count, 5)
            self.assertEqual(len(result["hypotheses"]), 5)
            self.assertTrue(all(row["decision"] == "pass" for row in result["hypotheses"]))
            self.assertEqual(result["decision"], "inconclusive")
            self.assertEqual(len(result["missing"]), 8)

            # The same complete calibration with an immutable reference needs
            # no invented internals and does not impose successor bars on it.
            item["axis"] = "reference-vs-native"
            manifest["routes"]["a"]["backend"] = "legacy"
            for row in rows:
                observed = row["observation"]
                duration = 3_000_000_000 if row["route"] == "a" else 1_000_000_000
                planted = max(8_000_000, 0.25 * duration) if row["plant"] else 0
                observed["firstActionableReportNs"] = duration + planted
                observed["suiteReportNs"] = duration + planted + 1
                observed["reportPlants"]["firstActionableReportNs"] = planted
                if row["plant"]:
                    row["plant"]["durationNs"] = planted
                if row["route"] == "a":
                    observed["firstReport"]["report"] = {"result": reports[0]}
                    observed["result"]["workCounters"] = {"engineReportedConsumedWorkUnits": None, "observations": None, "unavailable": ["immutable-legacy-engine-internals"]}
            receipt["manifest"] = artifact("reference-manifest.json", json.dumps(manifest))
            receipt["observations"] = artifact("reference-observations.jsonl", "\n".join(map(json.dumps, rows)))
            with patch.object(analysis, "simultaneous", side_effect=exact_constant_interval):
                result = analysis.analyze(receipt)
            self.assertEqual(len(result["missing"]), 8)
            self.assertTrue(all(row["decision"] == "pass" for row in result["hypotheses"]))
            product = next(row for row in result["hypotheses"] if row["kind"] == "product")
            self.assertTrue(product["absoluteBudgetDiagnostics"]["baseline"])
            self.assertFalse(product["absoluteBudgetExceeded"])
            self.assertTrue(product["calibrationAdmitted"])

    def test_calibration_gates_only_dependent_inference_and_preserves_absolute_failures(self):
        controls = [{"caseId": "box", "phase": phase, "kind": kind, "metric": "suiteReportNs", "decision": "pass", "absoluteBudgetExceeded": False} for phase in ("aa-baseline", "aa-candidate") for kind in ("aa", "plant")]
        controls[0]["decision"] = "inconclusive"
        product = {"caseId": "box", "kind": "product", "decision": "fail", "absoluteBudgetExceeded": False}
        absolute = {"caseId": "box", "kind": "product", "decision": "fail", "absoluteBudgetExceeded": True}
        analysis.admit_product_decisions([*controls, product, absolute], [{"id": "box", "metrics": ["suiteReportNs"]}])
        self.assertEqual(product["decision"], "inconclusive")
        self.assertEqual(product["uncalibratedDecision"], "fail")
        self.assertEqual(absolute["decision"], "fail")

    def test_current_a3_positive_publication_and_replay_receipts(self):
        producer = {"verified": True, "producerDigest": "host-mock-current-a3"}
        counters = {"sealed": True, "authenticationFailures": 0, "ioFailures": 0, "rejectedWrites": 0}
        seed = {"producer": producer, "flush": {**counters, "reads": 1, "misses": 1, "writes": 1, "hits": 0}}
        replay = {"producer": producer, "flush": {**counters, "reads": 1, "misses": 0, "writes": 0, "hits": 1}}
        self.assertTrue(analysis.cache_replay_matches(seed, replay))
        for replay_counters in (
            {"reads": 2, "hits": 1, "misses": 1, "writes": 1},
            {"reads": 1, "hits": 1, "misses": 0, "writes": 1},
            {"reads": 2, "hits": 1, "misses": 0, "writes": 0},
            {"reads": 0, "hits": 0, "misses": 0, "writes": 0},
        ):
            with self.subTest(replay_counters=replay_counters):
                self.assertFalse(analysis.cache_replay_matches(seed, {"producer": producer, "flush": {**counters, **replay_counters}}))

    def test_missing_measurements_are_inconclusive_without_bootstrap(self):
        with tempfile.TemporaryDirectory(prefix="geospec-host-statistics-") as directory:
            root = Path(directory)
            def artifact(name, value):
                path = root / name
                path.write_text(value)
                return {"path": str(path), "sha256": analysis.hashlib.sha256(path.read_bytes()).hexdigest()}
            manifest = {"campaign": {"id": "host-only", "seeds": [1, 2, 3, 4], "cases": [{"id": "box", "axis": "native-base-vs-candidate", "class": "ordinary", "mode": "cold-process", "baseline": "a", "candidate": "b", "metrics": ["firstActionableReportNs"], "expected": {}}]}, "statistics": {"familySize": 5}, "gaps": [], "schedule": [], "gates": {}}
            receipt = {"manifest": artifact("manifest.json", json.dumps(manifest)), "observations": artifact("observations.jsonl", ""), "state": "planned-not-measured", "count": 0}
            with patch.object(analysis, "bootstrap", side_effect=AssertionError("incomplete input must not bootstrap")):
                result = analysis.analyze(receipt)
            self.assertEqual(result["decision"], "inconclusive")
            self.assertEqual(len(result["hypotheses"]), 0)
            self.assertGreaterEqual(len(result["missing"]), 9)


if __name__ == "__main__":
    unittest.main()
