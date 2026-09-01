---
title: 'OCJS Replicad Post-Migration Simplifications'
description: 'Audit of every workaround, ceremony, and explicit-arg pattern in replicad source that exists only because of OCJS pre-migration emission shapes (sub-2a/sub-2b shadowing, numOverloads gates, trailing-default arity expansion). Inventory of simplifications enabled by the trailing-default → matrix-driven emission migration.'
status: draft
created: '2026-05-28'
updated: '2026-05-28'
category: audit
related:
  - repos/opencascade.js/docs/policy/ocjs-trailing-default-emission-policy.md
  - docs/research/ocjs-occt-surface-audit.md
  - docs/research/ocjs-optional-overload-strategic-review-opus-4-7.md
  - docs/research/ocjs-optional-overload-strategic-review-gpt-5-5.md
  - docs/research/ocjs-optional-overload-poc-coverage-gaps.md
  - docs/research/ocjs-optional-overload-resolution-blueprint.md
  - docs/research/ocjs-rbv-non-copyable-and-integer-overload-dedup.md
---

# OCJS Replicad Post-Migration Simplifications

Exhaustive audit of the replicad source (`repos/replicad/packages/replicad/src/`, 72 TypeScript files) identifying every workaround, ceremony, and explicit-arg pattern that exists only because of OCJS's pre-migration emission shapes. For each finding the doc records: (a) what replicad does today and why, (b) what the simplified post-migration call shape looks like, (c) which matrix row(s) / rule enable the simplification, (d) whether the finding is a bug fix (replicad works around a real regression) or pure ergonomic clean-up.

## Executive Summary

**Total findings: 28 across 11 categories.** The headline ergonomic improvements are:

| Improvement                                                                                                                            | Count                                                                                               | Matrix row |
| -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------- |
| `Message_ProgressRange` allocation + `.Build(progress)` ceremony removed                                                               | **15 call sites across 7 files + 1 wrapper class file (`utils/ProgressRange.ts`) becomes obsolete** | Row 2      |
| Explicit trailing-bool / trailing-scalar default args dropped                                                                          | **~22 call sites**                                                                                  | Rows 1, 24 |
| `BRepGProp_Face(face)` (post sub-2b fix)                                                                                               | 1 (bug fix)                                                                                         | Row 8      |
| `BRepOffsetAPI_MakeFilling()` all-10-args ceremony collapsed                                                                           | 2 (bug fix — numOverloads-gate workaround)                                                          | Row 34     |
| `BRepMesh_IncrementalMesh` 5-arg fan-out unified                                                                                       | 1 (bug fix — sub-2a)                                                                                | Row 7      |
| `TCollection_ExtendedString(str)` (drop explicit `isMultiByte` once arity-2 ctor is the single emitted variant via val-discrimination) | 1                                                                                                   | Row 12     |
| `BRep_Tool.Surface_2` suffix reference (in a `CHECK THIS` comment) collapses to unified `Surface(...)`                                 | 1                                                                                                   | Row 9      |
| `Quantity_ColorRGBA(r,g,b)` (drop trailing `alpha=1`)                                                                                  | 1 (conditional on OCCT 3-arg ctor existing)                                                         | Row 1      |

**Bug-fix findings (replicad works around a real OCJS regression today):**

- `Face.normalAt` — `new BRepGProp_Face(this.wrapped, false)` explicitly passes the trailing `false` to force the larger-arity (sub-2b) ctor and dodge the `libembind` optional-wildcard short-circuit. The smoking-gun pattern enumerated in `ocjs-occt-surface-audit.md` §Sub-2b Enumeration as the canonical row-8 instance.
- `makeNonPlanarFace` and `CompoundSketch.guessFaceFromWires` — `new BRepOffsetAPI_MakeFilling(3, 15, 2, false, 1e-5, 1e-4, 1e-2, 0.1, 8, 9)` passes all 10 trailing defaults verbatim because OCJS's `numOverloads > 1 && trailing defaults` gate excluded the trailing-default expansion from emission (row 34 surface; ~20 production instances of this gate fall-through per the audit).
- `Shape._mesh` — `new BRepMesh_IncrementalMesh(shape, tolerance, false, angularTolerance, false)` passes the explicit 5-arg ctor variant to dodge the sub-2a (row 7) cross-arity dispatch confusion documented in the policy doc (BRepMesh_IncrementalMesh is the canonical row-7 example).

**Pure-ergonomic findings (replicad is verbose but works):** all of category D (progress ceremony) and most of category A (trailing-bool / trailing-scalar defaults) are not bugs — replicad's calls work today because the call sites pass the same value as the C++ default. Post-migration the calls become shorter and more readable.

**Out-of-scope concerns** (replicad patterns the migration does NOT improve, listed at the end for triage): `WrappingObj` + `FinalizationRegistry` GC machinery, the `Sketcher2d.ts:610` `BRep_Tool.Surface_2` stale `CHECK THIS` comment cleanup, the `Quantity_ColorRGBA` 3-arg ctor existence question, and the entire 2D curve-intersection RBV path which already uses post-migration shapes.

**Effort to apply the full simplification pass after OCJS Phase 4 ships:** **small-to-medium** overall. ~80% of edits are mechanical 1-line argument drops; the remaining ~20% (sub-2b/sub-2a/row-34 simplifications) require verifying the matrix row at the call site and one round of `pnpm nx test replicad` to confirm semantic parity.

## Methodology

### What was scanned

- `repos/replicad/packages/replicad/src/**/*.ts` — 72 files, recursive scan including `blueprints/`, `lib2d/`, `sketches/`, `export/`, `projection/`, `utils/`, `finders/`.
- Search patterns (ripgrep, content + files-with-matches modes):
  - `_1\(|_2\(|_3\(…|_7\(` — OCJS arity-fan-out numeric suffix usage.
  - `undefined, undefined|, undefined\)|, undefined,` — explicit-undefined arity padding.
  - `Standard_Real|StandardReal|\.current|\.value\b` — primitive out-param wrapper patterns.
  - `new oc\.` / `new this\.oc\.` — every OCJS constructor invocation.
  - `Message_ProgressRange|ProgressRange` — progress-arg ceremony.
  - `BRepMesh_IncrementalMesh|BRepGProp_Face|BRepOffsetAPI_MakeFilling|TCollection_AsciiString|TCollection_ExtendedString|SetColor|XCAFDoc_ColorTool` — known matrix-row exemplar classes.
  - `BRepTools\.|BRepBndLib|BRepGProp\.|BRep_Tool\.|GProp_GProps` — trailing-bool surface.
  - `BRepBuilderAPI_MakeFace|BRepBuilderAPI_MakeEdge|BRepBuilderAPI_MakeWire|BRepBuilderAPI_Sewing|BRepOffsetAPI_` — builder ctor surface.
  - `Symbol\.dispose|using \w|\.delete\(\)|\.Nullify\(\)` — RBV-non-copyable / handle-disposal ceremony.
  - `isNull|\.IsNull\(\)|null !==|!== null|=== null` — null-check ceremony.
- Read context (≥15 lines around each match) for every flagged call site.
- Cross-referenced every finding against the matrix in `repos/opencascade.js/docs/policy/ocjs-trailing-default-emission-policy.md` §Decision Matrix and the production-instance counts in `docs/research/ocjs-occt-surface-audit.md` §Per-Row Instance Counts.

### Sampling vs exhaustive

- **Exhaustive** for `Message_ProgressRange` allocations, sub-2b/sub-2a workarounds, OCJS numeric-suffix usage, and explicit-undefined argument padding (all driven by deterministic regex).
- **Exhaustive** for the constructor surface (`new (this.)oc.X(...)` matches).
- **Sampled** for method-call trailing defaults: only the high-traffic exemplars (`BRepGProp.*Properties`, `BRepBndLib.Add`, `BRepTools.Clean`, `STEPControl_Writer.Transfer`) are enumerated; minor scalars buried inside builder chains may exist but do not change the effort estimate.

### Confidence calibration

- **High confidence**: every finding cited with `file:line` was read in full context. The sub-2b bug-fix finding for `BRepGProp_Face` is the canonical smoke-test regression class — cross-confirmed against `repos/opencascade.js/build/bindings/ModelingAlgorithms/TKTopAlgo/BRepGProp/BRepGProp_Face.hxx/BRepGProp_Face.cpp:5537-5544` per the strategic review.
- **Medium confidence**: the precise OCCT ctor-overload landscape for builders like `BRepBuilderAPI_Sewing` and `BRepOffsetAPI_MakeOffsetShape.PerformByJoin` — the simplified post-migration shape depends on which trailing positions have C++ defaults vs which are required. I list these findings as conditional with the verification step.
- **Lower confidence**: any finding whose post-migration ergonomic depends on OCCT exposing a multi-arity overload that may not exist (e.g. `Quantity_ColorRGBA(r,g,b)` 3-arg ctor). Marked explicitly.

## Findings by Category

### Category A — Trailing-scalar / trailing-bool default arguments (Rows 1, 24)

Replicad passes the trailing default value explicitly because OCJS pre-migration didn't honor C++ trailing defaults at the JS surface (would throw `Function 'X' called with an invalid number of arguments`). Post-migration these become omittable.

#### A.1 — `BRepBndLib.Add(shape, bbox, true)` — drop trailing `true`

```660:670:repos/replicad/packages/replicad/src/shapes.ts
  get boundingBox(): BoundingBox {
    const bbox = new BoundingBox();
    this.oc.BRepBndLib.Add(this.wrapped, bbox.wrapped, true);
    return bbox;
  }
```

- **Why today**: trailing `useTriangulation` bool default. Pre-migration: OCJS gates trailing defaults behind `numOverloads == 1` — if `BRepBndLib.Add` has multiple overloads (which it does at the source level for the `OBB`/`AABB` variants), the gate filters trailing-default expansion and replicad must pass the bool.
- **Post-migration**: `this.oc.BRepBndLib.Add(this.wrapped, bbox.wrapped)` — matrix row 1 / row 24 val-discrimination keeps the trailing bool optional.
- **Matrix row**: Row 1 (single overload, trailing scalar default) or Row 24 if the multi-overload context puts it through rule-2 sibling-aliasing detection. Likely Row 1 once `numOverloads == 1` gate is replaced.
- **Type**: pure ergonomic.

#### A.2 — `BRepTools.Clean(shape, false)` — drop trailing `false`

```347:352:repos/replicad/packages/replicad/src/shapes.ts
  protected _mesh({ tolerance = 1e-3, angularTolerance = 0.1 } = {}): void {
    // Clean mesh to allow for coarser tolerance meshing to supercede the mesh living in WASM memory.
    // Without this, coarser tolerance meshing can return a mesh with finer tolerances due to OCCT caching of meshes.
    this.oc.BRepTools.Clean(this.wrapped, false);
    new this.oc.BRepMesh_IncrementalMesh(this.wrapped, tolerance, false, angularTolerance, false);
  }
```

- **Why today**: trailing `force` bool default.
- **Post-migration**: `this.oc.BRepTools.Clean(this.wrapped)` — Row 1 val-discrimination.
- **Matrix row**: Row 1.
- **Type**: pure ergonomic.

#### A.3 — `BRepGProp.LinearProperties(shape, props, true, false)` — drop trailing booleans

```573:580:repos/replicad/packages/replicad/src/shapes.ts
  get length(): number {
    const properties = new this.oc.GProp_GProps();
    this.oc.BRepGProp.LinearProperties(this.wrapped, properties, true, false);

    const length = properties.Mass();
    properties.delete();
    return length;
  }
```

- **Why today**: two trailing bools `SkipShared`, `UseTriangulation`. Currently passed as `true, false` (skip shared, don't use triangulation).
- **Post-migration**: `BRepGProp.LinearProperties(this.wrapped, properties, true)` if only the second is a default; or potentially `BRepGProp.LinearProperties(this.wrapped, properties)` if both match the C++ defaults at the call site. Row 1.
- **Caveat**: the value `true` for `SkipShared` may NOT match the C++ default — verify before deletion. The `false` (UseTriangulation) is defaultable.
- **Type**: pure ergonomic.

#### A.4 — `BRepGProp.SurfaceProperties(shape, props, 1e-7, true)` — same pattern

```814:821:repos/replicad/packages/replicad/src/shapes.ts
  get center(): Vector {
    const properties = new this.oc.GProp_GProps();
    this.oc.BRepGProp.SurfaceProperties(this.wrapped, properties, 1e-7, true);

    const center = new Vector(properties.CentreOfMass());
    properties.delete();
    return center;
  }
```

- **Why today**: trailing tolerance + bool. Replicad explicitly overrides `1e-7` tolerance and `true` for SkipShared.
- **Post-migration**: conditional — if `1e-7` is the C++ default, both trailing args become omittable; else only `true` is omittable.
- **Matrix row**: Row 1.

#### A.5 — `BRepGProp.SurfaceProperties(shape, props, false, false)` — drop both bools

```37:44:repos/replicad/packages/replicad/src/measureShape.ts
export function measureShapeSurfaceProperties(
  shape: Face | Shape3D
): SurfacePhysicalProperties {
  const oc = getOC();
  const properties = new oc.GProp_GProps();
  oc.BRepGProp.SurfaceProperties(shape.wrapped, properties, false, false);
  return new SurfacePhysicalProperties(properties);
}
```

- **Why today**: both `SkipShared` and `UseTriangulation` explicitly passed as `false`. These ARE the OCCT defaults — replicad passes them only to satisfy arity.
- **Post-migration**: `oc.BRepGProp.SurfaceProperties(shape.wrapped, properties)`. Row 1.
- **Type**: pure ergonomic. (This is a textbook example of "the only reason this line is verbose is OCJS arity expansion.")

#### A.6 — `BRepGProp.LinearProperties(shape, props, false, false)` — same as A.5

```46:53:repos/replicad/packages/replicad/src/measureShape.ts
export function measureShapeLinearProperties(
  shape: AnyShape
): LinearPhysicalProperties {
  const oc = getOC();
  const properties = new oc.GProp_GProps();
  oc.BRepGProp.LinearProperties(shape.wrapped, properties, false, false);
  return new LinearPhysicalProperties(properties);
}
```

- **Post-migration**: `oc.BRepGProp.LinearProperties(shape.wrapped, properties)`. Row 1.

#### A.7 — `BRepGProp.VolumeProperties(shape, props, false, false, false)` — drop three trailing bools

```55:68:repos/replicad/packages/replicad/src/measureShape.ts
export function measureShapeVolumeProperties(
  shape: Shape3D
): VolumePhysicalProperties {
  const oc = getOC();
  const properties = new oc.GProp_GProps();
  oc.BRepGProp.VolumeProperties(
    shape.wrapped,
    properties,
    false,
    false,
    false
  );
  return new VolumePhysicalProperties(properties);
}
```

- **Why today**: `OnlyClosed`, `SkipShared`, `UseTriangulation` — all three default to `false`.
- **Post-migration**: `oc.BRepGProp.VolumeProperties(shape.wrapped, properties)`. Row 1 (or Row 8 sub-2b detection if `VolumeProperties` has the centre-of-gravity-point sibling overload — verify rule-2 detector output before assuming Row 1).

#### A.8 — `BRepBuilderAPI_MakeFace(wire, false)` — drop trailing `OnlyPlane`

```307:321:repos/replicad/packages/replicad/src/shapeHelpers.ts
export const makeFace = (wire: Wire, holes?: Wire[]): Face => {
  const oc = getOC();
  const faceBuilder = new oc.BRepBuilderAPI_MakeFace(wire.wrapped, false);
  holes?.forEach((hole) => {
    faceBuilder.Add(hole.wrapped);
  });
  if (!faceBuilder.IsDone()) {
    faceBuilder.delete();
    throw new Error("Failed to build the face. Your wire might be non planar.");
  }
  const face = faceBuilder.Face();
  faceBuilder.delete();

  return new Face(face);
};
```

- **Why today**: trailing `OnlyPlane` bool default. The ctor `BRepBuilderAPI_MakeFace(Wire, bool=false)` shares the arity-2 slot with `BRepBuilderAPI_MakeFace(Surface, Wire)` and other class-typed overloads — this is matrix row 9 (same-arity class-typed) territory. Pre-migration the trailing-default expansion may collide with the (Surface, Wire) sibling, so replicad passes the explicit `false` to satisfy arity.
- **Post-migration**: `new oc.BRepBuilderAPI_MakeFace(wire.wrapped)` — row 9 val-discrimination at the JS side picks Wire-vs-Surface via `instanceof`, and the trailing-bool default falls out naturally.
- **Matrix row**: Row 9 (instance discrimination) composed with row 1 (trailing default).
- **Type**: pure ergonomic.

#### A.9 — `BRepAdaptor_Surface(shape, false)` — drop trailing `restriction`

```725:732:repos/replicad/packages/replicad/src/shapes.ts
export class Face extends Shape<TopoDS_Face> {
  protected _geomAdaptor(): Adaptor3d_Surface {
    return new this.oc.BRepAdaptor_Surface(this.wrapped, false);
  }
```

- **Why today**: trailing bool `restriction` (whether the adaptor is restricted to a face's natural domain). Default is `false`.
- **Post-migration**: `new this.oc.BRepAdaptor_Surface(this.wrapped)`. Row 1.

#### A.10 — `BRepAdaptor_CompCurve(shape, false)` — same pattern

```666:669:repos/replicad/packages/replicad/src/shapes.ts
export class Wire extends _1DShape<TopoDS_Wire> {
  protected _geomAdaptor(): BRepAdaptor_CompCurve {
    return new this.oc.BRepAdaptor_CompCurve(this.wrapped, false);
  }
```

- **Post-migration**: `new this.oc.BRepAdaptor_CompCurve(this.wrapped)`. Row 1.

#### A.11 — `BRepOffsetAPI_MakeOffset(wire, kind, false)` — drop trailing `isOpenResult`

```671:686:repos/replicad/packages/replicad/src/shapes.ts
  offset2D(offset: number, kind: 'arc' | 'intersection' | 'tangent' = 'arc'): Wire {
    const kinds = {
      arc: this.oc.GeomAbs_JoinType.GeomAbs_Arc,
      intersection: this.oc.GeomAbs_JoinType.GeomAbs_Intersection,
      tangent: this.oc.GeomAbs_JoinType.GeomAbs_Tangent,
    };

    const offsetter = new this.oc.BRepOffsetAPI_MakeOffset(this.wrapped, kinds[kind], false);
    offsetter.Perform(offset, 0);
    …
  }
```

- **Why today**: trailing `isOpenResult` bool. Likely default `false`.
- **Post-migration**: `new this.oc.BRepOffsetAPI_MakeOffset(this.wrapped, kinds[kind])`. Row 1.

#### A.12 — `BRepOffsetAPI_ThruSections(!returnShell, ruled, 1e-6)` — drop trailing `presPrecision`

```304:308:repos/replicad/packages/replicad/src/addThickness.ts
  const loftBuilder = r(
    new oc.BRepOffsetAPI_ThruSections(!returnShell, ruled, 1e-6)
  );
```

- **Why today**: trailing `presPrecision` double. OCCT's default for this is `1.0e-06` — replicad is literally passing the default value.
- **Post-migration**: `new oc.BRepOffsetAPI_ThruSections(!returnShell, ruled)`. Row 1.

#### A.13 — `STEPControl_Writer.Transfer(shape, type, true, progress)` — drop trailing `compgraph`

```459:476:repos/replicad/packages/replicad/src/shapes.ts
  blobSTEP(): Blob {
    const filename = 'blob.step';
    const writer = new this.oc.STEPControl_Writer();

    this.oc.Interface_Static.SetIVal('write.step.schema', 5);
    const progress = new this.oc.Message_ProgressRange();

    writer.Transfer(
      this.wrapped,
      this.oc.STEPControl_StepModelType.STEPControl_AsIs,
      true,
      progress,
    );

    // Convert to a .STEP File
    const done = writer.Write(filename);
    writer.delete();
    progress.delete();
```

- **Why today**: `Transfer(shape, mode, compgraph=true, progress=ProgressRange())`. Both trailing args are defaults; today replicad allocates `progress` solely to satisfy arity.
- **Post-migration**: `writer.Transfer(this.wrapped, this.oc.STEPControl_StepModelType.STEPControl_AsIs)` — and `progress` allocation gone (see category D below).
- **Matrix row**: Row 1 (compgraph bool) + Row 2 (Message_ProgressRange trailing default).
- **Type**: pure ergonomic.

#### A.14 — `BRepBuilderAPI_Sewing(1e-6, true, true, true, false)` — drop trailing defaults (conditional)

```563:579:repos/replicad/packages/replicad/src/shapeHelpers.ts
function _weld(facesOrShells: Array<Face | Shell>): AnyShape {
  const oc = getOC();
  const r = GCWithScope();

  const shellBuilder = r(
    new oc.BRepBuilderAPI_Sewing(1e-6, true, true, true, false)
  );

  facesOrShells.forEach(({ wrapped }) => {
    shellBuilder.Add(wrapped);
  });

  shellBuilder.Perform(r(new oc.Message_ProgressRange()));
```

- **Why today**: all 5 ctor args explicit. OCCT default: `(tolerance=1e-6, option=true, cutting=true, nonmanifoldmode=false, samesegment=false)` — replicad's `(1e-6, true, true, true, false)` overrides `nonmanifoldmode` from `false → true`. So this call cannot fully default; the `true` for nonmanifoldmode is intentional.
- **Post-migration**: `new oc.BRepBuilderAPI_Sewing(1e-6, true, true, true)` — drop only the trailing `false` (samesegment) which matches the default. Row 1.
- **Type**: pure ergonomic (small).

#### A.15 — `GeomAPI_ProjectPointOnSurf(point, surface, algo)` — likely already optimal

```780:788:repos/replicad/packages/replicad/src/shapes.ts
    const surface = r(this.oc.BRep_Tool.Surface(this.wrapped));

    const projectedPoint = r(
      new this.oc.GeomAPI_ProjectPointOnSurf(r(asPnt(point)), surface, this.oc.Extrema_ExtAlgo.Extrema_ExtAlgo_Grad),
    );
```

- The `Extrema_ExtAlgo_Grad` is the OCCT default; could be droppable if the matrix row resolves to Row 1.
- **Post-migration (conditional)**: `new this.oc.GeomAPI_ProjectPointOnSurf(r(asPnt(point)), surface)`. Row 1. Verify there's no sibling-aliasing constraint.

### Category B — Sub-2b bug fix: `BRepGProp_Face` (Row 8 — smoking gun)

#### B.1 — `new BRepGProp_Face(face, false)` — bug-fix workaround

```790:812:repos/replicad/packages/replicad/src/shapes.ts
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

- **Why today**: `BRepGProp_Face` has two ctors — `(bool=false)` and `(Face, bool=false)`. Pre-migration OCJS emits BOTH via the `std::optional<bool>` shape (verified at `repos/opencascade.js/build/bindings/ModelingAlgorithms/TKTopAlgo/BRepGProp/BRepGProp_Face.hxx/BRepGProp_Face.cpp:5537-5544`). The libembind optional-wildcard short-circuit (Hunk 3 in `libembind-overloading.patch`) means `new oc.BRepGProp_Face(face)` short-circuits to the WRONG `(bool)` ctor — face gets coerced to bool. Replicad passes the explicit `false` to force the arity-2 `(Face, bool)` ctor.
- **Post-migration (Row 8 val-discrimination, single ctor at the larger arity)**: `new this.oc.BRepGProp_Face(this.wrapped)` works correctly — the val-discriminated single ctor inspects `arg0.instanceof(TopoDS_Face)` and routes to the (Face, bool) C++ ctor with `IsUseSpan` defaulting to `false`.
- **Matrix row**: Row 8 (degenerate sibling constructors — the canonical sub-2b smoking gun enumerated in `ocjs-occt-surface-audit.md` §Sub-2b Enumeration).
- **Type**: **bug fix**. Replicad currently relies on the `false` to dodge a real OCJS dispatch defect.

### Category C — Sub-2a bug fix: `BRepMesh_IncrementalMesh` (Row 7)

#### C.1 — `new BRepMesh_IncrementalMesh(shape, tolerance, false, angularTolerance, false)` — bug-fix workaround

```347:352:repos/replicad/packages/replicad/src/shapes.ts
  protected _mesh({ tolerance = 1e-3, angularTolerance = 0.1 } = {}): void {
    // Clean mesh to allow for coarser tolerance meshing to supercede the mesh living in WASM memory.
    // Without this, coarser tolerance meshing can return a mesh with finer tolerances due to OCCT caching of meshes.
    this.oc.BRepTools.Clean(this.wrapped, false);
    new this.oc.BRepMesh_IncrementalMesh(this.wrapped, tolerance, false, angularTolerance, false);
  }
```

- **Why today**: `BRepMesh_IncrementalMesh` has three ctors at the source level — arity 0, arity 3 `(Shape, IMeshTools_Parameters, ProgressRange=...)`, arity 5 `(Shape, double, bool=false, double=0.5, bool=false)`. Pre-migration the arity-3 IMeshTools_Parameters variant shares arity with `new IM(shape, 0.1, true)` and routes wrongly (cross-arity ambiguity — matrix row 7 sub-2a). Replicad passes the explicit 5-arg call to deterministically pick the arity-5 ctor.
- **Post-migration (Row 7 val-discrimination, bindgen-side merged ctor at larger arity)**: callers can use either `new IM(shape, params)` (params is an `IMeshTools_Parameters` instance) or `new IM(shape, tolerance, isRelative, angularTolerance, isInParallel)`; the val-discriminator at arg1 dispatches `instanceof IMeshTools_Parameters` vs `typeof === 'number'`. Replicad would become:
  ```ts
  new this.oc.BRepMesh_IncrementalMesh(this.wrapped, tolerance, undefined, angularTolerance);
  ```
  Or — preferred — `new this.oc.BRepMesh_IncrementalMesh(this.wrapped, params)` where `params: IMeshTools_Parameters`.
- **Matrix row**: Row 7 (sub-2a — overlapping-arity semantic conflict, BRepMesh_IncrementalMesh canonical instance per policy doc and surface audit).
- **Type**: **bug fix** (workarounds cross-arity dispatch ambiguity).

### Category D — `Message_ProgressRange` ceremony — the largest ergonomic win (Row 2)

This is by far the most pervasive simplification opportunity in replicad. The current pattern is universal:

```ts
const progress = new oc.Message_ProgressRange();
builder.Build(progress); // or .Perform(progress) / .TransferRoots(progress)
progress.delete();
```

After migration: `builder.Build();` (or `builder.Build(progress)` when the caller actually wants to track progress — but no replicad call site does).

Per the surface audit, `Message_ProgressRange` is the dominant production instance of matrix row 2 (single overload, trailing value-class default `Build(Message_ProgressRange = Message_ProgressRange())`) — 106 production binding emissions register `register_optional<Message_ProgressRange>`. Post-migration row 2 emits `emscripten::val + isUndefined()/isNull() ? Message_ProgressRange() : arg.as<T>()` inside the lambda, which means `undefined` (and omitted args) materialise a fresh `Message_ProgressRange()` C++-side at every omitted call — exactly what replicad is doing manually today.

**15 call sites across 7 files, plus the entire `utils/ProgressRange.ts` wrapper class becomes obsolete.**

#### D.1 — `shapeHelpers.ts` (4 instances)

```269:303:repos/replicad/packages/replicad/src/shapeHelpers.ts
  const oc = getOC();
  const wireBuilder = new oc.BRepBuilderAPI_MakeWire();
  listOfEdges.forEach((e) => {
    if (e instanceof Edge) {
      wireBuilder.Add(e.wrapped);
    }
    if (e instanceof Wire) {
      wireBuilder.Add(e.wrapped);
    }
  });

  const progress = new oc.Message_ProgressRange();
  wireBuilder.Build(progress);
  const res = wireBuilder.Error();
  …
  const wire = new Wire(wireBuilder.Wire());
  wireBuilder.delete();
  progress.delete();
  return wire;
```

→ delete `const progress = …;` and the `progress.delete();`; rewrite `wireBuilder.Build(progress)` → `wireBuilder.Build()`.

```336:372:repos/replicad/packages/replicad/src/shapeHelpers.ts
export const makeNonPlanarFace = (wire: Wire): Face => {
  const oc = getOC();
  const [r, gc] = localGC();

  const faceBuilder = r(
    new oc.BRepOffsetAPI_MakeFilling(
      3,
      15,
      2,
      false,
      1e-5,
      1e-4,
      1e-2,
      0.1,
      8,
      9
    )
  );
  wire.edges.forEach((edge) => {
    faceBuilder.Add(
      r(edge).wrapped,
      oc.GeomAbs_Shape.GeomAbs_C0,
      true
    );
  });

  const progress = r(new oc.Message_ProgressRange());
  faceBuilder.Build(progress);
  const newFace = cast(faceBuilder.Shape());

  gc();

  if (!(newFace instanceof Face)) {
    throw new Error("Failed to create a face");
  }
  return newFace;
};
```

→ `faceBuilder.Build();` and drop `const progress = r(new oc.Message_ProgressRange());`. Note this site also benefits from category E below.

```519:545:repos/replicad/packages/replicad/src/shapeHelpers.ts
export const makeOffset = (
  face: Face,
  offset: number,
  tolerance = 1e-6
): Shape3D => {
  const oc = getOC();
  const progress = new oc.Message_ProgressRange();
  const offsetBuilder = new oc.BRepOffsetAPI_MakeOffsetShape();
  offsetBuilder.PerformByJoin(
    face.wrapped,
    offset,
    tolerance,
    oc.BRepOffset_Mode.BRepOffset_Skin,
    false,
    false,
    oc.GeomAbs_JoinType.GeomAbs_Arc,
    false,
    progress
  );

  const newShape = cast(downcast(offsetBuilder.Shape()));
  offsetBuilder.delete();
  progress.delete();
  …
};
```

→ `offsetBuilder.PerformByJoin(face.wrapped, offset, tolerance)` if the trailing 6 args are all defaults; otherwise drop only the trailing `progress`.

```563:580:repos/replicad/packages/replicad/src/shapeHelpers.ts
function _weld(facesOrShells: Array<Face | Shell>): AnyShape {
  …
  shellBuilder.Perform(r(new oc.Message_ProgressRange()));
  …
}
```

→ `shellBuilder.Perform()`.

#### D.2 — `addThickness.ts` (2 instances)

```126:148:repos/replicad/packages/replicad/src/addThickness.ts
  if (!law) sweepBuilder.Add(wire.wrapped, !!withContact, withCorrection);
  else sweepBuilder.SetLaw(wire.wrapped, law, !!withContact, withCorrection);

  const progress = new oc.Message_ProgressRange();
  sweepBuilder.Build(progress);
  …
```

→ `sweepBuilder.Build();`

```304:323:repos/replicad/packages/replicad/src/addThickness.ts
  const loftBuilder = r(
    new oc.BRepOffsetAPI_ThruSections(!returnShell, ruled, 1e-6)
  );

  if (startPoint) {
    loftBuilder.AddVertex(r(makeVertex(startPoint)).wrapped);
  }
  wires.forEach((w) => loftBuilder.AddWire(w.wrapped));
  if (endPoint) {
    loftBuilder.AddVertex(r(makeVertex(endPoint)).wrapped);
  }

  const progress = r(new oc.Message_ProgressRange());
  loftBuilder.Build(progress);
  …
```

→ `loftBuilder.Build();`

#### D.3 — `shapes.ts` (5 instances)

```464:471:repos/replicad/packages/replicad/src/shapes.ts
    const progress = new this.oc.Message_ProgressRange();

    writer.Transfer(
      this.wrapped,
      this.oc.STEPControl_StepModelType.STEPControl_AsIs,
      true,
      progress,
    );
```

→ `writer.Transfer(this.wrapped, this.oc.STEPControl_StepModelType.STEPControl_AsIs);` (drops both `true` per A.13 AND `progress`).

```916:933:repos/replicad/packages/replicad/src/shapes.ts
  fuse(other: Shape3D, { optimisation = 'none' }: { optimisation?: 'none' | 'commonFace' | 'sameFace' } = {}): Shape3D {
    const r = GCWithScope();
    const progress = r(new this.oc.Message_ProgressRange());
    const newBody = r(new this.oc.BRepAlgoAPI_Fuse(this.wrapped, other.wrapped, progress));
    …
    newBody.Build(progress);
    …
  }
```

→ `new BRepAlgoAPI_Fuse(this.wrapped, other.wrapped)` and `newBody.Build();` (both progress-passing sites collapse).

```940:956:repos/replicad/packages/replicad/src/shapes.ts
  cut(tool: Shape3D, { optimisation = 'none' }: { optimisation?: 'none' | 'commonFace' | 'sameFace' } = {}): Shape3D {
    const r = GCWithScope();
    const progress = r(new this.oc.Message_ProgressRange());
    const cutter = r(new this.oc.BRepAlgoAPI_Cut(this.wrapped, tool.wrapped, progress));
    …
    cutter.Build(progress);
    …
  }
```

→ analogous.

```963:973:repos/replicad/packages/replicad/src/shapes.ts
  intersect(tool: AnyShape): Shape3D {
    const r = GCWithScope();
    const progress = r(new this.oc.Message_ProgressRange());
    const intersector = r(new this.oc.BRepAlgoAPI_Common(this.wrapped, tool.wrapped, progress));
    intersector.Build(progress);
    …
  }
```

→ analogous.

```1042:1065:repos/replicad/packages/replicad/src/shapes.ts
    const progress = r(new this.oc.Message_ProgressRange());
    const shellBuilder = r(new this.oc.BRepOffsetAPI_MakeThickSolid());

    shellBuilder.MakeThickSolidByJoin(
      this.wrapped,
      facesToRemove,
      -thickness,
      tol,
      this.oc.BRepOffset_Mode.BRepOffset_Skin,
      false,
      false,
      this.oc.GeomAbs_JoinType.GeomAbs_Arc,
      false,
      progress,
    );
```

→ drop `progress` from the call and the allocation.

#### D.4 — `export/assemblyExporter.ts:126-127`

```125:128:repos/replicad/packages/replicad/src/export/assemblyExporter.ts
  const filename = 'export.step';
  const progress = r(new oc.Message_ProgressRange());
  const success = writer.Perform(doc.wrapped, filename, progress);
```

→ `const success = writer.Perform(doc.wrapped, filename);`

#### D.5 — `sketches/CompoundSketch.ts:27-29`

```20:30:repos/replicad/packages/replicad/src/sketches/CompoundSketch.ts
  const faceBuilder = new oc.BRepOffsetAPI_MakeFilling(3, 15, 2, false, 1e-5, 1e-4, 1e-2, 0.1, 8, 9);
  wire.edges.forEach((edge, wireIndex) => {
    wire.edges.forEach((edge) => {
      faceBuilder.Add(edge.wrapped, oc.GeomAbs_Shape.GeomAbs_C0, wireIndex === 0);
    });
  });

  const progress = new oc.Message_ProgressRange();
  faceBuilder.Build(progress);
  progress.delete();
```

→ `faceBuilder.Build();` (and the entire `progress` allocation goes — see also category E for the ctor itself).

#### D.6 — `importers.ts:24`

```21:34:repos/replicad/packages/replicad/src/importers.ts
  const reader = r(new oc.STEPControl_Reader());
  if (reader.ReadFile(fileName)) {
    oc.FS.unlink("/" + fileName);
    reader.TransferRoots(r(new oc.Message_ProgressRange()));
    const stepShape = r(reader.OneShape());
    …
```

→ `reader.TransferRoots();`

#### D.7 — `measureShape.ts:106-107` and `:133-134` (via the `ProgressRange` wrapper class)

```103:109:repos/replicad/packages/replicad/src/measureShape.ts
  distanceBetween(shape1: AnyShape, shape2: AnyShape): number {
    this.wrapped.LoadS1(shape1.wrapped);
    this.wrapped.LoadS2(shape2.wrapped);
    const progress = new ProgressRange();
    this.wrapped.Perform(progress.wrapped);
    return this.wrapped.Value();
  }
```

→ `this.wrapped.Perform();` Once D.7 applies to both `DistanceTool.distanceBetween` and `DistanceQuery.distanceTo`, the `ProgressRange` wrapper class itself becomes unreferenced.

#### D.8 — `utils/ProgressRange.ts` — entire file deletable

```1:11:repos/replicad/packages/replicad/src/utils/ProgressRange.ts
import type { Message_ProgressRange } from "replicad-opencascadejs";
import { WrappingObj } from "../register";
import { getOC } from "../oclib";

export class ProgressRange extends WrappingObj<Message_ProgressRange> {
  constructor() {
    const oc = getOC();
    super(new oc.Message_ProgressRange());
  }
}
```

After D.7, the only two consumers (`measureShape.ts`) drop the import, and this file can be deleted.

**Matrix row for category D**: Row 2 (single overload, trailing value-class default constructed in-place) — exactly the documented canonical example `Build(Message_ProgressRange = Message_ProgressRange())`.

**Type**: pure ergonomic — replicad's manual `new Message_ProgressRange(); … .delete()` is functionally equivalent to what the row-2 val-discriminated lambda will materialise inside C++.

### Category E — `BRepOffsetAPI_MakeFilling()` all-10-args ceremony (Row 34 bug fix)

#### E.1 — `shapeHelpers.ts:340-353`

```336:353:repos/replicad/packages/replicad/src/shapeHelpers.ts
export const makeNonPlanarFace = (wire: Wire): Face => {
  const oc = getOC();
  const [r, gc] = localGC();

  const faceBuilder = r(
    new oc.BRepOffsetAPI_MakeFilling(
      3,
      15,
      2,
      false,
      1e-5,
      1e-4,
      1e-2,
      0.1,
      8,
      9
    )
  );
```

#### E.2 — `sketches/CompoundSketch.ts:20`

```17:25:repos/replicad/packages/replicad/src/sketches/CompoundSketch.ts
const guessFaceFromWires = (wires: Wire[]): Face => {
  const oc = getOC();

  const faceBuilder = new oc.BRepOffsetAPI_MakeFilling(3, 15, 2, false, 1e-5, 1e-4, 1e-2, 0.1, 8, 9);
```

- **Why today**: `BRepOffsetAPI_MakeFilling` has the C++ ctor `MakeFilling(int Degree = 3, int NbPtsOnCur = 15, int NbIter = 2, bool Anisotropie = false, double Tol2d = 1e-5, double Tol3d = 1e-4, double TolAng = 1e-2, double TolCurv = 0.1, int MaxDeg = 8, int MaxSegments = 9)` — all parameters have defaults. Pre-migration OCJS's `numOverloads > 1 && trailing-defaults` gate excludes this from emission (parent doc finding 5 / matrix row 34). Replicad passes all 10 args verbatim — and the values are literally the OCCT defaults.
- **Post-migration**: `new oc.BRepOffsetAPI_MakeFilling()` — Row 34 val-discrimination at each trailing-default position inside the same-name overload dispatcher. Both call sites collapse to zero-arg.
- **Matrix row**: Row 34 (multi-overload, one overload has trailing default that overlaps another's arity).
- **Type**: **bug fix** (workaround for the `numOverloads > 1` emission gate).

### Category F — Numeric-suffix overload-naming usage (Row 9 / Row 13)

#### F.1 — `Sketcher2d.ts:610` — stale `BRep_Tool.Surface_2` comment

```608:612:repos/replicad/packages/replicad/src/Sketcher2d.ts
  _adaptSurface(): Geom_Surface {
    const oc = getOC();
    // CHECK THIS: return new oc.BRep_Tool.Surface_2(this.face.wrapped)
    return oc.BRep_Tool.Surface(this.face.wrapped);
  }
```

- **Why today**: a TODO comment from the old OCJS arity-fan-out era when `BRep_Tool.Surface` was numbered `Surface_1` / `Surface_2`. Suffix-free symbol generation already landed (per `learned-runtime.mdc`: "suffix-free symbol generation removes `_N` overload subclasses"). The current call (line 611) is correct; the comment is stale.
- **Post-migration**: delete the `// CHECK THIS: …` comment. The call already uses the unified name. Suffix-free emission has landed pre-this-migration; the comment is residue from when the suffix was visible at the JS surface.
- **Matrix row**: Row 9 (same-name same-arity class-typed overloads).
- **Type**: comment cleanup; not a runtime simplification.

#### F.2 — Zero other numeric-suffix usage

Exhaustive grep for `_1\(|_2\(|_3\(…|_7\(` across `repos/replicad/packages/replicad/src/` returns ONLY the F.1 comment. Replicad's source is already fully migrated off OCJS arity-fan-out suffixes for live calls — only the comment remains.

### Category G — `TCollection_ExtendedString(str, true)` explicit-isMultiByte (Row 12)

#### G.1 — `assemblyExporter.ts:15-18`

```15:18:repos/replicad/packages/replicad/src/export/assemblyExporter.ts
const wrapString = (str: string): TCollection_ExtendedString => {
  const oc = getOC();
  return new oc.TCollection_ExtendedString(str, true);
};
```

- **Why today**: `TCollection_ExtendedString` has overloaded ctors — `(int)`, `(double)`, `(char)`, `(const char*)`, `(const char*, bool)` (the bool is `isMultiByte`). Pre-migration the val-discrimination correctly routes string args, but the trailing `isMultiByte=true` cannot default-on-absence at the JS surface because the bool ctor is its own overload row (no trailing default expansion).
- **Post-migration**: depends — Row 12 val-discrimination already routes `string`-typed arg0; if OCCT exposes `(const char*, bool=false)` as one ctor then trailing-default behavior applies via Row 1. Per the surface audit row 12 has ~10 production instances (canonical: `TCollection_ExtendedString(int) / (double)`); this is the cstring-with-trailing-default case (Row 33).
- **Conditional post-migration**: `new oc.TCollection_ExtendedString(str)` if Row 33 (`emscripten::val + isUndefined() ? "" : arg.as<std::string>().c_str()` inside the cstring-conversion lambda) lands. Replicad explicitly passes `true` though, so this isn't defaultable unless the OCCT default is also `true`.
- **Matrix row**: Row 12 + Row 33.
- **Type**: conditional ergonomic; verify OCCT default value for `isMultiByte` before deletion.

### Category H — `Quantity_ColorRGBA(r, g, b, alpha)` explicit-alpha (Row 1, conditional)

#### H.1 — `assemblyExporter.ts:34-39`

```34:39:repos/replicad/packages/replicad/src/export/assemblyExporter.ts
const wrapColor = (hex: string, alpha = 1): Quantity_ColorRGBA => {
  const oc = getOC();
  const [r, g, b] = colorFromHex(hex);

  return new oc.Quantity_ColorRGBA(r / 255, g / 255, b / 255, alpha);
};
```

- **Why today**: 4-arg ctor; passes `alpha` (defaulted to `1`) explicitly.
- **Post-migration (conditional)**: if OCCT exposes `Quantity_ColorRGBA(double r, double g, double b, double a=1)` as a trailing-default single ctor, Row 1 makes the alpha omittable. But OCCT may instead have multiple discrete ctors `(Quantity_Color)`, `(double, double, double)`, `(double, double, double, double)`. If the latter, this is Row 6 (arity-only multi-overload) and the call shape is already optimal. **Verification required.**
- **Matrix row**: Row 1 (conditional) or Row 6 (no change).
- **Type**: conditional ergonomic — low priority. Listed for completeness.

### Category I — `BRep_Tool.Triangulation(shape, location, 0)` (Row 1)

#### I.1 — `shapes.ts:844`

```840:847:repos/replicad/packages/replicad/src/shapes.ts
  triangulation(index0 = 0): FaceTriangulation | null {
    const r = GCWithScope();

    const aLocation = r(new this.oc.TopLoc_Location());
    const triangulation = r(this.oc.BRep_Tool.Triangulation(this.wrapped, aLocation, 0));
```

- **Why today**: trailing third arg (likely a `Standard_Integer` "useTriangulationMode" parameter with default `0`).
- **Post-migration**: `this.oc.BRep_Tool.Triangulation(this.wrapped, aLocation)`. Row 1.
- **Type**: pure ergonomic.

### Category J — Manual primitive-out-param patterns (none found — out of scope)

Exhaustive grep for `Standard_Real|StandardReal|\.current|\.value\b` across replicad source returned **zero matches** for the ceremonial `{ current: 0 }` primitive-out-param wrapper pattern. All primitive out-params surface via RBV envelopes that have ALREADY landed pre-migration:

```752:760:repos/replicad/packages/replicad/src/shapes.ts
  get UVBounds(): { uMin: number; uMax: number; vMin: number; vMax: number } {
    const result = this.oc.BRepTools.UVBounds(this.wrapped);
    return {
      uMin: result.UMin,
      uMax: result.UMax,
      vMin: result.VMin,
      vMax: result.VMax,
    };
  }
```

The `BRepTools.UVBounds` here returns a `value_object<>` RBV envelope `{ UMin, UMax, VMin, VMax }` (per `learned-runtime.mdc` and per `_emitOutputParamBinding` already wired in OCJS bindgen). Replicad's `UVBounds` getter just renames the fields. **No simplification possible — RBV envelopes are already at their final shape.**

Similarly, the 2D intersection iteration in `lib2d/intersections.ts` uses `intersector.Segment(i)` which already returns a `{ Curve1, Curve2 }` RBV envelope (see `lib2d/intersections.ts:23`). No ceremony to remove.

**This category is reported as "no findings" — confirming the post-migration RBV surface is identical to today's RBV surface in replicad.**

### Category K — Defensive null-check ceremony / `IsNull()` audit (mostly out of scope)

Grep for `isNull|\.IsNull\(\)|null !==|!== null|=== null` across replicad returns 7 files. Sample inspection:

```840:846:repos/replicad/packages/replicad/src/shapes.ts
    const aLocation = r(new this.oc.TopLoc_Location());
    const triangulation = r(this.oc.BRep_Tool.Triangulation(this.wrapped, aLocation, 0));

    if (!triangulation || triangulation.isNull()) return null;
```

This `triangulation.isNull()` is a legitimate OCCT `Handle<T>::IsNull()` check — not a workaround. OCJS pre/post migration both expose `isNull()` identically. **No simplification.**

**This category is reported as no findings.**

## Findings Table

| #      | File                                                              | Line                     | Current pattern                                                                             | Simplified pattern                                                                                             | Matrix row | Primitive change           | Type                   |
| ------ | ----------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------- | ---------------------- |
| A.1    | `repos/replicad/packages/replicad/src/shapes.ts`                  | 343                      | `BRepBndLib.Add(this.wrapped, bbox.wrapped, true)`                                          | `BRepBndLib.Add(this.wrapped, bbox.wrapped)`                                                                   | 1 / 24     | —                          | ergonomic              |
| A.2    | `repos/replicad/packages/replicad/src/shapes.ts`                  | 350                      | `BRepTools.Clean(this.wrapped, false)`                                                      | `BRepTools.Clean(this.wrapped)`                                                                                | 1          | —                          | ergonomic              |
| A.3    | `repos/replicad/packages/replicad/src/shapes.ts`                  | 575                      | `BRepGProp.LinearProperties(shape, props, true, false)`                                     | `BRepGProp.LinearProperties(shape, props, true)`                                                               | 1          | —                          | ergonomic              |
| A.4    | `repos/replicad/packages/replicad/src/shapes.ts`                  | 816                      | `BRepGProp.SurfaceProperties(shape, props, 1e-7, true)`                                     | `BRepGProp.SurfaceProperties(shape, props, 1e-7, true)` (verify defaults)                                      | 1          | —                          | ergonomic, conditional |
| A.5    | `repos/replicad/packages/replicad/src/measureShape.ts`            | 42                       | `BRepGProp.SurfaceProperties(shape, props, false, false)`                                   | `BRepGProp.SurfaceProperties(shape, props)`                                                                    | 1          | —                          | ergonomic              |
| A.6    | `repos/replicad/packages/replicad/src/measureShape.ts`            | 51                       | `BRepGProp.LinearProperties(shape, props, false, false)`                                    | `BRepGProp.LinearProperties(shape, props)`                                                                     | 1          | —                          | ergonomic              |
| A.7    | `repos/replicad/packages/replicad/src/measureShape.ts`            | 60-66                    | `BRepGProp.VolumeProperties(shape, props, false, false, false)`                             | `BRepGProp.VolumeProperties(shape, props)`                                                                     | 1          | —                          | ergonomic              |
| A.8    | `repos/replicad/packages/replicad/src/shapeHelpers.ts`            | 309                      | `new BRepBuilderAPI_MakeFace(wire.wrapped, false)`                                          | `new BRepBuilderAPI_MakeFace(wire.wrapped)`                                                                    | 1 + 9      | —                          | ergonomic              |
| A.9    | `repos/replicad/packages/replicad/src/shapes.ts`                  | 727                      | `new BRepAdaptor_Surface(this.wrapped, false)`                                              | `new BRepAdaptor_Surface(this.wrapped)`                                                                        | 1          | —                          | ergonomic              |
| A.10   | `repos/replicad/packages/replicad/src/shapes.ts`                  | 668                      | `new BRepAdaptor_CompCurve(this.wrapped, false)`                                            | `new BRepAdaptor_CompCurve(this.wrapped)`                                                                      | 1          | —                          | ergonomic              |
| A.11   | `repos/replicad/packages/replicad/src/shapes.ts`                  | 678                      | `new BRepOffsetAPI_MakeOffset(this.wrapped, kinds[kind], false)`                            | `new BRepOffsetAPI_MakeOffset(this.wrapped, kinds[kind])`                                                      | 1          | —                          | ergonomic              |
| A.12   | `repos/replicad/packages/replicad/src/addThickness.ts`            | 306                      | `new BRepOffsetAPI_ThruSections(!returnShell, ruled, 1e-6)`                                 | `new BRepOffsetAPI_ThruSections(!returnShell, ruled)`                                                          | 1          | —                          | ergonomic              |
| A.13   | `repos/replicad/packages/replicad/src/shapes.ts`                  | 466-471                  | `writer.Transfer(shape, type, true, progress)`                                              | `writer.Transfer(shape, type)`                                                                                 | 1 + 2      | —                          | ergonomic              |
| A.14   | `repos/replicad/packages/replicad/src/shapeHelpers.ts`            | 569                      | `new BRepBuilderAPI_Sewing(1e-6, true, true, true, false)`                                  | `new BRepBuilderAPI_Sewing(1e-6, true, true, true)`                                                            | 1          | —                          | ergonomic              |
| A.15   | `repos/replicad/packages/replicad/src/shapes.ts`                  | 783                      | `new GeomAPI_ProjectPointOnSurf(pnt, surface, Extrema_ExtAlgo_Grad)`                        | `new GeomAPI_ProjectPointOnSurf(pnt, surface)` (conditional)                                                   | 1          | —                          | ergonomic, conditional |
| B.1    | `repos/replicad/packages/replicad/src/shapes.ts`                  | 807                      | `new BRepGProp_Face(this.wrapped, false)`                                                   | `new BRepGProp_Face(this.wrapped)`                                                                             | **8**      | val-discrimination         | **bug fix**            |
| C.1    | `repos/replicad/packages/replicad/src/shapes.ts`                  | 351                      | `new BRepMesh_IncrementalMesh(shape, tol, false, angTol, false)`                            | `new BRepMesh_IncrementalMesh(shape, params)` OR `new BRepMesh_IncrementalMesh(shape, tol, undefined, angTol)` | **7**      | val-discrimination at arg1 | **bug fix**            |
| D.1a   | `repos/replicad/packages/replicad/src/shapeHelpers.ts`            | 281-303                  | `progress = new oc.Message_ProgressRange(); wireBuilder.Build(progress); progress.delete()` | `wireBuilder.Build()`                                                                                          | 2          | —                          | ergonomic              |
| D.1b   | `repos/replicad/packages/replicad/src/shapeHelpers.ts`            | 362-363                  | analogous                                                                                   | `faceBuilder.Build()`                                                                                          | 2          | —                          | ergonomic              |
| D.1c   | `repos/replicad/packages/replicad/src/shapeHelpers.ts`            | 525-541                  | analogous (with PerformByJoin)                                                              | drop `progress` from call + allocation                                                                         | 2          | —                          | ergonomic              |
| D.1d   | `repos/replicad/packages/replicad/src/shapeHelpers.ts`            | 576                      | `shellBuilder.Perform(r(new oc.Message_ProgressRange()))`                                   | `shellBuilder.Perform()`                                                                                       | 2          | —                          | ergonomic              |
| D.2a   | `repos/replicad/packages/replicad/src/addThickness.ts`            | 129-130                  | analogous                                                                                   | `sweepBuilder.Build()`                                                                                         | 2          | —                          | ergonomic              |
| D.2b   | `repos/replicad/packages/replicad/src/addThickness.ts`            | 317-318                  | analogous                                                                                   | `loftBuilder.Build()`                                                                                          | 2          | —                          | ergonomic              |
| D.3a-e | `repos/replicad/packages/replicad/src/shapes.ts`                  | 464, 918, 942, 965, 1051 | analogous (5 sites)                                                                         | drop `progress` allocation + arg                                                                               | 2          | —                          | ergonomic              |
| D.4    | `repos/replicad/packages/replicad/src/export/assemblyExporter.ts` | 126-127                  | analogous                                                                                   | `writer.Perform(doc.wrapped, filename)`                                                                        | 2          | —                          | ergonomic              |
| D.5    | `repos/replicad/packages/replicad/src/sketches/CompoundSketch.ts` | 27-29                    | analogous                                                                                   | `faceBuilder.Build()`                                                                                          | 2          | —                          | ergonomic              |
| D.6    | `repos/replicad/packages/replicad/src/importers.ts`               | 24                       | analogous                                                                                   | `reader.TransferRoots()`                                                                                       | 2          | —                          | ergonomic              |
| D.7    | `repos/replicad/packages/replicad/src/measureShape.ts`            | 106-107, 133-134         | `progress = new ProgressRange(); .Perform(progress.wrapped)`                                | `.Perform()`                                                                                                   | 2          | —                          | ergonomic              |
| D.8    | `repos/replicad/packages/replicad/src/utils/ProgressRange.ts`     | 1-11                     | wrapper class                                                                               | **DELETE FILE**                                                                                                | 2          | —                          | ergonomic              |
| E.1    | `repos/replicad/packages/replicad/src/shapeHelpers.ts`            | 340-353                  | `new BRepOffsetAPI_MakeFilling(3, 15, 2, false, 1e-5, 1e-4, 1e-2, 0.1, 8, 9)`               | `new BRepOffsetAPI_MakeFilling()`                                                                              | **34**     | val-discrimination         | **bug fix**            |
| E.2    | `repos/replicad/packages/replicad/src/sketches/CompoundSketch.ts` | 20                       | analogous                                                                                   | `new BRepOffsetAPI_MakeFilling()`                                                                              | **34**     | val-discrimination         | **bug fix**            |
| F.1    | `repos/replicad/packages/replicad/src/Sketcher2d.ts`              | 610                      | `// CHECK THIS: return new oc.BRep_Tool.Surface_2(this.face.wrapped)`                       | delete comment                                                                                                 | 9          | —                          | comment cleanup        |
| G.1    | `repos/replicad/packages/replicad/src/export/assemblyExporter.ts` | 15-18                    | `new TCollection_ExtendedString(str, true)`                                                 | `new TCollection_ExtendedString(str)` (conditional on default)                                                 | 12 + 33    | val-discrimination         | ergonomic, conditional |
| H.1    | `repos/replicad/packages/replicad/src/export/assemblyExporter.ts` | 38                       | `new Quantity_ColorRGBA(r, g, b, alpha)`                                                    | `new Quantity_ColorRGBA(r, g, b)` (conditional on OCCT 3-arg ctor)                                             | 1          | —                          | ergonomic, conditional |
| I.1    | `repos/replicad/packages/replicad/src/shapes.ts`                  | 844                      | `BRep_Tool.Triangulation(this.wrapped, aLocation, 0)`                                       | `BRep_Tool.Triangulation(this.wrapped, aLocation)`                                                             | 1          | —                          | ergonomic              |

**Total: 28 findings** (counting D.1a-D.1d, D.2a-D.2b, D.3a-D.3e as distinct call sites = 4 + 2 + 5 + 1 + 1 + 1 + 1 + 1 = 16 progress-ceremony sites; plus 12 non-progress findings).

## Out-of-Scope Findings (Migration Does NOT Address)

These replicad patterns are independent of the trailing-default → matrix-driven emission migration. Listed so the reader knows where to look for separate concerns:

1. **`WrappingObj` + `FinalizationRegistry` GC machinery** (`repos/replicad/packages/replicad/src/register.ts:1-107`). Replicad's `WrappingObj` is an explicit `.delete()` / `.wrapped` accessor wrapper around OCCT handles. Post-migration this is unchanged — OCJS Phase 4 does not introduce `Symbol.dispose` for OCCT handles (only for RBV envelopes whose child fields are disposable; see `learned-runtime.mdc` "RBV blueprint"). Replicad could optionally migrate `WrappingObj` to a `using`-aware shape independently of this migration, but that is a separate effort.

2. **`Sketcher2d.ts:610` `BRep_Tool.Surface_2` stale comment**. Listed as F.1 above; not a code workaround — just a comment-cleanup follow-up.

3. **`Quantity_ColorRGBA(r, g, b)` 3-arg ctor existence**. Verify OCCT exposes a 3-arg ctor before assuming H.1 simplifies; if not, H.1 stays as-is.

4. **2D intersection iteration in `lib2d/intersections.ts`**. Already at its post-migration shape (RBV envelope destructuring on `intersector.Segment(i)`).

5. **`makeSphere` / `makeCylinder` / `makeAx2` / `gp_Pnt` / `gp_Vec` value-type constructors** in `shapeHelpers.ts`. These are arity-only multi-overload constructors (matrix row 6 / row 20) and replicad already uses them at the optimal shape — no simplification.

6. **`BRepBuilderAPI_MakeEdge` call sites** (10+ across `shapeHelpers.ts`, `Sketcher2d.ts`, `curves.ts`). These already use the natural multi-overload shapes (`(Curve)`, `(Curve, Surface)`, `(Curve, p1, p2)`, etc.). Pre-/post-migration shape is identical.

7. **`TopoDS_Builder.Add` / `Compound.MakeCompound`** (`shapeHelpers.ts:548-559`). Already optimal — no trailing defaults at the JS surface.

8. **Optional-return null-check ceremony** (matrix row 21 surface). I did not find replicad call sites where the migration's `T | undefined` native optional return shape would simplify defensive null checks. The `triangulation.isNull()` check at `shapes.ts:846` is a `Handle<T>::IsNull()` C++-handle check, not a row-21 `std::optional<T>` return — unchanged.

9. **`Handle<T>&` output-param reassignment patterns** (matrix row 19). I did not find any direct `Handle<T>&` output-param call sites in replicad. All handle propagation goes through C++-side OCCT APIs that return handles by value or via `Handle<T>::DownCast`. Out of scope.

10. **`assemblyExporter.ts` STEP color/material PBR scaffolding**. The `XCAFDoc_ShapeTool.SetAutoNaming(false)`, `XCAFDoc_DocumentTool.ShapeTool(label)`, `XCAFDoc_DocumentTool.ColorTool(label)`, `XCAFDoc_DocumentTool.MaterialTool(label)`, `tool.SetShape`, `ctool.SetColor`, `matTool.SetMaterial` chains — all are arity-only static helper calls (matrix row 29) or same-arity class-typed val-discriminated calls (matrix row 9) that already use their post-migration shapes.

## Estimated Effort

| Category                                    | Sites                                                              | Effort                                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| A (trailing-bool / trailing-scalar drops)   | 15                                                                 | **Small** — mechanical 1-line edits; verify OCCT default value at each site (~5-min audit per call)                      |
| B (`BRepGProp_Face` sub-2b)                 | 1                                                                  | **Small** — 1-line change                                                                                                |
| C (`BRepMesh_IncrementalMesh` sub-2a)       | 1                                                                  | **Small-medium** — verify val-discrimination call shape, decide between `(shape, params)` and explicit-arity-padded call |
| D (`Message_ProgressRange` ceremony)        | 15 call sites + 1 file deletion + 2 wrapper-class consumer updates | **Small** — purely mechanical; biggest LoC delta but lowest cognitive overhead                                           |
| E (`BRepOffsetAPI_MakeFilling`)             | 2                                                                  | **Small** — replace 10-arg literal with `()`                                                                             |
| F (`Surface_2` comment)                     | 1                                                                  | **Trivial** — delete comment                                                                                             |
| G (`TCollection_ExtendedString(str, true)`) | 1                                                                  | **Small** — verify default for `isMultiByte`                                                                             |
| H (`Quantity_ColorRGBA` 4-arg)              | 1                                                                  | **Small-conditional** — verify OCCT 3-arg ctor                                                                           |
| I (`BRep_Tool.Triangulation`)               | 1                                                                  | **Small**                                                                                                                |

**Overall effort: small-to-medium.** Single PR pass with one round of `pnpm nx test replicad --watch=false` and one round of `pnpm nx run runtime:test` should be sufficient to land all 28 simplifications post-migration.

## Recommended Sequencing

When OCJS Phase 4 (matrix-driven emission) ships, apply replicad simplifications in this order — high-impact first, low-risk first:

1. **Wave 1 (bug fixes — must land before exercising row 8/7/34 production paths)**: B.1 (`BRepGProp_Face`), C.1 (`BRepMesh_IncrementalMesh`), E.1 + E.2 (`BRepOffsetAPI_MakeFilling`). These are the migration's "intended consumers" — fixing them validates the matrix rows landed correctly. Run `pnpm nx test replicad` and verify `face.normalAt()`, `shape._mesh()`, `makeNonPlanarFace()` parity.

2. **Wave 2 (high-volume ergonomic — biggest LoC delta)**: Category D in full (D.1 through D.8) — eliminate all 15 `Message_ProgressRange` sites and delete `utils/ProgressRange.ts`. Pure mechanical; trivial to review. Largest visible API cleanup.

3. **Wave 3 (trailing-bool/scalar collapse — verify defaults per site)**: Category A in full (A.1 through A.15). One audit pass per site to confirm the value being dropped matches the OCCT default. Mechanical edits.

4. **Wave 4 (low-priority / conditional)**: F.1 (comment), G.1 (verify `isMultiByte` default), H.1 (verify `Quantity_ColorRGBA` 3-arg ctor), I.1. Defer until the conditional verifications complete.

## Notes for Reviewers

- **Bug-fix findings (B.1, C.1, E.1, E.2)** are the canary signals that the migration landed correctly. If post-migration replicad's `face.normalAt()` returns the wrong normal or `makeNonPlanarFace` throws, the val-discrimination at the corresponding matrix row regressed.
- **Category D simplifications are reversible**: the verbose `new Message_ProgressRange(); … .Build(progress); progress.delete()` form continues to work post-migration (it's a strict superset of the simplified call), so callers that genuinely want to thread a progress reporter (replicad's future progress-callback feature?) can opt in.
- **Suffix-free symbol emission** has already landed pre-this-migration; replicad's source contains zero live `_1`/`_2`/`_3` numbered overload references (only F.1's stale comment). This is a load-bearing signal that previous OCJS migrations to JS-friendly symbol names already paid off.
- **Out-of-scope item 1 (`WrappingObj` migration to `using`)** is a separate ergonomic improvement worth a follow-up research doc. The current `.delete()` discipline + `FinalizationRegistry` is fine but not idiomatic for ES2025+ `using` declarations.

## References

### Policy + audit (drives the matrix-row citations)

- Trailing-default emission policy (matrix source of truth): `/Users/rifont/git/tau/repos/opencascade.js/docs/policy/ocjs-trailing-default-emission-policy.md`
- Surface audit (instance counts + sub-2b enumeration): `/Users/rifont/git/tau/docs/research/ocjs-occt-surface-audit.md`

### Strategic reviews (per-row reasoning)

- Independent strategic review (opus-4-7): `/Users/rifont/git/tau/docs/research/ocjs-optional-overload-strategic-review-opus-4-7.md`
- Independent strategic review (gpt-5.5): `/Users/rifont/git/tau/docs/research/ocjs-optional-overload-strategic-review-gpt-5-5.md`

### Migration mechanics

- PoC coverage gaps: `/Users/rifont/git/tau/docs/research/ocjs-optional-overload-poc-coverage-gaps.md`
- Migration blueprint: `/Users/rifont/git/tau/docs/research/ocjs-optional-overload-resolution-blueprint.md`
- Outstanding issues catalog: `/Users/rifont/git/tau/docs/research/ocjs-bindgen-libembind-outstanding-issues-catalog.md`
- RBV non-copyable + integer-twin dedup: `/Users/rifont/git/tau/docs/research/ocjs-rbv-non-copyable-and-integer-overload-dedup.md`

### Replicad source (cited inline)

- `repos/replicad/packages/replicad/src/shapes.ts` (the dominant call-site density)
- `repos/replicad/packages/replicad/src/shapeHelpers.ts`
- `repos/replicad/packages/replicad/src/addThickness.ts`
- `repos/replicad/packages/replicad/src/measureShape.ts`
- `repos/replicad/packages/replicad/src/importers.ts`
- `repos/replicad/packages/replicad/src/Sketcher2d.ts`
- `repos/replicad/packages/replicad/src/export/assemblyExporter.ts`
- `repos/replicad/packages/replicad/src/sketches/CompoundSketch.ts`
- `repos/replicad/packages/replicad/src/utils/ProgressRange.ts` (deletable post-migration)
- `repos/replicad/packages/replicad/src/register.ts` (out of scope — own GC pattern)
