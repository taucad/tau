---
title: 'OCJS additionalCppCode Type Erasure Regression'
description: 'Custom C++ classes declared via additionalCppCode lose all OCCT type references in their .d.ts because TypescriptBindings._known_export_names is never seeded for the custom-code generation pass.'
status: superseded
created: '2026-04-18'
updated: '2026-05-16'
category: investigation
related:
  - docs/research/ocjs-typescript-codegen-gap-analysis.md
  - docs/research/ncollection-binding-architecture.md
---

# OCJS additionalCppCode Type Erasure Regression

> **STATUS: RESOLVED (2026-05-16)** — Patched in `src/ocjs_bindgen/pipeline/generate.py:474-515` (`generateCustomCodeBindings` now accepts and applies a `known_exports` seed) and `src/ocjs_bindgen/link/yaml_build.py:521-529` (the YAML link path constructs `known_exports = mainBuild.bindings ∪ extraBuilds[].bindings ∪ _auto_symbols` and passes it). The Phase −1 prerequisite for the [NCollection binding architecture migration](./ncollection-binding-architecture.md) is therefore satisfied without further code change. Document retained as the historical investigation that motivated the patch.

A regression introduced during the OCJS v8 codegen rewrite causes every cross-class type reference inside YAML `additionalCppCode` declarations to be emitted as `unknown`, even when the referenced class is bound and exported by the same build. The root cause is `generateCustomCodeBindings()` skipping `TypescriptBindings.prepare_known_exports()`, so the resolver's known-export table is empty and `resolve_type` falls through to its `unknown` fallback. Replicad's consumer surface compensated with `as TopoDS_Shape` / `as Geom2d_Curve` casts that are **not legitimate type narrowings** but workarounds for missing type information that the bindings layer should have emitted directly.

## Executive Summary

- **Symptom**: `BRepToolsWrapper.Read(data: string): unknown`, `GeomToolsWrapper.Read(data: string): unknown`, `ReplicadMeshExtractor.extract(...): unknown`, `ReplicadEdgeMeshExtractor.extract(...): unknown` in `replicad_single.d.ts`. Every parameter and return type that names an OCCT class (`TopoDS_Shape`, `Geom2d_Curve`, etc.) or a sibling custom class (`ReplicadMeshData`) renders as `unknown`.
- **Root cause**: `generateBindings.py:generateCustomCodeBindings()` (line 247) instantiates a fresh `TuInfo(customCode)` and runs the codegen `process()` without first calling `TypescriptBindings.prepare_known_exports()`. The class-level `_known_export_names` set stays empty, and `bindings.py:resolve_type` (line 3148) emits `"unknown"` for every reference that fails the `_is_known_export_name` guard at lines 3127, 3141, 3144.
- **Smoking gun**: The fragment at `build/bindings/myMain.h/BRepToolsWrapper.d.ts.json` is the _direct output of bindings.py_ (not the post-pass). It contains `Write(shape: unknown): string` and `Read(data: string): unknown` even though `TopoDS_Shape` is bound, exported, and present in the same `replicad_single.d.ts` output (line 36209).
- **Fix vector**: Seed `TypescriptBindings._known_export_names` in `generateCustomCodeBindings` from the YAML's `bindings:` list (plus auto-discovered NCollection symbols and the custom code's own class names). All four broken methods will then emit their real OCCT/sibling types directly, with zero changes required in the consumer's source.
- **Replicad cleanup**: Once the codegen is fixed, four casts in `repos/replicad/packages/replicad/src/` can be deleted. A wider audit (see [Section 5](#5-cast-audit-replicadpackagesreplicadsrc)) classifies the remaining casts as either pre-existing OCCT-handle ergonomics (not codegen-related) or one residual heritage cast worth investigating.

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Methodology](#2-methodology)
3. [Findings](#3-findings)
4. [Root Cause](#4-root-cause)
5. [Cast Audit (replicad/packages/replicad/src)](#5-cast-audit-replicadpackagesreplicadsrc)
6. [Recommendations](#6-recommendations)
7. [Code Examples](#7-code-examples)
8. [Appendix: Evidence Trail](#8-appendix-evidence-trail)

## 1. Problem Statement

After the v8.53 OCJS rebuild (`./build-wasm.sh --config O3-wasm-exc-simd full`), the rebuilt `replicad_single.d.ts` contains type-erased signatures for every class declared in the YAML's `additionalCppCode` block:

```typescript
export declare class BRepToolsWrapper {
  constructor();
  static Write(shape: unknown): string;
  static Read(data: string): unknown;
  ...
}

export declare class GeomToolsWrapper {
  constructor();
  static Write(geometry: unknown): string;
  static Read(data: string): unknown;
  ...
}

export declare class ReplicadMeshExtractor {
  constructor();
  static extract(shape: unknown, tolerance: number, angularTolerance: number, skipNormals: boolean): unknown;
  ...
}

export declare class ReplicadEdgeMeshExtractor {
  constructor();
  static extract(shape: unknown, tolerance: number, angularTolerance: number): unknown;
  ...
}
```

Yet the `.yml` clearly declares strong C++ signatures:

```cpp
class BRepToolsWrapper {
public:
  static std::string Write(const TopoDS_Shape& shape);
  static TopoDS_Shape Read(const std::string& data);
};

class GeomToolsWrapper {
public:
  static std::string Write(const opencascade::handle<Geom2d_Curve>& geometry);
  static opencascade::handle<Geom2d_Curve> Read(const std::string& data);
};

class ReplicadMeshExtractor {
public:
  static ReplicadMeshData extract(const TopoDS_Shape&, double, double, bool);
};
```

This forced four casts into `replicad/src/lib2d/Curve2D.ts` and `replicad/src/shapes.ts` during the v8.53 typecheck pass. The user's directive: identify why these methods regressed and restore full type safety in the bindings layer rather than papering over with consumer-side casts.

## 2. Methodology

| Step | Action                                               | Evidence Source                                                                       |
| ---- | ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| M1   | Walk the most recent 25 OCJS commits                 | `git log --oneline -25` in `repos/opencascade.js`                                     |
| M2   | Identify the commit introducing `unknown` rewriting  | `git show dbe89ff` — "Replace unbound references with unknown via post-pass"          |
| M3   | Dump the _direct_ bindings.py output (pre-post-pass) | `cat build/bindings/myMain.h/BRepToolsWrapper.d.ts.json`                              |
| M4   | Compare to historical cached fragments               | `find cache -name "BRepToolsWrapper.d.ts.json"` (Mar 19 → Mar 23 → Apr 18 cohort)     |
| M5   | Trace `unknown` emission path in `bindings.py`       | `rg "_is_known_export_name\|return \"unknown\""`                                      |
| M6   | Locate `prepare_known_exports` callers               | `rg "prepare_known_exports" src/`                                                     |
| M7   | Verify TuInfo's parsing scope                        | Read `src/TuInfo.py` and `src/generateBindings.py:generateCustomCodeBindings`         |
| M8   | Audit consumer-side `as` casts                       | `rg "\\bas\\s+(unknown\|[A-Z][A-Za-z0-9_]+)\\b" repos/replicad/packages/replicad/src` |

## 3. Findings

### Finding 1: Direct bindings.py output emits `unknown` (post-pass not implicated)

The freshly-generated fragment at `repos/opencascade.js/build/bindings/myMain.h/BRepToolsWrapper.d.ts.json` reads:

```json
{
  ".d.ts": "export declare class BRepToolsWrapper {\n  constructor();\n  static Write(shape: unknown): string;\n  static Read(data: string): unknown;\n  ...}"
}
```

The post-pass `_replace_undeclared_with_unknown` in `buildFromYaml.py` rewrites references _after_ fragments are merged. This fragment is the _input_ to the merge step — it already contains `unknown`. The post-pass is **not** the culprit; the fault lies in `bindings.py` itself when invoked through `generateCustomCodeBindings`.

### Finding 2: `_known_export_names` is empty during custom-code generation

`bindings.py:resolve_type` decides whether a resolved type spelling is "real" by consulting two sets:

```python
# bindings.py:3127
self._is_known_export_name(resolved)   # checks self.exports ∪ TypescriptBindings._known_export_names
# bindings.py:3141
canonical_spelling in self.exports or canonical_spelling in TypescriptBindings._known_export_names
# bindings.py:3144
decl.spelling in self.exports or decl.spelling in TypescriptBindings._known_export_names
```

If none match, line 3148 records an `unbound_reference` reason and returns `"unknown"`.

`TypescriptBindings._known_export_names` is a class-level `set()` populated only by `TypescriptBindings.prepare_known_exports(tuInfo, filterClasses, filterTemplates)`. There are exactly two call sites (`rg "prepare_known_exports" src/`):

| Call site                      | Path                               | Pass              |
| ------------------------------ | ---------------------------------- | ----------------- |
| `generateBindings.py:293`      | `if __name__ == "__main__":` block | Main OCCT bindgen |
| `ocjs_bindgen/__main__.py:104` | New entry point                    | Main OCCT bindgen |

`generateCustomCodeBindings()` (`generateBindings.py:247-257`) does **not** call `prepare_known_exports`. When `buildFromYaml.py:560` invokes `generateCustomCodeBindings(additionalCppCode)`, the surrounding `buildFromYaml` process has only imported the bindings module — `_known_export_names` is the default empty `set()`. Every cross-class reference therefore fails all three `_known_export_names` checks and falls through to `unknown`.

### Finding 3: `self.exports` only sees the class currently being processed

The other check, `self.exports`, is the per-class instance set populated as `TypescriptBindings.processClass()` walks one class. By the time `resolve_type` is asked about the return type of `BRepToolsWrapper.Read`, `self.exports` contains `{"BRepToolsWrapper"}` only — not `TopoDS_Shape`, not `Geom2d_Curve`, not even sibling custom classes like `ReplicadMeshData` (which is in a different fragment generation pass). This is intentional for per-fragment isolation, and is exactly why `_known_export_names` exists: to provide cross-fragment ground truth.

The evidence: `ReplicadMeshData.d.ts.json` declares its members correctly because they're inline numeric methods (`getVerticesPtr(): number`), but `ReplicadMeshExtractor.extract(...): ReplicadMeshData` is erased to `unknown` because `ReplicadMeshData` lives in the _sibling_ fragment, not in `self.exports`.

### Finding 4: TuInfo for custom code already includes OCCT classes

`TuInfo("myMain.h", customCode)` parses `ocAllIncludeStatements + customCode` (see `TuInfo.py:7-17`). libclang follows the include graph, so `tuInfo.allChildren` enumerates **every** OCCT class declared in any included header — `TopoDS_Shape`, `Geom2d_Curve`, `Standard_Type`, the lot. The TuInfo therefore _has_ all the metadata needed to seed `_known_export_names`; the bug is purely that `generateCustomCodeBindings` never asks for it.

### Finding 5: Filter functions support a non-custom mode

`filterClasses(child, customBuild)` (in `generateBindings.py:76-86`) toggles between:

- `customBuild=True` → only classes whose `child.location.file.name == "myMain.h"`
- `customBuild=False` → classes inside the OCCT include graph (`occtBasePath`) that pass `filterPackages`

Calling `prepare_known_exports(tuInfo, filterClasses, filterTemplates)` from inside `generateCustomCodeBindings` is therefore feasible — but it must invoke `filter_classes_fn(child, False)` to enumerate the full export universe, not just the per-build filter. The current `prepare_known_exports` signature passes `customBuild=False` already (see `bindings.py:2647`), so the seam is essentially in place; the call is simply missing.

### Finding 6: YAML's `bindings:` list is the source of truth for "what is exported in this build"

The `replicad_single.d.ts` `OpenCascadeInstance` aggregate is built from `deduped_exports` (a list keyed by symbol name) which is derived directly from each fragment's `exports` field. Critically, the YAML's own `bindings:` list explicitly enumerates every symbol the link will produce (lines 100-229 of `custom_build_single.yml`). This list is the per-build authority — it includes both OCCT classes (`TopoDS_Shape`, `Geom2d_Curve`, …) _and_ the custom-code classes (`BRepToolsWrapper`, `ReplicadMeshData`, …). It is the cleanest seed for `_known_export_names` in the custom-code pass because:

- It is build-specific (no false positives from OCCT classes that won't ship in this build).
- It is already validated against compiled-symbol presence by `verifyBindings` (`buildFromYaml.py:230-242`).
- It is available at the call site of `generateCustomCodeBindings` (the YAML is already loaded into `buildConfig`).

## 4. Root Cause

```text
generateBindings.py:generateCustomCodeBindings()                        ← entry point
  ├─ tuInfo = TuInfo(customCode)                                         ← contains OCCT + custom AST
  ├─ MISSING: TypescriptBindings.prepare_known_exports(tuInfo, …)        ← !!! never called
  └─ process(tuInfo, ".d.ts.json", …, customBuild=True)
       └─ TypescriptBindings(tuInfo).processClass(child)
            └─ resolve_type(typeOfReturnValue, …)
                 ├─ _is_known_export_name("TopoDS_Shape")
                 │     ├─ "TopoDS_Shape" in self.exports          → False
                 │     └─ "TopoDS_Shape" in _known_export_names    → False (empty set!)
                 └─ return "unknown"                              ← REGRESSION
```

The regression entered with the pivot to the `_known_export_names` ground-truth model (commit ancestry around `bd87e15 fix: Improve overload filtering, type resolution, and struct binding` and `dbe89ff feat: Replace unbound references with unknown via post-pass`). Pre-rewrite codegen was permissive enough that the fragments emitted `TopoDS_Shape` regardless of whether the codegen had verified its existence — older cached fragments confirm this:

```
cache/O3-noLTO-wasmExc-single-…-bg00278ea7-…/myMain.h/BRepToolsWrapper.d.ts.json   (Mar 23)
  → "static Write(shape: TopoDS_Shape): any; static Read(data: any): TopoDS_Shape"

build/bindings/myMain.h/BRepToolsWrapper.d.ts.json                                  (Apr 18, current)
  → "static Write(shape: unknown): string; static Read(data: string): unknown"
```

The new model (correct `string`/`number` for primitives, `_is_known_export_name` guard for everything else) is a clear improvement; it just lost `_known_export_names` seeding for the custom-code path along the way.

## 5. Cast Audit (`replicad/packages/replicad/src`)

Every `as` cast in the consumer was triaged into one of three buckets.

### 5.1 Codegen-regression-induced (will disappear when bindings emit real types)

| #   | File               | Line | Cast                                                 | Cause                                                                                            |
| --- | ------------------ | ---- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| C1  | `lib2d/Curve2D.ts` | 17   | `... as Geom2d_Curve`                                | `GeomToolsWrapper.Read` returns `unknown`                                                        |
| C2  | `shapes.ts`        | 201  | `... as TopoDS_Shape`                                | `BRepToolsWrapper.Read` returns `unknown`                                                        |
| C3  | `shapes.ts`        | 386  | `... as MeshExtractorResult` (+ local interface)     | `ReplicadMeshExtractor.extract` returns `unknown` and `ReplicadMeshData` isn't reachable in d.ts |
| C4  | `shapes.ts`        | 446  | `... as EdgeMeshExtractorResult` (+ local interface) | `ReplicadEdgeMeshExtractor.extract` returns `unknown` and `ReplicadEdgeMeshData` isn't reachable |

All four are recent additions made during the v8.53 typecheck pass. The two locally-defined interfaces `MeshExtractorResult` / `EdgeMeshExtractorResult` (`shapes.ts:174-194`) duplicate the C++ struct shape and should be deleted in favour of the bindings-emitted `ReplicadMeshData` / `ReplicadEdgeMeshData`.

### 5.2 Pre-existing OCCT-handle / generic-narrowing patterns (orthogonal to this regression)

| #      | File                                                                                                                             | Line                                    | Cast                                                                      | Notes                                                                                                                                                                                                |
| ------ | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1     | `shapes.ts`                                                                                                                      | 610                                     | `cast(flipped) as unknown as Type`                                        | Generic narrowing inside `<Type extends TopoDS_Shape>`. Legal; OCCT polymorphism erased to `AnyShape`.                                                                                               |
| P2     | `shapes.ts`                                                                                                                      | 749                                     | `... as unknown as Adaptor3d_Surface`                                     | **Investigate**: `BRepAdaptor_Surface extends GeomAdaptor_TransformedSurface extends Adaptor3d_Surface` is in the d.ts. A plain `as Adaptor3d_Surface` should suffice — this is likely a stale cast. |
| P3     | `shapes.ts`                                                                                                                      | 764                                     | `cast(flipped) as Face`                                                   | Narrows `AnyShape` union to a concrete subclass; legal.                                                                                                                                              |
| P4     | `lib2d/Curve2D.ts`                                                                                                               | 91                                      | `Copy() as Geom2d_Curve`                                                  | OCCT API: `Copy()` returns base `Handle(Geom2d_Geometry)`. Downcast is intentional.                                                                                                                  |
| P5–P6  | `lib2d/makeCurves.ts`                                                                                                            | 154,191                                 | `segment as unknown as Geom2d_Curve`                                      | `Value()` returns `Geom2d_Circle`/`Geom2d_Ellipse` which already extend `Geom2d_Curve`. The `as unknown as` is over-cast — could be removed entirely. **Cleanup candidate.**                         |
| P7–P8  | `lib2d/makeCurves.ts`                                                                                                            | 82,122                                  | `(curve.wrapped as Geom2d_TrimmedCurve)`                                  | Downcast from `Geom2d_Curve` to a subclass to call `SetTrim`. Intentional.                                                                                                                           |
| P9     | `Sketcher2d.ts`                                                                                                                  | 563                                     | `Mirrored(...) as Geom2d_Curve`                                           | Same family as P4 — `Mirrored` returns a base handle. Intentional.                                                                                                                                   |
| P10    | `lib2d/Curve2D.ts`                                                                                                               | 216                                     | `[dir.X(), dir.Y()] as Point2D`                                           | Brand-style narrowing of `number[]` to a tuple alias. Domain-level.                                                                                                                                  |
| P11–14 | `Sketcher.ts:346,348` `Sketcher2d.ts:428,430`                                                                                    | various                                 | `controlPoints as Point2D` / `Point2D[]`                                  | Narrowing from a union parameter; domain-level.                                                                                                                                                      |
| P15    | `shapes.ts`                                                                                                                      | 142                                     | `... as TopAbs_ShapeEnum`                                                 | Index-into-record narrowing; domain-level.                                                                                                                                                           |
| P16    | `shapes.ts`                                                                                                                      | 488                                     | `STEPControl_AsIs as STEPControl_StepModelType`                           | Enum narrowing; the OCJS enum object is wider than the value. Could be revisited if the enum codegen tightens.                                                                                       |
| P17–19 | `shapes.ts:504,530` `assemblyExporter.ts:132`                                                                                    | `file as BlobPart`                      | Standard DOM narrowing; domain-level.                                     |
| P20–21 | `shapes.ts:97`                                                                                                                   | `Omit<ChamferRadius, number>`           | Generic option-type slicing; domain-level.                                |
| P22–23 | `shapeHelpers.ts:490,597`                                                                                                        | `as Shell`                              | Narrowing factory output; domain-level.                                   |
| P24–25 | `curves.ts:163,193`                                                                                                              | `(geomSurf as Geom_CylindricalSurface)` | Surface-kind downcast after `if (surfType === Cylinder)`; intentional.    |
| P26–27 | `lib2d/approximations.ts`, `lib2d/utils.ts`, `blueprints/Blueprint.ts`, `geom.ts`, `draw.ts`, `blueprints/offset.ts:127,299,303` | various                                 | Domain-level enum/tuple/factory narrowings unrelated to bindings codegen. |

### 5.3 Summary by bucket

| Bucket                                       | Count | Action                         |
| -------------------------------------------- | ----- | ------------------------------ |
| Codegen-regression workarounds (C1–C4)       | 4     | Delete after R1 (Section 6)    |
| Stale upcast worth removing (P2, P5, P6)     | 3     | Cleanup PR — independent of R1 |
| Pre-existing OCCT-handle / domain narrowings | ~25   | Leave alone                    |

## 6. Recommendations

| #   | Action                                                                                                                                                                                                                                                                                                                                               | Priority | Effort | Impact                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------------------------------------------------------------------------------------------------ |
| R1  | Seed `TypescriptBindings._known_export_names` inside `generateCustomCodeBindings` from the YAML's `bindings:` list + auto-discovered NCollection symbols + custom-code class names. Pass the seed via a new optional argument to `generateCustomCodeBindings(customCode, knownExports)`.                                                             | P0       | Low    | Restores typed signatures for every additionalCppCode method without changing fragment topology. |
| R2  | Add a smoke test under `repos/opencascade.js/tests/` that builds a tiny custom YAML with `additionalCppCode` returning `TopoDS_Shape` and asserts the emitted `.d.ts.json` contains `: TopoDS_Shape` (not `: unknown`).                                                                                                                              | P0       | Low    | Prevents silent re-regression; covers an entire codegen surface that has no test today.          |
| R3  | After R1 lands and replicad is rebuilt, delete C1–C4 in `repos/replicad/packages/replicad/src/{shapes.ts,lib2d/Curve2D.ts}` and the local `MeshExtractorResult` / `EdgeMeshExtractorResult` interfaces. Re-import `ReplicadMeshData` / `ReplicadEdgeMeshData` from `replicad-opencascadejs`.                                                         | P0       | Low    | Removes the four casts the user flagged.                                                         |
| R4  | Investigate P2 (`shapes.ts:749`); if the heritage chain is intact, drop `as unknown as`. Investigate P5–P6 (`lib2d/makeCurves.ts:154,191`) — the upcast to `Geom2d_Curve` is implicit when subclasses derive from it.                                                                                                                                | P2       | Low    | Eliminates 3 more casts; pure consumer-side cleanup.                                             |
| R5  | (Long-term) Consider unifying `_known_export_names` seeding into the `bindings.py` module's import side, sourced from a `build/known-exports.json` manifest written during the main bindgen step. This protects future custom-code paths beyond `generateCustomCodeBindings` (e.g. `ocjs_bindgen/__main__.py` if it ever grows custom-code support). | P3       | Med    | Hardens the contract; eliminates hidden coupling.                                                |
| R6  | Document the resolver's preconditions (`prepare_known_exports` must be called before `processClass`) at the top of `bindings.py:TypescriptBindings`.                                                                                                                                                                                                 | P3       | XS     | Future maintainers won't add another entry point with the same omission.                         |

## 7. Code Examples

### 7.1 Proposed R1 patch (sketch)

```python
# generateBindings.py

def generateCustomCodeBindings(customCode, known_exports=None):
  """
  known_exports: optional iterable of symbol names that the surrounding build
  guarantees will be exported (YAML bindings list ∪ NCollection auto-discovery
  manifest ∪ custom-code class names). Seeds `_known_export_names` so cross-
  class type references resolve to the real type instead of `unknown`.
  """
  try:
    os.makedirs(libraryBasePath)
  except Exception:
    pass

  embindPreamble = ocIncludeStatements + "\n" + referenceTypeTemplateDefs + "\n" + customCode
  tuInfo = TuInfo(customCode)

  if known_exports is not None:
    TypescriptBindings._known_export_names = set(known_exports)

  process(tuInfo, ".cpp", embindGenerationFuncClasses, embindGenerationFuncTemplates, embindGenerationFuncEnums, embindPreamble, True)
  process(tuInfo, ".d.ts.json", typescriptGenerationFuncClasses, typescriptGenerationFuncTemplates, typescriptGenerationFuncEnums, "", True)
```

```python
# buildFromYaml.py (around line 560)

allBindings = list(chain(
  buildConfig["mainBuild"]["bindings"],
  *list(map(lambda x: x["bindings"], buildConfig["extraBuilds"])),
))
known_exports = (
  {b["symbol"] for b in allBindings}
  | _auto_symbols
  | {c.spelling for c in TuInfo(additionalCppCode).allChildren if c.kind == clang.cindex.CursorKind.CLASS_DECL and c.location.file and c.location.file.name == "myMain.h"}
)

generateCustomCodeBindings(additionalCppCode, known_exports=known_exports)
```

(The custom-class enumeration could equally be done inside `generateCustomCodeBindings` after `TuInfo` parses, avoiding the double-parse.)

### 7.2 R2 smoke test (sketch)

```python
# repos/opencascade.js/tests/test_custom_code_type_resolution.py

import json
import subprocess
from pathlib import Path

def test_custom_code_emits_real_occt_types(tmp_path):
  yaml = tmp_path / "custom.yml"
  yaml.write_text("""
mainBuild:
  name: smoke.js
  bindings:
    - symbol: TopoDS_Shape
    - symbol: SmokeWrapper
  emccFlags: []
additionalCppCode: |
  class SmokeWrapper {
  public:
    static TopoDS_Shape Identity(const TopoDS_Shape& shape) { return shape; }
  };
""")
  # Run only the bindgen + dts-only path; no link.
  subprocess.check_call(["python3", "src/buildFromYaml.py", "--dts-only", str(yaml)])
  fragment = json.loads(Path("build/bindings/myMain.h/SmokeWrapper.d.ts.json").read_text())
  assert "Identity(shape: TopoDS_Shape): TopoDS_Shape" in fragment[".d.ts"]
  assert ": unknown" not in fragment[".d.ts"]
```

### 7.3 Expected R3 cleanup diff

```diff
- import { ... } from 'replicad-opencascadejs';
+ import { ..., ReplicadMeshData, ReplicadEdgeMeshData } from 'replicad-opencascadejs';

- interface MeshExtractorResult { /* duplicated from C++ struct */ ... }
- interface EdgeMeshExtractorResult { /* duplicated from C++ struct */ ... }

  mesh({ tolerance = 1e-3, angularTolerance = 0.1 } = {}): ShapeMesh {
-   const raw = this.oc.ReplicadMeshExtractor.extract(this.wrapped, tolerance, angularTolerance, false) as MeshExtractorResult;
+   const raw = this.oc.ReplicadMeshExtractor.extract(this.wrapped, tolerance, angularTolerance, false);
    ...

  meshEdges({ tolerance = 1e-3, angularTolerance = 0.1 } = {}): { ... } {
-   const raw = this.oc.ReplicadEdgeMeshExtractor.extract(this.wrapped, tolerance, angularTolerance) as EdgeMeshExtractorResult;
+   const raw = this.oc.ReplicadEdgeMeshExtractor.extract(this.wrapped, tolerance, angularTolerance);
    ...

- return cast(oc.BRepToolsWrapper.Read(data) as TopoDS_Shape);
+ return cast(oc.BRepToolsWrapper.Read(data));

- const handle = oc.GeomToolsWrapper.Read(data) as Geom2d_Curve;
+ const handle = oc.GeomToolsWrapper.Read(data);
```

## 8. Appendix: Evidence Trail

### 8.1 Cached fragment timeline

| mtime      | Cache key (truncated)                             | Output of `BRepToolsWrapper.Read` |
| ---------- | ------------------------------------------------- | --------------------------------- |
| Mar 19     | `…-bg4fe850f5-em5.0.1-9ce403/`                    | `Read(data: any): TopoDS_Shape`   |
| Mar 21     | `…-bg3730266c-em5.0.1-dpd5a50ce7-9ce403/`         | `Read(data: any): TopoDS_Shape`   |
| Mar 23     | `…-bgd533d0a8-em5.0.1-dpd5a50ce7-patched-9ce403/` | `Read(data: any): TopoDS_Shape`   |
| Mar 23     | `…-bg00278ea7-em5.0.1-dpd5a50ce7-patched-9ce403/` | `Read(data: any): TopoDS_Shape`   |
| **Apr 18** | `build/bindings/myMain.h/` (current)              | `Read(data: string): unknown`     |

The transition from `: TopoDS_Shape` to `: unknown` coincides with the broader codegen rewrite (commits `73542d3`, `aa0ee65`, `f986219`, `9afe66e`, `33c489e`, `9493980`, `757ab77`, `dbe89ff`). The improvement to `data: string` (correctly mapping `std::string`) and the regression on `: TopoDS_Shape` were introduced in the same arc — the resolver got stricter without anyone wiring the custom-code path to the new ground-truth source.

### 8.2 Confirmed call graph

```text
build-wasm.sh link
  → python3 src/buildFromYaml.py custom_build_single.yml
       └─ main()
            ├─ os.path.isdir(custom_dir) → cleanup non-auto symbols           (line 542-547)
            ├─ additionalCppCode = buildConfig["additionalCppCode"]            (line 549)
            ├─ generateCustomCodeBindings(additionalCppCode)                  (line 560)  ← !!!
            │    └─ tuInfo = TuInfo(customCode)
            │    └─ process(tuInfo, ".d.ts.json", …, customBuild=True)
            │         └─ TypescriptBindings(tuInfo).processClass(child)
            │              └─ resolve_type → "unknown"                         ← REGRESSION
            ├─ compileCustomCodeBindings(...)
            ├─ _collect_dts_fragments(...)
            ├─ ... merge ...
            └─ _replace_undeclared_with_unknown(merged, declared_names, ...)   ← orthogonal post-pass
```

### 8.3 Files to change for R1

| File                                                             | Change                                                                                                                            |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `repos/opencascade.js/src/generateBindings.py`                   | Extend `generateCustomCodeBindings(customCode, known_exports=None)`; seed `TypescriptBindings._known_export_names` when provided. |
| `repos/opencascade.js/src/buildFromYaml.py`                      | Compute `known_exports` from YAML bindings + `_auto_symbols` + custom-code class names; pass into `generateCustomCodeBindings`.   |
| `repos/opencascade.js/tests/test_custom_code_type_resolution.py` | New file (R2).                                                                                                                    |
| `repos/opencascade.js/src/bindings.py`                           | Add a top-level docstring on `TypescriptBindings` declaring `prepare_known_exports` as a precondition (R6).                       |

### 8.4 Files to change for R3 (after R1 ships)

| File                                                    | Change                                                                                                                                                            |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `repos/replicad/packages/replicad/src/shapes.ts`        | Remove local `MeshExtractorResult` / `EdgeMeshExtractorResult` interfaces; import `ReplicadMeshData` / `ReplicadEdgeMeshData`; drop casts on lines 201, 386, 446. |
| `repos/replicad/packages/replicad/src/lib2d/Curve2D.ts` | Drop `as Geom2d_Curve` on line 17.                                                                                                                                |

---

## 9. Resolution Log

This section documents the implementation of recommendations R1, R2, R3, R4, and R6. R5 (long-term hardening / structural ratchet on `generateCustomCodeBindings`) was explicitly deferred during planning as overly speculative; the test suite below uses semantic resolution via `ts.TypeChecker` instead, which is more durable than any structural ratchet would have been.

### 9.1 R1 — Seed `_known_export_names` for the custom-code pass

Implemented in two coordinated edits:

- `repos/opencascade.js/src/generateBindings.py`: `generateCustomCodeBindings(customCode, known_exports=None)` now AST-discovers the local custom-class names from `tuInfo` and seeds `TypescriptBindings._known_export_names = (set(known_exports) if known_exports else set()) | local_custom_classes` **before** the `process(..., ".d.ts.json", …)` call. A multi-paragraph docstring at the top of the function declares the precondition and links here.
- `repos/opencascade.js/src/buildFromYaml.py`: computes the explicit seed by unioning `mainBuild.bindings[*].symbol`, `extraBuilds[*].bindings[*].symbol`, and the `_auto_symbols` set, then passes it into `generateCustomCodeBindings(additionalCppCode, known_exports=known_exports)`.

**Validation:**

- Per-fragment diff against the captured Phase-0 baselines under `/tmp/ocjs-baseline/`:
  - `BRepToolsWrapper.Read`: `unknown` → `TopoDS_Shape` (return) and `TopoDS_Shape` (param of `Write`).
  - `GeomToolsWrapper.Read`: `unknown` → `Geom2d_Curve` (return + `Write` param).
  - `ReplicadMeshExtractor.extract`: `unknown` → `ReplicadMeshData` (return); `unknown` → `TopoDS_Shape` (param).
  - `ReplicadEdgeMeshExtractor.extract`: `unknown` → `ReplicadEdgeMeshData` (return); `unknown` → `TopoDS_Shape` (param).
- The merged `repos/replicad/packages/replicad-opencascadejs/src/replicad_single.d.ts` contains the corrected signatures at the same offsets that previously emitted `unknown`.

### 9.2 R2 — TypeScript regression-guard test suite

Implemented in `repos/opencascade.js/tests/dts-validation.test.ts`. The new top-level `describe` block (`additionalCppCode type-erasure regression guard — replicad_single.d.ts`) drives the TypeScript Compiler API, builds a `ts.Program` over `replicad_single.d.ts`, and uses the resulting `ts.TypeChecker` to resolve each custom-code wrapper method's return and parameter types canonically:

- `should resolve BRepToolsWrapper.Read return type to TopoDS_Shape`
- `should resolve BRepToolsWrapper.Write parameter type to TopoDS_Shape`
- `should resolve GeomToolsWrapper.Read return type to Geom2d_Curve`
- `should resolve ReplicadMeshExtractor.extract return type to ReplicadMeshData`
- `should resolve ReplicadEdgeMeshExtractor.extract return type to ReplicadEdgeMeshData`
- `should resolve every custom-code wrapper method to a non-unknown return and parameter type` (umbrella sweep over `BRepToolsWrapper`, `GeomToolsWrapper`, `ReplicadMeshExtractor`, `ReplicadEdgeMeshExtractor`)

These assertions all failed RED in Phase 1 against the broken `.d.ts` (with `'unknown'` returned by `typeToString`) and are now GREEN against the regenerated `.d.ts`. Run with `pnpm exec vitest run tests/dts-validation.test.ts` from `repos/opencascade.js/` (58 tests / 0 failures / 0 type errors).

There are intentionally **no regex / substring assertions** in the new suite — every test goes through the compiler's semantic type-resolution path so it's robust against unrelated formatting or signature reordering and indefensible-in-PR pattern matching is avoided.

### 9.3 R3 — Strip C1–C4 casts and dead interfaces in replicad

Edits applied in `repos/replicad/packages/replicad/`:

- `src/lib2d/Curve2D.ts:17` (C1) — dropped `as Geom2d_Curve` from `oc.GeomToolsWrapper.Read(data)`; the result now flows through with its real type.
- `src/shapes.ts` — original lines 201, 386, 446 (C2, C3, C4):
  - `deserializeShape`: `cast(oc.BRepToolsWrapper.Read(data) as TopoDS_Shape)` → `cast(oc.BRepToolsWrapper.Read(data))`.
  - `mesh()`: removed `as MeshExtractorResult` from `ReplicadMeshExtractor.extract(...)`.
  - `meshEdges()`: removed `as EdgeMeshExtractorResult` from `ReplicadEdgeMeshExtractor.extract(...)`.
- `src/shapes.ts:174–192` — deleted the now-dead local `MeshExtractorResult` and `EdgeMeshExtractorResult` shadow interfaces. The real `ReplicadMeshData` / `ReplicadEdgeMeshData` classes from `replicad-opencascadejs` are now the sole source of truth and are used implicitly via inference (no extra import needed).

### 9.4 R4 — Strip stale upcast / `as unknown as` casts

Three sites originally annotated as P2 / P5 / P6 in the audit:

- `repos/replicad/packages/replicad/src/shapes.ts` `Face._geomAdaptor()` (P2) — dropped `as unknown as Adaptor3d_Surface`. The heritage chain `BRepAdaptor_Surface → GeomAdaptor_TransformedSurface → Adaptor3d_Surface` is now fully present in the regenerated `.d.ts` (verified via class declarations at lines 36827 and 31277), so the upcast is implicit.
- `repos/replicad/packages/replicad/src/lib2d/makeCurves.ts` `make2dCircle` (P5) and `make2dEllipse` (P6) — dropped `as unknown as Geom2d_Curve` from both. `GC_MakeCircle2d.Value()` returns `Geom2d_Circle` and `GC_MakeEllipse2d.Value()` returns `Geom2d_Ellipse`, both of which extend `Geom2d_Conic → Geom2d_Curve`, so the upcast into `new Curve2D(...)` is implicit.
- The now-unused `Geom2d_Curve` import in `makeCurves.ts` was dropped.

`pnpm exec tsc --noEmit` in `repos/replicad/packages/replicad/` is clean. The remaining `as` occurrences (P3, P4, P7, P8 — `Curve2D.Copy()`, `Mirrored()`, `Geom2d_TrimmedCurve.SetTrim`, `Geom_CylindricalSurface.Cylinder()`) are **legitimate downcasts** from a generic parent type into a specific subtype based on caller knowledge and are retained.

### 9.5 R6 — Documentation precondition

Two location-tagged docstrings now make the seeding contract impossible to miss:

- `repos/opencascade.js/src/bindings.py` — class-level docstring on `TypescriptBindings` describes the two existing seeding paths (full-build `prepare_known_exports`, custom-code `generateCustomCodeBindings(known_exports=…)`) and warns that any new third path must seed `_known_export_names` before any `processClass` / `processEnum` / `processTemplateTypedef` call.
- `repos/opencascade.js/src/generateBindings.py` — function-level docstring on `generateCustomCodeBindings` plus an inline comment immediately above the `process(…, ".d.ts.json", …)` call linking to this document.

### 9.6 R5 — Deferred (intentional)

R5 (build-system ratchet that diff-checks `generateCustomCodeBindings`'s structural skeleton between revisions) was dropped from scope during planning. Rationale captured during the conversation:

- A pattern-matching ratchet on Python AST shapes is fragile, indefensible in PR review, and would be triggered by every legitimate refactor of the function it protects.
- The R2 test suite already prevents the only failure mode the ratchet would have caught — namely, an empty `_known_export_names` re-emerging at codegen time — and does so semantically via `ts.TypeChecker` rather than syntactically.

If a future regression of the same shape ever recurs despite R2, that is the moment to revisit R5. Until then, no ratchet is justified.

### 9.7 Pack & relink

- `repos/replicad/packages/replicad/package.json` and `repos/replicad/packages/replicad-opencascadejs/package.json` bumped from `0.21.0-v8.53` → `0.21.0-v8.54`.
- `vite build` in `replicad/packages/replicad/`; `npm pack` in both `replicad/packages/replicad/` and `replicad/packages/replicad-opencascadejs/`; tarballs moved to `tarballs/replicad-0.21.0-v8.54.tgz` and `tarballs/replicad-opencascadejs-0.21.0-v8.54.tgz`.
- `package.json` (root) and `packages/runtime/package.json` updated to point at the v8.54 tarballs.
- `patches/replicad.patch` re-derived against the new dist (the existing `Sketches.extrude` / `Sketches.revolve` `AnyShape → Shape3D` narrowing is preserved; only the line offsets shifted from 2140 to 2144).
- `pnpm install` reinstalls cleanly with the new pins; `pnpm nx run runtime:copy-assets` refreshed the WASM artifacts.

### 9.8 Verification gates

- `pnpm exec vitest run tests/dts-validation.test.ts` (in `repos/opencascade.js/`): **58 tests / 0 failures / 0 type errors** including the 6 new custom-code regression guards.
- `pnpm exec tsc --noEmit` (in `repos/replicad/packages/replicad/`): **0 errors**.
- `pnpm nx test runtime ./src/kernels/replicad/replicad.kernel.test.ts --watch=false`: **115 passed / 1 skipped / 0 failed**.
- `pnpm nx typecheck runtime`: **clean** (both `tsconfig.lib.json` and `tsconfig.spec.json`).
- `pnpm nx lint runtime --files='src/kernels/replicad/replicad.kernel.ts src/kernels/replicad/utils/render-output.ts src/kernels/replicad/replicad.plugin.ts'`: **0 warnings / 0 errors / 419 rules**.
