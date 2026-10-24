---
title: 'WebGPU Rendering Pipeline Policy'
description: 'Canonical Tau WebGPU CAD stack: reversed-Z renderer, lean single-sample scene MRT, spatial GTAO and explicit output/depth ownership'
status: active
created: '2026-05-08'
updated: '2026-10-24'
category: policy
related:
  - docs/research/webgpu-cad-rendering-blueprint.md
  - docs/policy/graphics-backend-policy.md
---

# WebGPU Rendering Pipeline Policy

Internal reference binding the Tau CAD viewer’s **WebGPU** post/lighting topology (R3F + Three.js **r184** TSL and owned frame targets). Divergences belong in ADRs (`docs/architecture/` or follow-up research), not silent refactors.

## Rationale

The interactive viewport runs `frameloop="demand"`. Use one scene acquisition and explicit output/depth ownership; optional AO must not create a second geometry pass or an indefinite temporal convergence loop. [WebGPU Shader and Pipeline Policy](webgpu-shader-and-pipeline-policy.md) owns the detailed graph and lifecycle rules.

## Rules

### 1. Canonical graph

Use the shared viewport renderer factory with reversed depth and no logarithmic depth. The performance-first node candidate explicitly uses single-sample scene attachments (`pass(scene, camera, { samples: 0 })`), and a single-sample renderer frame target (`antialias: false, samples: 0`). When AO is requested, one `PassNode` acquires beauty, depth and packed UNORM8 normals. Feed its depth and decoded normals to GTAO at half CSS resolution (`0.5 / DPR`), eight samples, and `useTemporalFiltering = false`. Keep spatial bilateral filtering at that AO budget and bilinearly sample the filtered visibility into native-resolution beauty. Native-resolution depth/normal gathers are excluded from the lean candidate; AO boundary halos remain an appearance qualification gate.

Composite AO using the selected scene/display boundary while preserving alpha. The default display-space composition is an accepted CAD appearance, not an identity with indirect-only physical occlusion. Tone-map once into composed surface storage: hardware-sRGB RGBA8 under Neutral, RGBA16F otherwise. Both node backends then apply surface FXAA to that composed color, writing into the existing scene RGBA16F attachment after its radiance is dead. Compose-once reuse is the sole AO-on node production path. Analytic BREP and section edges draw after surface filtering; they are not inputs to AO or FXAA.

The reuse framebuffer view borrows scene color and composed-frame depth/stencil. Prepare all three views before authoritative scene writes. Acquire scene/AO once per composition, including repeated composition within one Three animation frame. No sampled attachment may also be the active output. Retire the graph's views together; Three r184 attachment disposal makes independent retirement unsafe. Reuse adds no color storage relative to fused composition and avoids 58,982,400 bytes relative to separately allocated compose-once at 5120×2880.

Native WebGPU retains separate scene depth and frame depth/stencil; the priority-1 composite installs retained scene depth once. Node WebGL2 shares D24S8 between scene and frame and writes color only during composition. The former node WebGL2 fused exception is retired. The exact packaged cap-history difference is attributed to cross-primitive derivatives affecting cap coverage on the tested M2 Pro, with reversible same-shader grouping controls in both fused and reuse. The subsequent analytic triangle-plane differential repair is recorded in the cap-coverage-fix and cap-cost-isolation reports; retain the original failure and broader qualification limits separately; do not reinstate a competing composition path or ship diagnostic per-triangle draws. See the [attribution record](../research/artifacts/high-resolution-rendering-audit/runs/2026-10-18-implementation/node-consolidation/cap-attribution/report.md). Node WebGL2 is the automatic compatibility fallback by the 2026-10-25 operator decision; wider qualification remains recorded separately.

Caps, analytic lines, highlights, grid, handles and gizmos draw into the completed frame before the priority-3.5 final quad encodes it once. Preserve accumulated cap depth and stencil; later masks sample that depth. Suppress Three's implicit output conversion only during the final draw and restore state in `finally`. Grid and transparent lines use ordinary linear blending without viewport-copy gamma compensation. Classic WebGL remains unchanged. AO-off retains its separate beauty-only specialization.

### 2. Disabled AO and demand lifecycle

Allocate only the active graph and retarget it when projection changes. Keep bounded projection-specific MRT identities so Three r184 selects the correct view-direction shader, and update stable AO camera matrices. Do not retain a second full-resolution camera attachment set or release targets independently from a live graph. Measure cold first use separately from warmed retargeting. With AO disabled, acquire beauty/depth without normal MRT or GTAO resources. Retain the necessary output graph for the backend's frame-target/overlay contract; a disabled effect does not require unmounting that owner. Dispose owned resources on topology, backend and lifetime transitions, and retain no borrowed texture ownership.

Keep AO visible during motion when enabled. Do not enable temporal filtering without a separately qualified history, disocclusion and bounded demand-convergence contract. Record cold first-use cost separately from warm interaction.

### 3. WebGPU preference and WebGL compatibility

Prefer native WebGPU on supported devices and fall back to node WebGL2 when unavailable or initialization fails. The visible, default-on `webGpu` flag controls preference. Qualify effect-specific quality through each backend's existing owner. Do not force identical concrete passes or infer one backend's performance from the other. Preserve paired shader semantics, native edges, depth, alpha and authored PBR materials.

### 4. Debug Inspector overlay

three.js **`Inspector`** mounts only when the viewer switch **`useViewerFeature('webGpuInspector')`** is **true**. The bulky bundle MUST stay behind **`React.lazy`** (`packages/viewer/src/graphics/three/webgpu-inspector-overlay.tsx` importing **`three-webgpu-inspector-bootstrap.tsx`**). **`Inspector` MUST NOT** be statically imported inside that bootstrap module: load it only from **`useLayoutEffect`** via **`await import('three/addons/inspector/Inspector.js')`** so SSR never evaluates **`examples/jsm/inspector/tabs/Settings.js`**, whose top-level **`_loadState()`** reads **`localStorage`** and crashes Netlify SSR.

**Why**: Production bundles stay slim; WGSL/timeline triage stays opt-in (`apps/ui/app/flags/flag.constants.ts`). Dynamic import keeps Node out of **`localStorage`**-touching evaluator side effects.

### 5. Overlay scene graph

`SceneOverlay` renders after the priority-1 post owner into the same linear color/depth/stencil target. The composite installs scene depth once; caps extend it. Never stamp pre-cap depth over cap writes or replay the scene. Keep the classic depth bridge unchanged. View cube and plane picker must set the explicit target viewport/scissor in device pixels: Three’s canvas `setViewport` does not update a render target. Restore those rectangles after the draw, including on failure.

## Summary Checklist

- [ ] Scene acquisition explicitly selects single-sample attachments; the viewport frame target is also single-sample.
- [ ] One scene acquisition; normals/GTAO exist only when requested.
- [ ] Spatial GTAO uses resolved depth and decoded normals without temporal jitter.
- [ ] Output passes through the frame target; tone mapping and encoding occur once.
- [ ] Overlays receive authoritative depth and retain section-cap stencil semantics.
- [ ] Inspector stays lazy and SSR-safe.
- [ ] Actual backend, dimensions, motion pixels, GPU cost and foreground cadence qualify changes independently.

## References

- Upstream AO example parity: **`repos/three.js/examples/webgpu_postprocessing_ao.html`**
- Research blueprint (non-binding narrative): **`docs/research/webgpu-cad-rendering-blueprint.md`**
