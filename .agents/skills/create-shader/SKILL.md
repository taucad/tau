---
name: create-shader
description: Create or modify Tau Three.js shaders with portable TSL/WebGL implementations, executable inventory evidence, real backend validation, deterministic pixels, lifecycle checks, and measured performance. Use for ShaderMaterial, NodeMaterial, shader hooks, render passes, post-processing, or GPU-visible rendering changes.
---

# Create Shader

Create or change a Tau shader without leaving backend, scale, depth, lifecycle, or performance behavior implicit.

## Read First

Read these sources completely before editing:

1. `docs/policy/graphics-backend-policy.md`
2. `docs/policy/webgpu-shader-and-pipeline-policy.md`
3. `apps/ui/app/components/geometry/shader-policy.ts`
4. The shader factory, all owners/callers, its applicable backend implementations, and its current tests.

For spatial math, also read `docs/policy/spatial-policy.md`. For a Three.js implementation detail, first resolve the installed source, lockfile version and local patches. Use `repos` to inspect a version-matched checkout for history and tests; a newer checkout or online manual is an explicitly separate upgrade candidate. Guard copied/forked source with the installed revision and exact source fingerprint.

## Workflow

### 1. Classify the site

Identify:

- Renderer family and initialized backend separately: classic WebGL, node WebGPU, or node WebGL2. Record actual backend initialization, not API availability or class name.
- Classic `ShaderMaterial`, TSL `NodeMaterial`, material hook, render pass, or pipeline owner.
- Coordinate space and unit at every boundary: canonical metres, render units, view, clip, depth, CSS pixels, or device pixels.
- Geometry signatures and required attributes.
- Depth convention: standard, logarithmic, reversed-Z, or inherited renderer dispatch.
- Blend/color-space contract.
- Lifecycle owner, cache key, warmup path, and disposal path.
- Hot-path cost: vertex, fragment, fullscreen pass, scene replay, allocation, or pipeline compilation.

Search all callers before changing a shared shader or helper. Fix the common boundary, not a single symptom.

### 2. Choose the implementation path

Use shared TSL/`NodeMaterial` definitions for the node backends. Preserve the supported classic WebGL behavior, but do not duplicate a node-only optimization in classic merely to satisfy a two-backend template. Share CPU semantics and constants where useful; keep necessary execution-backend differences explicit and small.

Use raw WGSL only when profiling identifies a material bottleneck that TSL cannot express or optimize adequately. Record the measured delta, portability boundary, and fallback. Never add handwritten GLSL-only behavior without its WebGPU analogue.

Trace pass inputs/outputs, format, color/depth convention, samples, resolution, load/clear/store/resolve and lifetime before changing composition. Prefer compatible retained outputs over scene replay. Before replacing fixed-function depth with sampled depth, prove sample coverage, interpolation, quantization, UV orientation, comparisons/bias and later cap writes. Do not infer equivalence from matching dimensions.

Try applicable documented attachment configuration, lifetime and format changes before custom shader logic. Verify availability in the installed version. Discarding contents can reduce bandwidth without reducing allocated storage; fewer passes or bytes do not alone prove a faster frame.

### 3. Write the failing evidence first

For a regression, add the smallest red test that reproduces the actual failure before changing production code. For new behavior, establish the oracle before the implementation. For optimization, state one falsifiable hypothesis and separate functional correctness, appearance and benefit under pipeline policy rules 14–15. Run an unchanged A/A baseline to estimate noise. Do not require a universal percentage saving or an FPS gain for a memory improvement. Allocation assertions prove a storage constraint, not visual correctness.

Use exact pixels where arithmetic should be preserved. When changing rasterization/filtering, predeclare boundary, continuity, contrast and motion metrics with defective negative controls; a maximum channel delta alone cannot classify appearance. Keep depth precision and CAD occlusion strict. Record a justified gate revision before new trials, retain old failures and classify inconclusive results separately from defects. Do not change thresholds simply to admit a candidate.

Select every layer required by the declared risks:

| Risk                                             | Required evidence                                                                                                                            |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Units, spaces, tolerances, interpolation, sizing | CPU semantic oracle with magnitude/projection edge cases                                                                                     |
| TSL graph structure                              | Focused graph assertion or `serialiseStrippedTslGraph` snapshot when graph structure is itself the risk                                      |
| Three.js code-generation seam                    | Generated-source inspection through `renderer.debug.getShaderAsync`; exact revision/source fingerprint for upstream forks                    |
| GLSL validity                                    | Real WebGL2 compile and link; validate negative controls when the harness or compiler dependency changes                                     |
| WGSL validity                                    | Real WebGPU compilation plus uncaptured-error/device-loss checks; validate negative controls when the harness or compiler dependency changes |
| Visible rendering, depth, clipping, blend, scale | Deterministic applicable classic/node pixel and interaction fixtures; isolated material and production composition                           |
| Cache/lifecycle                                  | Reuse, ref-count/eviction, warmup, backend switch, and dispose tests                                                                         |
| Ubiquitous or pass-count-sensitive code          | Whole-frame timing; timestamp-query GPU timing when available; structural draw/pass counts otherwise                                         |

A graph snapshot never proves compilation or pixels. A mocked renderer never proves backend validation. A screenshot alone never proves units or lifecycle. Validate reference-material configuration against the installed constructor/setter API; a silently ignored option invalidates the oracle. Exercise persistent resources through motion, resize and state changes, not only a newly allocated static frame.

### 4. Register the executable contract

Update `apps/ui/app/components/geometry/shader-policy.ts` in the same change:

- one stable site id;
- every implementation module;
- backend coverage;
- declared risks;
- named evidence for each risk.

The inventory AST test must discover the site exactly once. Do not suppress an unregistered shader; either register it or delete the dead shader.

### 5. Implement for stable runtime ownership

- Allocate materials, meshes, passes, and pipelines once per owner/renderer configuration.
- Mutate uniforms/properties for ordinary state changes; do not rebuild pipelines per frame or interaction.
- Prepare only the active context by default. Optional warmup needs a measured frequent first-use stall, bounded resources and safe cancellation; follow pipeline policy rule 13. Measure cold first use separately.
- Dispose every owned GPU resource; never dispose caller-owned/shared resources.
- Hoist repeated uniform-only calculations when source inspection or measurement warrants it; preserve interpolation semantics.
- Preserve exact geometric depth for hidden-line correctness; apply bounded coplanar separation on the owning surface.
- For CSS-pixel effects, account for viewport height, projection type, and device-pixel ratio explicitly.
- For transparent double-sided materials, use one pass only when both sides are intentionally equivalent.

### 6. Verify

Resolve affected project owners and declared targets with `pnpm nx show project <owner>`. Run focused tests first, then relevant lint, typecheck, build and public-surface gates through Nx. Viewer shaders belong to `viewer`; the app's shader inventory and calibration harness belong to `ui`. Use the actual browser configuration/target that owns the changed behavior, not a hardcoded unrelated suite. Run `pnpm docs:validate` for policy/evidence and `pnpm nx run scripts:validate-agent-config` for workflow changes.

If the worktree has unrelated failures, preserve them and report the exact failing targets separately. Do not claim backend parity from a skipped WebGPU test; record the adapter/capability and reason. Do not fabricate unavailable timestamp-query metrics.

### 7. Close out performance-sensitive work

Record build and patched dependency identity, scene/poses, CSS size/DPR/drawing buffer, effective backend/adapter and browser. Wait for fixture loading and automatic camera fitting to finish, then verify the requested projection and actual buffer before measurement. Compare recorded camera/transform schedules before admitting paired results. Alternate independent A/B runs and retain every admitted run. Report medians, tails, variability, frame/query sample counts and uncertainty across runs; a large frame count is not a large number of independent experiments. Define GPU query scope/precision and rejected/disjoint samples, do not sum overlapping intervals, and confirm throughput with instrumentation off. Separate cold startup/first use from warmed rendering. At refresh limits report frame-time headroom, not invented presented FPS. Separate allocation descriptors, Three counters and driver/process observations; record lifetime, not just a peak. Include structural pass/draw counts. Reject a renderer-convergence or raw-WGSL migration unless it passes the predeclared correctness and performance gates.

## Definition of Done

- The smoking-gun failure is covered red-first when this is a bug fix.
- Applicable classic/node configurations preserve their declared semantics; shared node definitions differ only at justified backend seams.
- The executable inventory is complete and every risk maps to named evidence.
- Real backend validation passes; harness negative controls remain qualified for the tested dependency.
- Visible scale/depth/clipping/color behavior has deterministic coverage.
- Warmup, reuse, switching, and disposal are tested.
- Hot-path changes have reproducible performance evidence.
- Policies and research close-out are updated when architecture or measured results change.
