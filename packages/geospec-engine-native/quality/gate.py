#!/usr/bin/env python3
"""A1-R7 coverage acceptance over retained artifacts; never builds or runs a host.

Usage: python3 quality/gate.py --inventory-sha256 SHA --receipts receipts.json
No environment variables. Exit 0: qualified; 1: not qualified (including missing
data). JSON goes to stdout. See README.md for the pinned denominator contract.
"""

import argparse
import hashlib
import json
from pathlib import Path


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, f"duplicate JSON key: {key}")
        result[key] = value
    return result


def read_json(path):
    return json.loads(path.read_text(), object_pairs_hook=unique_object)


def count(value):
    require(type(value) is int and value >= 0, f"invalid coverage count: {value}")
    return value


def line(value):
    require(type(value) is int and value > 0, f"invalid source line: {value}")
    return value


def add(values, key, value):
    require(key not in values, f"duplicate coverage coordinate: {key}")
    values[key] = count(value)


def lcov(text):
    """Read classic LLVM/LCOV FN/FNDA, DA and BRDA, rejecting partial records."""
    files, current = {}, None
    for raw in text.splitlines():
        if not raw or raw.startswith("TN:"):
            continue
        if raw.startswith("SF:"):
            require(current is None, "unterminated LCOV record")
            name = raw[3:]
            require(name not in files, f"duplicate LCOV file: {name}; merge upstream")
            current = {"lines": {}, "functions": {}, "branches": {}}
            definitions, function_counts, summaries = {}, {}, {}
        elif raw == "end_of_record":
            require(current is not None, "LCOV record without source")
            require(definitions.keys() == function_counts.keys(), "FN/FNDA mismatch")
            current["functions"] = {
                f"{definitions[name]}:{name}": hits for name, hits in function_counts.items()
            }
            for metric, total, hit in (("lines", "LF", "LH"),
                                       ("functions", "FNF", "FNH"),
                                       ("branches", "BRF", "BRH")):
                values = current[metric]
                require(summaries.get(total) == len(values), f"missing/inconsistent {total}")
                require(summaries.get(hit) == sum(v > 0 for v in values.values()),
                        f"missing/inconsistent {hit}")
            files[name] = current
            current = None
        else:
            require(current is not None, "coverage outside LCOV record")
            tag, value = raw.split(":", 1)
            if tag == "DA":
                coordinate, hits, *_ = value.split(",")
                add(current["lines"], str(line(int(coordinate))), int(hits))
            elif tag == "FN":
                coordinate, symbol = value.split(",", 1)
                # LLVM can emit the optional end-line before the symbol.
                if "," in symbol and symbol.split(",", 1)[0].isdigit():
                    end, symbol = symbol.split(",", 1)
                    require(int(end) >= int(coordinate), "reversed function range")
                add(definitions, symbol, line(int(coordinate)))
            elif tag == "FNDA":
                hits, symbol = value.split(",", 1)
                add(function_counts, symbol, int(hits))
            elif tag == "BRDA":
                coordinate, block, branch, hits = value.split(",")
                line(int(coordinate))
                add(current["branches"], f"{coordinate}:{block}:{branch}",
                    0 if hits == "-" else int(hits))
            elif tag in {"LF", "LH", "FNF", "FNH", "BRF", "BRH"}:
                add(summaries, tag, int(value))
            else:
                raise ValueError(f"unsupported LCOV field: {tag}")
    require(current is None and files, "empty or truncated LCOV")
    return files


def location(value):
    require(not value.get("skip", False), "skipped instrumentation coordinate")
    for endpoint in ("start", "end"):
        line(value[endpoint]["line"])
        count(value[endpoint]["column"])
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def istanbul(data):
    """Read source-mapped Istanbul coverage-final.json, including statements."""
    files = {}
    for name, record in data.items():
        metrics = {key: {} for key in ("lines", "functions", "branches", "statements")}
        for counts, maps in (("s", "statementMap"), ("f", "fnMap"), ("b", "branchMap")):
            require(record[counts].keys() == record[maps].keys(), f"{counts}/{maps} mismatch")
        for key, value in record["s"].items():
            entry = record["statementMap"][key]
            add(metrics["statements"], f"{key}:{location(entry)}", value)
            coordinate = str(entry["start"]["line"])
            metrics["lines"][coordinate] = max(metrics["lines"].get(coordinate, 0), count(value))
        for key, value in record["f"].items():
            entry = record["fnMap"][key]
            require(not entry.get("skip", False), "skipped function")
            add(metrics["functions"], f"{key}:{entry['name']}:{location(entry['loc'])}", value)
        for key, values in record["b"].items():
            entry = record["branchMap"][key]
            require(not entry.get("skip", False), "skipped branch")
            require(len(values) == len(entry["locations"]), "branch arm mismatch")
            for arm, (value, span) in enumerate(zip(values, entry["locations"])):
                add(metrics["branches"], f"{key}:{arm}:{location(span)}", value)
        files[name] = metrics
    require(files, "empty Istanbul coverage")
    return files


def coveragepy(data):
    """Read coverage.py JSON v3 line, arc and function data (not summary percentages)."""
    require(data["meta"]["format"] == 3 and data["meta"]["branch_coverage"] is True,
            "coverage.py JSON v3 with branch coverage required")
    files = {}
    for name, record in data["files"].items():
        require(not record["excluded_lines"], "coverage.py exclusions need source disposition")
        metrics = {key: {} for key in ("lines", "functions", "branches")}
        for field, hits in (("executed_lines", 1), ("missing_lines", 0)):
            for coordinate in record[field]:
                add(metrics["lines"], str(line(coordinate)), hits)
        for field, hits in (("executed_branches", 1), ("missing_branches", 0)):
            for origin, destination in record[field]:
                require(type(origin) is int and type(destination) is int, "invalid arc")
                add(metrics["branches"], f"{origin}:{destination}", hits)
        for symbol, function in record["functions"].items():
            if symbol:  # coverage.py uses the empty name for module-level code.
                coordinates = function["executed_lines"] + function["missing_lines"]
                require(coordinates, f"function without executable mapping: {symbol}")
                add(metrics["functions"], f"{min(coordinates)}:{symbol}",
                    int(bool(function["executed_lines"])))
        files[name] = metrics
    require(files, "empty coverage.py report")
    return files


def parse(path, format_name, source_root):
    parsers = {"istanbul": istanbul, "coveragepy": coveragepy}
    raw = lcov(path.read_text()) if format_name == "lcov" else parsers[format_name](read_json(path))
    result = {}
    for name, metrics in raw.items():
        source = Path(name)
        relative = source.relative_to(source_root) if source.is_absolute() else source
        require(".." not in relative.parts, f"source escapes root: {name}")
        key = relative.as_posix()
        require(key not in result, f"duplicate normalized source: {name}")
        result[key] = metrics
    return result


def compare(expected, actual, critical, empty_metrics, critical_spans=None):
    """An omitted file/coordinate cannot shrink the independently frozen map."""
    critical_spans = critical_spans or {}
    require(expected.keys() == actual.keys(), "coverage file denominator changed")
    summary = {}
    for name, metrics in expected.items():
        require(metrics.keys() == actual[name].keys(), f"metric set changed: {name}")
        spans = critical_spans.get(name, [])
        # Regional ownership is currently used only for Rust vendor LCOV. Keep
        # the full map intact; select the critical threshold by source coordinate.
        for span in spans:
            start, end = span["lines"]
            require(line(start) <= line(end), f"invalid critical span: {name}")
            if span["kind"] == "function":
                for metric in ("lines", "functions"):
                    require(any(start <= int(key.split(":", 1)[0]) <= end for key in metrics[metric]),
                            f"{name}: unmapped owned function {span['name']}: {metric}")
        summary[name] = {}
        for metric, coordinates in metrics.items():
            values = actual[name][metric]
            require(coordinates.keys() == values.keys(), f"{name}: {metric} denominator changed")
            require(coordinates or empty_metrics.get(name, {}).get(metric),
                    f"{name}: {metric} mapping empty without reviewed disposition")
            missed = [key for key, value in values.items() if value == 0]
            summary[name][metric] = {"total": len(values), "hit": len(values) - len(missed),
                                     "missed": missed}
            selected = set(values) if name in critical else {
                key for key in values if any(start <= int(key.split(":", 1)[0]) <= end
                                             for start, end in (span["lines"] for span in spans))
            }
            critical_missed = [key for key in missed if key in selected]
            if spans:
                summary[name][metric]["critical"] = {
                    "total": len(selected), "hit": len(selected) - len(critical_missed),
                    "missed": critical_missed,
                }
            require(not critical_missed, f"{name}: uncovered {metric}: {critical_missed[:8]}")
    return summary


def inventory_files(root, policy):
    """Walk the entire owned package, including ignored source and new file types."""
    excluded = set(policy["artifact_directories"])
    self_files = set(policy["self_accounting"])
    result = {}
    pending = [root / policy["source_root"]]
    while pending:
        directory = pending.pop()
        for path in sorted(directory.iterdir()):
            relative = path.relative_to(root).as_posix()
            if relative in excluded or relative in self_files:
                continue
            require(not path.is_symlink(), f"unreviewed source symlink: {relative}")
            if path.is_dir():
                pending.append(path)
            else:
                result[relative] = digest(path)
    return result


def checked_artifact(root, reference):
    path = root / reference["path"]
    require(digest(path) == reference["sha256"], f"artifact hash mismatch: {path}")
    return path


def qualify(root, policy, receipts):
    errors, reports = [], {}
    expected = {entry["path"]: entry["sha256"] for entry in policy["files"]}
    require(len(expected) == len(policy["files"]), "duplicate inventory entry")
    live = inventory_files(root, policy)
    for name in sorted(live.keys() | expected.keys()):
        if live.get(name) != expected.get(name):
            errors.append(f"source inventory drift: {name}")
    profiles = policy["profiles"]
    require(profiles and len({p["id"] for p in profiles}) == len(profiles), "empty/duplicate profiles")
    covered = {name for profile in profiles for name in profile["sources"]}
    critical = {entry["path"] for entry in policy["files"] if entry["class"] == "critical"}
    owned_vendor = {entry["path"]: entry["critical_spans"] for entry in policy["files"]
                    if entry["class"] == "owned-vendor"}
    require(all(owned_vendor.values()), "owned vendor entry has no critical spans")
    measured = {entry["path"] for entry in policy["files"]
                if entry["class"] in {"critical", "owned-vendor", "noncritical"}}
    require(measured <= covered, f"owned source has no target: {sorted(measured - covered)}")
    boundaries = {boundary for profile in profiles for boundary in profile.get("boundaries", [])}
    require(set(policy.get("release_boundaries", [])) <= boundaries, "release boundary has no coverage accounting")
    for equivalence in policy["generated_equivalence"]:
        if equivalence["review"] is None:
            errors.append(f"unreviewed generated source correspondence: {equivalence['path']}")
        else:
            checked_artifact(root, equivalence["review"])
    require(set(receipts) <= {p["id"] for p in profiles}, "unknown receipt profile")
    for profile in profiles:
        identifier = profile["id"]
        try:
            require(profile["baseline"] is not None, "missing frozen instrumentation map")
            require(profile["instrumenter"] is not None, "missing exact instrumenter version")
            context = profile["configuration"]["resolved_build_context"]
            require(context is not None, "missing resolved build context")
            checked_artifact(root, context)
            require(identifier in receipts, "missing actual coverage receipt")
            receipt = receipts[identifier]
            require(receipt["configuration"] == profile["configuration"], "target/feature/build mismatch")
            require(receipt["instrumenter"] == profile["instrumenter"], "instrumenter mismatch")
            require(receipt["boundary"] == profile["boundary"], "wrong installed host boundary")
            if profile.get("boundaries"):
                require(set(receipt["boundary_receipts"]) == set(profile["boundaries"]),
                        "missing or extra functional boundary receipt")
                for reference in receipt["boundary_receipts"].values():
                    checked_artifact(root, reference)
                if len(profile["boundaries"]) > 1:
                    require(profile["cohort_correspondence"] is not None,
                            "missing approved shared-binary/map correspondence")
                    require(receipt["cohort_correspondence"] == profile["cohort_correspondence"],
                            "cohort correspondence mismatch")
                    checked_artifact(root, profile["cohort_correspondence"])
            require(receipt["products"], "missing built-product provenance")
            for product in receipt["products"]:
                checked_artifact(root, product)
            baseline = parse(checked_artifact(root, profile["baseline"]), profile["format"], root)
            actual = parse(checked_artifact(root, receipt["coverage"]), profile["format"], root)
            require(set(baseline) == set(profile["sources"]), "instrumentation/source inventory mismatch")
            spans = {name: owned_vendor[name] for name in baseline if name in owned_vendor}
            require(not spans or (profile["format"] == "lcov" and profile["language"] == "rust"),
                    "owned vendor spans require Rust LCOV coordinates")
            reports[identifier] = compare(baseline, actual, critical, profile["empty_metrics"], spans)
        except (ValueError, KeyError, TypeError, AttributeError, IndexError, OSError) as error:
            errors.append(f"{identifier}: {error}")
    return {"status": "not-qualified" if errors else "qualified", "errors": errors,
            "profiles": reports, "source_files": len(expected)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inventory", type=Path, default=Path(__file__).with_name("inventory.json"))
    parser.add_argument("--inventory-sha256", required=True,
                        help="Principal-pinned digest; do not calculate from candidate in CI")
    parser.add_argument("--receipts", type=Path, required=True)
    args = parser.parse_args()
    try:
        require(digest(args.inventory) == args.inventory_sha256, "unapproved inventory digest")
        policy = read_json(args.inventory)
        receipts = read_json(args.receipts)
        require(receipts["inventory_sha256"] == args.inventory_sha256, "stale receipt source identity")
        result = qualify(Path(__file__).resolve().parents[3], policy, receipts["profiles"])
    except (ValueError, KeyError, TypeError, AttributeError, IndexError, OSError) as error:
        result = {"status": "not-qualified", "errors": [str(error)], "profiles": {}}
    print(json.dumps(result, indent=2))
    return 0 if result["status"] == "qualified" else 1


if __name__ == "__main__":
    raise SystemExit(main())
