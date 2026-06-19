import { DoubleSide, Color } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  attribute,
  cos,
  float,
  Fn as tslFunction,
  fwidth,
  mix,
  mod,
  mul,
  sin,
  smoothstep,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';
import { resolveStripedAppearance } from '#components/geometry/graphics/three/materials/striped-material-resolve-appearance.js';
import { applySectionCapDepthState } from '#components/geometry/graphics/three/materials/section-cap-depth-state.js';
import type { StripedMaterialProperties } from '#components/geometry/graphics/three/materials/striped-material.types.js';

/** WebGPU/TSL analogue of {@link createStripedMaterial}. */
export function createStripedNodeMaterial(properties?: StripedMaterialProperties): MeshBasicNodeMaterial {
  const { stripeFrequency, stripeWidth, baseColor, stripeColor, stripeAngle } = resolveStripedAppearance(properties);

  const uBaseColor = uniform(new Color(baseColor));
  const uStripeColor = uniform(new Color(stripeColor));
  const uStripeFrequency = uniform(stripeFrequency);
  const uStripeWidth = uniform(stripeWidth);
  const uStripeAngle = uniform(stripeAngle);

  const material = new MeshBasicNodeMaterial({
    side: DoubleSide,
  });
  applySectionCapDepthState(material, 'webgpu');

  material.colorNode = tslFunction(() => {
    // Anchored to the section-plane basis via the consumer-supplied `aPlaneUv` attribute so
    // stripes stay diagonal regardless of how the plane is oriented in mesh-local space.
    // Explicit `<'vec2'>` narrows `attribute(...)`'s `TNodeType` so swizzles + `vec2(...)` typecheck.
    const surfacePlane = vec2(attribute<'vec2'>('aPlaneUv', 'vec2')).toVar('surfaceXY');

    const cAngle = cos(uStripeAngle);
    const sAngle = sin(uStripeAngle);
    const rotatedY = mul(surfacePlane.x, sAngle).add(mul(surfacePlane.y, cAngle)).toVar('rotatedY');

    const pattern = mod(rotatedY, uStripeFrequency).toVar('pattern');
    const aa = mul(fwidth(pattern), float(1.5)).toVar('aa');

    const stripeMask = smoothstep(uStripeWidth.sub(aa), uStripeWidth.add(aa), pattern);

    return vec3(mix(uStripeColor, uBaseColor, stripeMask));
  })();

  return material;
}

export function createVertexColoredStripedNodeMaterial(properties?: StripedMaterialProperties): MeshBasicNodeMaterial {
  const { stripeFrequency, stripeWidth } = resolveStripedAppearance(properties);

  const uStripeFrequency = uniform(stripeFrequency);
  const uStripeWidth = uniform(stripeWidth);

  const material = new MeshBasicNodeMaterial({
    side: DoubleSide,
  });
  applySectionCapDepthState(material, 'webgpu');

  material.colorNode = tslFunction(() => {
    const surfacePlane = vec2(attribute<'vec2'>('aPlaneUv', 'vec2')).toVar('surfaceXY');
    const baseColor = vec3(attribute<'vec3'>('aCapBaseColor', 'vec3')).toVar('capBaseColor');
    const stripeColor = vec3(attribute<'vec3'>('aCapStripeColor', 'vec3')).toVar('capStripeColor');
    const patternStrength = float(attribute<'float'>('aCapPatternStrength', 'float')).toVar('capPatternStrength');
    const stripeAxis = vec2(attribute<'vec2'>('aCapStripeAxis', 'vec2')).toVar('capStripeAxis');

    const patternCoordinate = mul(surfacePlane.x, stripeAxis.x)
      .add(mul(surfacePlane.y, stripeAxis.y))
      .toVar('patternCoordinate');

    const pattern = mod(patternCoordinate, uStripeFrequency).toVar('pattern');
    const aa = mul(fwidth(pattern), float(1.5)).toVar('aa');

    const stripeMask = smoothstep(uStripeWidth.sub(aa), uStripeWidth.add(aa), pattern);
    const stripedColor = vec3(mix(stripeColor, baseColor, stripeMask)).toVar('stripedColor');

    return vec3(mix(baseColor, stripedColor, patternStrength));
  })();

  return material;
}
