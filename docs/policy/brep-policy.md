---
title: 'BRep Construction Policy'
description: 'Rules for efficient boundary-representation CAD construction in Tau kernels, especially Replicad and OpenCascade.js models.'
status: active
created: '2026-06-20'
updated: '2026-06-20'
related:
  - docs/policy/cad-performance-policy.md
  - docs/policy/library-api-policy.md
  - docs/research/v8-engine-brep-construction-audit.md
  - docs/research/replicad-native-batch-operations-v8-benchmark-report.md
---

# BRep Construction Policy

Internal reference for authoring performant and robust BRep models in Tau examples, prompt guidance, runtime kernels, and Replicad/OpenCascade.js integrations.

## Rationale

BRep kernels are exact modeling systems, not mesh CSG engines. Global booleans are powerful but expensive because OCCT computes subshape interferences, splits, result topology, optional history, and optional simplification across whole shape groups. Tau models should therefore construct topology as directly as possible, using sketches, inner wires, local features, profiles, transforms, and batched booleans before falling back to repeated global boolean chains.

## Rules

### 1. Prefer Feature-Native Construction Over Global Booleans

Represent pads, pockets, holes, grooves, bosses, ribs, shells, and revolved details with the native feature/profile operation that describes the design intent. Use global `fuse`, `cut`, `common`, and `intersect` only when the topology cannot be represented directly.

**Why**: OCCT documents BRepFeat local operations as simpler and faster than equivalent global operations, and mainstream CAD tools expose extrude/pocket/hole/groove features as first-class modeling operations.

CORRECT:

```typescript
// Conceptual OCJS flow: one profile/feature operation owns the pocket intent.
const pocketProfile = makePlanarPocketProfile({ outer, innerWires });
const body = extrudeProfileWithInnerWires(pocketProfile, depth);
```

INCORRECT:

```typescript
let body = makeBox([0, 0, 0], [100, 80, 10]);
for (const hole of holes) {
  body = body.cut(hole) as Shape3D;
}
```

### 2. Put Coplanar Voids In The Face

When holes, slots, or pockets are known at the same time as a planar extrusion, build one face with an outer wire and inner wires, then extrude that face. Do not extrude a solid plate and subtract cylinders for voids that could have been face boundaries.

**Why**: OCCT `BRepBuilderAPI_MakeFace` supports added wires as holes, avoiding the boolean interference pass entirely for this class of geometry.

CORRECT:

```typescript
// Conceptual OCJS flow.
const face = makeFaceFromOuterWire(outerWire);
for (const holeWire of holeWires) {
  face.addHole(holeWire);
}
const plate = extrudeFace(face, thickness);
```

INCORRECT:

```typescript
const plate = rectangleSketch.extrude(thickness) as Shape3D;
const cutTools = holeCenters.map((center) => makeCylinder(radius, thickness + 2, center, [0, 0, 1]));
const perforated = plate.cutAll(cutTools);
```

### 3. Use Revolved Profiles For Axisymmetric Geometry

Build tubes, rings, annular grooves, pulleys, flywheels, pistons, domes, counterbores, and similar lathe-style parts from a 2D section revolved around the axis whenever the feature is axisymmetric.

**Why**: A revolved profile directly creates the intended analytic surfaces; `outer.cut(inner)` creates two solids and asks the boolean pipeline to rediscover an annulus.

CORRECT:

```typescript
// Conceptual flow: one radial section describes bore, wall, groove, and recess.
const section = makeAxisymmetricSection([
  [x0, innerR],
  [x0, outerR],
  [x1, outerR],
  [x1, innerR],
]);
const tube = revolveSection(section, axis);
```

INCORRECT:

```typescript
const outer = makeCylinder(outerR, length, origin, axis);
const inner = makeCylinder(innerR, length + 2, shiftedOrigin, axis);
const tube = outer.cut(inner) as Shape3D;
```

### 4. Never Create Boolean Tools With Booleans When A Direct Tool Exists

Do not use `intersect`, `cut`, or `common` just to manufacture the tool for a later boolean. Build the half-space, swept profile, prism, face, shell, or direct wire that represents the tool.

**Why**: Tool-generation booleans add full BRep cost before the intended boolean even starts.

CORRECT:

```typescript
const lowerHalfCylindricalPocket = makeExtrudedHalfCircleProfile({
  radius,
  length,
  axis,
});
body = body.cut(lowerHalfCylindricalPocket) as Shape3D;
```

INCORRECT:

```typescript
const sweep = makeCylinder(radius, length, origin, axis);
const lowerHalf = makeBox(min, max);
const lowerHalfTool = sweep.intersect(lowerHalf) as Shape3D;
body = body.cut(lowerHalfTool) as Shape3D;
```

### 5. Batch Unavoidable Booleans Once

When booleans are unavoidable, collect all tools or operands and perform one batch operation with `cutAll`, `fuseAll`, or `intersectAll`. Do not chain one boolean per loop iteration.

**Why**: OCCT boolean operators accept object and tool groups; OCCT's multi-argument boolean examples show substantial wins over sequential two-argument treatment.

CORRECT:

```typescript
const cutTools = bores.map((bore) => makeCylinder(bore.radius, bore.depth, bore.origin, bore.axis));
const block = rawBlock.cutAll(cutTools);
```

INCORRECT:

```typescript
let block = rawBlock;
for (const bore of bores) {
  block = block.cut(makeCylinder(bore.radius, bore.depth, bore.origin, bore.axis)) as Shape3D;
}
```

### 6. Defer Boolean Simplification To The Batch Boundary

Perform result simplification once after a complete batch or feature, not after every small operand. Do not expose broad OCCT cleanup knobs unless they are stable, benchmarked, and policy-approved.

**Why**: `SimplifyResult` is useful, but running it repeatedly multiplies cleanup cost and can change topology after every intermediate step.

### 7. Preserve Geometry With Locations And Shallow Copies

For translated or rotated copies of an unchanged part, prefer location-preserving transforms and shallow copies over geometry duplication. In OCCT terms, use `BRepBuilderAPI_Transform` with `copyGeom=false` for direct isometric transforms and `BRepBuilderAPI_Copy` with `copyGeom=false` when topology can share geometry.

**Why**: OCCT can represent direct isometric transforms as a new location on the same shape, and `BRepBuilderAPI_Copy` can share geometry and triangulation when deep copies are unnecessary.

CORRECT:

```typescript
const pistonPrototype = makePiston(params);
const pistons = placements.map((placement) => transformByLocation(pistonPrototype, placement));
```

INCORRECT:

```typescript
const pistons = placements.map((placement) => makePiston(params).translate(placement.xyz));
```

### 8. Keep Repeated Assemblies As Instances Unless Fusion Is Semantically Required

Model one repeated component, place it multiple times, and keep it as separate assembly geometry unless the part is manufactured as one fused solid. Do not fuse visual assemblies merely to make one BRep.

**Why**: Assemblies and repeated parts are cheaper and clearer when identity is preserved; fusing separate manufactured components creates unnecessary topology.

### 9. Separate Visual Detail From Exact BRep Detail

Do not model high-count decorative details such as teeth, knurling, fine grooves, or texture-like patterns as hundreds of exact boolean operations unless the exact topology is mechanically important for the task.

**Why**: Visual details can dominate render time while contributing little to the user's modeling intent.

| Detail kind                                 | Preferred representation                                                                |
| ------------------------------------------- | --------------------------------------------------------------------------------------- |
| Mechanically relevant tooth or spline       | Purpose-built feature, patterned profile, or exact BRep behind an explicit detail level |
| Preview-only teeth, ribs, grooves, knurling | Lower-detail BRep, visual material/mesh detail, or optional LOD                         |
| Repeated bolt holes                         | Inner wires, feature/hole operation, or one `cutAll`                                    |
| Cosmetic seam/gap                           | Material/edge styling or shallow direct feature, not repeated booleans                  |

### 10. Keep Boolean Inputs Clean And Intentional

Use valid solids, avoid near-coincident accidental overlaps, avoid zero-thickness slivers, and group tools by common target. Apply OCCT knobs such as fuzzy tolerance, glue, OBB, non-destructive mode, history, and parallel execution intentionally and behind Tau-owned semantic APIs.

**Why**: OCCT exposes powerful boolean options, and OCJS binds many of them, but most are robustness or implementation controls rather than user-facing design concepts.

### 11. Prefer Workplane/Sketch Semantics In Agent Examples

Prompt examples, Tau examples, and canonical fixtures must show workplane, sketch, profile, hole, pocket, groove, revolve, and batch boolean patterns before low-level primitive subtraction patterns.

**Why**: Agents copy examples. If examples teach `makeCylinder` plus looped `cut`, generated models will inherit the slow pattern.

### 12. Measure Before And After Every Construction Rewrite

Every canonical BRep performance rewrite must record clean render timings and traced attribution for BRep construction, tessellation, and post-processing.

**Why**: BRep performance is workload-sensitive; policies should be reinforced with telemetry rather than intuition.

## Decision Tables

### Construction Choice

| Modeling need                           | Preferred construction                | Fallback                                                      |
| --------------------------------------- | ------------------------------------- | ------------------------------------------------------------- |
| Planar part with known holes            | Face with inner wires, then extrude   | One `cutAll` if target already exists                         |
| Tube or annular ring                    | Revolved radial section               | One subtractive boolean only when no profile API is available |
| Axisymmetric grooves or counterbores    | Revolved section with groove profile  | One batch cut using directly constructed groove tools         |
| Repeated hole pattern on existing solid | Hole/pocket feature or one `cutAll`   | Pairwise cuts only for diagnostics                            |
| Local pad/depression on base shape      | BRepFeat/local feature                | Batch fuse/cut of one feature body                            |
| Repeated manufactured component         | Instance/placement                    | Deep copy only when geometry will diverge                     |
| Decorative high-count detail            | LOD or visual representation          | Exact BRep behind an explicit quality/detail parameter        |
| Boolean tool clipped by a half-space    | Direct profile/half-tool construction | Boolean-generated tool only with benchmarked justification    |

### OCCT/OCJS Option Ownership

| Option                      | Policy stance                                 | Notes                                                                                    |
| --------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `SetRunParallel`            | Runtime/internal default when pthread-capable | Do not make users opt in for safe parallelism.                                           |
| `SetTools` / `SetArguments` | Required for batch booleans                   | Prefer grouped operands over sequential binary operations.                               |
| `SimplifyResult`            | Batch-boundary cleanup                        | Avoid per-operand cleanup.                                                               |
| `SetToFillHistory`          | Disabled for preview unless needed            | History is valuable for topology naming, but costly if unused.                           |
| `SetGlue`                   | Internal, benchmarked, feature-specific       | Can increase performance for suitable coincident/tangent cases, but changes assumptions. |
| `SetFuzzyValue`             | Explicit semantic tolerance only              | Robustness knob, not a hidden default.                                                   |
| `SetUseOBB`                 | Benchmark-gated internal choice               | Workload-sensitive.                                                                      |
| `SetNonDestructive`         | Internal correctness/performance choice       | Preserve public semantics; do not leak raw OCCT lifecycle controls.                      |

## Anti-Patterns

- `outer.cut(inner)` to create a tube, annulus, ring groove, pulley groove, counterbore, or recess that could be a revolved profile.
- `sphere.intersect(cylinder)` to create a dome cap that could be an axisymmetric surface/profile.
- `solid.intersect(box)` to create a half-tool for a later `cut`.
- `drawCircle(...).fuse(drawRectangle(...)).fuse(...)` for a single 2D silhouette when one explicit wire/profile can be constructed.
- Looping `shape = shape.cut(tool)` or `shape = shape.fuse(part)` for repeated tools.
- Reconstructing identical parts for every assembly placement.
- Fusing separate assembly parts merely to reduce node count.
- Modeling cosmetic high-count detail as exact BRep by default.
- Exposing raw OCCT boolean option bags as first-party public APIs without Tau semantic naming, defaults, tests, and benchmarks.

## Summary Checklist

- [ ] Can this feature be a sketch/profile/local operation instead of a boolean?
- [ ] If a planar extrusion has holes, are the holes inner wires in the face?
- [ ] If the part is axisymmetric, is it a revolved section?
- [ ] If booleans remain, are they batched with `cutAll`, `fuseAll`, or `intersectAll`?
- [ ] Is simplification performed once at the batch boundary?
- [ ] Are repeated components transformed/instanced from a prototype?
- [ ] Are cosmetic details optional, simplified, or represented visually?
- [ ] Are OCCT knobs internal, benchmarked, and semantically named?
- [ ] Does telemetry prove the rewrite improved BRep time without moving cost elsewhere?

## References

- [OCCT Boolean Operations specification](https://dev.opencascade.org/doc/overview/html/specification__boolean_operations.html)
- [OCCT Modeling Algorithms guide, BRepFeat local operations](https://dev.opencascade.org/doc/overview/html/occt_user_guides__modeling_algos.html)
- [OCCT BRepBuilderAPI_MakeFace reference](https://dev.opencascade.org/doc/refman/html/class_b_rep_builder_a_p_i___make_face.html)
- [OCCT BRepBuilderAPI_Transform reference](https://dev.opencascade.org/doc/refman/html/class_b_rep_builder_a_p_i___transform.html)
- [OCCT BRepBuilderAPI_Copy reference](https://dev.opencascade.org/doc/refman/html/class_b_rep_builder_a_p_i___copy.html)
- [OCCT BRepAlgoAPI_BuilderAlgo reference](https://dev.opencascade.org/doc/refman/html/class_b_rep_algo_a_p_i___builder_algo.html)
- [OpenCascade.js BRepAlgoAPI_Cut reference](https://ocjs.org/reference-docs/classes/BRepAlgoAPI_Cut_1)
- [OCCT forum: Boolean Operations With Multiple Arguments](https://dev.opencascade.org/content/boolean-operations-multiple-arguments)
- [Autodesk Fusion: Extrude a solid body](https://help.autodesk.com/view/fusion360/ENU/?guid=SLD-EXTRUDE-SOLID)
- [CadQuery class summary](https://cadquery.readthedocs.io/en/latest/classreference.html)
- [FreeCAD PartDesign workbench documentation mirror](https://github.com/FreeCAD/FreeCAD-documentation/blob/main/wiki/PartDesign_Workbench.md)
- [Onshape forum guidance: pattern first, single boolean at end](https://forum.onshape.com/discussion/5440/trouble-patterning-a-featurescript)
- [Roman Lygin: Topology and Geometry in Open CASCADE](https://opencascade.blogspot.com/2009/02/continued.html)
- Related: `docs/policy/cad-performance-policy.md`
- Related: `docs/policy/library-api-policy.md`
