/* oxlint-disable new-cap -- three/tsl `Fn`/`If`/`ElseIf`/`Else` are shader graph factories */

import { Color, DoubleSide, Vector2 } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  abs,
  add,
  cameraPosition,
  cameraProjectionMatrix,
  cameraViewMatrix,
  clamp,
  dFdx,
  dFdy,
  div,
  float,
  Fn,
  fract,
  If,
  length,
  max,
  mix,
  mul,
  positionLocal,
  smoothstep,
  sub,
  uniform,
  vec2,
  vec3,
  vec4,
  varying,
  varyingProperty,
} from 'three/tsl';

import type {
  InfiniteGridMaterialHandle,
  InfiniteGridMaterialProperties,
  InfiniteGridVisualOverrides,
} from '#components/geometry/graphics/three/materials/infinite-grid-material.types.js';
import {
  infiniteGridFadeEndRatio,
  infiniteGridFadeStartRatio,
} from '#components/geometry/graphics/three/utils/infinite-grid-frame.js';

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
const pristineGridIntensity = Fn(({ uv, uvDeriv, thickness }: { uv: any; uvDeriv: any; thickness: any }) => {
  const targetWidth = clamp(mul(uvDeriv, thickness), float(0), float(1)).toVar();
  const drawWidth = clamp(targetWidth, uvDeriv, vec2(float(0.5), float(0.5))).toVar();
  const lineAntiAliasScale = mul(max(uvDeriv, vec2(float(1e-6), float(1e-6))), float(1.5)).toVar();

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
    gridDistance = 20,
    fadeStart = infiniteGridFadeStartRatio,
    fadeEnd = infiniteGridFadeEndRatio,
    planeOffset = 0,
    smallPhase = [0, 0],
    largePhase = [0, 0],
    alphaThreshold = 0.01,
  } = properties ?? {};

  if (!['xyz', 'xzy', 'zyx'].includes(axes)) {
    throw new Error('Invalid axes parameter: must be "xyz", "xzy", or "zyx"');
  }

  const axesIndexUniform = uniform(mapAxesToIndex(axes));
  const renderPlanePosition = varyingProperty('vec2', 'renderPlanePositionTauInfGrid');
  const gridProxyPosition = varying(positionLocal.xy, 'gridProxyPositionTauInfGrid');

  const uSmallSize = uniform(smallSize);
  const uLargeSize = uniform(largeSize);
  const uColor = uniform(color);
  const uSmallThickness = uniform(smallThickness);
  const uLargeThickness = uniform(largeThickness);
  const uLineOpacity = uniform(lineOpacity);
  const uGridDistance = uniform(gridDistance);
  const uPlaneOffset = uniform(planeOffset);
  const uSmallPhase = uniform(new Vector2(...smallPhase));
  const uLargePhase = uniform(new Vector2(...largePhase));
  const uAlphaThreshold = uniform(alphaThreshold);

  const material = new MeshBasicNodeMaterial({
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  material.lights = false;
  material.forceSinglePass = true;

  material.vertexNode = Fn(() => {
    const cameraPlane = vec2().toVar('tauGridCameraPlane');

    If(axesIndexUniform.equal(float(0)), () => {
      cameraPlane.assign(cameraPosition.xy);
    })
      .ElseIf(axesIndexUniform.equal(float(1)), () => {
        cameraPlane.assign(cameraPosition.xz);
      })
      .Else(() => {
        cameraPlane.assign(cameraPosition.zy);
      });

    renderPlanePosition.assign(add(cameraPlane, mul(positionLocal.xy, uGridDistance)));

    const posWorld = vec3().toVar('tauGridWorld');

    If(axesIndexUniform.equal(float(0)), () => {
      posWorld.assign(vec3(renderPlanePosition.x, renderPlanePosition.y, uPlaneOffset));
    })
      .ElseIf(axesIndexUniform.equal(float(1)), () => {
        posWorld.assign(vec3(renderPlanePosition.x, uPlaneOffset, renderPlanePosition.y));
      })
      .Else(() => {
        posWorld.assign(vec3(uPlaneOffset, renderPlanePosition.y, renderPlanePosition.x));
      });

    const viewPosition = mul(cameraViewMatrix, vec4(posWorld, float(1))).toVec4();

    return cameraProjectionMatrix.mul(viewPosition);
  })();

  material.colorNode = Fn(() => {
    const uvSmall = add(div(renderPlanePosition, uSmallSize), uSmallPhase);
    const uvLarge = add(div(renderPlanePosition, uLargeSize), uLargePhase);
    const planeDdx = dFdx(renderPlanePosition).toVar('tauGridPlaneDdx');
    const planeDdy = dFdy(renderPlanePosition).toVar('tauGridPlaneDdy');
    const planePackedDerivatives = vec4(planeDdx.x, planeDdx.y, planeDdy.x, planeDdy.y);
    const planeDerivatives = vec2(length(planePackedDerivatives.xz), length(planePackedDerivatives.yw)).toVar(
      'tauGridPlaneDerivatives',
    );

    const gridSmall = pristineGridIntensity({
      uv: uvSmall,
      uvDeriv: div(planeDerivatives, uSmallSize),
      thickness: uSmallThickness,
    }).toVar('tauGs');
    const gridLarge = pristineGridIntensity({
      uv: uvLarge,
      uvDeriv: div(planeDerivatives, uLargeSize),
      thickness: uLargeThickness,
    }).toVar('tauGl');

    const gridCombined = mix(gridSmall, float(1), gridLarge).toVar('tauGridCombined');
    const radialDistanceRatio = length(gridProxyPosition).toVar('tauGridRadialDistanceRatio');
    const fadeFactor = sub(float(1), smoothstep(float(fadeStart), float(fadeEnd), radialDistanceRatio)).toVar(
      'tauGridFadeFactor',
    );

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

    if (overrides.lineOpacity !== undefined) {
      uLineOpacity.value = overrides.lineOpacity;
    }

    if (overrides.gridDistance !== undefined) {
      uGridDistance.value = overrides.gridDistance;
    }

    if (overrides.planeOffset !== undefined) {
      uPlaneOffset.value = overrides.planeOffset;
    }

    if (overrides.smallPhase !== undefined) {
      uSmallPhase.value.set(...overrides.smallPhase);
    }

    if (overrides.largePhase !== undefined) {
      uLargePhase.value.set(...overrides.largePhase);
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
