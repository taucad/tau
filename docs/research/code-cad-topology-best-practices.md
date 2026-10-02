---
title: 'Code-CAD Topology & Geometric Fidelity Best Practices (May 2026)'
description: 'Comprehensive survey of topology optimization and geometric authoring best practices for Code-CAD agents across B-rep and mesh kernels, with concrete prompt-engineering recommendations for global vs per-kernel guidance.'
status: draft
created: '2026-05-15'
updated: '2026-05-15'
category: comparison
related:
  - docs/policy/context-engineering-policy.md
  - docs/research/agentic-cad-geometric-intent-preservation.md
  - docs/research/complex-task-agent-gap-analysis.md
  - docs/research/system-prompt-audit.md
  - docs/research/replicad-performance-blueprint.md
  - docs/research/mesh-continuity-test-semantics.md
  - docs/research/sysml2-cad-intent-architecture.md
---

# Code-CAD Topology & Geometric Fidelity Best Practices (May 2026)

State-of-the-art review of topology optimization and geometric authoring best practices for Code-CAD across Tau's six kernel surfaces (Replicad, OpenCascade.js, KCL/Zoo, Manifold, JSCAD, OpenSCAD), with recommendations for global vs per-kernel CAD agent prompt sections that supersede the standalone `geometry-fidelity-curves` plan.

## Executive Summary

Frontier LLM CAD agents systematically default to polyline sampling, redundant boolean unions, and topology-bloating construction sequences when authoring code-CAD — not because they lack knowledge of analytical primitives, but because nothing in the system prompt names the failure mode or gives them a decision rule for choosing between an analytical curve and a sampled approximation. The May 2026 helical-gear transcript captured the canonical instance of this: GPT-5.5 chose `involuteSamples: 9 + rootBlendSamples: 4 + topLandSamples: 3 + rootArcSamples: 4` polyline construction for a curve family (involutes plus root/tip arcs) that has trivial exact representations as B-splines and `gp_Circle` arcs, and only corrected to "spline involute flank edges plus exact circular root/tip arcs" after a user nudge that explicitly mentioned topology and build cost.

The principle is universal — **mathematically definable curves and surfaces should be authored as analytical primitives, never sampled to polylines** — but the _applicability_ is sharply kernel-specific. B-rep kernels (Replicad, OpenCascade.js, KCL) accept analytical curves natively and pay a topology + build-cost penalty for sampling. Mesh kernels (JSCAD, Manifold, OpenSCAD) have no concept of analytical curves; for them the equivalent failure mode is unbounded `segments` / `$fn` proliferation, expensive `minkowski`/`hull` operations, and lazy `union` chains where a single `circle()`-then-`linear_extrude` would replace 200 explicitly placed primitives. The right prompt architecture is **hybrid**: a compact global `<geometry_fidelity>` section that establishes the universal principle and a per-kernel idiom block (slotted into the existing `KernelConfig.codeStandards` surface or a new `topologyHints` field) that maps the principle to that kernel's actual primitives.

The single highest-impact change is a global `<geometry_fidelity>` static section between `<safety>` and `<canonical_example>`, anchored on a for-loop-over-`samples` self-detection heuristic, paired with per-kernel hints calibrated to each kernel's curve catalogue and meshing model. Recommendations R1–R12 below specify the full prompt shape, supersede the prior `geometry-fidelity-curves` plan, and capture the kernel split.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Methodology](#methodology)
- [Kernel Capability Matrix](#kernel-capability-matrix)
- [Finding 1: Analytical Curves Beat Polyline Sampling on B-rep Kernels](#finding-1-analytical-curves-beat-polyline-sampling-on-b-rep-kernels)
- [Finding 2: Mesh Kernels Have a Different Failure Mode — Segment Economy](#finding-2-mesh-kernels-have-a-different-failure-mode--segment-economy)
- [Finding 3: Construction Strategy Compounds Topology Cost](#finding-3-construction-strategy-compounds-topology-cost)
- [Finding 4: Boolean Hygiene and Ordering](#finding-4-boolean-hygiene-and-ordering)
- [Finding 5: Fillet and Chamfer Placement Decides Robustness](#finding-5-fillet-and-chamfer-placement-decides-robustness)
- [Finding 6: Sketch Quality and Parametric Derivation](#finding-6-sketch-quality-and-parametric-derivation)
- [Finding 7: Tessellation Is a Deliverable Parameter, Not a Construction Parameter](#finding-7-tessellation-is-a-deliverable-parameter-not-a-construction-parameter)
- [Finding 8: Assembly vs Fused Topology — Author Intent, Not Reflex](#finding-8-assembly-vs-fused-topology--author-intent-not-reflex)
- [Finding 9: Agent Self-Detection Heuristics That Work](#finding-9-agent-self-detection-heuristics-that-work)
- [Global vs Per-Kernel Prompt Guidance](#global-vs-per-kernel-prompt-guidance)
- [Recommendations](#recommendations)
- [Proposed Prompt Shape](#proposed-prompt-shape)
- [Supersession of `geometry-fidelity-curves` Plan](#supersession-of-geometry-fidelity-curves-plan)
- [References](#references)

## Problem Statement

The May 2026 helical-gear design transcript (`/Users/rifont/Downloads/helical_gear_design_2026-05-15T09-07.md`) captured the canonical "agent picks the simplest path that compiles" failure mode for curved geometry. Asked to model a helical gear, GPT-5.5 chose a polyline tooth profile parameterised by four explicit sample counts:

```ts
involuteSamples: 9,
rootBlendSamples: 4,
topLandSamples: 3,
rootArcSamples: 4,
```

…and emitted a `for (let sample = 1; sample <= p.involuteSamples; sample += 1)` loop per flank — twice — plus matching loops for the root blend and tip arc. The agent self-recognised that this approach was wrong only after the user typed:

> no sampling, use proper curves, make performant use of the APIs on offer, it's too slow right now.

Whereupon the agent responded:

> I'll replace the polyline tooth construction with spline involute flank edges plus exact circular root/tip arcs, reducing topology and build cost.

The agent already knew the right answer (B-spline involute flanks + exact `Geom_Circle` arcs). The system prompt simply did not tell it that the polyline approach was wrong, and the kernel's `replicad-occt-usage-refinement.md` catalogue of `Geom2dAPI_PointsToBSpline`, `Geom2d_BSplineCurve`, `Geom2d_Circle` etc. was available but unused. This is a **prompt design failure**, not a model-capability failure.

The same failure mode shows up across the kernel surface for any curve family that has a closed-form representation: involutes, Bezier teardrops, lemniscates, cycloids, archimedean spirals, NACA airfoil sections, Rao nozzle bells, evolutes, helices, and parametric surface revolves. It also shows up in subtler forms: redundant `cylinder()` arrays where a single `polar_array`/`rotateZ`-loop pattern is canonical, unioning 200 individually placed bolt heads instead of `linear_extrude` of a templated profile, hull-of-spheres as a stand-in for a swept profile, and over-`$fn` curvature where the artifact ships at `$fn=100` because the agent never thought about the export deliverable.

This investigation answers two questions:

1. What does "topology and geometric fidelity best practice" mean concretely in May 2026 across the six kernels Tau supports?
2. Should the CAD agent prompt encode this guidance globally, per-kernel, or as a hybrid — and what is the right shape?

## Methodology

1. **Smoking-gun transcript analysis**: Full read of the helical-gear transcript with focus on the first 380 lines (initial polyline construction) and lines 380–460 (post-correction spline+arc construction). Mined the agent's own diagnosis language for prompt-ready phrases.
2. **Per-kernel canonical example audit**: Read all six `*.prompt.example.{ts,scad,kcl}` files plus `replicad.prompt.example-multishape.ts` and `*.prompt.example-multifile/` siblings. Catalogued which examples themselves model curve construction (and how).
3. **Per-kernel API surface review**: For Replicad, cross-referenced `docs/research/replicad-occt-usage-refinement.md` (216 OCCT symbols catalogue) for the analytical-curve construction surface (`Geom2dAPI_PointsToBSpline`, `Handle_Geom2d_BSplineCurve`, `Geom2d_Circle`, `Geom2d_BezierCurve`, `Geom_BSplineSurface`, `BRepBuilderAPI_MakeEdge`-from-curve, `BRepOffsetAPI_MakePipe`, `BRepOffsetAPI_ThruSections` (loft), `BRepPrimAPI_MakeRevol`, `BRepFilletAPI_MakeFillet`). For OpenCascade.js, same surface direct.
4. **Prior Tau research synthesis**: Read or grep'd `system-prompt-audit.md`, `complex-task-agent-gap-analysis.md` (Findings 1–10), `agentic-cad-geometric-intent-preservation.md` (Findings 1–8), `replicad-performance-blueprint.md` (Tiers 1–10), `mesh-continuity-test-semantics.md`, `sysml2-cad-intent-architecture.md`.
5. **Context-engineering policy alignment**: Verified every recommendation against `docs/policy/context-engineering-policy.md` (right altitude, single source of truth, examples over rules, dynamic context discovery, ≤20% negative-guidance ratio, token budget).
6. **Cross-kernel idiom matrix**: Built the kernel-capability matrix (Section below) by reconciling B-rep vs mesh kernel models and the concrete authoring vocabulary each exposes.

## Kernel Capability Matrix

| Kernel             | Model                     | Native curve primitives                                                                                                                           | Sampling needed when…                                                                            | Topology-bloat signal                                                                                                                                  |
| ------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Replicad**       | B-rep (OCCT)              | `drawLine`, `drawArc`/`drawTangentArc`, `drawCircle`, `drawEllipse`, `drawBezierCurve` (cubic+higher), `drawSplineCurve` (interpolating B-spline) | Author has a data-driven shape with no closed form (CSV cross-section, scan data, foreign mesh)  | `for (let i…) { …addLineTo }`, `points.push([…])` followed by `drawPoints(points)`, hand-crafted polyline straight-segment loops                       |
| **OpenCascade.js** | B-rep (OCCT)              | `Geom2d_*`/`Geom_*` curve hierarchy, `GC_MakeArcOfCircle`, `Geom2dAPI_PointsToBSpline`, `BRepBuilderAPI_MakeEdge`-from-Geom-curve                 | Same as Replicad                                                                                 | Same as Replicad, plus chained `BRepBuilderAPI_MakePolygon` for what should be a single edge                                                           |
| **KCL (Zoo)**      | B-rep (Zoo Design Studio) | `arc`, `bezierCurve`, `tangentialArc`, `arcTo`, `tangentialArcTo`, parametric `circle`/`ellipse`                                                  | Same as Replicad                                                                                 | `line` chains with computed endpoints from `for`-loop subdivision of an angle                                                                          |
| **Manifold**       | Mesh (CSG)                | `cylinder(…, segments)`, `sphere(segments)`, `revolve(polygon, segments)`, `extrude(crossSection, segments)`; no analytical curves                | Always — analytical curves are not in the model. Choice is segment count, not curve vs polyline. | `segments` >> 64 on small features, explicit per-point polygon construction where `CrossSection.circle()` would suffice                                |
| **JSCAD**          | Mesh (CSG via @jscad)     | `primitives.circle(segments)`, `primitives.cylinder(segments)`, `extrusions.extrudeRotate(segments)`; no analytical curves                        | Always — same as Manifold                                                                        | `segments` proliferation, polygon-from-points loops for curves that `circle()`/`ellipse()`/`extrudeRotate()` already handle                            |
| **OpenSCAD**       | Mesh (CGAL / Manifold)    | `circle($fn)`, `sphere($fn)`, `cylinder($fn)`, `rotate_extrude($fn)`, `linear_extrude(twist=…, $fn=…)`, `polygon(points)`                         | Always — no analytical curves. Choice is `$fn`/`$fa`/`$fs`, not curve vs polyline.               | `$fn` baked at 100+ globally, `hull()`/`minkowski()` reflexively used as stand-ins, lazy `union()` of pre-positioned primitives instead of `for`-array |

The split is binary: **three B-rep kernels accept analytical curves and pay a topology penalty for sampling; three mesh kernels never had analytical curves and pay a different penalty (segment count, expensive operations, `union` chains).** A single global "always use exact curves" rule does not survive contact with mesh kernels, but a single global "choose the smallest topology that captures intent" rule does. The prompt must do both.

## Finding 1: Analytical Curves Beat Polyline Sampling on B-rep Kernels

On Replicad / OpenCascade.js / KCL, every closed-form curve emitted as a sampled polyline costs the model in five concrete ways:

| Cost axis                           | Polyline (N samples)                                                                                                        | Analytical curve                                                                                                                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Edge count**                      | N straight edges per curve                                                                                                  | 1 edge per curve                                                                                                                                                                      |
| **Vertex count**                    | N+1 vertices                                                                                                                | 2 endpoints                                                                                                                                                                           |
| **Boolean cost**                    | Each edge participates in pairwise intersection tests; OCCT's `BRepAlgoAPI_Fuse` scales worse than linearly with edge count | Linear in face count                                                                                                                                                                  |
| **Fillet/shell robustness**         | OCCT's filleter regresses on polylines with sharp kinks even at small fillet radius; `BRepCheck_Analyzer` flags micro-edges | Exact tangent continuity (`G1`/`G2` natively)                                                                                                                                         |
| **Tessellation fidelity at export** | Locked at construction time — the mesh inherits the polyline's flat segments and cannot be refined later                    | OCCT's `BRepMesh_IncrementalMesh` re-tessellates per export request, picking the deflection from the export call. Construction-time fidelity does not constrain export-time fidelity. |

The helical-gear transcript demonstrated all five: with 9 samples per flank × 2 flanks × 24 teeth = 432 polyline edges per face, the boolean fuse against a cylindrical hub was visibly slow, and the resulting topology had hundreds of redundant edges that the filleter cannot touch cleanly.

The agent already had:

- **Replicad**: `drawSplineCurve(points)` (interpolating B-spline through provided points — the right tool for involute flanks because the involute is sampled algebraically but the _curve through samples_ is C2-continuous), `drawArc(centre, start, end)` for exact circular root/tip arcs.
- **OCCT direct**: `Geom2dAPI_PointsToBSpline` (least-squares B-spline fit) for noisy/dense data, `GC_MakeArcOfCircle` for exact arcs, `Geom2d_BSplineCurve` for the curve object itself.
- **KCL**: `arc`, `tangentialArc`, `bezierCurve`.

What was missing was a prompt-level decision rule that tells the agent **"if the curve has a closed-form parameterisation, sample the form once into control points and emit a B-spline edge, never a polyline."**

### When sampling is genuinely correct on B-rep kernels

Not every sampled construction is wrong. The agent must distinguish:

| Situation                                                                                  | Correct response                                                                          |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Curve has a closed-form parameterisation (involute, ellipse, helix, cycloid, NACA section) | Sample the _form_ once into control/interpolation points, emit a **single B-spline edge** |
| Curve is a chain of arcs and lines (most engineering profiles)                             | Emit each segment as its **own analytical edge**; chain with `drawArc`/`drawLine`         |
| Curve is data-driven (CSV airfoil coordinates, scanned outline, traced from image)         | `drawSplineCurve(points)` — let the kernel fit a smooth B-spline through samples          |
| Curve is genuinely piecewise-linear (text glyph hinted at low resolution, faceted prop)    | Polyline is correct; document why with a comment                                          |
| Curve is being constructed for a mesh-kernel target                                        | Polyline is the only option; control segment count via Finding 2                          |

This decision rule is short enough to fit in a six-line static section. It is **not** complete topology theory; it is the minimum disambiguation the agent needs to escape the helical-gear failure mode.

## Finding 2: Mesh Kernels Have a Different Failure Mode — Segment Economy

For Manifold, JSCAD, and OpenSCAD, "use analytical curves" is impossible — the kernel only sees triangles. The equivalent failure modes are:

1. **Unbounded segment counts**: `cylinder(h=10, r=2, $fn=100)` for a Ø4 mm pin is ~16× over-tessellated. OCCT-equivalent guidance does not transfer; the agent needs an explicit segment-count heuristic.
2. **`hull()` / `minkowski()` as topology stand-ins**: Both operations are O(n²)/O(n³) on input vertex count. They are correct for genuine convex-hull or offset operations and catastrophic when used as a stand-in for `loft` or `offset` of a 2D profile.
3. **Lazy `union` chains**: `union() { translate(...) cube(); translate(...) cube(); ... }` for 200 instanced parts is slower and uglier than `for (i = [0:199]) translate([…]) cube()`. The instantiation pattern matters in OpenSCAD because the `union` tree is materialised eagerly in F5 preview and during CGAL/Manifold lifting.
4. **Over-rendered convexity**: OpenSCAD's `convexity` hint affects preview quality only, not final render — but agents frequently bump `convexity=10` "for safety", adding no value and confusing humans reading the source.
5. **Missing `$fa`/`$fs` for adaptive curvature**: `$fn` is fixed-segment-per-revolution; `$fa`/`$fs` adapt to actual feature size. For a model with both Ø2 mm and Ø200 mm cylinders, `$fa=4; $fs=0.5` produces appropriate tessellation per feature, while `$fn=100` over-tessellates small features and under-tessellates large ones.

### Segment count heuristic (mesh kernels)

A two-line rule covers most cases:

> For closed circular features, `segments ≈ max(16, π · diameter_mm / target_chord_mm)` with `target_chord_mm ≈ 0.3` for visible parts and `0.1` for export-grade STL/3MF. For OpenSCAD specifically, prefer `$fa = 2; $fs = 0.4;` at the top of `main.scad` over a global `$fn`.

This is the segment-economy equivalent of the B-rep "always use analytical curves" rule. It belongs in a per-kernel hint block, not the global section.

## Finding 3: Construction Strategy Compounds Topology Cost

Curve-vs-polyline is the most visible topology decision but not the only one. Construction-strategy choices compound:

| Pattern                                                      | Topology-bloating choice                                                         | Economical choice                                                                                   |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Revolved body of revolution**                              | Stack of N cylinders / cones differing in radius (each a separate solid + union) | One `revolve(profile2D)` of a profile sketch — produces a single face with exact circular evolution |
| **Linear repetition along an axis**                          | N hand-placed translated solids unioned                                          | `polar_array` / `pattern_linear` / `for`-loop into a single sketch then `extrude`                   |
| **Periodic feature around an axis (teeth, bolts, vents)**    | N rotated solids unioned                                                         | One feature → `revolve` if continuous, or extrude a single periodic sketch once                     |
| **Variable cross-section (nozzle bell, blended transition)** | Stack of frusta with manual interpolation                                        | `loft`/`ThruSections` between two or three sketches — produces a single face                        |
| **Shelled hollow object**                                    | Manual outer/inner solids subtracted (often leaves micro-faces at lip)           | `shell(thickness, openFaces)` — kernel handles offset internally with proper face evolution         |
| **Helical sweep (springs, threads, twisted handles)**        | Polyline helix path swept along                                                  | Analytical helix (`gp_Helix` style) as sweep spine — single C2-continuous curve                     |
| **Hand-routed pipe networks**                                | Bezier sweep with hand-tuned control points (silently fails for sharp bends)     | Pipe-with-elbow-fittings: straight segments + parameterised elbow primitives at joints              |

The agent does not need to memorise this table. The compressed prompt rule is **"prefer one revolve, one loft, or one sweep over a stack of primitives unioned together — when the part is a body of revolution, a smooth transition, or a periodic array, name and use the operation that produces a single face."**

## Finding 4: Boolean Hygiene and Ordering

Boolean operations are correct on every kernel and free on none. Best-practice rules transfer directly from CAD literature:

1. **Order matters**: `(A ∪ B) − C` ≠ `(A − C) ∪ B` in cost terms. Subtract small tools from a large body last, after all additive operations have produced a topologically coherent base. Bottom-up additive, top-down subtractive.
2. **Coplanar / coincident-face hazard**: When two operands share a face, OCCT can produce zero-area faces or fail outright. The fix is to extend the cutting tool by a small epsilon (`0.001 mm`) past the boundary so the boolean is unambiguous.
3. **Batch over chain**: On Replicad / OCCT, `BRepAlgoAPI_BuilderAlgo` with `SetArguments(all)` is strictly better than `fuse(a, fuse(b, fuse(c, d)))` because each cascading pair-wise fuse materialises an intermediate `TopoDS_Shape`. The `replicad-performance-blueprint.md` Tier 3 captures this with concrete 2–5× numbers; the agent prompt does not yet expose it.
4. **`SetUseOBB(true)` and `SetRunParallel(true)`**: Free 20–40% speedup on complex booleans. These are kernel-implementation concerns and belong in `@taucad/runtime`, not the agent prompt — but the agent should know that _fewer, larger_ booleans are always cheaper than _more, smaller_ ones, which is the user-visible consequence.
5. **Fuzzy values for near-coincident operands**: When two faces are near-coincident (e.g. two cylinder ends meeting in a fillet), an auto-fuzzy value scaled to the bounding-box diagonal prevents silent topology corruption.
6. **Validate before chaining**: `BRepCheck_Analyzer` on an intermediate shape catches problems before they cascade. The agent does not currently have a tool to invoke this directly, but the principle — "if a boolean produces visible artefacts, check the inputs are closed solids before re-trying with different parameters" — belongs in `<error_handling>`.

For mesh kernels, the analogous rules are:

1. **Manifold's CSG is exact-rational and fast**: pre-`offset` operations are usually a topology-economy win (fewer triangles in the operands before union/subtract).
2. **OpenSCAD `render()` forces eager CGAL/Manifold computation**: useful when a sub-tree is reused; harmful when applied to every leaf. Default to **not** sprinkling `render()`.
3. **OpenSCAD `convexity` is preview-only**: setting it does not change topology.

## Finding 5: Fillet and Chamfer Placement Decides Robustness

OCCT's filleter is fragile and the agent's failure modes follow a small pattern catalogue:

| Symptom                                             | Root cause                                           | Fix                                                                                                     |
| --------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Fillet on polyline tooth edges produces micro-faces | Sharp kinks where polyline segments meet (Finding 1) | Replace polyline with B-spline before filleting                                                         |
| Fillet radius > local feature size                  | Filleter cannot shrink material below feature wall   | Reduce radius or fillet earlier in the construction sequence                                            |
| Variable-radius fillet diverges                     | Control-point spacing on the edge too sparse         | Use `BRepFilletAPI_MakeFillet`'s parametric continuous form                                             |
| Fillet between two booleans                         | Edge evolution unstable across the boolean           | Fillet the source shapes individually, then boolean — or boolean then fillet only the final shared edge |
| Multiple coincident fillets in a corner             | Three-fillet intersection produces invalid B-rep     | Fillet two edges, validate, then fillet the third                                                       |

The agent prompt should not enumerate this catalogue — the right altitude is the _ordering principle_:

> Fillet and chamfer the largest, most stable features first. Fillet the final part-vs-part boundary last. If a fillet fails, the diagnosis is almost always (a) a sharp kink upstream from polyline sampling or (b) a radius larger than local material thickness — not a kernel bug.

This belongs in `<error_handling>` (kernel-aware diagnostic) and the global topology section ("largest fillets first").

## Finding 6: Sketch Quality and Parametric Derivation

The Autodesk constraint-generation work (`agentic-cad-geometric-intent-preservation.md` Finding 3) frames design intent as **the expected behaviour of the model when altered**. For Code-CAD, that translates into three rules:

1. **Every dimension is a parameter or a derived value, never a literal**: `pitchRadius = (toothCount * module) / 2`, not `pitchRadius = 24`. The helical-gear transcript did this well — the failure was downstream in curve construction, not parameter discipline.
2. **Coordinate frames are explicit**: When a sub-component is positioned, name the frame (`gp_Ax2` / `plane` / `XY`-offset) it sits on. Magic numbers in `translate([…])` are the most common source of drift when a parent dimension changes.
3. **Sketches close**: An unclosed sketch is invalid downstream. On Replicad / KCL, `.close()` is the explicit gate; on OpenSCAD `polygon()`, the loop is implicit. The agent should always emit a `close()` even when redundant — the cost is one token, the cost of forgetting it is a build failure.

These belong in `<code_standards>` per kernel, not the global topology section. Replicad's existing `commonErrorPatterns: 'invalid dimensions, self-intersecting geometry, unclosed sketches, failed boolean operations on coincident surfaces'` already names three of these; the fourth (parametric derivation) is implicit in the `defaultParams` export convention.

## Finding 7: Tessellation Is a Deliverable Parameter, Not a Construction Parameter

The most pervasive over-tessellation antipattern across kernels: agents bake the tessellation parameter into the construction call ("just in case it looks bad"), instead of treating it as an export-time choice.

**B-rep kernels** (Replicad / OCCT) compute the mesh on-demand at export, parameterised by `linearDeflection` and `angularDeflection`. Construction is independent of mesh quality. The agent should **not** parameterise tessellation in `defaultParams`; that is the runtime's job.

**Mesh kernels** lock topology at construction, so `segments` / `$fn` _are_ construction-time. The right approach:

- Two-tier defaults: `display` and `export` segment counts.
- `display` = enough for the in-editor preview to not show facets at the typical zoom (`$fn` ≈ 32 for small parts, `$fa=2; $fs=0.4` for variable-scale assemblies).
- `export` = enough for the manufacturing-grade STL/3MF (target chord ≤ 0.05 mm for visible features).
- The agent should expose `segments` / `$fn` as a `defaultParams` field only when the part has visible curvature that the user might want to tune. For boxy parts, hardcoded 32 segments is fine and clutter-free.

This rule slots into the per-kernel idiom block, not the global topology section.

## Finding 8: Assembly vs Fused Topology — Author Intent, Not Reflex

`mesh-continuity-test-semantics.md` captured a closely related issue: the agent reflexively chose `ShapeConfig[]` (multi-colour return) for parts that should be a single fused solid, breaking `connectedComponents` checks. The topology-economy equivalent is the reverse failure: the agent reflexively `fuse`s everything because "a single solid is canonical", destroying per-part colour, material, and disassembly intent.

Both failures share the same root cause: **the agent picks the topology shape based on a default heuristic, not on the user's intent for what the part _is_.** Best-practice decision:

- **Fuse** when the part is a single physical body that prints/machines as one piece (a bracket, a handle, a gear).
- **Multi-shape (`ShapeConfig[]` / Manifold node array / OpenSCAD coloured children)** when the part is an assembly of distinct components that need disassembly or per-part colour (a watering-can with a removable lid, a gear _and_ its shaft, a model car body + wheels).
- **Never both** — pick one and let the test layer match.

This decision belongs in `<canonical_example>` / `<multi_shape_pattern>` (already present) and `<intent_capture>` (proposed in `agentic-cad-geometric-intent-preservation.md`, not yet implemented). The global topology section should reference but not duplicate it.

## Finding 9: Agent Self-Detection Heuristics That Work

The single highest-leverage prompt technique is a **self-detection heuristic** — a syntactic signal the agent can scan its own draft code for, with a definite action to take when matched. The helical-gear transcript exposed two signals that work:

| Self-detection signal                                                            | Trigger                                                                                                            | Action                                                                                                                                                      |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **For-loop pushing points into an array** to construct a curve on a B-rep kernel | `for (let i = 0…) { points.push([…]) }`, `addPoint(polarPoint(…))`, `vertices.push(…)`, `path.lineTo(…)` in a loop | If the curve has a closed form, switch to `drawSplineCurve(points)` (Replicad) / `Geom2dAPI_PointsToBSpline` (OCCT) / `bezierCurve` / `tangentialArc` (KCL) |
| **Sample-count parameter in `defaultParams` on a B-rep kernel**                  | `involuteSamples`, `curveResolution`, `points`, `segments` on a Replicad/OCCT/KCL model                            | Promote to analytical primitive; the sample count belongs to tessellation, not construction                                                                 |
| **`$fn` or `segments` > 64 on a small feature**                                  | `$fn=100` for a Ø4 mm cylinder; `segments=128` for a 5 mm sphere                                                   | Lower the count or switch to `$fa`/`$fs` adaptive tessellation                                                                                              |
| **Two or more nested booleans where one operand is a stack of primitives**       | `union(...primitives.map(translate))` of identical parts                                                           | Use `polar_array` / `for`-loop into a single sketch and extrude / revolve once                                                                              |
| **`hull()` or `minkowski()` of more than 4 primitives**                          | Hull of dozens of spheres as a stand-in for a smooth body                                                          | Switch to `loft` / `extrudeRotate` of a 2D profile                                                                                                          |

The first signal alone would have caught the helical-gear failure. It is also kernel-aware: a for-loop pushing points is wrong on Replicad/OCCT/KCL but is _correct_ on JSCAD/Manifold/OpenSCAD when the data is genuinely sampled (CSV airfoil, traced silhouette).

## Global vs Per-Kernel Prompt Guidance

The kernel matrix forces a hybrid prompt structure. Mapping each finding to its right home:

| Finding                                         | Global section | Per-kernel hint | Rationale                                                                |
| ----------------------------------------------- | -------------- | --------------- | ------------------------------------------------------------------------ |
| F1 — Analytical curves over polylines (B-rep)   | Partial        | Yes             | Universal principle, kernel-specific primitives                          |
| F2 — Segment economy (mesh)                     | Partial        | Yes             | Universal principle, kernel-specific knobs (`$fn` / `$fa`/`$fs`)         |
| F3 — Construction strategy (revolve/loft/sweep) | Yes            | No              | Operation names differ but the principle is identical                    |
| F4 — Boolean hygiene                            | Yes            | No              | Ordering rules transfer across kernels                                   |
| F5 — Fillet ordering                            | Yes            | No              | Universal, with kernel-specific failure-mode hints in `<error_handling>` |
| F6 — Sketch quality / parametric derivation     | Existing       | Existing        | Already in `<constraints>` + `<code_standards>`                          |
| F7 — Tessellation is a deliverable              | No             | Yes             | Mesh kernels handle this very differently from B-rep                     |
| F8 — Assembly vs fused                          | Existing       | Existing        | Already in `<multi_shape_pattern>`                                       |
| F9 — Self-detection heuristics                  | Yes            | No              | Same heuristic catches the failure mode across all kernels               |

The recommended split:

- **Global `<geometry_fidelity>` section** (≤25 lines): F3, F4, F5, F9, plus the F1/F2 universal principle ("choose the smallest topology that captures intent — analytical curves on B-rep kernels, the minimum sufficient segment count on mesh kernels").
- **Per-kernel `topologyHints` field** (≤8 lines per kernel) in `KernelConfig`: concrete primitives (F1 list per kernel), segment-count heuristic (F2 per kernel), tessellation-as-deliverable rule (F7 per kernel).

This honours `docs/policy/context-engineering-policy.md`'s single-source-of-truth principle (each rule lives once), examples-over-rules (per-kernel hints reference the existing canonical example), and right-altitude (global section names the decision, kernel hint names the primitive).

## Recommendations

| #   | Action                                                                                                                                                                                                                                 | Priority | Effort  | Impact | Supersedes / Updates                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------- | ------ | --------------------------------------- |
| R1  | Add a global `<geometry_fidelity>` static section between `<safety>` and `<canonical_example>` covering F1/F2 universal principle, F3 construction strategy, F4 boolean ordering, F5 fillet ordering, and F9 self-detection heuristics | P0       | Low     | High   | Updates `geometry-fidelity-curves` plan |
| R2  | Add `topologyHints` field to `KernelConfig` type and per-kernel implementations for Replicad / OpenCascade.js / KCL / Manifold / JSCAD / OpenSCAD                                                                                      | P0       | Medium  | High   | Net-new                                 |
| R3  | Slot `<topology_hints>` static section into the prompt registry after `<code_standards>`, sourced from `KernelConfig.topologyHints`                                                                                                    | P0       | Low     | High   | Net-new                                 |
| R4  | Append F9 self-detection heuristic ("for-loop of points pushed → analytical curve check") as the closing bullet of the global section, since it is the single highest-leverage signal                                                  | P0       | Trivial | High   | Updates `geometry-fidelity-curves` plan |
| R5  | Extend `<error_handling>` with F5 fillet ordering principle ("if a fillet fails: check for polyline kinks upstream and radius vs local thickness — not a kernel bug")                                                                  | P1       | Low     | Medium | Updates existing section                |
| R6  | Update Replicad's `commonErrorPatterns` to add "polyline curves where splines or analytical arcs are available"                                                                                                                        | P1       | Trivial | Medium | Updates existing field                  |
| R7  | Update OpenSCAD's `commonErrorPatterns` to add "`$fn` baked globally instead of `$fa`/`$fs` adaptive tessellation; unnecessary `hull()`/`minkowski()` use"                                                                             | P1       | Trivial | Medium | Updates existing field                  |
| R8  | Update JSCAD's and Manifold's `commonErrorPatterns` to add "`segments` proliferation; polygon-from-points loops where `circle`/`extrudeRotate` exists"                                                                                 | P1       | Trivial | Medium | Updates existing field                  |
| R9  | Append `EVAL(geometry-fidelity-global)` and `EVAL(topology-hints-per-kernel)` entries to the prompt change-log header citing the helical-gear transcript as evidence                                                                   | P0       | Trivial | Low    | Per `cad-agent.prompt.ts` convention    |
| R10 | Add `<geometry_fidelity>` and per-kernel `<topology_hints>` to the golden structural test (`cad-agent.prompt.test.ts` expected-sections golden) and dedicated test blocks (5–7 assertions each)                                        | P0       | Medium  | Medium | Net-new                                 |
| R11 | Defer: `<intent_capture>` section from `agentic-cad-geometric-intent-preservation.md` Recommendation 1 — implement _after_ R1–R3 so the new sections layer correctly                                                                   | P1       | Low     | High   | Sequencing only                         |
| R12 | Defer: kernel-side runtime improvements (`SetUseOBB`, `SetRunParallel`, `BRepAlgoAPI_BuilderAlgo` batching) — out of scope for prompt engineering; tracked in `replicad-performance-blueprint.md`                                      | P2       | High    | High   | No prompt change                        |

## Proposed Prompt Shape

### Global `<geometry_fidelity>` section

```xml
<geometry_fidelity>
Choose the smallest topology that captures the user's intent. Topology is the deliverable: faces, edges, and vertices are not free, and over-construction costs build time, boolean robustness, fillet stability, and export fidelity.

- **Curves with a closed form**: involutes, ellipses, helices, NACA sections, Rao bells, cycloids, parametric spirals. Sample the form once into control points and emit a single analytical primitive (spline / bezier / arc — see <topology_hints> for your kernel's vocabulary). Never emit a `for`-loop that pushes points into an array to build a curve that has a known mathematical form.
- **Engineering profiles**: arcs and lines chained together — emit each segment as its own analytical edge, never as a sampled polyline.
- **Bodies of revolution, smooth transitions, periodic features**: prefer one `revolve`, one `loft`, or one `sweep` over a stack of primitives unioned together.
- **Booleans**: bottom-up additive, top-down subtractive. Fewer, larger booleans are always cheaper than more, smaller ones. Extend cutting tools by a small epsilon past the boundary so coincident faces never cause a zero-area artefact.
- **Fillets**: largest, most stable features first; part-vs-part shared boundary last. If a fillet fails the root cause is almost always a polyline kink upstream or a radius larger than local material thickness — never a kernel bug.

**Self-check before emitting code**: if you see a `for`-loop pushing points into an array to construct a curve, ask whether the curve has a closed form. If it does, switch to the analytical primitive for your kernel and let the kernel's tessellator handle export fidelity at render time.
</geometry_fidelity>
```

### Per-kernel `<topology_hints>` (one per kernel, sourced from `KernelConfig.topologyHints`)

**Replicad**:

```text
- Curves: drawLine, drawArc, drawTangentArc, drawCircle, drawEllipse, drawBezierCurve, drawSplineCurve (interpolating B-spline through provided points).
- For involutes/airfoils/spirals: sample the form into ~8 control points, then drawSplineCurve(points). For arcs: drawArc(start, mid, end) or drawCircle. Never chain straight segments where an arc or spline fits.
- Tessellation (linearDeflection, angularDeflection) is set at export time by the runtime — do not parameterise it in defaultParams.
```

**OpenCascade.js**:

```text
- Curves: GC_MakeArcOfCircle, Geom_Circle, Geom_BSplineCurve, Geom2dAPI_PointsToBSpline (for data-driven fits), BRepBuilderAPI_MakeEdge from a Geom-curve. Never chain BRepBuilderAPI_MakePolygon for what is a single analytical edge.
- Profile sketches: build wires from analytical edges, not polylines. Close every wire explicitly.
- Tessellation runs at export time via BRepMesh_IncrementalMesh — do not parameterise it in defaultParams.
- Memory: always call .delete() on intermediate gp_*, Geom*, BRep*, and TopoDS_* handles in a finally block.
```

**KCL (Zoo)**:

```text
- Curves: arc, tangentialArc, arcTo, tangentialArcTo, bezierCurve, circle, ellipse. Prefer tangentialArc when the next segment must continue smoothly.
- Pipe operator chains keep the analytical structure visible — do not break a smooth chain into multiple sketches just to compute intermediate values.
- Tessellation is handled by the runtime — do not expose it as a parameter.
```

**Manifold**:

```text
- Curves: there are no analytical curves — all geometry is mesh. Choose segment count, not curve form.
- Cylinders / spheres / revolves: segments ≈ max(16, π · diameter / 0.3) for visible parts, 0.1 for export-grade. Default 32 for small, 64 for large.
- Prefer Manifold.cylinder / Manifold.sphere / Manifold.revolve over manual CrossSection-from-points loops — the kernel computes the polygon for you.
- Avoid Manifold-of-Manifold compositions where a single Manifold.compose(arr) would do.
```

**JSCAD**:

```text
- Curves: there are no analytical curves — all geometry is mesh. Choose segment count, not curve form.
- primitives.circle({ segments }), primitives.cylinder({ segments }), extrusions.extrudeRotate({ segments }) — pick segments per Manifold's heuristic above.
- Prefer extrudeRotate or extrudeLinear over hand-built polygon-from-points loops when the profile has a regular form.
```

**OpenSCAD**:

```text
- Curves: no analytical curves — mesh kernel. Choose $fn / $fa / $fs, not curve form.
- Prefer adaptive tessellation globally: $fa = 2; $fs = 0.4; at the top of main.scad. Set $fn locally only when a specific feature needs an exact count (e.g. hex sockets).
- Avoid $fn > 64 on small features; the kernel will tessellate to the export deliverable independently.
- hull() and minkowski() are correct for genuine convex-hull and offset operations and catastrophic as stand-ins for loft or rotate_extrude. Use them deliberately.
- Use for-loops into a single sketch then extrude once, not union() of N pre-positioned children.
- render() forces eager CGAL/Manifold lifting — apply only to reused sub-trees, never to leaves.
```

### Change-log entries

```text
// EVAL(geometry-fidelity-global): pending benchmark — new global <geometry_fidelity> static section codifies analytical-curve-over-polyline-sampling, construction-strategy economy (revolve/loft/sweep), boolean ordering, fillet ordering, and a for-loop self-detection heuristic. Closes the helical-gear smoking gun documented at /Users/rifont/Downloads/helical_gear_design_2026-05-15T09-07.md where GPT-5.5 emitted involuteSamples/rootBlendSamples/topLandSamples/rootArcSamples polyline construction for a curve family with closed-form B-spline + exact arc representations, only correcting after a user nudge. Validates curve-heavy benchmarks (helical gear, NACA airfoil, Archimedean spiral, Rao nozzle bell) on tool-use,smoke. Per docs/research/code-cad-topology-best-practices.md F1, F3-F5, F9.
// EVAL(topology-hints-per-kernel): pending benchmark — new per-kernel <topology_hints> static section sourced from KernelConfig.topologyHints, mapping the global geometry-fidelity principle to each kernel's actual primitive vocabulary (Replicad: drawSplineCurve/drawArc; OCCT: Geom2dAPI_PointsToBSpline/GC_MakeArcOfCircle; KCL: tangentialArc/bezierCurve; Manifold/JSCAD: segment-count heuristic; OpenSCAD: $fa/$fs adaptive tessellation). Resolves the B-rep-vs-mesh kernel divide identified in docs/research/code-cad-topology-best-practices.md Kernel Capability Matrix. Validates that the global principle survives contact with each kernel's authoring surface.
```

## Supersession of `geometry-fidelity-curves` Plan

The prior plan (created during this conversation, not yet implemented) proposed a single global `<geometry_fidelity>` section with a for-loop detection heuristic and a single change-log entry. This research keeps the global section as the spine but **adds**:

| Plan element                         | Status       | Reason                                                                                                                                     |
| ------------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Global `<geometry_fidelity>` section | **Kept**     | Universal principle is real; F1/F2/F3/F4/F5/F9 all belong here                                                                             |
| For-loop self-detection heuristic    | **Kept**     | F9 confirms this is the single highest-leverage signal                                                                                     |
| Change-log entry                     | **Expanded** | Now two entries — global + per-kernel — referencing the helical-gear transcript                                                            |
| Per-kernel hints                     | **Added**    | F2/F7 show the B-rep-vs-mesh kernel divide cannot be papered over in a single global rule                                                  |
| `KernelConfig.topologyHints` field   | **Added**    | The right architectural home — sits next to `codeStandards` and `commonErrorPatterns` and reuses the existing per-kernel registry plumbing |
| Boolean ordering / fillet ordering   | **Added**    | F4/F5 belong in the same global section because they share the "topology economy" frame                                                    |
| Tests block extended                 | **Expanded** | Now also asserts per-kernel `<topology_hints>` is present and contains the kernel-specific primitive vocabulary                            |
| `commonErrorPatterns` updates        | **Added**    | R6–R8 thread the new vocabulary into existing per-kernel error-pattern strings                                                             |

The plan file at `~/.cursor/plans/geometry-fidelity-curves_<hash>.plan.md` should be updated by the user (or a follow-up planning pass) to reflect R1–R10 above before implementation begins. Implementation order is preserved: change-log → global section → per-kernel hints → tests → typecheck/test → benchmark.

## References

- Smoking gun: `/Users/rifont/Downloads/helical_gear_design_2026-05-15T09-07.md` (lines 210, 283–319, 378–384)
- Tau prior research: `docs/research/agentic-cad-geometric-intent-preservation.md` (Findings 1–8)
- Tau prior research: `docs/research/complex-task-agent-gap-analysis.md` (Findings 1, 5, 6)
- Tau prior research: `docs/research/system-prompt-audit.md`
- Tau prior research: `docs/research/replicad-performance-blueprint.md` (Tiers 3–5, 8)
- Tau prior research: `docs/research/mesh-continuity-test-semantics.md`
- Tau prior research: `docs/research/replicad-occt-usage-refinement.md` (analytical curve catalogue)
- Tau prior research: `docs/research/sysml2-cad-intent-architecture.md` (design intent durability)
- Policy: `docs/policy/context-engineering-policy.md` (right altitude, single source of truth, examples over rules, dynamic context discovery, ≤20% negative-guidance ratio)
- Current prompt: `apps/api/app/api/chat/prompts/cad-agent.prompt.ts`
- Kernel configs: `apps/api/app/api/chat/prompts/kernel-prompt-configs/{replicad,opencascadejs,zoo,manifold,jscad,openscad}.prompt.config.ts`
- Canonical examples: `apps/api/app/api/chat/prompts/kernel-prompt-configs/*.prompt.example.{ts,scad,kcl}`

## Appendix A: Helical Gear Transcript — Failure and Recovery Side-by-Side

**Before user correction** (lines 280–319):

```ts
involuteSamples: 9, rootBlendSamples: 4, topLandSamples: 3, rootArcSamples: 4,
// …
for (let sample = 1; sample <= p.rootBlendSamples; sample += 1) {
  const t = smoothStep(sample / p.rootBlendSamples);
  // … addPoint(polarPoint(radius, centerAngle - halfAngle))
}
for (let sample = 1; sample <= p.involuteSamples; sample += 1) {
  const t = sample / p.involuteSamples;
  // … addPoint(polarPoint(radius, centerAngle - halfToothAngleAt(radius)))
}
// repeated four more times for top land, return flank, return blend, root arc
```

**After user correction** (line 384, agent's own diagnosis):

> "I'll replace the polyline tooth construction with spline involute flank edges plus exact circular root/tip arcs, reducing topology and build cost."

The agent's recovery language is itself the right prompt-ready phrase: _spline involute flank edges plus exact circular root/tip arcs_ — analytical curves, kernel vocabulary, named tradeoff (topology + build cost). The global `<geometry_fidelity>` section and the Replicad `<topology_hints>` together would have prevented the original failure rather than catching it on iteration two.

## Appendix B: Curve Decision Tree (one-screen reference)

```
Curve to construct on B-rep kernel (Replicad / OCCT / KCL)?
├── Closed-form parameterisation (involute, ellipse, helix, NACA, cycloid, spiral)?
│   └── Sample ~8 control points → analytical spline (drawSplineCurve / Geom_BSplineCurve / bezierCurve)
├── Chain of arcs and lines (engineering profile)?
│   └── Emit each segment as its own analytical edge (drawArc + drawLine / arc + line)
├── Data-driven (CSV, scan, traced from image)?
│   └── drawSplineCurve(points) / Geom2dAPI_PointsToBSpline — let kernel fit
├── Genuinely piecewise-linear (faceted prop, hinted glyph)?
│   └── Polyline is correct — comment why
└── Targeting a mesh kernel?
    └── Polyline is the only option — use segment-economy heuristic instead
```
