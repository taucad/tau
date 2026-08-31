import * as THREE from 'three';
import type { ResolvedGraphicsBackend } from '#constants/editor.constants.js';
import { createVertexColoredStripedNodeMaterial } from '#components/geometry/graphics/three/materials/striped-material.node.js';
import { resolveStripedAppearance } from '#components/geometry/graphics/three/materials/striped-material-resolve-appearance.js';
import { applySectionCapDepthState } from '#components/geometry/graphics/three/materials/section-cap-depth-state.js';
import type { StripedMaterialProperties } from '#components/geometry/graphics/three/materials/striped-material.types.js';

/* oxlint-disable-next-line no-barrel-files/no-barrel-files -- façade consumers resolve the type here */
export type { StripedMaterialProperties } from '#components/geometry/graphics/three/materials/striped-material.types.js';

/** Opaque section-cap material driven by packed per-vertex appearance attributes. */
export function createVertexColoredStripedMaterial(properties?: StripedMaterialProperties): THREE.ShaderMaterial {
  const { stripeFrequency, stripeWidth } = resolveStripedAppearance(properties);

  const material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      uStripeFrequency: { value: stripeFrequency },
      uStripeWidth: { value: stripeWidth },
    },
    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute vec2 aPlaneUv;
      attribute vec3 aCapBaseColor;
      attribute vec3 aCapStripeColor;
      attribute float aCapPatternStrength;
      attribute vec2 aCapStripeAxis;
      varying vec2 vSurfacePos;
      varying vec3 vCapBaseColor;
      varying vec3 vCapStripeColor;
      varying float vCapPatternStrength;
      varying vec2 vCapStripeAxis;
      void main() {
        vSurfacePos = aPlaneUv;
        vCapBaseColor = aCapBaseColor;
        vCapStripeColor = aCapStripeColor;
        vCapPatternStrength = aCapPatternStrength;
        vCapStripeAxis = aCapStripeAxis;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform float uStripeFrequency;
      uniform float uStripeWidth;
      varying vec2 vSurfacePos;
      varying vec3 vCapBaseColor;
      varying vec3 vCapStripeColor;
      varying float vCapPatternStrength;
      varying vec2 vCapStripeAxis;
      void main() {
        #include <logdepthbuf_fragment>
        float pattern = mod(dot(vSurfacePos, vCapStripeAxis), uStripeFrequency);
        float aa = fwidth(pattern) * 1.5;
        float stripeMask = smoothstep(uStripeWidth - aa, uStripeWidth + aa, pattern);
        vec3 stripedColor = mix(vCapStripeColor, vCapBaseColor, stripeMask);
        vec3 finalColor = mix(vCapBaseColor, stripedColor, clamp(vCapPatternStrength, 0.0, 1.0));
        gl_FragColor = vec4(finalColor, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });

  applySectionCapDepthState(material, 'webgl');
  return material;
}

export function createVertexColoredStripedMaterialForBackend(
  backend: ResolvedGraphicsBackend,
  properties?: StripedMaterialProperties,
): THREE.Material {
  return backend === 'webgpu'
    ? createVertexColoredStripedNodeMaterial(properties)
    : createVertexColoredStripedMaterial(properties);
}
