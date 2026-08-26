# GeoSpec Future Native/WASM Improvements

This package TODO mirrors the future-improvement appendix in
`docs/research/geospec-high-performance-validation-blueprint.md`. It is
intentionally duplicated here so engineers working inside `packages/geospec`
can see the next native performance targets without reopening the research doc.

## Priority Order

1. Add native BVH relation, native BVH distance batching, native containment
   probes, and a Manifold exact-volume wrapper with one prepared mesh handle.
2. Move topology summary work into native/WASM: spatial welding, edge incidence,
   `manifoldForSolidAnalysis`, and per-component invalid edge counts.
3. Move component partition and connected-component clustering into native/WASM
   once many-part unnamed GLBs become a measured bottleneck.
4. Add persistent backend contexts with reusable WASM heap buffers and
   per-record native handles for multi-assertion GeoSpec invocations.
5. Move scalar mesh metrics and mesh-quality diagnostics into native/WASM for
   very large fixtures.
6. Add native diagnostic compaction for top-K witness edges, boundary-loop
   centroids, worst distance witnesses, and overlap candidate counters.
7. Evaluate SIMD/threaded native builds after the single-threaded native path is
   correct and benchmarked.

## Candidate Modules

- `geospec_mesh_record_metrics.cpp`
- `geospec_mesh_topology.cpp`
- `geospec_component_partition.cpp`
- `geospec_mesh_bvh.cpp`
- `geospec_mesh_predicates.cpp`
- `geospec_mesh_containment.cpp`
- `geospec_manifold_volume.cpp`
- `geospec_diagnostics.cpp`

## Rules

- Keep JavaScript as orchestration and diagnostics; keep triangle-heavy math in
  native/WASM.
- Keep experiments under `packages/geospec/experiments/`.
- Do not add production JavaScript fallbacks for matchers moved to native/WASM.
- Preserve exact STEP/BRep feature matchers on the BRep evidence path.
