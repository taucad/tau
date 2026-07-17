import * as THREE from 'three';
import { AdditiveBlending } from 'three';
import { PointsNodeMaterial } from 'three/webgpu';
import {
  abs,
  add,
  attribute,
  clamp,
  cross,
  div,
  exp,
  float,
  length,
  mix,
  mul,
  normalize,
  positionLocal,
  sin,
  sub,
  uniform,
  vec3,
} from 'three/tsl';

import type { MorphingPointsMaterialOptions } from '#components/geometry/splash/morphing-points-material.js';

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
  /** Pointer position in the points' local/object space (MorphingPoints converts from world space). */
  readonly uPointer: ReturnType<typeof uniform>;
  /** Repulsion displacement magnitude; 0 disables the effect (reduced motion). */
  readonly uPointerStrength: ReturnType<typeof uniform>;
  /** Radius (local units) over which pointer repulsion falls off to zero. */
  readonly uPointerRadius: ReturnType<typeof uniform>;
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

  // Pointer repulsion (scatter⇄converge): the cursor pushes nearby points off
  // the converged surface. Defaults keep the effect inert (strength 0) until the
  // hero canvas drives `uPointer`/`uPointerStrength` per frame.
  const uPointer = uniform(new THREE.Vector3(0, 0, 0));
  const uPointerStrength = uniform(0, 'float');
  const uPointerRadius = uniform(3, 'float');

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
    const morphed = add(mix(midExploded, vec3(aTargetPosition), uProgress), noiseTerm);

    // Pointer interaction applied after the morph so points rest on the
    // verified surface and only stir under the cursor. Gaussian falloff (no
    // hard shell), displacement bounded by uPointerStrength, per-point time
    // wobble for turbulence — mirrors the GLSL variant (sin stands in for its
    // composite noise, as with the swirl above). Branch-free direction via
    // `toPointer / (dist + eps)` avoids a normalize NaN at coincidence.
    const toPointer = sub(morphed, uPointer);
    const pointerDistance = length(toPointer);
    const pointerDirection = div(toPointer, add(pointerDistance, float(0.0001)));
    const pointerNorm = div(pointerDistance, uPointerRadius);
    const pointerFalloff = exp(mul(float(-3), mul(pointerNorm, pointerNorm)));
    const pointerWobble = add(
      float(0.75),
      mul(sin(add(mul(aRandomOffset, float(40)), mul(uTime, float(3)))), float(0.25)),
    );
    const pointerCurl = cross(pointerDirection, vec3(0, 0, 1));
    const pointerOffset = mul(
      add(pointerDirection, mul(pointerCurl, float(0.4))),
      mul(pointerFalloff, mul(pointerWobble, uPointerStrength)),
    );

    return add(morphed, pointerOffset);
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
      uPointer,
      uPointerStrength,
      uPointerRadius,
    },
  };
}
