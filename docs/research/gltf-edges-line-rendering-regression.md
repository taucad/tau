---
title: 'GLTF edge line rendering regression (WebGL + WebGPU)'
description: 'Root-cause analysis of line-over-surface occlusion regressions in gltf-edges.ts on both WebGL (three r180 macro rename) and WebGPU (missing depth bias on Line2NodeMaterial)'
status: active
created: '2026-05-08'
updated: '2026-05-08'
category: investigation
related:
  - docs/policy/graphics-backend-policy.md
  - docs/policy/webgpu-rendering-pipeline.md
  - docs/research/webgpu-render-loop-audit.md
---

# GLTF edge line rendering regression (WebGL + WebGPU)

Why edge lines emitted by the kernel edge-detection middleware no longer render crisply over surfaces in either three.js backend, and how to restore staging-quality occlusion.

## Executive Summary

Two independent regressions caused `apps/ui/app/components/geometry/graphics/three/materials/gltf-edges.ts` to render edges that fight or disappear behind coplanar surfaces. **WebGL** broke when the workspace upgraded `three` from `^0.179.1` to `^0.184.0`: r180 silently renamed the shader define `USE_LOGDEPTHBUF` → `USE_LOGARITHMIC_DEPTH_BUFFER` (PR [mrdoob/three.js#31564](https://github.com/mrdoob/three.js/pull/31564)), so the former `LineMaterial.onBeforeCompile` fragment replacement keyed on `USE_LOGDEPTHBUF` became dead code. **WebGPU** regressed when the fat-line branch used `Line2NodeMaterial` without a `depthNode` coplanar bias. **Remediation (current tree)**: vertex-only `vFragDepth` multiplication under `USE_LOGARITHMIC_DEPTH_BUFFER` for WebGL perspective cameras, shared `depthBiasFactor`, WebGPU `depthNode = viewZToReversedPerspectiveDepth(positionView.z.mul(depthBiasFactor), …)` (matches the viewport's `reversedDepthBuffer: true` encoding — the original `viewZToPerspectiveDepth` form emitted non-reversed `[0,1]` depth into a reversed-Z buffer and made every line fragment beat any surface, the "lines never occluded" follow-up symptom), plus `powerPreference: 'high-performance'` restored on WebGL in `tau-renderer.ts`. Orthographic bias remains a follow-up.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Methodology](#methodology)
- [Findings](#findings)
- [Recommendations](#recommendations)
- [Trade-offs](#trade-offs)
- [Code Examples](#code-examples)
- [Diagrams](#diagrams)
- [References](#references)

## Problem Statement

User-reported regression on the local (HEAD + working tree) build:

| Image | Backend                                          | Surface | Observation                                                                                                            |
| ----- | ------------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1     | WebGPU                                           | off     | Crisp wireframe (lines visible everywhere) — baseline                                                                  |
| 2     | WebGPU                                           | on      | Lines barely visible; surface "wins" the depth comparison at every coplanar pixel, MSAA averages it to a faint smear   |
| 3     | WebGL                                            | off     | Crisp wireframe                                                                                                        |
| 4     | WebGL                                            | on      | **Worse** than WebGPU — most internal characteristic edges disappear entirely, only silhouette + outermost rim survive |
| 5–6   | WebGL (production / `taucad.dev`, `origin/main`) | on      | Reference: every edge crisp on top of the surface, including interior characteristic curves                            |

The reference build (img 5–6) ships from `origin/main`, which still pins `three@^0.179.1` and uses an older single-backend rendering path. The local working tree has both upgraded `three` to `^0.184.0` and added a new WebGPU branch. Both code paths regressed independently.

## Methodology

1. **Working-tree diff vs origin/main** for every file under `apps/ui/app/components/geometry/` and the workspace `package.json` to inventory functional changes.
2. **Three.js source inspection** at `node_modules/three/examples/jsm/lines/LineMaterial.js` and `node_modules/three/src/renderers/shaders/ShaderChunk/logdepthbuf_*.glsl.js` to confirm the active shader chunk semantics and define names in r0.184.0.
3. **R3F source inspection** at `node_modules/@react-three/fiber/dist/events-f19bcc32.cjs.dev.js:15640` to determine how `gl` factory results bypass R3F's default `WebGLRenderer` parameters.
4. **External corroboration** via [pmndrs/postprocessing#731](https://github.com/pmndrs/postprocessing/issues/731) where a different consumer hit the same r180 rename and confirmed the breaking change is in `r180`, undocumented in the migration guide.
5. **WebGPU material capability check** via `node_modules/three/src/materials/nodes/NodeMaterial.js:265,289` (`positionNode`, `depthNode`) to confirm the TSL hook surface for a parity fix.

## Findings

### Finding 1: three r180 silently renamed `USE_LOGDEPTHBUF` to `USE_LOGARITHMIC_DEPTH_BUFFER` and our shim never updated

**Evidence (current chunk in three 0.184)** — `node_modules/three/src/renderers/shaders/ShaderChunk/logdepthbuf_fragment.glsl.js`:

```glsl
#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
  gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif
```

**Evidence (historical broken injection)** — superseded fix; snippet describes the regression only:

```251:267:apps/ui/app/components/geometry/graphics/three/materials/gltf-edges.ts
shader.fragmentShader = shader.fragmentShader.replace(
  '#include <logdepthbuf_fragment>',
  `#if defined( USE_LOGDEPTHBUF )
    float adjustedBias = pow(depthBias, vFovScale);
    float biasedFragDepth = vFragDepth * adjustedBias;
    #if defined( USE_LOGDEPTHBUF_EXT )
      gl_FragDepthEXT = log2( biasedFragDepth ) * logDepthBufFC * 0.5;
    #else
      gl_FragDepth = log2( biasedFragDepth ) * logDepthBufFC * 0.5;
    #endif
  #endif`,
);
```

In r0.184 the engine never defines `USE_LOGDEPTHBUF`, so the entire injected block is preprocessed out. The replacement removes three's own `<logdepthbuf_fragment>` chunk _and_ substitutes nothing executable, leaving the line fragment shader with no `gl_FragDepth` write at all. Meanwhile every surface mesh still hits the new chunk and writes log-encoded depth.

**Consequence**: surfaces sample depth via `log2(vFragDepth) * logDepthBufFC * 0.5` (typically `~0.99` near the far plane); coplanar line fragments leave the rasterized linear `gl_FragCoord.z` (often very different magnitude) in the depth buffer. Depth comparison becomes effectively random for any line/surface pair that should be coplanar — exactly the "inner characteristic edges vanish on WebGL" failure mode (img 4 vs reference img 5–6).

**Upstream timeline** (per [pmndrs/postprocessing#731](https://github.com/pmndrs/postprocessing/issues/731) and PR [#31564](https://github.com/mrdoob/three.js/pull/31564)):

- **r178/r179**: `USE_LOGDEPTHBUF` define + `USE_LOGDEPTHBUF_EXT` WebGL1 branch — our shim works.
- **r180**: PR #31564 "Src: Nomenclature clean up" renames the macros to `USE_LOGARITHMIC_DEPTH_BUFFER` and `USE_REVERSED_DEPTH_BUFFER` and consolidates the fragment chunk to a single perspective/ortho ternary using a new `vIsPerspective` varying. **Not** documented in the release notes or migration guide.
- **r184** (our pinned version): rename still in force.

**Status**: ✅ RESOLVED — `createEdgeLineMaterial` now appends bias only in the vertex shader after `<logdepthbuf_vertex>` (under `USE_LOGARITHMIC_DEPTH_BUFFER`), leaving three.js `<logdepthbuf_fragment>` authoritative so line and surface depths share encoding.

### Finding 2: New WebGPU branch shipped `Line2NodeMaterial` without coplanar depth bias

Historical shape (material factory returned a bare `Line2NodeMaterial` with no custom depth):

```typescript
export function createWebGpuGltfFatLineMaterial(): Line2NodeMaterial {
  return new Line2NodeMaterial({
    color: defaultEdgeColor,
    linewidth: defaultLineWidth,
    worldUnits: false,
  });
}
```

Missing `depthNode` caused coplanar lines to ghost under MSAA when surfaces won the depth test at subsample resolution.

**Status**: ✅ RESOLVED — `createWebGpuGltfFatLineMaterial` assigns `depthNode = viewZToReversedPerspectiveDepth(positionView.z.mul(depthBiasFactor), cameraNear, cameraFar)` (perspective viewport; ortho follow-up deferred). The reversed variant is required because the WebGPU viewport runs with `reversedDepthBuffer: true`; using the non-reversed `viewZToPerspectiveDepth` emits `[0,1]` non-reversed values into the reversed-Z attachment, which makes every line fragment beat any surface (lines visible even when occluded — the smoking-gun symptom that surfaced after the initial R2 fix). Three.js's own `PointShadowNode` uses the same `if (renderer.reversedDepthBuffer) → viewZToReversedPerspectiveDepth` switch.

### Finding 3: Renderer factory drops R3F's `powerPreference` default (tertiary)

**Status**: ✅ RESOLVED — WebGL instantiation in `createTauRenderer` now sets `powerPreference: 'high-performance'`.

`node_modules/@react-three/fiber/dist/events-f19bcc32.cjs.dev.js:15640-15655`:

```javascript
const defaultProps = {
  canvas: canvas,
  powerPreference: 'high-performance',
  antialias: true,
  alpha: true,
};
const customRenderer = typeof glConfig === 'function' ? await glConfig(defaultProps) : glConfig;
if (isRenderer(customRenderer)) {
  gl = customRenderer; // factory result used as-is — defaults NOT merged
} else {
  gl = new THREE.WebGLRenderer({ ...defaultProps, ...glConfig }); // object form merges defaults
}
```

`origin/main` passes `gl={{ logarithmicDepthBuffer: true, antialias: true, stencil: true }}` (object), so R3F merges `powerPreference: 'high-performance'` into the WebGL context request. The local `createTauR3fGlProp` factory pulls only `defaults.canvas` from R3F and discards the rest. On hybrid GPUs (e.g. Apple Silicon, NVIDIA Optimus) the integrated GPU may now be selected, which can change MSAA quality, depth precision, and driver path. This alone does not explain the "inner lines disappear" symptom but compounds it.

### Finding 4: New chunk handles ortho cameras inline; the existing FOV shim is no longer needed

The new `<logdepthbuf_fragment>` chunk uses `vIsPerspective` (set by `<logdepthbuf_vertex>` to `float(isPerspectiveMatrix(projectionMatrix))`) and falls back to raw `gl_FragCoord.z` for orthographic cameras. `createEdgeLineMaterial` (`gltf-edges.ts:213-268`) duplicates that branch via `projectionMatrix[3][3] == 0.0` to compute `vFovScale`. With a vertex-side bias (Recommendation R1) we still need the FOV scale for perspective cameras, but we can stop replacing the fragment chunk altogether and let three handle the perspective/ortho switch.

### Finding 5: Multiplicative log-space bias does not work for orthographic depth

Even if we fix the define name, the existing math (`gl_FragDepth = log2(vFragDepth * bias) * logDepthBufFC * 0.5`) only produces a constant additive offset _in log space_. The new chunk emits raw `gl_FragCoord.z` for orthographic cameras (no `log2`), so the same multiplicative shim has no effect on ortho depth values. Tau viewports default to orthographic when the user toggles the projection mode, so any restoration of the WebGL path needs an ortho-aware bias path or must move bias into NDC z.

## Recommendations

**Orthographic follow-up (intentionally deferred)**: R1/R2 above target **perspective** viewports only. On WebGL, three's log-depth fragment chunk writes raw `gl_FragCoord.z` for orthographic cameras, so a multiplicative `vFragDepth` bias is a no-op there; WebGPU `depthNode` uses `viewZToPerspectiveDepth` and likewise does not model orthographic projection. A dedicated ortho bias (for example a small `gl_Position.z` nudge on WebGL and `viewZToOrthographicDepth` on WebGPU) remains future work if coplanar edge visibility regresses in orthographic mode.

| #   | Action                                                                                                                                                                                                                                                                                                                                                  | Priority | Effort | Impact |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------ |
| R1  | Rewrite `createEdgeLineMaterial` to bias `vFragDepth` in the **vertex** shader (after `<logdepthbuf_vertex>`) and stop replacing `<logdepthbuf_fragment>` entirely — **implemented** in `apps/ui/app/components/geometry/graphics/three/materials/gltf-edges.ts` (`USE_LOGARITHMIC_DEPTH_BUFFER`, perspective branch only).                             | P0       | Low    | High   |
| R2  | Add `depthNode` on `createWebGpuGltfFatLineMaterial` (`viewZToReversedPerspectiveDepth(positionView.z.mul(depthBiasFactor), cameraNear, cameraFar)` — reversed variant matches the viewport's `reversedDepthBuffer: true`) — **implemented** in the same module; guarded by `gltf-edges-webgpu.material.test.ts` (`depthNode` non-null + TSL snapshot). | P0       | Med    | High   |
| R3  | Single shared `depthBiasFactor` consumed by WebGL injection and WebGPU `depthNode` — **implemented** (same constant, consolidated JSDoc on `depthBiasFactor`).                                                                                                                                                                                          | P1       | Low    | Med    |
| R4  | `powerPreference: 'high-performance'` on all WebGL paths in `createTauRenderer` — **implemented** in `apps/ui/app/components/geometry/graphics/three/tau-renderer.ts`.                                                                                                                                                                                  | P1       | Low    | Low    |
| R5  | Add a Playwright visual snapshot in `apps/ui-e2e/src/graphics-backend.spec.ts` that asserts a coplanar edge-on-surface scene matches a baseline for each backend (catches the next chunk rename)                                                                                                                                                        | P2       | Med    | Med    |
| R6  | Subscribe the workspace to three.js release notes / pin a custom `repos/three.js` fork so silent shader-chunk renames surface in `pnpm repos sync` rather than at runtime                                                                                                                                                                               | P2       | Low    | Med    |
| R7  | Update `docs/policy/graphics-backend-policy.md` with a "shader chunk replace" rule: prefer **append/prepend** over **replace** so chunk renames degrade gracefully                                                                                                                                                                                      | P2       | Low    | Med    |

## Trade-offs

Three plausible WebGL fixes for R1, ordered by architectural cleanliness:

| Approach                                                            | Works on perspective? | Works on ortho?                                                                                      | Touches three internals? | MSAA-safe?                          | Lines per file |
| ------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------ | ----------------------------------- | -------------- |
| A. Keep replacing `<logdepthbuf_fragment>` with new define name     | ✅                    | ❌ (no log-depth path on ortho)                                                                      | High — owns the chunk    | ❌ (still writes `gl_FragDepth`)    | ~40            |
| B. **Multiply `vFragDepth` in vertex shader, never touch fragment** | ✅                    | n/a (chunk emits `gl_FragCoord.z` directly, no bias needed because mesh+line both use same encoding) | Low — appends one line   | ✅ (no `gl_FragDepth` write at all) | ~20            |
| C. Subtract a small `gl_Position.z` nudge in vertex shader          | ✅                    | ✅                                                                                                   | Low                      | ✅                                  | ~10            |

**Recommendation**: B for WebGL — preserves the existing log-space math (so the unit conversion through `logDepthBufFC` stays correct), is one shader-chunk append, and lets three's chunk handle perspective vs ortho. C is cleaner conceptually but requires re-tuning the bias for the NDC-z domain and would need separate constants per camera type.

For WebGPU (R2), TSL exposes `material.depthNode` (`NodeMaterial.js:289`) which feeds straight into the depth output. A small subtraction on the projected position (parallel to approach C) is the natural shape on the node graph because reversed-Z maps "closer" to a _larger_ depth value:

| Approach                                                                                                | Works on reversed-Z?                 | Couples to surface material?                                                       | Lines                 |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------- | --------------------- |
| 1. `material.depthNode = positionView.z.add(epsilon)`                                                   | ✅                                   | No                                                                                 | ~5                    |
| 2. `material.polygonOffset = true; material.polygonOffsetFactor = -1; material.polygonOffsetUnits = -1` | ✅ if WebGPU honours it              | No, but Three.js WebGPU `polygonOffset` support is limited for instanced fat-lines | ~3                    |
| 3. Render lines into a second `pass` rendered after the surface pass with depth test disabled           | ✅ but loses occlusion of back-faces | No                                                                                 | ~30 (post-processing) |

**Recommendation**: 1. Keep the bias inside the line material so other consumers of the runtime (CLI, screenshot path) inherit it without rewiring their pipelines.

## Code Examples

### Recommended WebGL fix (R1, approach B)

Replace `gltf-edges.ts:213-268` with:

```typescript
material.onBeforeCompile = (shader) => {
  shader.uniforms['depthBias'] = depthBiasUniform;

  // Add varyings + uniform
  shader.vertexShader = shader.vertexShader.replace(
    '#include <logdepthbuf_pars_vertex>',
    `#include <logdepthbuf_pars_vertex>
    uniform float depthBias;`,
  );

  // Multiply vFragDepth (set by the chunk above) by an FOV-adaptive bias.
  // log2(vFragDepth * bias) = log2(vFragDepth) + log2(bias) → constant additive
  // offset in log space → unchanged unit semantics through three's fragment chunk.
  shader.vertexShader = shader.vertexShader.replace(
    '#include <logdepthbuf_vertex>',
    `#include <logdepthbuf_vertex>
    #ifdef USE_LOGARITHMIC_DEPTH_BUFFER
      if (projectionMatrix[3][3] == 0.0) {
        float tanHalfFov = 1.0 / projectionMatrix[1][1];
        float fovScale = tanHalfFov / 0.57735;
        vFragDepth *= pow(depthBias, fovScale);
      }
      // Orthographic: chunk emits raw gl_FragCoord.z (no log), no bias needed
      // (line and surface share the same encoding so coplanar fragments tie cleanly
      // and renderOrder=1 already places lines after surfaces in the depth pass).
    #endif`,
  );

  // No fragment shader replace — three's <logdepthbuf_fragment> handles
  // both perspective (log) and orthographic (linear) using vIsPerspective.
};
```

Key properties:

- **Survives the next chunk rename**: append-only against `<logdepthbuf_pars_vertex>` / `<logdepthbuf_vertex>` rather than replacing `<logdepthbuf_fragment>`.
- **Drops `USE_LOGDEPTHBUF_EXT`**: WebGL2 is the only backend three.js targets now.
- **Single source of truth for the FOV scale**: vertex shader only.

### Recommended WebGPU fix (R2)

Add a `depthNode` to the WebGPU material:

```typescript
import { positionView, uniform, pow } from 'three/tsl';

const depthBiasNode = uniform(depthBiasFactor);

export function createWebGpuGltfFatLineMaterial(): Line2NodeMaterial {
  const material = new Line2NodeMaterial({
    color: defaultEdgeColor,
    linewidth: defaultLineWidth,
    worldUnits: false,
  });

  // Pull line fragments slightly toward the camera in view-space z.
  // With reversedDepthBuffer=true the Tau viewport WebGPU canvas, "closer to camera"
  // = "larger depth value", so adding a small positive epsilon on the view-space z
  // wins coplanar comparisons in favour of the line.
  material.depthNode = positionView.z.add(depthBiasNode.mul(positionView.z.abs()));

  return material;
}
```

The `* abs(z)` term keeps the bias proportional to the surface's distance from the camera so a single epsilon works at any zoom level (mirrors the log-space invariance of the WebGL path).

## Diagrams

### Depth comparison after the regression (WebGL, perspective camera)

```
                     viewer
                       │
                       ▼
   ┌──────────────────────────────────────────────┐
   │ Surface fragment writes gl_FragDepth =       │
   │   log2(vFragDepth) * logDepthBufFC * 0.5     │ ← log-encoded ~0.992
   ├──────────────────────────────────────────────┤
   │ Coplanar Line fragment writes (nothing) →    │
   │ depth = rasterized gl_FragCoord.z            │ ← linear ~0.500
   └──────────────────────────────────────────────┘
                       │
                       ▼
        Depth test: line(0.500) < surface(0.992)
        → driver-dependent winner — line VANISHES
        on every perspective fragment
```

### Depth comparison after R1 + R2 (both backends)

```
                     viewer
                       │
                       ▼
   ┌──────────────────────────────────────────────┐
   │ Surface fragment writes gl_FragDepth =       │
   │   log2(vFragDepth) * logDepthBufFC * 0.5     │ ← log-encoded
   ├──────────────────────────────────────────────┤
   │ Line fragment writes gl_FragDepth =          │
   │   log2(vFragDepth * bias) * logDepthBufFC    │ ← same encoding,
   │   = surface_depth + log2(bias)               │   tiny additive offset
   └──────────────────────────────────────────────┘
                       │
                       ▼
        Depth test: line < surface (deterministic)
        → line wins, MSAA averages line subsamples
        against line subsamples → CRISP
```

## References

- [mrdoob/three.js PR #31564 — "Src: Nomenclature clean up"](https://github.com/mrdoob/three.js/pull/31564) — the r180 macro rename with no migration entry
- [pmndrs/postprocessing #731 — "Depth buffer error on Three r180"](https://github.com/pmndrs/postprocessing/issues/731) — independent confirmation of the same breaking change
- [mrdoob/three.js r180 release notes](https://github.com/mrdoob/three.js/releases/tag/r180) — does **not** mention the rename
- `node_modules/three/src/renderers/shaders/ShaderChunk/logdepthbuf_fragment.glsl.js` — current chunk in 0.184
- `node_modules/three/src/materials/nodes/NodeMaterial.js:265,289` — `positionNode`, `depthNode` TSL hooks for the WebGPU fix
- `node_modules/@react-three/fiber/dist/events-f19bcc32.cjs.dev.js:15640-15655` — R3F `gl` factory vs object handling
- Policy: `docs/policy/graphics-backend-policy.md`
- Policy: `docs/policy/webgpu-rendering-pipeline.md`

## Appendix

### A. Workspace diff vs origin/main inventory (graphics-relevant only)

| File                                                                        | Status | Relevance                                                                                                               |
| --------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------- |
| `apps/ui/package.json`                                                      | M      | `three` ^0.179.1 → ^0.184.0 (causes Finding 1); `@types/three` 0.178.1 → 0.184.0; `three-mesh-bvh` 0.9.8 → 0.9.9        |
| `apps/ui/app/components/geometry/graphics/three/materials/gltf-edges.ts`    | M      | Adds WebGPU branch w/ `Line2NodeMaterial` and no depth bias (Finding 2); WebGL branch unchanged but broken by Finding 1 |
| `apps/ui/app/components/geometry/graphics/three/materials/gltf-matcap.ts`   | M      | Adds WebGPU `MeshMatcapNodeMaterial` path; not a direct cause but exercises the WebGPU pipeline that exposes Finding 2  |
| `apps/ui/app/components/geometry/graphics/three/three-context.tsx`          | M      | Switches `gl` prop from object literal to factory function (Finding 3)                                                  |
| `apps/ui/app/components/geometry/graphics/three/tau-renderer.ts`            | A      | New renderer factory — WebGL preset now includes `powerPreference: 'high-performance'` (Finding 3 resolved)             |
| `apps/ui/app/components/geometry/graphics/three/canvas-three-gl.ts`         | A      | Wraps `createTauRenderer` for the R3F `gl` prop                                                                         |
| `apps/ui/app/components/geometry/graphics/three/post-processing.tsx`        | M      | Adds backend-conditional WebGPU path (Finding 2 context)                                                                |
| `apps/ui/app/components/geometry/graphics/three/post-processing-webgpu.tsx` | A      | New GTAO pipeline — orthogonal to the line regression                                                                   |
| `apps/ui/app/components/geometry/graphics/three/react/gltf-mesh.tsx`        | M      | Threads `graphicsBackendThree` into `applyFatLineSegments` and `applyMatcap`                                            |

### B. WebGL injection vs three 0.184 chunks (side-by-side)

```text
                                Our injection (working tree)
─────────────────────────────────────────────────────────────────
shader.fragmentShader.replace(
  '#include <logdepthbuf_fragment>',
  `#if defined( USE_LOGDEPTHBUF )            ← never defined in r0.180+
     ...                                        ← entire block dead
   #endif`
);

                                three.js 0.184 chunk (lives at
                                src/renderers/shaders/ShaderChunk/
                                logdepthbuf_fragment.glsl.js)
─────────────────────────────────────────────────────────────────
#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )    ← new name
  gl_FragDepth = vIsPerspective == 0.0
    ? gl_FragCoord.z
    : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif
```

### C. Camera-aware depth encoding cheat sheet (post r180)

| Camera                                         | `logarithmicDepthBuffer` | Surface fragment writes                  | Required line bias domain                                                 |
| ---------------------------------------------- | ------------------------ | ---------------------------------------- | ------------------------------------------------------------------------- |
| Perspective + log-depth (Tau WebGL viewport)   | true                     | `log2(vFragDepth) * logDepthBufFC * 0.5` | Multiplicative on `vFragDepth` (log-space additive)                       |
| Orthographic + log-depth (Tau WebGL ortho)     | true                     | `gl_FragCoord.z`                         | Linear NDC-z subtraction (multiplicative bias on `vFragDepth` is a no-op) |
| Perspective + reversed-Z (Tau WebGPU viewport) | n/a                      | `gl_FragDepth` from reversed-Z           | Additive on view-space z (with sign convention for reversed-Z)            |
| Orthographic + reversed-Z                      | n/a                      | `gl_FragDepth` from reversed-Z           | Same view-space z bias as perspective                                     |

R1 + R2 cover the perspective rows directly. The orthographic rows fall back to the deterministic `renderOrder=1` ordering plus a small NDC-z nudge if needed (low-priority follow-up; Tau ortho mode currently does not show the regression at the same magnitude because the depth range is uniform).
