---
title: 'OCJS Adapter API Blueprint — Post-PoC Stocktake and Forward Plan'
description: 'Blueprint for the opencascade.js Option D adapter API after PoC validation — consolidates findings, prescribes consumer DX, tabulates perf vs status quo, enumerates open questions, defines real-world model coverage for rollout'
status: draft
created: '2026-05-17'
updated: '2026-05-17'
category: architecture
related:
  - docs/research/ncollection-binding-architecture.md
  - docs/research/ocjs-bindgen-unknown-coverage-audit.md
  - docs/research/ocjs-bindgen-unknown-coverage-audit-v2.md
  - docs/research/replicad-performance-blueprint.md
  - docs/research/ocjs-additionalcppcode-type-erasure-regression.md
---

# OCJS Adapter API Blueprint — Post-PoC Stocktake and Forward Plan

A consolidated stock-take of the Option D ("Boundary Narrowing with Adapter Returns") investigation as of 2026-05-17, after three rounds of progressively more demanding PoCs (single-shape → all 10 NCollection shapes → replicad-style hot paths → complex real-world models). Captures what is now empirically settled, what remains unproven, the precise DX consumers should expect, and the work required before production cutover.

## Executive Summary

- **Architecture is settled.** Option D + Strategy F (zero-copy `typed_memory_view`) is the production-target architecture. Three PoCs (boundary-narrowing, comprehensive-all-shapes, replicad-impact) all confirm the mechanism works end-to-end on the production emcc 5.0.1 toolchain.
- **Performance picture revised downward.** The 13–27 % end-to-end speedup measured on simple-build models (`simpleVase`, `birdhouse`) was inflated by build-cost being trivial. On complex-build models (`helical-gear` at 124 K verts / 5.8 s build) the floor is **6 % E2E**. Real-world expectation: 6 % (heavy CAD) → 25 % (light workloads). Absolute saving is linear in vertex count (~3 ms / 1 K verts) regardless of build complexity.
- **Pattern 2 regression worry was overstated.** Naive Strategy D doesn't regress at realistic NbPoles ≤ 15 (it speeds up by 24 %). Split-API D is a 3.5–4.4× win on top. Recommendation: ship naive D first; the split-API mitigation remains valuable future-proofing.
- **Six high-priority blockers remain before production rollout** (worker safety, lifetime contract, TS ergonomics, adapter authoring scale, mesh-canonical verification, build-path optimisation).
- **Coverage gap is the highest residual risk.** All measurements come from 5 model fixtures (2 trivial + 3 complex). Several proposed API surface areas (shell, pipe sweep, high-NbPoles interpolation, IGES/STEP import, multi-component assembly) are completely unmeasured. We propose 7 additional real-world model ports to close this gap.
- **Removing NCollection from the public API has real costs**: OCCT-savvy users lose direct composition; debugging gets harder at the opaque boundary; per-API adapter authoring scales linearly with surface area exposed. The `NCollectionLiveHandle` fallback addresses some but not all of these.

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [What the PoCs Settled](#what-the-pocs-settled)
3. [Proposed API Surface — DX Guide](#proposed-api-surface--dx-guide)
4. [Performance Implications — Consolidated](#performance-implications--consolidated)
5. [Syntax Comparison for Consumers](#syntax-comparison-for-consumers)
6. [Implementation Roadmap](#implementation-roadmap)
7. [Open Questions and Required PoCs](#open-questions-and-required-pocs)
8. [Real-World Model Coverage Plan](#real-world-model-coverage-plan)
9. [Shortcomings of Removing NCollection from the Public API](#shortcomings-of-removing-ncollection-from-the-public-api)
10. [References](#references)
11. [Appendix A — Consolidated Bench Data](#appendix-a--consolidated-bench-data)

## Problem Statement

The `ncollection-binding-architecture.md` research identified Option D as the recommended path to dissolve the `unknown` cascade in `dist/opencascade_full.d.ts` (4 038 hits) and collapse 613 per-permutation `class_<NCollection_*>` registrations into ~30. Three subsequent PoCs validated the architecture but also revealed that:

- The original headline performance numbers were measured on workloads where mesh extraction _was_ the workload — they do not generalise to consumers that spend most time in OCCT build (booleans, fillets, ThruSections, IncrementalMesh).
- The TypeScript surface returned by raw Strategy F adapters (`{ vertexPtr: number, vertexCount: number, ... }`) is ergonomically worse than the `unknown` it replaces; without a wrapping layer the DX win is forfeited.
- Several risk categories (worker-thread `Transferable` semantics, C++-heap pointer lifetime, adapter authoring burden at scale) were assumed-safe but never tested.
- Coverage is narrow. Five fixtures total, none of which exercise shells, pipe sweeps, high-NbPoles interpolation, file import, or multi-component assemblies.

This document is the bridge from "PoC complete" to "production rollout plan ready" — it inventories what is proven, what is not, and what must happen before broader cutover.

## What the PoCs Settled

### PoC artefact summary

| PoC                            | Scope                                                        | Status   | Key contribution                                                                                                             |
| ------------------------------ | ------------------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `option-d-boundary-narrowing/` | Single `NCollection_Array1<Pnt3>` × 4 strategies             | Complete | Confirmed Strategy D mechanism works on emcc 5.0.1; ruled out Strategy C                                                     |
| `option-d-comprehensive-poc/`  | All 10 NCollection shapes × 4 strategies × N sizes           | Complete | OQ1–OQ5 resolved; mutation/leak/parity/dts-assert/bench harnesses all green                                                  |
| `replicad-impact-poc/` (PoC 3) | Real replicad hot paths + 2 simple models + 3 complex models | Complete | E2E perf measured on representative consumer workloads; uncovered build-cost dominance + ThruSections+Fillet incompatibility |

### Hypothesis verdicts after PoC 3

Verdicts as of 2026-05-17. Confidence column reflects how directly each was measured (vs extrapolated).

| ID     | Statement                                                                | Verdict                                                     | Confidence                                                                            |
| ------ | ------------------------------------------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **H1** | Pattern 1 input loops are a 5–50 µs per-curve WIN                        | **CONFIRMED**                                               | High — measured across n ∈ {16, 64, 256, 1024}                                        |
| **H2** | Pattern 2 naive D regresses by ~25 µs/segment                            | **REFUTED at realistic scale**                              | Medium — only tested at NbPoles ≤ 15 (BSpline-fitter clamp); cross-over point unknown |
| **H3** | Split-API D mitigation restores parity within 10 %                       | **REFUTED — exceeds, 3.5–4.4× faster**                      | High — measured across 4 sizes                                                        |
| **H4** | Pattern 3 typed-memory-view delivers 100–300× speedup                    | **CONFIRMED for pure extraction; E2E bounded at 6–34 %**    | Medium — pure-extraction not isolated from `BRepMesh_IncrementalMesh` baseline        |
| **H5** | Pattern 4 ellipsoid Poles is neutral at production sizes                 | **CONFIRMED with caveat** (7–21 % faster, sub-ms magnitude) | High                                                                                  |
| **H6** | Real replicad workloads regress under naive-D, recover under split-API-D | **REFUTED for regression; CONFIRMED for split-API win**     | Medium — no regression observed at scales tested                                      |
| **H7** | E2E build + mesh under split-API-D + Dp is a net WIN                     | **CONFIRMED with revised magnitude (6–27 %)**               | High on 5 fixtures; coverage gap remains                                              |

### Performance findings — the empirical contour

| Workload class                                     | Build dominance                  | Strategy F (mesh extract) % win | Strategy D (BSpline build) % win |
| -------------------------------------------------- | -------------------------------- | ------------------------------: | -------------------------------: |
| Trivial-build, small mesh (birdhouse 5 K verts)    | ~25 % build / ~75 % mesh+extract |                      **25.5 %** |                 n/a (no BSpline) |
| Trivial-build, medium mesh (simpleVase 5 K verts)  | ~10 % build / ~90 % mesh+extract |                      **12.5 %** |                   0.1 % (parity) |
| Light-build, medium mesh (rao-nozzle 12 K verts)   | ~20 % build / ~80 % mesh+extract |                      **23.3 %** |                              n/a |
| Medium-build, medium mesh (wavy-vase 11 K verts)   | ~35 % build / ~65 % mesh+extract |                       **6.6 %** |                              n/a |
| Heavy-build, large mesh (helical-gear 124 K verts) | ~35 % build / ~65 % mesh+extract |                       **6.2 %** |                              n/a |

Insight: the percent E2E speedup is approximately `extractCost / (buildCost + meshCost + extractCost)`. Strategy F caps `extractCost` near zero; everything else is unaffected.

### Findings unique to PoC 3 (complex models)

| #      | Finding                                                                                                                                                                 | Severity | Action                                                                                   |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| **F1** | `BRepOffsetAPI_ThruSections` + `BRepFilletAPI_MakeFillet` reproducibly faults with "memory access out of bounds" on polysides input                                     | Medium   | Investigate (separate research); Pipe-sweep alternative may not have this bug            |
| **F2** | `TopExp_Explorer(TopAbs_EDGE)` yields each edge once per face — mandatory dedup for any edge-set algorithm                                                              | Low      | Documented; helper provides `forEachEdge` with built-in dedup                            |
| **F3** | Mesh-hash divergence between A and F is **systematic across every model with REVERSED faces** (i.e. every model with booleans or thru-sections)                         | Medium   | Verify F output matches replicad-canonical; until then F is "different but consistent"   |
| **F4** | Heavy-build models spend 60–70 % of E2E time in OCCT internals (`IncrementalMesh`, `BRepAlgoAPI_*`, `BRepFilletAPI_*`) — beyond Option D's reach                        | High     | Build-path optimisation is the next research target (see Replicad Performance Blueprint) |
| **F5** | `using` syntax holds up under deep call chains; only the _final returned shape_ requires hand-managed lifetime (`using` would dispose it before the caller receives it) | Low      | Documented pattern in helpers.mjs: final result expression, not a `using` declaration    |

## Proposed API Surface — DX Guide

The adapter API has two consumer profiles that we must serve simultaneously:

- **High-level kernel authors** (replicad, `@taucad/runtime` kernel adapters): want idiomatic JS/TS, willing to `delete()` for OCCT handles, prefer `Array<T>` / `TypedArray` over raw pointers.
- **Direct OCJS consumers** (geometry pipelines, file-format converters, demos): same as above, but also need to compose adapter outputs into further OCCT calls without re-marshalling.

The API satisfies both via a layered design.

### Layer 1 — Native JS types for "data out" boundaries

Every adapter that produces tabular data (points, doubles, indices, mesh attributes) returns a native JS type or a thin wrapper. No raw `ptr/size` pairs reach the consumer.

```typescript
// === Layer 1 surface ===

// Primitive arrays (zero-copy view into wasm heap)
extractMeshVertices(face: TopoDS_Face): Float32Array;   // Strategy Dp / F
extractMeshTriangles(face: TopoDS_Face): Uint32Array;   // Strategy Dp / F
extractMeshNormals(face: TopoDS_Face): Float32Array;    // Strategy Dp / F

// Whole-mesh in one call (replicad's ReplicadMeshData pattern)
extractMesh(shape: TopoDS_Shape, opts?: MeshExtractOpts): MeshData;

interface MeshData {
  readonly vertices: Float32Array;      // [x0,y0,z0, x1,y1,z1, ...]
  readonly triangles: Uint32Array;      // [i0,i1,i2, i3,i4,i5, ...]
  readonly normals: Float32Array;       // [nx0,ny0,nz0, ...]
  readonly faceGroups: ReadonlyArray<{ start: number, count: number, faceId: number }>;
  /** Releases the underlying wasm-heap buffers. The TypedArrays become invalid after dispose. */
  [Symbol.dispose](): void;
}

// Non-primitive sequences (per-element copy — Strategy D)
getSurfacePoles(s: Geom_BSplineSurface): gp_Pnt[];               // returns real JS Array
getCurveKnots(c: Geom_BSplineCurve): Float64Array;               // primitive → typed array
getCurveMultiplicities(c: Geom_BSplineCurve): Int32Array;        // primitive → typed array

// Map-shaped containers (DataMap, IndexedMap)
getShapeBoxes(shape: TopoDS_Shape): Map<TopoDS_Shape, Bnd_Box>;  // Strategy D
```

The `Symbol.dispose` slot on `MeshData` enables ES2026 `using`:

```typescript
using mesh = oc.extractMesh(solid, { tolerance: 0.1 });
gpuRenderer.uploadMesh(mesh.vertices, mesh.triangles, mesh.normals);
// `mesh` disposed at end of block; wasm-heap buffers freed.
```

### Layer 2 — Bulk-input adapters for "data in" boundaries

Every method that historically required `new NCollection_Array1<T>(1, n)` + N `SetValue()` calls gets a typed-array overload.

```typescript
// === Layer 2 surface ===

// Pattern 1 — B-spline approximation (was: 3N embind hops via NCollection)
makeBSplineEdge(
  points: Float64Array,            // packed [x,y,z, x,y,z, ...]
  opts?: { degMin?: number, degMax?: number, tolerance?: number },
): TopoDS_Edge;

// Same primitive, accepts JS array of tuples for ergonomics
makeBSplineEdge(
  points: ReadonlyArray<[number, number, number]>,
  opts?: { degMin?: number, degMax?: number, tolerance?: number },
): TopoDS_Edge;

// Pattern 4 — Surface pole mutation
setSurfacePoles(s: Geom_BSplineSurface, poles: Float64Array): void;
setSurfacePoles(s: Geom_BSplineSurface, poles: ReadonlyArray<[number, number, number]>): void;
```

Internally these allocate via `_malloc`, copy via `HEAPF64.set`, call the adapter, and `_free` — the consumer never touches a pointer.

### Layer 3 — Long-tail `NCollectionLiveHandle` (opt-in)

For the rare consumer that needs a live OCCT handle (pass-through to a third OCCT call without JS materialisation), a single opaque handle class is exposed. **This is opt-in via a binding flag**; default builds omit it.

```typescript
// === Layer 3 surface (opt-in) ===

// Acquire a live handle (no copy)
const handle: NCollectionLiveHandle = oc.getSurfacePolesHandle(surface);

// Pass it directly to another OCCT call (no marshalling)
oc.setSurfacePolesFromHandle(otherSurface, handle);

// Or materialise to JS when needed
const asArray: gp_Pnt[] = handle.toArray();

handle.delete();
```

### How replicad consumes this

Replicad's `ReplicadMeshExtractor` is the spiritual ancestor of Layer 1's `extractMesh`. Migrating replicad means:

```typescript
// Before (replicad/src/mesh.ts, status quo)
const [r, gc] = localGC();
const triangulation = r(BRep_Tool.Triangulation(face, location, 0));
if (triangulation.isDeleted()) {
  gc();
  return null;
}
const trsf = r(location.Transformation());
const nbNodes = triangulation.NbNodes();
const vertices: number[] = [];
for (let i = 1; i <= nbNodes; i++) {
  const node = r(triangulation.Node(i));
  const transformed = r(node.Transformed(trsf));
  vertices.push(transformed.X(), transformed.Y(), transformed.Z());
}
const triangles: number[] = [];
const nbTri = triangulation.NbTriangles();
for (let i = 1; i <= nbTri; i++) {
  const tri = r(triangulation.Triangle(i));
  const out = tri.Get(0, 0, 0);
  triangles.push(out.theN1 - 1, out.theN2 - 1, out.theN3 - 1);
}
gc();
return { vertices: Float32Array.from(vertices), triangles: Uint32Array.from(triangles) };

// After (Layer 1 adapter)
using mesh = oc.extractMesh(face, { tolerance: 0.1, angularTolerance: 0.1 });
return { vertices: mesh.vertices, triangles: mesh.triangles };
```

Lines drop from ~25 → 2; embind hops drop from ~3N+2N+1 to ~5 + 1 zero-copy view.

### How a direct OCJS consumer composes adapters

```typescript
// Build a profile + revolve, extract mesh, ship to a viewer — all in one chain
async function buildAndMesh(oc: OCJS, profilePoints: Float64Array): Promise<MeshData> {
  // Layer 2: typed-array input
  using profileEdge = oc.makeBSplineEdge(profilePoints, { tolerance: 0.1 });

  using axisStart = new oc.gp_Pnt(0, 0, 0);
  using axisDir = new oc.gp_Dir(0, 0, 1);
  using axis = new oc.gp_Ax1(axisStart, axisDir);

  using face = makeFaceFromProfile(oc, profileEdge); // helper around BRepBuilderAPI_MakeFace
  using revol = new oc.BRepPrimAPI_MakeRevol(face, axis, 2 * Math.PI, false);
  using solid = revol.Shape();

  // Layer 1: typed-array output
  return oc.extractMesh(solid, { tolerance: 0.1, angularTolerance: 0.1 });
}
```

Note the `using` discipline: every OCCT handle is a `using` declaration, the final returned `MeshData` carries its own `Symbol.dispose` for the caller. No manual `.delete()` in the consumer's hot path.

## Performance Implications — Consolidated

### Micro-bench summary (PoC 2 + PoC 3 data)

| Pattern                                  | Status quo (Strategy A) | Adapter (D / F)        | Δ at realistic scale | Mechanism                                               |
| ---------------------------------------- | ----------------------- | ---------------------- | -------------------- | ------------------------------------------------------- |
| **Input loop** (Pattern 1, n=16 pts)     | 0.81 ms                 | 0.75 ms (Strategy D)   | **−8 %**             | 1 malloc + 1 `HEAPF64.set` vs 16 `SetValue` embind hops |
| **Pass-through** (Pattern 2, NbPoles=15) | 0.013 ms                | 0.003 ms (split-API D) | **−74 %**            | 1 C++ call vs 6 embind round-trips                      |
| **Triangulation** (Pattern 3, 5 K verts) | 58.6 ms                 | 43.1 ms (Strategy F)   | **−26 %**            | ~25 K embind hops → 5 + zero-copy view                  |
| **Surface poles** (Pattern 4, ~30 poles) | 0.47 ms                 | 0.37 ms (Strategy D)   | **−21 %**            | Single C++ extraction of 2D pole grid                   |

### End-to-end model summary (PoC 3 data)

| Model        |   Verts | Status quo (A) | Adapter (F) |           Δ | Absolute saving |
| ------------ | ------: | -------------: | ----------: | ----------: | --------------: |
| birdhouse    |     5 K |        31.7 ms |     23.6 ms | **−25.5 %** |          8.1 ms |
| simpleVase   |     5 K |        48.0 ms |     42.4 ms | **−12.5 %** |          5.6 ms |
| rao-nozzle   |  11.5 K |       144.1 ms |    110.5 ms | **−23.3 %** |         33.6 ms |
| wavy-vase    |  10.8 K |       436.5 ms |    407.9 ms |  **−6.6 %** |         28.6 ms |
| helical-gear | 123.7 K |       5 791 ms |    5 432 ms |  **−6.2 %** |          359 ms |

Pattern: absolute saving ∝ vertex count (~3 ms / 1 K verts, stable). Relative win ∝ `extractCost / totalCost`, which collapses as build complexity grows.

### Tail latency

Tighter distributions under adapter strategies are a separate, durable win:

| Model        | Status quo p95 | Adapter p95 |        p95 improvement |
| ------------ | -------------: | ----------: | ---------------------: |
| birdhouse    |       104.9 ms |     25.5 ms | **−76 %** (4× tighter) |
| simpleVase   |        49.0 ms |     42.5 ms |                  −13 % |
| rao-nozzle   |       150.3 ms |    113.0 ms |                  −25 % |
| wavy-vase    |       506.5 ms |    421.0 ms |                  −17 % |
| helical-gear |       7 212 ms |    5 470 ms |                  −24 % |

The birdhouse p95 collapse (105 → 26 ms) is the most striking single number in the whole PoC. Root cause is not isolated yet (see Open Question A3).

### What does NOT improve under Option D

Strategy D and Strategy F operate entirely at the JS↔WASM boundary. **All OCCT internal work runs identically.** Specifically:

| Subsystem                               | Status-quo cost        | Adapter cost |   Δ |
| --------------------------------------- | ---------------------- | ------------ | --: |
| `BRepAlgoAPI_Cut/Fuse/Common` (boolean) | Per-call OCCT internal | Identical    | 0 % |
| `BRepFilletAPI_MakeFillet/Chamfer`      | Per-call OCCT internal | Identical    | 0 % |
| `BRepOffsetAPI_ThruSections` (loft)     | Per-call OCCT internal | Identical    | 0 % |
| `BRepMesh_IncrementalMesh`              | Per-call OCCT internal | Identical    | 0 % |
| `BRepPrimAPI_MakeBox/Cylinder/Sphere`   | Per-call OCCT internal | Identical    | 0 % |

For the helical-gear (5.8 s E2E), roughly 2 s is OCCT build internals + 3.5 s is `IncrementalMesh` + 0.3 s is extraction. Option D only addresses the last 5 %.

### Bundle-size implications

| Artefact                           | Status quo (Option A) | Option D |                     Δ |
| ---------------------------------- | --------------------: | -------: | --------------------: |
| `dist/opencascade_full.d.ts`       |               11.6 MB |  ~7.5 MB |             **−35 %** |
| `dist/opencascade_full.wasm`       |                ~40 MB |   ~40 MB | ~0 % (OCCT dominates) |
| Per-adapter wasm overhead          |                   n/a |  ~5–8 KB |              additive |
| Per-NCollection `class_<>` binding |             ~12–25 KB |        0 |               savings |

Net wasm change is small and likely _negative_ (savings outweigh additions). `.d.ts` change is the dominant DX win.

## Syntax Comparison for Consumers

### Pattern 1 — Build a B-spline edge from sampled points

|               | Status quo (Option A)                                                              | Option D adapter               |
| ------------- | ---------------------------------------------------------------------------------- | ------------------------------ |
| Lines         | ~22                                                                                | ~3                             |
| Embind hops   | 3N + 4                                                                             | 2                              |
| Memory mgmt   | N `using` + 1 manual `.delete()`                                                   | None (one `using` on result)   |
| Type fidelity | `NCollection_Array1_gp_Pnt`, `GeomAPI_PointsToBSpline`, `Handle_Geom_BSplineCurve` | `Float64Array` → `TopoDS_Edge` |

```typescript
// Status quo
const pnts = new oc.NCollection_Array1_gp_Pnt(1, points.length);
try {
  for (let i = 0; i < points.length; i++) {
    using p = new oc.gp_Pnt(points[i][0], points[i][1], points[i][2]);
    pnts.SetValue(i + 1, p);
  }
  using builder = new oc.GeomAPI_PointsToBSpline(pnts, 1, 6, oc.GeomAbs_Shape.GeomAbs_C2, 1e-3);
  if (!builder.IsDone()) throw new Error('failed');
  using curve = builder.Curve();
  using maker = new oc.BRepBuilderAPI_MakeEdge(curve);
  return maker.Edge();
} finally {
  pnts.delete();
}

// Option D adapter
const flat = new Float64Array(points.flat());
return oc.makeBSplineEdge(flat, { tolerance: 1e-3 });
```

### Pattern 3 — Extract mesh from a face

|               | Status quo (Option A)                                              | Option D adapter                          |
| ------------- | ------------------------------------------------------------------ | ----------------------------------------- |
| Lines         | ~25                                                                | ~2                                        |
| Embind hops   | ~3N + 2T + 5                                                       | 5 + zero-copy views                       |
| Memory mgmt   | Multiple `using` + manual array building                           | One `using` on `MeshData`                 |
| Type fidelity | `Poly_Triangulation`, `Poly_Triangle`, `gp_Pnt`, raw number arrays | `Float32Array`, `Uint32Array`, `MeshData` |

```typescript
// Status quo
using ex = new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
const verts: number[] = [];
const tris: number[] = [];
let offset = 0;
for (; ex.More(); ex.Next()) {
  using face = oc.TopoDS.Face(ex.Current());
  using loc = new oc.TopLoc_Location();
  using tri = oc.BRep_Tool.Triangulation(face, loc, 0);
  if (!tri || tri.isDeleted?.()) continue;
  using trsf = loc.Transformation();
  const nbNodes = tri.NbNodes();
  for (let i = 1; i <= nbNodes; i++) {
    using node = tri.Node(i);
    using t = node.Transformed(trsf);
    verts.push(t.X(), t.Y(), t.Z());
  }
  const nbTri = tri.NbTriangles();
  for (let i = 1; i <= nbTri; i++) {
    using t = tri.Triangle(i);
    const out = t.Get(0, 0, 0);
    tris.push(offset + out.theN1 - 1, offset + out.theN2 - 1, offset + out.theN3 - 1);
  }
  offset += nbNodes;
}
const vertices = Float32Array.from(verts);
const triangles = Uint32Array.from(tris);

// Option D adapter
using mesh = oc.extractMesh(shape, { tolerance: 0.1 });
const vertices = mesh.vertices;
const triangles = mesh.triangles;
```

### Pattern 2 — Read BSpline poles + reassemble

|                | Status quo (Option A)    | Naive D            | Split-API D             |
| -------------- | ------------------------ | ------------------ | ----------------------- |
| Lines          | ~12                      | ~10                | ~3                      |
| Embind hops    | 6 (3 reads + 3-arg ctor) | 6 + 3N marshal     | 1                       |
| Realistic perf | baseline                 | **−24 %** (faster) | **−74 %** (much faster) |

```typescript
// Status quo
using poles = src.Poles();
using knots = src.Knots();
using mults = src.Multiplicities();
return new oc.Geom2d_BSplineCurve(poles, knots, mults, src.Degree(), false);

// Split-API D
return oc.splitBSpline2dViaHandles(src);
```

## Implementation Roadmap

### Phase −1 — Prerequisites ✅ already complete

| Step                                                                                  | Status                 |
| ------------------------------------------------------------------------------------- | ---------------------- |
| `additionalCppCode` regression fix in `generate.py:474-515` + `yaml_build.py:521-529` | ✅ Done                |
| Embind PR #25272 (`register_type<T>`) in toolchain                                    | ✅ emcc 5.0.1 ships it |
| Three PoCs validated end-to-end                                                       | ✅ Done                |

### Phase 0 — Consumer audit (1–2 days)

| Step                                                                            | Output                                                          |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `rg -t ts 'NCollection_' libs/ apps/ packages/ repos/replicad/ repos/ocjs.org/` | List of every JS call-site requiring a live NCollection handle  |
| Categorise by container shape + opt-in vs default                               | Decide if `NCollectionLiveHandle` (Layer 3) needs to ship in v1 |
| Survey: anyone shipping mesh extraction without ReplicadMeshExtractor?          | Determines Layer 1's adoption surface                           |

### Phase 1 — Production adapter library (2–3 weeks)

| Step                                                                                                               | Acceptance gate                                                             |
| ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Promote `replicad-impact-poc/additional-adapters.cpp` to `build-configs/adapters/`                                 | Lives in main `full.yml`, not just experiment                               |
| Author the `register_type<>` macro pack covering all 10 NCollection shapes                                         | All 10 shapes round-trip A↔D parity in CI                                   |
| Add Layer 1 `extractMesh` + `MeshData` + `[Symbol.dispose]`                                                        | TS surface matches DX guide; smoke tests pass on 5 PoC models               |
| Add Layer 2 typed-array overloads for the top 20 OCCT call sites (`MakeBSpline*`, `MakeBezier*`, `MakeWire`, etc.) | Each overload has a documented "from typed-array" + "from JS array" variant |
| Per-adapter parity tests (Strategy A vs D)                                                                         | Geometric equivalence on all bench fixtures                                 |

### Phase 2 — Coverage expansion (1–2 weeks)

| Step                                                      | Acceptance gate                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------------ |
| Port the 7 additional real-world models (Section 8)       | All compile + mesh under custom subset YAML                        |
| Re-run bench matrix on all 12 models (5 existing + 7 new) | Updated `complex-benches.json` with realistic perf envelope        |
| Resolve open question A4 (mesh-canonical verification)    | F output byte-identical (modulo winding) with replicad-the-package |
| Investigate F1 (ThruSections+Fillet crash)                | Either fixed, or documented incompatibility with mitigation        |

### Phase 3 — Bindgen integration (1–2 weeks)

| Step                                                                    | Acceptance gate                                               |
| ----------------------------------------------------------------------- | ------------------------------------------------------------- |
| Drop `discover.py` two-phase parse for NCollection (feature-flag first) | Both old and new paths green in CI for one OCCT release cycle |
| Delete R5, R8–R12 patch series and their tests                          | `unknown` count ≤ 50 in `dist/opencascade_full.d.ts`          |
| Add the long-tail `NCollectionLiveHandle` (opt-in via YAML flag)        | Phase 0 audit consumers green-light                           |
| Document the adapter authoring workflow                                 | Bindgen contributors can add new adapters via skill / runbook |

### Phase 4 — Rollout (1 week)

| Step                                                              | Acceptance gate                                                      |
| ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| Cut `@taucad/runtime` to consume Layer 1 + Layer 2 adapters       | Existing replicad-style workflows pass regression tests              |
| Telemetry: histogram timings keyed by build path (Phase 1 prereq) | A/B comparison shows projected envelope holds in production          |
| Feature flag for rollback                                         | Disable adapter codepaths per-method without redeploy                |
| Update `docs/policy/graphics-backend-policy.md` if applicable     | Adapter pattern documented as the canonical OCJS-↔-JS boundary style |

### Phase 5 — Cleanup (≤1 week)

| Step                                                                                      | Acceptance gate                          |
| ----------------------------------------------------------------------------------------- | ---------------------------------------- |
| Remove the `monomorphize` strategy code path from bindgen                                 | Only `boundary_narrowing` survives       |
| Delete `docs/research/ocjs-bindgen-unknown-coverage-audit*.md`'s R-series as `superseded` | Or merge into a single historical record |
| Publish migration guide for direct OCJS consumers                                         | Linked from package README               |

Total rollout window: **6–9 weeks** depending on Phase 2 coverage findings.

## Open Questions and Required PoCs

Grouped by severity. Each question lists the missing evidence and the PoC needed to close it.

### Block-rollout questions

#### OQ-A — Pattern 2 regression boundary **— CLOSED (2026-05-18, M1 bench)**

- **What we know**: Naive D is 24 % faster at NbPoles ≤ 15 on the isolated Pattern-2 micro-bench (the `Geom2dAPI_PointsToBSpline` clamp). H2 predicted regression at higher NbPoles.
- **Resolved finding (M1, 200 iter × 5 NbPoles cohorts on real `Geom2dAPI_Interpolate` pipeline)**: **No regression boundary exists in practice.** OCCT clamps the post-fit `NbPoles` to {4, 5, 8, 16, 41} for input sizes {30, 100, 300, 1 000, 3 000}; at every clamped value the three strategies (A, naive-D, split-API-D) land within ±5 % of each other (PARITY band) on a real curve-construction workflow. Only the smallest cohort (N=30, segPoles=4) shows split-API-D measurably ahead (−20 % median, −9 % naive-D). All parity hashes match exactly across A / naive-D / split-API-D.
- **Implication**: Pattern 2 naive-D is not a regression risk for replicad. Split-API-D is **only worth implementing for `Curve2D.splitAt`-style mutation paths** that perform `BSpline.Poles → constructor` round-trips outside any solver call; it is not a general curve-construction speedup. See `experiments/replicad-impact-poc/reports/m-coverage-benches.json` (`models.M1`) and `summary.md` § "M1 — high-NbPoles synthetic curve".

#### OQ-B — Worker / Transferable safety of `Float32Array` views

- **What we know**: Replicad commonly runs in a Web Worker; its mesh output is `postMessage`d to the main thread. Strategy F's TypedArrays are views over `WebAssembly.Memory.buffer`.
- **What we don't know**: (a) Can a TypedArray view of a worker's wasm memory be `postMessage`d intact? (b) What's the copy cost vs `structuredClone`? (c) Are there edge cases where transferring detaches the source's wasm buffer?
- **Required PoC**: Worker harness that runs `extractMesh` in a worker, `postMessage`s the result with various transfer-list configurations, verifies main-thread receives intact data + measures latency.

#### OQ-C — Lifetime contract — copy-out vs view-out

- **What we know**: Strategy F currently returns a `slice()` (defensive copy) inside `mesh.mjs`. Strategy Dp from the comprehensive PoC returns a _view_ (zero-copy).
- **What we don't know**: Which is the right default? View is faster but use-after-free on dispose-source-before-read; copy is safer but loses the zero-copy win for large meshes.
- **Required PoC**: Define and document the contract. Add a `MeshData.detach()` method that materialises a copy at consumer-controlled timing. Benchmark `slice()` vs `view + structuredClone` vs `view + transfer` for 100 K-vertex meshes.

#### OQ-D — TypeScript ergonomics + adapter wrapping layer

- **What we know**: Raw adapter returns `{ vertexPtr: number, vertexCount: number, ... }`. Layer 1 of the DX guide proposes a `MeshData` wrapper. We have not yet implemented the wrapper or measured its overhead.
- **What we don't know**: Where does wrapping happen — bindgen-generated TS file, hand-written `@taucad/runtime` facade, or via `register_type<T>` declaring the wrapped shape? What is the runtime cost of the wrapper (object allocation, getter functions)?
- **Required PoC**: Prototype each wrapping path against `extractMesh`; measure overhead vs raw adapter return.

#### OQ-E — Mesh-hash canonical verification **— PARTIALLY CLOSED (2026-05-18)**

- **What we know**: Strategy F output differs from naive walker output on **every non-trivial workload tested** (12/12 models: simpleVase, birdhouse, rao-nozzle, wavy-vase, helical-gear, M2 watering-can, M3 motor-housing, M4 LEGO, M5 threaded-screw, M6 STEP-single, M7 STEP-multi — only simpleVase produces matching hashes because it lacks any reversed faces). The divergence is systematically traceable to triangle-winding orientation on REVERSED faces; vertex positions match in every case.
- **Newly resolved**: The behavioural divergence is now characterised as **a universal property of any workload containing REVERSED faces**, not a per-model anomaly. This makes the rollout risk concrete: F is a silent behavioural change for any consumer that does not currently apply orientation correction in their own mesh extractor.
- **Still open**: Whether replicad-the-package's `ReplicadMeshExtractor` matches F's winding (the assumption made by H4) vs the naive walker. The remaining required PoC is therefore narrower: run **replicad-the-package** on one model (birdhouse is sufficient) and hash mesh output; compare to both `combo A` and `combo F` hashes from `m-coverage-benches.json`. If replicad-canonical = F → F is the correct default. If replicad-canonical = A (naive) → F is a behavioural change requiring opt-in.
- **Required residual PoC**: ~2 hours of work; one model, one comparison.

#### OQ-F — Adapter authoring scale **— PARTIALLY CLOSED (2026-05-18, by M2–M7 surface-area extrapolation)**

- **What we know**: PoC 3 hand-wrote ~10 adapter methods for 1 consumer (replicad). The Phase 1 estimate calls for ~150 adapters across all 10 NCollection shapes. The M-coverage PoC (M2–M7) added 5 more helpers (`interpolatePoints2d`, `interpolatePoints3d`, `pipeShellWithProfile`, `shellSolid`, `loadStepShape`, `collectSolids`) without needing any new NCollection adapters — every M1–M7 model is covered by the same 10 Pattern-{1,2,3,4} adapters.
- **Refined finding**: The "150 adapters" estimate appears to have been **inflated by 5–10× for the practical Phase-1 surface**. M1–M7 collectively exercise pipe sweeps, shells, interpolation, STEP I/O, helical wires, boolean trees, and fillets — i.e. all four Pattern families across the replicad-typical primitive set — using exactly the same 5 PoC adapter classes from the original micro-bench (PointsMaterializer, BSplineSplitAdapter, MeshExtractor, EllipsoidPolesAdapter). New NCollection shapes were needed only for `NCollection_HArray1<gp_Pnt[2d]>` (handle-wrapping for interpolation constructors), which is two trivial wrappers, not 150.
- **Still open**: The actual upper-bound count for a _full_ OCCT API exposure (not just replicad's hot paths). If we restrict to "what replicad and direct-API CAD consumers actually call", the answer appears to be **20–30 adapters total**, not 150 — making hand-authoring entirely tractable. Auto-generation remains valuable for bindgen consistency but is no longer on the blocking path.
- **Required residual PoC**: Audit the union of {replicad call-graph, `tau-examples/kernels`, public OCCT-on-wasm examples}, count unique NCollection-touching method signatures, confirm the 20–30 estimate before committing to hand-authoring.

### Mitigate-before-rollout questions

#### OQ-G — Birdhouse bimodal latency root cause

- **What we know**: Status-quo birdhouse: median 32 ms / mean 49 ms / **p95 105 ms**. D+F: median 24 ms / mean 24 ms / p95 26 ms. 4× tail-latency improvement, unexplained.
- **What we don't know**: Is the win from reduced handle pressure, reduced V8 GC pauses, reduced wasm memory growth events, or OCCT internal allocator effects?
- **Required PoC**: Re-run with `--prof`, `--trace-gc`, and per-iteration `wasmMemory.buffer.byteLength` snapshots. Identify root cause. Important because if the win is "doesn't trigger heap growth", it disappears for users who size `INITIAL_MEMORY` higher.

#### OQ-H — ThruSections + Fillet compatibility (F1)

- **What we know**: `BRepFilletAPI_MakeFillet` reproducibly faults with "memory access out of bounds" when applied to any solid produced by `BRepOffsetAPI_ThruSections` from polysides input.
- **What we don't know**: Is this an OCCT bug, an emcc/wasm binding bug, or a known incompatibility? Does `BRepOffsetAPI_MakePipeShell` (the alternative twist primitive) have the same issue?
- **Required PoC**: Reproduce in native OCCT (non-WASM) to isolate the layer. If native OCCT also faults → upstream bug; report. If only WASM → bindgen/emcc investigation. If Pipe sweep is clean → use it as the twist primitive for vase/gear ports.

#### OQ-I — Cold-start vs steady-state cost

- **What we know**: Bench harness uses `warmup 5/case`. Steady-state perf is well-characterised.
- **What we don't know**: Cold-start cost (first iteration, fresh wasm module). CAD apps often spawn worker-per-build patterns where every build IS a cold start.
- **Required PoC**: Add "cold" bench variant that instantiates a fresh module per iteration. Time first call only. Compare A vs F.

#### OQ-J — Bundle-size delta of adapter layer

- **What we know**: PoC 3 wasm is 15.7 MB (custom subset). Production OCJS is ~40 MB.
- **What we don't know**: Per-adapter incremental wasm size cost; the 150-adapter Phase 1 plan needs a budget.
- **Required PoC**: Build with vs without `additional-adapters.cpp`, diff `wasm-objdump` symbol sizes. Extrapolate.

#### OQ-K — Memory under chain pipelines **— CLOSED (2026-05-18, M-coverage bench)**

- **What we know**: Memory `Δwasm` deltas per call are characterised; some calls trigger heap growth.
- **Resolved finding (M2–M7, 15–40 iterations × A/F combos)**: **Steady-state memory does not exist** on OCCT-on-wasm. Per-iteration wasm growth ranges from ~3 MB (M4 LEGO) to ~45 MB (M7 STEP-multi); the allocator (both dlmalloc and mimalloc) retains pages across iterations indefinitely. A single Node process running M1–M7 back-to-back crashes with a wasm table-OOB at ~3 GB cumulative growth — well before the 4 GB cap. Switching from dlmalloc to mimalloc reduced per-iteration fragmentation enough to push the failure point from M5/A to mid-M5/F, but did **not** eliminate the underlying retention behaviour. The bench harness now spawns one Node process per model (`run-m-coverage-all.mjs`).
- **Implication**: Long-running editor sessions (1000s of model edits in a single web worker) **will hit the same wall**. Consumers MUST recycle the wasm Module instance after ~500 boolean operations or ~2 GB of wasm growth (whichever comes first). This is a platform property independent of Option D; Option D's per-call `_malloc`/`_free` scratch pattern is at worst neutral and at best slightly better than the status-quo NCollection-handle pattern (which leaks any intermediate NCollection nodes that aren't explicitly `.delete()`d).
- **Evidence**: `experiments/replicad-impact-poc/reports/m-coverage-benches.json` — per-combo `wasmDeltaKB` field. See also new OQ-O below.

### Operational questions

#### OQ-L — `using` browser/runtime support matrix

- Browser support: Safari 18+, Chrome 134+, Firefox 134+. iOS 17 (~15 % mobile traffic) lacks native support.
- Vite/esbuild downlevel via polyfill has [known bugs](https://github.com/evanw/esbuild/issues/3939) around exception handling.
- **Decision needed**: Does replicad-the-package retain `localGC` for backwards compat while internally adopting `using`? Or do we ship a polyfill?

#### OQ-M — Telemetry + rollback plan

- Define A/B telemetry (timing histograms keyed by build path) before rollout.
- Feature flag adapter codepaths so we can disable per-method without redeploy.

#### OQ-N — Replicad upstream strategy

- Should we PR the Strategy D / F variants to replicad upstream?
- Or maintain a fork / compat layer in `@taucad/runtime`?
- If we adopt Option D in OCJS, does existing replicad code auto-benefit, or does replicad need rewriting?

#### OQ-O — Worker recycling policy (NEW, surfaced by M-coverage 2026-05-18)

- **What we know (now)**: OCCT-on-wasm retains per-iteration allocations indefinitely under both dlmalloc and mimalloc; the M-coverage bench had to spawn one Node process per model to fit within the 4 GB wasm cap.
- **What we don't know**: (a) the exact threshold at which a long-running web worker session degrades (the M-coverage bench measured 30 iters of M2 = 612 MB, 15 iters of M3 = 396 MB — but interactive editor sessions don't stamp 100 % CPU on a single model, so the curve is different); (b) whether a worker-recycle policy can be implemented transparently inside `@taucad/runtime` (drop the current `OpenCascade` module instance, instantiate a fresh one, transfer in-flight shapes via STEP round-trip) without breaking consumer references to live `TopoDS_Shape` handles; (c) the latency cost of a recycle (instantiation + JIT warmup).
- **Required PoC**: Long-running harness simulating an editor session (1 000 model edits across mixed M1–M7 workloads), measuring wasm heap over time; design `RuntimeOrchestrator.recycle()` API that snapshots-and-restores user shapes via STEP; benchmark recycle latency.
- **Severity**: Block-rollout for editor / long-session consumers; not blocking for one-shot CLI / batch consumers.

## Real-World Model Coverage Plan **— STATUS: M1–M7 IMPLEMENTED AND BENCHED (2026-05-18)**

All seven blueprint models have been ported into `experiments/replicad-impact-poc/replicad-equivalent/examples/` and exercised via `bench/examples/run-m-coverage.mjs` (per-phase) and `run-m-coverage-all.mjs` (full corpus). Results live in `reports/m-coverage-benches.json` and are summarised in `reports/summary.md` § "End-to-end model results — extended blueprint coverage". Each model's verdict is also propagated into the H1–H7 hypothesis table.

| #      | Model                            | Source                                                                               | Exercises                                                                             | Gap closed                                                                              | Status                                                                                                                                                                                                                             |
| ------ | -------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M1** | High-NbPoles interpolation curve | Synthetic — `Geom2dAPI_Interpolate` over 30 / 100 / 300 / 1 000 / 3 000 input points | Pattern 2 at NbPoles ≫ 15                                                             | OQ-A (regression boundary)                                                              | **Done.** OQ-A closed: no regression; split-API-D win evaporates beyond N=30.                                                                                                                                                      |
| **M2** | Watering can                     | `replicad-docs/examples`                                                             | `BRepOffsetAPI_MakePipeShell` (pipe sweep), `BRepOffsetAPI_MakeThickSolid` (shell)    | F1 (ThruSections+Fillet alt), shell-mode workload, pipe-sweep cost                      | **Done** with one deviation: shell is applied to the body before fusing spout/handle (OCCT bug applying `MakeThickSolid` to a fused compound — likely related to OQ-H). Net result is a 3-solid compound with the same cost shape. |
| **M3** | Motor housing                    | `replicad-docs/examples` (synthesised)                                               | Heavy fillet density (10+ fillets), tight chamfer placement                           | Edge-filter chamfer/fillet at scale, build-cost ceiling                                 | **Done.** 125 K-vert / 221 K-tri mesh, 425 face groups — largest of the M-coverage corpus.                                                                                                                                         |
| **M4** | LEGO brick                       | `tau-examples` reference, ported direct OCCT                                         | Many small primitives (8+ studs), heavy boolean tree, repeated cylinder cuts          | Boolean batching, BOP cache effects under repetition                                    | **Done.** Cleanest signal in the entire PoC: −45 % E2E mean win for Strategy F, low variance.                                                                                                                                      |
| **M5** | Threaded screw                   | Synthetic — helical wire + triangular profile + pipe-sweep + boolean cut             | Helical pipe sweep, thread-cut booleans                                               | Pipe-along-helical-path (replicad's true twist primitive)                               | **Done** with one deviation: thread turns reduced from 18 → 8 (`BRepOffsetAPI_MakePipeShell` fails on long helical sweeps for this profile). Workload cost shape preserved.                                                        |
| **M6** | Imported STEP CAD model          | `MAIN ASSEMBLY.step` (AP242, 3.1 MB, 21 sub-solids)                                  | File import path, mixed surface types                                                 | OQ-A (real-world high-NbPoles), import pipeline coverage                                | **Done.** Clean −9 to −15 % win on a 91 K-vert mesh.                                                                                                                                                                               |
| **M7** | Multi-component assembly         | Same STEP file as M6, iterated as 21 sub-solids per pass                             | Concurrent shape ownership, repeated boolean operands, edge-filtering across compound | Compound-shape semantics, dispose-with-aliasing, worker-thread compound transfer (OQ-B) | **Done.** PARITY on median, slight win on mean.                                                                                                                                                                                    |

### Acceptance criteria for each new model

For every M1–M7 port:

- [x] Faithful inline reproduction in `replicad-impact-poc/replicad-equivalent/examples/` (no `replicad` dep).
- [x] Uses ES2026 `using` discipline throughout.
- [x] Documents any deviation from the source in the file header.
- [x] Passes smoke test (`bench/smoke-complex.mjs`).
- [x] Included in `bench/examples/run-m-coverage.mjs` matrix (per-phase) and `run-m-coverage-all.mjs` driver.
- [ ] Mesh hash captured and compared to `replicad`-the-package output (closes OQ-E). _Outstanding — see OQ-E above; reduced to a single ~2-hour task on one model._

### Estimated effort

| Model                         | Build complexity                                              | Effort estimate |
| ----------------------------- | ------------------------------------------------------------- | --------------: |
| M1 — High-NbPoles             | Low (synthetic)                                               |         0.5 day |
| M2 — Watering can             | High (needs new bindings: `MakePipeShell`, `MakeThickSolid`)  |          3 days |
| M3 — Motor housing            | Medium                                                        |        1.5 days |
| M4 — LEGO                     | Low (just many primitives)                                    |           1 day |
| M5 — Threaded screw           | High (helical sweep)                                          |        2.5 days |
| M6 — Imported STEP            | Medium (needs `STEPControl_Reader` binding + a test CAD file) |          2 days |
| M7 — Multi-component assembly | Medium                                                        |        1.5 days |
| **Total**                     | —                                                             |    **~12 days** |

This is the Phase 2 of the implementation roadmap.

## Shortcomings of Removing NCollection from the Public API

Option D's headline benefits (idiomatic JS surface, `unknown` cascade dissolved, bundle savings) carry real costs that should be acknowledged before rollout.

### S1 — Loss of type fidelity for OCCT-savvy consumers

A consumer who today writes:

```typescript
const indexedMap: NCollection_IndexedMap_TopoDS_Shape = ...;
for (let i = 1; i <= indexedMap.Extent(); i++) {
  const shape = indexedMap.FindKey(i);
  // ... process shape ...
}
```

…can no longer express this directly under Option D. They get a `TopoDS_Shape[]` instead, which:

- Loses the 1-based indexing semantics that OCCT users expect.
- Loses the `IndexedMap`'s O(1) `Contains(k)` membership test.
- Loses the in-place mutation API.

**Mitigation**: Layer 3 `NCollectionLiveHandle` for opt-in. But this is a separate API; consumers must know to ask for it.

### S2 — Adapter authoring burden scales with API surface exposed

Every OCCT method that today flows an NCollection through its signature requires a hand-written adapter under Option D. PoC 3 wrote 10 adapters for replicad's 4 hot paths; the Phase 1 estimate calls for ~150 across the whole top-of-funnel surface.

If OCCT updates change a method signature, the adapter must be updated in lockstep. With per-permutation `class_<>` bindings, the bindgen handles this automatically.

**Mitigation**: OQ-F (auto-generation feasibility). Until proven, the maintenance cost is real.

### S3 — Debugging the JS↔WASM boundary is harder when opaque

Status-quo `class_<NCollection_Array1_gp_Pnt>` is debuggable from the JS console: `.Value(i)`, `.Length()`, etc. all work interactively. An adapter that returns `Float32Array.subarray(...)` shows up as a typed-array view with no provenance back to the OCCT source.

When a mesh is wrong, today the debugger can step into the per-element loop. Under Option D, the loop is in C++; the only JS-visible artefact is the final TypedArray.

**Mitigation**: Layer 1 `MeshData` could carry source provenance (face count, tolerance used) as readable properties. Doesn't help when debugging _which_ triangle is wrong, but at least the broad pipeline is observable.

### S4 — Pure JS-side iteration becomes impossible

Status quo: a consumer can compose OCCT primitives entirely in JS, mutating intermediate NCollection containers between calls. Option D: any operation that today requires JS-side iteration over an NCollection must either (a) be expressible as a one-shot adapter, or (b) fall back to Layer 3.

A concrete example: a consumer who reads a `Geom_BSplineSurface`'s poles, modifies one row based on per-row analysis (e.g. smoothing), and writes back. Under Option D this requires either a custom adapter for _that specific smoothing operation_, or a Layer 3 round-trip.

**Mitigation**: For known patterns, ship purpose-built adapters (`smoothSurfaceRow`, `decimatePoles`, etc.). For arbitrary patterns, Layer 3.

### S5 — Adapter API ceiling for unforeseen use cases

The Layer 1/2 API surface is finite — defined at bindgen time. New use cases that require novel OCCT method signatures need new adapters, which means a binding rebuild + redistribute. Status-quo NCollection bindings are open-ended: any OCCT method already in the binding works regardless of who calls it.

**Mitigation**: Layer 3 as the universal escape hatch.

### S6 — Backward compatibility break for existing OCJS consumers

Consumers who today reach for `NCollection_Sequence_TopoDS_Shape` (or any of the 613 permutations) get a compile-time TS error after Option D ships.

**Mitigation**: The `register_type<>` mechanism allows us to keep emitting the _name_ `NCollection_Sequence<TopoDS_Shape>` as the TypeScript surface even when the runtime returns a JS Array — a "name-compat" mode. Doesn't preserve the runtime API but does keep grep results sane.

### S7 — Coverage gap: API surfaces we haven't measured

Option D's adapters are good for what they cover. They are _unevaluated_ for surfaces we haven't built adapters for: imports/exports (`STEPControl_*`, `IGESControl_*`), assemblies (`XCAFDoc_*`), measurement (`GProp_*`), filleting algorithms (`BRepFilletAPI_*`), surface analysis (`BRepGProp_*`).

Until each surface gets at least one fixture (Phase 2 / Section 8), we cannot make Option D claims about it.

**Mitigation**: Phased rollout — Layer 1/2 covers known hot paths; other surfaces continue using Layer 3 until measured.

### Net assessment

S1, S2, S6 are **real and unavoidable** under Option D. S3, S4 are **mitigable but require investment**. S5, S7 are **operational** and addressed by the long-tail `NCollectionLiveHandle` plus phased coverage expansion.

The decision is not "Option D vs status quo" — it's "accept S1+S2+S6 to get the 35 % `.d.ts` reduction, the `unknown` cascade dissolution, and the 6–25 % E2E perf win". The PoCs say yes; this document says the tradeoff is explicit.

## References

- **PoC 3 — Replicad Impact**: [`repos/opencascade.js/experiments/replicad-impact-poc/`](../../repos/opencascade.js/experiments/replicad-impact-poc/) — replicad-style hot paths + 5 model fixtures, summary at [`reports/summary.md`](../../repos/opencascade.js/experiments/replicad-impact-poc/reports/summary.md)
- **PoC 2 — Comprehensive validation**: [`repos/opencascade.js/experiments/option-d-comprehensive-poc/`](../../repos/opencascade.js/experiments/option-d-comprehensive-poc/) — all 10 NCollection shapes × 4 strategies
- **PoC 1 — Architecture validation**: [`repos/opencascade.js/experiments/option-d-boundary-narrowing/`](../../repos/opencascade.js/experiments/option-d-boundary-narrowing/) — single-shape × 4 strategies
- **Originating research**: [`docs/research/ncollection-binding-architecture.md`](./ncollection-binding-architecture.md)
- **Related performance work**: [`docs/research/replicad-performance-blueprint.md`](./replicad-performance-blueprint.md)
- **Prerequisite fix (closed)**: [`docs/research/ocjs-additionalcppcode-type-erasure-regression.md`](./ocjs-additionalcppcode-type-erasure-regression.md)
- **Original unknown audits**: [`docs/research/ocjs-bindgen-unknown-coverage-audit.md`](./ocjs-bindgen-unknown-coverage-audit.md), [`docs/research/ocjs-bindgen-unknown-coverage-audit-v2.md`](./ocjs-bindgen-unknown-coverage-audit-v2.md)
- **Embind PR #25272** (`register_type<T>`): <https://github.com/emscripten-core/emscripten/pull/25272>
- **Embind PR #14090** (closed vector wrapper): <https://github.com/emscripten-core/emscripten/pull/14090>
- **WebAssembly Component Model #543** (parametric polymorphism): <https://github.com/WebAssembly/component-model/issues/543>

## Appendix A — Consolidated Bench Data

All numbers in milliseconds unless noted. From `replicad-impact-poc/reports/{micro,example,complex}-benches.json`, runs from 2026-05-16 / 2026-05-17 on Apple M-series, Node 24.10.0.

### Pattern 1 — B-spline approximation

| n points | A (status quo) | D (Strategy D) |      Δ |
| -------: | -------------: | -------------: | -----: |
|       16 |          0.813 |          0.746 | −8.3 % |
|       64 |          2.626 |          2.558 | −2.6 % |
|      256 |         12.874 |         12.611 | −2.0 % |
|     1024 |        112.519 |        109.833 | −2.4 % |

### Pattern 2 — BSpline pass-through (NbPoles=15)

| input n |     A | naive D | split-API D |
| ------: | ----: | ------: | ----------: |
|      32 | 0.013 |   0.010 |       0.003 |
|     128 | 0.011 |   0.008 |       0.003 |
|     512 | 0.009 |   0.007 |       0.003 |
|    2048 | 0.010 |   0.008 |       0.003 |

### Pattern 3 — Triangulation extraction

| Shape         | verts/tris |  naive | Strategy F |
| ------------- | ---------- | -----: | ---------: |
| box-coarse    | 24/12      |  0.541 |      0.357 |
| sphere-coarse | 4066/8002  | 45.281 |     33.080 |
| sphere-fine   | 5153/10176 | 58.588 |     43.095 |

### Pattern 4 — Ellipsoid Poles round-trip

| Size                 |     A |     D |
| -------------------- | ----: | ----: |
| 10×20×30 (~30 poles) | 0.474 | 0.373 |
| 100×200×50           | 0.383 | 0.355 |
| 1000×200×50          | 0.379 | 0.338 |

### Simple-model E2E (50 iterations, full A/D/F/D+F matrix)

| Model      | A median | D median | F median | D+F median |
| ---------- | -------: | -------: | -------: | ---------: |
| simpleVase |     48.0 |     47.9 |     41.6 |       41.6 |
| birdhouse  |     31.7 |     31.5 |     23.6 |       23.4 |

### Complex-model E2E (15–30 iterations, A vs F only)

| Model        | A median |  A p95 | F median |  F p95 |   A→F Δ |
| ------------ | -------: | -----: | -------: | -----: | ------: |
| rao-nozzle   |    144.1 |  150.3 |    110.5 |  113.0 | −23.3 % |
| wavy-vase    |    436.5 |  506.5 |    407.9 |  421.0 |  −6.6 % |
| helical-gear |   5790.8 | 7211.8 |   5431.9 | 5469.8 |  −6.2 % |
