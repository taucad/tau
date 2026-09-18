import { RenderTarget } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import type { ShowcaseRenderPipeline } from '#components/geometry/loader/showcase-post.js';

/**
 * Presentation-independent pixel evidence for the showcase loaders: one frame drawn into an offscreen target
 * and read back through the active backend, so a headless WebGPU adapter that cannot present still proves
 * what it renders.
 */

/** GPU API the node renderer ended up on after Three's own fallback. */
export type ShowcaseBackendInUse = 'webgpu' | 'webgl2';

/** Pixel statistics of one frame read back from an offscreen target, independent of canvas presentation. */
export type ShowcaseFrameCapture = Readonly<{
  backend: ShowcaseBackendInUse;
  /** Side length of the square readback, in pixels. */
  size: number;
  /** Fraction of pixels the body covers (alpha above half). */
  coverage: number;
  /** Mean display-referred luminance of the covered pixels, 0 to 1. */
  bodyLuminance: number;
  /** Standard deviation of luminance across the covered pixels. */
  bodyContrast: number;
  /** Fraction of covered pixels brighter than the highlight threshold. */
  highlightShare: number;
  /** Fraction of covered pixels darker than the shadow threshold. */
  shadowShare: number;
  /** Distinct 5-bit RGB buckets across the covered pixels. */
  distinctColors: number;
  /** Highest alpha, 0 to 1, inside the four corner blocks the body never reaches. */
  cornerAlpha: number;
}>;

/** Side length of the square readback; a multiple of 64 texels keeps WebGPU copy rows unpadded. */
export const captureSize = 256;
/** WebGPU aligns copied rows to this many bytes; a padded readback is unpacked with this stride. */
const readbackRowAlignment = 256;
/** Side length, in pixels, of the corner blocks whose alpha the capture reports. */
const captureCornerReach = 12;
/** Alpha, 0 to 255, from which a capture pixel counts as body. */
const coverageAlpha = 128;
const highlightLuminance = 0.85;
const shadowLuminance = 0.25;

/** Which backend a node renderer settled on. */
export const resolveBackendInUse = (renderer: WebGPURenderer): ShowcaseBackendInUse =>
  Reflect.get(renderer.backend, 'isWebGPUBackend') === true ? 'webgpu' : 'webgl2';

/** Summarise a square RGBA readback of {@link captureSize} pixels a side, tolerating WebGPU row padding. */
export const analyseCapture = (pixels: ArrayLike<number>, backend: ShowcaseBackendInUse): ShowcaseFrameCapture => {
  const size = captureSize;
  const tightRow = size * 4;
  const rowStride =
    pixels.length === size * tightRow ? tightRow : Math.ceil(tightRow / readbackRowAlignment) * readbackRowAlignment;
  const buckets = new Set<number>();
  let covered = 0;
  let luminanceSum = 0;
  let luminanceSquares = 0;
  let highlights = 0;
  let shadows = 0;
  let cornerAlpha = 0;
  for (let y = 0; y < size; y += 1) {
    const isCornerRow = y < captureCornerReach || y >= size - captureCornerReach;
    for (let x = 0; x < size; x += 1) {
      const offset = y * rowStride + x * 4;
      const alpha = pixels[offset + 3]!;
      if (isCornerRow && (x < captureCornerReach || x >= size - captureCornerReach)) {
        cornerAlpha = Math.max(cornerAlpha, alpha);
      }
      if (alpha < coverageAlpha) {
        continue;
      }
      covered += 1;
      const red = pixels[offset]!;
      const green = pixels[offset + 1]!;
      const blue = pixels[offset + 2]!;
      const luminance = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255;
      luminanceSum += luminance;
      luminanceSquares += luminance * luminance;
      if (luminance > highlightLuminance) {
        highlights += 1;
      }
      if (luminance < shadowLuminance) {
        shadows += 1;
      }
      buckets.add(Math.floor(red / 8) * 1024 + Math.floor(green / 8) * 32 + Math.floor(blue / 8));
    }
  }
  const mean = covered > 0 ? luminanceSum / covered : 0;
  const variance = covered > 0 ? Math.max(0, luminanceSquares / covered - mean * mean) : 0;
  return {
    backend,
    size,
    coverage: covered / (size * size),
    bodyLuminance: mean,
    bodyContrast: Math.sqrt(variance),
    highlightShare: covered > 0 ? highlights / covered : 0,
    shadowShare: covered > 0 ? shadows / covered : 0,
    distinctColors: buckets.size,
    cornerAlpha: cornerAlpha / 255,
  };
};

/**
 * Draw the scene the pipeline wraps into an offscreen target and read it back. The caller has already posed
 * the scene; the target is released before the readback awaits.
 */
export const captureFrameThrough = async (
  renderer: WebGPURenderer,
  pipeline: ShowcaseRenderPipeline,
): Promise<ShowcaseFrameCapture> => {
  const target = new RenderTarget(captureSize, captureSize, { depthBuffer: false });
  try {
    renderer.setRenderTarget(target);
    pipeline.render();
    renderer.setRenderTarget(null);
    const pixels = await renderer.readRenderTargetPixelsAsync(target, 0, 0, captureSize, captureSize);
    return analyseCapture(pixels, resolveBackendInUse(renderer));
  } finally {
    renderer.setRenderTarget(null);
    target.dispose();
  }
};
