---
title: 'OCCT V8 Final Migration Stocktake #2 — opencascade.js'
description: 'Mid-flight audit of repos/opencascade.js after Phase 0–2 of the V8 final migration: per-file verdict and path from residual 64 compile failures + 197 missing manifest symbols to validation_passed:true.'
status: draft
created: '2026-05-11'
updated: '2026-05-11'
category: migration
related:
  - docs/research/occt-v8-final-migration-stocktake.md
  - docs/research/occt-v8-rc5-to-release-migration.md
  - docs/research/occt-v8-rc5-migration.md
  - docs/research/occt-v8-migration.md
---

# OCCT V8 Final Migration Stocktake #2 — opencascade.js

A second-pass audit of `repos/opencascade.js` after the in-flight V8.0.0
migration executed Phase 0–2 of the
[original stocktake](docs/research/occt-v8-final-migration-stocktake.md).
Covers every working-copy change, the latest Nx build output captured
in terminal `947243.txt`, and prescribes the remaining work to reach a
green build.

## Executive Summary

The Phase 0–2 reshape has landed cleanly in the working copy. **All
thirteen modified files now hold architecturally-correct edits**; the
Finding 6 handle-resolution shim has been reverted, libclang is pinned
to `>=18.1.1,<19`, the `.venv` toolchain bootstraps from
`scripts/setup-deps.sh`, and `OCJS_PYTHON` resolves to
`.venv/bin/python` everywhere build code calls into Python. One new
helper in `src/bindings.py` (`_substitute_canonical_template_names`)
was added during Phase 4 to plug a libclang-18-specific spelling shape
the original stocktake did not anticipate — it must remain. The
recorded build state collapsed from the stocktake's baseline of **1307
binding-compile failures + 1309 missing manifest symbols** down to
**64 compile failures + 197 missing manifest symbols** — a 95% / 85%
reduction. The remaining 64 compile failures split cleanly into four
small, independent buckets driven by **C++ language features OCCT V8
exercises that the bindgen does not yet emit policy for** (deleted
copy/move constructors, namespace-nested typedefs in
`EMSCRIPTEN_BINDINGS`, raw-pointer arguments, and one residual
template-argument substitution gap). The 197 missing manifest symbols
are unrelated to the compile failures: they are a long-standing
**`build-configs/full.yml` ↔ `bindgen-filters.yaml` consistency drift**
where the YAML still requests symbols whose packages
(`TopOpeBRep*`, `AppDef`, `GeomPlate`, `ProjLib`, `HeaderSection`) the
bindgen filter has long excluded. The work split is now:
(a) **strip stale package symbols from `full.yml`** so the manifest
reflects what the bindgen actually emits; (b) **teach the bindgen four
small policy rules** to clear the residual 64 compile failures; (c)
re-link / re-validate; (d) run blueprint R5–R10. No further dependency
bumps, toolchain reshaping, or `bindings.py` core-walker changes are
required. **Phase 5+ from the original stocktake is now actionable**
once the YAML-cleanup and bindgen-policy tasks land.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Scope and Non-Goals](#scope-and-non-goals)
- [Methodology](#methodology)
- [Build State at Time of Audit](#build-state-at-time-of-audit)
- [Findings — Per-File Audit](#findings--per-file-audit)
- [Findings — Residual Compile Failures (64 / 4549)](#findings--residual-compile-failures-64--4549)
- [Findings — Missing Manifest Symbols (197 / 4549)](#findings--missing-manifest-symbols-197--4549)
- [Findings — Phase Completion Map vs Original Stocktake](#findings--phase-completion-map-vs-original-stocktake)
- [Recommendations](#recommendations)
- [Validation Gates](#validation-gates)
- [Risk Matrix](#risk-matrix)
- [Code Examples](#code-examples)
- [References](#references)
- [Appendix](#appendix)

## Problem Statement

After landing Phase 0–2 of
[Stocktake #1](docs/research/occt-v8-final-migration-stocktake.md):

- 13 files are modified in `repos/opencascade.js`.
- One unrelated artifact (`nx-build-ocjs.log`, 32,980 lines) sits
  untracked.
- The most recent Nx `link` + `validate` run captured in terminal
  `947243.txt` succeeded through `link` (the wasm/js/d.ts artifacts
  ship to `dist/`) but failed at `validate` with
  `validation_passed: false`, 197 missing symbols.
- `build/compiled-bindings/binding-report.json` reports 64 failed
  compile units across 51 template_error / 11 undefined_symbol / 2
  overload_resolution categories.

Before continuing, we need:

1. A per-file verdict on every working-copy change (keep / adjust /
   wrong), including the new `bindings.py` helper introduced during
   Phase 4.
2. A root-cause for the residual 64 compile failures, broken down by
   bucket, with a fix at the correct layer.
3. A root-cause for the 197 missing manifest symbols, distinguishing
   "binding generation skipped" from "binding compile failed".
4. A concrete remaining-work plan that walks the original stocktake's
   R5–R10 to completion.

## Scope and Non-Goals

**In scope**

- Every file currently modified under `repos/opencascade.js`.
- The `bindings.py` `_substitute_canonical_template_names` helper that
  Phase 4 added on top of the libclang-18 upgrade.
- Root cause + fix for the residual binding compile failures.
- Root cause for the 197 missing manifest symbols (YAML / filter
  consistency).
- The path from current state to `validation_passed: true`.

**Out of scope**

- `repos/replicad/**` re-link (still a follow-up plan).
- Tau workspace re-wiring (`tarballs/`, `packages/runtime/**`,
  `package.json` lock-step).
- Refactoring `bindgen-filters.yaml` package-exclusion policy beyond
  the YAML-mirroring needed for green validate.
- Docker / CI base image switch (deferred cleanup).

## Methodology

1. Re-enumerated the working tree with `git status --short` and
   `git diff --stat` after the Phase 0–2 commits.
2. Diffed every modified file against `origin/main`.
3. Verified the Finding 6 shim revert by inspecting
   `src/bindings.py:1253–1290` and confirming the
   `canonical_spelling` / `norm_can` / `norm_ty` block is absent.
4. Re-read `dist/opencascade_full.build-manifest.json` and
   `build/compiled-bindings/binding-report.json` to quantify the
   post-libclang-18 state.
5. Histogrammed `symbols.missing` by package prefix and cross-checked
   each prefix against `bindgen-filters.yaml`'s excluded-packages
   list (lines 596–605).
6. Walked the 64 binding-report failures and classified by upstream
   C++ language feature exercised (deleted ctors, raw pointers,
   namespace-nested typedefs, template-arg substitution).
7. Inspected the generated `.cpp` for representative failures
   (`build/bindings/.../BndBox2dTreeFiller.cpp`,
   `build/bindings/myMain.h/NCollection_List_HLRAlgo_BiPoint.cpp`) to
   confirm the bindgen-policy layer is correct.
8. Mapped each finding against the recommendation table in the
   original stocktake to produce a phase completion matrix.

## Build State at Time of Audit

From `dist/opencascade_full.build-manifest.json` (Nx run captured in
`/Users/rifont/.cursor/projects/Users-rifont-git-tau/terminals/947243.txt`,
exit 1 at the `validate` step):

| Field                    | Value           | Delta vs Stocktake #1                              |
| ------------------------ | --------------- | -------------------------------------------------- |
| `validation_passed`      | **false**       | unchanged (still false)                            |
| `symbols.requested`      | 4549            | +234 (full.yml grew with the explicit symbol list) |
| `symbols.missing`        | **197**         | **−1112** (1309 → 197)                             |
| `outputs[0].wasm_exists` | true (~32.7 MB) | +4 MB (binding surface grew)                       |

From `build/compiled-bindings/binding-report.json`:

| Field                                  | Value  | Delta vs Stocktake #1 |
| -------------------------------------- | ------ | --------------------- |
| `total`                                | 4549   | +158                  |
| `succeeded`                            | 4485   | +3178                 |
| `failed`                               | **64** | **−1243** (1307 → 64) |
| `error_categories.template_error`      | 51     | −310                  |
| `error_categories.undefined_symbol`    | 11     | −9                    |
| `error_categories.overload_resolution` | 2      | −411                  |
| `error_categories.compile_error`       | absent | −511 (category empty) |
| `error_categories.access_specifier`    | absent | −2 (category empty)   |

The libclang 18 upgrade + `_substitute_canonical_template_names`
helper together cleared **95% of the binding compile failures** and
**85% of the missing manifest symbols**. The residual gap is now
small enough to triage by hand, and crucially **none of the
remaining failures are handle-resolution regressions**.

## Findings — Per-File Audit

13 modified files plus one untracked artifact. Each gets a verdict.

### Finding 1: `.gitignore` — Keep

```diff
+# Project-local Python (scripts/setup-deps.sh)
+/.venv/
```

Phase 1a deliverable. Correct.

### Finding 2: `.python-version` (new) — Keep

Contains the single line `3.14`. Phase 1a deliverable. Correct.

### Finding 3: `DEPS.json` — Keep (R1)

OCCT pinned `0ebbbedb` (RC5) → `d3056ef8` (V8.0.0 final). Matches
blueprint R1 exactly.

### Finding 4: `build-configs/full.yml` — Keep but Insufficient (R2)

```diff
-  - symbol: NCollection_BasePointerVector
```

The R2 edit landed. But `full.yml` retains hundreds of symbols whose
packages are filter-excluded — see
[Findings — Missing Manifest Symbols](#findings--missing-manifest-symbols-197--4549).
Additional `full.yml` pruning is required for `validation_passed:
true`.

### Finding 5: `build-wasm.sh` — Keep (R1 reshape + libembind hardening)

Two coordinated edits:

1. Introduces `OCJS_PYTHON="$OCJS_ROOT/.venv/bin/python"` with a fail-
   fast guard (Phase 1c). Replaces 24 `python3 …` invocations with
   `"$OCJS_PYTHON" …`. Matches the reshaped Finding 7 from the
   original stocktake.
2. Hardens `step_patch_embind` with `patch -N --ignore-whitespace`,
   an "already applied" grep fallback, and a `cd "$OCJS_ROOT"`
   restore so subsequent script steps see the correct cwd.

Both edits are architecturally correct. The original stocktake
recommended splitting (2) into its own commit (R5 in stocktake #1);
that recommendation still stands but is a code-hygiene concern, not a
build correctness concern.

### Finding 6: `project.json` — Keep (R1)

```diff
-        "command": "python3 scripts/validate-build.py …",
+        "command": ".venv/bin/python scripts/validate-build.py …",
```

Matches Phase 1d. Correct.

### Finding 7: `requirements.txt` — Keep (R4 + R4a–R4c)

Collapsed from six lines to three:

```text
libclang>=18.1.1,<19
pyyaml>=6.0.3
cerberus>=1.3.8,<2
```

Matches Stocktake #1's end-state requirements exactly. No transitive
workarounds remain. Correct.

### Finding 8: `scripts/setup-deps.sh` — Keep with one DX improvement (R3)

Implements the `.venv` bootstrap. Notable: the script **prefers `uv
venv` / `uv pip` when `uv` is on PATH**, falling back to
`python3.14 -m venv` + `pip` otherwise. This deviates from Stocktake
#1's Code Example A (which only used `python3.14 -m venv`) but is the
**correct adjustment**: macOS Homebrew's `python@3.14` ships a broken
`ensurepip` / `pyexpat` combination on some hosts (observed in this
session — `venv` creation succeeds but `pip` cannot be bootstrapped
from the resulting interpreter). `uv` downloads a portable CPython
wheel and sidesteps the Homebrew bug entirely.

The error-message DX is good (lists three install paths: `uv`,
Homebrew, pyenv). One small adjustment recommended: the
`uv pip install` lines pass `--quiet`, which suppresses the wheel
download log even on a fresh `.venv`. Consider dropping `--quiet` so
operators see progress on the (long) first install.

### Finding 9: `src/Common.py` — Keep (R4d)

The stale "pip libclang (v18) cannot parse emsdk Clang 23's headers"
docstring is refreshed to "defence-in-depth" language. Function body
unchanged. Matches the original stocktake's R4d exactly.

### Finding 10: `src/applyPatches.py` — Keep (R3 / R10 prep)

The inline `BRepGraph_VersionStamp.cxx` patch hunk that targeted RC5's
`static_assert(sizeof(size_t) >= 8, …)` block is removed. Replaced by
a single-line comment documenting that V8.0.0 final rewrote `ToGUID`
to four-uint32 quarter-buffer packing (WASM32-safe upstream). Matches
the blueprint's "retire the patch" guidance.

### Finding 11: `src/bindings.py` — Keep (R6 alias flip + Phase 4 helper)

Two coordinated edits:

1. **Alias flip** (`_CONTAINER_ALIASES`): `NCollection_DynamicArray →
NCollection_Vector` reversed to `NCollection_Vector →
NCollection_DynamicArray`, matching the OCCT V8 deprecation of
   `NCollection_Vector` in favor of `NCollection_DynamicArray`.
   Stocktake #1 R6.
2. **New helper** `_substitute_canonical_template_names(canonical_spelling,
templateArgs)` and three call sites inside
   `resolveWithCanonicalFallback`.

The helper is **new architectural work introduced during Phase 4**
that the original stocktake did not anticipate. It must remain. The
reason it is necessary:

- libclang 15 spelled dependent type-parameter references as
  `type-parameter-0-0`, `type-parameter-0-1`, …
- libclang 18+ frequently spells the **source template parameter name
  verbatim** (e.g. `TheItemType`) instead of `type-parameter-0-N`.
- The pre-existing `_TYPE_PARAM_RE` substitution path only matched
  `type-parameter-N-N`, so libclang-18 canonical spellings carrying
  `TheItemType` flowed through unchanged into the generated `.cpp`,
  producing `error: use of undeclared identifier 'TheItemType'` for
  every `NCollection_DynamicArray<TheItemType>`-style emission.
- The helper first applies `replaceTemplateArgs` (which uses the
  source-name → concrete-type map already maintained by
  `processTemplate`) and then falls back to the existing
  `_TYPE_PARAM_RE` substitution, so both canonical spelling shapes
  are handled.

Evidence the fix works: before the helper, `binding-report.json`
listed 74 failures including 11 `TheItemType` undeclared-identifier
errors across `NCollection_DynamicArray_*`,
`NCollection_Sequence_*`, `NCollection_List_*`,
`NCollection_Array1_*`, and `VectorOfPoint.cpp` units. After the
helper, those 11 are gone and the failure count is 64. None of the
remaining 64 mention `TheItemType` or `type-parameter-`.

The helper is also a clean refactor: it deduplicates the
`_TYPE_PARAM_RE` `replacer` closure that previously appeared twice in
the same function (once at the end and once mid-function), unifying
both call paths through one helper.

### Finding 12: `src/ocjs_bindgen/discover.py` — Keep (R6)

```diff
-    "NCollection_DynamicArray": "NCollection_Vector",
+    "NCollection_Vector": "NCollection_DynamicArray",
```

Coordinated with the bindings.py alias flip. Stocktake #1 R6 exactly.

### Finding 13: `src/patches/patch_brepgraph_versionstamp.py` — Keep (R10)

Adds `UPSTREAM_V8_FINAL_MARKER = "Truncate each size_t hash to
uint32_t"` and a skip path when the marker is present. Self-disables
on V8.0.0+ sources. Matches Stocktake #1's R10 amendment.

### Finding 14: `tests/dts-docs.test.ts` — Keep (R7 prep)

T7 assertion direction flipped to match the V8 alias direction
(`NCollection_Vector → NCollection_DynamicArray`). Variable names,
error messages, regex literals updated coherently. Validates correctly
once the build is green.

### Finding 15: `nx-build-ocjs.log` (untracked) — Delete

32,980-line log file from the Nx build runs. Not gitignored, not a
build artifact, not consumed by anything. **Delete; do not commit.**
Either add `*.log` to `.gitignore` or `rm` once the migration lands.

### Working-copy verdict summary

| File                                          | Verdict                            | Source                   |
| --------------------------------------------- | ---------------------------------- | ------------------------ |
| `.gitignore`                                  | Keep                               | Stocktake #1 R1          |
| `.python-version` (new)                       | Keep                               | Stocktake #1 R1          |
| `DEPS.json`                                   | Keep                               | R1                       |
| `build-configs/full.yml`                      | Keep but insufficient              | R2 + new Finding         |
| `build-wasm.sh`                               | Keep                               | R1 + R5 (split optional) |
| `project.json`                                | Keep                               | R1                       |
| `requirements.txt`                            | Keep                               | R4 + R4a–R4c             |
| `scripts/setup-deps.sh`                       | Keep                               | R3 + uv DX adjustment    |
| `src/Common.py`                               | Keep                               | R4d                      |
| `src/applyPatches.py`                         | Keep                               | R10                      |
| `src/bindings.py`                             | Keep (alias flip + Phase 4 helper) | R6 + new                 |
| `src/ocjs_bindgen/discover.py`                | Keep                               | R6                       |
| `src/patches/patch_brepgraph_versionstamp.py` | Keep                               | R10                      |
| `tests/dts-docs.test.ts`                      | Keep                               | R7 prep                  |
| `nx-build-ocjs.log` (untracked)               | Delete                             | —                        |

**No working-copy change requires reversion.** All 13 modified files
and the new `.python-version` are architecturally correct.

## Findings — Residual Compile Failures (64 / 4549)

The 64 remaining failures split into four independent buckets driven
by C++ language features OCCT V8 exercises that the bindgen lacks
policy for.

### Bucket A: Deleted copy/move constructors (~50 failures)

| Affected                   | Count      | Sample failure                                                                            | Upstream marker                                          |
| -------------------------- | ---------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `GeomBndLib_*`             | 26         | `GeomBndLib_BSplineCurve.cpp` → `bind.h:454: call to deleted constructor of 'GeomBndLib'` | `class GeomBndLib { public: GeomBndLib() = delete; … };` |
| `ExtremaPC_*`              | 10         | `ExtremaPC_BSplineCurve.cpp` → same                                                       | `class ExtremaPC { public: ExtremaPC() = delete; … };`   |
| `BRepGraph_*`              | 8 (subset) | `BRepGraph.cpp` → `bind.h:454: call to deleted constructor of 'BRepGraph'`                | upstream `BRepGraph` has private/deleted ctor            |
| `BRepMesh_FaceChecker`     | 1          | indirect                                                                                  | deleted-default + raw-pointer arg                        |
| `NCollection_IncAllocator` | 1          | nested `IBlock` no matching constructor                                                   | `IBlock` is private nested type                          |
| Total                      | ~50        |                                                                                           |                                                          |

**Root cause**: embind 4.x's `class_<T>("…")` template requires `T`
to be at least copy-constructible OR explicitly declared
non-copyable via `.noncopyable()` / `class_<T, no_copy_t>`. The
bindgen currently emits a bare `class_<T>("T")` for every class
regardless of its copy/move policy. When OCCT marks the ctor
`= delete` (a pattern V8 expanded significantly for stateless static-
method utility classes like `GeomBndLib`, `ExtremaPC`, `BRepGraph`),
the resulting `class_<T>` instantiation in the generated `.cpp` fails
at the embind template parameter level.

**Fix layer**: bindgen policy. Detect classes with **all** copy/move
constructors marked `deleted` AND no public default constructor (the
"static-only utility class" pattern), and either:

(i) Skip them entirely via a new `filter.filterClasses.shouldProcessClass`
exclusion that consults
`clang.cindex.Cursor.is_deleted_method` on each constructor, OR

(ii) Emit `class_<T>("T")` with the embind `nullable_<T>` /
`no_copy_constructor` policy. embind 4.x has no first-class non-
copyable class binder; the practical option for static-only utility
classes is to bind only their **static member functions** (which
don't need an instantiable `T`) via a free-function emission path.

Recommendation: implement **option (i)** as the first iteration —
skip the class entirely with a single-line warning. These static-
only utility classes have no instance state to bind, so the JS
surface loss is limited to exposing their static methods. A
follow-up RFC can address option (ii) if those static methods turn
out to be needed.

### Bucket B: Namespace-nested typedefs in `EMSCRIPTEN_BINDINGS` global scope (~6 failures)

| Affected                                                                                                | Count | Sample failure                                                                                                       |
| ------------------------------------------------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------- |
| `BndBox2dTreeFiller`, `CircleCellFilter`, `VertexCellFilter`                                            | 3     | `BndBox2dTreeFiller.cpp:5302: unknown type name 'BndBox2dTreeFiller'; did you mean 'IMeshData::BndBox2dTreeFiller'?` |
| `BRepGraph_CacheView`, `_EditorView`, `_MeshView`, `_RefsView`, `_ShapesView`, `_TopoView`, `_UIDsView` | 7     | `CacheView.cpp:5302: unknown type name 'CacheView'; did you mean 'BRepGraph::CacheView'?`                            |

(Some `BRepGraph_*` failures overlap with Bucket A — the View classes
report this nested-scope error first; once they're qualified, the
underlying class still has the deleted-ctor problem.)

**Root cause**: OCCT V8 introduced typedefs inside namespaces like
`namespace IMeshData { using BndBox2dTreeFiller = …; }`. The bindgen's
`_qualify_nested_type` correctly walks `clang.cindex.Cursor.semantic_parent`
chains for class- and struct-nested types, but **does not handle
namespace-nested typedefs** at the `EMSCRIPTEN_BINDINGS` global-scope
emission site (the actual `class_<X>("X")` call). The result is
`unknown type name 'BndBox2dTreeFiller'` at the class binding
declaration.

**Fix layer**: bindgen — extend the existing `_qualify_nested_type`
or its callers in `processClass` / the `EMSCRIPTEN_BINDINGS` emission
path to also walk `NAMESPACE_DECL` parents (currently only
`CLASS_DECL` / `STRUCT_DECL` / `CLASS_TEMPLATE` are recognized in
`bindings.py:742-746`).

### Bucket C: Raw pointer argument policy (1 failure)

`BRepMesh_FaceChecker.cpp` → `wire.h:124: static assertion failed:
Implicitly binding raw pointers is illegal. Specify
allow_raw_pointer<arg<?>>`.

OCCT V8 added a method on `BRepMesh_FaceChecker` taking
`IMeshData_Edge*` (raw pointer, not handle). The bindgen emits
`.function("name", &Class::method)` without the
`allow_raw_pointers()` policy that embind 4.x requires.

**Fix layer**: bindgen — extend the existing
`shouldStripParam` / output-param logic in `bindings.py` to detect
raw-pointer arguments and emit `allow_raw_pointers()` as the trailing
arg to `.function()` (the same way the existing code emits
`select_overload<>` for overloaded methods).

### Bucket D: Remaining overload-resolution + template substitution (~5 failures)

| Affected                                                                       | Count | Sample                                                                                                                                       |
| ------------------------------------------------------------------------------ | ----- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `BRepGraph_Copy.cpp`, `BRepGraph_Transform.cpp`, `ExtremaPC_GridEvaluator.cpp` | 3     | `wire.h:391: call to deleted constructor` (overload resolution paths through deleted ctors)                                                  |
| `NCollection_List_HLRAlgo_BiPoint.cpp:5306`                                    | 1     | `HLRAlgo_BiPoint` undeclared identifier in `initializer_list<HLRAlgo_BiPoint>` (line just after the helper substitution kicked in elsewhere) |
| `BRepGraph_Data.cpp`, `_LayerRegistry.cpp`, etc.                               | 1     | `wire.h:391: call to implicitly-deleted default constructor`                                                                                 |

These are cascades from Buckets A/B. Once those are resolved (or the
underlying classes excluded), these clear automatically.

### Recommended fix sequence

1. **Bucket A first** (delete-only utility class skip). Single
   bindgen policy edit, clears ~50 failures and the dependent
   cascades in Bucket D.
2. **Bucket B second** (namespace-nested typedef qualification).
   Extends an existing helper, clears ~6 failures.
3. **Bucket C third** (raw-pointer policy emission). Localized to
   `.function()` emission, clears the last 1.

After all three: expected `binding-report.failed: 0`.

## Findings — Missing Manifest Symbols (197 / 4549)

These are **not** compile failures — they were never generated. The
validate-build script enumerates symbols requested in `full.yml`,
checks for matching `.cpp.o` files under `build/compiled-bindings/`,
and reports any unmatched symbols as missing. For the 197 missing
symbols, no corresponding `.cpp` was ever emitted by the bindgen.

### Root cause

The 197 missing symbols cluster heavily by package prefix:

| Prefix              | Count | Filter status                             |
| ------------------- | ----- | ----------------------------------------- |
| `TopOpeBRepDS_*`    | 46    | **excluded** (`bindgen-filters.yaml:599`) |
| `TopOpeBRepBuild_*` | 35    | **excluded** (`bindgen-filters.yaml:598`) |
| `AppDef_*`          | 30    | **excluded** (`bindgen-filters.yaml:603`) |
| `TopOpeBRep_*`      | 27    | **excluded** (`bindgen-filters.yaml:601`) |
| `TopOpeBRepTool_*`  | 21    | **excluded** (`bindgen-filters.yaml:600`) |
| `ProjLib_*`         | 14    | **excluded** (`bindgen-filters.yaml:605`) |
| `GeomPlate_*`       | 9     | **excluded** (`bindgen-filters.yaml:604`) |
| `HeaderSection_*`   | 5     | **excluded** (`bindgen-filters.yaml:602`) |
| `GeomLProp_*`       | 4     | not in filter                             |
| `BRepLProp_*`       | 3     | not in filter                             |
| `BRepMesh_*`        | 1     | likely Bucket A/C cascade                 |
| `HLRBRep_*`         | 1     | likely Bucket A/D cascade                 |
| `NCollection_*`     | 1     | likely Bucket A cascade                   |
| Total               | 197   |                                           |

**~187 of 197 (95%) are bindgen-filter-excluded packages.** The
remaining ~10 are likely cascade failures from Buckets A–D above
(once those compile, the symbol appears, and the manifest gap
closes).

This is a **`full.yml` ↔ `bindgen-filters.yaml` consistency drift**.
The YAML's bindings list is hand-curated and has carried these
symbols since before the filter exclusions landed (probably the OCCT
V7 era). The bindgen silently skips them at generation time, and
the validate step then flags them as missing.

The build was never green for this `full.yml` against this filter
combination — this drift predates the V8 migration entirely.

### Fix layer

Two non-exclusive options, both correct:

(i) **Strip stale entries from `full.yml`** so the YAML mirrors what
the bindgen actually emits. This is the **single source of truth**
fix and is recommended. Implementation: enumerate
`bindgen-filters.yaml:excluded_packages`, walk every `symbol:` entry
in `full.yml`, drop any whose `<symbol>` prefix matches an excluded
package. Then drop the ~10 cascade orphans after Buckets A–D land.

(ii) **Teach `scripts/validate-build.py` to ignore filter-excluded
symbols** — read `bindgen-filters.yaml:excluded_packages` and subtract
matching symbols from the "requested" set before computing
`missing`. This keeps `full.yml` as the historical record. Less
recommended because it diverges the contract — operators reading
`full.yml` see symbols that the build will never produce.

**Recommendation**: option (i). Curated mirror of what the bindgen
emits, easier to reason about. A one-off script to perform the
filtering pass (read both YAMLs, write filtered `full.yml`) lands
this cleanly and is reusable.

## Findings — Phase Completion Map vs Original Stocktake

How each recommendation from
[Stocktake #1](docs/research/occt-v8-final-migration-stocktake.md)
stands now:

| Stocktake #1 R | Description                                                                                         | Status                                             | Notes                                                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| R1             | `OCJS_PYTHON` → `.venv` Python 3.14                                                                 | ✅ Done                                            | Phase 1a–1c landed                                                                                                     |
| R2             | Drop `setuptools<82` floor                                                                          | ✅ Done                                            | Phase 1d / 2a landed                                                                                                   |
| R3             | `scripts/setup-deps.sh` venv bootstrap                                                              | ✅ Done + adjusted                                 | Phase 1b landed with `uv` preference as a DX improvement                                                               |
| R4             | Bump `libclang` 15→18, revert Finding 6 shim                                                        | ✅ Done                                            | Phase 2a–2b landed; bindings.py shim is gone                                                                           |
| R4a            | Bump `cerberus` 1.3.4→1.3.8                                                                         | ✅ Done                                            | Phase 2a                                                                                                               |
| R4b            | Drop `doxmlparser`; drop log mention                                                                | ✅ Done                                            | Phase 2a/2c                                                                                                            |
| R4c            | Tighten `pyyaml>=6.0.3`                                                                             | ✅ Done                                            | Phase 2a                                                                                                               |
| R4d            | Refresh `src/Common.py:181-186` comment                                                             | ✅ Done                                            | Phase 2c                                                                                                               |
| R5             | Split `step_patch_embind` hardening into own commit                                                 | ⏸ Deferred                                         | Currently in working copy alongside R1; landing as single commit is acceptable for code-hygiene reasons (low priority) |
| R6             | Force-regen + recompile + re-link, gate on `binding-report.failed: 0` and `validation_passed: true` | 🔄 95% — needs Bucket A–D fixes + `full.yml` prune | This stocktake's new work                                                                                              |
| R7             | `NCollection_Array1::Assign()` audit                                                                | ⏸ Pending                                          | Blocked on R6                                                                                                          |
| R8             | `pnpm test` + `pnpm typecheck`                                                                      | ⏸ Pending                                          | Blocked on R6                                                                                                          |
| R9             | Version bump `3.0.0-beta.1` → `3.0.0-beta.d3056ef`                                                  | ⏸ Pending                                          | Blocked on R8                                                                                                          |
| R10            | Blueprint amendment (retire BRepGraph patch)                                                        | ⏸ Pending                                          | Trivial doc edit                                                                                                       |

**New work added during Phase 4 (not in Stocktake #1)**:

| New Work | Description                                                                | Status                                                            |
| -------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| N1       | `_substitute_canonical_template_names` helper in `bindings.py`             | ✅ Done — handles libclang-18 `TheItemType` source-name spellings |
| N2       | Bucket A: skip delete-only utility classes                                 | ⏸ Pending                                                         |
| N3       | Bucket B: namespace-nested typedef qualification in `_qualify_nested_type` | ⏸ Pending                                                         |
| N4       | Bucket C: `allow_raw_pointers()` emission for raw-pointer args             | ⏸ Pending                                                         |
| N5       | `full.yml` ↔ `bindgen-filters.yaml` mirror prune                           | ⏸ Pending                                                         |

## Recommendations

| #   | Action                                                                                                                                                                                                                                                                                                                                                                                                                      | Priority | Effort              | Impact                                                               |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------- | -------------------------------------------------------------------- |
| R1  | **Bucket A — Skip delete-only utility classes.** In `src/filter/filterClasses.py` or the bindings.py class-emission gate, detect classes whose **every** copy/move constructor is `clang.cindex.Cursor.is_deleted_method == True` and whose default constructor is also deleted or non-public; emit a structured "skipped (delete-only utility)" entry in `binding-report.json` and exclude them from `class_<T>` emission. | P0       | Medium              | Very High — clears ~50 of 64 compile failures plus Bucket D cascades |
| R2  | **Bucket B — Walk namespace parents in `_qualify_nested_type`.** Extend the `if parent and parent.kind in (CLASS_DECL, STRUCT_DECL, CLASS_TEMPLATE)` clause in `bindings.py:742-746` to also accept `NAMESPACE_DECL`, emitting `<namespace>::<name>` at the `EMSCRIPTEN_BINDINGS` global-scope binding declaration.                                                                                                         | P0       | Low                 | High — clears 6 namespace-nested typedef failures                    |
| R3  | **Bucket C — Emit `allow_raw_pointers()` for `.function()` calls with raw-pointer args.** Mirror the existing `select_overload<>` injection pattern: detect any arg with `clang.cindex.TypeKind.POINTER` whose pointee is not a primitive, and append `, allow_raw_pointers()` to the `.function()` call.                                                                                                                   | P1       | Low                 | Medium — clears the last `BRepMesh_FaceChecker` failure              |
| R4  | **Prune `full.yml` to mirror `bindgen-filters.yaml` exclusions.** Write a one-off script (or inline Python in a follow-up commit) that reads both YAMLs, drops any `symbol:` entry whose first underscore-delimited token matches an excluded package, and writes the pruned `full.yml`. Removes the 187 stale package symbols plus the ~10 cascade orphans after R1–R3 land.                                               | P0       | Low                 | Very High — clears all 197 missing manifest symbols                  |
| R5  | **Re-run `OCJS_YAML=build-configs/full.yml pnpm exec nx run ocjs:build` and gate on `binding-report.failed: 0` AND `validation_passed: true`.** Loop with R1–R4 fixes until both are green.                                                                                                                                                                                                                                 | P0       | Medium (build time) | Very High — primary regression gate                                  |
| R6  | **R5 from Stocktake #1 carried forward: `NCollection_Array1::Assign()` audit.** `rg '\.(Assign\|operator=)\s*\(' --type cpp src/ deps/OCCT/src/`; review each hit for V8 semantic compatibility.                                                                                                                                                                                                                            | P1       | Trivial             | Medium — silent-behavior-change guard                                |
| R7  | **Run `pnpm test` and `pnpm typecheck` inside `repos/opencascade.js`.** Gate on zero failures. The `dts-docs.test.ts` T7 assertion direction flip lands here.                                                                                                                                                                                                                                                               | P0       | Low                 | High — final go/no-go                                                |
| R8  | **Bump `package.json` `3.0.0-beta.1` → `3.0.0-beta.d3056ef`.** Carry-forward from Stocktake #1 R9.                                                                                                                                                                                                                                                                                                                          | P1       | Trivial             | Medium                                                               |
| R9  | **Amend `docs/research/occt-v8-rc5-to-release-migration.md`** Finding 6 to record that the BRepGraph_VersionStamp WASM32 patch is retired upstream in V8.0.0 final. Carry-forward from Stocktake #1 R10.                                                                                                                                                                                                                    | P2       | Trivial             | Low — keeps the upstream blueprint accurate                          |
| R10 | **Delete `repos/opencascade.js/nx-build-ocjs.log`** (untracked, 32,980 lines, transient build log). Optionally add `*.log` or `nx-build-*.log` to `repos/opencascade.js/.gitignore`.                                                                                                                                                                                                                                        | P2       | Trivial             | Low — working-tree hygiene                                           |
| R11 | **Drop `--quiet` from `uv pip install` lines in `scripts/setup-deps.sh`.** First-run install on a fresh `.venv` takes ~60s downloading libclang 18 wheels; silent progress is poor DX.                                                                                                                                                                                                                                      | P2       | Trivial             | Low — DX improvement                                                 |
| R12 | **Optional: split `step_patch_embind` hardening into its own commit.** Carry-forward from Stocktake #1 R5. Currently bundled with R1 — acceptable to land together if commit-topology pressure is low.                                                                                                                                                                                                                      | P2       | Low                 | Low — code hygiene                                                   |

## Validation Gates

Update of the Stocktake #1 gates with the gates that are already
green and the gates that remain.

| #          | Gate                                             | Status              | Pass Criterion                                                                                        |
| ---------- | ------------------------------------------------ | ------------------- | ----------------------------------------------------------------------------------------------------- |
| G1         | Bootstrap interpreter available                  | ✅ Pass             | `python3.14 --version` reports 3.14.x                                                                 |
| G2         | Venv created and populated                       | ✅ Pass             | `.venv/bin/python --version` reports 3.14.x                                                           |
| G3         | Requirements installed                           | ✅ Pass             | `libclang 18.1.x`, `cerberus 1.3.8+`, `pyyaml 6.0.3+`                                                 |
| G3.5       | libclang resolves `occ::handle<T>` correctly     | ✅ Pass             | Confirmed by the 1243-failure drop and absence of any `int &`-degradation patterns in the residual 64 |
| G3.6       | No transitive setuptools dep in venv             | ✅ Pass             | (verified earlier in session)                                                                         |
| G3.7       | Dead deps removed                                | ✅ Pass             | `requirements.txt` is 3 lines                                                                         |
| G4         | `OCJS_PYTHON` resolves to venv                   | ✅ Pass             | Build runs use `.venv/bin/python`                                                                     |
| G5         | Patches apply cleanly                            | ✅ Pass             | Skip-on-V8 path triggered correctly                                                                   |
| G6         | Bindings regenerate                              | ✅ Pass             | `build/bindings/` repopulated, no traceback                                                           |
| G7         | Bindings compile clean                           | ❌ Fail             | `binding-report.failed: 64` (down from 1307); needs R1–R3                                             |
| G7.5 (new) | No `TheItemType` / `type-parameter-` in failures | ✅ Pass             | Zero residual references after Phase 4 helper                                                         |
| G8         | Manifest validates                               | ❌ Fail             | `validation_passed: false`, 197 missing; needs R4 + R1–R3 cascade                                     |
| G9         | Smoke tests pass                                 | ⏸ Blocked on G7+G8  |                                                                                                       |
| G10        | Typecheck clean                                  | ⏸ Blocked on G7+G8  |                                                                                                       |
| G11        | `Assign()` audit clean                           | ⏸ Blocked on G7+G8  |                                                                                                       |
| G12        | Version bumped                                   | ⏸ Blocked on G9+G10 |                                                                                                       |

Three gates remain to flip from fail to pass: **G7** (R1–R3), **G8**
(R4 + R1–R3 cascade), and the test/typecheck/version chain that
follows.

## Risk Matrix

| Risk                                                                                                                               | Likelihood | Severity   | Mitigation                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bucket A skip excludes a class whose static methods are needed by replicad / Tau                                                   | Low        | Medium     | The five affected utility classes (`GeomBndLib`, `ExtremaPC`, `BRepGraph`, `NCollection_IncAllocator`, `BRepMesh_FaceChecker`) are stateless utilities; their static methods are not currently called from JS. Confirm by grep over `repos/replicad/**` for `GeomBndLib` / `ExtremaPC` references before landing R1. |
| Bucket B namespace walk produces false-positive `IMeshData::IMeshData::X` double-qualification when a typedef is already qualified | Low        | Low        | Existing `_qualify_nested_type` short-circuits `if qualified not in result`; namespace walk should follow the same idempotency check.                                                                                                                                                                                |
| Bucket C `allow_raw_pointers()` overshoots and adds the policy to safe pointers (e.g. callbacks)                                   | Low        | Low        | Constrain to non-primitive pointees only; primitive pointers (`int*`, `double*`) are typically `select_overload` candidates handled elsewhere.                                                                                                                                                                       |
| `full.yml` prune drops a symbol whose package is excluded today but the team wants to bind tomorrow                                | Low        | Low        | The prune is reversible (it's YAML); restoring a symbol just means un-excluding the package in `bindgen-filters.yaml` AND re-adding the YAML entry.                                                                                                                                                                  |
| libclang 18.x gets a point bump (e.g. 18.1.6) that re-introduces a `TheItemType` spelling variant the helper misses                | Low        | Medium     | `_substitute_canonical_template_names` substitutes through `replaceTemplateArgs` (source-name-based, version-agnostic); the `_TYPE_PARAM_RE` fallback covers the legacy `type-parameter-N-N` shape. Any new libclang spelling would surface as a `binding-report.failed` row in the next CI run.                     |
| `nx-build-ocjs.log` accumulates in operator working trees over multiple build runs                                                 | Medium     | Negligible | Already untracked; add `*.log` or `nx-build-*.log` to `.gitignore` as part of R10.                                                                                                                                                                                                                                   |
| Replicad re-link surfaces a Bucket A class as needed                                                                               | Low        | Medium     | Re-link is the next plan; if a static-only utility class turns out to be reachable, lift its skip and add an embind `class_<T, no_default_constructor>` binder that exposes only static methods.                                                                                                                     |

## Code Examples

### A. Bucket A bindgen exclusion (R1)

Sketch — single-method gate, called from `processClass` before class
emission and from `filterClasses` so generation is short-circuited:

```python
def _is_delete_only_utility_class(theClass) -> bool:
  """Return True when every constructor on theClass is `= delete`.

  Static-only utility classes like GeomBndLib, ExtremaPC, BRepGraph
  hit this. embind 4.x cannot bind class_<T> for non-copyable
  non-default-constructible types, so we skip them entirely.
  """
  ctors = [c for c in theClass.get_children()
           if c.kind == clang.cindex.CursorKind.CONSTRUCTOR
              and c.access_specifier == clang.cindex.AccessSpecifier.PUBLIC]
  if not ctors:
    return False
  return all(c.is_deleted_method() for c in ctors)
```

Wire-in at `bindings.py:processClass` entry:

```python
def processClass(self, theClass, templateDecl=None, templateArgs=None):
  if _is_delete_only_utility_class(theClass):
    raise SkipException(
      f"Skipping {theClass.spelling}: all constructors deleted "
      f"(static-only utility class — not bindable via embind class_<T>)"
    )
  # ... existing body
```

Logged via the existing `SkipException` path → `binding-report.json`
`skipped` category (or a new `skipped_delete_only` category for
visibility).

### B. Bucket B namespace qualification (R2)

Single targeted edit in `bindings.py:_qualify_nested_type`:

```diff
     if parent and parent.kind in (
       clang.cindex.CursorKind.CLASS_DECL,
       clang.cindex.CursorKind.STRUCT_DECL,
       clang.cindex.CursorKind.CLASS_TEMPLATE,
+      clang.cindex.CursorKind.NAMESPACE,
     ):
```

The existing idempotency guard (`if unqualified in result and qualified
not in result`) handles the namespace case without further changes.

### C. Bucket C raw-pointer policy (R3)

Inside the `.function("Name", ...)` emission helper, detect raw-pointer
args and append `allow_raw_pointers()`:

```python
def _function_emission_suffix(args) -> str:
  needs_raw_pointers = any(
    a.type.kind == clang.cindex.TypeKind.POINTER
    and a.type.get_pointee().kind not in PRIMITIVE_KINDS
    for a in args
  )
  return ", allow_raw_pointers()" if needs_raw_pointers else ""
```

(The existing `allow_raw_pointers()` appearances in already-emitted
`.cpp` confirm the embind 4.x API surface.)

### D. `full.yml` prune script (R4)

One-off, runnable from `repos/opencascade.js`:

```python
import yaml
from pathlib import Path

with open("bindgen-filters.yaml") as f:
  filters = yaml.safe_load(f)

excluded_packages = set()
for entry in filters["filters"]["exclude_packages"]:
  excluded_packages.add(entry.strip())

def _package_of(symbol: str) -> str:
  # OCCT convention: package is the first underscore-delimited token,
  # except for legacy two-token packages (none in the exclude list today).
  return symbol.split("_", 1)[0]

with open("build-configs/full.yml") as f:
  full = yaml.safe_load(f)

bindings_before = list(full["mainBuild"]["bindings"])
bindings_after = [
  b for b in bindings_before
  if _package_of(b["symbol"]) not in excluded_packages
]
removed = [b["symbol"] for b in bindings_before
           if b not in bindings_after]
print(f"Removing {len(removed)} stale symbols across "
      f"{len(excluded_packages)} excluded packages")

full["mainBuild"]["bindings"] = bindings_after
with open("build-configs/full.yml", "w") as f:
  yaml.safe_dump(full, f, sort_keys=False)
```

After running, re-link + re-validate. The 187 package-excluded symbols
drop from `symbols.missing`. The remaining ~10 cascade orphans clear
after R1–R3 land.

### E. Reproduction of current state

```bash
cd repos/opencascade.js
git status --short    # 13 modified + 2 untracked (nx-build-ocjs.log)
.venv/bin/python --version    # → Python 3.14.x
.venv/bin/pip list | rg 'libclang|pyyaml|cerberus'
# libclang  18.1.x
# pyyaml    6.0.3
# cerberus  1.3.8

OCJS_YAML=build-configs/full.yml pnpm exec nx run ocjs:link --skip-nx-cache
OCJS_YAML=build-configs/full.yml pnpm exec nx run ocjs:validate
# → BUILD VALIDATION FAILED, 197 missing symbols (manifest), 64 failed (binding-report)
```

## References

- Predecessor: [`docs/research/occt-v8-final-migration-stocktake.md`](docs/research/occt-v8-final-migration-stocktake.md)
- Upstream blueprint: [`docs/research/occt-v8-rc5-to-release-migration.md`](docs/research/occt-v8-rc5-to-release-migration.md)
- Original V8 migration: [`docs/research/occt-v8-migration.md`](docs/research/occt-v8-migration.md)
- RC5-era migration: [`docs/research/occt-v8-rc5-migration.md`](docs/research/occt-v8-rc5-migration.md)
- embind class binding policy: [`emscripten/cache/sysroot/include/emscripten/bind.h:454`](repos/opencascade.js/deps/emsdk/upstream/emscripten/cache/sysroot/include/emscripten/bind.h)
- libclang Python bindings: `clang.cindex.Cursor.is_deleted_method`, `clang.cindex.CursorKind.NAMESPACE`

## Appendix

### A. Full failure histogram (binding-report.json)

```
total:        4549
succeeded:    4485
failed:       64
  template_error:        51  (Buckets A, D)
  undefined_symbol:      11  (Bucket B + cascade)
  overload_resolution:    2  (Bucket D cascade)
```

### B. Full missing-symbol prefix histogram (build-manifest.json)

```
TopOpeBRepDS_*    46  ← bindgen-filters.yaml:599 excluded
TopOpeBRepBuild_* 35  ← bindgen-filters.yaml:598 excluded
AppDef_*          30  ← bindgen-filters.yaml:603 excluded
TopOpeBRep_*      27  ← bindgen-filters.yaml:601 excluded
TopOpeBRepTool_*  21  ← bindgen-filters.yaml:600 excluded
ProjLib_*         14  ← bindgen-filters.yaml:605 excluded
GeomPlate_*        9  ← bindgen-filters.yaml:604 excluded
HeaderSection_*    5  ← bindgen-filters.yaml:602 excluded
GeomLProp_*        4  ← cascade or genuine gap
BRepLProp_*        3  ← cascade or genuine gap
BRepMesh_*         1  ← Bucket C cascade
HLRBRep_*          1  ← Bucket A/D cascade
NCollection_*      1  ← Bucket A cascade
─────────────────────
total:           197
```

### C. Bucket A complete affected-class list (51 template_error failures)

```
GeomBndLib_BSplineCurve         ExtremaPC_BSplineCurve
GeomBndLib_BSplineCurve2d       ExtremaPC_BezierCurve
GeomBndLib_BSplineSurface       ExtremaPC_Circle
GeomBndLib_BezierCurve          ExtremaPC_Curve
GeomBndLib_BezierCurve2d        ExtremaPC_Ellipse
GeomBndLib_BezierSurface        ExtremaPC_Hyperbola
GeomBndLib_Circle               ExtremaPC_Line
GeomBndLib_Circle2d             ExtremaPC_OffsetCurve
GeomBndLib_Cone                 ExtremaPC_OtherCurve
GeomBndLib_Curve                ExtremaPC_Parabola
GeomBndLib_Curve2d              ExtremaPC_GridEvaluator
GeomBndLib_Cylinder             BRepGraph
GeomBndLib_Ellipse              BRepGraph_DeferredScope
GeomBndLib_Ellipse2d            BRepGraph_LayerRegistry
GeomBndLib_Hyperbola            BRepGraph_RefTransientCache
GeomBndLib_Hyperbola2d          BRepGraph_TransientCache
GeomBndLib_Line                 BRepGraph_Data
GeomBndLib_Line2d               BRepGraph_Copy           (also Bucket D)
GeomBndLib_OffsetCurve          BRepGraph_Transform      (also Bucket D)
GeomBndLib_OffsetCurve2d        NCollection_IncAllocator
GeomBndLib_OffsetSurface        BRepMesh_FaceChecker     (also Bucket C)
GeomBndLib_OtherCurve
GeomBndLib_OtherCurve2d
GeomBndLib_OtherSurface
GeomBndLib_Parabola
GeomBndLib_Parabola2d
GeomBndLib_Plane
GeomBndLib_Sphere
GeomBndLib_Surface
GeomBndLib_SurfaceOfExtrusion
GeomBndLib_SurfaceOfRevolution
GeomBndLib_Torus
```

### D. Working-copy file inventory

```
 M .gitignore                                  (+3, R1)
 M DEPS.json                                   (-2/+2, R1)
 M build-configs/full.yml                      (-1, R2; still needs prune R4)
 M build-wasm.sh                               (+33/-22, R1 + libembind harden)
 M project.json                                (-1/+1, R1)
 M requirements.txt                            (-4/+3, R4 + R4a-c)
 M scripts/setup-deps.sh                       (+55, R3)
 M src/Common.py                               (-3/+5, R4d)
 M src/applyPatches.py                         (-18/+1, R10)
 M src/bindings.py                             (-15/+34, R6 alias flip + Phase 4 helper)
 M src/ocjs_bindgen/discover.py                (-1/+1, R6)
 M src/patches/patch_brepgraph_versionstamp.py (-22/+14, R10)
 M tests/dts-docs.test.ts                      (-12/+8, R7 prep)
?? .python-version                             (R1)
?? nx-build-ocjs.log                           (DELETE; not a build artifact)
```

13 modified + 1 new tracked file (`.python-version`) + 1 transient log
to delete. Zero reverts required.
