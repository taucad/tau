/**
 * Single tuning source for 3D viewport overlay tints (infinite grid + axes helper).
 *
 * Values are calibrated to render visibly across **both** WebGL (gamma-space canvas blend)
 * and WebGPU. Per-surface blend math now differs:
 *
 * - **Axes** (transparent `Line2NodeMaterial`) blend in **gamma space** on both backends —
 *   WebGPU routes through the in-shader `sRGBTransferOETF`/`sRGBTransferEOTF` wrap
 *   (graphics-backend-policy `CB-4`) so saturated axis tints reach perceptual parity with
 *   WebGL's sRGB-encoded framebuffer blend.
 * - **Grid** (`infinite-grid-material.node.ts`) still blends in **linear space** on WebGPU
 *   and **gamma space** on WebGL — the residual ~10-15 sRGB/channel divergence captured
 *   by `CB-3` applies to grid lines specifically. Eliminating it requires routing the
 *   overlay scene through a shared post-processing render target (deferred).
 *
 * **Tuning rules** (do not break without policy review):
 * 1. Tune visually against `/e2e/graphics-backend` with both backends side-by-side.
 * 2. Never re-pin to a known-broken backend baseline (e.g. pre-`<colorspace_fragment>`
 *    WebGL output, or the pre-`CB-4` WebGPU linear-blend over-saturation). Pinning to a
 *    bug freezes the bug into the design contract.
 * 3. Both backends must remain visibly above the threshold of perception in light AND
 *    dark mode — the prior `0xA6_A6_A6` light-mode value rendered nearly invisibly under
 *    WebGPU's linear blend.
 */

/**
 * Infinite grid line tint, **light theme**. sRGB hex.
 *
 * Light mode background is sRGB white (`#FFFFFF`). At alpha 0.3 over white:
 * - WebGL gamma blend → ~`#D5D5D5` perceptual.
 * - WebGPU linear blend → ~`#E2E2E2` perceptual.
 *
 * Both clearly visible; neither washes out.
 */
export const infiniteGridColorLightMode = 0x73_73_73;

/**
 * Infinite grid line tint, **dark theme**. sRGB hex.
 *
 * Dark mode background is sRGB `#171717`. At alpha 0.3 over the background:
 * - WebGL gamma blend → ~`#2A2A2A` perceptual.
 * - WebGPU linear blend → ~`#353535` perceptual.
 *
 * Both clearly visible against the dark surface without overwhelming geometry.
 */
export const infiniteGridColorDarkMode = 0x55_55_55;

/**
 * GLTF characteristic-edge tint, **light theme**. sRGB hex.
 *
 * Black matches the runtime edge middleware default and reads clearly over
 * matcap-lit surfaces on light viewport backgrounds.
 */
export const gltfEdgeColorLightMode = 0x00_00_00;

/**
 * GLTF characteristic-edge tint, **dark theme**. sRGB hex.
 *
 * Neutral gray only (no brand chroma): `oklch(0.62 0 0deg)` → `#868686`. Sits above
 * {@link infiniteGridColorDarkMode} (`#555555`) for readability on dimmed matcap faces,
 * but well below near-white so characteristic edges do not glare against `#171717`.
 */
export const gltfEdgeColorDarkMode = 0x86_86_86;

/**
 * Default tints for the {@link AxesHelper} XYZ axis lines. Stock Three.js axis hues,
 * desaturated slightly so they read as orientation cues rather than primary geometry.
 * Consumed verbatim by `THREE.Color`; valid in any {@linkcode @react-three/drei} `<Line>`,
 * `Line2NodeMaterial`, or other Three.js color slot.
 */
export const axesHelperColors = {
  /* oxlint-disable tau-lint/no-hardcoded-color -- Three.js viewport axis tints */
  x: 'rgb(125, 56, 50)',
  y: 'rgb(64, 115, 63)',
  z: 'rgb(37, 78, 136)',
  /* oxlint-enable tau-lint/no-hardcoded-color */
} as const;

/**
 * Default opacity for {@link AxesHelper} axis lines.
 *
 * Both backends must honor this via `transparent: true` on the underlying material:
 *
 * - **WebGL** — `Line` (drei) / `LineMaterial` (gizmo cube) must set `transparent: true`
 *   so `THREE.WebGLRenderer` enables `gl.BLEND` and the sRGB framebuffer carries the
 *   gamma-space blend. Skipping the flag silently drops `opacity` and writes the opaque
 *   source color straight to the framebuffer (CB-1).
 * - **WebGPU** — Tau's `Line2NodeMaterial` (see
 *   `apps/ui/app/components/geometry/graphics/three/materials/line2.material.ts`) sets
 *   `transparent: true` explicitly and performs the alpha mix in **sRGB space** inside the
 *   shader (CB-4 in-shader OETF/EOTF wrap), reaching perceptual parity with the WebGL
 *   gamma-space framebuffer blend even for fully saturated axis tints against dark
 *   backgrounds (the prior linear-space blend produced visibly over-saturated lines).
 *
 * Routing every viewport line through Tau's `Line2NodeMaterial` (not the stock
 * `three/webgpu` class) is what closes the seam — both the scene `AxesHelper` and the
 * gizmo cube axes import it from the same module.
 */
export const axesHelperOpacity = 0.6;
