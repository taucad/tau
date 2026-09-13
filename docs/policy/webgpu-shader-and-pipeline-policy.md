---
title: 'WebGPU Shader and Pipeline Policy'
description: 'Rules for authoring WGSL/TSL materials and managing render-pipeline ownership under three.js WebGPURenderer'
status: active
created: '2026-05-15'
updated: '2026-05-16'
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
---

# WebGPU Shader and Pipeline Policy

Internal reference for authoring WGSL/TSL shaders and managing render-pipeline ownership under three.js `WebGPURenderer` in `apps/ui`.

## Rationale

WebGPU validation is strict where WebGL is permissive: pipelines bind vertex-buffer slots by exact layout, depth attachments persist across frames, and the swapchain only re-acquires the color texture each frame. Naive patterns inherited from the WebGL era (`scene.overrideMaterial`, `gl.autoClear = false` without explicit depth clears, GLSL-flavoured uniform branching) silently corrupt rendering on the WebGPU path or fail the WGSL uniformity analyser. This policy codifies the rules we've learned the hard way so the next material author doesn't.

## Rules

### 1. Never use `scene.overrideMaterial` under WebGPU

Avoid `scene.overrideMaterial` for any pass that needs to run across more than one mesh type (Mesh + Line2 + InstancedMesh + Sprite + section caps). Use a per-mesh material swap via `scene.traverse()` with per-source-material cached clones whose `colorWrite`, `transparent`, `depthWrite`, and `depthTest` are explicitly set for the pass's intent.

**Why**: Under WebGPU, `scene.overrideMaterial` shares a single material across diverse geometry attribute layouts. Three.js's `RenderObject.getAttributes()` silently `continue`s on missing geometry attributes, so the compiled pipeline can declare vertex-buffer slots the at-draw-time binding never satisfies — triggering `Vertex buffer slot N required by [RenderPipeline] was not set` validation errors. See three.js issues [#28927](https://github.com/mrdoob/three.js/issues/28927) and [#30398](https://github.com/mrdoob/three.js/issues/30398).

**Enforced by**: `tau-lint/no-scene-override-material` (error).

CORRECT:

```typescript
const cloneByMaterial = new WeakMap<THREE.Material, THREE.Material>();
const getDepthOnlyClone = (source: THREE.Material): THREE.Material => {
  const cached = cloneByMaterial.get(source);
  if (cached !== undefined) {
    return cached;
  }
  const clone = source.clone();
  clone.colorWrite = false;
  clone.transparent = false;
  clone.depthWrite = true;
  clone.depthTest = true;
  source.addEventListener('dispose', () => {
    clone.dispose();
    cloneByMaterial.delete(source);
  });
  cloneByMaterial.set(source, clone);
  return clone;
};

const swaps: Array<{ object: THREE.Mesh; material: THREE.Material }> = [];
scene.traverse((object) => {
  if (!(object as THREE.Mesh).isMesh) {
    return;
  }
  const mesh = object as THREE.Mesh;
  swaps.push({ object: mesh, material: mesh.material as THREE.Material });
  mesh.material = getDepthOnlyClone(mesh.material as THREE.Material);
});
gl.render(scene, camera);
for (const { object, material } of swaps) {
  object.material = material;
}
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

**Edge-merge addendum (mandatory).** Edge-overlay line materials produced by the runtime (kernel-emitted `LINES` primitives — replicad `meshEdges`, dihedral edge detection, future kernel edge paths) must be merged into a **single** `LineSegments2` per backend before the GLTF bytes reach the UI. The merge runs in `packages/runtime/src/middleware/gltf-edge-detection.middleware.ts` via `mergeGltfLineSegments` (`packages/runtime/src/utils/merge-gltf-edges.ts`); world matrices are baked into the merged positions so the consolidated node sits at the scene root with identity transform. The UI fat-line conversion (`apps/ui/app/components/geometry/graphics/three/materials/gltf-edges.ts`) then wraps the single source `LineSegments` into one `LineSegments2` with one shared `Line2NodeMaterial` instance, yielding exactly one pipeline + one draw call per loaded model regardless of part count. Allocating one material-per-source-primitive on the UI side is forbidden: it produces one `createRenderPipelineAsync` per part of a CAD assembly under cold cache (the "disabling edge rendering for large models" lag documented in `docs/research/gltf-edges-fat-line-performance.md`). On the WebGL path, the shared `LineMaterial` also pins a stable `customProgramCacheKey` so three's `WebGLPrograms` collapses the GLSL program cache across viewport + screenshot renderers.

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

| Pass intent              | `transparent` | `depthWrite` | `depthTest` | `colorWrite` |
| ------------------------ | ------------- | ------------ | ----------- | ------------ |
| Opaque shaded surface    | `false`       | `true`       | `true`      | `true`       |
| Transparent overlay      | `true`        | `false`      | `true`      | `true`       |
| Depth-only prepass clone | `false`       | `true`       | `true`      | `false`      |
| Compositing fullscreen   | `false`       | `false`      | `false`     | `true`       |

**Why**: `transparent = true` defers the draw to the transparent pass with depth-write off, even if `depthWrite = true` is set, because three.js's `renderObject` sorting respects `transparent` first. A depth-only prepass clone marked `transparent = true` will silently fail to write the depth attachment.

### 8. Pipeline cache keys include geometry signature — assume per-mesh recompiles

WebGPU pipelines are cached by `(stageVertex.id, stageFragment.id, backend.getRenderCacheKey(renderObject))` where the backend key includes the geometry's attribute layout (`renderObject.getGeometryCacheKey()`). When a material is applied to N meshes with M distinct attribute signatures, expect M compiled pipelines per material.

**Why**: Plan capacity. Hot-swapping geometry attribute layouts (e.g. toggling vertex colors, instancing) invalidates pipeline cache entries. Authors building libraries of materials applied across diverse geometries should budget for the worst case and consider pipeline warmup (`renderer.compileAsync`).

**Persistent-instance bound.** When the persistent mesh + material pattern from rule 4 is in force, the pipeline budget is bounded to `(mesh count × material count)` and is **knowable at mount time** — for example, the scene `AxesHelper` warms exactly six pipelines (three axes × two halves) once on mount, none of which recompile during hover. Any architecture that recreates meshes or materials on user-driven state changes breaks this bound and re-introduces the 10-100 ms compile hitch documented in rule 4. Pair the bound with rule 13 (`compileAsync` warmup) so the bounded set is also paid off the critical path.

### 9. Long-lived render pipelines must be owned by a single component

A `THREE.RenderPipeline` (TSL post-processing) created outside React's lifecycle must be disposed when its owning component unmounts. Never share a `RenderPipeline` instance across React subtrees; route pipeline reads through React state and reconstruct on backend or topology change.

**Why**: `RenderPipeline.dispose()` releases internal render targets and the fullscreen `QuadMesh`. Leaked pipelines accumulate GPU memory on hot-reload and during route transitions. See `apps/ui/app/components/geometry/graphics/three/post-processing-webgpu.tsx` for the canonical ownership pattern.

### 10. Snapshot every new `NodeMaterial` factory

Every new TSL material factory must ship a `// @vitest-environment node` test that snapshots its shader graph via `serialiseStrippedTslGraph(material.toJSON())` into a co-located `__shader-snapshots__/` directory.

**Why**: Drift in TSL graph structure (uniform renames, ordering, branch elision) is invisible until it manifests as a visual regression at runtime. Snapshots gate every PR. See `docs/policy/graphics-backend-policy.md` §4.

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

### 12. Overlay scenes own their own depth pre-pass; do **not** rely on `RenderPipeline._quadMesh.material.depthNode` for canvas depth

Overlay scenes that must depth-test against main-scene geometry on WebGPU (the priority-2 `SceneOverlay`: grid, axes, future overlays) **must explicitly render a depth pre-pass into the canvas depth attachment before compositing**. Use the rule 1 `scene.traverse` + per-source-material cached `colorWrite=false` clone-swap pattern, then `gl.render(overlayScene, camera)`, all under `gl.autoClear = false`. The canonical implementation lives in `apps/ui/app/components/geometry/graphics/three/scene-overlay.tsx`.

Do **not** attempt to populate the canvas depth attachment by wiring the post `RenderPipeline`'s composite quad — i.e. `post._quadMesh.material.depthNode = scenePassDepth.sample(screenUV)` — as a depth-only side effect. In three.js r184 the composite quad runs against the `RenderPipeline`'s **internal** render target, not the swap-chain depth attachment subsequent `gl.render(overlayScene, camera)` calls read. The depth output is silently discarded for canvas-depth purposes and downstream overlays depth-test against stale / uninitialised values.

**Why**: WebGPU's canvas depth attachment is a persistent texture (rule 2). Without an explicit producer, downstream `useFrame` subscribers see stale or empty depth and fail the reversed-Z `GREATER` compare. The composite-quad shortcut looks like it should work — the quad writes colour to the canvas, so why not depth? — but three.js's `RenderPipeline` does not route the quad's depth output to the canvas attachment. See `docs/research/webgpu-composite-quad-depth-write-non-functional.md` for the r184 code-path evidence and `docs/research/webgpu-override-material-vertex-binding-failure.md` (Resolution postscript) for the zoom-dependent grid-disappearance symptom that surfaced the failure mode.

CORRECT (priority-2 SceneOverlay frame loop):

```typescript
useFrame((state) => {
  const { gl, scene, camera } = state;
  const previousAutoClear = gl.autoClear;
  gl.autoClear = false;

  const swaps: Array<{ object: Renderable; material: THREE.Material | THREE.Material[] }> = [];
  scene.traverse((object) => {
    if (!isRenderable(object)) return;
    swaps.push({ object, material: object.material });
    object.material = Array.isArray(object.material)
      ? object.material.map(getDepthOnlyClone)
      : getDepthOnlyClone(object.material);
  });
  gl.render(scene, camera);
  for (const { object, material } of swaps) object.material = material;

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

After constructing the post pipeline (`new RenderPipeline(...)`, `post.outputNode = ...`, depth wiring), schedule `await scenePass.compileAsync(renderer)` inside the same `useLayoutEffect` (via an annotated `async-iife: bootstrap` so the layout-effect contract is preserved). Only publish `pipelineRef.current` once the warmup resolves; the priority-1 `useFrame` skips on `pipelineRef.current === undefined`.

**Why**: The first call to `post.render()` triggers WGSL compilation and pipeline creation for every material in the scene — typically 10-100 ms of main-thread blocking. Since r184, `compileAsync` is genuinely non-blocking (issues `device.createRenderPipelineAsync` and awaits the GPU). Warming inside `useLayoutEffect` keeps the canvas empty for a sub-second beat (acceptable on initial mount, since geometry-loading flow already shows loading states) and eliminates the hitch on every subsequent route entry.

CORRECT:

```typescript
useLayoutEffect(() => {
  const scenePass = pass(scene, camera);
  // …MRT, AO, post.outputNode, composite-quad depthNode…
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
- **Setting `transparent = true` on a depth-only prepass clone** (rule 7).
- **Sharing a `RenderPipeline` across multiple React components** (rule 9).
- **`builtinAOContext` + dedicated prepass when a single MRT scenepass would suffice** (rule 11).
- **Relying on `RenderPipeline._quadMesh.material.depthNode` to populate the canvas depth attachment** (rule 12). Use an explicit depth pre-pass inside the overlay frame loop.
- **First frame of a `RenderPipeline` blocking on synchronous pipeline compile** (rule 13).
- **`useTemporalFiltering = true` on a node-graph AO under `frameloop='demand'`** — accumulator never converges; the per-frame rotation produces shimmer instead of smoothing. Set `false` until either `frameloop='always'` or a true history-buffer TAA pass exists.

## Summary Checklist

Before merging a new TSL material or render-pipeline change:

- [ ] No `scene.overrideMaterial` introduced; cross-mesh-type passes use cached per-material clones.
- [ ] Any `useFrame` with `gl.autoClear = false` explicitly sets `autoClearDepth` per pass intent.
- [ ] Reversed-Z renderers use `getClearDepth()` / `autoClearDepth` (no manual `clearDepth(1.0)`).
- [ ] Permutations expressed via `uniform()` branching, not separate material classes.
- [ ] **Line materials drawn into the viewport canvas use the persistent mesh + material pattern with imperative property mutation; hover/selection state never drives the material constructor.**
- [ ] Per-frame scalars computed in vertex or supplied as CPU uniforms.
- [ ] Reusable `Fn` bodies use unnamed `.toVar()`.
- [ ] Material lifecycle flags (`transparent`, `depthWrite`, `colorWrite`) match the pass intent table.
- [ ] **Pipeline budget is bounded by `(mesh count × material count)` knowable at mount time; no user-driven state path recreates meshes or materials.**
- [ ] New `NodeMaterial` factory has a `__shader-snapshots__/` snapshot test.
- [ ] `RenderPipeline` instances have single React-owned lifecycle.
- [ ] AO composes via `scenePassColor.mul(vec4(vec3(aoOutput.r), 1))`, not `builtinAOContext` + dedicated prepass.
- [ ] Overlay scenes that need to depth-test against main-scene geometry run an explicit `scene.traverse` + cached `colorWrite=false` clone-swap depth pre-pass before compositing; **no** reliance on `RenderPipeline._quadMesh.material.depthNode` for canvas-depth bridging.
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
