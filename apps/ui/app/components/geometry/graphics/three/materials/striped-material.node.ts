import { DoubleSide, Color } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { attribute, cos, float, Fn, fwidth, mix, mod, mul, sin, smoothstep, uniform, vec2, vec3 } from 'three/tsl';
import { resolveStripedAppearance } from '#components/geometry/graphics/three/materials/striped-material-resolve-appearance.js';
import type { StripedMaterialProperties } from '#components/geometry/graphics/three/materials/striped-material.types.js';

/* oxlint-disable eslint(new-cap) -- three/tsl `Fn()` builds node graphs via factory calls */

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
    transparent: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });

  material.colorNode = Fn(() => {
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
