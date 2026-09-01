---
title: '`Line2NodeMaterial` near-plane trim breaks under reversed-Z WebGPU viewport'
description: 'Root cause for viewport axes (and similar long segments) projecting along negative axis halves when `reversedDepthBuffer: true` and three r184 trim uses `-far/2` instead of `-near`.'
status: draft
created: '2026-05-08'
updated: '2026-05-08'
category: investigation
related:
  - docs/policy/webgpu-rendering-pipeline.md
  - docs/research/gltf-edges-line-rendering-regression.md
---

# `Line2NodeMaterial` near-plane trim breaks under reversed-Z WebGPU viewport

## Executive Summary

Tau’s CAD `<Canvas>` uses `WebGPURenderer` with **`reversedDepthBuffer: true`**. Three.js **`Line2NodeMaterial`** trims segments that cross the camera plane using a **`nearEstimate`** derived only from **`projectionMatrix[2][2]`** and **`projectionMatrix[3][2]`**. Under reversed-Z perspective those elements no longer encode **`-near`** the way the comment assumes; the quotient becomes **`-far/2`**. For very long axis lines (`size ≈ 50_000`) the positive endpoint sits behind the camera, the trim runs, **`alpha` goes strongly negative**, and **`mix(start, end, alpha)`** pushes the segment into the **opposite** octant so all three axes appear inverted. **Fix shipped in-tree:** in-repo [`Line2NodeMaterial`](../../apps/ui/app/components/geometry/graphics/three/materials/line2.material.ts) (extends three.js `Line2NodeMaterial`, imported as `ThreeLine2NodeMaterial` in source) copies upstream `setup()` with **`nearEstimate = cameraNear.negate()`** (TSL uniform). **Follow-up:** propose an upstream three.js change so stock `Line2NodeMaterial` uses the same invariant and the subclass can be deleted.

## Problem Statement

- **Symptom:** With **Rendering API = WebGPU** and **perspective** camera, colored viewport axes extend along **-X / -Y / -Z** from the origin instead of **+X / +Y / +Z** (orthographic and WebGL paths looked correct).
- **Trigger:** `Line2NodeMaterial` perspective branch + segment with **start.z &lt; 0** and **end.z &gt; 0** (origin start, far **+axis** end behind the near plane in view space).

## Methodology

- Read three r184 [`Line2NodeMaterial.js`](https://github.com/mrdoob/three.js/blob/r184/src/materials/nodes/Line2NodeMaterial.js) `trimSegment` and `Matrix4.makePerspective` reversed-depth branch.
- Compare `nearEstimate = b * -0.5 / a` for standard vs reversed-Z column values.
- Reproduce mentally against Tau [`createTauRenderer('viewport', 'webgpu', …)`](../../apps/ui/app/components/geometry/graphics/three/tau-renderer.ts) (`reversedDepthBuffer: true`).

## Findings

### Finding 1: `nearEstimate` formula is not invariant across reversed depth

Upstream (simplified):

```text
a = projectionMatrix[2][2]   // column 3, row 3 in 0-based mat4 element API
b = projectionMatrix[3][2]
nearEstimate = b * (-0.5) / a
```

For **non-reversed** WebGL-style perspective, this reduces to **≈ -near**. For **`reversedDepth: true`**, `makePerspective` uses `c = near/(far-near)`, `d = far*near/(far-near)` so **`nearEstimate = -far/2`**.

### Finding 2: Wrong `nearEstimate` explodes `alpha` and flips `mix` direction

Trim runs when **start** is in front of the camera (**z &lt; 0** in view space) and **end** is behind (**z &gt; 0**). Then:

```text
alpha = (nearEstimate - start.z) / (end.z - start.z)
```

With **`nearEstimate ≈ -50000`**, **`start.z ≈ -300`**, **`end.z ≈ +50000`**, **`alpha` is large and negative**, so **`mix(start, end, alpha)`** lands on the far side of **start** opposite **end** — the visual “all axes inverted” report.

### Finding 3: Orthographic avoids the branch

`perspective = (projectionMatrix[2][3] == -1)` is false for orthographic cameras, so the buggy trim is skipped — matching user observation that ortho looked fine.

## Recommendations

1. **Ship in-tree wrapper** (done): [`Line2NodeMaterial`](../../apps/ui/app/components/geometry/graphics/three/materials/line2.material.ts) + use from [`axes-helper.tsx`](../../apps/ui/app/components/geometry/graphics/three/react/axes-helper.tsx) WebGPU branch; JSON snapshot in [`__shader-snapshots__/line2-node-material.json`](../../apps/ui/app/components/geometry/graphics/three/materials/__shader-snapshots__/line2-node-material.json).
2. **Upstream PR (TODO):** Replace matrix-derived `nearEstimate` in `Line2NodeMaterial` with **`cameraNear.negate()`** (or equivalent) so reversed-Z and standard projections share one code path; then remove the Tau subclass if the patch lands.
3. **Optional follow-up:** Audit other `Line2NodeMaterial` call sites (e.g. glTF edges) if geometry can place segment endpoints behind the camera under similar lens/near/far combinations.

## References

- three.js r184 `Line2NodeMaterial.js` — `trimSegment` / `vertexNode`.
- three.js `Matrix4.makePerspective` reversed-depth branch.
- [`docs/policy/webgpu-rendering-pipeline.md`](../policy/webgpu-rendering-pipeline.md)
