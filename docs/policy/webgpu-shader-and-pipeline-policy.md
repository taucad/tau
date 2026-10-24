---
title: 'WebGPU Shader and Pipeline Policy'
description: 'Rules for portable Three.js shaders, generated-source evidence, and render-pipeline ownership'
status: active
created: '2026-05-15'
updated: '2026-10-24'
related:
  - docs/policy/graphics-backend-policy.md
  - docs/policy/webgpu-rendering-pipeline.md
  - docs/research/webgpu-override-material-vertex-binding-failure.md
  - docs/research/webgpu-overlay-depth-attachment-persistence.md
  - docs/research/webgpu-post-processing-performance-audit.md
  - docs/research/webgpu-composite-quad-depth-write-non-functional.md
  - docs/research/webgpu-render-loop-audit.md
  - docs/research/webgpu-axes-hover-pipeline-stall.md
  - docs/research/gltf-edges-fat-line-performance.md
  - docs/research/webgl-section-view-white-occlusion.md
  - docs/research/threejs-shader-foundation-and-testing-blueprint.md
---

# WebGPU Shader and Pipeline Policy

Internal reference for authoring portable GLSL/TSL shaders and managing render-pipeline ownership under Three.js in `packages/viewer` and its app composition.

## Rationale

WebGPU validation is strict where WebGL is permissive: pipelines bind vertex-buffer slots by exact layout, depth attachments persist across frames, and the swapchain only re-acquires the color texture each frame. Naive patterns inherited from the WebGL era (`scene.overrideMaterial`, `gl.autoClear = false` without explicit depth clears, GLSL-flavoured uniform branching) silently corrupt rendering on the WebGPU path or fail the WGSL uniformity analyser. This policy codifies the rules we've learned the hard way so the next material author doesn't.

## Rules

### 1. Reuse authoritative pass outputs; never replay a heterogeneous scene for data already rendered

Avoid `scene.overrideMaterial` for any pass that spans more than one geometry signature (Mesh + Line2 + InstancedMesh + Sprite + section caps). It can declare vertex-buffer slots that a later draw does not bind under WebGPU. Also avoid the former workaround of traversing the scene, cloning/swapping every material, and replaying the complete scene merely to recover depth. If an existing pass already owns the required depth or normal attachment, retain that attachment and bridge it directly to its consumer.

Only add a dedicated depth/normal render when no compatible authoritative output exists or a controlled comparison demonstrates that conversion/reuse costs more while preserving the same contract. Record that exception and its measurements. Such a pass must own materials that match every supported geometry signature; it must not dynamically mutate live scene materials.

**Why**: Compatible attachment reuse avoids scene traversal, clone caches, material mutation and a second geometry rasterization. Measure any conversion or synchronization cost before claiming it is fastest. See three.js issues [#28927](https://github.com/mrdoob/three.js/issues/28927) and [#30398](https://github.com/mrdoob/three.js/issues/30398).

**Enforced by**: `tau-lint/no-scene-override-material` (error).

CORRECT:

```typescript
const sceneDepth = scenePass.getTextureNode('depth');
depthRestoreMaterial.depthNode = sceneDepth.sample(screenUV);
depthRestore.render(renderer); // one retained fullscreen depth-only draw
```

INCORRECT:

```typescript
const depthOnly = new THREE.MeshBasicMaterial();
depthOnly.colorWrite = false;
scene.overrideMaterial = depthOnly;
gl.render(scene, camera);
scene.overrideMaterial = null;
```

### 2. Treat the WebGPU canvas depth attachment as persistent across frames

When rendering with `gl.autoClear = false`, the WebGPU canvas depth/stencil attachment is **not** wiped between frames. Authors of any `useFrame` subscriber that disables auto-clear must explicitly clear the required attachments or enable `autoClear` with `autoClearDepth = true` (and `autoClearStencil = true` when relevant) at the start of the next pass that should see a fresh depth buffer, or risk stale depth values silently failing the reversed-Z `GREATER` compare.

**Why**: WebGL's browser compositor implicitly clears the drawing-buffer depth between frames when `preserveDrawingBuffer: false`. A retained WebGPU depth texture keeps its contents until cleared or replaced; `loadOp: 'load' | 'clear'` controls the initial contents of each render pass. See `docs/research/webgpu-overlay-depth-attachment-persistence.md`.

CORRECT:

```typescript
useFrame(({ gl, scene, camera }) => {
  gl.autoClear = true;
  gl.autoClearColor = false;
  gl.autoClearDepth = true;
  gl.autoClearStencil = true;
  gl.render(scene, camera);
}, 2);
```

INCORRECT:

```typescript
useFrame(({ gl, scene, camera }) => {
  gl.autoClear = false;
  gl.render(scene, camera);
}, 2);
```

### 3. Reversed-Z viewports clear depth to 0, not 1

When constructing a depth-only override or custom render pass that must reset the depth buffer for a `reversedDepthBuffer: true` renderer, do not call `gl.clearDepth(1.0)` directly. Use the renderer's `getClearDepth()` / `setClearDepth()` API, or `autoClearDepth = true`, which respects the reversed-Z flag automatically and emits clear value `0.0`.

**Why**: Under reversed-Z (`near = 1`, `far = 0`, depth compare = `GREATER`), the far plane sits at `0.0`. Clearing to `1.0` would treat the entire canvas as foreground, hiding all subsequent draws. Three.js's `Renderer.getClearDepth()` (`node_modules/three/src/renderers/common/Renderer.js:2207-2210`) returns `1 - this._clearDepth` when `reversedDepthBuffer === true`.

### 4. Author TSL using uniform branching, not preprocessor permutations

Express axis-/feature-permutations via `If/ElseIf/Else` over `uniform()` values, not by recompiling N material variants. Prefer mutating `uniform.value` over recreating the material when only configuration scalars change.

**Why**: Rebuilding materials can repeat graph construction and compilation; uniform updates avoid structural churn. Dynamically uniform branching is not free, and specialization may reduce executed work or register pressure. Measure the relevant trade-off rather than claiming every rebuild recompiles or every branch has zero cost. See `docs/research/webgpu-render-loop-audit.md` finding R1.

**Line materials addendum (mandatory).** For line materials drawn into the viewport canvas (`Line2NodeMaterial` consumers — scene `AxesHelper`, gizmo cube axes, edge overlays, future fat-line surfaces), the persistent mesh + material instance pattern is **mandatory**: each axis/edge owns one `Line2NodeMaterial` + one or more `Line2WebGpu` meshes constructed exactly once on mount, with hover/selection/visibility state mutated imperatively (`material.linewidth = ...`, `mesh.visible = ...`) from a `useLayoutEffect`. Routing hover state through React props that drive the material constructor inside a `useMemo` is forbidden — it triggers the exact pipeline-compile gap this rule warns about, manifesting as the "axis line vanishes on hover" frame skip documented in `docs/research/webgpu-axes-hover-pipeline-stall.md`. Apply rule 13 to preparation admission and measure cold first use separately from warmed interaction.

**Owner-local edge addendum (mandatory).** Edge-overlay line materials produced by the runtime (kernel-emitted `LINES` primitives — replicad `meshEdges`, JSCAD normalized topology edges, dihedral fallback detection, future kernel edge paths) must preserve source mesh/component ownership in the GLB. Do not merge runtime lines into a scene-root bundle before the UI reads them; owner-local lines let visibility, selection, diagnostics, and kernel-specific topology stay attached to the source mesh. The UI fat-line conversion (`packages/viewer/src/graphics/three/materials/gltf-edges.ts`) wraps each source `LineSegments` into `LineSegments2`, but all wrapped edges for a backend share one material instance and one shader program. Allocating one material-per-source-primitive on the UI side is forbidden: it produces one `createRenderPipelineAsync` per part of a CAD assembly under cold cache (the "disabling edge rendering for large models" lag documented in `docs/research/gltf-edges-fat-line-performance.md`). On the WebGL path, the shared `LineMaterial` also pins a stable `customProgramCacheKey` so three's `WebGLPrograms` collapses the GLSL program cache across viewport + screenshot renderers.

CORRECT:

```typescript
const axisIndex = uniform(0);
const colorNode = Fn(() => {
  const plane = vec2().toVar();
  If(axisIndex.equal(float(0)), () => plane.assign(worldPos.xy))
    .ElseIf(axisIndex.equal(float(1)), () => plane.assign(worldPos.xz))
    .Else(() => plane.assign(worldPos.zy));
  // ...
})();
applyVisualOverrides({ axes: 'xzy' }); // mutates uniform.value, reuses pipeline
```

CORRECT (line-material persistent-instance shape):

```typescript
const resources = React.useMemo(() => {
  const material = new Line2NodeMaterial({ color, linewidth: thickness, transparent: true });
  const line = new Line2WebGpu(geometry, material);
  return { line, material };
}, [color]); // hover state NOT in deps

React.useLayoutEffect(() => {
  resources.material.linewidth = isHovered ? hoverThickness : thickness;
  resources.line.visible = isVisible;
}, [isHovered, isVisible, resources, thickness, hoverThickness]);
```

INCORRECT:

```typescript
const colorNode = axes === 'xyz' ? makeXyzColorNode() : makeXzyColorNode();
// every axes change rebuilds the material and busts the pipeline cache
```

INCORRECT (line-material hover recreation):

```typescript
const line = React.useMemo(
  () => new Line2WebGpu(geometry, new Line2NodeMaterial({ linewidth: isHovered ? 2 : 1 })),
  [isHovered], // forces a new render pipeline on every hover transition
);
```

### 5. Hoist per-frame scalars to varyings or CPU uniforms

Prefer computing values constant across a draw once on the CPU and supplying uniforms. Vertex-stage computation with interpolation is appropriate only when it preserves the required spatial semantics. Verify the emitted shader and measure relevant costs; avoid moving nonlinear per-fragment work to vertices merely to reduce instruction counts.

**Why**: Fullscreen effects can evaluate the same uniform-only expression millions of times, although a compiler may hoist it. `length(cameraPosition)` is draw-constant; `worldPosition - cameraPosition` generally is not. Loading a uniform is not itself redundant computation, and interpolating a nonlinear value can change pixels.

CORRECT:

```typescript
const cameraDistanceVarying = varyingProperty('float', 'tauCamDist');
material.vertexNode = Fn(() => {
  cameraDistanceVarying.assign(length(cameraPosition));
  return cameraProjectionMatrix.mul(modelViewMatrix).mul(vec4(positionLocal, 1));
})();
material.colorNode = Fn(() => {
  const fade = smoothstep(uFar, uNear, cameraDistanceVarying);
  return vec4(uColor, fade);
})();
```

INCORRECT:

```typescript
material.colorNode = Fn(() => {
  const cameraDistance = length(cameraPosition); // recomputed per fragment
  // ...
})();
```

### 6. Reusable `Fn` bodies must not name `.toVar()` locals

Inside any `Fn(...)` that is invoked more than once in a graph (i.e. not the immediate-invocation pattern `Fn(() => { ... })()`), pass `.toVar()` with **no string argument**. Reserve named locals for the outer single-invocation `vertexNode` / `colorNode` graphs only.

**Why**: TSL inlines reusable `Fn` bodies at each call site. Named `.toVar('x')` registers into `NodeBuilder.declarations`, so the second inlined copy collides with the first and the NodeBuilder either auto-renames-with-warning or breaks the shader source. See `docs/policy/graphics-backend-policy.md` §3.

### 7. Match material lifecycle flags to the intended render pass

A material's `transparent`, `depthWrite`, `depthTest`, `colorWrite`, and `side` fields together determine which queue three.js assigns the draw to and what state the WebGPU pipeline declares. Ensure every material is internally consistent:

| Pass intent              | `transparent` | `depthWrite` | `depthTest`   | `colorWrite` |
| ------------------------ | ------------- | ------------ | ------------- | ------------ |
| Opaque shaded surface    | `false`       | `true`       | `true`        | `true`       |
| Transparent overlay      | `true`        | `false`      | `true`        | `true`       |
| Depth-only pass material | `false`       | `true`       | pass-specific | `false`      |
| Compositing fullscreen   | `false`       | `false`      | `false`       | `true`       |

**Why**: `transparent = true` defers the draw to the transparent pass, but three.js still honors the material's explicit `depthWrite` value in both WebGL and WebGPU. Transparent overlays and ghosted model surfaces must set `depthWrite = false` themselves; depth-only pass materials must stay `transparent = false`, `depthWrite = true`, and `colorWrite = false`. See `docs/research/cad-viewer-isolation-transparency-depth-write.md`.

### 8. Bound observed pipeline variants by their actual context

Record unique shader/pipeline creation and first-use events. Cache keys include shader stages, geometry layout and backend render state, including attachment formats, sample count, blending, depth/stencil, winding and clipping. Compatible meshes can reuse a pipeline; one material can require several context variants. Neither per-mesh recompilation nor a `(mesh count × material count)` upper bound follows from persistent instances alone.

Keep ordinary pose, hover and scalar changes on persistent objects. When structural state must change, qualify the affected context and cold first-use cost. Resolve the installed dependency and patches before relying on a particular cache implementation.

**Why**: Stable ownership prevents avoidable churn, but cache behavior depends on the actual render context rather than object count alone.

### 9. Long-lived render pipelines must be owned by a single component

A `THREE.RenderPipeline` (TSL post-processing) created outside React's lifecycle must be disposed when its owning component unmounts. Never share a `RenderPipeline` instance across React subtrees; route pipeline reads through React state and reconstruct on backend or topology change.

**Why**: `RenderPipeline.dispose()` releases internal render targets and the fullscreen `QuadMesh`. Leaked pipelines accumulate GPU memory on hot-reload and during route transitions. See `packages/viewer/src/graphics/three/post-processing-webgpu.tsx` for the canonical ownership pattern.

### 10. Test shaders as a layered executable contract

Every custom shader site must be registered in `shader-policy.ts` and prove each declared risk with named evidence. Use the smallest layers that cover the risk:

1. CPU semantic oracles for coordinate, unit, interpolation, tolerance, depth, and sizing math.
2. TSL graph snapshots for deterministic graph structure; these are supplementary, not proof that generated WGSL compiles or renders correctly.
3. Exact generated GLSL/WGSL inspection through public Three.js debug APIs, guarded to the installed Three.js revision when upstream source shape matters.
4. Real WebGL2 compile/link and WebGPU `getCompilationInfo()` validation, including uncaptured-error/device-loss assertions. Qualify negative-control shaders when the harness or compiler dependency changes; they need not be re-created for each material edit.
5. Deterministic backend pixel/interaction tests for visible behavior.
6. Frame/GPU timings for hot ubiquitous shaders or changes that add/remove render passes.

Raw WGSL/GLSL is an escape hatch, not the default. Use shared TSL for the node WebGPU and node WebGL2 backends. Preserve required classic fallback behavior without duplicating every node-only optimization. Record the initialized execution backend independently of renderer family. A raw WGSL specialization requires a measured bottleneck, a documented portability boundary, and the same validation layers.

**Why**: A graph snapshot can remain stable while generated source, validation, state, or pixels regress. The layers catch different failure classes and keep the inventory auditable.

### 11. Declare AO lighting semantics and measure composition choices

Keep AO visible during motion, with explicit estimation/filtering resolution and edge-preserving reconstruction. Record whether AO attenuates indirect lighting or multiplies already-lit beauty; these are not physically equivalent. Preserve the qualified appearance contract, including metallic highlights and alpha, when optimizing composition.

Reuse compatible depth and normal data. Do not assume every AO implementation requires a normal MRT or that a particular sample count/pass saving applies to the current frame. Compare composition, material-context application and normal reconstruction only where they satisfy the required contract. Avoid a redundant scene rasterization when retained inputs suffice, but do not prescribe a universal AO multiply or prohibit a justified measured alternative.

**Why**: A historical pass-count saving does not prove the best lighting model, bandwidth or shader cost for a different frame architecture.

### 12. Preserve authoritative depth, sample coverage and resource ownership

Every consumer must use depth representing the intended geometry and all applicable later cap writes. Record source/destination depth convention, projection, precision, sample count/positions, interpolation, UV orientation, comparison/bias and clear/load behavior. Preserve geometric occlusion for outlines, wash, grid, picking and captures.

Prefer existing compatible attachments. Copying, directly sharing an attachment and sampling depth in a shader are different operations: single-sample shader discard is not automatically equivalent to multisampled fixed-function depth. Prove the required equivalence at occlusion boundaries, thin features, coplanar surfaces and subpixel positions in both cameras and node backends before replacing one with another. Do not sample an attachment while it is incompatibly bound for writing or share live resources across renderer instances.

One owner allocates and disposes each resource; consumers never dispose borrowed depth. Restore renderer state even on failure. Inspect supported load/store/resolve controls before introducing custom shader logic, and never discard data needed by a later consumer. Record descriptor storage, renderer counters and physical-memory observations separately: discard can save bandwidth without releasing capacity.

Keep the currently qualified depth bridge until its replacement passes final-composition tests. The node frame and classic canvas may require different bridges. Do not mutate private `RenderPipeline._quadMesh` internals or traverse/clone/swap live scene materials to recover depth. Installed-version adaptations need exact source guards and an exit condition.

**Why**: Correct depth ownership survives implementation changes; a prescribed quad-copy mechanism cannot substitute for coverage and lifecycle proof.

### 13. Prepare the correct active context; admit optional work on demand

Finalize ownership, saved pose, visibility/opacity, physical bounds, render frame and the active camera before the first active scene draw. Preserve the previous committed scene until its replacement is valid. Build only the selected endpoint and required output graph. With AO disabled, allocate neither GTAO nor a normal MRT attachment. Construct inactive projections and optional Section/Measure helpers on first demand by default; spatial rebasing is a uniform update, not a reason to compile an inactive endpoint.

The composed R3F node canvas disables its default depth/stencil before its first draw (`canvas-three-gl.ts`): only final color encoding reaches that canvas. The explicit frame still owns depth/stencil for CAD draws, even with AO off. Keep standalone and offscreen renderer depth intact. Retain clear operations unless a controlled comparison proves their removal helps; loading an old attachment can cost more than clearing it.

The node post owner retains one single-sample frame target with linear-light shader/blend semantics across the synchronous frame callbacks. Neutral tone mapping bounds the scene before composition, so this frame uses hardware-sRGB RGBA8 storage; unbounded/other tone mappings retain linear RGBA16F. Scene radiance remains HDR RGBA16F and the frame depth/stencil precision is unchanged. A tone-map format change disposes and replaces the frame through the same owner. Qualify storage changes with dark ramps, alpha, repeated blends and final opaque/transmissive captures; raw unpremultiplied PNG RGB near zero alpha is not displayed contrast. It draws scene color/depth at priority 1, allows later CAD draws to preserve/extend those attachments, then encodes once at priority 3.5. The graph tone-maps the scene itself; overlays remain untone-mapped. Final output and cleanup restore the prior target. A subsequent frame recovers the destination if an intervening subscriber threw. Do not hold this binding across an await.

Evaluate standard `RenderPipeline.render()` as part of the shared node consolidation, using final-output tests that include later depth-writing caps and overlays. Adopt it only when later draws preserve both color and depth, with explicit sample/clear/output ownership; a standalone output screenshot is insufficient.

Do not assume detached `gl.compileAsync(group, camera)` warms a live post pass. Frame target, sample count, MRT, clipping and call depth participate in its real render context; a viewport-copy graph built without them may be rebuilt on first draw. A 1×1 destination does not shrink a scene pass's intermediate targets. Keep semantic generated-node cache keys stable before and after setup, while distinguishing caller-provided nodes and incompatible structural variants.

Additional preparation after display needs a measured frequent first-use stall, a finite resource bound, input/visibility admission and cancellation tied to the current geometry/renderer owner. Never hold global render target or MRT state across an await. Retain and dispose resources through one owner; async pipeline creation alone does not imply nonblocking CPU graph construction or browser paint. If bounded preparation cannot safely remove a cold first-use stall, report that limitation separately from warmed latency.

**Why**: The [geometry presentation audit](../research/geometry-presentation-latency-blueprint.md) reproduces per-mesh edge graph rebuilding and unused endpoint/AO work ahead of the useful frame. Correct-context demand preparation removes that work without inventing a background warm-up scheduler.

CORRECT:

```typescript
const withAo = aoAllowed && aoEnabled;
const active = createPipelineResources({ scene, camera, withAo });
// The actual priority-1 draw uses the finalized scene and selected endpoint.
```

INCORRECT:

```typescript
await Promise.all([perspective, orthographic].map((camera) => gl.compileAsync(unattachedModel, camera)));
// Optional endpoints and AO must not delay every cold load.
```

### 14. Qualify optimization against the installed runtime and whole frame

Record exact build, dependency version/patches, initialized backend, device, fixture, poses, CSS size, DPR and drawing buffer. Inspect installed source before applying upstream guidance. Predeclare the expected benefit and its measurement uncertainty; use unchanged A/A repeats to estimate noise, then alternating independent A/B runs. Report absolute milliseconds and bytes alongside percentages, distributions and variability across runs, query/sample counts, CPU submission, GPU query scope/precision, and instrumentation-off throughput. Correlate sparse GPU samples to submitted poses before making paired-pose claims. Do not sum overlapping intervals or compare different timing scopes as identical metrics. Separate cold startup/first use from steady state and descriptor allocations from physical memory.

Do not impose a universal percentage improvement cutoff. Judge a repeatable saving against uncertainty, frame budget, CPU/tail/startup tradeoffs and implementation complexity. A saving smaller than variability remains inconclusive, not proof of no benefit. Memory, latency, reduced work and simpler ownership may independently justify a change without an FPS gain; state which benefit is actually established. Backend-specific acceptance is allowed when the other path remains correct and its cost is explicitly qualified.

### 15. Separate functional correctness, appearance and optimization acceptance

Declare these three decisions independently before evaluating a candidate:

| Decision               | Evidence and disposition                                                                                                                                                                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Functional correctness | Preserve required geometry, picking, clipping, depth precision, cap/grid occlusion, highlight visibility semantics, lifecycle and backend validation. Missing geometry, stale output or wrong visibility is a failure regardless of speed.                                                                          |
| Appearance             | For arithmetic-preserving changes, exact or tightly bounded pixel comparison is appropriate. For changed rasterization, sampling or filtering, also measure boundary displacement, continuity, contrast/width and temporal residuals. A maximum channel error alone identifies difference, not perceptual severity. |
| Benefit and complexity | Weigh measured GPU/CPU time, tails, memory, first use and ownership complexity. Neither fewer passes nor lower nominal storage proves faster rendering. A small repeatable improvement is not automatically rejected.                                                                                               |

Calibrate appearance tolerances using reference variation, known defective controls and the intended display scale. Keep interior/occlusion checks distinct from antialiased boundary checks; whole-image averages must not hide broken small features. Include motion, camera/DPR changes and full production composition. Numerical thresholds are engineering contracts, not universal perceptual laws. A borderline noise or integrated-width failure needs spatial/temporal investigation before declaring the algorithm unacceptable.

Keep depth precision and required CAD behavior as invariants. Sample count, target dimensions and pass sequence are implementations that may change when their replacements satisfy the contract. Preserve classic appearance as the reference; do not degrade it to pass a candidate.

Version any justified gate revision with its rationale, negative controls, authorization and fresh evidence. Preserve original thresholds and failures; never relabel an old failed run as passed under a new gate. Use explicit dispositions: functional failure, appearance investigation, benefit inconclusive, bounded acceptance, or rollout qualified. Qualification of an optimization does not promote an execution backend or require completing unrelated rollout gates first.

### 16. Separate composition replacement from broader rollout

Decide independently whether a replacement materially regresses its current reference and whether the resulting renderer is ready for broader rollout. Classify unresolved findings as replacement-specific regressions, demonstrated shared defects, unattributed differences, accepted numerical/coverage differences, or follow-up improvements. Similar failures in both variants do not prove a shared mechanism: compare reproduction sequence, location, severity, frequency and impact. Preserve strict picking, clipping, depth, hidden-line and missing-stroke semantics.

Use a bounded comparison with independent histories and retain every admitted run. A passing rerun is not a correction. End an inconclusive investigation with a supported disposition and the next decisive experiment. An unresolved material replacement-specific regression blocks promotion; an assessed shared defect belongs to the separate release acceptance record.

Once a replacement qualifies, remove its obsolete production alternative and selector. Preserve reproducible historical baselines through source revisions or research artifacts, rather than permanent competing implementations. Necessary AO-off specializations and classic compatibility fallback are separate from node composition consolidation; node WebGL2 must independently qualify before becoming the automatic fallback.

**Why**: A simpler qualified owner avoids indefinite implementation duplication without concealing pre-existing renderer defects or weakening release criteria.

## Anti-Patterns

The following idioms read fine in a WebGL world but break or silently misbehave under WebGPU:

- **`scene.overrideMaterial` for a depth-only or any cross-mesh-type pass** (rule 1).
- **`gl.autoClear = false` for the entire frame without a per-pass depth clear** (rule 2).
- **Manual `gl.clearDepth(1.0)` on a `reversedDepthBuffer: true` renderer** (rule 3).
- **Recreating a `NodeMaterial` to change a uniform-driven configuration** (rule 4).
- **Recomputing `length(cameraPosition)` or other per-frame scalars in the fragment** (rule 5).
- **Named `.toVar('x')` inside a `Fn` invoked more than once** (rule 6).
- **Setting `transparent = true` on a depth-only pass material** (rule 7).
- **Sharing a `RenderPipeline` across multiple React components** (rule 9).
- **An extra AO scene replay without a measured need or treating whole-beauty multiplication as indirect-only occlusion** (rule 11).
- **Relying on `RenderPipeline._quadMesh.material.depthNode` to populate canvas depth** (rule 12). Use the post owner's explicit frame depth or classic direct-to-canvas bridge.
- **Traversing/cloning/swapping/replaying the main scene to recover post depth** (rules 1 and 12). Reuse the authoritative pass output.
- **First frame of a `RenderPipeline` blocking on synchronous pipeline compile** (rule 13).
- **`useTemporalFiltering = true` on a node-graph AO under `frameloop='demand'`** — accumulator never converges; the per-frame rotation produces shimmer instead of smoothing. Set `false` until either `frameloop='always'` or a true history-buffer TAA pass exists.

## Summary Checklist

Before merging a new TSL material or render-pipeline change:

- [ ] No `scene.overrideMaterial` or clone-swap scene replay; existing pass attachments are reused.
- [ ] Clear/load behavior is explicit; `autoClearDepth` alone is not treated as a clear when `autoClear` is false.
- [ ] Reversed-Z renderers use `getClearDepth()` / `autoClearDepth` (no manual `clearDepth(1.0)`).
- [ ] Ordinary scalar updates avoid structural churn; branching/specialization trade-offs are measured when relevant.
- [ ] **Line materials drawn into the viewport canvas use the persistent mesh + material pattern with imperative property mutation; hover/selection state never drives the material constructor.**
- [ ] Per-frame scalars computed in vertex or supplied as CPU uniforms.
- [ ] Reusable `Fn` bodies use unnamed `.toVar()`.
- [ ] Material lifecycle flags (`transparent`, `depthWrite`, `colorWrite`) match the pass intent table.
- [ ] Pipeline variants and first-use work are measured in the actual target/sample/clipping context; ordinary interaction does not rebuild objects.
- [ ] Every custom shader site is registered in `shader-policy.ts`; each declared risk names evidence.
- [ ] Shader structure, compilation and final pixels have evidence proportional to risk; snapshots alone do not establish behavior.
- [ ] `RenderPipeline` instances have single React-owned lifecycle.
- [ ] AO lighting semantics and measured composition costs are explicit, with smooth AO retained during motion.
- [ ] Overlays preserve authoritative depth including caps; any changed depth mechanism proves sampling, occlusion and lifetime semantics.
- [ ] The first active draw sees finalized pose/visibility/bounds/camera; disabled AO and unused projections perform no speculative work. Cold and warmed first-use latency are measured separately.

## References

- [Three node renderer and WebGL2 execution](https://threejs.org/manual/pages/webgpurenderer)
- [Three render-target attachment controls](https://threejs.org/docs/pages/RenderTarget.html) — verify availability in the installed version
- [WebGPU timing limitations and throughput](https://webgpufundamentals.org/webgpu/lessons/webgpu-timing.html)

- [WebGPU Shading Language spec](https://www.w3.org/TR/WGSL)
- [WebGPU spec — vertex state](https://www.w3.org/TR/webgpu/#vertex-state) (vertex-buffer slot binding requirements)
- [three.js #28927](https://github.com/mrdoob/three.js/issues/28927) — pipeline state leak between draws with different attribute counts
- [three.js #30398](https://github.com/mrdoob/three.js/issues/30398) — `Vertex buffer slot N required` on geometry exchange
- [three.js #32896](https://github.com/mrdoob/three.js/pull/32896) — `overrideMaterial` node assignment fix
- Related: `docs/policy/graphics-backend-policy.md`
- Related: `docs/policy/webgpu-rendering-pipeline.md`
- Research: `docs/research/webgpu-override-material-vertex-binding-failure.md`
- Research: `docs/research/webgpu-overlay-depth-attachment-persistence.md`
- Research: `docs/research/webgpu-post-processing-performance-audit.md`
