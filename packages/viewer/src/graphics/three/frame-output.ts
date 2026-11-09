import { NoToneMapping } from 'three';
import type { Node, WebGPURenderer } from 'three/webgpu';
import { float, max, renderOutput, vec4 } from 'three/tsl';

/**
 * Encode the linear frame for the viewport's premultiplied-alpha canvas.
 *
 * The viewport clears to transparent and the page background shows through, so overlay
 * pixels such as the grid hold premultiplied linear colour. Encoding that premultiplied
 * value to sRGB brightens small contributions: a dark grid line over a dark page gained
 * contrast while the same line over a white page nearly vanished. This encodes the straight
 * colour and premultiplies after, so the browser composites `alpha * sRGB(color)` over the
 * page as the tints in `overlay-colors.constants.ts` assume. Opaque pixels are unchanged.
 *
 * @param color - Premultiplied linear frame sample.
 * @param colorSpace - The renderer's output colour space.
 * @returns Premultiplied colour encoded for the canvas.
 */
export const encodeFrameOutput = (
  color: Node<'vec4'>,
  colorSpace: WebGPURenderer['outputColorSpace'],
): Node<'vec4'> => {
  const alpha = color.a;
  // A transparent pixel holds zero colour, so the clamped divisor leaves it at zero.
  const straight = vec4(color.rgb.div(max(alpha, float(1e-6))), float(1));
  const encoded = renderOutput(straight, NoToneMapping, colorSpace);
  return vec4(encoded.rgb.mul(alpha), alpha);
};
