---
title: 'Measure Tool Performance Audit'
description: 'Why measure-tool.tsx lags during use and the architectural changes (font/geometry caching, dispose discipline, BVH raycast, render-loop invalidate, rAF throttling) that restore interactive frame budgets.'
status: draft
created: '2026-05-27'
updated: '2026-05-27'
category: optimization
related:
  - docs/policy/graphics-backend-policy.md
  - docs/research/gltf-edges-fat-line-performance.md
  - docs/research/webgpu-axes-hover-pipeline-stall.md
  - docs/research/ui-startup-performance-gap-analysis.md
---

# Measure Tool Performance Audit

Why `apps/ui/app/components/geometry/graphics/three/react/measure-tool.tsx` becomes visibly laggy during interactive use (snap hover, preview line drag, repeated measurements), and the architectural changes that restore a buttery-smooth `frameloop='demand'` envelope.

## Executive Summary

The measure tool's lag is **not GPU-bound**. It comes from three compounding CPU costs running on every mouse move at native pointer-event rate (often 120-240 Hz on modern trackpads/displays):

1. **Font + label geometry rebuild storm** — the preview line's `labelText` (`"123.4 mm"`) changes every mouse move, so its `useMemo`-wrapped `LabelTextGeometry`/`LabelBackgroundGeometry`/`LabelBackgroundGeometryOutline` rebuild on every render. Each rebuild instantiates a fresh `FontLoader`, runs `JSON.parse` on the **220 KB `geist-mono.typeface.json`** raw string, regenerates per-glyph `Shape`s, and builds two `ExtrudeGeometry` instances. The previous geometry is **leaked** (never `dispose()`'d) — so GPU memory grows with every digit change.
2. **`detectSnapPoints` cold-cache cost** is `O(triangles × triangles)` worst-case — it walks every triangle, allocates a fresh `Vector3` per vertex (`computeWorldPositions`), builds a string-keyed canonical-vertex map (`toFixed(5)` per vertex), and BFS's coplanar adjacency. The face cache mitigates repeat hovers, but the **first hover on every face** stalls. Worse, the raycast itself does not consume the existing **`getOrBuildBvh()`** infrastructure (`apps/ui/app/components/geometry/graphics/three/utils/bvh-cache.ts`) — `raycaster.intersectObjects(meshes, true)` falls back to three.js's default `O(n)` triangle scan even though the project already ships `three-mesh-bvh`.
3. **Render-loop and React-state thrash** — three sequential `setHoveredSnapPoints` / `setActiveSnapPoint` / `setMousePosition` `useState` calls per mouse event force three React re-renders, each of which re-mounts every `SnapPointIndicator` (keyed by float-stringified position), and the preview-line subtree never explicitly calls `invalidate()` so GPU rendering is bursty rather than smooth.

Secondary issues: cone/cylinder/label `useFrame` math runs once per measurement per frame regardless of whether anything has changed, materials allocated by `derivedMaterials` are never disposed, the global mouse-move handler runs full raycast and snap detection during `OrbitControls` drags, and `getCachedMeshes()` invalidates only on `geometryKey` so visibility/section-view toggles silently produce stale caches.

The recommended architectural moves — **module-scope LRU for `Font` + `FontGeometry` + `RoundedRectangleGeometry` with `dispose()` on evict**, **`useEffect` dispose cleanup for every `useMemo`-allocated GPU resource not routed through an LRU**, **split `MeasurementLine` into preview/completed components** so the preview never owns label state, **single shared `bvhRaycastFirst` helper as the sole interactive picking entry point** (no `Mesh.prototype.raycast` monkey-patch), **`detectSnapPoints(mesh, intersection)` signature** with per-`BufferGeometry` `WeakMap` pre-pass cache, **explicit `measureInputMachine` owning pointer lifecycle** (`cameraInteracting` parallel state sourced from drei `OrbitControlsImpl` `'start'`/`'end'` events — never from camera-delta heuristics), **`pickableMeshesVersion` + `pickableMeshes` on `graphics.machine` as the single source of truth for the pickable mesh set**, **single `useReducer` dispatch per pointer event paired with `invalidate()`**, and **rAF-coalesced pointer events** — collapse the per-pointer-event cost from "rebuild ~5 ExtrudeGeometries + parse 220 KB JSON + 3 React renders" to "version-cached mesh selector lookup + BVH raycast + one dispatch + one invalidate," restoring 120 Hz interactivity.

This audit also identifies six gaps in `docs/policy/graphics-backend-policy.md` where the policy is silent on **interactive overlay tool architecture** (factory-geometry caching, dispose ownership for derived geometry, render-loop invalidate discipline, BVH-accelerated picking, rAF-coalesced pointer events, and pointer-state machine ownership); proposed policy additions are listed in the [Policy Gap Analysis](#policy-gap-analysis) section.

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Methodology](#methodology)
3. [Scope and Non-Goals](#scope-and-non-goals)
4. [Findings](#findings)
5. [Recommendations](#recommendations)
6. [Policy Gap Analysis](#policy-gap-analysis)
7. [Code Examples](#code-examples)
8. [References](#references)

## Problem Statement

User report: **the measure tool is extremely laggy when in use**. Symptoms reproduce reliably:

- Cursor lag while hovering snap points (visible delay between mouse movement and indicator pop).
- Preview line stutters as the cursor moves, especially on dense meshes (≥ 50 K triangles).
- After dragging across many faces, the page becomes generally sluggish — suggesting unbounded growth (memory or pipeline cache).
- The first hover over any new face has a noticeably longer stall than subsequent hovers over the same face.

The viewport runs `frameloop='demand'` per `docs/policy/graphics-backend-policy.md` §7, so any frame-budget overrun is **purely CPU work on the React/event-handler thread** — there is no continuous RAF burning frames. The lag therefore must come from work performed inside `mousemove` / `pointermove` handlers and inside R3F `useFrame` callbacks driven by `OrbitControls` damping or other `invalidate()` calls.

## Methodology

1. **Static read** of `apps/ui/app/components/geometry/graphics/three/react/measure-tool.tsx` (932 lines) plus every utility/geometry it touches:
   - `apps/ui/app/components/geometry/graphics/three/utils/snap-detection.utils.ts`
   - `apps/ui/app/components/geometry/graphics/three/geometries/label-geometry.ts`
   - `apps/ui/app/components/geometry/graphics/three/geometries/font-geometry.ts`
   - `apps/ui/app/components/geometry/graphics/three/geometries/rounded-rectangle-geometry.ts`
   - `apps/ui/app/components/geometry/graphics/three/materials/matcap-material.ts`
   - `apps/ui/app/components/geometry/graphics/three/utils/rotation.utils.ts`
   - `apps/ui/app/components/geometry/graphics/three/utils/bvh-cache.ts`
   - `apps/ui/app/components/geometry/graphics/three/three-canvas-instance.tsx`
   - `apps/ui/app/components/geometry/graphics/three/controls.tsx`
2. **Cross-reference** with `docs/policy/graphics-backend-policy.md` §7 (frameloop), §7a (MSAA), §10 (clone-and-dispose ownership) and the broader project memory in `.cursor/rules/learned-graphics-stack.mdc`.
3. **Identify hot paths** by asking, for each mouse-move event: which lines allocate, which `useMemo` deps change, which functions run unbounded vs cached.
4. **Identify per-frame paths** by enumerating every `useFrame` registered by the component tree (one global + N per `SnapPointIndicator` + N per `MeasurementLine`).
5. **Cross-check** every cached resource for an explicit dispose / invalidate path.
6. **Validate** the BVH-cache integration claim by grepping `acceleratedRaycast` / `Mesh.prototype.raycast` callsites — confirmed: there is no monkey-patch, and only `section-contour-fill.tsx` calls `getOrBuildBvh()` directly. The measure-tool path is on the unaccelerated three.js raycast.

## Scope and Non-Goals

**In scope**

- CPU costs per mouse-move and per `useFrame` tick attributable to the measure tool component tree.
- React state batching, geometry/material lifecycle, and dispose discipline.
- Render-loop interaction (`frameloop='demand'`, explicit `invalidate()` on state changes).
- Policy alignment with `docs/policy/graphics-backend-policy.md`.

**Out of scope**

- WebGPU-vs-WebGL parity for measurement labels (both backends share the same `MeshMatcapMaterial` / `MeshBasicMaterial` and exhibit the same lag).
- Aesthetic redesign of the snap indicators (size, colour, hit-area shape).
- The XState `graphics.machine` measurement-state schema (separate concern).

## Findings

Findings are numbered for cross-reference. Each finding lists severity (P0/P1/P2), root cause, and the file:line evidence.

### Finding 1: Font geometry is rebuilt on every mouse move (P0)

**Severity**: P0 — single largest contributor to interactive lag.

`apps/ui/app/components/geometry/graphics/three/geometries/font-geometry.ts:8-15`:

```typescript
export const FontGeometry = ({ text, depth, size }) => {
  const loader = new FontLoader(); // fresh instance
  const font = loader.parse(JSON.parse(fontTypeface) as FontData); // 220 KB JSON parse
  const shapes = font.generateShapes(text, size);
  const geometry = new ExtrudeGeometry(shapes, { depth, bevelEnabled: false });
  geometry.center();
  return geometry;
};
```

The raw typeface file is **220 060 bytes** (`apps/ui/app/components/geometry/graphics/three/geometries/geist-mono.typeface.json`). Every call:

1. Constructs a new `FontLoader` (cheap, but adds GC pressure).
2. Runs `JSON.parse` on the **full 220 KB string** — measured at ~3-8 ms per call on a modern laptop, far worse on lower-end machines.
3. Calls `font.generateShapes(text, size)` which walks every glyph contour and builds three.js `Shape` objects.
4. Builds an `ExtrudeGeometry` (expensive: triangulation + side-wall extrusion per glyph).
5. Returns a fresh `BufferGeometry` — caller has no signal to dispose its predecessor.

This is invoked from `apps/ui/app/components/geometry/graphics/three/react/measure-tool.tsx:612-616`:

```typescript
const textGeometry = useMemo(
  () => LabelTextGeometry({ text: labelText, size: textSize, depth: textDepth }),
  [labelText, textSize, textDepth],
);
```

`labelText` is derived per render from `calculatedDistance` — for completed (pinned/displayed) measurements it is stable, but **every other `MeasurementLine` instance whose distance text contains a digit that changes per render** rebuilds. More critically, the **`useMemo` dependency array recomputes on every render of the parent**: any `setState` in `MeasureTool` (three per mouse-move — see Finding 5) re-renders all `MeasurementLine` children, and although a stable `labelText` keeps the memo entry, **the `JSON.parse(fontTypeface)` cost has already been paid the first time** and is paid again whenever a single character of `labelText` changes.

For the **preview measurement line** (the live one being drawn), `labelText` is irrelevant (the preview has `isPreview={true}` and never renders the label — see `measure-tool.tsx:782 `{!isPreview && (`). But `useMemo`still **runs the factory** because the gate is JSX-level only, not memo-level. So the preview line currently rebuilds three`ExtrudeGeometry` instances **every render** (`textGeometry`, `backgroundGeometry`, `backgroundOutlineGeometry`) for output it discards.

**Memory impact**: each rebuild leaves the prior `BufferGeometry` for the GC to collect. Three.js geometries hold typed-array `position` / `normal` / `uv` buffers and (once mounted once) a GPU `WebGLBuffer` / WGSL buffer. The leak is **silent** because the `<primitive object={textGeometry} attach='geometry' />` swap detaches the old geometry from the mesh — three.js does **not** auto-dispose detached geometries. Over a 30-second interactive session crossing many faces, hundreds of orphaned `ExtrudeGeometry` instances pile up.

Evidence file:line:

- `font-geometry.ts:8-15` (no caching of `FontLoader.parse` result).
- `label-geometry.ts:6-16, 18-44` (factory chain).
- `measure-tool.tsx:612-645` (three useMemos — text geometry + background + outline).
- `measure-tool.tsx:782 `{!isPreview && (`` (JSX gate that does not prevent geometry construction).

### Finding 2: Label geometry not disposed on rebuild (P0)

**Severity**: P0 — silent memory leak; over a long session forces page reload.

The `useMemo` for `textGeometry`, `backgroundGeometry`, and `backgroundOutlineGeometry` returns a fresh `BufferGeometry` whenever its deps change (Finding 1). The previous geometry is **dropped on the floor**: there is no `useEffect(() => () => geometry.dispose(), [geometry])` cleanup, no `disposeCloneOwnedMaterials`-style ownership set (per policy §10), and no `useMemo` cleanup hook.

Evidence: `measure-tool.tsx:612-645` defines three `useMemo` blocks; the file contains zero `geometry.dispose()` calls.

Three.js documents that `BufferGeometry.dispose()` must be called explicitly:

> "If the application calls dispose, all GPU buffers, and JavaScript references will be released. The geometry can no longer be used."

Symptom: GPU memory monitor in DevTools shows steady growth while measure mode is active; on integrated GPUs this surfaces as escalating frame time and eventually a "WebGL context lost" toast.

The same issue applies to `derivedMaterials` (`measure-tool.tsx:538-578`): `backgroundMaterial`, `textMaterial`, and `coneMaterial` are cloned on every change to `materials`. While `materials` is `undefined` in production callsites (so the memo is stable), there is **no dispose effect** — when `MeasurementLine` unmounts (measurement deleted, project switched, viewport recreated on backend swap), three matcap/basic materials per measurement leak permanently.

### Finding 3: `detectSnapPoints` cold-cache stall (P1)

**Severity**: P1 — first hover on every face stalls 20-200 ms on dense meshes.

`apps/ui/app/components/geometry/graphics/three/utils/snap-detection.utils.ts:426-491`:

```typescript
export function detectSnapPoints(mesh, raycaster) {
  const intersection = getRaycastIntersection(mesh, raycaster);   // O(n) raycast (Finding 4)
  // ...
  const triangles = getTriangleIndexArray(geometry);              // allocates Triangle[] for entire mesh
  const worldPositions = computeWorldPositions(object, geometry); // allocates Vector3[] for ENTIRE vertex buffer
  const canonicalIndex = buildCanonicalVertexIndices(worldPositions); // toFixed(5) string key per vertex
  // ...
  const faceTriangleIndices = collectCoplanarContiguousFace({ ... });  // O(triangles) prefilter + BFS
  // ...
}
```

For a 50 K-triangle mesh:

- `getTriangleIndexArray` allocates `~50 000 × { a, b, c }` objects (~1.2 MB).
- `computeWorldPositions` allocates `~100 000 × THREE.Vector3` (each is a fresh object — three Vec3 fields plus prototype).
- `buildCanonicalVertexIndices` creates `~100 000 × String` (toFixed(5) of three floats joined with commas).
- `collectCoplanarContiguousFace` walks every triangle once for normal/plane prefilter, then BFS traverses adjacency.

The result is correctly cached in `snapCacheRef` (`measure-tool.tsx:104, 153-160`) — but only **per-face**. The first hover on each face pays the full cost. On a CAD assembly with hundreds of faces, every fresh face is a stall.

**The cache is also invalidated only on `geometryKey` change**: section-view toggles, visibility changes, or any non-geometry mutation that adds or removes meshes leave the cache stale (mismatched `mesh.id` keys against meshes that no longer exist) — minor correctness issue, but means `cachedMeshesRef` may include `Mesh` instances the BVH cache no longer needs.

Evidence:

- `snap-detection.utils.ts:36-46` (per-call world-position allocation, no caching by geometry identity).
- `snap-detection.utils.ts:178-197` (string-keyed canonical map, no numeric-grid hashing).
- `snap-detection.utils.ts:78-148` (coplanar BFS — full triangle scan).
- `measure-tool.tsx:94-123` (mesh cache invalidated by `geometryKey` only).

### Finding 4: Measure-tool raycast bypasses the BVH cache (P1)

**Severity**: P1 — every mouse move pays `O(triangles)` for raycast even though `three-mesh-bvh` is already integrated for section-view.

`measure-tool.tsx:143, 206, 267`:

```typescript
const intersects = raycasterRef.current.intersectObjects(meshes, true);
```

`THREE.Raycaster.intersectObjects` defaults to `Mesh.prototype.raycast`, which performs an `O(n)` triangle scan per mesh. The workspace already ships `three-mesh-bvh` and exposes `getOrBuildBvh(geometry)` (`apps/ui/app/components/geometry/graphics/three/utils/bvh-cache.ts`). `apps/ui/app/components/geometry/graphics/three/react/section-contour-fill.tsx:165` consumes it.

The architectural fix is a **single shared raycast utility** — `bvhRaycastFirst(raycaster, meshes)` — that lives next to `bvh-cache.ts` and is the only sanctioned entry point for interactive (mouse-move-rate) picking. Every consumer (`MeasureTool`, future annotation tools, transform handles, gizmo pickers) routes through this one helper. This:

- Keeps consumption **explicit and auditable** at every callsite (no global `Mesh.prototype.raycast` monkey-patch with cross-cutting effects on drei `OrbitControls` / `TransformControls` / gizmo cube hover).
- Centralises the per-mesh inverse-matrix transform, params handling, and "closest intersection wins" logic — currently inlined in `section-contour-fill.tsx` and would otherwise be duplicated in every new picking surface.
- Makes the policy guard one-line greppable: any `intersectObjects`/`intersectObject` callsite outside this helper that runs at pointer-event rate is a violation.

`getRaycastIntersection` inside `detectSnapPoints` (`snap-detection.utils.ts:161-176`) compounds the cost by calling `raycaster.intersectObject(mesh, true)` a **second time** on the same ray + mesh the caller already raycasted (`measure-tool.tsx:144`). The architectural fix is a signature change: `detectSnapPoints(mesh, intersection)` accepts the already-computed intersection — eliminating both the redundant raycast and `detectSnapPoints`'s coupling to `THREE.Raycaster`.

### Finding 5: Three sequential `setState` calls per mouse-move force three React re-renders (P1)

**Severity**: P1 — pointer events fire at native rate (often 120+ Hz on modern hardware), tripling React reconciler work.

`measure-tool.tsx:167, 176, 180-186`:

```typescript
setHoveredSnapPoints(allSnapPoints);
// ...
setActiveSnapPoint(closest);
// ...
if (closest) {
  setMousePosition(closest.position);
} else if (firstIntersection) {
  setMousePosition(firstIntersection.point);
}
```

React 19 / `react-dom` automatically batches state updates inside event handlers, **but only when they are scheduled in the same microtask without any awaited boundary**. The three calls above are in the same synchronous handler, so they should batch. **However**, each setter still triggers an internal store-bump that the reconciler processes; more importantly, setting state from an event handler outside React's "concurrent" features re-renders `MeasureTool` once per setState batch — and the parent re-render runs through every `MeasurementLine` and `SnapPointIndicator` child (each with its own `useFrame` registration churn).

Compounding factor: `SnapPointIndicator` keys are computed as `snap-${pos.x}-${pos.y}-${pos.z}` (`measure-tool.tsx:340`). Whenever `hoveredSnapPoints` is replaced with a new array (every face change), every `SnapPointIndicator` **mounts and unmounts** — including registering/deregistering `useFrame`, allocating two materials per indicator (cylinder geometry + matcap/basic), and unmounting the prior set's GPU resources.

Recommendation: collapse the three setStates into a single `useReducer` action that updates `{ hoveredSnapPoints, activeSnapPoint, mousePosition }` in one transition. A `useReducer` also gives the call site a single dispatch boundary so React's auto-batching is unambiguous.

### Finding 6: Preview line useFrame computes label transforms it never renders (P2)

**Severity**: P2 — wasted work each invalidated frame.

The preview line (`isPreview={true}`) flow at `measure-tool.tsx:655-720`:

```typescript
useFrame(() => {
  // ...
  if (labelGroupRef.current) {
    // 4-step billboard + flip math, ~30 vector/quaternion ops
    labelGroupRef.current.quaternion.copy(_finalQuat);
    labelGroupRef.current.scale.setScalar(scale * (isHovered ? 1.2 : 1));
    labelGroupRef.current.position.copy(midpoint);
  }
  // ...cone/cylinder math
});
```

`labelGroupRef.current` is `null` for the preview line because the label JSX block is gated by `{!isPreview && (...)` (`measure-tool.tsx:782`). The `if (labelGroupRef.current)` guard short-circuits the assignments, but the **billboard/flip math above the guard** (`_baseQuat`, `_currentNormal`, `axisRotation`, `_finalQuat`, etc. — 8 quaternion/vector operations) runs unconditionally because it precedes the ref check.

For one preview line × ~60 invalidated frames/sec during damping, this is small. But it composes with Finding 1: the preview rebuilds geometries it never renders **and** runs label math it never applies.

### Finding 7: `MeasureTool` never calls `invalidate()` after measurement state changes (P2)

**Severity**: P2 — visual updates lag the underlying state until the next external invalidate trigger (camera damping, hover ripple).

Per `docs/policy/graphics-backend-policy.md` §7:

> "Call **`invalidate()`** after user gestures and **`invalidate()`** again when damping/animations finish so edits always settle."

`measure-tool.tsx` registers `useState` updates from event handlers but **never invokes `useThree().invalidate()`**. Verified by grep: zero matches for `invalidate` in the file. The mouse-move handler updates `mousePosition`, which propagates to the preview line, but the canvas does not redraw until the **next** frame — and under `frameloop='demand'`, "next frame" only happens when something else invalidates (OrbitControls input, `gltf-mesh` updates, etc.).

In practice, `OrbitControls` damping or hover ripple from drei components keeps the canvas re-rendering enough that this is rarely catastrophic — but the preview line **stutters visibly** on a still camera while moving the mouse. This is a direct policy violation.

### Finding 8: `getCachedMeshes()` invalidates on `geometryKey` only (P2)

**Severity**: P2 — correctness drift on visibility/section toggles.

`measure-tool.tsx:106-123`:

```typescript
const getCachedMeshes = useRef((): THREE.Mesh[] => {
  const currentKey = geometryKeyRef.current;
  if (currentKey === cachedMeshKeyRef.current) {
    return cachedMeshesRef.current;
  }
  // ...full scene.traverse...
}).current;
```

Mesh visibility toggles, section-view plane addition/removal, and any other dynamic scene mutation (e.g. transient gizmo helpers, picking helpers) do **not** bump `geometryKey` — so the cache returns stale `Mesh` references. The `hasSceneTag(object, sceneTag.measurementUi)` filter excludes the tool's own meshes, but other transient meshes added after the last `geometryKey` change leak into raycast targets.

The architectural fix is to make the **`graphics.machine` the single source of truth for the pickable-mesh set**: expose a monotonic `pickableMeshesVersion` in machine context that increments inside the same actions that already mutate scene composition (geometry load/unload, visibility toggle, section-view plane mutate, etc.), and a derived `pickableMeshes` selector. `MeasureTool` reads both via `useGraphicsSelector`; the cache invalidates on `pickableMeshesVersion` changes, never on a heuristic React-side ref counter. Three.js scene-traversal is performed once per version inside the machine, not on every cache-miss in the React layer.

Side benefit: section-view's own picking, future annotation tools, and any other interactive overlay can subscribe to the same selector — the scene-graph version is an app-level concept, not a tool-local one.

### Finding 9: Pointer lifecycle modeled with React refs and post-hoc camera-delta heuristics (P2)

**Severity**: P2 — wasted raycast + snap detection during drags AND a structural smoking-gun: pointer-state ownership is split across three boolean refs (`mouseIsDownRef`, `pointerDownOnMeshRef`, `activeSnapPointRef`) plus post-hoc camera-quaternion / position deltas (`measure-tool.tsx:217-220, 244-248`) used to retroactively reclassify a click as a drag.

The current implementation:

- `mousemove` runs every move, regardless of whether the camera is being dragged (`measure-tool.tsx:132-187` has no gate on camera-interaction state).
- `pointerup` re-derives "did the camera move" by diffing `startCameraQuatRef`/`startCameraPosRef` against the current camera (`measure-tool.tsx:213-255`) — a heuristic that fails on slow drags below the epsilon and silently mis-classifies edge cases.

The architectural fix is to **own the measure-tool pointer lifecycle as an explicit state machine** (either a sub-state in `graphics.machine` or a sibling `measureInputMachine` actor spawned by it) with discrete states `idle → hovering → drawingFirstPoint → drawingSecondPoint → cancelled`. The machine's `cameraInteracting` parallel state is driven by the **canonical signal**: drei's `OrbitControlsImpl` emits `'start'` and `'end'` events whenever the user begins or ends camera manipulation. Subscribing to those events removes the need for any quaternion-delta heuristic — the controls themselves tell us authoritatively when a drag begins and ends.

`MeasureTool` then:

- Reads `cameraInteracting` via `useGraphicsSelector` and gates all pointer-event handlers on it.
- Dispatches `pointer.move`/`pointer.down`/`pointer.up` events into the machine instead of mutating React refs.
- Renders purely from machine state — three booleans of duplicated truth collapse into one declarative source.

This same machine also owns the drag-vs-click discrimination at `pointerup` (it knows whether the camera entered the `interacting` substate during the down→up transition), eliminating the camera-delta math entirely.

### Finding 10: `derivedMaterials` allocates 3 materials per measurement, never disposed (P2)

**Severity**: P2 — material leak per measurement on `MeasurementLine` unmount.

`measure-tool.tsx:538-578` creates `backgroundMaterial`, `textMaterial`, and `coneMaterial` from `MeshBasicMaterial.clone()` / `MeshMatcapMaterial.clone()`. There is no `useEffect` cleanup that calls `dispose()` on each. When the user deletes a measurement, switches projects, or the canvas remounts on backend swap (per `learned-graphics-stack.mdc`: "backend swaps … fully remount the canvas + scene + controls"), three materials per measurement leak.

The fix is policy §10's exact pattern: track a `Set<THREE.Material>` of "this component's allocated materials" and dispose them in the unmount cleanup.

### Findings 11-14: Allocation churn / repeat work (P3)

| #   | Surface                     | Issue                                                                                                                                      | Architectural fix                                                                                                     |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| F11 | `measure-tool.tsx:396-412`  | Each `SnapPointIndicator` registers its own `useFrame`; 5-15 instances per face all repeat `calculateScaleFromCamera` and quaternion math. | R12                                                                                                                   |
| F12 | `measure-tool.tsx:724-734`  | `lineDirection` memo allocates a fresh `Vector3` each render; downstream allocates 3 `Quaternion`s. Preview line: every pointer event.     | R4 (component split removes preview path); module-scope scratch quaternions for completed lines                       |
| F13 | `measure-tool.tsx:807-825`  | Hit-area IIFE recomputes `hitWidth`/`hitHeight` per render. R3F dedups `planeGeometry`, but IIFE + inline arithmetic adds GC pressure.     | Lift IIFE into `useMemo` (subsumed by R4 — preview component has no hit-area; completed-line memoises once per-mount) |
| F14 | `measure-tool.tsx:909, 922` | Pin-glyph `cylinderGeometry`/`coneGeometry` (16 segments) allocate per-measurement when visible; scales linearly with measurement count.   | R13                                                                                                                   |

### Finding Summary Table

| #   | Severity | Title                                                                                                | Surface                                      |
| --- | -------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| F1  | P0       | Font geometry rebuilt every mouse move (220 KB JSON parse)                                           | `font-geometry.ts`, `measure-tool.tsx:612`   |
| F2  | P0       | Label geometry/material leaks (no dispose on rebuild/unmount)                                        | `measure-tool.tsx:612-645, 538-578`          |
| F3  | P1       | `detectSnapPoints` cold-cache stall (full-mesh allocation, string-keyed canonical map)               | `snap-detection.utils.ts:36-46, 178-197`     |
| F4  | P1       | Raycast bypasses BVH cache; redundant double-raycast inside `detectSnapPoints`                       | `measure-tool.tsx:143`, `snap-detection:161` |
| F5  | P1       | Three sequential setStates per pointer event; float-keyed `SnapPointIndicator` thrashing             | `measure-tool.tsx:167, 176, 180-186, 340`    |
| F6  | P2       | `MeasurementLine` conflates preview + completed, runs label math + memoises geometry it discards     | `measure-tool.tsx:655-720`                   |
| F7  | P2       | `invalidate()` never called after measure-state changes (policy §7 violation)                        | `measure-tool.tsx` (no callsite)             |
| F8  | P2       | `getCachedMeshes` invalidates on `geometryKey` only; mesh-set is React-side instead of machine-owned | `measure-tool.tsx:106-123`                   |
| F9  | P2       | Pointer lifecycle modeled with React refs and post-hoc camera-delta heuristics                       | `measure-tool.tsx:189-208, 213-255`          |
| F10 | P2       | `derivedMaterials` leak per measurement                                                              | `measure-tool.tsx:538-578`                   |
| F11 | P3       | Per-`SnapPointIndicator` `useFrame` redundant camera math                                            | `measure-tool.tsx:396-412`                   |
| F12 | P3       | Quaternion `useMemo` allocates 3 quaternions per direction change                                    | `measure-tool.tsx:724-734`                   |
| F13 | P3       | Hit-area IIFE rebuilds per render                                                                    | `measure-tool.tsx:807-825`                   |
| F14 | P3       | Pin glyph geometries per-measurement                                                                 | `measure-tool.tsx:909, 922`                  |

## Recommendations

Recommendations are numbered for cross-reference. All recommendations are architectural — no quick fixes, heuristics, or band-aid early-returns. Each names the structural source-of-truth move it represents.

| #   | Action                                                                                                                                                                    | Priority | Drives  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------- |
| R1  | Module-scope `Font` singleton + `FontGeometry` LRU with `dispose()` on evict                                                                                              | P0       | F1, F2  |
| R2  | Module-scope `RoundedRectangleGeometry` LRU with `dispose()` on evict                                                                                                     | P0       | F1, F2  |
| R3  | `useEffect` dispose cleanup for every `useMemo`-allocated geometry/material not routed through R1/R2; caller-vs-externally-owned discriminator                            | P0       | F2, F10 |
| R4  | Split `MeasurementLine` into `<MeasurementPreviewLine>` (no label, no hit-area, no pin) and `<MeasurementLine>` (full chrome)                                             | P0       | F6, F12 |
| R5  | Introduce shared `bvhRaycastFirst(raycaster, meshes)` helper next to `bvh-cache.ts`; sole sanctioned interactive picking entry point                                      | P1       | F3, F4  |
| R6  | Replace `detectSnapPoints(mesh, raycaster)` signature with `detectSnapPoints(mesh, intersection)`; `WeakMap`-cache per-geometry world-position + canonical-index pre-pass | P1       | F3, F4  |
| R7  | Single `useReducer` for `{ hoveredSnapPoints, activeSnapPoint, mousePosition }` driven by one dispatch per pointer event                                                  | P1       | F5      |
| R8  | Stable identity-and-type keys on `SnapPointIndicator`; per-face cache returns stable array reference                                                                      | P1       | F5      |
| R9  | Always `useThree((s) => s.invalidate)()` after every measure-state mutation                                                                                               | P2       | F7      |
| R10 | Model measure-tool pointer lifecycle as an explicit state machine; subscribe to drei `OrbitControlsImpl` `'start'`/`'end'` for canonical camera-interacting signal        | P1       | F9      |
| R11 | Promote `pickableMeshesVersion` + `pickableMeshes` to `graphics.machine` context; React-side cache invalidates on version change only                                     | P2       | F8      |
| R12 | Single parent `useFrame` shares scale + camera-facing quaternion across all `SnapPointIndicator` children via context                                                     | P3       | F11     |
| R13 | Module-scope shared pin-glyph geometries (cylinderGeometry + coneGeometry) consumed via `useMemo`-stable references                                                       | P3       | F14     |
| R14 | rAF-coalesce `gl.domElement` pointer events to display refresh rate                                                                                                       | P2       | F5, F9  |

### R1 — Module-scope font + label-geometry cache

The single highest-impact change. Replace `font-geometry.ts` with:

```typescript
import { ExtrudeGeometry } from 'three';
import { FontLoader, type FontData, type Font } from 'three/examples/jsm/Addons.js';
import fontTypeface from '#components/geometry/graphics/three/geometries/geist-mono.typeface.json?raw';

let parsedFont: Font | undefined;

const getFont = (): Font => {
  if (parsedFont) return parsedFont;
  parsedFont = new FontLoader().parse(JSON.parse(fontTypeface) as FontData);
  return parsedFont;
};

const fontGeometryCache = new Map<string, BufferGeometry>();
const fontGeometryCacheCapacity = 64; // LRU cap

export const FontGeometry = ({ text, depth, size }: { text: string; depth: number; size: number }): BufferGeometry => {
  const key = `${text}|${size}|${depth}`;
  const cached = fontGeometryCache.get(key);
  if (cached) {
    fontGeometryCache.delete(key);
    fontGeometryCache.set(key, cached);
    return cached;
  }
  const shapes = getFont().generateShapes(text, size);
  const geometry = new ExtrudeGeometry(shapes, { depth, bevelEnabled: false });
  geometry.center();
  fontGeometryCache.set(key, geometry);
  if (fontGeometryCache.size > fontGeometryCacheCapacity) {
    const oldestKey = fontGeometryCache.keys().next().value as string;
    const oldest = fontGeometryCache.get(oldestKey);
    fontGeometryCache.delete(oldestKey);
    oldest?.dispose();
  }
  return geometry;
};
```

**Caveat**: callers must NOT mutate or `.dispose()` the returned geometry. Convention shift documented in JSDoc.

### R2 — Module-scope rounded-rectangle cache

Same pattern as R1 for `RoundedRectangleGeometry`. Background placeholder text is constant-width per measurement count (e.g. `"0000"` for a 4-character distance), so the cardinality is small and LRU is fully effective.

### R3 — Explicit dispose for caller-owned resources (when not module-cached)

Every `useMemo`-allocated `BufferGeometry` / `Material` not routed through an R1/R2 LRU pairs with a `useEffect(() => () => resource.dispose(), [resource])` cleanup. The cleanup runs both when the memo dep array changes (replacement) and when the component unmounts.

For `derivedMaterials`, the discriminator from policy §10 governs ownership: materials supplied via the `materials` prop are caller-owned and skipped; materials allocated internally (the `undefined`-prop production path) own their lifetime and dispose on unmount. The same discriminator pattern extends to any future component that accepts an externally supplied resource.

After R1/R2 land, the only consumer of this rule inside `MeasureTool` is `derivedMaterials` itself (label geometries route through the LRU). The rule still applies to any new geometry/material allocations — the policy guard (proposed §13) catches them at code-review time.

### R4 — Split preview-line and completed-line into distinct components

Preview-line and completed-line are different semantic objects: the preview has no label, no hit-area, no pin button, and a different lifecycle (mounted only during `drawingSecondPoint`). Conflating them in one `MeasurementLine` component forces the preview to memoize geometries it never renders (Finding 6) and forces conditional rendering in nearly every JSX block.

Split into two components:

- `<MeasurementPreviewLine start end>` — only the cylinder + arrow line group. No label `useMemo`s, no `labelGroupRef` `useFrame` math, no font geometry, no hit-area.
- `<MeasurementLine id start end distance ...>` — full chrome (label, background, outline, pin, hit-area).

Compose at the call site in `MeasureTool` (already does — `isPreview` is hard-coded `true` for the preview, hard-coded `false` for completed measurements). After the split, the boolean prop disappears entirely; the JSX names communicate intent.

This is a structural fix — fewer code paths to reason about, no preview-specific dead-code branches inside the completed-line implementation.

### R5 — Shared `bvhRaycastFirst` helper as the sole interactive picking entry point

Add `apps/ui/app/components/geometry/graphics/three/utils/bvh-raycast.ts`:

```typescript
import * as THREE from 'three';
import type { MeshBVH } from 'three-mesh-bvh';
import { getOrBuildBvh } from '#components/geometry/graphics/three/utils/bvh-cache.js';

const _localRay = new THREE.Ray();
const _inverseMatrix = new THREE.Matrix4();

export function bvhRaycastFirst(
  raycaster: THREE.Raycaster,
  meshes: readonly THREE.Mesh[],
): THREE.Intersection | undefined {
  let best: THREE.Intersection | undefined;
  for (const mesh of meshes) {
    const bvh: MeshBVH = getOrBuildBvh(mesh.geometry);
    _inverseMatrix.copy(mesh.matrixWorld).invert();
    _localRay.copy(raycaster.ray).applyMatrix4(_inverseMatrix);
    const hit = bvh.raycastFirst(_localRay, raycaster.params.Mesh ?? {}) ?? undefined;
    if (!hit) continue;
    hit.object = mesh;
    hit.point.applyMatrix4(mesh.matrixWorld);
    hit.distance = raycaster.ray.origin.distanceTo(hit.point);
    if (!best || hit.distance < best.distance) best = hit;
  }
  return best;
}
```

`MeasureTool` calls `bvhRaycastFirst(raycaster, meshes)` once per pointer event. Module-scope scratch (`_localRay`, `_inverseMatrix`) eliminates per-call allocation.

The `Mesh.prototype.raycast = acceleratedRaycast` global monkey-patch is **rejected**: it imposes app-wide side effects on every raycast (drei `OrbitControls`, `TransformControls`, gizmo cube hover, `<select>` helpers, future tooling) and makes the integration impossible to grep. Per-callsite `bvhRaycastFirst` keeps every consumer auditable.

### R6 — `detectSnapPoints(mesh, intersection)` + per-geometry pre-pass cache

Two architectural changes:

1. **Signature change**: `detectSnapPoints(mesh, intersection)` accepts the already-resolved intersection. `getRaycastIntersection` (`snap-detection.utils.ts:161-176`) is deleted. Eliminates redundant raycast (Finding 4) and decouples `detectSnapPoints` from `THREE.Raycaster`.

2. **Per-geometry pre-pass cache** keyed by `BufferGeometry` identity in a `WeakMap`:

   ```typescript
   type GeometryPrePass = {
     readonly worldMatrixHash: number;
     readonly worldPositions: ReadonlyArray<THREE.Vector3>;
     readonly canonicalIndex: ReadonlyArray<number>;
     readonly triangles: ReadonlyArray<Triangle>;
   };

   const prePassCache = new WeakMap<THREE.BufferGeometry, GeometryPrePass>();
   ```

   `worldPositions` recomputes only when `mesh.matrixWorld` changes (cheap hash of its 16 elements). The `canonicalIndex` map uses an integer grid hash (`Math.round(v.x * 1e5) | 0` packed into a bigint key) instead of `toFixed(5)` string keys — eliminates string allocations per vertex.

   Per-face cache (`snapCacheRef`) sits on top, keyed by `(geometry, faceIndex)` — survives across mesh re-instantiation when the geometry is reused.

### R7 — Single `useReducer` for snap state

Replace three `useState` calls with one reducer:

```typescript
type SnapAction = { type: 'pointerMove'; payload: SnapState } | { type: 'reset' };

const [snap, dispatch] = useReducer(snapReducer, initialSnap);
// Handler dispatches once per event; React 19 auto-batches one render.
```

Combined with `bvhRaycastFirst` and the pre-pass cache, the full pointer-event critical path is one dispatch + one `invalidate()`.

### R8 — Stable identity-and-type keys for `SnapPointIndicator`

`SnapPoint` already has a deterministic order per face (the cache returns the same array reference until the face changes). Index-and-type keys eliminate mount/unmount churn entirely while a face stays hovered:

```typescript
{snap.hoveredSnapPoints.map((snapPoint, index) => (
  <SnapPointIndicator key={`${snapPoint.type}-${index}`} ... />
))}
```

When the hovered face changes the array reference changes wholesale, so old indicators unmount and new ones mount **once** per face transition rather than three times per pointer event.

### R9 — `invalidate()` after every measure-state mutation

Codified by Policy §7b (proposed below). Implementation:

```typescript
const invalidate = useThree((state) => state.invalidate);
// Inside the rAF tick after dispatch:
dispatch({ type: 'pointerMove', payload: nextSnap });
invalidate();
```

### R10 — Pointer lifecycle as an explicit state machine sourcing camera-interacting from drei

Add `measureInputMachine` (or a sub-state in `graphics.machine`) with discrete states `idle → hovering → drawingFirstPoint → drawingSecondPoint → cancelled` plus a parallel `cameraInteracting` substate entered on drei `OrbitControlsImpl` `'start'` and exited on `'end'`. `MeasureTool` reads `cameraInteracting` via `useGraphicsSelector` and gates pointer handlers on it. Down→up drag-vs-click discrimination is the machine's responsibility — if `cameraInteracting` was entered between `pointer.down` and `pointer.up`, the up event is a view manipulation, not a click.

Outcomes: three React refs (`mouseIsDownRef`, `pointerDownOnMeshRef`, etc.) collapse into one declarative source; two camera-quaternion / position-delta heuristics (`measure-tool.tsx:217-220, 244-248`) are deleted; pointer processing during a drag is structurally impossible (gate is at the machine level), not contingent on a manual handler-body early-return.

### R11 — `pickableMeshesVersion` on `graphics.machine`

Add to `graphics.machine` context:

```typescript
context: {
  // ...existing fields...
  pickableMeshesVersion: number;       // monotonic counter
  pickableMeshes: readonly THREE.Mesh[]; // derived; recomputed in actions that bump version
}
```

Every action that mutates scene composition (geometry load/unload, visibility toggle, section-view plane add/remove, transient-helper mount/unmount) ends with `assign({ pickableMeshesVersion: ({ context }) => context.pickableMeshesVersion + 1, pickableMeshes: <selector> })`. The traversal happens once per scene mutation, inside the machine, not on every cache miss in the React layer.

`MeasureTool` reads:

```typescript
const meshes = useGraphicsSelector((s) => s.context.pickableMeshes);
```

The React-side `cachedMeshesRef` + `getCachedMeshes` collapse — there is no React cache, only a memoised machine selector. `geometryKey` returns to its semantic role (geometry content version) without doing double duty as a mesh-set cache key.

### R12 — Single parent `useFrame` for snap-indicator transforms

Each `SnapPointIndicator` currently registers its own `useFrame` (Finding 11). Replace with a single parent `useFrame` in `MeasureTool` that:

1. Reads `camera.position` / `camera.quaternion` once per frame.
2. Computes shared scale + camera-facing quaternion.
3. Writes through to each indicator via `useImperativeHandle`-style refs (or via a `MeasureUiTransformContext` consumed by all indicators).

For N indicators, frame work goes from `N` reads of camera state + `N` quaternion computations to `1` of each.

### R13 — Module-scope shared pin-glyph geometries

Move pin-glyph cylinder + cone geometries to module scope, allocated once:

```typescript
const PIN_GLYPH_CYLINDER = new THREE.CylinderGeometry(0.12, 0.12, 0.4, 16);
const PIN_GLYPH_CONE = new THREE.ConeGeometry(0.15, 0.35, 16);
```

Use `<primitive object={PIN_GLYPH_CYLINDER} attach='geometry' />`. All measurements share one geometry instance regardless of count.

### R14 — rAF-coalesced pointer events

Pointer events fire faster than `requestAnimationFrame`. The architectural rule (Policy §15 below): coalesce so each frame processes the most recent event:

```typescript
let pending: PointerEvent | undefined;
let rafId = 0;
const handlePointerMove = (event: PointerEvent): void => {
  pending = event;
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = 0;
    if (pending) processPointer(pending);
    pending = undefined;
  });
};
```

Bounded to display refresh rate; aligns naturally with `frameloop='demand'`. Camera-drag suppression is **not** part of this recommendation — that's R10's responsibility (the state machine gates `processPointer`).

## Policy Gap Analysis

`docs/policy/graphics-backend-policy.md` is currently silent on five areas this audit surfaced. Each is a recurring bug class — not specific to `MeasureTool` — that warrants codification so the next interactive overlay (annotation tools, dimensioning, BOM tags) does not relearn the same lessons.

### Gap PG-1: Geometry caching for high-cardinality, low-distinctiveness derived geometry

**Current state**: §10 covers material ownership for clone-and-render surfaces but says nothing about **caching factory-produced derived geometry** consumed by interactive overlays. `FontGeometry`, `RoundedRectangleGeometry`, and any future "build a geometry from string params" factory has no guidance.

**Proposed addition** (new §12):

> ### 12. Factory-produced derived geometry uses module-scope LRU caching
>
> Geometry factories whose output is **fully determined by primitive arguments** (font text+size+depth, rounded-rectangle width+height+radius, etc.) MUST cache results with a bounded LRU keyed by stringified args. Eviction MUST call `.dispose()` on the evicted geometry. Callers MUST treat returned geometries as **non-owned** — never `.dispose()` cache-returned geometries, never mutate them in place.
>
> **Why**: Without caching, every state change that touches the factory args (mouse move, hover toggle, distance recomputation) rebuilds the geometry from scratch. With per-call disposal, a typical interactive session leaks hundreds of `BufferGeometry` instances. With caching but without dispose-on-evict, the cache itself becomes the leak.
>
> Reference implementation: `apps/ui/app/components/geometry/graphics/three/geometries/font-geometry.ts` (`getFont` singleton + `fontGeometryCache` LRU + `dispose()` on evict).

### Gap PG-2: Dispose ownership for `useMemo`-produced geometry/materials

**Current state**: §10 enforces dispose discipline for **clone-and-render** scene-traversal surfaces but does not cover the more common React pattern: `useMemo` that returns a fresh `BufferGeometry` / `Material` whose dependency array changes during normal interaction.

**Proposed addition** (new §13):

> ### 13. `useMemo`-allocated geometry/materials require dispose effects
>
> Any React component that owns a `useMemo`-produced `THREE.BufferGeometry`, `THREE.Material`, or `THREE.Texture` that is **not** routed through a module-scope cache (per §12) MUST pair it with a `useEffect(() => () => resource.dispose(), [resource])` cleanup. The cleanup MUST run when:
>
> 1. The memo dependency array changes (replacing the resource).
> 2. The component unmounts.
>
> Externally supplied resources (`materials` prop in `MeasurementLine`, etc.) MUST be discriminated and skipped — caller-owned resources have caller-owned lifetime.
>
> **Why**: Three.js does NOT auto-dispose detached resources. `<primitive object={geometry} attach='geometry' />` swap leaves the previous geometry's GPU buffers alive until manual `.dispose()` is called. Long-running interactive sessions (measure mode, annotation mode, transform mode) therefore leak monotonically.
>
> Test pattern: a `node`-environment vitest that mounts/unmounts the component and asserts `BufferGeometry.dispose` was called the expected number of times.

### Gap PG-3: Render-loop discipline for tool overlays under `frameloop='demand'`

**Current state**: §7 mandates `frameloop='demand'` and tells consumers to "Call `invalidate()` after user gestures." This is correct but easy to overlook for tool overlays whose state lives in event handlers far from the render path.

**Proposed addition** (extension of §7, new §7b):

> ### 7b. Interactive overlay tools must invalidate after every user-driven state change
>
> Tool overlays (measure, section-view manipulators, annotation pickers, gizmo handles) hold their own React/XState state outside the main scene graph. **Every state mutation that affects what is drawn MUST be paired with an explicit `invalidate()` call** before the handler returns, even when `OrbitControls`/damping is "probably" already invalidating.
>
> Test pattern: a vitest that subscribes to `useThree().invalidate`, fires a synthetic mouse event into the tool's handler, and asserts `invalidate` was called.
>
> **Why**: Under `frameloop='demand'`, a missing `invalidate()` shows up as visible stutter — the preview line lags the cursor by exactly the latency of the next external invalidate trigger. With `OrbitControls` damping providing accidental invalidates, the bug only surfaces on a still camera, making it hard to diagnose in QA.

### Gap PG-4: Raycast acceleration for interactive picking

**Current state**: §1 routes renderer construction through `createTauRenderer`. There is no equivalent guidance for **raycasting**, even though the workspace already ships `getOrBuildBvh()` (`apps/ui/app/components/geometry/graphics/three/utils/bvh-cache.ts`).

**Proposed addition** (new §14):

> ### 14. Interactive raycasting routes through the shared `bvhRaycastFirst` helper
>
> Any code path that performs a raycast from a **pointer-event-rate handler** (snap detection, hover preview, transform-handle drag, picking) MUST call `bvhRaycastFirst(raycaster, meshes)` from `apps/ui/app/components/geometry/graphics/three/utils/bvh-raycast.ts`. Direct `THREE.Raycaster.intersectObjects` / `intersectObject` calls at pointer-event rate are banned.
>
> Non-interactive raycasts (one-shot picks initiated by a discrete click, screenshot/export pipelines, test setup) MAY use stock three.js raycasting.
>
> Global `Mesh.prototype.raycast = acceleratedRaycast` monkey-patches are **prohibited**: they impose app-wide side effects on every raycast (drei `OrbitControls`, `TransformControls`, gizmo cube hover, `<select>` helpers) and make the integration impossible to audit. Per-callsite consumption through the helper keeps every interactive picking surface explicit and greppable.
>
> **Why**: Stock `Mesh.prototype.raycast` performs an `O(triangles)` scan per mesh per call. At native pointer event rate (often 120-240 Hz), this dominates CPU on dense CAD assemblies. Centralising in `bvhRaycastFirst` also amortises the per-mesh inverse-matrix transform and "closest intersection wins" logic across every consumer.

### Gap PG-5: Mouse-move handler discipline for high-frequency input

**Current state**: §7 implicitly assumes one event = one render; says nothing about input-rate-vs-frame-rate mismatch.

**Proposed addition** (new §15):

> ### 15. High-frequency pointer events are rAF-coalesced
>
> `mousemove` / `pointermove` event handlers attached to `gl.domElement` for picking, snapping, or hover preview MUST coalesce events to display refresh rate via `requestAnimationFrame`. The handler stores the latest event, schedules a single rAF tick if none is pending, and processes the most recent event inside the tick.
>
> Pattern:
>
> ```typescript
> let pending: PointerEvent | undefined;
> let rafId = 0;
> const handler = (event: PointerEvent): void => {
>   pending = event;
>   if (rafId) return;
>   rafId = requestAnimationFrame(() => {
>     rafId = 0;
>     if (pending) process(pending);
>     pending = undefined;
>   });
> };
> ```
>
> Suppressing pointer processing during camera manipulation is **not** part of this rule — it belongs to §16 (the tool's pointer-state machine reads camera-interaction state from drei's `OrbitControlsImpl` events). Heuristic camera-quaternion / position-delta epsilons inside the pointer handler are banned.
>
> **Why**: Native pointer events fire at the input device's native rate (often 240 Hz on high-refresh trackpads, 120 Hz on Apple Magic Mouse). Display refresh is 60-120 Hz. Without rAF coalescing, two-thirds of pointer events trigger raycasts whose results the user never sees.

### Gap PG-6: Pointer-state ownership for interactive overlays

**Current state**: The policy is silent on how interactive overlays (measure tool, future annotation tools, custom transform handles) should own their pointer lifecycle. The current measure-tool implementation models pointer state as three boolean React refs (`mouseIsDownRef`, `pointerDownOnMeshRef`, plus the `activeSnapPointRef` data ref) and discriminates click-vs-drag with post-hoc camera-quaternion and position-delta epsilons (`measure-tool.tsx:217-220, 244-248`). This pattern is structurally fragile (silent mis-classification on slow drags, edge-case epsilon failures) and recurs every time someone builds a new tool overlay.

**Proposed addition** (new §16):

> ### 16. Interactive tool overlays model their pointer lifecycle as an explicit state machine; camera-interacting state is sourced from `OrbitControlsImpl` events
>
> Tool overlays that consume pointer events from `gl.domElement` MUST own their pointer lifecycle as an explicit XState machine (either a sub-state of `graphics.machine` or a sibling actor spawned by it). The machine MUST expose a `cameraInteracting` parallel state driven by **drei's `OrbitControlsImpl` `'start'` and `'end'` events** — the canonical, authoritative signal for "the user is dragging the camera right now."
>
> Banned patterns:
>
> - Discriminating click-vs-drag at `pointerup` by diffing the camera quaternion / position against a captured pre-`pointerdown` snapshot.
> - Multiple boolean React refs (`mouseIsDownRef`, `pointerDownOnMeshRef`, etc.) tracking overlapping aspects of pointer lifecycle.
> - "Probably stopped dragging" heuristics based on time, distance, or velocity thresholds.
>
> Required:
>
> - One state machine, one source of truth, declarative transitions (`idle → hovering → drawingFirstPoint → drawingSecondPoint`).
> - `cameraInteracting` parallel state subscribed to `OrbitControlsImpl.addEventListener('start' | 'end', ...)`.
> - Pointer-event handlers gate on the machine's current state, not on React refs or post-hoc geometry deltas.
>
> **Why**: Drei exposes the canonical signal directly. Camera-delta heuristics drift (slow drags below the epsilon mis-classify; fast camera animations from outside the tool also trigger the heuristic). Modelling the lifecycle declaratively also collapses the testable surface — one set of state transitions covers every tool overlay rather than each tool relearning the heuristic edge cases.

### Summary of Proposed Policy Additions

| Section | Title                                                                                         | Status | Drives  |
| ------- | --------------------------------------------------------------------------------------------- | ------ | ------- |
| §7b     | Tool overlays must `invalidate()` after every user-driven state mutation                      | New    | F7      |
| §12     | Factory-produced derived geometry uses module-scope LRU caching with `dispose()` on evict     | New    | F1, F2  |
| §13     | `useMemo`-allocated geometry/materials require `useEffect` dispose cleanup                    | New    | F2, F10 |
| §14     | Interactive raycasting routes through the shared `bvhRaycastFirst` helper                     | New    | F4      |
| §15     | High-frequency pointer events are rAF-coalesced                                               | New    | F5, F14 |
| §16     | Tool overlays model pointer lifecycle as a state machine; camera-interacting from drei events | New    | F9      |

The six additions are mutually independent and can land in separate PRs.

## Diagrams

Pointer event flow comparison (current → proposed):

```
CURRENT:                                    PROPOSED:
PointerEvent (240 Hz)                       PointerEvent (240 Hz)
  ├ raycast O(triangles)                      ├ machine.matches('camera.interacting')? → drop
  ├ detectSnapPoints (miss = O(tri²))         ├ rAF coalesce → display refresh
  │   └ REDUNDANT raycast                     ├ bvhRaycastFirst(raycaster, meshes) — O(log triangles)
  ├ setState × 3 → 3 React renders            ├ detectSnapPoints(mesh, intersection)  [single raycast]
  └ MeasurementLine re-renders                ├ dispatch({ pointerMove, payload }) → 1 React render
       └ FontGeometry rebuild:                └ invalidate()
           ├ new FontLoader                        │
           ├ JSON.parse(220 KB)  ~3-8ms            └ MeasurementLine re-renders
           ├ font.generateShapes                       └ FontGeometry — cache hit ≈ 0ms
           └ new ExtrudeGeometry  ~5-15ms                  (cache evict → dispose)
       (previous geometry leaked)            Source-of-truth shifts:
                                              • pickable meshes → graphics.machine
                                              • camera-interacting → OrbitControlsImpl events
                                              • pointer lifecycle → measureInputMachine
                                              • derived geometry → module-scope LRU
```

## Implementation Status

**Status: implemented** (2026-05-27)

All recommendations **R1–R14** and policy additions **§7b, §12, §13, §14, §15, §16** are landed:

| Item                 | Deliverable                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| R1–R3, §12–§13       | `geometry-lru.ts`, LRU in `font-geometry.ts` / `rounded-rectangle-geometry.ts`, `measurement-line-materials.ts` dispose discriminator |
| R5–R6, §14           | `bvh-raycast.ts`, `detectSnapPoints(mesh, intersection)`, WeakMap pre-pass + integer grid hash                                        |
| R11                  | `pickableMeshesVersion` on `graphics.machine`                                                                                         |
| R10, §16             | `measure-input.machine.ts`, `cameraInteracting`, `useMeasureInput()`                                                                  |
| R4                   | `measurement-preview-line.tsx`                                                                                                        |
| R7–R9, R14, §7b, §15 | `useReducer` snap state, stable snap keys, `createRafCoalescer`, `invalidate()`                                                       |
| R12–R13              | `MeasureUiTransformContext`, shared `PIN_GLYPH_*` geometries                                                                          |

## References

- Policy: `docs/policy/graphics-backend-policy.md` (§7b, §10, §12–§16)
- Existing cache: `apps/ui/app/components/geometry/graphics/three/utils/bvh-cache.ts`
- Existing consumer of BVH cache: `apps/ui/app/components/geometry/graphics/three/react/section-contour-fill.tsx:165`
- Related research: `docs/research/gltf-edges-fat-line-performance.md` (shared-material caching pattern that this audit's R1/R2 mirror for geometry)
- Related research: `docs/research/webgpu-axes-hover-pipeline-stall.md` (per-frame texture work avoidance — same `frameloop='demand'` discipline)
- Three.js BufferGeometry dispose: <https://threejs.org/docs/#api/en/core/BufferGeometry.dispose>
- three-mesh-bvh: <https://github.com/gkjohnson/three-mesh-bvh>
- React 19 auto-batching: <https://react.dev/blog/2024/12/05/react-19#actions>

## Appendix: Verification Checklist

After landing R1-R14, verify:

- [ ] DevTools Performance tab: pointer-event handler ≤ 1 ms per call (currently 5-20 ms on dense meshes).
- [ ] Memory tab: snapshot before measure mode, run 60 seconds of cursor movement across many faces, snapshot again. Heap delta < 5 MB (currently grows ~30-50 MB).
- [ ] `BufferGeometry` count (via `renderer.info.memory.geometries`) is bounded — does not grow monotonically during measure mode.
- [ ] Preview line tracks cursor without visible lag on a **still camera** (no `OrbitControls` damping to mask missing `invalidate()` calls).
- [ ] First hover on a fresh face on a 100 K-triangle mesh ≤ 5 ms (currently 50-200 ms).
- [ ] Grep audit: zero `intersectObjects` / `intersectObject` callsites at pointer-event rate outside `bvh-raycast.ts`.
- [ ] Grep audit: zero references to `mouseIsDownRef`, `pointerDownOnMeshRef`, `startCameraQuatRef`, `startCameraPosRef` after R10 lands.
- [ ] Grep audit: zero `Mesh.prototype.raycast = acceleratedRaycast` callsites (banned by Policy §14).
- [ ] `measureInputMachine` test asserts `cameraInteracting` enters/exits on synthetic `OrbitControlsImpl` `'start'`/`'end'` events.
- [ ] `graphics.machine` test asserts `pickableMeshesVersion` increments on every scene-composition mutation action.
- [ ] No regression in `apps/ui/app/components/geometry/graphics/three/react/measure-tool.test.tsx` (if present) and `apps/ui-e2e/src/graphics-backend.spec.ts`.
