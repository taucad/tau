---
title: 'WebGPU Shader and Pipeline Policy'
description: 'Rules for portable Three.js shaders, generated-source evidence, and render-pipeline ownership'
status: active
created: '2026-05-15'
updated: '2026-08-30'
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

Internal reference for authoring portable GLSL/TSL shaders and managing render-pipeline ownership under Three.js in `apps/ui`.

## Rationale

WebGPU validation is strict where WebGL is permissive: pipelines bind vertex-buffer slots by exact layout, depth attachments persist across frames, and the swapchain only re-acquires the color texture each frame. Naive patterns inherited from the WebGL era (`scene.overrideMaterial`, `gl.autoClear = false` without explicit depth clears, GLSL-flavoured uniform branching) silently corrupt rendering on the WebGPU path or fail the WGSL uniformity analyser. This policy codifies the rules we've learned the hard way so the next material author doesn't.

## Rules

### 1. Reuse authoritative pass outputs; never replay a heterogeneous scene for data already rendered

Avoid `scene.overrideMaterial` for any pass that spans more than one geometry signature (Mesh + Line2 + InstancedMesh + Sprite + section caps). It can declare vertex-buffer slots that a later draw does not bind under WebGPU. Also avoid the former workaround of traversing the scene, cloning/swapping every material, and replaying the complete scene merely to recover depth. If an existing pass already owns the required depth or normal attachment, retain that attachment and bridge it directly to its consumer.

Only add a dedicated depth/normal render when no authoritative output exists. Such a pass must own materials that match every supported geometry signature; it must not dynamically mutate live scene materials.

**Why**: Reusing an existing attachment is both the safer layout contract and the maximal-performance path: no scene traversal, no clone cache, no material mutation, and no second geometry rasterization. See three.js issues [#28927](https://github.com/mrdoob/three.js/issues/28927) and [#30398](https://github.com/mrdoob/three.js/issues/30398).

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

When rendering with `gl.autoClear = false`, the WebGPU canvas depth/stencil attachment is **not** wiped between frames. Authors of any `useFrame` subscriber that disables auto-clear must explicitly set `autoClearDepth = true` (and `autoClearStencil = true` when relevant) at the start of the next pass that should see a fresh depth buffer, or risk stale depth values silently failing the reversed-Z `GREATER` compare.

**Why**: WebGL's browser compositor implicitly clears the drawing-buffer depth between frames when `preserveDrawingBuffer: false`. WebGPU has no such compositor clear — the depth texture is a stable three.js-managed texture whose lifecycle is bounded only by `loadOp: 'load' | 'clear'`. See `docs/research/webgpu-overlay-depth-attachment-persistence.md`.

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

**Why**: Each material rebuild evicts the compiled WGSL from three.js's pipeline cache and triggers a fresh shader compile (10-100 ms hitch). Uniform branching is free on modern GPUs when the predicate is dynamically uniform; the WGSL uniformity analyser handles `uniform()` reads correctly. See `docs/research/webgpu-render-loop-audit.md` finding R1.

**Line materials addendum (mandatory).** For line materials drawn into the viewport canvas (`Line2NodeMaterial` consumers — scene `AxesHelper`, gizmo cube axes, edge overlays, future fat-line surfaces), the persistent mesh + material instance pattern is **mandatory**: each axis/edge owns one `Line2NodeMaterial` + one or more `Line2WebGpu` meshes constructed exactly once on mount, with hover/selection/visibility state mutated imperatively (`material.linewidth = ...`, `mesh.visible = ...`) from a `useLayoutEffect`. Routing hover state through React props that drive the material constructor inside a `useMemo` is forbidden — it triggers the exact pipeline-compile gap this rule warns about, manifesting as the "axis line vanishes on hover" frame skip documented in `docs/research/webgpu-axes-hover-pipeline-stall.md`. Combine with rule 13 (`compileAsync` warmup) so the first mount also pays no first-frame skip.

**Owner-local edge addendum (mandatory).** Edge-overlay line materials produced by the runtime (kernel-emitted `LINES` primitives — replicad `meshEdges`, JSCAD normalized topology edges, dihedral fallback detection, future kernel edge paths) must preserve source mesh/component ownership in the GLB. Do not merge runtime lines into a scene-root bundle before the UI reads them; owner-local lines let visibility, selection, diagnostics, and kernel-specific topology stay attached to the source mesh. The UI fat-line conversion (`apps/ui/app/components/geometry/graphics/three/materials/gltf-edges.ts`) wraps each source `LineSegments` into `LineSegments2`, but all wrapped edges for a backend share one material instance and one shader program. Allocating one material-per-source-primitive on the UI side is forbidden: it produces one `createRenderPipelineAsync` per part of a CAD assembly under cold cache (the "disabling edge rendering for large models" lag documented in `docs/research/gltf-edges-fat-line-performance.md`). On the WebGL path, the shared `LineMaterial` also pins a stable `customProgramCacheKey` so three's `WebGLPrograms` collapses the GLSL program cache across viewport + screenshot renderers.

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

Quantities that depend only on the camera, model matrix, or other per-frame state must be computed in the vertex stage (and passed as a varying) or supplied as a CPU-side uniform. Do not recompute them per fragment.

**Why**: Fragment count >> vertex count for fullscreen overlays. `length(cameraPosition)`, `worldPosition - cameraPosition` plane projections, and similar scalars are constant across the primitive and waste fragment cycles. Three.js's TSL `cameraPosition` is a uniform — sampling it in the fragment is legal but redundant if the value is already known at vertex time.

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

### 8. Pipeline cache keys include geometry signature — assume per-mesh recompiles

WebGPU pipelines are cached by `(stageVertex.id, stageFragment.id, backend.getRenderCacheKey(renderObject))` where the backend key includes the geometry's attribute layout (`renderObject.getGeometryCacheKey()`). When a material is applied to N meshes with M distinct attribute signatures, expect M compiled pipelines per material.

**Why**: Plan capacity. Hot-swapping geometry attribute layouts (e.g. toggling vertex colors, instancing) invalidates pipeline cache entries. Authors building libraries of materials applied across diverse geometries should budget for the worst case and consider pipeline warmup (`renderer.compileAsync`).

**Persistent-instance bound.** When the persistent mesh + material pattern from rule 4 is in force, the pipeline budget is bounded to `(mesh count × material count)` and is **knowable at mount time** — for example, the scene `AxesHelper` warms exactly six pipelines (three axes × two halves) once on mount, none of which recompile during hover. Any architecture that recreates meshes or materials on user-driven state changes breaks this bound and re-introduces the 10-100 ms compile hitch documented in rule 4. Pair the bound with rule 13 (`compileAsync` warmup) so the bounded set is also paid off the critical path.

### 9. Long-lived render pipelines must be owned by a single component

A `THREE.RenderPipeline` (TSL post-processing) created outside React's lifecycle must be disposed when its owning component unmounts. Never share a `RenderPipeline` instance across React subtrees; route pipeline reads through React state and reconstruct on backend or topology change.

**Why**: `RenderPipeline.dispose()` releases internal render targets and the fullscreen `QuadMesh`. Leaked pipelines accumulate GPU memory on hot-reload and during route transitions. See `apps/ui/app/components/geometry/graphics/three/post-processing-webgpu.tsx` for the canonical ownership pattern.

### 10. Test shaders as a layered executable contract

Every custom shader site must be registered in `shader-policy.ts` and prove each declared risk with named evidence. Use the smallest layers that cover the risk:

1. CPU semantic oracles for coordinate, unit, interpolation, tolerance, depth, and sizing math.
2. TSL graph snapshots for deterministic graph structure; these are supplementary, not proof that generated WGSL compiles or renders correctly.
3. Exact generated GLSL/WGSL inspection through public Three.js debug APIs, guarded to the installed Three.js revision when upstream source shape matters.
4. Real WebGL2 compile/link and WebGPU `getCompilationInfo()` validation, including a negative-control shader and uncaptured-error/device-loss assertions.
5. Deterministic backend pixel/interaction tests for visible behavior.
6. Frame/GPU timings for hot ubiquitous shaders or changes that add/remove render passes.

Raw WGSL/GLSL is an escape hatch, not the default. Use TSL for logic that must execute on WebGPU and keep a paired classic WebGL material while the public renderer remains WebGL. A raw WGSL specialization requires a measured bottleneck, a documented portability boundary, and the same validation layers.

**Why**: A graph snapshot can remain stable while generated source, validation, state, or pixels regress. The layers catch different failure classes and keep the inventory auditable.

### 11. Compose-based AO over `builtinAOContext` when MRT outputs are available

When the scene pass already produces a depth + normal MRT (as it must to feed GTAO inputs), the AO factor must be composited into the final image by multiplying the beauty color: `scenePassColor.mul(vec4(vec3(aoOutput.r), 1))`. Do not wire `scenePass.contextNode = builtinAOContext(...)` to re-render the scene with AO applied per-fragment.

**Why**: `builtinAOContext` requires a second scene rasterization (the depth/normal prepass plus the lit pass). Compose-based AO turns it into a single fullscreen multiply on the existing scene color attachment — saving an entire 4-MSAA scene render per frame. The math is identical (`scene_lit * ao_factor === scene_with_ao`); GTAO's own canonical example uses this pattern (`three/addons/tsl/display/GTAONode.js`).

CORRECT:

```typescript
const scenePass = pass(scene, camera);
scenePass.setMRT(mrt({ output, normal: directionToColor(normalView) }));
const scenePassColor = scenePass.getTextureNode('output');
const scenePassDepth = scenePass.getTextureNode('depth');
const aoOutput = ao(
  scenePassDepth,
  sample((uv) => colorToDirection(scenePass.getTextureNode('normal').sample(uv))),
  camera,
);
post.outputNode = scenePassColor.mul(vec4(vec3(aoOutput.getTextureNode().sample(screenUV).r), 1));
```

INCORRECT:

```typescript
const prePass = pass(scene, camera);
prePass.setMRT(mrt({ output: directionToColor(normalView) }));
const aoOutput = ao(prePass.getTextureNode('depth'), /* normals */, camera);
const scenePass = pass(scene, camera); // second scene rasterization
scenePass.contextNode = builtinAOContext(aoOutput.getTextureNode().sample(screenUV).r);
post.outputNode = scenePass;
```

### 12. Post owners restore authoritative depth directly before overlays

The priority-1 post owner must expose one retained direct-to-canvas depth restore to the priority-2 `SceneOverlay`. The overlay invokes that restore and renders its own scene exactly once. It must never traverse, mutate, clone, or replay the main scene.

- WebGL: retain the composer's stable depth texture in a `Pass`, then run one depth-only fullscreen draw to the default framebuffer.
- WebGPU: sample the active `PassNode` depth with a separate retained `QuadMesh`/`NodeMaterial`, targeting the canvas immediately before the overlay.
- Without post-processing: restoration is a no-op because the ordinary main render already owns canvas depth.

Do **not** use `RenderPipeline._quadMesh`: it is private and, in Three.js r184, writes the pipeline's internal target rather than the canvas depth attachment. Do **not** fall back to a scene clone-swap replay; that duplicates geometry work and reintroduces heterogeneous vertex-layout hazards.

**Why**: WebGPU canvas depth persists across frames (rule 2), while both post stacks render main color/depth offscreen. A direct bridge preserves exact clipping/depth output and costs one fullscreen depth write rather than a second scene rasterization. See `docs/research/webgpu-composite-quad-depth-write-non-functional.md` and `docs/research/threejs-shader-foundation-and-testing-blueprint.md`.

CORRECT (priority-2 overlay):

```typescript
useFrame(({ gl, camera }) => {
  const previousAutoClear = gl.autoClear;
  gl.autoClear = false;
  restoreDepth?.();
  gl.render(overlayScene, camera);
  gl.autoClear = previousAutoClear;
}, 2);
```

INCORRECT (composite-quad depth wiring — does not reach canvas depth in r184):

```typescript
const post = new RenderPipeline(gpuRenderer);
post.outputNode = scenePassColor.mul(vec4(vec3(ao.r), 1));
const compositeMaterial = (post as unknown as { _quadMesh?: { material: NodeMaterial } })._quadMesh?.material;
if (compositeMaterial !== undefined) {
  compositeMaterial.depthNode = scenePassDepth.sample(screenUV);
  compositeMaterial.depthWrite = true;
  compositeMaterial.depthTest = false;
  compositeMaterial.needsUpdate = true;
}
```

### 13. Warm `RenderPipeline` pipelines via `PassNode.compileAsync` in `useLayoutEffect`

After constructing the post pipeline (`new RenderPipeline(...)`, `post.outputNode = ...`, retained depth restore), schedule `await scenePass.compileAsync(renderer)` and warm the restore mesh inside the same `useLayoutEffect` (via an annotated `async-iife: bootstrap` so the layout-effect contract is preserved). Only publish `pipelineRef.current` once warmup resolves; the priority-1 `useFrame` skips on `pipelineRef.current === undefined`.

**Why**: The first call to `post.render()` triggers WGSL compilation and pipeline creation for every material in the scene — typically 10-100 ms of main-thread blocking. Since r184, `compileAsync` is genuinely non-blocking (issues `device.createRenderPipelineAsync` and awaits the GPU). Warming inside `useLayoutEffect` keeps the canvas empty for a sub-second beat (acceptable on initial mount, since geometry-loading flow already shows loading states) and eliminates the hitch on every subsequent route entry.

CORRECT:

```typescript
useLayoutEffect(() => {
  const scenePass = pass(scene, camera);
  // …MRT, AO, post.outputNode, retained direct-to-canvas depth restore…
  const cancellation = { cancelled: false };
  // async-iife: bootstrap — useLayoutEffect cannot be async; ref publish is gated on the flag.
  void (async () => {
    try {
      await scenePass.compileAsync(renderer);
    } catch (e) {
      console.error(e);
      return;
    }
    if (cancellation.cancelled) return;
    pipelineRef.current = { post, aoNode };
    invalidate();
  })();
  return () => {
    cancellation.cancelled = true;
    post.dispose();
    aoNode.dispose();
  };
}, [gl, scene, camera, invalidate]);
```

INCORRECT:

```typescript
useLayoutEffect(() => {
  // post built synchronously, first useFrame call blocks for 10-100ms compiling pipelines.
  pipelineRef.current = { post, aoNode };
}, [gl, scene, camera]);
```

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
- **`builtinAOContext` + dedicated prepass when a single MRT scenepass would suffice** (rule 11).
- **Relying on `RenderPipeline._quadMesh.material.depthNode` to populate canvas depth** (rule 12). Use the post owner's retained direct-to-canvas depth restore.
- **Traversing/cloning/swapping/replaying the main scene to recover post depth** (rules 1 and 12). Reuse the authoritative pass output.
- **First frame of a `RenderPipeline` blocking on synchronous pipeline compile** (rule 13).
- **`useTemporalFiltering = true` on a node-graph AO under `frameloop='demand'`** — accumulator never converges; the per-frame rotation produces shimmer instead of smoothing. Set `false` until either `frameloop='always'` or a true history-buffer TAA pass exists.

## Summary Checklist

Before merging a new TSL material or render-pipeline change:

- [ ] No `scene.overrideMaterial` or clone-swap scene replay; existing pass attachments are reused.
- [ ] Any `useFrame` with `gl.autoClear = false` explicitly sets `autoClearDepth` per pass intent.
- [ ] Reversed-Z renderers use `getClearDepth()` / `autoClearDepth` (no manual `clearDepth(1.0)`).
- [ ] Permutations expressed via `uniform()` branching, not separate material classes.
- [ ] **Line materials drawn into the viewport canvas use the persistent mesh + material pattern with imperative property mutation; hover/selection state never drives the material constructor.**
- [ ] Per-frame scalars computed in vertex or supplied as CPU uniforms.
- [ ] Reusable `Fn` bodies use unnamed `.toVar()`.
- [ ] Material lifecycle flags (`transparent`, `depthWrite`, `colorWrite`) match the pass intent table.
- [ ] **Pipeline budget is bounded by `(mesh count × material count)` knowable at mount time; no user-driven state path recreates meshes or materials.**
- [ ] Every custom shader site is registered in `shader-policy.ts`; each declared risk names evidence.
- [ ] New `NodeMaterial` factory has a graph snapshot plus generated-source/compile/pixel evidence proportional to risk.
- [ ] `RenderPipeline` instances have single React-owned lifecycle.
- [ ] AO composes via `scenePassColor.mul(vec4(vec3(aoOutput.r), 1))`, not `builtinAOContext` + dedicated prepass.
- [ ] Overlay depth comes from the active post owner's retained direct-to-canvas restore; the main scene is not replayed.
- [ ] First-frame pipeline compile is warmed via `scenePass.compileAsync(renderer)` or `gl.compileAsync(group, camera)` in `useLayoutEffect`, including for line-material persistent groups.

## References

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
