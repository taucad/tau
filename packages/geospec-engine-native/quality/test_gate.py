"""Synthetic format/acceptance checks only. No product imports or native execution."""

import copy
from pathlib import Path
import tempfile
import unittest

from gate import compare, coveragepy, digest, inventory_files, istanbul, lcov, qualify, unique_object


LCOV = """TN:synthetic-parser-fixture
SF:synthetic.rs
FN:2,check
FNDA:1,check
DA:2,1
DA:3,1
BRDA:3,0,0,1
BRDA:3,0,1,1
LF:2
LH:2
FNF:1
FNH:1
BRF:2
BRH:2
end_of_record
"""
SPAN = {"start": {"line": 2, "column": 0}, "end": {"line": 3, "column": 1}}
ISTANBUL = {"synthetic.ts": {
    "statementMap": {"0": SPAN}, "s": {"0": 1},
    "fnMap": {"0": {"name": "check", "loc": SPAN}}, "f": {"0": 1},
    "branchMap": {"0": {"locations": [SPAN, SPAN]}}, "b": {"0": [1, 1]},
}}
PYTHON = {"meta": {"format": 3, "branch_coverage": True}, "files": {
    "synthetic.py": {"executed_lines": [2, 3], "missing_lines": [], "excluded_lines": [],
                     "executed_branches": [[3, 4], [3, -2]], "missing_branches": [],
                     "functions": {"check": {"executed_lines": [3], "missing_lines": []}}},
}}


class GateTests(unittest.TestCase):
    def test_should_accept_complete_synthetic_formats(self):
        for report in (lcov(LCOV), istanbul(ISTANBUL), coveragepy(PYTHON)):
            with self.subTest(files=list(report)):
                result = compare(report, report, set(report), {})
                self.assertTrue(result)
                for metrics in result.values():
                    for metric in metrics.values():
                        self.assertEqual(metric["hit"], metric["total"])

    def test_should_reject_each_critical_metric_miss(self):
        baseline = istanbul(ISTANBUL)
        for metric in ("lines", "functions", "branches", "statements"):
            report = copy.deepcopy(baseline)
            values = report["synthetic.ts"][metric]
            values[next(iter(values))] = 0
            with self.subTest(metric=metric), self.assertRaisesRegex(ValueError, f"uncovered {metric}"):
                compare(baseline, report, {"synthetic.ts"}, {})

    def test_should_report_noncritical_miss_without_new_threshold(self):
        baseline = lcov(LCOV)
        report = copy.deepcopy(baseline)
        report["synthetic.rs"]["lines"]["3"] = 0
        result = compare(baseline, report, set(), {})
        self.assertEqual(result["synthetic.rs"]["lines"], {"total": 2, "hit": 1, "missed": ["3"]})

    def test_should_reject_sparse_or_expanded_denominator(self):
        baseline = lcov(LCOV)
        for metric in baseline["synthetic.rs"]:
            for operation in ("delete", "add"):
                report = copy.deepcopy(baseline)
                values = report["synthetic.rs"][metric]
                if operation == "delete":
                    del values[next(iter(values))]
                else:
                    values["unexpected"] = 1
                with self.subTest(metric=metric, operation=operation), self.assertRaisesRegex(ValueError, "denominator changed"):
                    compare(baseline, report, {"synthetic.rs"}, {})
        with self.assertRaisesRegex(ValueError, "file denominator changed"):
            compare(baseline, {}, {"synthetic.rs"}, {})

    def test_should_reject_missing_metric(self):
        baseline = lcov(LCOV)
        report = copy.deepcopy(baseline)
        del report["synthetic.rs"]["branches"]
        with self.assertRaisesRegex(ValueError, "metric set changed"):
            compare(baseline, report, {"synthetic.rs"}, {})

    def test_should_require_review_for_empty_metric(self):
        report = {"declaration.rs": {"lines": {}, "functions": {}, "branches": {}}}
        with self.assertRaisesRegex(ValueError, "empty without reviewed disposition"):
            compare(report, report, set(report), {})

    def test_should_treat_dash_branch_as_missed(self):
        report = lcov(LCOV.replace("BRDA:3,0,1,1", "BRDA:3,0,1,-").replace("BRH:2", "BRH:1"))
        with self.assertRaisesRegex(ValueError, "uncovered branches"):
            compare(lcov(LCOV), report, set(report), {})

    def test_should_reject_lcov_missing_summaries_truncation_duplicates_and_bad_counts(self):
        cases = ["", LCOV.replace("end_of_record", ""), LCOV + LCOV,
                 LCOV.replace("BRF:2\n", ""), LCOV.replace("LF:2", "LF:1"),
                 LCOV.replace("DA:2,1", "DA:2,-1"), LCOV.replace("DA:2,1", "DA:2,NaN"),
                 LCOV.replace("DA:2,1", "DA:2,1\nDA:2,1"),
                 LCOV.replace("FNDA:1,check\n", "")]
        for value in cases:
            with self.subTest(value=value), self.assertRaises(ValueError):
                lcov(value)

    def test_should_reject_istanbul_sparse_counts_skips_and_noninteger_counts(self):
        for change in ("sparse", "skip", "count", "arm"):
            fixture = copy.deepcopy(ISTANBUL)
            row = fixture["synthetic.ts"]
            if change == "sparse":
                row["f"] = {}
            elif change == "skip":
                row["statementMap"]["0"]["skip"] = True
            elif change == "count":
                row["s"]["0"] = True
            else:
                row["b"]["0"] = [1]
            with self.subTest(change=change), self.assertRaises(ValueError):
                istanbul(fixture)

    def test_should_reject_python_line_only_or_excluded_reports(self):
        for change in ("format", "branch_coverage", "exclusion"):
            fixture = copy.deepcopy(PYTHON)
            if change == "format":
                fixture["meta"]["format"] = 2
            elif change == "branch_coverage":
                fixture["meta"]["branch_coverage"] = False
            else:
                fixture["files"]["synthetic.py"]["excluded_lines"] = [9]
            with self.subTest(change=change), self.assertRaises(ValueError):
                coveragepy(fixture)

    def test_should_reject_duplicate_json_coordinates(self):
        with self.assertRaisesRegex(ValueError, "duplicate JSON key"):
            unique_object([("0", 1), ("0", 2)])

    def test_should_threshold_owned_spans_but_validate_complete_vendor_map(self):
        baseline = lcov(LCOV)
        row = baseline["synthetic.rs"]
        row["lines"]["10"] = 0
        row["functions"]["10:upstream"] = 0
        row["branches"]["10:0:0"] = 0
        row["branches"]["10:0:1"] = 0
        spans = {"synthetic.rs": [{"name": "check", "kind": "function", "lines": [2, 3]}]}
        result = compare(baseline, baseline, set(), {}, spans)["synthetic.rs"]
        self.assertEqual(result["functions"]["missed"], ["10:upstream"])
        self.assertEqual(result["functions"]["critical"], {"total": 1, "hit": 1, "missed": []})
        for metric in row:
            changed = copy.deepcopy(baseline)
            values = changed["synthetic.rs"][metric]
            values[next(iter(values))] = 0
            with self.subTest(metric=metric), self.assertRaisesRegex(ValueError, "uncovered"):
                compare(baseline, changed, set(), {}, spans)
            changed = copy.deepcopy(baseline)
            del changed["synthetic.rs"][metric][next(reversed(row[metric]))]
            with self.subTest(metric=metric), self.assertRaisesRegex(ValueError, "denominator changed"):
                compare(baseline, changed, set(), {}, spans)

    def test_should_reject_an_owned_function_missing_from_frozen_map(self):
        baseline = lcov(LCOV)
        spans = {"synthetic.rs": [{"name": "unmapped", "kind": "function", "lines": [20, 30]}]}
        with self.assertRaisesRegex(ValueError, "unmapped owned function"):
            compare(baseline, baseline, set(), {}, spans)

    def test_should_bind_source_profile_products_and_artifacts(self):
        # All scratch stays inside this owned directory; no native product is loaded.
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as scratch:
            root = Path(scratch)
            (root / "owned").mkdir()
            source = root / "owned/synthetic.rs"
            source.write_text("// synthetic data, not compiled\nfn check() {}\n")
            baseline = root / "baseline.lcov"
            baseline.write_text(LCOV.replace("synthetic.rs", "owned/synthetic.rs"))
            artifact = root / "actual.lcov"
            artifact.write_text(baseline.read_text())
            product = root / "synthetic.product"
            product.write_text("synthetic product identity; never executable")
            context = root / "synthetic.context"
            context.write_text("synthetic compiler/profile context")

            def reference(path):
                return {"path": path.relative_to(root).as_posix(), "sha256": digest(path)}

            profile = {"id": "synthetic", "sources": ["owned/synthetic.rs"], "format": "lcov",
                       "baseline": reference(baseline), "instrumenter": {"name": "synthetic", "version": "1"},
                       "configuration": {"target": "synthetic", "features": [],
                                         "resolved_build_context": reference(context)},
                       "boundary": "synthetic-only", "empty_metrics": {}}
            policy = {"source_root": "owned", "artifact_directories": [], "self_accounting": [],
                      "files": [{"path": "owned/synthetic.rs", "sha256": digest(source), "class": "critical"}],
                      "profiles": [profile], "generated_equivalence": []}
            receipt = {"configuration": profile["configuration"], "boundary": "synthetic-only",
                       "instrumenter": profile["instrumenter"], "products": [reference(product)],
                       "coverage": reference(artifact)}
            self.assertEqual(qualify(root, policy, {"synthetic": receipt})["status"], "qualified")
            for change in ("target", "features", "instrumenter", "boundary", "product", "artifact", "missing", "baseline", "context"):
                changed = copy.deepcopy(receipt)
                changed_policy = copy.deepcopy(policy)
                if change in {"target", "features"}:
                    changed["configuration"][change] = "other"
                elif change in {"instrumenter", "boundary"}:
                    changed[change] = "other"
                elif change == "product":
                    changed["products"][0]["sha256"] = "0" * 64
                elif change == "artifact":
                    changed["coverage"]["sha256"] = "0" * 64
                elif change == "baseline":
                    changed_policy["profiles"][0]["baseline"] = None
                elif change == "context":
                    changed_policy["profiles"][0]["configuration"]["resolved_build_context"] = None
                receipts = {} if change == "missing" else {"synthetic": changed}
                with self.subTest(change=change):
                    self.assertEqual(qualify(root, changed_policy, receipts)["status"], "not-qualified")
            cohort_policy = copy.deepcopy(policy)
            cohort_profile = cohort_policy["profiles"][0]
            cohort_profile["boundaries"] = ["host-a", "host-b"]
            cohort_profile["cohort_correspondence"] = None
            cohort_policy["release_boundaries"] = ["host-a", "host-b"]
            cohort_receipt = copy.deepcopy(receipt)
            cohort_receipt["boundary_receipts"] = {"host-a": reference(context), "host-b": reference(context)}
            result = qualify(root, cohort_policy, {"synthetic": cohort_receipt})
            self.assertIn("missing approved shared-binary/map correspondence", result["errors"][0])
            cohort_profile["cohort_correspondence"] = reference(context)
            cohort_receipt["cohort_correspondence"] = reference(context)
            self.assertEqual(qualify(root, cohort_policy, {"synthetic": cohort_receipt})["status"], "qualified")
            del cohort_receipt["boundary_receipts"]["host-b"]
            result = qualify(root, cohort_policy, {"synthetic": cohort_receipt})
            self.assertIn("missing or extra functional boundary receipt", result["errors"][0])
            source.write_text(source.read_text() + "// source changed\n")
            self.assertIn("source inventory drift", qualify(root, policy, {"synthetic": receipt})["errors"][0])
            hidden = root / "owned/types.ts"
            hidden.write_text("export const hiddenLogic = () => false;\n")
            self.assertIn("owned/types.ts", inventory_files(root, policy))
            self.assertTrue(any("types.ts" in error for error in qualify(root, policy, {"synthetic": receipt})["errors"]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
