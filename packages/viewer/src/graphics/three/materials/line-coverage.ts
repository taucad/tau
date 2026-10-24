import type { Node } from 'three/webgpu';
import { float } from 'three/tsl';

/**
 * Exact square-pixel area covered by an infinite screen-space strip.
 * The unit normal and signed distance are in device pixels; endpoints are owned by the caller.
 *
 * @internal
 * @param normal - Unit screen-space normal across the strip.
 * @param distance - Signed distance from the strip centre in device pixels.
 * @param halfWidth - Half the stroke width in device pixels.
 * @returns Fraction of a square device pixel covered by the strip.
 */
export const squarePixelStripCoverage = (
  normal: Node<'vec2'>,
  distance: Node<'float'>,
  halfWidth: Node<'float'>,
): Node<'float'> => {
  const a = normal.x.abs().max(normal.y.abs());
  const b = normal.x.abs().min(normal.y.abs());
  const support = a.add(b).mul(0.5);
  const shoulder = a.sub(b).mul(0.5);
  const cdf = (position: Node<'float'>): Node<'float'> => {
    const magnitude = position.abs();
    const tail = support.sub(magnitude).max(0);
    const outer = float(1).sub(tail.mul(tail).div(a.mul(b.max(1e-6)).mul(2)));
    const inner = float(0.5).add(magnitude.div(a));
    const positive = magnitude.lessThanEqual(shoulder).select(inner, outer);
    return position.lessThan(0).select(positive.oneMinus(), positive).clamp(0, 1);
  };
  return cdf(halfWidth.sub(distance))
    .sub(cdf(halfWidth.negate().sub(distance)))
    .clamp(0, 1);
};
