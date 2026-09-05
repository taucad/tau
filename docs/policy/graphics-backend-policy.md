---
title: 'Graphics Backend Policy'
description: 'Dual WebGL/WebGPU Three.js rendering, portable shaders, resource ownership, interaction, and backend evidence'
status: active
created: '2026-05-07'
updated: '2026-09-05'
related:
  - docs/policy/compatibility-policy.md
  - docs/research/viewer-webgpu-selector-removal.md
  - docs/research/webgpu-migration-graphics-stack.md
  - docs/research/screenshot-viewport-shared-material-state-bleed.md
  - docs/research/webgpu-gltf-edge-near-orthographic-occlusion.md
  - docs/policy/webgpu-rendering-pipeline.md
  - docs/research/threejs-shader-foundation-and-testing-blueprint.md
---

# Graphics Backend Policy

Tau maintains WebGL and WebGPU Three.js paths in `apps/ui`. WebGL is the public interactive baseline; WebGPU is an internal validation path until a separate readiness decision changes that status.

## Rules

### 1. Resolve the backend once

Consume `resolvedGraphicsBackend` from `apps/ui/app/components/geometry/graphics/graphics-backend.ts`. Normalize persisted public settings to WebGL. The internal `?graphicsBackend=` override is for manual and e2e evidence, not a public selector.

Key `ThreeCanvasInstance` by backend as `ThreeProvider` does. A backend switch must recreate renderer-owned state rather than reusing an incompatible canvas, material graph, controls instance, or post-processing pipeline.

### 2. Create renderers through the shared factory

Use `createRenderer` in `graphics/three/renderer.ts`. The `viewport` preset owns interactive MSAA and backend depth/post-processing choices; `offscreen` owns bitmap-transfer choices. Await `WebGPURenderer.init()` before use, and call WebGL-only methods only after narrowing the renderer.

Do not instantiate a renderer in a consumer unless that file is an established shared factory with an explicit use case.

### 3. Maintain portable shader paths

Viewport-visible custom materials require a TSL/NodeMaterial WebGPU path alongside any WebGL GLSL material still in service. Keep one semantic parameter contract across both implementations.

Inside a reusable `Fn`, call `.toVar()` without an explicit name; an immediately invoked one-use `Fn(...)()` may use a name. Reused declaration names collide when TSL inlines the function.

Custom WebGL `ShaderMaterial` output must apply the same color-management transform as built-in materials. Do not calibrate source colors against a known broken color or blend path.

### 4. Declare transparency and depth behavior explicitly

When opacity is below one, set `transparent: true` on both backends. Library wrappers such as Drei lines do not supply a portable default.

Highlights, ghosts, labels, contours, gizmos, and other overlays must state `depthTest` and `depthWrite` deliberately. Preserve opaque focused-surface depth writes; dimmed/ghost surfaces and overlay outlines must not occlude later geometry unless their contract explicitly requires it.

Tau's transparent `Line2NodeMaterial` owns the sRGB-space blend correction for fat-line overlays. Do not substitute the stock WebGPU line material for those consumers or apply that correction to opaque edge materials.

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

Shader graph snapshots and source fingerprints are supplementary. Pair them with focused runtime assertions. For user-visible parity, use the backend e2e harness and remote-canvas screenshots with deterministic pixel characteristics.

Test backend construction, WebGPU initialization, reversed-depth transparent ordering, alpha/depth state, clone ownership, cross-renderer material isolation, demand-frame invalidation, cache eviction, clipping-aware picking, and gesture cancellation.

## Ownership

- Backend resolution: `apps/ui/app/components/geometry/graphics/graphics-backend.ts`
- Canvas lifecycle: `apps/ui/app/components/geometry/graphics/three/three-context.tsx`
- Renderer presets: `apps/ui/app/components/geometry/graphics/three/renderer.ts`
- Transparent ordering: `apps/ui/app/components/geometry/graphics/three/reversed-depth-transparent-sort.ts`
- Materials: `apps/ui/app/components/geometry/graphics/three/materials`
- Picking and scheduling: `apps/ui/app/components/geometry/graphics/three/utils`
- Graphics state: `apps/ui/app/machines/graphics.machine.ts`
