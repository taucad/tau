import * as THREE from 'three';
import type { ResolvedGraphicsBackend } from '#constants/editor.constants.js';
import {
  createStripedNodeMaterial,
  createVertexColoredStripedNodeMaterial,
} from '#components/geometry/graphics/three/materials/striped-material.node.js';
import { resolveStripedAppearance } from '#components/geometry/graphics/three/materials/striped-material-resolve-appearance.js';
import { applySectionCapDepthState } from '#components/geometry/graphics/three/materials/section-cap-depth-state.js';
import type { StripedMaterialProperties } from '#components/geometry/graphics/three/materials/striped-material.types.js';

/* oxlint-disable-next-line no-barrel-files/no-barrel-files -- façade consumers resolve `StripedMaterialProperties` from this module */
export type { StripedMaterialProperties } from '#components/geometry/graphics/three/materials/striped-material.types.js';

/**
 * Creates a striped material for BVH section-cap fill meshes (no stencil — Architecture C).
 *
 * Default behavior: diagonal stripes locked to the cap plane in object space.
 *
 * @param properties - Configuration options for the striped material
 * @param properties.stripeFrequency - Distance between stripes in plane units (same units as geometry)
 * @param properties.baseColor - Base color of the material
 * @param properties.stripeColor - Color of the stripes
 * @returns A THREE.ShaderMaterial with striped pattern
 */
export function createStripedMaterial(properties?: StripedMaterialProperties): THREE.ShaderMaterial {
  const { stripeFrequency, stripeWidth, stripeAngle, baseColor, stripeColor } = resolveStripedAppearance(properties);

  const stripedMaterial = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      uBaseColor: {
        value: new THREE.Color(baseColor),
      },
      uStripeFrequency: {
        value: stripeFrequency,
      },
      uStripeColor: {
        value: new THREE.Color(stripeColor),
      },
      uStripeWidth: {
        value: stripeWidth,
      },
      uStripeAngle: {
        value: stripeAngle,
      },
    },

    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>

      attribute vec2 aPlaneUv;
      varying vec2 vSurfacePos; // plane-local (u, v) in geometry units

      void main() {
        vSurfacePos = aPlaneUv; // anchored to the section-plane basis (diagonal stripes regardless of plane orientation)
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

        #include <logdepthbuf_vertex>
      }
    `,

    fragmentShader: `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      
      uniform vec3 uBaseColor;
      uniform float uStripeFrequency;
      uniform vec3 uStripeColor;
      uniform float uStripeWidth;
      uniform float uStripeAngle;
      
      varying vec2 vSurfacePos;
      
      mat2 rotation2D(float angle) {
        float s = sin(angle);
        float c = cos(angle);
        return mat2(c, -s, s, c);
      }
      
      void main() {
        #include <logdepthbuf_fragment>
        
        // Rotate plane-local coordinates so the stripes are anchored to the plane
        vec2 rotated = rotation2D(uStripeAngle) * vSurfacePos;
        float pattern = mod(rotated.y, uStripeFrequency);
        
        // Antialiased stripe edge using screen-space derivatives
        float aa = fwidth(pattern) * 1.5;
        float stripeMask = smoothstep(uStripeWidth - aa, uStripeWidth + aa, pattern);
        vec3 finalColor = mix(uStripeColor, uBaseColor, stripeMask);
        
        gl_FragColor = vec4(finalColor, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });

  applySectionCapDepthState(stripedMaterial, 'webgl');

  return stripedMaterial;
}

/**
 * Discriminated striped cap material factory for dual WebGL/WebGPU stacks.
 */
export function createStripedMaterialForBackend(
  backend: ResolvedGraphicsBackend,
  properties?: StripedMaterialProperties,
): THREE.Material {
  if (backend === 'webgpu') {
    return createStripedNodeMaterial(properties);
  }

  return createStripedMaterial(properties);
}

export function createVertexColoredStripedMaterial(properties?: StripedMaterialProperties): THREE.ShaderMaterial {
  const { stripeFrequency, stripeWidth } = resolveStripedAppearance(properties);

  const material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      uStripeFrequency: {
        value: stripeFrequency,
      },
      uStripeWidth: {
        value: stripeWidth,
      },
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
  if (backend === 'webgpu') {
    return createVertexColoredStripedNodeMaterial(properties);
  }

  return createVertexColoredStripedMaterial(properties);
}
