import {
  uniform,
  Fn,
  If,
  select,
  float,
  vec2,
  dot,
  max,
  abs,
  pow,
  getViewPosition,
  textureSize,
  convert,
} from 'three/tsl';
import type { sample } from 'three/tsl';
import type { Node } from 'three/webgpu';
import { Vector2 } from 'three';
import type { Camera } from 'three';
import type { ao } from 'three/addons/tsl/display/GTAONode.js';

type AoTexture = ReturnType<ReturnType<typeof ao>['getTextureNode']>;

/**
 * Deterministic joint bilateral AO reconstruction. Only visibility is filtered;
 * depth and normals reject neighbours across part boundaries. Inputs and the
 * inverse projection use the same forward-depth convention as GTAO.
 * @internal
 * @returns Visibility graph and mutable sampling uniforms; no owned GPU resources.
 */
export function createAoDenoise({
  texture,
  depth,
  normal,
  camera,
}: {
  readonly texture: AoTexture;
  readonly depth: ReturnType<typeof sample>;
  readonly normal: ReturnType<typeof sample>;
  readonly camera: Camera;
}): Readonly<{
  visibility: (uv: Node<'vec2'>) => Node<'float'>;
  upsample: (filtered: AoTexture, uv: Node<'vec2'>) => Node<'float'>;
  step: { value: Vector2 };
  depthPhi: { value: number };
}> {
  const step = uniform(new Vector2());
  const depthPhi = uniform(1);
  const inverseProjection = uniform(camera.projectionMatrixInverse);
  // One fixed grid avoids adding a second stochastic pattern to a demand frame.
  // oxlint-disable-next-line eslint/new-cap -- Three TSL shader-function factory.
  const visibility = Fn(([uv]: [Node<'vec2'>]) => {
    const centerDepth = (depth.sample(uv) as Node<'vec4'>).r.toVar();
    const result = float(1).toVar();
    // oxlint-disable-next-line eslint/new-cap -- Three TSL conditional builder.
    If(centerDepth.lessThan(1), () => {
      const centerPosition = getViewPosition(uv, centerDepth, inverseProjection).toVar();
      // MRT samples retain alpha. Drop it in the graph, not just the TS type:
      // a vec4 normal makes the plane-distance dot product include a false W term.
      const centerNormal = (normal.sample(uv) as Node<'vec4'>).rgb.normalize().toVar();
      const sum = float(0).toVar();
      const weightSum = float(0).toVar();
      // Build the fixed stencil once; constant weights need no per-fragment exp.
      for (let x = -2; x <= 2; x++) {
        for (let y = -2; y <= 2; y++) {
          // Keep the 13 strongest Gaussian taps; omit distant corners before shader generation.
          if (x * x + y * y > 4) {
            continue;
          }
          const offset = vec2(x, y);
          const neighborUv = uv.add(offset.mul(step)).toVar();
          const neighborDepth = (depth.sample(neighborUv) as Node<'vec4'>).r.toVar();
          const neighborPosition = getViewPosition(neighborUv, neighborDepth, inverseProjection).toVar();
          const neighborNormal = (normal.sample(neighborUv) as Node<'vec4'>).rgb.normalize().toVar();
          const planeDistance = abs(dot(centerPosition.sub(neighborPosition), centerNormal));
          const depthWeight = max(float(1).sub(planeDistance.div(depthPhi)), 0);
          const normalWeight = pow(max(dot(centerNormal, neighborNormal), 0), 8);
          const spatialWeight = Math.exp(-(x * x + y * y) * 0.5);
          const weight = depthWeight.mul(normalWeight).mul(spatialWeight).toVar();
          sum.addAssign(texture.sample(neighborUv).r.mul(weight));
          weightSum.addAssign(weight);
        }
      }
      result.assign(select<'float'>(weightSum.greaterThan(0), sum.div(max(weightSum, 0.0001)), texture.sample(uv).r));
    });
    return result;
  });
  const upsample = (filtered: AoTexture, uv: Node<'vec2'>): Node<'float'> => {
    // Four coarse texel centres, weighted by both bilinear footprint and full-resolution
    // surface agreement. Ordinary bilinear upscaling smears AO across CAD silhouettes.
    // oxlint-disable-next-line eslint/new-cap -- Three TSL shader-function factory.
    return Fn(() => {
      const centerDepth = (depth.sample(uv) as Node<'vec4'>).r.toVar();
      const result = float(1).toVar();
      // oxlint-disable-next-line eslint/new-cap -- Three TSL conditional builder.
      If(centerDepth.lessThan(1), () => {
        const dimensions = convert(textureSize(filtered), 'vec2') as Node<'vec2'>;
        const texel = uv.mul(dimensions).sub(0.5).toVar();
        const base = texel.floor().toVar();
        const fraction = texel.fract().toVar();
        const centerPosition = getViewPosition(uv, centerDepth, inverseProjection).toVar();
        const centerNormal = (normal.sample(uv) as Node<'vec4'>).rgb.normalize().toVar();
        const sum = float(0).toVar();
        const weightSum = float(0).toVar();
        for (let x = 0; x < 2; x++) {
          for (let y = 0; y < 2; y++) {
            const neighborUv = base
              .add(vec2(x + 0.5, y + 0.5))
              .div(dimensions)
              .toVar();
            const neighborDepth = (depth.sample(neighborUv) as Node<'vec4'>).r;
            const neighborPosition = getViewPosition(neighborUv, neighborDepth, inverseProjection);
            const neighborNormal = (normal.sample(neighborUv) as Node<'vec4'>).rgb.normalize();
            const planeDistance = abs(dot(centerPosition.sub(neighborPosition), centerNormal));
            const depthWeight = max(float(1).sub(planeDistance.div(depthPhi)), 0);
            const normalWeight = pow(max(dot(centerNormal, neighborNormal), 0), 8);
            const bilinear = (x === 0 ? fraction.x.oneMinus() : fraction.x).mul(
              y === 0 ? fraction.y.oneMinus() : fraction.y,
            );
            const weight = depthWeight.mul(normalWeight).mul(bilinear).toVar();
            sum.addAssign(filtered.sample(neighborUv).r.mul(weight));
            weightSum.addAssign(weight);
          }
        }
        result.assign(select<'float'>(weightSum.greaterThan(0), sum.div(max(weightSum, 0.0001)), texture.sample(uv).r));
      });
      return result;
    })();
  };
  return { visibility, upsample, step, depthPhi };
}
