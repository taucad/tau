---
title: 'OCJS validation-layer manifest consultation audit'
description: 'Inventory of OCJS bindgen+link pipeline manifests and the post-link validators that fail to consult them — `validate-build.py` false-positive cluster, missing builtin/alias exemptions, and the `nCollectionManifest` provenance gap that disables docker-e2e Phase 6.'
status: active
created: '2026-05-27'
updated: '2026-05-27'
category: audit
related:
  - docs/research/ocjs-replicad-multi-link-warning-audit.md
  - docs/research/ocjs-ncollection-auto-discovery-build-validation.md
  - docs/research/ocjs-rbv-build-manifest-regressions.md
  - docs/research/ocjs-bindgen-libembind-outstanding-issues-catalog.md
---

# OCJS validation-layer manifest consultation audit

Catalog of every place in the OCJS bindgen + link + post-link + provenance surface where a validator/auditor/CLI should consult an auxiliary manifest produced by an earlier pipeline stage but currently does not — generalising the `validate-build.py` ↔ `ncollection-manifest.json` gap surfaced while fixing R4 in the [multi-link warning audit](./ocjs-replicad-multi-link-warning-audit.md).

## Executive Summary

OCJS has a **split-brain validation layer**: link-time code in `src/ocjs_bindgen/link/yaml_build.py` correctly consults generate-time manifests (`build/ncollection-manifest.json`, per-class `.d.ts.json` fragments with `referenced_classes`, `BUILTIN_ADDITIONAL_BIND_CODE` registrations) to classify YAML-requested symbols into compiled / alias-resolved / builtin / auto-discovered buckets. Post-link consumers — `scripts/validate-build.py`, `scripts/docker-e2e-validate.sh`, `scripts/generate-docs.mjs` — short-circuit this resolution and re-implement a naive `requested - compiled_o_files` set difference. The result is **false-positive `[FAIL] Symbols: N missing` lines on every realistic build** (e.g. `TopoDS`, `TColgp_Array1OfPnt`), masked only by `|| true` in `build-wasm.sh`, plus a permanently-skipped docker-e2e ratio check because nothing writes `nCollectionManifest` into provenance.

This audit enumerates **11 manifest-producing files**, **10 consumer surfaces**, and **8 distinct consultation gaps** (2× P0, 5× P1, 1× P2). The proposed remediation is a single shared `manifest_registry` module that all validators import — eliminating the duplication of `_collect_compiled_symbols`, the divergent alias/builtin treatment, and the absence of symmetry tests in one sweep.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Methodology](#methodology)
- [Findings](#findings)
  - [Section A — Manifest inventory](#section-a--manifest-inventory)
  - [Section B — Consultation-gap matrix](#section-b--consultation-gap-matrix)
  - [Section C — Per-gap detail](#section-c--per-gap-detail)
- [Recommendations](#recommendations)
- [Test Coverage](#test-coverage)
- [References](#references)
- [Appendix](#appendix)

## Problem Statement

During the R1–R12 implementation of [`ocjs-replicad-multi-link-warning-audit.md`](./ocjs-replicad-multi-link-warning-audit.md), the new `build-wasm.sh link` post-link validation surfaced this output on a freshly rebuilt replicad single-threaded link:

```text
═══ Post-link validation ═══

  BUILD VALIDATION FAILED
Validating build: /src/custom_build_single.yml (hash: 4a9e300646d8)
  ...
  [FAIL] Symbols: 10 missing out of 226 requested
         - Poly_Array1OfTriangle
         - TColStd_Array1OfBoolean
         - TColStd_Array1OfInteger
         - TColStd_Array1OfReal
         - TColgp_Array1OfDir
         - TColgp_Array1OfPnt
         - TColgp_Array1OfPnt2d
         - TColgp_Array1OfVec
         - TColgp_Array2OfPnt
         - TopTools_ListOfShape
  [PASS] Output: replicad_single.wasm (21.4 MB)
  [PASS] Runtime helpers: 3 EH helpers present in linked JS glue

  Manifest written to /src/replicad_single.build-manifest.json
```

Yet the **same link run** had already printed `All bindings verified.` upstream in `verifyBindings`, and the linked WASM works at runtime — the 10 "missing" symbols are NCollection typedef aliases that resolve at link time to canonical mangled spellings (e.g. `TColgp_Array1OfPnt` → `NCollection_Array1_gp_Pnt`) via `build/ncollection-manifest.json`.

The root cause is structural, not a bug in `validate-build.py` per se: post-link validators do not consult any of the generate-time manifests that the link layer uses. The output ships into `replicad_single.build-manifest.json` (sidecar artefact) where downstream consumers (`generate-docs.mjs`, `dts-validation.test.ts`, docker-e2e smoke) inherit the false negatives.

This audit asks: **where else is this same split-brain pattern hiding in the OCJS pipeline?**

## Methodology

1. Enumerated every `json.dump(`, `with open(.*"w")`, and stamp-file write across `src/ocjs_bindgen/`, `src/provenance.py`, `src/compileBindings.py`, `scripts/`, `build-wasm.sh`.
2. For each output, traced consumers via `grep "<filename>"` across the entire `repos/opencascade.js` tree.
3. Cross-referenced the Nx target graph (`project.json`) to confirm that consumer targets run downstream of producer targets (i.e. manifests exist when validators run).
4. Verified each gap empirically against:
   - `smoke-output/opencascade_linkfilter_poc.build-manifest.json` (the link-filter-poc fixture that ships with the repo)
   - The replicad single-threaded build manifest produced during the rebuild above
5. Confirmed downstream Tau code (`apps/ui`, `packages/runtime/src/kernels/replicad/`) does not re-implement any bindgen-style symbol auditing — only consumes prebuilt WASM/JS/DTS.

## Findings

### Section A — Manifest inventory

Every auxiliary JSON/manifest/stamp file produced anywhere in the OCJS pipeline. "Producer" is the writing module + the Nx target / build-wasm subcommand that triggers it. "Schema" is the on-disk shape (not the Cerberus schema). "Consumers" lists every module/script that loads the file (✅ = correctly loads, ❌ = should but doesn't, see Section B).

| #   | Path                                                   | Producer                                                                   | Schema summary                                                                                                                                                                                                                     | Known consumers                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | `build/ncollection-manifest.json`                      | `ocjs_bindgen/discover.py::write_manifest` (via `step_generate`)           | **v2 (post V1 RE-SHIP):** `{ schema: "ncollection-manifest-v2", symbols: string[], declarations: [{ mangled_name, container, args, source_classes[] (reachability tag, NOT alias map) }], template_typedefs: { alias: mangled } }` | ✅ `manifest_registry.load_ncollection_alias_index` (reads `template_typedefs`); ✅ `yaml_build._filter_auto_symbols_by_scope` (reads `declarations[].source_classes`); ✅ unit + sentinel tests; ✅ validate-build (via shared registry) |
| M2  | `build/bindings/**/<Class>.d.ts.json`                  | `pipeline/generate.py:577` (per-class)                                     | `{ ".d.ts", kind, exports[], ancestors?, referenced_classes? }`                                                                                                                                                                    | ✅ `yaml_build._collect_dts_fragments`, `_compute_yaml_class_scope`; ✅ `scripts/generate-docs.mjs`; ❌ validate-build                                                                                                                    |
| M3  | `build/bindings/**/<Class>.cpp`                        | `pipeline/generate.py` (per-class)                                         | Embind C++ source                                                                                                                                                                                                                  | ✅ `compileBindings.py`; ✅ `tests/bindgen-output-shape.test.ts`                                                                                                                                                                          |
| M4  | `build/bindings/.generator-hash`                       | `pipeline/generate.py:23-66`                                               | 16-char hex                                                                                                                                                                                                                        | generate cache invalidation only                                                                                                                                                                                                          |
| M5  | `build/any-type-report.json`                           | `ocjs_bindgen/__main__.py:159-162`                                         | `{ reason: { count, types: { spelling: count } } }`                                                                                                                                                                                | **CI log only** — never loaded by link or validate                                                                                                                                                                                        |
| M6  | `build/build-flags.json`                               | `flags.write_build_flags()` (PCH stage)                                    | OCJS\_\* env snapshot + timestamp                                                                                                                                                                                                  | ✅ `validate_build_flags` (link, compile); ✅ `compileBindings.py` mtime barrier                                                                                                                                                          |
| M7  | `build/provenance.json`                                | `provenance.py init` + `add_*` calls                                       | `wasm-build-provenance-v1` scratchpad                                                                                                                                                                                              | `provenance.finalize` → sidecar (M8)                                                                                                                                                                                                      |
| M8  | `<output>/<variant>.provenance.json`                   | `provenance.finalize` (L408-416)                                           | scratchpad + `output`, `sections`, `linking`                                                                                                                                                                                       | ✅ docs site; ⚠️ `docker-e2e-validate.sh` (expects `nCollectionManifest` — **never written**)                                                                                                                                             |
| M9  | `<output>/<variant>.build-manifest.json`               | `scripts/validate-build.py:243-257`                                        | `{ validation_passed, symbols{requested, missing, compiled, ...}, outputs[], runtime_helpers, binding_report }`                                                                                                                    | ✅ `generate-docs.mjs`; ⚠️ `dts-validation.test.ts` (expects `any_reasons` — never written); ✅ sentinel `test_dist_parity.py`                                                                                                            |
| M10 | `build/compiled-bindings/binding-report.json`          | `src/compileBindings.py:194` (`COMPILED_BINDINGS_DIR/binding-report.json`) | `{ succeeded, failed, cached, ... }`                                                                                                                                                                                               | ❌ `validate-build.py:126` reads **wrong path** (`build/binding-report.json`)                                                                                                                                                             |
| M11 | `build/occt-docs.json`                                 | `extract-docs.py:705-739`                                                  | symbol → Doxygen doc blob                                                                                                                                                                                                          | ✅ `jsdoc/loader.py` during codegen                                                                                                                                                                                                       |
| M12 | `build/.docs-hash`                                     | `extract-docs.py:706-742`                                                  | `occt_commit:extractor_sha`                                                                                                                                                                                                        | extract-docs cache only                                                                                                                                                                                                                   |
| M13 | `build/patches-applied`, `build/.cmake-lib-dir` stamps | `build-wasm.sh`                                                            | timestamp / path text                                                                                                                                                                                                              | Nx cache + `yaml_build.runBuild` (L819)                                                                                                                                                                                                   |
| M14 | `dist/*.js.symbols`                                    | Emscripten link                                                            | wasm-ld symbol listing                                                                                                                                                                                                             | packaging + docker-e2e presence check — **no JSON consumer**                                                                                                                                                                              |

**Not auxiliary manifests** (inputs, not pipeline outputs): `bindgen-filters.yaml`, `build-configs/configurations.json`, `DEPS.json`.

**Not present** (checked, do not exist): `handle-*.json`, `template-aliases.json`, `build/doxygen-extracted-*.json`, `build/cmake-libs/*.json`. Per-class `referenced_classes` lives _inside_ each M2 fragment, not a separate index.

### Section B — Consultation-gap matrix

For each consumer surface, mark which manifests it correctly consults (✅), which it should consult but doesn't (❌), and which are not relevant (N/A).

| Consumer                                                 | M1 ncollection-manifest | M2 referenced_classes / ancestors | M5 any-type-report | M6 build-flags    | M10 binding-report | BUILTIN bind code exemption |
| -------------------------------------------------------- | ----------------------- | --------------------------------- | ------------------ | ----------------- | ------------------ | --------------------------- |
| `yaml_build.verifyBindings`                              | ✅ alias demotion       | N/A (uses `.cpp.o` only)          | N/A                | ✅ (via runBuild) | N/A                | ❌ no exemption (WARN only) |
| `yaml_build._compute_yaml_class_scope`                   | ✅ filter               | ✅ walks fragments                | N/A                | N/A               | N/A                | ✅ `__custom__` sentinel    |
| `yaml_build._enforce_strict_types_gate`                  | indirect via scope      | ✅ message cites it               | ✅ in-process      | N/A               | N/A                | N/A                         |
| **`scripts/validate-build.py`**                          | **❌**                  | **❌**                            | **❌**             | N/A               | **❌ wrong path**  | **❌**                      |
| **`scripts/docker-e2e-validate.sh`**                     | **❌ expects in M8**    | N/A                               | N/A                | N/A               | N/A                | N/A                         |
| **`scripts/generate-docs.mjs`**                          | ❌                      | ✅ reads fragments                | N/A                | N/A               | ⚠️ naive math      | N/A                         |
| `provenance.py` finalize                                 | **❌ no nCollection**   | N/A                               | N/A                | partial           | N/A                | N/A                         |
| `build-wasm.sh validate` subcmd                          | N/A                     | N/A                               | N/A                | N/A               | N/A                | N/A (Cerberus only)         |
| `customBuildSchema.py`                                   | N/A                     | N/A                               | N/A                | N/A               | N/A                | N/A                         |
| `enumerate-symbols.py`                                   | N/A (re-AST)            | N/A                               | N/A                | N/A               | N/A                | N/A                         |
| Tau / replicad runtime (`packages/runtime/.../replicad`) | N/A                     | N/A                               | N/A                | N/A               | N/A                | N/A                         |

#### Priority ranking

| Priority | Gap                                                                                       | Observed effect                                                                                                                                                                                                                                                            |
| -------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0**   | `validate-build.py` vs `verifyBindings` — no `ncollection-manifest` alias index           | False `[FAIL] Symbols: N missing` on every build whose YAML lists typedef aliases (`TColgp_*`, `Poly_Array1OfTriangle`, etc.). Masked by `\|\| true` in `build-wasm.sh:805,855`. Pollutes sidecar `build-manifest.json`.                                                   |
| **P0**   | `validate-build.py` — no `BUILTIN_ADDITIONAL_BIND_CODE` exemption                         | False FAIL for `TopoDS`, `OCJS`, `TColStd_IndexedDataMapOfStringString` (registered only via `class_<...>("X")` in the builtin block, no per-symbol `.cpp.o`). Confirmed in `smoke-output/opencascade_linkfilter_poc.build-manifest.json:32-34` (`"missing": ["TopoDS"]`). |
| **P1**   | `provenance.py` — never writes `nCollectionManifest.{linked,total}`                       | `docker-e2e-validate.sh:199-203` permanently logs `WARNING: provenance.json missing nCollectionManifest...; skipping ratio check`. Phase 6 of the docker-e2e smoke is dead code as shipped.                                                                                |
| **P1**   | `validate-build.py:126` — wrong path for `binding-report.json` (M10)                      | Reads `build/binding-report.json`; writer puts it at `build/compiled-bindings/binding-report.json`. `[INFO] Binding report` never prints; manifest `binding_report` field always `null` (verified in smoke fixture L59).                                                   |
| **P1**   | `validate-build.py` — no `referenced_classes` / scope-aware accounting                    | Auto-included NCollections (`_auto_symbols`) and types reachable only via `referenced_classes` lift are excluded from "compiled" tally → inflates `extra_compiled`, depresses match accuracy.                                                                              |
| **P1**   | `scripts/generate-docs.mjs:390-413` — naive `compiled - requested` for `ncollection_auto` | Misleading "extras" count in the published docs site; should consume provenance `nCollectionManifest` (P1 above) once it exists, or extended `build-manifest.json` schema.                                                                                                 |
| **P1**   | `dts-validation.test.ts:989-1001` — expects `any_reasons` on M9 build-manifest            | Field never written by `validate-build.py`. Test no-ops when manifest absent or field missing — a coverage hole.                                                                                                                                                           |
| **P2**   | Duplicated `_collect_compiled_symbols` / `find_compiled_bindings` walkers                 | Drift risk between link-time and post-link symbol enumeration. Identical algorithm in `yaml_build.py:303-312` and `validate-build.py:46-64`.                                                                                                                               |
| **P2**   | `enumerate-symbols.py` re-implements discovery                                            | Could drift from `discover.py` + M1; not load-bearing for production builds but flagged for completeness.                                                                                                                                                                  |
| **P2**   | `.js.symbols` (M14) unused for validation                                                 | Authoritative post-link symbol ground truth (output of `wasm-ld --emit-symbol-map`) — could replace `find_compiled_bindings` heuristic entirely.                                                                                                                           |

### Section C — Per-gap detail

#### C1 — `validate-build.py` missing NCollection alias index (P0)

**Canonical consult pattern** (`src/ocjs_bindgen/link/yaml_build.py:314-375`):

```314:375:repos/opencascade.js/src/ocjs_bindgen/link/yaml_build.py
def _load_ncollection_alias_index(libraryBasePath) -> dict:
  ...
def verifyBindings(bindings, libraryBasePath) -> bool:
  ...
  alias_index = _load_ncollection_alias_index(libraryBasePath)
  ...
    if canonical and canonical in compiled:
      alias_resolved.append((sym, canonical))
```

**Gap site** (`scripts/validate-build.py:67-84`):

```67:84:repos/opencascade.js/scripts/validate-build.py
def validate_symbols(config, build_dir):
    """Check that every symbol in the YAML config has a compiled .o file."""
    compiled = find_compiled_bindings(build_dir)
    all_bindings = list(config["mainBuild"].get("bindings", []))
    ...
    requested = {b["symbol"] for b in all_bindings}
    missing = sorted(requested - compiled)
```

**Current behavior**: Raw set difference `requested - compiled`; typedef aliases counted as missing.

**Expected behavior**: Import `_load_ncollection_alias_index` (or extract to a shared module — see [D1](#d1--canonical-manifest-registry-module)) and mirror the `alias_resolved` / `truly_missing` split. Manifest `symbols.missing` should list only `truly_missing`; emit an optional `symbols.alias_resolved: [...]` INFO bucket.

**Fix sketch**:

```python
from ocjs_bindgen.link.manifest_registry import resolve_requested_symbols

def validate_symbols(config, build_dir):
    compiled = find_compiled_bindings(build_dir)
    alias_index = load_ncollection_alias_index(build_dir)
    builtins = builtin_binding_symbols()
    requested = {b["symbol"] for b in _all_bindings(config)}
    resolution = resolve_requested_symbols(requested, compiled, alias_index, builtins)
    return {
        "requested": sorted(requested),
        "compiled": len(compiled),
        "missing": sorted(resolution.truly_missing),
        "alias_resolved": sorted(resolution.alias_resolved),
        "builtin": sorted(resolution.builtin),
        "extra_compiled": len(compiled - requested - resolution.satisfied_by_compiled),
        "pass": not resolution.truly_missing,
    }
```

**Test mirror**: Extend `tests/unit/test_link_yaml_scope.py:348-422` (`test_verify_bindings_demotes_alias_resolved_to_info`) with a parallel `tests/unit/test_validate_build_manifest_symmetry.py` asserting `validate_symbols(...)` returns the same buckets `verifyBindings(...)` does for the same fixture.

#### C2 — Builtin / `additionalBindCode` symbols (P0)

**Canonical registrations** (`src/ocjs_bindgen/link/yaml_build.py:222-298`):

```222:298:repos/opencascade.js/src/ocjs_bindgen/link/yaml_build.py
BUILTIN_ADDITIONAL_BIND_CODE = r"""
...
  class_<TopoDS_Bind_>("TopoDS")
...
  class_<OCJS>("OCJS")
```

These symbols are registered into the link via the builtin C++ block; there is no `TopoDS.cpp.o` or `OCJS.cpp.o` for `find_compiled_bindings` to find. Same problem for the `additionalBindCode` blocks consumers inject via YAML (e.g. replicad's `TopoDS_Cast`, `OCJS_ShapeHasher`).

**Empirical evidence** (`smoke-output/opencascade_linkfilter_poc.build-manifest.json:32-37`):

```json
"missing": [
  "TopoDS"
],
"extra_compiled": 5019,
"pass": false
```

The link-filter-poc smoke fixture _ships_ with `validation_passed: false` because `TopoDS` is in the YAML's `bindings:` list but has no `.cpp.o`. Every downstream consumer reading this manifest inherits the false negative.

**Expected**: A canonical `BUILTIN_BINDING_SYMBOLS` allowlist (computed from `BUILTIN_ADDITIONAL_BIND_CODE` + the declarations baked into `declarations/builtin-bindings.d.ts`) that both `verifyBindings` and `validate_symbols` subtract from `missing`. For YAML-supplied `additionalBindCode`, walk the snippet for `class_<...>("Name")` and class*function/value_object/enum* registrations at validate time (the snippet is in `config["mainBuild"]["additionalBindCode"]`).

#### C3 — Provenance missing `nCollectionManifest` (P1)

**Consumer** (`scripts/docker-e2e-validate.sh:193-210`):

```bash
mani = data.get('nCollectionManifest') or data.get('nCollection') or {}
linked = mani.get('linked') or mani.get('linkedCount')
total = mani.get('total') or mani.get('totalCount')
if linked is None or total is None ...
    print(f"  WARNING: provenance.json missing nCollectionManifest...; skipping ratio check.")
```

**Producer gap**: `provenance.py` has `add_linking` / `finalize` but never records filter stats. The link step **does** compute them (`yaml_build.py:1036-1043` reads M1 and computes `len(_auto_symbols)` vs `len(full_set)`).

**Expected**: Extend `prov.add_linking(..., ncollection_linked=..., ncollection_total=...)` from `yaml_build.main()` after the filter; alternatively, have `provenance.finalize` re-load M1 + replay the scope math (heavier and decouples worse).

**Knock-on effect**: Phase 6 of the docker-e2e smoke (`scripts/docker-e2e-validate.sh`) has been a no-op since the script was written — silently disabled CI coverage.

#### C4 — `binding-report.json` path mismatch (P1)

**Writer** (`src/compileBindings.py:194`):

```python
report_path = os.path.join(COMPILED_BINDINGS_DIR, "binding-report.json")
```

**Reader** (`scripts/validate-build.py:126`):

```python
report_path = os.path.join(build_dir, "binding-report.json")
```

`COMPILED_BINDINGS_DIR` resolves to `build/compiled-bindings/`; the validator looks at `build/`. The fix is a one-liner:

```python
report_path = os.path.join(build_dir, "compiled-bindings", "binding-report.json")
```

Verified absent in every shipped manifest (`smoke-output/opencascade_linkfilter_poc.build-manifest.json:59` → `"binding_report": null`).

#### C5 — `referenced_classes` / scope-aware post-link accounting (P1)

**Link-time scope** (`src/ocjs_bindgen/link/yaml_build.py:492-558`):

```492:558:repos/opencascade.js/src/ocjs_bindgen/link/yaml_build.py
def _compute_yaml_class_scope(buildConfig, libraryBasePath) -> set:
  ...
        referenced = frag.get("referenced_classes")
        if isinstance(referenced, list):
          scope.update(referenced)
```

**Gap**: Post-link `validate_symbols` equates "requested YAML symbols" with "must have `.cpp.o`", ignoring (a) auto-included NCollections in `_auto_symbols`, (b) types only required via the `referenced_classes` lift.

**Architectural decision required**: Either

1. **Narrow scope** — document that `validate_symbols` only checks "explicit YAML bindings have direct compilation evidence" and exclude all four soft-resolution paths (alias, builtin, additionalBindCode, referenced lift) up front; OR
2. **Effective scope** — compute `effective_requested = yaml_symbols ∪ alias_resolved ∪ builtins ∪ referenced_lift` and `effective_satisfied = compiled ∪ auto_linked ∪ builtin_set ∪ alias_canonicals`, compare those.

Recommendation: **option 2**. Option 1 leaves the validator describing a fiction; option 2 makes `symbols.pass` mean what its name claims.

Note: `OCJS_STRICT_TYPES` is _correctly_ link-only (`yaml_build.py:1236-1240`); post-link should not duplicate it but **should** stop reporting symbol FAILs that contradict the strict-types outcome.

#### C6 — `generate-docs.mjs` manifest math (P1)

```390:413:repos/opencascade.js/scripts/generate-docs.mjs
  const ncollectionExtras =
    compiledTotal != null && requestedTotal != null ? compiledTotal - requestedTotal : null;
```

Naive `M9.symbols.compiled - len(requested)` — includes all compiled `.o` files (5040 in the smoke fixture vs 22 requested → 5019 "extras"). Not alias-adjusted, not filter-aware.

**Fix**: After C3 lands, consume `provenance.nCollectionManifest.linked` directly; alternatively, extend M9 schema with a `symbols.auto_linked` field populated from the link-filter pass.

#### C7 — `any_reasons` field expected by `dts-validation.test.ts` (P1)

```text
dts-validation.test.ts:989-1001 expects build-manifest.symbols.any_reasons
validate-build.py never writes it; test no-ops when manifest absent or field missing
```

**Options**:

- **(a)** Merge `build/any-type-report.json` (M5) into `M9.symbols.any_reasons` during `validate-build.py` (low effort, closes the test).
- **(b)** Drop the assertion and document M5 as a generate-only artefact (also acceptable; remove dead test code).

Recommend (a) — the test was clearly authored expecting symmetry; closing it strengthens the post-link contract.

#### C8 — Duplicated `_collect_compiled_symbols` / `find_compiled_bindings` (P2)

```303:312:repos/opencascade.js/src/ocjs_bindgen/link/yaml_build.py
def _collect_compiled_symbols(libraryBasePath) -> set:
```

```46:64:repos/opencascade.js/scripts/validate-build.py
def find_compiled_bindings(build_dir):
```

Nearly identical walks; trivially refactorable into the manifest registry proposed in [D1](#d1--canonical-manifest-registry-module).

#### C9 — Nx target dependency chain is sound

Audited `repos/opencascade.js/project.json` for completeness:

- `generate` outputs `bindings/` + `ncollection-manifest.json` (L69).
- `link` `dependsOn: ["compile-bindings", "compile-sources", "generate"]` (L125) → M1 + M2 fragments exist before link.
- `validate` `dependsOn: ["link"]` (L148) → all manifests exist before validate.
- `dts` `dependsOn: ["generate"]` only — no link/validate dependency (correct, dts is generate-derived).

**Edge case** (P3): If someone invokes `nx run ocjs:validate` against a partial tree (e.g. only `generate` cached), the manifest paths exist but symbol-compilation evidence is stale. Not in scope here; mention only for follow-up.

#### C10 — Replicad / Tau downstream untouched

- Replicad rendered YAMLs (`repos/replicad/packages/replicad-opencascadejs/build-config/custom_build_{single,multi}.yml`) are consumed by Docker `link` only — no Tau-side bindgen auditing.
- Tau `packages/runtime/src/kernels/replicad/` uses the prebuilt tarball; never reads M1/M2/M9.
- Published `replicad_single.build-manifest.json` (when shipped to npm registry) inherits whatever false positives `validate-build.py` produced upstream — direct downstream impact of C1, C2, C5.

## Recommendations

Numbered for cross-referencing in implementation PRs.

| #   | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Priority | Effort | Impact |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------ | ------ |
| V1  | Create `src/ocjs_bindgen/link/manifest_registry.py` exporting `load_ncollection_alias_index`, `collect_compiled_symbols`, `builtin_binding_symbols`, `resolve_requested_symbols`. **The alias loader MUST read the producer-serialised typedef alias map (not `source_classes[]`, which is a reachability tag).** Producer side: `discover.py::write_manifest` calls `_serialise_template_typedef_aliases(tuInfo, discovered)` and writes the result under `template_typedefs` in a schema-discriminated v2 manifest. Hard-fail on pre-v2 schema with a regenerate-pointer error — silent fallback to `source_classes[]` inference was the original failure vector.                                                                              | P0       | Low    | High   |
| V2  | Rewrite `scripts/validate-build.py::validate_symbols` to call `resolve_requested_symbols`. Emit `symbols.alias_resolved`, `symbols.builtin`, `symbols.truly_missing` buckets in the JSON manifest. Update `validation_passed` to gate on `truly_missing` only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | P0       | Low    | High   |
| V3  | Compute `BUILTIN_BINDING_SYMBOLS` from `BUILTIN_ADDITIONAL_BIND_CODE` (parse via libclang AST — no regex) + consumer `additionalBindCode` blocks (mainBuild + extraBuilds), write to `build/additional-bind-symbols.json` with a v1 schema discriminator. **The producer MUST be a dedicated NX target (`bind-symbols`) that the `link` target depends on** — in-process producer-during-link was the V3 RE-SHIP regression vector (producer ran after consumer). The shell entry (`build-wasm.sh link <yaml>`) mirrors the dep-graph contract for direct invocations. Consumer (`manifest_registry.builtin_binding_symbols`) hard-fails on missing/pre-v1 manifest with a regenerate-pointer error — no silent fall-through to empty frozenset. | P0       | Med    | High   |
| V4  | Fix `validate-build.py:126` path to `build/compiled-bindings/binding-report.json`. Regenerate the link-filter-poc smoke fixture to record the `[INFO] Binding report` section.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | P1       | Low    | Med    |
| V5  | Extend `provenance.py::add_linking` signature with `ncollection_linked`, `ncollection_total`, `ncollection_dropped`; call from `yaml_build.main()` after the filter pass with the in-process counts. Update `nCollectionManifest` schema in `wasm-build-provenance-v1`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | P1       | Low    | High   |
| V6  | Merge `build/any-type-report.json` into `M9.symbols.any_reasons` at validate time so `dts-validation.test.ts:989-1001` becomes load-bearing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | P1       | Low    | Med    |
| V7  | Switch `scripts/generate-docs.mjs:390-413` to consume `provenance.nCollectionManifest.linked` (post-V5) instead of `compiled - requested` arithmetic.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | P1       | Low    | Med    |
| V8  | Write `tests/unit/test_validate_build_manifest_symmetry.py` — same fixtures as `test_verify_bindings_demotes_alias_resolved_to_info` (`tests/unit/test_link_yaml_scope.py:348-422`); assert `validate_symbols(...)` and `verifyBindings(...)` produce matching `alias_resolved`, `builtin`, `truly_missing` sets.                                                                                                                                                                                                                                                                                                                                                                                                                                | P0       | Low    | High   |
| V9  | Write `tests/unit/test_provenance_ncollection_roundtrip.py` — drive `provenance.init/add_linking/finalize` with synthetic counts, assert `M8.nCollectionManifest.{linked,total,dropped}` populated and parseable by `docker-e2e-validate.sh` Phase 6.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | P1       | Low    | Med    |
| V10 | After V1–V8 land, remove `\|\| true` from `build-wasm.sh:805,855` (or gate on `OCJS_STRICT_VALIDATE=0` env var with default `1`). Make `validate-build.py` failures actually fail the link target.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | P0       | Low    | High   |
| V11 | Document the three symbol-resolution classes (explicit YAML / typedef alias / builtin+additionalBindCode / auto-discovered NCollection) in `docs-site/content/docs/toolchain/reference/yaml-schema.mdx`; cross-link from the validator output and `build-manifest.json` consumer-facing docs.                                                                                                                                                                                                                                                                                                                                                                                                                                                    | P1       | Low    | Med    |
| V12 | (Optional) Switch `find_compiled_bindings` to parse `dist/*.js.symbols` (M14) as the post-link ground truth instead of walking `.cpp.o` heuristically. Decouples validation from the build tree, supports cached / cross-machine validation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | P2       | Med    | Low    |
| V13 | (Optional) Migrate `enumerate-symbols.py` to consume M1 + bindgen-filters instead of re-running its own AST walk.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | P2       | Med    | Low    |

### Suggested implementation order

1. **V1 + V2 + V8 + V10** as one PR — closes the load-bearing P0 cluster (false `[FAIL] Symbols` + masking `|| true`). Self-contained, low risk.
2. **V3** as a follow-up — touches `BUILTIN_ADDITIONAL_BIND_CODE` parsing; merits its own review.
3. **V4 + V6** trivial fixes, bundle with either of the above.
4. **V5 + V7 + V9** provenance/docs-site arc — separate PR because it touches `wasm-build-provenance-v1` schema (consumer compat).
5. **V11** docs sweep at the end so the new validator output and JSON schema are documented in one go.
6. **V12 / V13** parking lot — propose, don't block on.

## Test Coverage

Existing tests that already assert manifest-consultation symmetry on the **link** side:

| Test                                                   | What it asserts                                                                                                                          |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/test_link_yaml_scope.py`                   | `_compute_yaml_class_scope` + `referenced_classes` lift; `_filter_auto_symbols_by_scope`; **`verifyBindings` alias demotion** (L348-422) |
| `tests/sentinel/test_link_ncollection_reachability.py` | Real M1 filter drops/keeps; structural `referenced_classes` on `Poly_Triangulation`                                                      |
| `tests/unit/test_strict_types_gate.py`                 | `_enforce_strict_types_gate` / `_count_unknown_tokens`                                                                                   |
| `tests/unit/test_discover_ncollection.py`              | `discover_ncollection_types` + manifest `source_classes`                                                                                 |
| `tests/sentinel/test_link_filter_poc_yaml.py`          | YAML scope parity vs full_multi                                                                                                          |
| `tests/sentinel/test_dist_parity.py`                   | Byte hash includes `build-manifest.json` (not semantic correctness)                                                                      |
| `tests/dts-validation.test.ts`                         | DTS quality; **`any_reasons` in M9** (weak — skips if missing)                                                                           |
| `tests/bindgen-output-shape.test.ts`                   | Generated `.cpp` / `.d.ts` shape                                                                                                         |
| `tests/yaml-schema-doc-parity.test.ts`                 | Cerberus schema vs docs only                                                                                                             |

Missing — required by recommendations above:

| Proposed test                                          | Recommendation |
| ------------------------------------------------------ | -------------- |
| `tests/unit/test_validate_build_manifest_symmetry.py`  | V8             |
| `tests/unit/test_provenance_ncollection_roundtrip.py`  | V9             |
| `tests/unit/test_builtin_binding_symbols_exemption.py` | V3             |
| `tests/unit/test_binding_report_path.py`               | V4             |
| `tests/unit/test_any_reasons_merge.py`                 | V6             |

## Schema mis-specification post-mortem

The V1–V11 initial implementation cleared most P0/P1 items but introduced two schema-correctness regressions that the native NX validation pass (Phase 9) surfaced as `RuntimeError: verifyBindings: 10 unresolved symbol(s)`. Both were fixed in the [v1-v3 schema-correctness re-ship plan](/Users/rifont/.cursor/plans/v1-v3_schema-correctness_re-ship_5b9f8791.plan.md); recording them here so future PRs touching the manifest layer don't re-discover them.

### V1 — `source_classes` confused with the alias map

**Symptom.** Every NCollection typedef alias (`TColgp_Array1OfPnt`, `TopTools_ListOfShape`, …) bucketed into `truly_missing` even on a fully-built tree where the canonical `.cpp.o` (`NCollection_Array1_gp_Pnt.cpp.o`, …) existed.

**Root cause.** The V1 audit conflated two distinct things:

1. `_build_typedef_alias_map(tuInfo)` — the in-memory `{alias_name: underlying_spelling}` lookup `discover.py` uses internally for de-dup. Lives only in process memory; never serialised.
2. `declarations[*].source_classes` — the **reachability tag** consumed by `_filter_auto_symbols_by_scope` to intersect the discovered NCollection set against the consumer YAML's reachable class scope. It lists the bound classes whose method signatures _referenced_ the NCollection, NOT the typedef aliases the linker would substitute.

The audit's V1 spec told the consumer to invert `source_classes` as if it were `{alias: canonical}`. It isn't. Empirically, zero of the 10 failing typedef aliases appear in any `source_classes[]` across the 596 declarations in a real build.

**Fix.** Producer-side serialisation: `discover.py::write_manifest` now calls `_serialise_template_typedef_aliases(tuInfo, discovered)` and stamps the result as a first-class `template_typedefs` field, alongside a `schema: "ncollection-manifest-v2"` discriminator. Consumer-side: `manifest_registry.load_ncollection_alias_index` reads `template_typedefs` directly and hard-fails on pre-v2 schema. Documented in §Section A row M1.

### V3 — producer-after-consumer bootstrap ordering

**Symptom.** Same `RuntimeError: verifyBindings: 10 unresolved symbol(s)` on a fresh tree, this time because `manifest_registry.builtin_binding_symbols` fell through to "manifest absent ⇒ empty frozenset" silently — `additional-bind-symbols.json` didn't exist when the consumer ran.

**Root cause.** The V3 audit specified an in-process producer inside `yaml_build.runBuild::getAdditionalBindCodeO()`. That function is called _after_ `verifyBindings` in `runBuild`'s main flow — the consumer ran before the producer wrote the manifest on every link.

**Fix.** Hoist the producer into a dedicated `ocjs_bindgen.bind_symbols` NX target with `link.dependsOn = [..., "bind-symbols"]`. NX dep-graph guarantees the producer runs first; the shell entry (`build-wasm.sh link <yaml>`) mirrors the contract for direct invocations. Consumer now hard-fails (no silent fall-through) so any future ordering regression surfaces immediately. Documented in §Section D row V3 and the §Recommendations table.

### General lesson

When the audit describes a manifest schema, **always cross-check the actual writer's `json.dump(...)` call against the field names the consumer reads**. The V1 mis-spec was a documentation gap that propagated through the implementation; pinning schemas with discriminator strings + producer-emitted test fixtures (Phase D1+D2) makes such drift surface as test failures rather than runtime gaps.

## Implementation Status

Tracked by [`/Users/rifont/.cursor/plans/v1-v3_schema-correctness_re-ship_5b9f8791.plan.md`](/Users/rifont/.cursor/plans/v1-v3_schema-correctness_re-ship_5b9f8791.plan.md) (originally [`validation-manifest-consultation-v1-v11_7e6998bd.plan.md`](/Users/rifont/.cursor/plans/validation-manifest-consultation-v1-v11_7e6998bd.plan.md), superseded by the re-ship after Phase 9 surfaced the schema mis-specifications above).

| #   | Recommendation                                                                                                                                                                                                                                                                                       | Status                                                                                                                                                  | Landed in                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1  | Shared `ocjs_bindgen.link.manifest_registry` module (loaders + `resolve_requested_symbols`) — **v2 RE-SHIP**: alias loader now reads producer-serialised `template_typedefs`, hard-fails on pre-v2 schema                                                                                            | **RE-SHIPPED (schema v2)**                                                                                                                              | `src/ocjs_bindgen/link/manifest_registry.py::load_ncollection_alias_index`, `src/ocjs_bindgen/discover.py::_serialise_template_typedef_aliases` + `write_manifest(tuInfo=…)`, `src/ocjs_bindgen/pipeline/generate.py` (tuInfo plumbing), `tests/unit/test_manifest_registry.py`, `tests/unit/test_discover_template_typedef_serialisation.py`                                                                          |
| V2  | Rewrite `validate-build.py::validate_symbols` to consume registry; emit `alias_resolved` / `builtin` / `truly_missing` buckets                                                                                                                                                                       | **SHIPPED**                                                                                                                                             | `scripts/validate-build.py` (manifest schema bumped to `build-manifest-v2`)                                                                                                                                                                                                                                                                                                                                            |
| V3  | Producer-side `build/additional-bind-symbols.json` from libclang AST (no regex) — **RE-SHIP**: producer hoisted into dedicated `bind-symbols` NX stage to enforce producer-before-consumer ordering via dep graph (in-process producer ran after consumer pre-RE-SHIP)                               | **RE-SHIPPED (NX stage)**                                                                                                                               | `src/ocjs_bindgen/bind_symbols/__init__.py` + `__main__.py`, `src/ocjs_bindgen/embind_builtins.py` (BUILTIN moved here), `build-wasm.sh::step_bind_symbols`, `project.json::bind-symbols` target, `nx.json::bindSymbolsScript` namedInput, `tests/unit/test_bind_symbols_module.py`, `tests/sentinel/test_bind_symbols_target_runs_before_link.py`, `tests/sentinel/test_docker_entrypoint_dispatches_bind_symbols.py` |
| V4  | Fix `validate-build.py` binding-report path → `build/compiled-bindings/binding-report.json`                                                                                                                                                                                                          | **SHIPPED**                                                                                                                                             | `scripts/validate-build.py::validate_binding_report`                                                                                                                                                                                                                                                                                                                                                                   |
| V5  | Extend `provenance.add_linking` with `ncollection_linked/total/dropped` (schema `wasm-build-provenance-v1.1`); wire from `yaml_build.main`                                                                                                                                                           | **SHIPPED**                                                                                                                                             | `src/provenance.py`, `src/ocjs_bindgen/link/yaml_build.py::_ncollection_link_stats`                                                                                                                                                                                                                                                                                                                                    |
| V6  | Merge `build/any-type-report.json` into `build-manifest.symbols.any_reasons`                                                                                                                                                                                                                         | **SHIPPED**                                                                                                                                             | `scripts/validate-build.py::merge_any_reasons`                                                                                                                                                                                                                                                                                                                                                                         |
| V7  | `generate-docs.mjs` consumes `provenance.nCollectionManifest.linked`; HARD-FAIL when sidecar missing                                                                                                                                                                                                 | **SHIPPED**                                                                                                                                             | `scripts/generate-docs.mjs`                                                                                                                                                                                                                                                                                                                                                                                            |
| V8  | `validate_symbols ↔ verifyBindings` parity symmetry test                                                                                                                                                                                                                                             | **SHIPPED**                                                                                                                                             | `tests/unit/test_validate_build_manifest_symmetry.py`                                                                                                                                                                                                                                                                                                                                                                  |
| V9  | provenance `nCollectionManifest` round-trip test + docker-e2e snippet replay                                                                                                                                                                                                                         | **SHIPPED**                                                                                                                                             | `tests/unit/test_provenance_ncollection_roundtrip.py`                                                                                                                                                                                                                                                                                                                                                                  |
| V10 | Remove `\|\| true` from `build-wasm.sh`; remove `OCJS_STRICT_VERIFY` env-var gate from `verifyBindings`                                                                                                                                                                                              | **SHIPPED**                                                                                                                                             | `build-wasm.sh`, `src/ocjs_bindgen/link/yaml_build.py::verifyBindings`, `scripts/docker-e2e-validate.sh`                                                                                                                                                                                                                                                                                                               |
| V11 | "Symbol resolution classes" + "Producer-side manifest contract" doc subsections                                                                                                                                                                                                                      | **SHIPPED**                                                                                                                                             | `docs/reference/yaml-schema.md`, `docs-site/content/docs/toolchain/reference/yaml-schema.mdx`, `tests/yaml-schema-doc-parity.test.ts`                                                                                                                                                                                                                                                                                  |
| V12 | `.js.symbols` ground-truth migration                                                                                                                                                                                                                                                                 | **DEFERRED** (no current correctness gap; defensive enhancement only — no scenario requires dead-strip detection or pre-built-tarball validation today) | —                                                                                                                                                                                                                                                                                                                                                                                                                      |
| V13 | `enumerate-symbols.py` consolidation — reclaimed from prior deferral once it became clear the script's docstring [self-documents the same split-brain pattern V1–V11 was created to fix](https://github.com/cursor-internal/tau/blob/main/repos/opencascade.js/scripts/enumerate-symbols.py#L85-L98) | **RECLAIMED — SHIPPED in Phase F**                                                                                                                      | `src/ocjs_bindgen/enumeration/` (shared module + dedup pass), `scripts/enumerate-symbols.py` (thinned to CLI), `tests/sentinel/test_enumeration_matches_discover.py`, `build-configs/full.yml` (regenerated baseline)                                                                                                                                                                                                  |

Phase 9 native NX integration sentinel lives at `scripts/assert-replicad-validation.sh` + `tests/sentinel/test_replicad_native_validation.py`; both gate on the presence of `dist/replicad_single.*` (skip cleanly when the build hasn't been run, fail loudly when assertions don't hold).

## References

- [`docs/research/ocjs-replicad-multi-link-warning-audit.md`](./ocjs-replicad-multi-link-warning-audit.md) — R1–R12 plan that surfaced the gap during R4 implementation
- [`docs/research/ocjs-ncollection-auto-discovery-build-validation.md`](./ocjs-ncollection-auto-discovery-build-validation.md) — original NCollection auto-discovery validation (the producer side of M1)
- [`docs/research/ocjs-rbv-build-manifest-regressions.md`](./ocjs-rbv-build-manifest-regressions.md) — prior `build-manifest.json` regression analysis
- `repos/opencascade.js/BUILD_SYSTEM.md` L85-133 — canonical description of `discover.py` → M1 → link-filter contract
- `repos/opencascade.js/smoke-output/opencascade_linkfilter_poc.build-manifest.json` — shipped fixture demonstrating C2 false positive empirically
- `repos/opencascade.js/scripts/docker-e2e-validate.sh` L193-210 — consumer of the missing `nCollectionManifest` provenance field

## Appendix

### Entry-point summary: who reads `bindings:` from YAML?

| Entry point                                       | Manifest consultation                                        |
| ------------------------------------------------- | ------------------------------------------------------------ |
| `yaml_build.verifyBindings`                       | ✅ M1 aliases; ❌ builtins (WARN only)                       |
| `yaml_build.main` → link filter                   | ✅ M1 + M2 scope                                             |
| `yaml_build._enforce_strict_types_gate`           | ✅ in-process diagnostics + scope indirectly                 |
| **`scripts/validate-build.py`**                   | ❌ aliases, builtins, scope, binding-report path             |
| `provenance.py`                                   | YAML symbol list in `add_linking` only; ❌ NCollection stats |
| `customBuildSchema.py` / `build-wasm.sh validate` | Cerberus shape only — appropriate                            |
| `enumerate-symbols.py`                            | Independent AST enumeration (drift risk)                     |
| Sentinel / unit tests                             | Link path covered; **validate path not**                     |

### Why this is a class of bug, not a one-off

The bindgen pipeline has three resolution mechanisms that turn YAML-requested symbols into linked code:

1. **Direct compilation** — `build/bindings/X.cpp` → `build/compiled-bindings/X.cpp.o`. Trivial to verify post-link.
2. **NCollection typedef alias** — YAML names `TColgp_Array1OfPnt`; canonical mangled compilation is `NCollection_Array1_gp_Pnt`; mapping lives in M1.
3. **Builtin / additionalBindCode** — Embind registration in C++ block; no per-symbol `.cpp.o`; symbol "exists" only in the linked WASM exports table.

`verifyBindings` knows about all three. `validate-build.py` only knows about (1). Every post-link consumer (smoke scripts, docs site, downstream npm consumers reading the sidecar manifest) inherits the (2)+(3) blind spots.

Generalising: **any future symbol-resolution mechanism added to the link layer must also extend the post-link validator(s).** A canonical `manifest_registry` (V1) makes this contract enforceable — adding a new resolution class becomes one new helper in the registry plus updating its consumers, rather than fragmented re-implementation across N scripts.

### Out of scope

- Source-level fixes to OCJS bindgen itself (covered by [`ocjs-bindgen-libembind-outstanding-issues-catalog.md`](./ocjs-bindgen-libembind-outstanding-issues-catalog.md) and the [`ocjs-bindgen-modular-refactor-blueprint.md`](./ocjs-bindgen-modular-refactor-blueprint.md)).
- Runtime kernel correctness in `packages/runtime/src/kernels/replicad/` (no manifest dependency).
- Cerberus schema vs docs parity (`tests/yaml-schema-doc-parity.test.ts` already covers this; orthogonal to symbol validation).
- Build cache invalidation correctness (`generator-hash`, `.docs-hash`, `.cmake-lib-dir` stamps — distinct concern, already correctly wired).
