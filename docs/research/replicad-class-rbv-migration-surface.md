---
title: 'Replicad Class-RBV Migration Surface'
description: 'Audit of every call site in the upstream replicad package touched by extending class-based return-by-value to OCCT methods with non-const class-type reference outputs. Surface: 8 sites across 4 files, plus one in/out edge case requiring a bindgen exemption.'
status: draft
created: '2026-05-12'
updated: '2026-05-12'
category: migration
related:
  - docs/research/occt-unbound-symbols-audit.md
  - docs/research/occt-v8-final-migration-stocktake-4.md
  - docs/research/occt-v8-rc5-to-release-migration.md
---

# Replicad Class-RBV Migration Surface

Quantifies the upstream `replicad` consumer impact of extending `@taucad/opencascade.js`'s return-by-value (RBV) output-parameter handling from primitives/enums/handles to user-defined class types (`gp_Pnt`, `gp_Vec`, `gp_XYZ`, `Bnd_Box`, etc.).

## Executive Summary

Extending RBV to class-type output parameters affects **427 methods across 137 OCCT classes** in the wider survey. Inside the upstream replicad codebase (sgenoud/replicad@main, `packages/replicad/src/`, 72 TS files, 12 172 LOC), the affected surface is just **8 call sites across 4 files**, totalling ~30 LOC of mechanical edits. Seven of the eight are pure output-only methods that benefit cleanly from RBV; the eighth (`gp_GTrsf::Transforms`) is an **in/out method** that reads its argument as input before writing back to the same reference and requires an explicit exemption from RBV in `bindgen-filters.yaml`. No public replicad API surface changes — every affected call site is private/protected glue inside the wrapper classes (`Shape`, `Curve`, `Surface`, `Face`, `Curve2D`, `BoundingBox`, `EllpsoidTransform`).

Recommendation: extend class-type RBV in lockstep with R1 in `occt-unbound-symbols-audit.md`, add a `keep_proxy_mutation` allowlist for the four `gp_(G)Trsf(2d)?::Transforms` overloads, and ship replicad migration alongside the `replicad-opencascadejs` tarball bump. The replicad-side patch is one PR's worth of work, not a project.

## Problem Statement

The Tau OCJS fork (`repos/opencascade.js`) currently emits return-by-value `value_object` containers only for output parameters typed as primitives (`double&`, `int&`), enums (`SomeEnum&`), and OCCT handles (`Handle<T>&`). Output parameters typed as user-defined class types — `gp_Pnt&`, `gp_Vec&`, `gp_Pnt2d&`, `gp_Vec2d&`, `gp_XYZ&`, `gp_Mat&`, `Bnd_Box&`, etc. — still use the legacy "proxy-mutation" pattern where the JS caller pre-allocates the output object and the C++ method writes through the reference.

The proposed extension (see `occt-unbound-symbols-audit.md` recommendation R1 and the OCJS plan `/Users/rifont/.cursor/plans/r1_lprops_template_alias_fix_50ca8b09.plan.md`) generalises RBV to class types so every output parameter follows the same `value_object` discipline. Before landing the bindgen changes we need a concrete map of **what breaks in our largest first-party consumer** (`replicad`), because the OCJS tarball ships through `replicad-opencascadejs` → `replicad` → `@taucad/runtime`'s replicad kernel.

## Methodology

1. **Catalog the migration surface.** Earlier analysis (preserved in `/tmp/rbv-survey.json`, 16 592 lines) walked OCCT headers under `repos/opencascade.js/deps/OCCT/src/` and produced the complete list of 427 `void`-returning methods with non-const lvalue references to user-defined class types, filtered against the bound-symbol list in `build-configs/full.yml` and the exclusion list in `bindgen-filters.yaml`.
2. **Clone replicad.** `pnpm repos clone replicad` resolved to `repos/replicad/` (already present, checked out on `main`).
3. **Cross-reference call sites.** For each of the 140 unique method names in the catalog (`D0`, `D1`, `D2`, `D3`, `Transforms`, `Add`, `Normal`, `Section`, `TrimmedSquareDistances`, etc.), ran `rg` against `packages/replicad/src/` with the explicit method-name regex. Each candidate hit was opened in context to determine whether the receiver is an OCCT type (positive match) or a replicad type (false positive — `BoundingBox.Add`, `BoundingBox2d.Add`, `BRepBuilderAPI_Make*.Add`, etc.).
4. **Validate by allocation pattern.** Cross-checked by grepping for `new this.oc.gp_Pnt()` / `new this.oc.gp_Vec()` / `new oc.Bnd_Box*()` allocations — every such allocation that is subsequently passed as an output parameter is in the migration set; every allocation that is passed as a `const` input (e.g. `Angle(dir0)`) is not.
5. **Catalog edge cases.** Identified `gp_GTrsf::Transforms` as the lone in/out method by reading the OCCT header and the replicad usage at `shapeHelpers.ts:436`.

All findings reference exact file:line locations in `repos/replicad/packages/replicad/src/` at upstream `main`.

## Findings

### Finding 1: The full migration surface is 8 call sites across 4 files

| #   | File               | Line | OCCT method                               | Output type(s)                     | Pattern     | Edge case? |
| --- | ------------------ | ---- | ----------------------------------------- | ---------------------------------- | ----------- | ---------- |
| 1   | `shapes.ts`        | 343  | `BRepBndLib::Add(S, B&, useTri)`          | `Bnd_Box&`                         | Output-only | –          |
| 2   | `shapes.ts`        | 635  | `Adaptor3d_Curve::D1(U, P&, V&)`          | `gp_Pnt&`, `gp_Vec&`               | Output-only | –          |
| 3   | `shapes.ts`        | 770  | `Adaptor3d_Surface::D0(U, V, P&)`         | `gp_Pnt&`                          | Output-only | –          |
| 4   | `shapes.ts`        | 808  | `BRepGProp_Face::Normal(u, v, P&, VNor&)` | `gp_Pnt&`, `gp_Vec&`               | Output-only | –          |
| 5   | `shapeHelpers.ts`  | 436  | `gp_GTrsf::Transforms(theCoord&)`         | `gp_XYZ&`                          | **In/out**  | **YES**    |
| 6   | `lib2d/Curve2D.ts` | 34   | `BndLib_Add2dCurve::Add(C, tol, B&)`      | `Bnd_Box2d&`                       | Output-only | –          |
| 7   | `lib2d/Curve2D.ts` | 214  | `Geom2d_Curve::D1(U, P&, V&)`             | `gp_Pnt2d&`, `gp_Vec2d&`           | Output-only | –          |
| 8   | `curves.ts`        | 19   | `BndLib_Add2dCurve::Add(C, tol, B&)`      | `Bnd_Box2d&` (accumulator in loop) | Output-only | –          |

Total LOC delta estimate: ~30 lines added / ~25 lines removed (each call site loses a manual `.delete()` block and gains a destructure or single-binding `using`). Public API surface change: **zero** — every affected line is inside a wrapper class method whose public signature is unchanged.

### Finding 2: The bulk of replicad's `.Add()` / `.D1()` / `.Value()` hits are false positives

The catalog method names overlap heavily with replicad's own wrapper classes and with OCCT receiver-mutation builders, producing a long tail of hits that are **not** in the migration surface:

| Pattern                                           | Example                                                               | Why unaffected                                                                       |
| ------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `BRepBuilderAPI_Make*::Add(input)`                | `wireBuilder.Add(e.wrapped)` (`shapeHelpers.ts:274`)                  | Receiver mutates in place; `Add` takes a `const` input, no output ref                |
| `BoundingBox.add(other)` (replicad's own wrapper) | `this.wrapped.Add(other.wrapped)` (`geom.ts:638`)                     | Calls `Bnd_Box::Add(const Bnd_Box&)` — const input, no output                        |
| `XCurve.Value(param)`                             | `this.wrapped.Value(this.wrapped.FirstParameter())` (`shapes.ts:609`) | `Geom_Curve::Value(double) const` returns `gp_Pnt` by value, no output ref           |
| `Poly_Triangulation::Normal(int)`                 | `tri.Normal(i)` (`shapes.ts:876`)                                     | Index getter returning `gp_Dir` by value, no output ref                              |
| `gp_Dir2d::Angle(const Other&)`                   | `curve.XAxis().Direction().Angle(dir0)` (`lib2d/svgPath.ts:76`)       | `dir0` is a `const` input for angle computation, not an output                       |
| Intersector/builder lifecycle                     | `intersector.Init(...)`, `splineBuilder.IsDone()`, `*Build(progress)` | Receiver-mutating methods that take const inputs or primitives; no class output refs |

Cross-referencing the 33 `.Add()` hits in replicad with the 33 `Add` methods in the survey produced **exactly three** genuine matches: `BRepBndLib::Add` (×1), `BndLib_Add2dCurve::Add` (×2). All the other `.Add()` calls are false positives.

### Finding 3: `gp_GTrsf::Transforms` is the lone in/out edge case

`shapeHelpers.ts:431-438` defines `EllpsoidTransform.applyToPoint`:

```text
applyToPoint(p: gp_Pnt): gp_Pnt {
  const oc = getOC();
  const r = GCWithScope();
  const coords = r(p.XYZ());                  // read input → gp_XYZ
  this.wrapped.Transforms(coords);            // mutate coords in place (in/out)
  return new oc.gp_Pnt(coords);               // construct gp_Pnt from mutated coords
}
```

The C++ signature is `void gp_GTrsf::Transforms(gp_XYZ& theCoord) const` — `theCoord` is **read as input before being overwritten with the transformed coordinates**, so a naive RBV conversion would default-construct `gp_XYZ(0,0,0)` on the C++ side, transform that zero vector, and return garbage. This is the canonical "in/out" parameter pattern previously flagged in the RBV scope analysis.

There are four total Transforms-style in/out methods in the OCCT public API:

| Class        | Method       | In/out parameter   |
| ------------ | ------------ | ------------------ |
| `gp_Trsf`    | `Transforms` | `gp_XYZ& theCoord` |
| `gp_Trsf2d`  | `Transforms` | `gp_XY& theCoord`  |
| `gp_GTrsf`   | `Transforms` | `gp_XYZ& theCoord` |
| `gp_GTrsf2d` | `Transforms` | `gp_XY& theCoord`  |

Replicad uses `gp_GTrsf::Transforms` directly. No other in/out methods from the survey are reachable from replicad's source.

### Finding 4: No public replicad API signature changes

Every affected call site sits inside the body of one of these wrapper-class methods:

| Method                                | Class                 | File:line                                              |
| ------------------------------------- | --------------------- | ------------------------------------------------------ |
| `boundingBox` (getter)                | `Shape`               | `shapes.ts:341-345`                                    |
| `tangentAt(position)`                 | `_1DShape` (abstract) | `shapes.ts:629-642`                                    |
| `pointOnSurface(u, v)`                | `Face`                | `shapes.ts:762-776`                                    |
| `normalAt(locationVector?)`           | `Face`                | `shapes.ts:790-812`                                    |
| `boundingBox` (getter)                | `Curve2D`             | `lib2d/Curve2D.ts:29-38`                               |
| `tangentAt(index)`                    | `Curve2D`             | `lib2d/Curve2D.ts:198-220` (line 214 is the OCCT call) |
| `curvesBoundingBox(curves)` (free fn) | –                     | `curves.ts:14-23`                                      |
| `applyToPoint(p)`                     | `EllpsoidTransform`   | `shapeHelpers.ts:431-438`                              |

Each public signature returns either a replicad domain type (`BoundingBox`, `Vector`, `Point2D`) or `void`, so neither replicad consumers nor downstream Tau callers see any API delta.

### Finding 5: No replicad test contains an OCCT output-parameter call

`packages/replicad/__tests__/` is 247 LOC of pure SVG-snapshot utilities (`diffSVGToSnapshot.ts`, `setup.ts`, `toMatchSVGSnapshot.ts`). It contains zero references to `.D[0-3]`, `Transforms`, `BRepBndLib`, `BndLib_Add2dCurve`, or `BRepGProp_Face`. The post-migration validation surface is therefore the existing replicad geometry tests (which exercise the wrapper methods end-to-end) plus the new smoke tests in OCJS (per R1).

### Finding 6: All affected call sites already use one of two manual-cleanup idioms

The migration is mechanical because every call site already follows one of two patterns, both trivially convertible to RBV:

**Idiom A: explicit `.delete()` pairs.** Used in `shapes.ts:632-639` and `shapes.ts:765-773`:

```text
const tmp = new this.oc.gp_Pnt();
const res = new this.oc.gp_Vec();
this.wrapped.D1(pos, tmp, res);
const tangent = new Vector(res);
tmp.delete();
res.delete();
return tangent;
```

Converts to:

```text
const { theP, theV } = this.wrapped.D1(pos);
using p = theP;
using v = theV;
return new Vector(v);
```

**Idiom B: `GCWithScope` register-and-forget.** Used in `shapes.ts:804-810`, `lib2d/Curve2D.ts:211-217`, `shapeHelpers.ts:432-437`, and the `BndLib_Add2dCurve.Add` loop in `curves.ts`. Replicad's existing scope-guard utility (`GCWithScope` from `register.ts`) returns a registrar `r` that auto-`.delete()`s every wrapped object at scope exit. Conversion is identical to Idiom A — destructure the RBV result, register each field with `r()`:

```text
const p = r(new this.oc.gp_Pnt());
const vn = r(new this.oc.gp_Vec());
const props = r(new this.oc.BRepGProp_Face(this.wrapped, false));
props.Normal(u, v, p, vn);
const normal = new Vector(vn);
```

Becomes:

```text
const props = r(new this.oc.BRepGProp_Face(this.wrapped, false));
const { theP, theVNor } = props.Normal(u, v);
r(theP); r(theVNor);
const normal = new Vector(theVNor);
```

Either idiom preserves replicad's existing memory-management discipline byte-for-byte.

### Finding 7: Replicad does not depend on the field-name conventions

Replicad reads the output parameters by **identifier**, not by positional unpacking — `tmp`, `res`, `p`, `vn`, `point`, `dir`, `coords`, `bbox.wrapped`, `boundBox`. Under RBV the field names in the generated `value_object` (`theP`, `theV`, `theP`+`theV1`, `theP`+`theVNor`, `theCoord`, `B`, `theP`+`theV`) are exposed in the destructure. None of replicad's logic is positional or schema-dependent — every consumer reads a single named property and constructs a `Vector` / `BoundingBox` / `gp_Pnt`. The destructure rename is mechanical:

| Call site              | RBV field rename                 |
| ---------------------- | -------------------------------- |
| `shapes.ts:635`        | `tmp` → `theP`, `res` → `theV`   |
| `shapes.ts:770`        | `p` → `theP`                     |
| `shapes.ts:808`        | `p` → `theP`, `vn` → `theVNor`   |
| `lib2d/Curve2D.ts:214` | `point` → `theP`, `dir` → `theV` |

The four bounding-box `.Add` call sites collapse to `{ B }` destructures (or `{ B: nextBox }` to reuse the local name).

## Recommendations

| #   | Action                                                                                                                                                                                                                                                        | Priority | Effort | Impact                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------------------------------------------------------------------------------------------ |
| R1  | Land class-type RBV in the OCJS bindgen alongside R1 of `occt-unbound-symbols-audit.md`.                                                                                                                                                                      | P0       | M      | Closes API inconsistency, gates everything downstream.                                     |
| R2  | Add `gp_Trsf::Transforms`, `gp_Trsf2d::Transforms`, `gp_GTrsf::Transforms`, `gp_GTrsf2d::Transforms` to a new `keep_proxy_mutation:` list in `bindgen-filters.yaml`.                                                                                          | P0       | XS     | Prevents Finding 3 regression; preserves the only in/out method actually used by replicad. |
| R3  | Patch the eight replicad call sites in this audit and ship as a single PR upstream to `sgenoud/replicad` (or carry as a fork patch under `repos/replicad/` if upstream rejects until OCJS releases publicly).                                                 | P1       | S      | ~30 LOC delta, zero public API change.                                                     |
| R4  | Add a `*.no-class-output-proxy.policy.test.ts` regression to OCJS so any future class-typed output parameter that escapes RBV (other than the explicit exemption list) fails CI.                                                                              | P2       | S      | Locks in the contract.                                                                     |
| R5  | Bump `replicad-opencascadejs` tarball with the new WASM build, regenerate the bundled `replicad-opencascadejs/src/*.d.ts` typings, and republish the OCJS tarball under `tarballs/` per the standard `dist→replicad-opencascadejs/src→npm pack→install` flow. | P1       | M      | Tests Tau's replicad kernel end-to-end against the new shape.                              |
| R6  | Update `BREAKING_CHANGES.md` Section B2 to add class-type RBV examples and document the four `Transforms` exemptions explicitly.                                                                                                                              | P1       | XS     | Avoids surprise for any external consumer of `@taucad/opencascade.js`.                     |

## Trade-offs

The four candidate strategies for handling class-typed output parameters, scored against the eight replicad call sites:

| Strategy                                                          | DX                                                                                            | Memory safety                                                  | In/out handling                           | Bindgen complexity                                                                   | Notes                                                                             |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| **A. Keep proxy-mutation (status quo)**                           | Manual alloc + delete or `r()`-register for every output. ~12 LOC per multi-output call site. | Caller-managed, error-prone.                                   | Works natively.                           | None.                                                                                | Already the worst DX we ship; rejected as the long-term direction.                |
| **B. Pure RBV for all class outputs**                             | One destructure per call site. ~3 LOC per call site.                                          | Bindgen-emitted `value_object` default-constructs every field. | **Breaks** the four `Transforms` methods. | Moderate (extend `isOutputParam`, `_emitOutputParamBinding`, `_ensureResultStruct`). | Requires R2 exemption list.                                                       |
| **C. RBV + bindgen-attached `[Symbol.dispose]` on the container** | `using result = curve.D2(...)` plus optional destructure. ~2 LOC per call site.               | Container disposes every embind-handle field in LIFO order.    | Same in/out issue as (B); same R2 needed. | Moderate (B) + tiny container-decoration helper + `.d.ts` field.                     | Best DX; matches `docs/research/agent-disposable-container-prior-art` discussion. |
| **D. C with `DisposableStack` fallback for the in/out cases**     | (B) for the four Transforms exemptions, (C) everywhere else.                                  | Same as C.                                                     | Solved per-method by the exemption list.  | (B) + (C).                                                                           | Recommended composite.                                                            |

Strategy **D** is what the R1+R2 combination produces in practice: class-type RBV emits a `value_object` with a bindgen-attached `[Symbol.dispose]` for every multi-output method, and the four in/out methods listed in the new `keep_proxy_mutation:` allowlist retain their legacy signature.

## Code Examples

### Example 1: `Curve.tangentAt` (idiom A, two outputs)

**Before** (`shapes.ts:629-642`):

```text
tangentAt(position = 0.5): Vector {
  const pos = this._mapParameter(position);

  const tmp = new this.oc.gp_Pnt();
  const res = new this.oc.gp_Vec();

  this.wrapped.D1(pos, tmp, res);
  const tangent = new Vector(res);

  tmp.delete();
  res.delete();

  return tangent;
}
```

**After** (Strategy D):

```text
tangentAt(position = 0.5): Vector {
  const pos = this._mapParameter(position);

  using result = this.wrapped.D1(pos);
  return new Vector(result.theV);
}
```

Net change: −7 LOC. The container's `[Symbol.dispose]` walks `theP` and `theV` and calls `.delete()` on each at scope exit.

### Example 2: `Face.pointOnSurface` (idiom A, single output)

**Before** (`shapes.ts:762-776`):

```text
pointOnSurface(u: number, v: number): Vector {
  const { uMin, uMax, vMin, vMax } = this.UVBounds;
  const surface = this._geomAdaptor();
  const p = new this.oc.gp_Pnt();

  const absoluteU = u * (uMax - uMin) + uMin;
  const absoluteV = v * (vMax - vMin) + vMin;

  surface.D0(absoluteU, absoluteV, p);
  const point = new Vector(p);
  surface.delete();
  p.delete();

  return point;
}
```

**After**:

```text
pointOnSurface(u: number, v: number): Vector {
  const { uMin, uMax, vMin, vMax } = this.UVBounds;
  using surface = this._geomAdaptor();

  const absoluteU = u * (uMax - uMin) + uMin;
  const absoluteV = v * (vMax - vMin) + vMin;

  using result = surface.D0(absoluteU, absoluteV);
  return new Vector(result.theP);
}
```

Net change: −6 LOC. Both the adaptor and the RBV container auto-dispose.

### Example 3: `Face.normalAt` (idiom B, GCWithScope path)

**Before** (`shapes.ts:790-812`):

```text
normalAt(locationVector?: Point): Vector {
  let u = 0;
  let v = 0;
  const r = GCWithScope();

  if (!locationVector) {
    const { uMin, uMax, vMin, vMax } = this.UVBounds;
    u = 0.5 * (uMin + uMax);
    v = 0.5 * (vMin + vMax);
  } else {
    [u, v] = this.uvCoordinates(locationVector);
  }

  const p = r(new this.oc.gp_Pnt());
  const vn = r(new this.oc.gp_Vec());

  const props = r(new this.oc.BRepGProp_Face(this.wrapped, false));
  props.Normal(u, v, p, vn);

  const normal = new Vector(vn);
  return normal;
}
```

**After**:

```text
normalAt(locationVector?: Point): Vector {
  let u = 0;
  let v = 0;
  const r = GCWithScope();

  if (!locationVector) {
    const { uMin, uMax, vMin, vMax } = this.UVBounds;
    u = 0.5 * (uMin + uMax);
    v = 0.5 * (vMin + vMax);
  } else {
    [u, v] = this.uvCoordinates(locationVector);
  }

  const props = r(new this.oc.BRepGProp_Face(this.wrapped, false));
  const result = r(props.Normal(u, v));
  return new Vector(result.theVNor);
}
```

Net change: −2 LOC. The RBV container is registered with the existing `GCWithScope` registrar `r`, which calls its `[Symbol.dispose]` at function exit; the container then disposes `theP` and `theVNor`. No new disposal idiom introduced.

### Example 4: `Shape.boundingBox` (single Bnd_Box output)

**Before** (`shapes.ts:341-345`):

```text
get boundingBox(): BoundingBox {
  const bbox = new BoundingBox();
  this.oc.BRepBndLib.Add(this.wrapped, bbox.wrapped, true);
  return bbox;
}
```

**After**:

```text
get boundingBox(): BoundingBox {
  const { B } = this.oc.BRepBndLib.Add(this.wrapped, true);
  return new BoundingBox(B);
}
```

Net change: −1 LOC. `B` becomes the box; the `BoundingBox(wrapped?)` constructor already accepts an externally-allocated `Bnd_Box` (`geom.ts:580-587`).

### Example 5: `curvesBoundingBox` (accumulator in a loop)

**Before** (`curves.ts:14-23`):

```text
export const curvesBoundingBox = (curves: Curve2D[]): BoundingBox2d => {
  const oc = getOC();
  const boundBox = new oc.Bnd_Box2d();

  curves.forEach((c) => {
    oc.BndLib_Add2dCurve.Add(c.wrapped, 1e-6, boundBox);
  });

  return new BoundingBox2d(boundBox);
};
```

The semantics here are subtle: `BndLib_Add2dCurve::Add(C2d, tol, B&)` **extends** the bounding box with each curve in place. Under pure RBV `B` is default-constructed inside C++ and only the curve's own bounds are returned — the previous box state is lost.

This is the **same in/out signature pattern as `Transforms`**, even though the binding-time signature looks output-only. Two options:

- **Option a (preferred):** Add `BndLib_Add2dCurve::Add` to the `keep_proxy_mutation` exemption list alongside `Transforms`. The current callers retain their semantics with zero change.
- **Option b:** Migrate to RBV and rewrite the accumulator on the JS side using the static `Bnd_Box2d::Add(const Bnd_Box2d&)` receiver-mutation method:

```text
export const curvesBoundingBox = (curves: Curve2D[]): BoundingBox2d => {
  const oc = getOC();
  const boundBox = new oc.Bnd_Box2d();

  curves.forEach((c) => {
    const { B } = oc.BndLib_Add2dCurve.Add(c.wrapped, 1e-6);
    using curveBox = B;
    boundBox.Add(curveBox);
  });

  return new BoundingBox2d(boundBox);
};
```

Option **a** is the right call: the `keep_proxy_mutation` list already needs to exist for `Transforms`, and the accumulator semantics on `BndLib*::Add` are widespread enough across OCCT (`BndLib::Add(*)` has 23 overloads in the survey) that exempting the whole family is cleaner than rewriting every accumulator. R2 should expand to include `BndLib::Add`, `BndLib_Add2dCurve::Add`, `BndLib_AddSurface::Add`, and `BRepBndLib::Add` (when called against an existing populated box).

Caveat: `BRepBndLib::Add` at `shapes.ts:343` _does_ start from a freshly-allocated empty `Bnd_Box`, so it would technically work under pure RBV at that one site. But OCCT users routinely call `BRepBndLib::Add` to extend an existing box (the OCCT examples and tutorials all do this), so the consistent rule is "all `*::Add(..., Bnd_Box&)` keep proxy mutation".

### Example 6: `gp_GTrsf::Transforms` (the canonical in/out)

**Before** (`shapeHelpers.ts:431-438`):

```text
applyToPoint(p: gp_Pnt): gp_Pnt {
  const oc = getOC();
  const r = GCWithScope();

  const coords = r(p.XYZ());
  this.wrapped.Transforms(coords);
  return new oc.gp_Pnt(coords);
}
```

**After R2 exemption:** **No change.** `gp_GTrsf::Transforms` keeps its proxy-mutation signature; this code is correct as-is.

## Diagrams

### Migration surface scope

```
upstream OCCT methods affected by class-RBV ............. 427 / 137 classes
                            │
                            ├── Reachable from replicad ............... 8 call sites / 4 files
                            │       ├── Pure output-only .............. 7 sites
                            │       │       ├── BRepBndLib::Add ........ 1
                            │       │       ├── Adaptor3d_Curve::D1 .... 1
                            │       │       ├── Adaptor3d_Surface::D0 .. 1
                            │       │       ├── BRepGProp_Face::Normal . 1
                            │       │       ├── Geom2d_Curve::D1 ....... 1
                            │       │       └── BndLib_Add2dCurve::Add . 2 (accumulator — see R2)
                            │       │
                            │       └── In/out (requires R2) .......... 1 site
                            │               └── gp_GTrsf::Transforms ... 1
                            │
                            └── Not reachable from replicad .......... 419 methods
                                    (full LProps surface, intersectors,
                                     surface-of-revolution generators,
                                     CSLib::Normal variants, etc.)
```

### Call-site distribution

```
shapes.ts ................ 4 sites (lines 343, 635, 770, 808)
shapeHelpers.ts .......... 1 site  (line 436)              [in/out]
lib2d/Curve2D.ts ......... 2 sites (lines 34, 214)
curves.ts ................ 1 site  (line 19)
```

## References

- Plan: `/Users/rifont/.cursor/plans/r1_lprops_template_alias_fix_50ca8b09.plan.md`
- Catalog snapshot: `/tmp/rbv-survey.json` (16 592 lines, 427 method entries)
- Catalog DX delta: `/tmp/rbv-before-after.md` (1 264 lines, 423 method before/after pairs)
- Upstream replicad: [sgenoud/replicad@main](https://github.com/sgenoud/replicad) — clone at `repos/replicad/`
- OCCT `gp_GTrsf::Transforms` header: `repos/opencascade.js/deps/OCCT/src/FoundationClasses/TKMath/gp/gp_GTrsf.hxx`
- TC39 explicit-resource-management proposal: [tc39/proposal-explicit-resource-management](https://github.com/tc39/proposal-explicit-resource-management)
- Embind RAII PR (RReverser, 2025): [emscripten-core/emscripten#23818](https://github.com/emscripten-core/emscripten/pull/23818)

## Appendix

### A1: Complete method-name → call-site cross-reference

| Method                       | Survey class                             | Replicad receiver                             | File:line                                                        | Affected?                                    |
| ---------------------------- | ---------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------- |
| `D0`                         | `Adaptor3d_Surface`                      | `BRepAdaptor_Surface` (via `_geomAdaptor`)    | `shapes.ts:770`                                                  | YES                                          |
| `D1`                         | `Adaptor3d_Curve`                        | `BRepAdaptor_Curve` / `BRepAdaptor_CompCurve` | `shapes.ts:635`                                                  | YES                                          |
| `D1`                         | `Geom2d_Curve`                           | `Geom2d_Curve` (via `innerCurve`)             | `lib2d/Curve2D.ts:214`                                           | YES                                          |
| `Normal`                     | `BRepGProp_Face`                         | `BRepGProp_Face`                              | `shapes.ts:808`                                                  | YES                                          |
| `Normal`                     | `Poly_Triangulation`                     | `Poly_Triangulation`                          | `shapes.ts:876`                                                  | NO (by-value return)                         |
| `Add`                        | `BRepBndLib`                             | `BRepBndLib`                                  | `shapes.ts:343`                                                  | YES                                          |
| `Add`                        | `BndLib_Add2dCurve`                      | `BndLib_Add2dCurve`                           | `lib2d/Curve2D.ts:34`, `curves.ts:19`                            | YES (in/out accumulator — keep proxy)        |
| `Add`                        | `Bnd_Box`                                | `Bnd_Box`                                     | `geom.ts:638`, `lib2d/BoundingBox2d.ts:58`                       | NO (`const Bnd_Box&` input)                  |
| `Add`                        | `BRepBuilderAPI_Make*`                   | `MakeWire`/`MakeFace`/`MakeShell` etc.        | many                                                             | NO (receiver-mutation, const input)          |
| `Add`                        | `BRepFilletAPI_Make*`                    | `MakeFillet`/`MakeChamfer`                    | `shapes.ts:1151,1153,1196,1203`                                  | NO (receiver-mutation, primitives + handles) |
| `Add`                        | `BRepBuilderAPI_Sewing`                  | `Sewing`                                      | `shapes.ts:559`                                                  | NO (receiver-mutation)                       |
| `Add`                        | `TopoDS_Builder`                         | (compound construction)                       | `shapeHelpers.ts:554`                                            | NO (receiver-mutation)                       |
| `Append`                     | `TopTools_ListOfShape`                   | local list                                    | `shapes.ts:1048`                                                 | NO (receiver-mutation, const input)          |
| `Init`                       | `Geom2dAPI_InterCurveCurve`              | local intersector                             | `lib2d/intersections.ts:43,75`, `Blueprint.ts:301,324`           | NO (const inputs + primitive)                |
| `Build`, `Perform`, `IsDone` | many builders                            | many                                          | many                                                             | NO (receiver-mutation, primitives)           |
| `Transforms`                 | `gp_GTrsf`                               | `gp_GTrsf`                                    | `shapeHelpers.ts:436`                                            | YES (in/out — R2 exemption)                  |
| `Value`                      | `Geom_Curve`/`Geom_Surface`/`Adaptor*`   | many                                          | many                                                             | NO (by-value return, not in survey)          |
| `Value`                      | `NCollection_Array2<gp_Pnt>::Value(r,c)` | `arrayOfPoints`                               | `shapeHelpers.ts:449`                                            | NO (const-ref getter)                        |
| `SetValue`                   | `TColgp_Array1OfPnt2d`/`Array1OfPnt`     | arrays                                        | `lib2d/makeCurves.ts:253,256,259,301`, `shapeHelpers.ts:186,232` | NO (mutator with const input)                |

### A2: Tarball release coupling

The release order is:

1. Land R1 (class-type RBV detection) + R2 (in/out exemption list) in `repos/opencascade.js` on the `next` branch.
2. Run the full OCJS validation (`pnpm nx build ocjs`); confirm `validation_passed: true` in `dist/opencascade_full.build-manifest.json` and the four `Transforms` methods preserve their two-arg JS signatures in `dist/opencascade_full.d.ts`.
3. Rebuild the replicad-specific WASM variant via `pnpm nx build ocjs --configuration=replicad_single_v8`; confirm the same exemption coverage in the smaller bundle.
4. Copy `dist/*` into `repos/replicad/packages/replicad-opencascadejs/src/`, run `npm pack`, move the new `.tgz` into `tarballs/`, install.
5. Land R3 in `repos/replicad/packages/replicad/src/` (the eight call-site edits per this audit), regenerate `libs/api-extractor/src/generated/replicad/*`, run the replicad kernel's full Tau test suite (`pnpm nx test runtime` + `pnpm nx test ui`).
6. Submit R3 upstream to `sgenoud/replicad` as a single PR with the migration explained and a link to the upstream OCJS release. If upstream prefers to hold the change until OCJS releases publicly, carry the patch in `repos/replicad/` (managed by `repos.yaml`) until they merge.
