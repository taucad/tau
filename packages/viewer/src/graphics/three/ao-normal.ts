import { Fn, clamp, convert, ivec2, textureSize, abs, float, max, select, vec2, vec3 } from 'three/tsl';
import type { Node, TextureNode } from 'three/webgpu';

/** Encode a view-space unit normal over both hemispheres into two UNORM channels. @internal */
// oxlint-disable-next-line eslint/new-cap -- Three TSL shader-function factory.
export const encodeAoNormal = Fn(([normal]: [Node<'vec3'>]) => {
  const projected = normal.div(max(abs(normal.x).add(abs(normal.y)).add(abs(normal.z)), 0.000001)).toVar();
  const signs = vec2(select(projected.x.greaterThanEqual(0), 1, -1), select(projected.y.greaterThanEqual(0), 1, -1));
  const folded = projected.yx.abs().oneMinus().mul(signs);
  // Reserve zero for the pass's cleared background; every geometric normal uses 1..255.
  return select(projected.z.greaterThanEqual(0), projected.xy, folded)
    .mul(0.5)
    .add(0.5)
    .mul(254 / 255)
    .add(1 / 255);
});

/** Decode a sampled octahedral normal; normalize after UNORM quantization. @internal */
// oxlint-disable-next-line eslint/new-cap -- Three TSL shader-function factory.
export const decodeAoNormal = Fn(([encoded]: [Node<'vec2'>]) => {
  const xy = encoded.mul(255).sub(1).div(254).mul(2).sub(1).toVar();
  const normal = vec3(xy, float(1).sub(abs(xy.x)).sub(abs(xy.y))).toVar();
  const fold = max(normal.z.negate(), 0).toVar();
  const decoded = vec3(
    normal.x.add(select(normal.x.greaterThanEqual(0), fold.negate(), fold)),
    normal.y.add(select(normal.y.greaterThanEqual(0), fold.negate(), fold)),
    normal.z,
  ).normalize();
  // Keep the old cleared RGBA8 direction before interpolation with covered texels.
  return select<'vec3'>(encoded.x.equal(0).and(encoded.y.equal(0)), vec3(-1), decoded);
});

/**
 * The full-resolution texel that contains `uv`, clamped to the attachment.
 * @internal
 * @param input - Any full-resolution scene attachment.
 * @param uv - Top-first screen texture coordinates; Three flips loads for the execution backend.
 * @returns Integer texel coordinate for `load`.
 */
export function aoTexel(input: TextureNode, uv: Node): Node<'ivec2'> {
  const size = convert(textureSize(input), 'vec2') as Node<'vec2'>;
  // Clamp in float space: TSL's integer clamp overloads are untyped, and off-screen GTAO taps must stay in bounds.
  return ivec2(clamp((uv as Node<'vec2'>).mul(size), vec2(0), size.sub(1)));
}

/**
 * Fetch one surface's normal, never a blend. AO pairs it with the depth of the same texel:
 * interpolating at half-resolution texel corners mixed silhouettes with the cleared background
 * or the occluded surface behind, and GTAO turned those false normals into dark dots.
 * @internal
 * @param input - The owned pass's RG8 normal attachment, cleared to zero.
 * @param uv - Top-first screen texture coordinates.
 * @returns Decoded view-space direction of the texel containing `uv`.
 */
export function loadAoNormal(input: TextureNode, uv: Node): Node<'vec3'> {
  return decodeAoNormal(input.load(aoTexel(input, uv)).rg);
}
