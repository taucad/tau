---
title: 'Graphics Backend Policy'
description: 'Dual WebGL/WebGPU Three.js rendering, portable shaders, resource ownership, interaction, and backend evidence'
status: active
created: '2026-05-07'
updated: '2026-09-27'
related:
  - docs/policy/compatibility-policy.md
  - docs/research/viewer-webgpu-selector-removal.md
  - docs/research/webgpu-migration-graphics-stack.md
  - docs/research/screenshot-viewport-shared-material-state-bleed.md
  - docs/research/webgpu-gltf-edge-near-orthographic-occlusion.md
  - docs/policy/webgpu-rendering-pipeline.md
  - docs/research/threejs-shader-foundation-and-testing-blueprint.md
  - docs/research/viewer-section-view-performance.md
---

# Graphics Backend Policy

Tau maintains WebGL and WebGPU Three.js paths in `apps/ui`. WebGL is the public interactive baseline; WebGPU is an internal validation path until a separate readiness decision changes that status.

## Rules

### 1. Resolve the backend once

Consume `resolvedGraphicsBackend` from `apps/ui/app/components/geometry/graphics/graphics-backend.ts`. Normalize persisted public settings to WebGL. The internal `?graphicsBackend=` override is for manual and e2e evidence, not a public selector.

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

Do not patch `Mesh.prototype.raycast`. Transform-control picking may use the stock raycaster only on its own gizmo subtree.

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

## Ownership

- Backend resolution: `apps/ui/app/components/geometry/graphics/graphics-backend.ts`
- Canvas lifecycle: `apps/ui/app/components/geometry/graphics/three/three-context.tsx`
- Renderer presets: `apps/ui/app/components/geometry/graphics/three/renderer.ts`
- Transparent ordering: `apps/ui/app/components/geometry/graphics/three/reversed-depth-transparent-sort.ts`
- Materials: `apps/ui/app/components/geometry/graphics/three/materials`
- Picking and scheduling: `apps/ui/app/components/geometry/graphics/three/utils`
- Graphics state: `apps/ui/app/machines/graphics.machine.ts`
