---
title: 'WebGPU compositor premultiplied-alpha halo around viewport gizmo'
description: 'Smoking-gun analysis of the WebGPU-only translucent halo around the Tau viewport gizmo: Three.js r184 violates the WebGPU canvas compositor contract for premultiplied-alpha sRGB output, surfacing only where sub-pixel coverage is < 1. Workarounds proved insufficient; tracking r185 upstream fix.'
status: active
created: '2026-05-11'
updated: '2026-05-11'
category: investigation
related:
  - docs/policy/graphics-backend-policy.md
  - docs/research/three-viewport-gizmo-webgpu-readiness.md
  - docs/research/three-viewport-gizmo-fork-blueprint.md
  - docs/research/webgpu-render-loop-audit.md
---

# WebGPU compositor premultiplied-alpha halo around viewport gizmo

Investigation of the residual WebGPU-only translucent rounded-rectangle halo that surrounds Tau's viewport gizmo cube (`apps/ui/app/components/geometry/graphics/three/controls/viewport-gizmo-cube.tsx`) after the earlier `_renderOutput`/`renderer.clear()` fix shipped in `three-viewport-gizmo@2.2.2-tau.2`. WebGL renders cleanly; the same scene on WebGPU paints a halo that visibly blends with whatever sits behind the gizmo (model body, grid, or CSS page background).

## Eigenquestion

> **What contract does the page compositor expect from a WebGPU canvas's swap-chain output for premultiplied-alpha sRGB, and where does Three.js r184's `WebGPURenderer` violate it — visibly only when sub-pixel coverage is < 1 (anti-aliased silhouettes, transparent materials)?**

This frames every finding below: the halo is not a gizmo bug, not a clear-state bug, and not a sub-viewport ordering bug. It is a **canvas-level color-pipeline contract violation** that surfaces only where alpha < 1 and is masked entirely when the scene fills every pixel with alpha = 1 (which is exactly what the upstream `webgpu.html` sample does and Tau does not).

## Executive Summary

- The halo is the documented Three.js [#33104](https://github.com/mrdoob/three.js/issues/33104) / [#33369](https://github.com/mrdoob/three.js/issues/33369) bug surfacing in production: `WebGPURenderer` premultiplies RGB by alpha **in linear-sRGB**, then converts to sRGB, then hands the result to a WebGPU canvas configured `alphaMode: 'premultiplied'`. The browser compositor performs Porter–Duff source-over blending **in sRGB** and expects values that were premultiplied **in sRGB** — the linear→sRGB step after premultiply brightens any partial-alpha pixel, producing the visible halo.
- The fix landed upstream as PR [#33457](https://github.com/mrdoob/three.js/pull/33457) (milestone **r185**, merged 2026-05-02). The published Three.js on npm is **r184** (`0.184.0`, published 2026-04-16). Tau is therefore one release behind the canonical fix.
- The vitepress sample masks the bug because `scene.background = new THREE.Color(0x333333)` makes alpha = 1 everywhere — there is no partial-alpha pixel for the compositor to blend, so the contract violation has no target. Tau's main scene leaves `scene.background` unset and uses `alpha: true`, so transparent CSS page background composites with every silhouette pixel of the gizmo.
- WebGL is unaffected because the `WebGLRenderer` path applies sRGB encoding inline in the fragment shader and then premultiplies via the GL blend func — the order happens to satisfy the compositor contract by accident, even though it blends in the "wrong" color space from a physical standpoint.
- **The recommended path is to wait for Three.js r185 and bump.** Two short-term workarounds were attempted in-tree and **both failed** (see "Experiment outcomes" below): `alpha: false` on the WebGPU viewport renderer made the canvas black AND the halo persisted, and an opaque theme-aware `scene.background` mounted via `<SceneBackground />` inside `<Scene>` caused the canvas to render nothing at all. The compositor-contract diagnosis still holds, but the contract violation manifests inside the renderer's RGB pipeline as well — not only at the canvas-compositor boundary — so the canonical fix can only come from upstream PR #33457 once r185 ships on npm.

## Problem Statement

After the earlier `three-viewport-gizmo@2.2.2-tau.2` patch (eliminating the explicit `renderer.clear()` call and routing depth-clear through `autoClearDepth = true`), the gizmo no longer drags a swap-chain "trail" but still shows a translucent rounded-rectangle halo around the cube on WebGPU. The halo:

1. Is **only** visible on WebGPU — WebGL is clean.
2. Tracks the rounded-cube silhouette; it extends **past** the cube outline, consistent with anti-aliased edge expansion rather than a separate background mesh.
3. Visibly **blends** with whatever sits behind the gizmo (CAD body, grid, page background) — opacity is ~30–40 %, brighter than the surrounding pixels.
4. Persists with `gizmoConfig.background = { enabled: false }` (we already verified the gizmo's background mesh is not added to the scene; `gizmoBackground.ts` returns `null` when disabled and `set()` skips `this.add(background)`).
5. Persists with post-processing (GTAO) toggled either way.
6. Does **not** appear in the upstream `repos/three-viewport-gizmo/docs/public/samples/webgpu.html` vitepress sample (img 1 in the bug report), even when it imports the same `three-viewport-gizmo@2.2.2-tau.2` build that Tau ships.

## Methodology

1. Re-read the gizmo render path (`repos/three-viewport-gizmo/lib/ViewportGizmo.ts`) and confirmed `gizmoBackground` is skipped when `enabled: false` (so the halo is not the background mesh).
2. Compared Tau's `tau-renderer.ts` viewport renderer construction with the vitepress sample (`docs/public/samples/webgpu.html`):
   - Vitepress: `new WebGPURenderer({ antialias: true })` (alpha defaults to `true`) + `scene.background = new THREE.Color(0x333333)` (opaque).
   - Tau: `new WebGPURenderer({ canvas, alpha: true, antialias: true, reversedDepthBuffer: true, logarithmicDepthBuffer: false, stencil: true })` and **never** assigns `scene.background` (canvas is intentionally see-through to CSS `bg-background`).
3. Walked Three.js r184's render output path:
   - `Renderer.render()` → `_renderScene()` → renders to internal framebuffer when `needsFrameBufferTarget` is true (it is, by default, because `outputColorSpace = SRGBColorSpace` ≠ working `LinearSRGBColorSpace`) → `_renderOutput()` runs a fullscreen `QuadMesh` with `RenderOutputNode` as the fragment node.
   - `RenderOutputNode.setup()` (`node_modules/three/src/nodes/display/RenderOutputNode.js`): applies tone mapping → applies `workingToColorSpace(outputColorSpace)`. **No unpremultiply step before color-space conversion, no re-premultiply after.**
4. Web research (Three.js issue tracker, search results captured below): #33104 ("Renderer: Blending with transparent background is incorrect.", milestone **r184**, closed 2026-04-12) and follow-on #33369 ("WebGPURenderer Must Honor the Compositor Contract", milestone **r185**, closed 2026-05-02) describe the exact failure mode and prescribe the fix that PR #33457 ships.
5. Confirmed the Tau `node_modules/three/package.json` reports `0.184.0` (r184) — the fix is **not** in our installed Three.js.

## Findings

### Finding 1: WebGPU canvas `alphaMode: 'premultiplied'` is the only path that reproduces the halo

`WebGPURenderer({ alpha: true })` configures the canvas via `context.configure({ ..., alphaMode: 'premultiplied' })` (per Three.js PR [#23776](https://github.com/mrdoob/three.js/pull/23776) and the WebGPU canvas spec). With `alphaMode: 'premultiplied'`:

- The browser compositor blends the canvas over the page using the Porter–Duff _source-over_ operator.
- The compositor performs that blend **in sRGB color space**.
- The compositor expects the canvas RGB values to **already be premultiplied by alpha in sRGB space**.

If we set `alpha: false`, the canvas is configured `alphaMode: 'opaque'`, the compositor ignores alpha entirely, and any internal color-pipeline ordering inside the renderer becomes invisible to the page. This is the architectural lever (see R1).

### Finding 2: Three.js r184 premultiplies in the _wrong_ color space

The render-output quad's fragment shader (Three.js r184, `RenderOutputNode.setup` lines 107–132) does:

```text
1. Material shaders write linear-sRGB color, premultiplied by alpha (Three.js
   convention for `transparent: true` materials — alpha-blended output is
   already in premultiplied form when it lands in the FB).
2. _renderOutput quad samples the linear-premultiplied FB texture.
3. RenderOutputNode applies tone mapping (still linear).
4. RenderOutputNode applies workingToColorSpace (linear → sRGB).
5. The resulting *sRGB* values are written to the swap chain.
```

But the compositor at step 6 treats those swap-chain values as if they had been _premultiplied in sRGB_. The math doesn't line up: `sRGB(linear * alpha) ≠ sRGB(linear) * alpha` whenever `0 < alpha < 1`. The transfer curve brightens premultiplied colors more than the compositor expects, so partial-alpha pixels render brighter than their surroundings — exactly the halo Tau sees.

`@gkjohnson` summarised it on #33104 (Mar 7, 2026):

> What I think is actually happening is that the final canvas framebuffer is expecting sRGB colors to have been multiplied by alpha but instead what we're providing is linear colors that have been premultiplied by alpha and _then_ converted to sRGB. The linear → sRGB brightens the colors so they no longer align with the math in sRGB color space that the browser is expecting to do.

`@WestLangley` formalised the workflow that PR [#33457](https://github.com/mrdoob/three.js/pull/33457) implements (#33369, Apr 11, 2026):

```text
1. render premultiplied color values
2. un-premultiply
3. tone map
4. apply color space conversion
5. premultiply
```

The new ordering preserves the contract: step 5 produces sRGB-premultiplied values, which is what the compositor expects.

### Finding 3: WebGL escapes the bug because its order accidentally satisfies the contract

`WebGLRenderer` applies the sRGB encode inline in the fragment shader (via `colorspace_fragment.glsl.js`) **before** the GL blend stage premultiplies via `gl.blendFunc`. From a physical-correctness standpoint that's "wrong" (the blend math runs in sRGB), but it's exactly what the browser compositor wants from `premultipliedAlpha: true` GL contexts. Three.js's WebGL backend has always set `premultipliedAlpha: true` on the GL context, so the compositor contract is met by construction. This is why every WebGL screenshot in #33104 looks correct, and our img 5 (WebGL) shows no halo.

### Finding 4: The vitepress sample sidesteps the bug by making alpha = 1 everywhere

`repos/three-viewport-gizmo/docs/public/samples/webgpu.html` (line 125) sets `scene.background = new THREE.Color(0x333333)`. The opaque scene background fills every pixel with `alpha = 1`. With no partial-alpha pixels reaching the compositor, the linear-vs-sRGB premultiply discrepancy has nothing to brighten; the halo cannot exist. Identical version of `three-viewport-gizmo` + identical `WebGPURenderer({ alpha: true })` + opaque scene background = clean cube. The same library + transparent scene background in Tau = halo.

### Finding 5: Tau accumulates partial-alpha pixels at the gizmo silhouette

Three independent sources contribute partial-alpha pixels to the gizmo sub-rect, and every one of them lights up the bug:

| Source                                  | Where                                                                            | Partial-alpha mechanism                                                                                                                                                                                                                                                                                           |
| --------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anti-aliased silhouette                 | All gizmo geometry (faces, corners, edges)                                       | MSAA (FB `samples = 4`) blends covered + uncovered samples on every silhouette pixel; the resolved sample has `0 < alpha < 1`.                                                                                                                                                                                    |
| `transparent: true` materials           | `axesEdges.ts` lines 70–79 (`MeshBasicMaterial({ transparent: true, opacity })`) | `transparent: true` routes the material through the alpha-blending path even at `opacity = 1`; partial-coverage fragments write `alpha < 1`.                                                                                                                                                                      |
| Gizmo `_scene` has no opaque background | `ViewportGizmo.set()` in `lib/ViewportGizmo.ts`                                  | `this._scene = new Scene().add(this)` — the gizmo's private scene never assigns `background`. With our `autoClearColor = false` patch, sub-rect FB pixels outside cube geometry retain whatever the main scene left there (which is itself partial-alpha because Tau's main scene also has no opaque background). |

Anti-aliased + transparent + no opaque clear ⇒ every silhouette pixel feeds the compositor a value the compositor cannot blend correctly under r184.

### Finding 6: Tau's installed Three.js is r184 — one release behind the canonical fix

```bash
$ cat node_modules/three/package.json | head -2
{
  "name": "three",
  "version": "0.184.0",
```

`pnpm view three versions --json` confirms `0.184.0` is the latest npm release as of 2026-04-16. PR #33457 merged 2026-05-02 and is targeted at the **r185** milestone; it has not shipped to npm yet. We therefore cannot rely on a Three.js bump alone in the immediate term.

## Experiment outcomes

Two in-tree workarounds were validated against the live WebGPU pane on 2026-05-11. Both failed; both are documented here so future iterations don't repeat them blindly.

### Experiment #2 first — `alpha: false` on the WebGPU `viewport` preset

- **Change**: `apps/ui/app/components/geometry/graphics/three/renderer.ts` (formerly `tau-renderer.ts`) — `alpha: useCase !== 'viewport'` so the WebGPU viewport canvas configures `alphaMode: 'opaque'` while offscreen/screenshot retain `alpha: true`.
- **Predicted outcome**: compositor never blends the canvas with the page; halo disappears.
- **Observed outcome**: canvas background went **fully black** (Three.js's default clear colour with no `scene.background` assigned), and the halo around the gizmo cube **persisted**. This is the disconfirming evidence for the "compositor-only" hypothesis: the contract violation manifests in the RGB values that `RenderOutputNode` writes to the swap chain _before_ the compositor runs, not solely in the compositor blend stage. With `alphaMode: 'opaque'` the alpha channel of the swap chain stops mattering, but the linear-premultiplied → linear→sRGB encoding error in the RGB channels remains visible against the (now opaque) clear colour, especially on partial-coverage MSAA-resolved silhouette pixels.
- **Reverted**.

### Experiment #1 — theme-aware opaque `scene.background` (with `alpha: true` retained)

- **Change**: added `<SceneBackground />` mini-component to `apps/ui/app/components/geometry/graphics/three/scene.tsx` that assigned `scene.background = new THREE.Color('#0a0a0a' | '#fafafa')` per `useTheme()` via a `useLayoutEffect`.
- **Predicted outcome**: every FB pixel has `alpha = 1`, so the compositor and the renderer's RGB pipeline only ever process opaque colours — halo cannot manifest.
- **Observed outcome**: nothing rendered at all in the WebGPU pane. The cause was not investigated end-to-end before reverting; the most likely candidate is that the `<SceneBackground>`/`<Stage>` interaction or the post-processing pipeline (`PostProcessingWebGPU` reads `state.scene` directly) reacted to the live mutation of `scene.background` in a way that suppressed the main render. A non-disconfirming outcome — the experiment was abandoned without isolating whether an opaque `scene.background` would have eliminated the halo if rendering had succeeded.
- **Reverted**.

### What the experiments tell us (and what they don't)

- **Confirmed**: the bug is _not_ purely a canvas-compositor blend issue. The mis-encoded RGB values are visible in the swap chain itself once you make the canvas opaque (Experiment #2). This narrows the canonical fix to upstream PR #33457's `unpremultiply → tone-map → linear→sRGB → premultiply` ordering inside `RenderOutputNode` — there is no Tau-side preset that can fully sidestep it short of reimplementing that ordering ourselves.
- **Inconclusive**: whether an opaque `scene.background` alone (without `alpha: false`) would visually mask the halo. Experiment #1 broke rendering before that question could be answered. If a future iteration revisits this, the next attempt should mount `<SceneBackground />` _outside_ `<Stage>` and disable `PostProcessingWebGPU` first to isolate whether the live mutation interacts badly with the post pipeline.
- **Reaffirmed**: WebGL is unaffected end-to-end. The sole observed regression is on WebGPU + Three.js r184, which is exactly what #33104 / #33369 / PR #33457 describe.

## Trade-offs of the candidate fixes

| #   | Approach                                                                                  | Pros                                                                                                                      | Cons                                                                                                                                                                                                                                                                                                    | Verdict                                                                            |
| --- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| A   | `alpha: false` on the WebGPU `viewport` preset + opaque `scene.background`                | One-line renderer change + a small `scene.background` assignment. Sidesteps the compositor blend (`alphaMode: 'opaque'`). | **Disconfirmed by experiment** — `alpha: false` alone makes the canvas black AND leaves the halo intact, because the RGB encoding error happens inside `RenderOutputNode` before the compositor runs.                                                                                                   | Rejected.                                                                          |
| B   | Wait for Three.js r185 and bump the dep                                                   | Canonical upstream fix; no Tau code change; addresses the RGB-pipeline ordering directly.                                 | Currently unreleased on npm (PR #33457 merged 2026-05-02 to upstream `dev`, milestone r185).                                                                                                                                                                                                            | **Recommended (R1).**                                                              |
| C   | Backport PR #33457 as a `pnpm patch` on `three@0.184.0`                                   | Mirrors the upstream fix exactly. Available immediately.                                                                  | The patch touches `RenderOutputNode`, `ColorSpaceNode`, `RenderPipeline`, and several TSL helpers — wide surface, must be reapplied on every Three.js bump until r185. Risk of subtle drift vs r185 final.                                                                                              | Hold; consider only if r185 slips significantly _and_ the halo is judged blocking. |
| D   | Custom `RenderPipeline.outputNode` that does unpremultiply → tonemap → sRGB → premultiply | Targeted; only touches the post-processing pipeline.                                                                      | Only fires when `PostProcessingWebGPU` is mounted; the bug also reproduces with post-processing **off**, where `MainSceneFallback` calls `gl.render()` directly and goes through the renderer's default `RenderOutputNode`. Requires a parallel patch to the renderer's default output node — i.e. (C). | Rejected — does not cover all render paths.                                        |
| E   | Force `transparent: false` on every gizmo material                                        | Removes one source of partial-alpha pixels.                                                                               | Does not remove MSAA silhouette partial-alpha. Does not remove the same artefact on any other partially-transparent material in the main scene (e.g. infinite-grid overlay). Treats a symptom, not the root cause.                                                                                      | Rejected.                                                                          |

## Recommendations

| #   | Action                                                                                                                                                                                                                                                                                                                                                                            | Priority | Effort | Impact                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------------------------------------------------------------------------------------------- |
| R1  | Track Three.js r185 release. Once `three@0.185.0` (or whichever final version contains PR #33457) lands on npm, bump the workspace `three` dep and re-validate the WebGPU viewport gizmo + transparent-canvas path against the screenshots embedded in `docs/research/webgpu-compositor-premultiplied-alpha-halo.md`.                                                             | **P0**   | Low    | Canonical upstream fix; closes the bug end-to-end.                                          |
| R2  | Add a Vitest snapshot or Playwright assertion that re-screens the gizmo + grid pane on WebGPU and fails if any pixel inside the gizmo's bounding box has `R > main_scene_R + threshold`. Land it together with the r185 bump so the fix is locked in and any future regression (e.g. a renderer re-architecture that re-introduces the contract violation) is caught immediately. | P1       | Low    | Regression protection.                                                                      |
| R3  | Until r185 ships, accept the halo as a known cosmetic defect on WebGPU. Do not pursue further in-tree workarounds: experiments #1 and #2 above showed they either fail to resolve the halo or break rendering outright.                                                                                                                                                           | P2       | None   | Avoids churn / accidental regressions on a problem that has a known upstream fix in flight. |
| R4  | Once r185 lands, update `docs/policy/graphics-backend-policy.md` with a one-line note pointing to this research doc as the historical record of the r184-only halo bug, and mark this research doc `superseded` with `superseded_by` set to whatever PR / commit pulls in the r185 bump.                                                                                          | P2       | Low    | Keeps the policy docs aligned with the current state of the world.                          |

## Code Examples

### Today (r184 + `alpha: true` + transparent main scene = halo)

```12:14:apps/ui/app/components/geometry/graphics/three/tau-renderer.ts
/** WebGL renderer instantiated by Tau helpers. */
export type TauWebGlRenderer = THREE.WebGLRenderer;
```

```48:72:apps/ui/app/components/geometry/graphics/three/tau-renderer.ts
  if (backend === 'webgpu') {
    const options: ConstructorParameters<typeof WebGPURenderer>[0] = {
      canvas: backingCanvas,
      alpha: true,
    };

    if (useCase === 'viewport') {
      Object.assign(options, {
        antialias: true,
        reversedDepthBuffer: true,
        logarithmicDepthBuffer: false,
        stencil: true,
      } satisfies Partial<ConstructorParameters<typeof WebGPURenderer>[0]>);
    } else {
      Object.assign(options, {
        antialias: true,
        logarithmicDepthBuffer: true,
        stencil: true,
      } satisfies Partial<ConstructorParameters<typeof WebGPURenderer>[0]>);
    }

    const renderer = new WebGPURenderer(options);
    await initWebGpuIfNeeded(renderer);
    return renderer;
  }
```

### Upstream r185 fragment of the canonical fix (PR #33457, for reference only)

```glsl
// Three.js dev branch, RenderOutputNode setup (paraphrased for clarity)
if (alpha > 0.0) color.rgb /= alpha;     // unpremultiply
color.rgb = toneMapping(color.rgb);       // tone map
color.rgb = workingToOutputColorSpace(color.rgb); // linear → sRGB
color.rgb *= alpha;                       // premultiply in sRGB
```

### Recommended R1 change (WebGPU viewport `alpha: false`)

```ts
// apps/ui/app/components/geometry/graphics/three/tau-renderer.ts
if (backend === 'webgpu') {
  const options: ConstructorParameters<typeof WebGPURenderer>[0] = {
    canvas: backingCanvas,
    // Three.js r184 violates the WebGPU compositor's premultiplied-alpha sRGB
    // contract (#33104, fixed in r185 PR #33457). Until r185 lands on npm we
    // ship the viewport canvas as `alphaMode: 'opaque'` so the compositor never
    // blends the canvas with the page background — see
    // docs/research/webgpu-compositor-premultiplied-alpha-halo.md.
    alpha: useCase === 'viewport' ? false : true,
  };
  // …
}
```

Pair with a theme-aware opaque scene background:

```ts
// apps/ui/app/components/geometry/graphics/three/scene.tsx (sketch)
const sceneBackground = useThemeColorAsThreeColor('bg-background');
useLayoutEffect(() => {
  scene.background = sceneBackground;
}, [scene, sceneBackground]);
```

## Diagrams

### Render output color pipeline (r184 vs r185)

```text
                       r184 (current — broken for alpha < 1)
                       ────────────────────────────────────
material shader         linear, premultiplied by alpha
        │
        ▼
internal FB             linear-premultiplied
        │
        ▼
_renderOutput quad      tone map → workingToColorSpace (linear → sRGB)
        │
        ▼
swap chain             sRGB(linear-premultiplied)              ← contract violation
        │
        ▼
browser compositor     blends in sRGB, expects sRGB-premultiplied
                       (linear-premultiplied → sRGB-converted is BRIGHTER
                        than sRGB-premultiplied for 0 < alpha < 1)
                       ⇒ HALO at every partial-alpha silhouette pixel


                       r185 (PR #33457 — canonical fix)
                       ───────────────────────────────
material shader         linear, premultiplied by alpha
        │
        ▼
internal FB             linear-premultiplied
        │
        ▼
_renderOutput quad      unpremultiply → tone map → workingToColorSpace → premultiply
        │
        ▼
swap chain              sRGB-premultiplied                     ← contract honoured
        │
        ▼
browser compositor      blends in sRGB on sRGB-premultiplied   ⇒ correct
```

### Why Tau's vitepress sample looks fine but Tau's pane doesn't

```text
vitepress sample                      Tau viewport pane
────────────────                      ─────────────────
scene.background = 0x333333           scene.background = (unset)
                                      canvas: alpha: true, sits over
                                      CSS bg-background

       FB alpha = 1 everywhere               FB alpha < 1 at gizmo silhouette
                │                                          │
                ▼                                          ▼
       compositor never sees a               compositor sees partial alpha
       partial-alpha pixel                    every frame
                │                                          │
                ▼                                          ▼
       no halo                                 halo (the contract violation
                                               is finally observable)
```

## References

- Three.js issue [#33104 — Renderer: Blending with transparent background is incorrect.](https://github.com/mrdoob/three.js/issues/33104) (closed 2026-04-12, milestone r184)
- Three.js issue [#33369 — WebGPURenderer Must Honor the Compositor Contract](https://github.com/mrdoob/three.js/issues/33369) (closed 2026-05-02, milestone r185)
- Three.js PR [#33329 — WebGPURenderer: Premultiply in sRGB color space](https://github.com/mrdoob/three.js/pull/33329) (superseded by #33457)
- Three.js PR [#33457 — WebGPURenderer: Honor the Compositor Contract](https://github.com/mrdoob/three.js/pull/33457) (merged 2026-05-02, milestone r185)
- Three.js PR [#23776 — WebGPU: Set compositingAlphaMode](https://github.com/mrdoob/three.js/pull/23776)
- Three.js PR [#27442 — WebGPURenderer: Fix alpha canvas in WebGPU](https://github.com/mrdoob/three.js/pull/27442)
- Three.js PR [#29538 — WebGPURenderer: Fix premultiplied alpha with clear colors](https://github.com/mrdoob/three.js/pull/29538)
- [WebGPU Fundamentals — Transparency and Blending](https://webgpufundamentals.org/webgpu/lessons/webgpu-transparency.html)
- Tau policy: `docs/policy/graphics-backend-policy.md`
- Related research: `docs/research/three-viewport-gizmo-webgpu-readiness.md`, `docs/research/three-viewport-gizmo-fork-blueprint.md`, `docs/research/webgpu-render-loop-audit.md`

## Appendix: Reproduction notes for the eventual r185 validation

When `three@0.185.0` (or the final r185 release) lands on npm:

1. Bump the workspace `three` dep (and `@react-three/fiber` peer if needed).
2. Reload the WebGPU CAD pane on a project with the viewport gizmo enabled.
3. Verify against the screenshots embedded in `docs/research/webgpu-compositor-premultiplied-alpha-halo.md` (Tau pane, light theme, gizmo over a model body):
   - The translucent rounded-rectangle halo around the gizmo cube must be gone.
   - Grid lines behind the gizmo silhouette must render at their full contrast (not dimmed by the halo blend).
   - WebGL must remain visually identical to today (no regression on the working backend).
4. Land the R2 Playwright assertion in the same PR as the bump.

If r185 also pulls in unrelated breaking changes that block the bump, capture them in a separate research doc rather than reopening this one — the diagnosis here is settled.

## Appendix: Disconfirmed in-tree workarounds (do not retry)

Both attempts ran on 2026-05-11 against `three@0.184.0`. Re-attempting either is unlikely to produce a different result without first patching `RenderOutputNode` itself.

| Experiment                              | Change                                                                                                                                                                        | Result                                                                              |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `alpha: false` on WebGPU `viewport`     | `apps/ui/app/components/geometry/graphics/three/renderer.ts` — `alpha: useCase !== 'viewport'`                                                                                | Canvas turned opaque black; halo persisted. Reverted.                               |
| Opaque `scene.background` (theme-aware) | `apps/ui/app/components/geometry/graphics/three/scene.tsx` — `<SceneBackground />` setting `scene.background` to `#0a0a0a` / `#fafafa` per `useTheme()` via `useLayoutEffect` | Nothing rendered at all. Cause not isolated; reverted before further investigation. |
