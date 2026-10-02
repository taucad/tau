---
title: 'Graphics Backend Policy'
description: 'Dual WebGL/WebGPU Three.js stacks, TSL materials, snapshots, and e2e parity'
status: active
created: '2026-05-07'
updated: '2026-05-27'
related:
  - docs/research/webgpu-migration-graphics-stack.md
  - docs/research/screenshot-viewport-shared-material-state-bleed.md
  - docs/policy/webgpu-rendering-pipeline.md
---

# Graphics Backend Policy

Internal reference for how Tau ships and validates the WebGL/WebGPU rendering stack in `apps/ui` (R3F + Three.js r18x).

## Rationale

Users need predictable CAD rendering across browsers while moving the default toward WebGPU. Without policy, shaders drift silently (GLSL-only paths, missing snapshots, uncaught backend assumptions) and regressions slip past unit tests.

## Rules

### 1. Consume `resolvedGraphicsBackend`, never hardcode paths

Interactive viewers must derive behavior from **`resolvedGraphicsBackend`**: **`'webgl' | 'webgpu'`**, after merging persisted preference, GPU probe, and optional **`?graphicsBackend=`** URL override (**`apps/ui/app/components/geometry/graphics/graphics-backend.ts`**). Avoid scattering raw **`new WebGLRenderer()`** calls except inside **`createTauRenderer`** (**`apps/ui/app/components/geometry/graphics/three/tau-renderer.ts`**) and other shared factories (`createTauR3fGlProp`, gizmo/`SharedRenderer` helpers) that already branch by backend + use-case.

**Why**: Duplicate renderer construction bypasses tracking, fallback, post-processing wiring, and shared tuning (MSAA × log-depth × reversed-Z).

CORRECT:

```typescript
const backend = useThreeGraphicsBackend();
await createTauRenderer('viewport', backend, canvas);
```

INCORRECT:

```typescript
const gl = new WebGLRenderer(); // bypasses Tau dual-stack contract
```

### 2. New GPU materials: TSL + NodeMaterials for WebGPU path

Materials that compile custom shader logic for the viewport must expose a **WebGPU path** implemented with **Three.js Shading Language (TSL)** and **`three/webgpu` `*NodeMaterial`**, alongside any legacy **`ShaderMaterial` / LineMaterial`** needed for WebGL until that path is retired. Cap planes, infinite grid, fat edges, viewport gizmo overlay lines, splash morphing points, and similar features follow this pattern.

**Why**: WebGPURenderer expects node-based pipelines; raw GLSL is not portable to WGSL without a documented port.

### 3. Explicit `.toVar` names only outside reusable `Fn` bodies

Inside a **`Fn(...)`** arrow/function value that **is not** wrapped in **`Fn(...)()` immediate invocation**, pass **`.toVar()`** with **no string** argument. Pattern **`colorNode = Fn(() => { ... })()`** (and **`vertexNode = Fn(() => { ... })()`**) **is** invoked exactly once and may retain explicit **`toVar('label')`** names for legibility where useful.

**Why**: TSL inlines reusable `Fn` bodies at each call site. Named **`.toVar('x')`** registers into **`NodeBuilder.declarations`**, so a second inlined copy emits **`Declaration name 'x' already in use`** and auto-renames while warning.

### 4. Shader graph snapshots are mandatory for new nodal materials

For each **`NodeMaterial` factory**, add **`// @vitest-environment node`** tests that **`await expect(serialiseStrippedTslGraph(material.toJSON())).toMatchFileSnapshot(...)`** with golden files under a co-located **`__shader-snapshots__/`** directory. Use **`apps/ui/app/components/geometry/graphics/three/utils/tsl-node-graph-snapshot.ts`** so snapshots strip **`uuid`**, substitute UUID-shaped node cross-references with a stable placeholder, and sort keys recursively.

**Why**: Deterministic graphs catch regressions without a GPU in CI.

### 5. Playwright parity for viewport-visible differences

Structural parity between WebGL and WebGPU for parity-sensitive visuals is enforced with **`apps/ui-e2e/src/graphics-backend.spec.ts`** loading **`/e2e/graphics-backend`** with **`?graphicsBackend=`** and named **`toHaveScreenshot`** assets. Prefer **`maxDiffPixelRatio: 0.02`** for general scenes and **`0.05`** where algorithms differ materially (e.g. N8AO vs GTAO-family nodes).

**Why**: WGSL/driver variance is real; named screenshots isolate failures per backend and scene.

### 6. Offscreen and screenshot paths honor backend semantics

Shared doc previews (**`apps/ui/app/components/docs/shared-renderer.tsx`**) probe **`offscreenWebGpuCanvasContextAvailable()`** before choosing WebGPU; otherwise WebGL OffscreenCanvas — both instantiated via **`createTauRenderer('offscreen', backend, canvas)`**.

Headless/screenshot clones use **`createTauRenderer('screenshot', ...)`**. Both paths must **`await` WebGPU initializer `init`** where applicable and only call **`forceContextLoss`** on WebGL.

Matcap substitution for screenshots respects **`ResolvedGraphicsBackend`** (**`apps/ui/app/machines/screenshot-capability.machine.ts`** and **`applyMatcapToClonedScene`**).

**Why**: Prevents flashing wrong API or losing pixels when the queue has not flushed.

### 7. Theming and frame loop conventions

For interactive Tau viewers, **`ThreeProvider` / CAD `<Canvas>`** must use **`frameloop='demand'`**. Call **`invalidate()`** after user gestures and \*\*`invalidate()` again when damping/animations finish so edits always settle.

Reserve **`frameloop='always'` for marketing/auth/splashback canvases only** — continuous RAF is opt-in noise and heat outside those routes. Always-on canvases beyond those surfaces **require an adjacent comment explaining why continuous RAF is unavoidable**.

**Why**: Matches R3F best practice for heavyweight WebGPU graphs; aligns `useFrame`/demand-render ownership with post-processing overlays.

#### 7a. Anti-aliasing under `frameloop='demand'`: hardware MSAA only

Interactive viewports must rely on **hardware MSAA** (`antialias: true` on the renderer constructor — `createTauRenderer('viewport', …)` for both backends). **Temporal anti-aliasing (TRAA) is banned in the viewport post-processing graph** because it requires continuous frames to converge — under `frameloop='demand'` the scene stops at one un-jittered frame, surfacing as edge graininess. The WebGPU pre-pass therefore omits a velocity MRT (no TRAA → no velocity consumer); only depth + normals are emitted for GTAO.

Marketing/auth canvases that opt into `frameloop='always'` (per §7) MAY use TRAA, but each call site must justify it next to the `frameloop='always'` comment.

**Why**: TRAA's upstream `TRAANode.js` documents that "MSAA must be disabled when TRAA is in use." Once TRAA is dropped from the on-demand viewport, MSAA is the unconditional baseline so static frames are AA-clean from the very first render.

### 8. `createTauRenderer` captures use-case divergence

Prefer **`apps/ui/app/components/geometry/graphics/three/tau-renderer.ts#createTauRenderer(useCase, backend, canvas)`** over ad-hoc `new WebGLRenderer` / `WebGPURenderer` literals for:

- **`viewport`** — CAD `<Canvas>`
- **`gizmo`** — small viewport overlay cubees
- **`offscreen`** — docs `SharedRenderer` transfers
- **`screenshot`** — headless framebuffer readback (**`preserveDrawingBuffer`** on WebGL)

**Why**: Presets document MSAA/log-depth/stencil defaults per surface (`apps/ui/app/components/geometry/graphics/three/tau-renderer.ts` JSDoc is binding).

### 9. Color management for custom WebGL `ShaderMaterial`s

Any custom **`THREE.ShaderMaterial`** that assigns **`gl_FragColor`** manually must **`#include <colorspace_fragment>`** after computing the final **`gl_FragColor`** (and after any **`discard`** threshold that should skip the encode for culled fragments). **`WebGLProgram`** injects **`linearToOutputTexel`** for every program, but **`ShaderMaterial`** fragments do **not** auto-append the **`colorspace_fragment`** chunk — only **`ShaderLib/*`** builtins do — so omission skips the linear-to-sRGB encode applied automatically on WebGPU via **`NodeMaterial`** / **`ColorSpaceNode`**. Symptom: same **`THREE.Color`** looks correct on one backend and washes out on the other (e.g. infinite grid nearly invisible in light mode on WebGPU while WebGL looked fine). Guard: **`apps/ui/app/components/geometry/graphics/three/materials/infinite-grid-material.test.ts`**.

**Why**: Dual-stack parity is defined in **perceptual** display space, not raw linear framebuffer bytes.

### 10. Shallow clone implies shallow dispose: explicit ownership only

Any surface that performs **`scene.clone()`** for offscreen rendering, screenshot capture, WebXR previews, exporter pipelines, or any other transient render must dispose **only** the materials it allocated itself — never materials inferred from inheritance or scene traversal. Allocator functions return a **`Set<Material>`** of every material they created; the caller composes those sets and passes them to **`disposeCloneOwnedMaterials(materials)`** at teardown. Inheritance-based ownership inference (e.g. walking **`isMesh`** nodes) is banned because **`LineSegments2 extends Mesh`** — disposing such a "mesh" frees the live viewport's shared **`Line2NodeMaterial`** and three's per-renderer **`RenderObject.onMaterialDispose`** listener fan-out purges the viewport's pipeline state, producing the "viewport edges grainy after a screenshot" regression on the next interaction.

The pattern is concretely:

```typescript
const cloneOwnedMaterials = new Set<THREE.Material>();
for (const material of applyMatcapToClonedScene(scene, texture, { backend })) {
  cloneOwnedMaterials.add(material);
}
for (const material of applyEdgeMaterialsToClonedScene(scene, { backend, resolution })) {
  cloneOwnedMaterials.add(material);
}
// ... renderer.render(scene, camera) N times ...
disposeCloneOwnedMaterials(cloneOwnedMaterials);
```

CORRECT (explicit set, never traverses by `isMesh`):

```typescript
const allocated = applyMatcapToClonedScene(scene, texture, { backend });
disposeCloneOwnedMaterials(allocated);
```

INCORRECT (inheritance-based traversal disposes shared `Line2NodeMaterial`):

```typescript
scene.traverse((child) => {
  if (child.isMesh) child.material.dispose(); // <- LineSegments2 also matches!
});
```

**Why**: Three's `Material.dispose()` dispatches a `'dispose'` event consumed by every `RenderObject` that has bound the material across all renderers (see `RenderObject.onMaterialDispose`). Disposing a material shared with the live viewport silently invalidates the viewport's pipeline cache. Guards: **`apps/ui/app/machines/screenshot-capability.utils.test.ts`** (`R2 (WebGL/WebGPU): does NOT dispose the viewport's shared … material when only matcap was applied`).

### 11. Cross-renderer flag-set divergence: never share TSL-graph-establishing materials

A material whose TSL graph (or `onBeforeCompile` GLSL replacement) branches on any of `renderer.reversedDepthBuffer`, `renderer.logarithmicDepthBuffer`, `renderer.samples`, or `renderer.outputColorSpace` **must not be shared by reference between renderer instances that disagree on those flags**. Three's `NodeMaterial.setup()` runs exactly once per material lifetime — the first renderer to consume the material bakes the TSL graph against its own flag set, and every subsequent renderer compiles its WGSL pipeline from the already-established graph. The screenshot/offscreen renderer's distinct `reversedDepthBuffer` / `logarithmicDepthBuffer` / `RenderPipeline+PassNode` configuration cannot legally consume a TSL graph established by the viewport renderer.

Affected materials in the workspace today:

| Material                                                                                                           | Branches on                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `Line2NodeMaterial` (Tau subclass at `apps/ui/app/components/geometry/graphics/three/materials/line2.material.ts`) | `reversedDepthBuffer`, `logarithmicDepthBuffer` (via `setupDepth(builder)`); `clip-distances` feature (via `setupHardwareClipping(builder)`) |
| Future flag-aware nodal materials                                                                                  | Same — must self-document the per-flag dispatch in their `setup*` overrides                                                                  |

Surfaces that consume such materials in a renderer with different flags than the live viewport (today: `screenshot`, `offscreen`) must allocate their own **fresh** material instance per render, mirroring the matcap pattern in §6 and §10. Tau's screenshot path uses `applyEdgeMaterialsToClonedScene` for this purpose; new clone-and-render surfaces follow the same shape.

CORRECT (fresh allocation, screenshot renderer compiles its own pipeline against its own flags):

```typescript
const edgeMaterials = applyEdgeMaterialsToClonedScene(screenshotScene, {
  backend: screenshotBackend,
  resolution: new THREE.Vector2(width, height),
});
```

INCORRECT (shares the viewport-baked TSL graph; depth encoder, sample-count contract, and color-attachment expectations are wrong for the screenshot renderer):

```typescript
// LineSegments2.material reference reaches the screenshot renderer unchanged
screenshotRenderer.render(screenshotScene, screenshotCamera);
```

**Why**: Sharing a TSL-graph-baked material across renderers with divergent flags causes the secondary renderer to inherit the primary's depth-encoder choice, color-attachment expectations, and PassNode-level filtering assumptions — the canonical reason for grainy fat-line edges in WebGPU screenshot output documented in `docs/research/screenshot-viewport-shared-material-state-bleed.md`. Guards: **`apps/ui/app/machines/screenshot-capability.utils.test.ts`** (`R6 (WebGL/WebGPU): applyEdgeMaterialsToClonedScene replaces the LineSegments2's material with a fresh allocation`).

### 7b. Interactive overlay tools must `invalidate()` after every user-driven state change

When the viewport runs with `frameloop="demand"`, React state updates inside overlay tools (measure, section pickers, gizmos) do not schedule a frame by themselves. Every pointer-driven dispatch that changes visible overlay geometry **must** call `useThree((s) => s.invalidate)` immediately after the state commit.

CORRECT:

```typescript
dispatchSnapState({ type: 'pointerFrame', payload: next });
invalidate();
```

INCORRECT:

```typescript
setHoveredSnapPoints(points); // no invalidate — canvas stays stale under demand frameloop
```

### 12. Factory-produced derived geometry uses module-scope LRU caching with `dispose()` on evict

`FontGeometry`, `RoundedRectangleGeometry`, and similar CPU-heavy factories **must** consult a bounded module-scope LRU (`createGeometryLru`) keyed by stable parameter tuples. Returned `BufferGeometry` instances are **non-owned** — callers must never call `.dispose()` or mutate them in place. Eviction calls `.dispose()` on the evicted entry.

Guards: **`geometry-lru.test.ts`**, **`font-geometry.test.ts`**, **`rounded-rectangle-geometry.test.ts`**.

### 13. `useMemo`-allocated geometry/materials require `useEffect` dispose cleanup with caller-vs-internal discriminator

When a component allocates `THREE.Material` or `BufferGeometry` in `useMemo`, a matching `useEffect` teardown **must** call `.dispose()` only when the bundle is marked `ownsMaterials: true` (or equivalent). Caller-supplied materials are never disposed by the component.

Guards: **`measurement-line-materials.test.ts`**.

### 14. Interactive raycasting routes through `bvhRaycastFirst`; `Mesh.prototype.raycast` monkey-patch banned

Pointer-event-rate picking (measure tool, future overlays) **must** use **`bvhRaycastFirst(raycaster, meshes)`** in **`apps/ui/app/components/geometry/graphics/three/utils/bvh-raycast.ts`**, which consults `getOrBuildBvh` per mesh. Patching `Mesh.prototype.raycast` with `acceleratedRaycast` is forbidden — it affects every mesh in the process globally.

Exempt: transform-controls gizmo picking may continue using stock `raycaster.intersectObject` on the gizmo subtree only.

Guards: **`bvh-raycast.test.ts`**.

### 15. High-frequency pointer events are rAF-coalesced; camera-drag suppression delegated to §16

`mousemove` handlers that run BVH raycasts and snap detection **must** schedule work through **`createRafCoalescer`** so at most one pipeline pass runs per animation frame (latest event wins). Camera-orbit suppression during drags is **not** implemented via quaternion/position delta heuristics — see §16.

Guards: **`raf-coalesce.test.ts`**, **`measure-tool-pointer-pipeline.test.tsx`**.

### 16. Tool overlays model pointer lifecycle as a state machine; `cameraInteracting` from drei `OrbitControls` `'start'`/`'end'`

Measure and future overlay tools **must** dispatch pointer lifecycle events into a dedicated XState machine (`measureInputMachine` today). `graphics.machine` exposes `cameraInteracting: boolean`, flipped by `controlsInteractionStart` / `controlsInteractionEnd` forwarded from `controlsListenerMachine` (drei `OrbitControls` `'start'`/`'end'`). Handlers gate on `cameraInteracting` and the input machine sets `discardGesture` when interaction starts mid-pointer-hold.

Quaternion-delta or camera-position-delta heuristics to distinguish orbit drags from clicks are **banned**.

Guards: **`measure-input.machine.test.ts`**, **`graphics.machine.test.ts`**.

## Color & Blending Parity

Dual-stack visuals must look the same when fed the same source `THREE.Color`. Eight seams between source color and on-screen pixel ("S1-S8" below) determine whether parity holds; misaligning any of them produces backend-specific drift even when shader logic is identical. The §9 rule covers only S3 (manual `gl_FragColor` color-space encode). The rules in this section close the remaining alpha-blend and source-color seams.

### CB-1. `transparent` is declared once for both backends

Any material rendered on **both** backends with non-1.0 alpha **must** set `transparent: true` on **both** the WebGL material/component and the WebGPU `*NodeMaterial` — even when the WebGL component appears to "just work." Drei's `<Line>` (and other library components) silently default their underlying `LineMaterial.transparent` to `false` unless 4-channel vertex colors are supplied; `THREE.WebGLRenderer` then skips `gl.BLEND` entirely and writes the opaque source color while WebGPU's `Line2NodeMaterial` correctly blends, surfacing as backend-specific brightness divergence on alpha-using overlays (axes helper, gizmo lines).

CORRECT:

```typescript
<Line color={axisColor} opacity={0.6} transparent points={...} />
<AxesWebGpuFatLine color={axisColor} opacity={0.6} {...} /> // sets `transparent: true` internally
```

INCORRECT:

```typescript
<Line color={axisColor} opacity={0.6} points={...} />        // <- transparent silently false on WebGL
```

Guard: **`apps/ui/app/components/geometry/graphics/three/react/axes-helper.test.tsx`** (`passes 'transparent: true' to every Drei <Line>`).

### CB-2. No historical-bug calibration

Source colors (hex literals, RGB strings, `THREE.Color` constructors, JSON theme tokens) **must not** be pinned to perceptual values produced by a known-broken pipeline state — e.g. pre-`<colorspace_fragment>` WebGL, pre-`transparent: true` drei lines, or any other regression that happens to read out at a particular sRGB value on canvas. Pinning to a bug freezes the bug into the design contract: as soon as the bug is fixed (or another backend is added), every value in the table is wrong.

Hard rule: every overlay color/opacity constant used in the 3D viewport lives in **`apps/ui/app/components/geometry/graphics/three/overlay-colors.constants.ts`** as the single tuning point, with JSDoc that documents the per-backend perceptual outcome under linear blending. Re-tuning **must** happen visually against `/e2e/graphics-backend` with both backends side-by-side, not by matching an earlier on-canvas readout.

### CB-3. Known limitation: residual gamma-vs-linear canvas blend delta

After CB-1 and CB-2, an irreducible ~10-15 sRGB unit perceptual delta per channel remains between WebGL and WebGPU for any overlay that blends below 1.0 alpha **and does not use the CB-4 in-shader gamma blend**. Cause: WebGL renders directly to the sRGB-encoded canvas drawing buffer and blends in **gamma space**; WebGPU renders into a linear-float offscreen `frameBufferTarget` (RGBA16F, `LinearSRGBColorSpace`, `HalfFloatType`), blends in **linear space**, and only sRGB-encodes during the deferred `_renderOutput` pass. Two materials with the same source color, the same alpha, and the same destination pixel produce different blended pixels because one math operates in roughly perceptual space and the other in physically correct linear space.

For most overlays this is a **deferred limitation**, not a defect to band-aid. The architecturally complete fix — routing the entire overlay scene through a shared post-processing render target so the canvas composite happens in the same color space on both backends — remains future work with a separate research entry. The **fat-line material** is exempted by CB-4 below.

Empirical caveat: the residual is well within the ~10-15 sRGB-unit budget for desaturated tints (grid lines, light-mode axes against white), but for **fully saturated overlay tints against dark backgrounds** the per-channel divergence approaches 40+ sRGB units. Saturated tints that must reach perceptual parity therefore belong on the CB-4 path, not the deferred CB-3 path.

### CB-4. Fat-line materials blend in sRGB space inside the shader

`Line2NodeMaterial` (Tau subclass — [`apps/ui/app/components/geometry/graphics/three/materials/line2.material.ts`](../../apps/ui/app/components/geometry/graphics/three/materials/line2.material.ts)) closes seam **S7** for fat-line overlays without re-platforming the overlay scene. When constructed with `transparent: true`, its `setup()` builds an explicit `outputNode` that:

1. Transfers `colorNode.rgb` and the Tau-owned non-mip viewport singleton (`tauOpaqueViewportTexture()`, an alias around `viewportTexture()` with `generateMipmaps: false`, exported from the same module) from working linear-sRGB to sRGB space via `sRGBTransferOETF` (`three/tsl`).
2. Performs the `color · α + viewport · (1 - α)` alpha mix in sRGB space.
3. Returns the mixed result back to linear-sRGB via `sRGBTransferEOTF` before assigning to `outputNode.rgb`.

The viewport sample uses the Tau singleton rather than upstream `viewportOpaqueMipTexture` because the blend samples exclusively at level 0 — the mip pyramid that the upstream singleton (`viewportMipTexture()`) regenerates every frame is never read, and on WebGPU the per-frame `generateMipmaps` triggers a mid-pass split plus a `Load` restart inside `WebGPUBackend.copyFramebufferToTexture` alongside ~10 blit passes at 1080p. The non-mip singleton produces identical sampled colour at level 0 for a cheaper per-frame update path. See [`docs/research/webgpu-axes-hover-pipeline-stall.md`](../research/webgpu-axes-hover-pipeline-stall.md) for the measurement.

The net effect is a gamma-space blend math that matches WebGL's sRGB-encoded framebuffer blend characteristic, while still producing linear values that downstream pipeline stages (post-processing, sRGB canvas encode) expect.

Scope:

- **Applies to**: every consumer of Tau's `Line2NodeMaterial` constructed with `transparent: true` — currently the scene `<AxesHelper>` (via `AxesWebGpuFatLine`) and the viewport gizmo cube axes (via `createViewportGizmoCubeAxes`'s WebGPU branch).
- **Does not apply to**: `createWebGpuGltfFatLineMaterial` (opaque — depends on standard `colorNode` output), the WebGPU infinite grid material, or any other overlay material that does not extend Tau's `Line2NodeMaterial` with `transparent: true`. Those surfaces remain on the CB-3 deferred path.

Guards: [`apps/ui/app/components/geometry/graphics/three/materials/line2.material.test.ts`](../../apps/ui/app/components/geometry/graphics/three/materials/line2.material.test.ts) (`Line2NodeMaterial.outputNode` describe block — fingerprint match against an sRGB-wrapped reference, fingerprint mismatch against a linear-only reference, and an opaque-material negative case). [`apps/ui/app/components/geometry/graphics/three/controls/viewport-gizmo-cube-axes.test.ts`](../../apps/ui/app/components/geometry/graphics/three/controls/viewport-gizmo-cube-axes.test.ts) (gizmo WebGPU branch uses the Tau subclass; WebGL branch sets `transparent: true`).

Why not back-port to WebGL: the WebGL fat-line path already blends in gamma space because the canvas drawing buffer is sRGB-encoded. Wrapping the same colors in sRGB transfer functions on WebGL would double-encode and produce **dim**, washed-out lines — strictly a WebGPU-only correction.

### S1-S8 invariant reference table

The eight seams a `THREE.Color` traverses on its way to a canvas pixel. Misaligning any single seam fragments parity even if shaders are identical:

| Seam | Stage                           | WebGL                                                         | WebGPU                                                                                                                   | Aligned by                                        |
| ---- | ------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| S1   | Source declaration              | `THREE.Color` (sRGB hex / `rgb()`)                            | `THREE.Color` (sRGB hex / `rgb()`)                                                                                       | `overlay-colors.constants.ts` (CB-2)              |
| S2   | Color → linear (uniform upload) | `Color.convertSRGBToLinear()` on upload                       | `Color.convertSRGBToLinear()` on upload                                                                                  | three.js core, no action                          |
| S3   | Linear → output texel (shader)  | `<colorspace_fragment>` chunk ↔ `linearToOutputTexel`         | `ColorSpaceNode` injected by `NodeMaterial.setupOutput`                                                                  | §9 (custom `ShaderMaterial`)                      |
| S4   | Material `transparent` flag     | Drei components default to `false` for non-vertex-color lines | `*NodeMaterial` constructors set `true` explicitly                                                                       | CB-1                                              |
| S5   | Renderer alpha mode             | sRGB-encoded canvas (drawing buffer)                          | `'premultiplied'` `GPUCanvasConfiguration.alphaMode`                                                                     | three.js / browser, deferred (CB-3)               |
| S6   | Framebuffer color space         | `outputColorSpace = SRGBColorSpace` (canvas direct)           | `LinearSRGBColorSpace` offscreen `frameBufferTarget`, encoded on composite                                               | three.js / browser, deferred (CB-3)               |
| S7   | Blend math space                | **Gamma** (sRGB-encoded canvas blend)                         | **Linear** (linear-float offscreen blend); **gamma** for transparent `Line2NodeMaterial` (CB-4 in-shader OETF/EOTF wrap) | **CB-4 for fat lines**; otherwise deferred (CB-3) |
| S8   | Composite to canvas             | Direct draw, no extra pass                                    | Deferred `_renderOutput` quad pass with sRGB encode                                                                      | deferred (CB-3)                                   |

S1-S4 are unconditional rules (pixels match within ~10-15 sRGB/channel once aligned). S5, S6, S8 remain the deferred limitation captured in CB-3. S7 is closed by CB-4 for transparent `Line2NodeMaterial` consumers and stays deferred for every other overlay material.

## Anti-Patterns

- **`RawShaderMaterial` / handwritten GLSL-only** additions without a staged WebGPU analogue and policy approval.
- **Custom `ShaderMaterial` skipping `#include <colorspace_fragment>`** when writing **`gl_FragColor`** — breaks WebGL/WebGPU brightness parity (§9).
- **Drei `<Line>`** (or any third-party material wrapper) **without explicit `transparent`** when `opacity < 1` — opacity is silently dropped on WebGL, brightness diverges from WebGPU (CB-1).
- **Pinning overlay color hex/RGB constants** to perceptual readouts produced by a known-broken pipeline state — locks the bug into the design contract (CB-2).
- **Backend-specific color overrides** introduced to compensate for the residual gamma-vs-linear blend delta — band-aid that breaks as soon as either backend is touched. The delta is deferred work for non-line overlays (CB-3); for fat lines the architecturally correct fix is the in-shader sRGB blend (CB-4), not per-backend hex values.
- **Stock `three/webgpu` `Line2NodeMaterial`** imported for any line drawn into the viewport canvas — bypasses Tau's renderer-aware depth encoder, hardware-clipping override, and the CB-4 in-shader gamma blend. Always import from `#components/geometry/graphics/three/materials/line2.material.js`.
- **Snapshot tests** that omit **`await`** on **`toMatchFileSnapshot`** (Vitest forwards will fail later).
- **E2e** that asserts only DOM structure for GPU-heavy regressions without an opt-in screenshot in **`graphics-backend.spec.ts`**.
- **Named `.toVar('…')` inside reusable `Fn` bodies** invoked more than once per shader stage — see §3.
- **Disposing materials inferred from `isMesh` / scene traversal** in any clone-and-render surface — `LineSegments2 extends Mesh` and shared viewport materials are silently freed (§10).
- **Sharing a TSL-graph-baked or `onBeforeCompile`-hooked material across renderer instances** with differing `reversedDepthBuffer`, `logarithmicDepthBuffer`, `samples`, or `outputColorSpace` — the secondary renderer inherits the primary's flag-baked graph (§11).
- **Skipping `invalidate()`** after overlay tool state updates under `frameloop="demand"` — stale canvas until an unrelated interaction (§7b).
- **Per-call `FontLoader` / `JSON.parse` / `ExtrudeGeometry`** for label text without module-scope LRU — multi-ms stalls on every preview frame (§12).
- **`Mesh.prototype.raycast = acceleratedRaycast`** global monkey-patch — use `bvhRaycastFirst` instead (§14).
- **Camera quaternion/position delta heuristics** to detect orbit drags — use `cameraInteracting` from OrbitControls events (§16).
- **Three separate `setState` calls** per pointer frame for related snap UI state — batch via `useReducer` + rAF coalescing (§15).

## Summary Checklist

- [ ] New material: WebGL sibling + WebGPU **`NodeMaterial`**, factory branches on **`resolvedGraphicsBackend`**
- [ ] **`__shader-snapshots__`** + node env Vitest **`await`** snapshot
- [ ] If user-visible parity matters: harness query + Playwright **`toHaveScreenshot`** with explicit **`name`**
- [ ] Renderer construction routed through **`createTauRenderer`** unless a sanctioned exception lands in **`tau-renderer.ts`**
- [ ] Custom WebGL **`ShaderMaterial`**: **`#include <colorspace_fragment>`** on manual **`gl_FragColor`** writes (§9)
- [ ] Dual-stack alpha overlay: **`transparent: true`** declared on **both** backends (CB-1)
- [ ] Overlay color/opacity constants live in **`overlay-colors.constants.ts`**, not pinned to a known-broken backend baseline (CB-2)
- [ ] Saturated transparent fat-line overlay: routed through Tau **`Line2NodeMaterial`** (NOT stock `three/webgpu`) so CB-4's in-shader sRGB blend closes S7
- [ ] Clone-and-render surface (screenshot, offscreen, exporter): allocator returns **`Set<Material>`**, teardown calls **`disposeCloneOwnedMaterials(set)`** — never traverses by **`isMesh`** (§10)
- [ ] Material that branches on **`reversedDepthBuffer`** / **`logarithmicDepthBuffer`** / **`samples`** / **`outputColorSpace`**: fresh-allocated per renderer instance via the §10 allocator pattern, never reference-shared (§11)
- [ ] Interactive overlay under demand frameloop: **`invalidate()`** after every user-driven state change (§7b)
- [ ] Derived label/background geometry: module-scope LRU + dispose-on-evict; callers treat outputs as non-owned (§12)
- [ ] Internal `useMemo` materials/geometries: `useEffect` dispose with caller-vs-internal discriminator (§13)
- [ ] Pointer-rate picking: **`bvhRaycastFirst`** only — no `Mesh.prototype.raycast` patch (§14)
- [ ] High-frequency pointer pipeline: **`createRafCoalescer`** + batched reducer state (§15)
- [ ] Overlay pointer lifecycle: XState input machine + **`cameraInteracting`** from OrbitControls — no quaternion heuristics (§16)
- [ ] Scene-composition changes bump **`pickableMeshesVersion`** on `graphics.machine` for tool mesh caches (measure tool)

## References

- Research: **`docs/research/webgpu-migration-graphics-stack.md`**
- Research: **`docs/research/measure-tool-performance-audit.md`**
- Research: **`docs/research/screenshot-viewport-shared-material-state-bleed.md`** (§10 + §11 root cause and architectural fix)
- E2e harness route: **`apps/ui/app/routes/e2e.graphics-backend/route.tsx`**
- Stability helper: **`apps/ui/app/components/geometry/graphics/three/utils/tsl-node-graph-snapshot.ts`**
- Overlay color tuning point: **`apps/ui/app/components/geometry/graphics/three/overlay-colors.constants.ts`**
- Infinite grid color contract: **`apps/ui/app/components/geometry/graphics/three/materials/infinite-grid-material.test.ts`**, **`apps/ui/app/components/geometry/graphics/three/grid-colors.test.ts`**
- Axes `transparent` parity guard: **`apps/ui/app/components/geometry/graphics/three/react/axes-helper.test.tsx`**
- Clone-ownership guard (§10): **`apps/ui/app/machines/screenshot-capability.utils.test.ts`** (`R2`, `R6`)
- Renderer-aware fat-line depth dispatch: **`apps/ui/app/components/geometry/graphics/three/materials/line2.material.ts`** (§11 reference subclass)
