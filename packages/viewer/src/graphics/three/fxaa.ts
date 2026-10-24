/**
 * FXAA 3.11 by Timothy Lottes
 *
 * Copyright (c) 2011, NVIDIA CORPORATION. All rights reserved.
 *
 * TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THIS SOFTWARE IS PROVIDED "AS IS" AND NVIDIA AND ITS SUPPLIERS
 * DISCLAIM ALL WARRANTIES, EITHER EXPRESS OR IMPLIED, INCLUDING, BUT NOT LIMITED TO, IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE. IN NO EVENT SHALL NVIDIA OR ITS SUPPLIERS BE LIABLE FOR ANY
 * SPECIAL, INCIDENTAL, INDIRECT, OR CONSEQUENTIAL DAMAGES WHATSOEVER (INCLUDING, WITHOUT LIMITATION, DAMAGES FOR LOSS
 * OF BUSINESS PROFITS, BUSINESS INTERRUPTION, LOSS OF BUSINESS INFORMATION, OR ANY OTHER PECUNIARY LOSS) ARISING OUT OF
 * THE USE OF OR INABILITY TO USE THIS SOFTWARE, EVEN IF NVIDIA HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
 */

/*
 * Altered TSL adaptation for Tau.
 * Copyright © 2015 Raoul van Rüschen
 *
 * This software is provided 'as-is', without any express or implied warranty. In
 * no event will the authors be held liable for any damages arising from the use of
 * this software.
 *
 * Permission is granted to anyone to use this software for any purpose, including
 * commercial applications, and to alter it and redistribute it freely, subject to
 * the following restrictions:
 *
 * 1. The origin of this software must not be misrepresented; you must not claim
 *    that you wrote the original software. If you use this software in a product,
 *    an acknowledgment in the product documentation would be appreciated but is
 *    not required.
 *
 * 2. Altered source versions must be plainly marked as such, and must not be
 *    misrepresented as being the original software.
 *
 * 3. This notice may not be removed or altered from any source distribution.
 *
 */
import {
  Fn,
  If,
  Loop,
  Break,
  abs,
  clamp,
  convert,
  dot,
  float,
  max,
  min,
  select,
  xor,
  screenUV,
  textureSize,
  vec2,
  vec3,
} from 'three/tsl';
import type { TextureNode, Node } from 'three/webgpu';

/**
 * The viewport's WebGL FXAA contract expressed in TSL: linear, tone-mapped input,
 * Rec.709 luminance and 0.75 subpixel quality. The default bounds the search to
 * 6 steps; 12 preserves the original FXAAEffect comparison. Three's display FXAA
 * uses different settings and chooses the opposite side when gradients tie.
 *
 * Adapted from pmndrs/postprocessing src/effects/glsl/fxaa.frag (Zlib license).
 * Owns no resources; the caller owns the single-sample input target.
 * @internal
 * @param input - Texture supplying the native output dimensions and default samples.
 * @param sampleColor - Optional composition at a UV, avoiding a separate color intermediate.
 * @param searchSteps - Bounded surface search; 12 retains the original comparison reference.
 * @returns Filtered surface color. Draw analytically covered CAD lines after this filter.
 */
export function createViewportFxaa(
  input: TextureNode,
  sampleColor?: (uv: Node<'vec2'>) => Node<'vec4'>,
  searchSteps: 6 | 12 = 6,
): Node<'vec4'> {
  const texel = vec2(1).div(convert(textureSize(input), 'vec2') as Node<'vec2'>);
  // TextureNode.sample keeps the texture fluent API at runtime, omitted by Three's declarations.
  const sample =
    sampleColor ??
    ((uv: Node<'vec2'>): Node<'vec4'> => (input.sample(uv) as TextureNode).level(float(0)) as Node<'vec4'>);
  const luminance = (uv: Node<'vec2'>): Node<'float'> => dot(sample(uv).rgb, vec3(0.2126, 0.7152, 0.0722));
  // oxlint-disable-next-line eslint/new-cap -- Three TSL shader-function factory.
  return Fn(() => {
    const uv = screenUV;
    const color = sample(uv).toVar();
    // Keep the 12-step graph as the unchanged measurement reference.
    const center = searchSteps === 12 ? luminance(uv).toVar() : dot(color.rgb, vec3(0.2126, 0.7152, 0.0722)).toVar();
    const down = luminance(uv.add(texel.mul(vec2(0, -1)))).toVar();
    const up = luminance(uv.add(texel.mul(vec2(0, 1)))).toVar();
    const left = luminance(uv.add(texel.mul(vec2(-1, 0)))).toVar();
    const right = luminance(uv.add(texel.mul(vec2(1, 0)))).toVar();
    const highest = max(center, down, up, left, right).toVar();
    const range = highest.sub(min(center, down, up, left, right)).toVar();
    // oxlint-disable-next-line eslint/new-cap -- Three TSL branch.
    If(range.greaterThanEqual(max(0.0312, highest.mul(0.125))), () => {
      const downLeft = luminance(uv.add(texel.mul(vec2(-1, -1)))).toVar();
      const downRight = luminance(uv.add(texel.mul(vec2(1, -1)))).toVar();
      const upLeft = luminance(uv.add(texel.mul(vec2(-1, 1)))).toVar();
      const upRight = luminance(uv.add(texel.mul(vec2(1, 1)))).toVar();
      const downUp = down.add(up);
      const leftRight = left.add(right);
      const leftCorners = downLeft.add(upLeft);
      const rightCorners = downRight.add(upRight);
      const horizontal = abs(leftCorners.sub(left.mul(2)))
        .add(abs(downUp.sub(center.mul(2))).mul(2))
        .add(abs(rightCorners.sub(right.mul(2))));
      const vertical = abs(upRight.add(upLeft).sub(up.mul(2)))
        .add(abs(leftRight.sub(center.mul(2))).mul(2))
        .add(abs(downLeft.add(downRight).sub(down.mul(2))));
      const isHorizontal = horizontal.greaterThanEqual(vertical).toVar();
      const first = select(isHorizontal, down, left);
      const second = select(isHorizontal, up, right);
      const gradient1 = abs(first.sub(center));
      const gradient2 = abs(second.sub(center));
      const firstSteepest = gradient1.greaterThanEqual(gradient2);
      const step = select(isHorizontal, texel.y, texel.x)
        .mul(select(firstSteepest, -1, 1))
        .toVar();
      const average = select(firstSteepest, first, second).add(center).mul(0.5).toVar();
      const threshold = max(gradient1, gradient2).mul(0.25).toVar();
      const perpendicular = select<'vec2'>(isHorizontal, vec2(0, step), vec2(step, 0));
      const along = select<'vec2'>(isHorizontal, vec2(texel.x, 0), vec2(0, texel.y));
      const edgeUv = uv.add(perpendicular.mul(0.5));
      const uv1 = edgeUv.sub(along).toVar();
      const uv2 = edgeUv.add(along).toVar();
      const end1 = luminance(uv1).sub(average).toVar();
      const end2 = luminance(uv2).sub(average).toVar();
      const reached1 = abs(end1).greaterThanEqual(threshold).toVar();
      const reached2 = abs(end2).greaterThanEqual(threshold).toVar();
      // oxlint-disable-next-line eslint/new-cap -- Three TSL branch.
      If(reached1.not(), () => {
        uv1.subAssign(along);
      });
      // oxlint-disable-next-line eslint/new-cap -- Three TSL branch.
      If(reached2.not(), () => {
        uv2.addAssign(along);
      });
      // oxlint-disable-next-line eslint/new-cap -- Bounded surface search; the 12-step reference matches FXAAEffect.
      Loop({ start: 2, end: searchSteps }, ({ i }) => {
        // oxlint-disable-next-line eslint/new-cap -- Three TSL branch.
        If(reached1.and(reached2), () => {
          // oxlint-disable-next-line eslint/new-cap -- Three TSL loop control.
          Break();
        });
        // oxlint-disable-next-line eslint/new-cap -- Three TSL branch.
        If(reached1.not(), () => {
          end1.assign(luminance(uv1).sub(average));
        });
        // oxlint-disable-next-line eslint/new-cap -- Three TSL branch.
        If(reached2.not(), () => {
          end2.assign(luminance(uv2).sub(average));
        });
        reached1.assign(abs(end1).greaterThanEqual(threshold));
        reached2.assign(abs(end2).greaterThanEqual(threshold));
        const quality =
          searchSteps === 6
            ? select(i.equal(2), 1.5, select(i.equal(3), 2, select(i.equal(4), 4, 8)))
            : select(i.lessThan(5), 1, select(i.equal(5), 1.5, select(i.lessThan(10), 2, select(i.equal(10), 4, 8))));
        // oxlint-disable-next-line eslint/new-cap -- Three TSL branch.
        If(reached1.not(), () => {
          uv1.subAssign(along.mul(quality));
        });
        // oxlint-disable-next-line eslint/new-cap -- Three TSL branch.
        If(reached2.not(), () => {
          uv2.addAssign(along.mul(quality));
        });
      });
      const distance1 = select(isHorizontal, uv.x.sub(uv1.x), uv.y.sub(uv1.y));
      const distance2 = select(isHorizontal, uv2.x.sub(uv.x), uv2.y.sub(uv.y));
      const end = select(distance1.lessThan(distance2), end1, end2);
      const correct = xor(end.lessThan(0), center.lessThan(average));
      const edgeOffset = select(correct, float(0.5).sub(min(distance1, distance2).div(distance1.add(distance2))), 0);
      const neighborhood = downUp.add(leftRight).mul(2).add(leftCorners).add(rightCorners).div(12);
      const subpixel = clamp(abs(neighborhood.sub(center)).div(range), 0, 1).toVar();
      const smooth = subpixel.mul(subpixel).mul(float(3).sub(subpixel.mul(2)));
      const offset = max(edgeOffset, smooth.mul(smooth).mul(0.75));
      color.assign(sample(uv.add(perpendicular.mul(offset))));
    });
    return color;
  })();
}
