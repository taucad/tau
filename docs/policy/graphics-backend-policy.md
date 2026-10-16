---
title: 'Graphics Backend Policy'
description: 'Dual WebGL/WebGPU Three.js rendering, portable shaders, resource ownership, interaction, backend evidence, and kernel mesh resolution'
status: active
created: '2026-05-07'
updated: '2026-10-16'
related:
  - docs/policy/compatibility-policy.md
  - docs/research/viewer-webgpu-selector-removal.md
  - docs/research/webgpu-migration-graphics-stack.md
  - docs/research/screenshot-viewport-shared-material-state-bleed.md
  - docs/research/webgpu-gltf-edge-near-orthographic-occlusion.md
  - docs/policy/webgpu-rendering-pipeline.md
  - docs/research/threejs-shader-foundation-and-testing-blueprint.md
  - docs/research/viewer-section-view-performance.md
  - docs/research/kernel-tessellation-policy-blueprint.md
---

# Graphics Backend Policy

Tau maintains WebGL and WebGPU Three.js paths in `apps/ui`. WebGL is the default interactive baseline. The default-off `webGpu` feature flag enables experimental WebGPU viewers when an adapter is available; this opt-in does not establish default-backend readiness.

Rules 15 to 17 govern the meshes kernels hand the viewer, captures and exports: how their resolution is named, bounded and reported. The [kernel tessellation blueprint](../research/kernel-tessellation-policy-blueprint.md) holds the rulings (R1, R2) and the measurements behind them.

## Rules

### 1. Resolve the backend once

Resolve interactive viewers through `resolveViewerGraphicsBackend` in `apps/ui/app/utils/graphics-backend-override.ts`: the `webGpu` feature flag requests WebGPU only when an adapter is available, otherwise WebGL. Keep persisted per-view preferences normalized to WebGL; the experimental flag is the public opt-in. The internal `?graphicsBackend=` override takes precedence for manual and e2e evidence.

Key `ThreeCanvasInstance` by backend as `ThreeProvider` does. A backend switch must recreate renderer-owned state rather than reusing an incompatible canvas, material graph, controls instance, or post-processing pipeline.

### 2. Create renderers through the shared factory

Use `createRenderer` in `graphics/three/renderer.ts`. The `viewport` preset owns interactive MSAA and backend depth/post-processing choices; `offscreen` owns bitmap-transfer choices; `showcase` owns brand surfaces built on TSL node materials (the metal morph loader), always returning Three's node renderer so one graph serves WebGPU and its WebGL 2 backend. Await `WebGPURenderer.init()` before use, and call WebGL-only methods only after narrowing the renderer.

A showcase surface is not an interactive viewer: it may prefer WebGPU when an adapter exists because Three falls back to the WebGL 2 backend on its own, and it must pause while offscreen, hidden, or under reduced motion. It scales its own cost to the device: tessellation, post-processing, thin-film shading and frame rate follow a quality tier, and a frame-time governor steps pixel ratio, bloom and frame rate down under load.

The glass prism loader is the second showcase surface and shares the engine: the frame loop and governor (`showcase-frame-loop.ts`), the bloom and capture pipelines (`showcase-post.ts`, `showcase-capture.ts`), the studio prefilter, the radial morph sampler and the React lifecycle (`showcase-loader.tsx`). What it adds is a light sheet: the beam is ray-traced on the CPU through the body's cross-section each frame (`glass-prism-light-field.ts`, pure and unit-tested) and drawn as ribbons the GPU never has to trace. The body is image-based glass, transparent and premultiplied, so the page shows through it; on a dark page the traced light is added, on a light page it is printed, because light added to white is invisible. A new showcase surface reuses these modules rather than growing a loop, a governor or a capture path of its own.

Inline spinners do not each get a renderer. A browser allows a page sixteen live WebGL 2 contexts and evicts the oldest without warning, and every spinner draws the same animation, so one page-level service owns a single inline-tier controller and copies each frame it draws into the plain 2D canvas each spinner holds (`metal-morph-spinner-service.ts`, `MetalMorphSpinner`). A product surface mounts `MetalMorphSpinner`, never a dedicated loader per row; `MetalMorphLoader` stays for a surface large enough to justify its own context, such as the showcase stage. The service holds the same playback gates as a dedicated loader and releases its renderer once the page has gone without spinners. It reads the renderer's drawing buffer once per frame into a 2D snapshot and fans that out, so the GPU surface is read once however many spinners there are; a paint that throws costs only that canvas its frame, never the others; and its diagnostics count the spinners that missed the latest frame, which a showcase or a test reads as the unison invariant.

Do not instantiate a renderer in a consumer unless that file is an established shared factory with an explicit use case.

### 3. Maintain portable shader paths

Viewport-visible custom materials require a TSL/NodeMaterial WebGPU path alongside any WebGL GLSL material still in service. Keep one semantic parameter contract across both implementations.

Inside a reusable `Fn`, call `.toVar()` without an explicit name; an immediately invoked one-use `Fn(...)()` may use a name. Reused declaration names collide when TSL inlines the function.

Custom WebGL `ShaderMaterial` output must apply the same color-management transform as built-in materials. Do not calibrate source colors against a known broken color or blend path.

### 4. Declare transparency and depth behavior explicitly

When opacity is below one, set `transparent: true` on both backends. Library wrappers such as Drei lines do not supply a portable default.

Highlights, ghosts, labels, contours, gizmos, and other overlays must state `depthTest` and `depthWrite` deliberately. Preserve opaque focused-surface depth writes; dimmed/ghost surfaces and overlay outlines must not occlude later geometry unless their contract explicitly requires it.

Overlays must display identically on both backends. The WebGL canvas is premultiplied, like WebGPU's; a straight-alpha canvas darkens every fractional-alpha pixel. WebGPU blends in a linear half-float frame target, so Tau's transparent `Line2NodeMaterial` and the WebGPU infinite grid composite themselves in sRGB space against a viewport copy (`compositeOverViewportSrgb`) and draw with `NoBlending`. Such a composite overwrites the target, so it must discard uncovered fragments, and fat lines carry analytic edge coverage instead of alpha-to-coverage, whose dropped samples WebGPU resolves in linear space. Do not substitute the stock WebGPU line material for those consumers or apply that correction to opaque edge materials.

### 5. Preserve depth ordering

The WebGPU viewport enables reversed depth. Register `reversedDepthTransparentSort` so transparent objects remain back-to-front under reversed clip-space Z.

GLTF lines retain their geometric depth. Resolve coplanar separation on the owning triangle material with bounded polygon offset; never pull a line toward the camera in view, clip, or depth space.

### 6. Separate base capability from exact diagnostics

Synchronous render decisions may use manifest and broad-phase capability data. Exact section intersections and overlap diagnostics remain asynchronous and may refine diagnostic output. Do not block ordinary rendering on exact analysis or present a broad-phase candidate as an exact result.

### 7. Preserve one viewport lifecycle

Keep one camera, controls, gizmo, and renderer lifecycle per canvas. Camera replacement, fit-to-view, controls listeners, and gizmo synchronization must use the owning graphics state and clean up the prior instance.

Interactive viewers use `frameloop="demand"`. Call `invalidate()` after every visible user-state change and while damping or animation still needs frames.

### 8. Treat cloned render state as explicit ownership

`scene.clone()` is shallow for materials. Clone-and-render code may dispose only resources it allocated. Allocators return an explicit material set; teardown passes that set to the current disposal helper. Never infer ownership by traversing `isMesh`, because line objects can share live viewport materials.

A TSL graph or `onBeforeCompile` material that depends on renderer flags must not be shared between renderers with different reversed-depth, log-depth, sample-count, or output-color-space settings. Allocate a fresh secondary-renderer material.

### 9. Bound geometry and material caches

Factory-produced derived geometry uses a bounded module-scope LRU keyed by stable parameters. Eviction disposes the entry; callers treat returned geometry as non-owned and immutable.

Resources allocated with `useMemo` require matching effect cleanup. Dispose only resources marked as internally owned; never dispose caller-supplied resources.

### 10. Keep picking local and clipping-aware

Route pointer-rate model picking through `raycastFirstVisibleMeshHit` in `graphics/three/utils/bvh-raycast.ts`. Pass the active clipping state so a clipped first triangle cannot hide a farther visible hit.

Do not patch `Mesh.prototype.raycast`. Section handles and the plane picker may use the stock raycaster only on their own subtrees.

Coalesce high-frequency pointer work through `createRafCoalescer`, with the latest event winning once per animation frame.

### 11. Model gesture state explicitly

Send measurement and overlay pointer events to their owning XState machine. Use `graphics.machine`'s `cameraInteracting`, driven by OrbitControls `start` and `end`, to discard camera drags. Do not infer orbiting from camera position or quaternion deltas.

### 12. Validate behavior, not only graph shape

Shader graph snapshots and source fingerprints are supplementary. Pair them with focused runtime assertions. For user-visible parity, use the backend e2e harness and remote-canvas screenshots with deterministic pixel characteristics. Where a headless adapter cannot present frames, read an offscreen render target back through the renderer so the backend still yields pixel evidence; keep presented-canvas screenshots wherever the canvas does present.

Test backend construction, WebGPU initialization, reversed-depth transparent ordering, alpha/depth state, clone ownership, cross-renderer material isolation, demand-frame invalidation, cache eviction, clipping-aware picking, and gesture cancellation.

### 13. Change pointer-rate scene objects in place

Pointer-rate updates change existing scene objects in place. A drag, scrub or hover step writes positions, draw ranges and uniforms into the materials, textures and geometry already in the scene, and rebuilds an object only when its structure changes, such as a handle's kind or selection. It never rebuilds and disposes materials, textures or geometry per step: three r184 `WebGLPrograms.releaseProgram` deletes a program when its last material is disposed, so the next frame links it again, and new textures and geometry upload again. Building the replacement before disposing the old one does not help, because a material takes its program only at its first render. When a transparent object's geometry is written in place, park vertices past its draw range inside the drawn shape: three sorts transparent objects by their bounding-sphere centre.

The one exception is a reused fat line that must grow. WebGL caps an instanced geometry's draws at the instance count its buffer held at its first draw until the geometry is disposed, so a `LineSegmentsGeometry` that must grow past its first-draw segment count is recreated. While its segments fit, it is written in place.

### 14. Return early from unchanged per-frame work

Per-frame work returns early when its inputs are unchanged. A `useFrame` callback or render-loop task derives a key from everything that changes its output, including a result that lands later such as a worker response, and does nothing while the key matches the last one it applied. Key a plane, matrix or other object that changes in place by its values, not its identity. A demand frame loop still renders for orbit, damping and every other `invalidate()`, so per-frame work without a key repeats on each of those frames.

### 15. Name mesh resolution with one tessellation vocabulary

A kernel view or export option `tessellation` is a quality preset or the kernel's explicit object, never both (ruling R1). The TypeScript type is the union, the Zod schema is a union of the preset enum and a strict object, and the JSON Schema is a `oneOf`; a value carrying a preset and a tolerance together is a type error and a `VALIDATION_ERROR` naming both forms. The OCCT kernels (replicad, opencascade, build123d) share `occtTessellationSchema` in `@taucad/occt-core`.

| Preset       | Linear tolerance (D = bounding-box diagonal) | Angular tolerance | Use                                                       |
| ------------ | -------------------------------------------- | ----------------- | --------------------------------------------------------- |
| `low`        | D / 500                                      | 30°               | First look, thumbnails, large assemblies                  |
| `medium`     | D / 2000                                     | 20°               | Viewer preview, `evaluate_model` and `screenshot` default |
| `high`       | D / 8000                                     | 12°               | `export_model` default, GeoSpec evidence                  |
| `extra-high` | D / 32000                                    | 6°                | Explicit request only                                     |

Preset linear tolerances are clamped to 0.001–50 mm. The explicit object is absolute: `linearTolerance` is millimetres and `angularTolerance` degrees in every kernel, and OCCT always meshes in absolute mode, so a plugin that needs another representation converts inside itself. An explicit object that omits a field takes the kernel's absolute default for it (0.02 mm and 20° to view, 0.01 mm and 20° to export).

Precedence replaces and never merges: a per-call option wins whole over the stored viewer record, which wins whole over the kernel default. No level combines its fields with another level's, and an explicit object never rides beside a preset. Model-declared hints are not implemented; until they are, models keep tessellation out of their parameters.

The kernel-settings pane renders such a union as two modes, Preset (one segmented control of the presets) and Custom (the explicit fields in their `x-tau-unit` units). Switching modes replaces the stored value; it carries nothing across.

**Why**: agents and people need a one-word choice that means the same in every kernel, manufacturing exports need exact values, and a merged form would have two sources of truth.

CORRECT (`options` on `evaluate_model`, `screenshot` or `export_model`):

```text
{ "tessellation": "low" }
{ "tessellation": { "linearTolerance": 0.01, "angularTolerance": 12 } }
```

INCORRECT (a `VALIDATION_ERROR`):

```json
{ "tessellation": { "quality": "high", "linearTolerance": 0.01 } }
```

### 16. Bound mesh cost by lane and report what was delivered

| Lane                          | Triangle budget | Over budget                                                                                                                                                   |
| ----------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preview and capture (renders) | 2,000,000       | OCCT kernels re-mesh one step coarser (linear × 2, angular + 4°) up to three times and warn `TESSELLATION_DOWNGRADED` with requested and effective tolerances |
| Export                        | 20,000,000      | Refuse with `RESOURCE_LIMIT` and suggested explicit tolerances; never coarsen a print mesh silently                                                           |

Every render reports its effective resolution on the result's `tessellation`: triangles, vertices and elapsed time; tolerance-meshed kernels add the requested form, the effective `linearTolerance` and `angularTolerance` and the downgrade steps; voxel kernels add `voxelSize`, `activeVoxels` and `memoryBytes`. A kernel that changes mesh output reports it here.

**Why**: the viewer's edge detection, BVH and GPU upload all scale with triangles, so an unbounded preview stalls the session, while a silently coarsened export is a manufacturing defect.

### 17. Keep a voxel model's grid; simplify only its picture

In voxel kernels (PicoVoxel, PicoGK) the voxel size is the model (ruling R2). No lane of the harness changes `voxelSize`; it is a model parameter, never a tessellation option, and iteration goes through per-call `parameters`. Choose it from the thinnest feature, about one third of the thinnest wall or strut: field evaluation time scales with 1/h³, and memory and triangles with 1/h².

A voxel render over the 2,000,000-triangle preview budget is delivered through the `displaySimplification` middleware: meshoptimizer simplification with crease vertices locked and a maximum deviation of half a voxel (0.5 × `voxelSize`), reported as `DISPLAY_SIMPLIFIED` with the triangle counts before and after. Simplification touches preview and capture artifacts only; exports and GeoSpec subjects keep their exact bytes. A voxel report without `voxelSize` is not simplified, because the bound is unknown; PicoGK previews are in that case today.

**Why**: coarsening the grid changes the part (thin walls vanish, volumes move, tests flip), while a simplified display mesh changes only the picture, within half a voxel.

## Ownership

- Backend resolution: `packages/viewer/src/graphics/graphics-backend.ts`
- Canvas lifecycle: `packages/viewer/src/graphics/three/three-context.tsx`
- Renderer presets: `packages/viewer/src/graphics/three/renderer.ts`
- Transparent ordering: `packages/viewer/src/graphics/three/reversed-depth-transparent-sort.ts`
- Materials: `packages/viewer/src/graphics/three/materials`
- Picking and scheduling: `packages/viewer/src/graphics/three/utils`
- Graphics state: `packages/viewer/src/machines/graphics.machine.ts`
- Tessellation vocabulary, presets and budgets: `packages/core/occt/src/occt-schemas.ts`, `packages/core/occt/src/occt-tessellation.ts`
- Kernel-settings pane: `packages/viewer/src/cad/kernel-settings.tsx`
- Voxel display simplification: `packages/plugins/middleware/src/display-simplification.middleware.ts`
- Tessellation report on `evaluate_model`: `libs/chat/src/schemas/tools/evaluate-model.tool.schema.ts`
