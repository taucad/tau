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
3. `apps/ui/app/components/geometry/graphics/three/shader-policy.ts`
4. The shader factory, all owners/callers, its paired backend implementation, and its current tests.

For spatial math, also read `docs/policy/spatial-policy.md`. For an upstream Three.js implementation detail, use the tracked `repos/three.js` checkout and guard any copied/forked source against the installed `THREE.REVISION` and the exact upstream source fingerprint.

## Workflow

### 1. Classify the site

Identify:

- WebGL, WebGPU, or dual backend.
- Classic `ShaderMaterial`, TSL `NodeMaterial`, material hook, render pass, or pipeline owner.
- Coordinate space and unit at every boundary: canonical metres, render units, view, clip, depth, CSS pixels, or device pixels.
- Geometry signatures and required attributes.
- Depth convention: standard, logarithmic, reversed-Z, or inherited renderer dispatch.
- Blend/color-space contract.
- Lifecycle owner, cache key, warmup path, and disposal path.
- Hot-path cost: vertex, fragment, fullscreen pass, scene replay, allocation, or pipeline compilation.

Search all callers before changing a shared shader or helper. Fix the common boundary, not a single symptom.

### 2. Choose the implementation path

Use TSL/`NodeMaterial` for WebGPU-visible custom logic. Keep a paired classic WebGL implementation while WebGL remains the public renderer. Share CPU semantics and constants where doing so prevents drift; do not invent a shader abstraction merely to hide syntax differences.

Use raw WGSL only when profiling identifies a material bottleneck that TSL cannot express or optimize adequately. Record the measured delta, portability boundary, and fallback. Never add handwritten GLSL-only behavior without its WebGPU analogue.

Prefer existing pass outputs over extra scene renders. In particular, bridge retained depth/normal textures directly; never traverse, clone/swap, and replay the main scene for data a post pass already produced.

### 3. Write the failing evidence first

For a regression, add the smallest red test that reproduces the actual failure before changing production code. For new behavior, establish the oracle before the implementation.

Select every layer required by the declared risks:

| Risk                                             | Required evidence                                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Units, spaces, tolerances, interpolation, sizing | CPU semantic oracle with magnitude/projection edge cases                                                                  |
| TSL graph structure                              | Stable `serialiseStrippedTslGraph` snapshot                                                                               |
| Three.js code-generation seam                    | Generated-source inspection through `renderer.debug.getShaderAsync`; exact revision/source fingerprint for upstream forks |
| GLSL validity                                    | Real WebGL2 compile and link; invalid-shader negative control                                                             |
| WGSL validity                                    | Real WebGPU `getCompilationInfo()` plus uncaptured-error/device-loss checks; invalid-shader negative control              |
| Visible rendering, depth, clipping, blend, scale | Deterministic WebGL and WebGPU pixel/interaction fixture                                                                  |
| Cache/lifecycle                                  | Reuse, ref-count/eviction, warmup, backend switch, and dispose tests                                                      |
| Ubiquitous or pass-count-sensitive code          | Whole-frame timing; timestamp-query GPU timing when available; structural draw/pass counts otherwise                      |

A graph snapshot never proves compilation or pixels. A mocked renderer never proves backend validation. A screenshot alone never proves units or lifecycle.

### 4. Register the executable contract

Update `apps/ui/app/components/geometry/graphics/three/shader-policy.ts` in the same change:

- one stable site id;
- every implementation module;
- backend coverage;
- declared risks;
- named evidence for each risk.

The inventory AST test must discover the site exactly once. Do not suppress an unregistered shader; either register it or delete the dead shader.

### 5. Implement for stable runtime ownership

- Allocate materials, meshes, passes, and pipelines once per owner/renderer configuration.
- Mutate uniforms/properties for ordinary state changes; do not rebuild pipelines per frame or interaction.
- Prewarm every finite endpoint pipeline off the first visible frame.
- Dispose every owned GPU resource; never dispose caller-owned/shared resources.
- Compute uniform/per-frame values on the CPU or vertex stage rather than per fragment.
- Preserve exact geometric depth for hidden-line correctness; apply bounded coplanar separation on the owning surface.
- For CSS-pixel effects, account for viewport height, projection type, and device-pixel ratio explicitly.
- For transparent double-sided materials, use one pass only when both sides are intentionally equivalent.

### 6. Verify

Run focused tests first, then the project gates through Nx:

```bash
pnpm nx test ui --watch=false
pnpm nx typecheck ui
pnpm nx lint ui
pnpm nx build ui
pnpm nx test ui-e2e --watch=false
pnpm docs:validate
```

If the worktree has unrelated failures, preserve them and report the exact failing targets separately. Do not claim backend parity from a skipped WebGPU test; record the adapter/capability and reason. Do not fabricate unavailable timestamp-query metrics.

### 7. Close out performance-sensitive work

Record reproducible before/after medians, p95, MAD, sample count, scene, camera, viewport/DPR, backend/adapter, browser, Three.js revision, and whether GPU timing was supported. Include structural pass/draw counts. Reject a renderer-convergence or raw-WGSL migration unless it passes the predeclared correctness and performance gates.

## Definition of Done

- The smoking-gun failure is covered red-first when this is a bug fix.
- WebGL/WebGPU implementations share semantics and differ only at explicit backend seams.
- The executable inventory is complete and every risk maps to named evidence.
- Real backend positive and negative controls pass where the backend is available.
- Visible scale/depth/clipping/color behavior has deterministic coverage.
- Warmup, reuse, switching, and disposal are tested.
- Hot-path changes have reproducible performance evidence.
- Policies and research close-out are updated when architecture or measured results change.
