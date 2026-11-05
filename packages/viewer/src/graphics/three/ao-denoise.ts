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
  mix,
  smoothstep,
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
  upsample: (filtered: AoTexture, uv: Node<'vec2'>, depthGuided?: boolean) => Node<'float'>;
  step: { value: Vector2 };
  depthPhi: { value: number };
}> {
  const step = uniform(new Vector2());
  // Visibility difference at which a tap stops counting toward its neighbourhood.
  const outlierRange = float(0.25);
  // |N·V| below which AO fades out (about 1.7° to 7° from edge-on).
  const grazingFadeStart = float(0.03);
  const grazingFadeEnd = float(0.12);
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
      const taps: Array<{ value: Node<'float'>; weight: Node<'float'> }> = [];
      // Build the fixed stencil once; constant weights need no per-fragment exp.
      for (let x = -2; x <= 2; x++) {
        for (let y = -2; y <= 2; y++) {
          // Spread 13 uniform taps across the footprint; guides still reject unrelated surfaces.
          if ((x + y) % 2 !== 0) {
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
          const weight = depthWeight.mul(normalWeight).toVar();
          const value = texture.sample(neighborUv).r.toVar();
          taps.push({ value, weight });
          sum.addAssign(value.mul(weight));
          weightSum.addAssign(weight);
        }
      }
      // A single GTAO texel can hit a sliver behind its surface. The sparse stencil would
      // print that firefly as a dot grid, so drop the one tap furthest from the surface
      // mean when it alone stands out. Contact seams darken several taps and keep them all.
      const mean = sum.div(max(weightSum, 0.0001)).toVar();
      const outlierDeviation = float(0).toVar();
      const runnerUpDeviation = float(0).toVar();
      const outlierValue = float(0).toVar();
      const outlierWeight = float(0).toVar();
      for (const { value, weight } of taps) {
        const deviation = abs(value.sub(mean))
          .mul(select<'float'>(weight.greaterThan(0.5), float(1), float(0)))
          .toVar();
        // oxlint-disable-next-line eslint/new-cap -- Three TSL conditional builder.
        If(deviation.greaterThan(outlierDeviation), () => {
          runnerUpDeviation.assign(outlierDeviation);
          outlierDeviation.assign(deviation);
          outlierValue.assign(value);
          outlierWeight.assign(weight);
          // oxlint-disable-next-line eslint/new-cap -- Three TSL conditional builder.
        }).ElseIf(deviation.greaterThan(runnerUpDeviation), () => {
          runnerUpDeviation.assign(deviation);
        });
      }
      const trimmed = outlierDeviation
        .greaterThan(outlierRange)
        .and(runnerUpDeviation.lessThan(outlierRange.mul(0.5)))
        .and(weightSum.sub(outlierWeight).greaterThan(0.5));
      result.assign(
        select<'float'>(
          weightSum.greaterThan(0),
          select<'float'>(
            trimmed,
            sum.sub(outlierValue.mul(outlierWeight)).div(max(weightSum.sub(outlierWeight), 0.0001)),
            mean,
          ),
          texture.sample(uv).r,
        ),
      );
    });
    return result;
  });
  /**
   * Four coarse texel centres, weighted by both bilinear footprint and full-resolution
   * surface agreement. Ordinary bilinear upscaling smears AO across CAD silhouettes.
   * `depthGuided: false` is for a pass whose target shares the scene depth attachment:
   * sampling it there is a feedback loop, so only normals separate the surfaces.
   * @param filtered - Half-resolution denoised visibility.
   * @param uv - Full-resolution screen coordinate.
   * @param depthGuided - Reject neighbours by plane distance as well as normal agreement.
   * @returns Visibility of the surface at `uv`.
   */
  const upsample = (filtered: AoTexture, uv: Node<'vec2'>, depthGuided = true): Node<'float'> => {
    // oxlint-disable-next-line eslint/new-cap -- Three TSL shader-function factory.
    return Fn(() => {
      const centerDepth = depthGuided ? (depth.sample(uv) as Node<'vec4'>).r.toVar() : float(0);
      const result = float(1).toVar();
      // oxlint-disable-next-line eslint/new-cap -- Three TSL conditional builder.
      If(centerDepth.lessThan(1), () => {
        const dimensions = convert(textureSize(filtered), 'vec2') as Node<'vec2'>;
        const texel = uv.mul(dimensions).sub(0.5).toVar();
        const base = texel.floor().toVar();
        const fraction = texel.fract().toVar();
        const centerPosition = depthGuided ? getViewPosition(uv, centerDepth, inverseProjection).toVar() : undefined;
        const centerNormal = (normal.sample(uv) as Node<'vec4'>).rgb.normalize().toVar();
        const sum = float(0).toVar();
        const weightSum = float(0).toVar();
        // Silhouette slivers can reject all four texels; fall back to the nearest surface, never raw GTAO.
        const nearestDistance = float(1e30).toVar();
        const nearest = float(1).toVar();
        for (let x = 0; x < 2; x++) {
          for (let y = 0; y < 2; y++) {
            const neighborUv = base
              .add(vec2(x + 0.5, y + 0.5))
              .div(dimensions)
              .toVar();
            const neighborNormal = (normal.sample(neighborUv) as Node<'vec4'>).rgb.normalize();
            const agreement = dot(centerNormal, neighborNormal).toVar();
            const value = filtered.sample(neighborUv).r.toVar();
            let distance: Node<'float'> = agreement.oneMinus();
            let depthWeight: Node<'float'> = float(1);
            if (centerPosition) {
              const neighborDepth = (depth.sample(neighborUv) as Node<'vec4'>).r;
              const neighborPosition = getViewPosition(neighborUv, neighborDepth, inverseProjection);
              distance = abs(dot(centerPosition.sub(neighborPosition), centerNormal)).toVar();
              depthWeight = max(float(1).sub(distance.div(depthPhi)), 0);
            }
            // oxlint-disable-next-line eslint/new-cap -- Three TSL conditional builder.
            If(distance.lessThan(nearestDistance), () => {
              nearestDistance.assign(distance);
              nearest.assign(value);
            });
            const normalWeight = pow(max(agreement, 0), 8);
            const bilinear = (x === 0 ? fraction.x.oneMinus() : fraction.x).mul(
              y === 0 ? fraction.y.oneMinus() : fraction.y,
            );
            const weight = depthWeight.mul(normalWeight).mul(bilinear).toVar();
            sum.addAssign(value.mul(weight));
            weightSum.addAssign(weight);
          }
        }
        // GTAO's horizon search is undefined for a face seen edge-on: its samples land on the body below and
        // report full occlusion, which prints as black dashes along one-pixel rims. Fade AO out there; the ray
        // between two depths on this pixel works for either projection.
        const ray = getViewPosition(uv, float(0.75), inverseProjection)
          .sub(getViewPosition(uv, float(0.25), inverseProjection))
          .normalize();
        const facing = abs(dot(centerNormal, ray));
        const filteredVisibility = select<'float'>(weightSum.greaterThan(0), sum.div(max(weightSum, 0.0001)), nearest);
        result.assign(mix(float(1), filteredVisibility, smoothstep(grazingFadeStart, grazingFadeEnd, facing)));
      });
      return result;
    })();
  };
  return { visibility, upsample, step, depthPhi };
}
