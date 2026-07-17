/**
 * `@taucad/render` — GLB → image transcoder façade.
 *
 * Picks the wasm (browser worker WebGPU) or napi (Node native) artifact and
 * renders one or many identified views with typed failures.
 *
 * Blueprints:
 * - docs/research/render-multi-view-images-and-axis-indicator.md
 * - docs/research/render-capture-overlay-annotations.md
 */

export { renderGlbToImage } from '#render-glb-to-image.js';
export { renderGlbToImages } from '#render-glb-to-images.js';
export { RenderError } from '#render-error.js';
export type { RenderFailureCode } from '#render-error.js';
export { createRenderImageOptions, createRenderImagesOptions } from '#options.js';
export type {
  RenderImageOptions,
  RenderImagesOptions,
  RenderImageView,
  RenderedImage,
  RenderedImages,
  RenderImageFormat,
  RenderUpAxis,
  RenderProjection,
} from '#options.js';
