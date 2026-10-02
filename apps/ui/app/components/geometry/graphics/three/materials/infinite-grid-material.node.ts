/* oxlint-disable eslint(new-cap) -- three/tsl `Fn`/`If`/`ElseIf`/`Else` are shader graph factories */

import { Color, DoubleSide } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  abs,
  add,
  cameraPosition,
  cameraProjectionMatrix,
  clamp,
  dFdx,
  dFdy,
  distance,
  div,
  float,
  Fn,
  fract,
  If,
  length,
  max,
  mix,
  modelViewMatrix,
  mul,
  positionLocal,
  smoothstep,
  sub,
  uniform,
  vec2,
  vec3,
  vec4,
  varyingProperty,
} from 'three/tsl';

import type {
  InfiniteGridMaterialHandle,
  InfiniteGridMaterialProperties,
  InfiniteGridVisualOverrides,
} from '#components/geometry/graphics/three/materials/infinite-grid-material.types.js';

const mapAxesToIndex = (axes: 'xyz' | 'xzy' | 'zyx'): number => {
  if (axes === 'xyz') {
    return 0;
  }

  if (axes === 'xzy') {
    return 1;
  }

  return 2;
};

/**
 * Reusable TSL function invoked more than once in the fragment graph. Do not pass
 * string names to `.toVar()` inside this body — TSL inlines at each call site and
 * `NodeBuilder` declaration names would collide (see `docs/policy/graphics-backend-policy.md`).
 */
/* oxlint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument -- TSL `Fn` shader ports omit stable `vec2`/`float` generics in `@types/three` */
const pristineGridIntensity = Fn(({ uv, thickness }: { uv: any; thickness: any }) => {
  const ddxUv = dFdx(uv).toVar();
  const ddyUv = dFdy(uv).toVar();
  const uvDdxyPacked = vec4(ddxUv.x, ddxUv.y, ddyUv.x, ddyUv.y).toVar();

  const uvDeriv = vec2(length(uvDdxyPacked.xz), length(uvDdxyPacked.yw)).toVar();

  const targetWidth = clamp(mul(uvDeriv, thickness), float(0), float(1)).toVar();
  const drawWidth = clamp(targetWidth, uvDeriv, vec2(float(0.5), float(0.5))).toVar();
  const lineAntiAliasScale = mul(max(uvDeriv, float(1e-6)), float(1.5)).toVar();

  const planarUv = vec2(uv.x, uv.y);
  const gridUv = sub(float(1), abs(sub(mul(fract(planarUv), float(2)), float(1)))).toVar();

  const gridAxes = vec2().toVar();

  gridAxes.x.assign(
    smoothstep(add(drawWidth.x, lineAntiAliasScale.x), sub(drawWidth.x, lineAntiAliasScale.x), gridUv.x),
  );

  gridAxes.y.assign(
    smoothstep(add(drawWidth.y, lineAntiAliasScale.y), sub(drawWidth.y, lineAntiAliasScale.y), gridUv.y),
  );

  gridAxes.mulAssign(clamp(div(targetWidth, drawWidth), float(0), float(1)));

  const derivScale = max(uvDeriv.x, uvDeriv.y);
  const lineBlend = clamp(sub(mul(derivScale, float(2)), float(1)), float(0), float(1));

  gridAxes.assign(mix(gridAxes, targetWidth, lineBlend));

  return mix(gridAxes.x, float(1), gridAxes.y);
});
/* oxlint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */

/** WebGPU infinite grid: mutate uniform `.value`s instead of recreating the material (see audit R1). */
export function createInfiniteGridNodeMaterial(
  properties?: InfiniteGridMaterialProperties,
): InfiniteGridMaterialHandle & { material: MeshBasicNodeMaterial } {
  const {
    smallSize = 1,
    largeSize = 100,
    color = new Color('grey'),
    axes = 'xyz',
    smallThickness = 1.25,
    largeThickness = 2,
    lineOpacity = 0.3,
    minGridDistance = 10,
    gridDistanceMultiplier = 20,
    fadeStart = 0.05,
    fadeEnd = 0.2,
    alphaThreshold = 0.01,
    normalOffset = 0.001,
  } = properties ?? {};

  if (!['xyz', 'xzy', 'zyx'].includes(axes)) {
    throw new Error('Invalid axes parameter: must be "xyz", "xzy", or "zyx"');
  }

  const axesIndexUniform = uniform(mapAxesToIndex(axes));
  const worldPosition = varyingProperty('vec3', 'worldPositionTauInfGrid');

  const uSmallSize = uniform(smallSize);
  const uLargeSize = uniform(largeSize);
  const uColor = uniform(color);
  const uSmallThickness = uniform(smallThickness);
  const uLargeThickness = uniform(largeThickness);
  const uLineOpacity = uniform(lineOpacity);
  const uMinGridDistance = uniform(minGridDistance);
  const uGridDistanceMultiplier = uniform(gridDistanceMultiplier);
  const uFadeStart = uniform(fadeStart);
  const uFadeEnd = uniform(fadeEnd);
  const uAlphaThreshold = uniform(alphaThreshold);
  const uNormalOffset = uniform(normalOffset);

  const material = new MeshBasicNodeMaterial({
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
  });

  material.lights = false;

  material.vertexNode = Fn(() => {
    const vertexCameraDistanceScalar = length(cameraPosition).toVar('tauCamDist');

    const scaledCameraDistance = mul(vertexCameraDistanceScalar, uGridDistanceMultiplier);
    const gridDistance = max(scaledCameraDistance, uMinGridDistance).toVar('tauGridDist');

    const gx = mul(positionLocal.x, gridDistance).toVar('tauGx');
    const gy = mul(positionLocal.y, gridDistance).toVar('tauGy');
    const gz = mul(positionLocal.z, gridDistance).toVar('tauGz');

    const posWorld = vec3().toVar('tauGridWorld');

    If(axesIndexUniform.equal(float(0)), () => {
      posWorld.assign(vec3(gx, gy, sub(gz, uNormalOffset)));
    })
      .ElseIf(axesIndexUniform.equal(float(1)), () => {
        posWorld.assign(vec3(gx, sub(gz, uNormalOffset), gy));
      })
      .Else(() => {
        posWorld.assign(vec3(sub(gz, uNormalOffset), gy, gx));
      });

    worldPosition.assign(posWorld);

    const mvPosition = mul(modelViewMatrix, vec4(posWorld, float(1))).toVec4();

    return cameraProjectionMatrix.mul(mvPosition);
  })();

  material.colorNode = Fn(() => {
    const worldPlane = vec2().toVar('tauWp');
    const cameraPlane = vec2().toVar('tauCp');

    If(axesIndexUniform.equal(float(0)), () => {
      worldPlane.assign(worldPosition.xy);
      cameraPlane.assign(cameraPosition.xy);
    })
      .ElseIf(axesIndexUniform.equal(float(1)), () => {
        worldPlane.assign(worldPosition.xz);
        cameraPlane.assign(cameraPosition.xz);
      })
      .Else(() => {
        worldPlane.assign(worldPosition.zy);
        cameraPlane.assign(cameraPosition.zy);
      });

    const planarDistance = distance(worldPlane, cameraPlane).toVar('tauPlanar');

    const fragmentCameraDistanceScalar = length(cameraPosition).toVar('tauCamDistFrag');

    const scaledCameraDistanceFrag = mul(fragmentCameraDistanceScalar, uGridDistanceMultiplier);
    const gridDistanceFrag = max(scaledCameraDistanceFrag, uMinGridDistance).toVar('tauGridDistFrag');

    const distanceRatio = div(planarDistance, gridDistanceFrag).toVar('tauRatio');

    const fadeFactor = smoothstep(uFadeEnd, uFadeStart, distanceRatio).toVar('tauFade');

    const uvSmall = div(worldPlane, uSmallSize);
    const uvLarge = div(worldPlane, uLargeSize);

    const gridSmall = pristineGridIntensity({ uv: uvSmall, thickness: uSmallThickness }).toVar('tauGs');
    const gridLarge = pristineGridIntensity({ uv: uvLarge, thickness: uLargeThickness }).toVar('tauGl');

    const gridCombined = mix(gridSmall, float(1), gridLarge).toVar('tauGridCombined');

    const finalAlpha = mul(mul(gridCombined, fadeFactor), uLineOpacity).toVar('tauAlpha');

    finalAlpha.lessThan(uAlphaThreshold).discard();

    return vec4(uColor.rgb, finalAlpha);
  })();

  const applyVisualOverrides = (overrides: InfiniteGridVisualOverrides): void => {
    if (overrides.smallSize !== undefined) {
      uSmallSize.value = overrides.smallSize;
    }

    if (overrides.largeSize !== undefined) {
      uLargeSize.value = overrides.largeSize;
    }

    if (overrides.color !== undefined) {
      uColor.value = overrides.color;
    }
  };

  return { material, applyVisualOverrides };
}

/**
 * Infinite grid analogue for {@link infiniteGridMaterial} using WebGPU + TSL.
 * Prefer {@link createInfiniteGridNodeMaterial} when you need to update sizes/colour without rebuilding.
 */
export function infiniteGridNodeMaterial(properties?: InfiniteGridMaterialProperties): MeshBasicNodeMaterial {
  return createInfiniteGridNodeMaterial(properties).material;
}
