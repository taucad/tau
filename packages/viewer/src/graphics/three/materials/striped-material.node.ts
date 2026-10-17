import { DoubleSide } from 'three';
import type { Material } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { attribute, Fn as tslFunction, fwidth, mix, mod, mul, smoothstep, uniform, vec2, vec3 } from 'three/tsl';
import { resolveStripedAppearance } from '#graphics/three/materials/striped-material-resolve-appearance.js';
import type { StripedMaterialProperties } from '#graphics/three/materials/striped-material.types.js';

type StripeUniforms = Readonly<{ frequency: { value: number }; width: { value: number } }>;

const stripeUniformsByMaterial = new WeakMap<Material, StripeUniforms>();

/** The WebGPU section-cap material, mirroring `striped-material.ts`: per-vertex colours over plane-space stripes. */
export function createVertexColoredStripedNodeMaterial(properties?: StripedMaterialProperties): MeshBasicNodeMaterial {
  const { stripeFrequency, stripeWidth } = resolveStripedAppearance(properties);

  const uStripeFrequency = uniform(stripeFrequency);
  const uStripeWidth = uniform(stripeWidth);

  const material = new MeshBasicNodeMaterial({ name: 'TauSectionCap', side: DoubleSide });

  material.colorNode = tslFunction(() => {
    const surfacePlane = vec2(attribute<'vec2'>('aPlaneUv', 'vec2')).toVar('surfaceXY');
    const baseColor = vec3(attribute<'vec3'>('aCapBaseColor', 'vec3')).toVar('capBaseColor');
    const stripeColor = vec3(attribute<'vec3'>('aCapStripeColor', 'vec3')).toVar('capStripeColor');
    const stripeAxis = vec2(attribute<'vec2'>('aCapStripeAxis', 'vec2')).toVar('capStripeAxis');

    const patternCoordinate = mul(surfacePlane.x, stripeAxis.x)
      .add(mul(surfacePlane.y, stripeAxis.y))
      .toVar('patternCoordinate');

    const pattern = mod(patternCoordinate, uStripeFrequency).toVar('pattern');
    const aa = mul(fwidth(pattern), 1.5).toVar('aa');

    const stripeMask = smoothstep(uStripeWidth.sub(aa), uStripeWidth.add(aa), pattern);
    return vec3(mix(stripeColor, baseColor, stripeMask));
  })();

  stripeUniformsByMaterial.set(material, { frequency: uStripeFrequency, width: uStripeWidth });
  return material;
}

/** Writes new stripes into a node cap material's uniforms; its pipeline stays as it is. */
export function setVertexColoredStripedNodeMaterialStripes(
  material: Material,
  stripes: Readonly<{ stripeFrequency: number; stripeWidth: number }>,
): void {
  const uniforms = stripeUniformsByMaterial.get(material);
  if (!uniforms) {
    throw new Error('Not a section-cap node material.');
  }
  uniforms.frequency.value = stripes.stripeFrequency;
  uniforms.width.value = stripes.stripeWidth;
}
