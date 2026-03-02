/**
 * @taucad/three - Core Three.js utilities for CAD rendering.
 *
 * This entry point exports non-React utilities: materials, geometries,
 * camera/lighting math, screenshot capture, and vanilla controls.
 * For React components see `@taucad/three/react`.
 *
 * @packageDocumentation
 */

// ── Screenshot ────────────────────────────────────────────────────────────────

export { captureScreenshot } from '#screenshot/capture-screenshot.js';
export { createCompositeImage, calculateOptimalGrid } from '#screenshot/create-composite-image.js';
export type {
  CameraAngle,
  CompositeScreenshotOptions,
  ScreenshotOptions,
  ScreenshotOutputOptions,
} from '#screenshot/types.js';

// ── Camera utilities ──────────────────────────────────────────────────────────

export {
  resetCamera,
  updateCameraFov,
  computeViewFittingZoom,
} from '#utils/camera.utils.js';

// ── Math utilities ────────────────────────────────────────────────────────────

export {
  calculateFovDistanceCompensation,
} from '#utils/math.utils.js';

// ── Lighting utilities ────────────────────────────────────────────────────────

export {
  applyLightingForCamera,
} from '#utils/lights.utils.js';

// ── Color utilities ───────────────────────────────────────────────────────────

export { adjustHexColorBrightness } from '#utils/color.utils.js';

// ── Materials ─────────────────────────────────────────────────────────────────

export { matcapMaterial, ensureMatcapTextureLoaded } from '#materials/matcap-material.js';
export { createStripedMaterial } from '#materials/striped-material.js';
export { applyMatcap, applyMatcapToClonedScene, disposeClonedSceneMaterials } from '#materials/gltf-matcap.js';
export { applyFatLineSegments, updateLineMaterialResolution } from '#materials/gltf-edges.js';
export { infiniteGridMaterial } from '#materials/infinite-grid-material.js';
