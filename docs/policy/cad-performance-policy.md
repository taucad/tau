---
title: 'CAD Performance Policy'
description: 'Rules for efficient CAD geometry processing with bounded algorithms, native OCCT/WASM wrappers, workers, memory ownership, and repeatable performance tests.'
status: active
created: '2026-06-02'
updated: '2026-11-06'
related:
  - docs/policy/library-api-policy.md
  - docs/policy/testing-policy.md
  - docs/policy/geospec-policy.md
  - docs/policy/resource-cleanup-policy.md
  - docs/policy/runtime-telemetry-policy.md
  - docs/research/geospec-standalone-cad-testing-blueprint.md
  - docs/research/wasm-kernel-call-batching-policy-blueprint.md
  - docs/research/embind-return-strategy-benchmarks.md
  - docs/research/build123d-vs-ocjs-wasm-performance.md
---

# CAD Performance Policy

Internal reference for evaluating, testing, importing, exporting, and processing CAD geometry efficiently across Tau runtime, GeoSpec, and OpenCascade WASM integrations.

## Rationale

CAD workloads frequently cross the JavaScript/WASM boundary and may touch millions of vertices, triangles, faces, or STEP entities. The wrong architecture turns one geometric assertion into thousands of embind calls, blocks the browser UI, or creates unbounded O(n²) loops over triangle soups. This policy codifies the durable approach: bounded algorithms, batched native work, explicit memory ownership, and tests that prove both correctness and performance shape.

## Rules

### 1. Bound Triangle-Heavy Algorithms

Every algorithm that loops over mesh triangles, samples, BRep faces, STEP entities, or pairwise geometric candidates must expose and enforce an explicit budget.

**Why**: Geometry tests must fail with diagnostics before they become a browser hang, API timeout, or worker OOM.

CORRECT:

```typescript
const result = analyzeChamferDistance({
  actual,
  expected,
  samples: 100_000,
  maxNaiveTrianglePairs: 20_000_000,
  nativeAnalyzer,
});

if (!result.success) {
  return result.diagnostics;
}
```

INCORRECT:

```typescript
for (const sample of samples) {
  for (const triangle of allTriangles) {
    // Unbounded O(samples * triangles).
  }
}
```

### 2. Prefer Exact BRep APIs Before Mesh Approximations

Use OCCT/BRep APIs for exact mass properties, topology, face classification, wall thickness, hole recognition, STEP/XDE metadata, and validity checks. Use mesh algorithms for visualization-derived evidence, approximation, and spatial diagnostics.

**Why**: Meshes are tessellated approximations; exact CAD tests should use exact CAD evidence when it exists.

| Measurement                  | Preferred API                  | Acceptable Fallback                |
| ---------------------------- | ------------------------------ | ---------------------------------- |
| Surface area                 | `BRepGProp::SurfaceProperties` | Summed triangle area               |
| Volume                       | `BRepGProp::VolumeProperties`  | Signed triangle volume when closed |
| Center of mass               | `GProp_GProps::CentreOfMass`   | Triangle tetrahedron integration   |
| Bounding box                 | `BRepBndLib::Add` / `AddOBB`   | Mesh AABB                          |
| Watertightness               | BRep validity/topology checks  | Welded mesh edge incidence         |
| Chamfer / hole / planar face | BRep topology and adaptors     | Unsupported diagnostic             |

AABBs and spatial acceleration structures are broad-phase tools for relationship-style decisions. Use them to prune candidate sets, assert explicit envelopes, and enrich diagnostics. Final production pass/fail decisions for contact, clearance, containment, mating, interference, shaft/bore fits, fastener engagement, ports, and manufacturability must use exact BRep APIs or appropriately precise narrow-phase mesh/surface analysis. If no narrow-phase evidence exists inside the algorithm budget, return unsupported or budget diagnostics rather than passing from AABB evidence.

### 3. Batch Across the JS/WASM Boundary

This rule covers every kernel and transcoder that drives a WebAssembly or native library: OCCT builds, smlibwasm, manifold-3d, OpenRSCAD, the Zoo engine, PicoVoxel, occt-import-js, assimp, draco, resvg and native Python bindings. Render, edge, topology and export paths call the library once per operation per shape, never once per triangle, node, sample, edge or face. Pass flat buffers or packed result structs, not per-element JS objects.

**Why**: A per-element loop costs the wrappers and repeated work that come with each call, not the ~0.3–0.9 µs boundary crossing, so batch the work that scales with the mesh and leave cheap calls alone.

| Measurement                                 | Per call                                | Source                                  |
| ------------------------------------------- | --------------------------------------- | --------------------------------------- |
| embind return by value                      | ~0.9 µs (10,000 calls ≈ 9 ms)           | `embind-return-strategy-benchmarks.md`  |
| embind binding overhead                     | ~0.3–0.7 µs                             | `build123d-vs-ocjs-wasm-performance.md` |
| smlibwasm `Face.distanceTo`                 | ~0.4 ms (4,682 calls = 1.87 s)          | taucad/tau#1453, 306-face plate         |
| OpenCascade edge polygon read, ~7 crossings | ~4–8 µs per node (45–230 ms, 312 edges) | batching blueprint, libcascade 3.1.0    |

Replacing smlib's per-probe `Face.distanceTo` loop with one `faceMeshes()` call cut the planetary fixture's render from 6,648 ms to 3,578 ms (−46%, taucad/tau#1453).

Fix a per-element loop in this order:

| Order | Fix                                                                                                              | Example                                                                                       |
| ----- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1     | The library's bulk API                                                                                           | smlib `faceMeshes()`; Replicad's mesh extractors; one manifold-3d `getMesh()` per manifold    |
| 2     | A native binding (`additionalCppFiles`, Rules 4–5) in a build Tau ships, or an upstream request                  | `TauOffline::edges` in Zoo's libcascade build                                                 |
| 3     | A known exception: keep the loop, pin its count in the call-count test, and record its finding and measured cost | OpenCascade edge polygons, read per node until a libcascade build with a batched reader ships |

**Exempt**: per-command and bounded-_n_ paths. A loop over fewer than ~100 elements per render is fine, as is one call per part, per user command or per document, or a call that already does substantial work (the reference slicer's one manifold-3d `slice` per layer). The rule targets work that scales with mesh size, curve resolution or feature count.

**Call-count test**: every wasm kernel has a `src/<kernel>.call-count.test.ts` that covers render with edges and at least one export. It spies on the library's public methods that Tau calls, drives the kernel through `createTestRuntimeClient`, and asserts O(shapes): the count stays the same when the fixture's element count grows. A known exception is pinned at its exact count and names its finding; a change that lowers a count updates the number. Use a raw or internal library surface, such as `@classcad/smlibwasm/kernel` `ext.*` and `k.*`, only behind a contract test that fails when the call disappears or changes shape.

**Tracing**: expose the library calls to a summary tracer, `ocTracing` for OCCT kernels or a `libraryTracing` option built on `createKernelLibraryTracer`, and flush it after render and export as well as after evaluation (`docs/policy/runtime-telemetry-policy.md`).

**Handles**: a batched form frees its wrappers, and a remaining loop `delete()`s every embind handle it creates (Rule 8).

CORRECT:

```typescript
// smlib render: one tessellation per body, with face ownership.
const faceMeshes = library.faceMeshes(shape, linearTolerance, angularTolerance);
```

CORRECT, when the library has no bulk API:

```yaml
additionalCppFiles:
  - wrappers/geospec-mesh-metrics.cpp

mainBuild:
  additionalBindCode: |
    EMSCRIPTEN_BINDINGS(geospec_mesh_metrics) {
      emscripten::class_<GeoSpecMeshMetrics>("GeoSpecMeshMetrics")
        .class_function("chamferDistanceFromTrianglePointers",
          &GeoSpecMeshMetrics::chamferDistanceFromTrianglePointers);
    }
```

INCORRECT:

```typescript
for (const triangle of triangles) {
  oc.closestPointOnTriangle(point, triangle.a, triangle.b, triangle.c);
}
```

### 4. Use `additionalCppFiles` For Production Wrappers

Use `additionalCppFiles` for native code that exceeds a small inline snippet; reserve `additionalCppCode` for typedefs or short helpers, and keep `mainBuild.additionalBindCode` focused on embind registration.

**Why**: Reviewable `.cpp` files get syntax highlighting, can be tested by the Docker build, and keep YAML diffs readable.

### 5. Keep Native Wrappers Narrow

Native wrappers should expose semantic operations, not raw OCCT internals. Return typed metric structs and diagnostic fields, not arbitrary handles.

**Why**: Public JavaScript APIs should express testing intent while native code owns performance-sensitive implementation details.

CORRECT:

```typescript
const analyzer = createOpenCascadeMeshAnalyzer(oc);
const distance = analyzer.analyzeChamferDistance({
  actualTriangles,
  expectedTriangles,
  actualTriangleCount,
  expectedTriangleCount,
  samples,
});
```

INCORRECT:

```typescript
const tri = oc.Poly_Triangulation(...);
const face = oc.TopoDS_Cast.toFace(shape);
// Consumer manually walks OCCT faces and triangles.
```

### 6. Use Transferable Buffers In Browser Workers

Run CPU-heavy CAD operations in a worker and transfer `ArrayBuffer`s rather than structured-cloning large geometry payloads.

**Why**: Large GLB, STEP, and triangle buffers must stay local to the browser runtime without freezing the editor or copying megabytes between contexts.

CORRECT:

```typescript
worker.postMessage({ kind: 'mesh', positions, indices }, [positions.buffer, indices.buffer]);
```

INCORRECT:

```typescript
await api.testModel({ glbBytes: Array.from(largeGlb) });
```

### 7. Reuse Meshes And Intermediate Evidence

Cache mesh extraction, parsed glTF documents, BRep mass properties, and loaded STEP evidence by stable source hash, runtime parameters, tessellation tolerance, and unit.

**Why**: Meshing and STEP import are among the most expensive operations; tests often run several assertions against the same model.

### 8. Make Memory Ownership Explicit

Every WASM heap allocation must have one owner and one cleanup path. Use RAII in C++, `dispose()`/`delete()` where wrappers expose handles, and `try/finally` around JS `_malloc` allocations.

**Why**: JavaScript garbage collection does not reclaim OpenCascade or Emscripten heap allocations.

CORRECT:

```typescript
const ptr = module._malloc(bytes);
try {
  module.HEAPF64.set(values, ptr / Float64Array.BYTES_PER_ELEMENT);
  return module.GeoSpecMeshMetrics.qualityFromTrianglePointers(ptr, count);
} finally {
  module._free(ptr);
}
```

INCORRECT:

```typescript
const ptr = module._malloc(bytes);
module.HEAPF64.set(values, ptr / 8);
return module.GeoSpecMeshMetrics.qualityFromTrianglePointers(ptr, count);
```

### 9. Prefer Spatial Acceleration Over Brute Force

For distance, intersection, nearest-neighbor, containment, and collision-style checks, use a BVH, grid, R-tree, or OCCT extrema API before considering all candidate pairs.

**Why**: Pairwise checks scale poorly and make testing large assemblies impractical.

Spatial acceleration narrows the candidate set; it does not decide production relationship truth by itself. After broad-phase pruning, relationship assertions still require exact BRep evidence or appropriately precise narrow-phase mesh/surface evidence.

### 10. Keep Performance Options Flat And Typed

Follow `docs/policy/library-api-policy.md`: use one flat options object with defaults for budgets, tolerances, sampling, and native analyzers. Do not add overload-heavy or runner-specific APIs.

**Why**: Performance controls must be discoverable and usable from Node, browser, and agent-authored GeoSpec tests.

CORRECT:

```typescript
analyzeChamferDistance({
  actual,
  expected,
  samples: 50_000,
  nativeAnalyzer,
  maxNaiveTrianglePairs: 20_000_000,
});
```

INCORRECT:

```typescript
analyzeChamferDistance(actual, expected, 50_000, true, 20_000_000, undefined);
```

### 11. Validate With Correctness And Scale Tests

Performance-sensitive geometry code must have tests for positive cases, negative cases, boundary budgets, malformed geometry, and deterministic repeated runs.

**Why**: A fast geometry tester that gives false confidence is worse than no tester.

### 12. Gate Optional Native Builds Separately

Default unit tests must run without Docker or a native WASM build. Docker-built OpenCascade integration tests should be explicit, cached, and documented with the exact image/config used.

**Why**: Native builds are slow and environment-sensitive; correctness tests should remain fast while build validation remains reproducible.

## Decision Tables

### Where Code Should Run

| Workload                           | Default Location       | Required Pattern                           |
| ---------------------------------- | ---------------------- | ------------------------------------------ |
| Small mesh scalar checks           | JS or native           | Bound linear pass                          |
| Sampled distance / nearest surface | Native WASM            | BVH/grid or explicit pair budget           |
| BRep mass properties               | Native OCCT            | Single batched wrapper call                |
| STEP import / AP242 checks         | Worker or Node process | Streaming/read-local, no API byte RPC      |
| Browser model testing              | Browser VM worker      | Transfer compact results only              |
| API integration test harness       | In-process RPC shim    | Invoke same browser-facing GeoSpec surface |

### Wrapper Mechanism

| Need                         | Mechanism                                    |
| ---------------------------- | -------------------------------------------- |
| Short typedef or helper      | `additionalCppCode`                          |
| Production wrapper algorithm | `additionalCppFiles`                         |
| Embind registration          | `mainBuild.additionalBindCode`               |
| Existing OCCT class exposure | `mainBuild.bindings`                         |
| Multiple build variants      | `extraBuilds` with identical custom bindings |

## Anti-Patterns

- Do not send large GLB, STEP, or triangle arrays to the API for tests that can run in the browser.
- Do not implement `samples × triangles` algorithms without a native acceleration path or hard budget.
- Do not rely on glTF `extras` or kernel-specific metadata for mesh-derived tests.
- Do not expose raw OpenCascade handles from standalone testing APIs unless the API is explicitly an escape hatch.
- Do not allocate WASM heap memory without a matching cleanup path.
- Do not introduce a custom geometry result contract when files/bytes are sufficient evidence.

## Summary Checklist

- [ ] Triangle-heavy code has explicit sample, triangle, pair, time, or memory budgets.
- [ ] Render, edge, topology and export paths call a wasm or native library once per operation per shape; the only per-element loops are under ~100 elements per render, per command, or pinned known exceptions.
- [ ] Each wasm kernel has a `<kernel>.call-count.test.ts` for render with edges and one export that asserts O(shapes), and raw library calls sit behind a contract test.
- [ ] The kernel's library calls appear in a tracer summary (`ocTracing` or `createKernelLibraryTracer`) after render and export.
- [ ] Batched forms free their wrappers, and every embind handle a loop creates is `delete()`d.
- [ ] BRep-capable checks prefer exact OCCT APIs and clearly label mesh fallback diagnostics.
- [ ] AABB and spatial acceleration are used only as broad-phase for relationship checks; final pass/fail uses exact or narrow-phase evidence.
- [ ] Browser execution runs in workers or VM contexts and transfers buffers.
- [ ] Native allocations are cleaned up under `try/finally` or RAII.
- [ ] Tests include correctness, failure diagnostics, budget behavior, and deterministic repeat runs.
- [ ] Docker/OpenCascade build configs document the image, threading mode, flags, and custom C++ files.

## References

- `docs/policy/library-api-policy.md`
- `docs/policy/testing-policy.md`
- `docs/policy/resource-cleanup-policy.md`
- `repos/opencascade.js/docs/guides/extend-with-cpp.md`
- `repos/opencascade.js/docs/reference/yaml-schema.md`
- `repos/brepjs/apps/docs/advanced/performance.md`
- `repos/brepjs/apps/docs/advanced/memory.md`
- `repos/brepjs/apps/docs/advanced/workers.md`
- `repos/replicad/packages/replicad-opencascadejs/build-config/wrappers/mesh-extractor.cpp`
