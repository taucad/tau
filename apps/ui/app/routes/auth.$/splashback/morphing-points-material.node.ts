import * as THREE from 'three';
import { AdditiveBlending } from 'three';
import { PointsNodeMaterial } from 'three/webgpu';
import {
  abs,
  add,
  attribute,
  clamp,
  float,
  mix,
  mul,
  normalize,
  positionLocal,
  sin,
  sub,
  uniform,
  vec3,
} from 'three/tsl';

import type { MorphingPointsMaterialOptions } from '#routes/auth.$/splashback/morphing-points-material.js';

const defaultMorphOptions: Required<Omit<MorphingPointsMaterialOptions, 'targetColor'>> = {
  color: '#14b8a6',
  pointSize: 2,
  explosionStrength: 2,
  opacity: 1,
};

export type MorphingPointsNodeUniformHandles = {
  readonly uProgress: ReturnType<typeof uniform>;
  readonly uTime: ReturnType<typeof uniform>;
  readonly uOpacity: ReturnType<typeof uniform>;
  readonly uSourceRgb: ReturnType<typeof uniform>;
  readonly uTargetRgb: ReturnType<typeof uniform>;
  readonly uHasTargetColor: ReturnType<typeof uniform>;
};

/**
 * PointsNodeMaterial analogue of {@link createMorphingPointsMaterial} — WebGPU-first TSL path.
 */
export function createMorphingPointsNodeMaterial(options?: MorphingPointsMaterialOptions): {
  readonly material: PointsNodeMaterial;
  readonly handles: MorphingPointsNodeUniformHandles;
} {
  const { color, pointSize, explosionStrength, opacity } = { ...defaultMorphOptions, ...options };
  const targetColorInput = options?.targetColor ?? color;

  const uProgress = uniform(0, 'float');
  const uTime = uniform(0, 'float');
  const uExplosionStrength = uniform(explosionStrength, 'float');
  const uPointSize = uniform(pointSize, 'float');
  const uOpacity = uniform(opacity, 'float');
  const uHasTargetColor = uniform(options?.targetColor === undefined ? 0 : 1, 'float');
  const sourceColor = new THREE.Color(color);
  const targetColor = new THREE.Color(targetColorInput);
  const uSourceRgb = uniform(sourceColor);
  const uTargetRgb = uniform(targetColor);

  // Second argument must stay a literal `'vec3' | 'float'` for TSL generics; grouping under one `as const`
  // object satisfies `tau-lint(no-literal-const-assertion)` while preserving tsgo narrowing (bare `'vec3'`
  // widens when passed through overloads).
  const morphingPointShaderAttributeTypes = { targetPosition: 'vec3', randomOffset: 'float' } as const;
  const aTargetPosition = attribute('aTargetPosition', morphingPointShaderAttributeTypes.targetPosition);
  const aRandomOffset = attribute('aRandomOffset', morphingPointShaderAttributeTypes.randomOffset);

  const material = new PointsNodeMaterial({
    transparent: true,
    depthWrite: false,
    sizeAttenuation: true,
  });

  material.blending = AdditiveBlending;

  material.positionNode = (() => {
    const midpoint = mix(vec3(positionLocal), vec3(aTargetPosition), float(0.5));
    const explosionDirection = normalize(vec3(positionLocal));
    const explosionAmount = mul(sin(mul(uProgress, float(Math.PI))), uExplosionStrength);
    const midExploded = add(midpoint, mul(explosionDirection, explosionAmount));

    const transitionIntensity = clamp(
      sub(float(1), mul(abs(sub(uProgress, float(0.5))), float(2))),
      float(0),
      float(1),
    );
    const noiseVec = vec3(
      sin(add(mul(aRandomOffset, float(10)), mul(uTime, float(0.5)))),
      sin(add(mul(aRandomOffset, float(15)), mul(uTime, float(0.7)), float(1))),
      sin(add(mul(aRandomOffset, float(20)), mul(uTime, float(0.6)), float(2))),
    );
    const noiseTerm = mul(mul(noiseVec, transitionIntensity), float(0.15));
    const morphed = mix(midExploded, vec3(aTargetPosition), uProgress);

    return add(morphed, noiseTerm);
  })();

  const sizePulse = sub(float(1), mul(abs(sub(uProgress, float(0.5))), float(2)));
  const sizeFactorPulse = add(float(1), mul(sizePulse, float(0.3)));
  const sizeFactorRand = add(float(0.9), mul(aRandomOffset, float(0.2)));
  material.sizeNode = mul(mul(uPointSize, sizeFactorPulse), sizeFactorRand);

  material.colorNode = mix(uSourceRgb, uTargetRgb, mul(uProgress, uHasTargetColor));
  material.opacityNode = uOpacity;

  return {
    material,
    handles: {
      uProgress,
      uTime,
      uOpacity,
      uSourceRgb,
      uTargetRgb,
      uHasTargetColor,
    },
  };
}
