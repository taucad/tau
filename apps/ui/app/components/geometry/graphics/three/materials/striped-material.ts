import * as THREE from 'three';

type StripedMaterialProperties = {
  /**
   * The frequency of the stripes (distance between stripes in pixels).
   * @default 2
   */
  readonly stripeFrequency?: number;
  /**
   * The width of each stripe in pixels.
   * @default 0.25
   */
  readonly stripeWidth?: number;
  /**
   * The base color of the material.
   * @default 0xffffff (white)
   */
  readonly baseColor?: number;
  /**
   * The color of the stripes.
   * @default 0xffffff (white)
   */
  readonly stripeColor?: number;
  /**
   * Stripe angle in radians (screen space). 0 = horizontal, PI/2 = vertical.
   * @default Math.PI / 4 (45° diagonal)
   */
  readonly stripeAngle?: number;
};

/**
 * Creates a striped material for cap planes.
 *
 * Default behavior: diagonal stripes that are locked to the cap plane's
 * surface (object space), so they do not slide when the camera moves.
 *
 * This material uses stencil operations for cross-section capping, ensuring it only
 * renders at mesh/plane intersections when used with the Cutter component.
 *
 * @param stripeFrequency - Distance between stripes in plane units (same units as geometry)
 * @param baseColor - Base color of the material
 * @param stripeColor - Color of the stripes
 * @returns A THREE.ShaderMaterial with striped pattern
 */
export function createStripedMaterial(properties?: StripedMaterialProperties): THREE.ShaderMaterial {
  const {
    stripeFrequency = 2,
    stripeWidth = 0.25,
    baseColor = 0xdd_dd_dd,
    stripeColor = 0xbb_bb_bb,
    stripeAngle = Math.PI / 4,
  } = properties ?? {};

  const stripedMaterial = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    stencilWrite: true,
    stencilRef: 0,
    stencilFunc: THREE.NotEqualStencilFunc,
    stencilFail: THREE.ReplaceStencilOp,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Three.js API naming
    stencilZFail: THREE.ReplaceStencilOp,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Three.js API naming
    stencilZPass: THREE.ReplaceStencilOp,
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
      
      varying vec2 vSurfacePos; // plane-local XY in geometry units
      
      void main() {
        vSurfacePos = position.xy; // lock pattern to the plane surface
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
        
        // Determine if this pixel should be a stripe
        vec3 finalColor = pattern < uStripeWidth ? uStripeColor : uBaseColor;
        
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
  });

  return stripedMaterial;
}
