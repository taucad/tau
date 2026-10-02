---
title: 'WebGPU Rendering Pipeline Policy'
description: 'Canonical Tau WebGPU CAD stack: reversed-Z renderer, MSAA viewport, two-pass GTAO via builtinAOContext, tauDebug Inspector'
status: active
created: '2026-05-08'
updated: '2026-05-09'
category: policy
related:
  - docs/research/webgpu-cad-rendering-blueprint.md
  - docs/policy/graphics-backend-policy.md
---

# WebGPU Rendering Pipeline Policy

Internal reference binding the Tau CAD viewer’s **WebGPU** post/lighting topology (R3F + three.js **r184** `RenderPipeline` + TSL addons). Divergences belong in ADRs (`docs/architecture/` or follow-up research), not silent refactors.

## Rationale

The interactive viewport runs **`frameloop='demand'`** — temporal anti-aliasing cannot accumulate while the scene is idle. Tau standardises on hardware **MSAA** on the **`WebGPURenderer`** plus a **two-pass GTAO** graph (depth + normal pre-pass → `ao` → `builtinAOContext` on the lit pass). See **`docs/policy/graphics-backend-policy.md`** §7a.

## Rules

### 1. Canonical graph (post-processing enabled)

Implementations **must** follow this shape (identifiers may differ only in variable names):

- **Renderer**: `WebGPURenderer` from `three/webgpu` with **`reversedDepthBuffer: true`**, **`antialias: true`** (hardware MSAA — viewport preset), **`logarithmicDepthBuffer: false`** (factory: **`createTauR3fGlProp('webgpu')`** in **`apps/ui/app/components/geometry/graphics/three/canvas-three-gl.ts`**, which delegates to **`createTauRenderer('viewport', 'webgpu', …)`**).

- **Pre-pass**: `pass(scene, camera)`, **`transparent = false`**, **`setMRT(mrt({ output: directionToColor(normalView) }))`** (no velocity MRT — not used without temporal AA), **`prePass.getTexture('output').type = UnsignedByteType`**.

- **GTAO**: `ao(prePassDepth, prePassNormalSample, camera)` with **`resolutionScale = 0.5`** and **`useTemporalFiltering = true`** (`GTAONode` addon).

- **Lit scene pass**: **`scenePass.contextNode = builtinAOContext(aoTexture.sample(screenUV).r)`** — never **`color.rgb.mul(ao.r)`** on the beauty pass output (that falsely darkens direct lighting).

- **Output**: **`scenePass`** wired as **`RenderPipeline.outputNode`** (no **`traa`** in the on-demand viewport).

CORRECT (`apps/ui/app/components/geometry/graphics/three/post-processing-webgpu.tsx`)

```tsx
scenePass.contextNode = builtinAOContext(aoNode.getTextureNode().sample(screenUV).r);

const pipeline = new RenderPipeline(gpuRenderer);

pipeline.outputNode = scenePass;
```

INCORRECT

```tsx
post.outputNode = vec4(sceneColor.rgb.mul(aoTex.r), sceneColor.a);
```

**Why**: `builtinAOContext` routes AO through the lighting model (`ambientOcclusion`); multiplying final HDR colour is physically wrong and hides integration bugs behind a darkened framebuffer.

### 2. User toggle: disabling post-processing

The viewer setting **`enablePostProcessing`** (**`graphics.machine`**) fully **unmounts** the post-processing subtree on **both** WebGL (`EffectComposer` + `N8AO`) **and** WebGPU (`PostProcessingWebGPU` / `RenderPipeline`). No partial “AO-only” graph while the toggle is **off**.

**Why**: Predictable parity between backends and the simplest teardown path (`apps/ui/app/components/geometry/graphics/three/post-processing.tsx`).

### 3. WebGL path stays frozen for parity ambition

Tau does **not** extend the **`EffectComposer` + multisampled `N8AO`** fallback to chase WebGPU feature depth. Capability improvements land on WebGPU/TSL (`docs/policy/graphics-backend-policy.md` §3).

### 4. Debug Inspector overlay

three.js **`Inspector`** mounts only when **`useFeature('tauDebug')`** is **true**. The bulky bundle MUST stay behind **`React.lazy`** (`apps/ui/app/components/geometry/graphics/three/webgpu-inspector-overlay.tsx` importing **`three-webgpu-inspector-bootstrap.tsx`**). **`Inspector` MUST NOT** be statically imported inside that bootstrap module: load it only from **`useLayoutEffect`** via **`await import('three/addons/inspector/Inspector.js')`** so SSR never evaluates **`examples/jsm/inspector/tabs/Settings.js`**, whose top-level **`_loadState()`** reads **`localStorage`** and crashes Netlify SSR.

**Why**: Production bundles stay slim; WGSL/timeline triage stays opt-in (`apps/ui/app/flags/flag.constants.ts`). Dynamic import keeps Node out of **`localStorage`**-touching evaluator side effects.

### 5. Overlay scene graph

`SceneOverlay` still renders after the **`RenderPipeline` owner (`useFrame(..., 1)`)**. Do not regress overlay depth restores when changing priority order.

## Anti-Patterns

- Turning **off** hardware MSAA on the viewport WebGPU renderer and relying on **temporal AA** without a continuous frame loop — **`frameloop='demand'`** never converges TRAA (see **`docs/policy/graphics-backend-policy.md`** §7a).

- Feeding **`ao(..., null, camera)`** on paths where depth may be multisampled (WGSL `texture_dimensions` rejects **`texture_depth_multisampled_2d`** unless the node graph explicitly resolves samples).

## Summary Checklist

- [ ] WebGPU canvas uses **`reversedDepthBuffer: true`** + **`antialias: true`** (viewport **`createTauRenderer`** preset).
- [ ] Pre-pass emits packed normals (**`UnsignedByteType`**) — no velocity MRT unless a future continuous-RAF consumer **reintroduces** temporal AA with an explicit plan.
- [ ] AO is half-res temporally filtered and consumed via **`builtinAOContext`**.
- [ ] **`RenderPipeline.outputNode`** is the lit **`scenePass`** (not TRAA) for the on-demand viewport.
- [ ] **`tauDebug` Inspector** stays lazy-loaded, WebGPU-only, and **`Inspector`** is dynamically imported inside the bootstrap effect only (never at module scope).
- [ ] WebGL AO path touched only for regressions, not parity expansion.

## References

- Upstream AO example parity: **`repos/three.js/examples/webgpu_postprocessing_ao.html`**
- Research blueprint (non-binding narrative): **`docs/research/webgpu-cad-rendering-blueprint.md`**
