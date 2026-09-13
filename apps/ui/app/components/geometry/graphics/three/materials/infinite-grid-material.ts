import * as THREE from 'three';
import type { ResolvedGraphicsBackend } from '#constants/editor.constants.js';
import { createInfiniteGridNodeMaterial } from '#components/geometry/graphics/three/materials/infinite-grid-material.node.js';
import type {
  InfiniteGridMaterialHandle,
  InfiniteGridMaterialProperties,
  InfiniteGridVisualOverrides,
} from '#components/geometry/graphics/three/materials/infinite-grid-material.types.js';

/* oxlint-disable no-barrel-files/no-barrel-files -- `infinite-grid-material.ts` façade re-exports public types beside implementations */
export type {
  InfiniteGridMaterialHandle,
  InfiniteGridMaterialProperties,
} from '#components/geometry/graphics/three/materials/infinite-grid-material.types.js';
/* oxlint-enable no-barrel-files/no-barrel-files */

/**
 * Maps string-based axes to numeric indices for the shader uniform.
 * This provides a user-friendly API while maintaining shader security by avoiding string interpolation.
 */
function mapAxesToIndex(axes: 'xyz' | 'xzy' | 'zyx'): 0 | 1 | 2 {
  const mapping = {
    xyz: 0,
    xzy: 1,
    zyx: 2,
  } as const;
  return mapping[axes];
}

/**
 * WebGL infinite grid: mutate `uniforms` via {@link InfiniteGridMaterialHandle.applyVisualOverrides} instead of recreating the material.
 *
 * Custom `ShaderMaterial` must `#include <colorspace_fragment>` after writing `gl_FragColor` (before the fragment exit). Three.js only auto-injects that chunk into bundled `ShaderLib/*` materials; without it, WebGL skips the linear-to-sRGB encode that WebGPU `NodeMaterial` applies automatically via `ColorSpaceNode`, causing a perceptual-brightness mismatch between backends (e.g. light-mode grid near-invisible on WebGPU).
 */
export function createInfiniteGridGlMaterial(
  properties?: InfiniteGridMaterialProperties,
): InfiniteGridMaterialHandle & { material: THREE.ShaderMaterial } {
  const {
    smallSize = 1,
    largeSize = 100,
    color = new THREE.Color('grey'),
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

  // Validate and convert axes parameter to numeric index
  if (!['xyz', 'xzy', 'zyx'].includes(axes)) {
    throw new Error('Invalid axes parameter: must be "xyz", "xzy", or "zyx"');
  }

  const axesIndex = mapAxesToIndex(axes);

  const material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uSmallSize: {
        value: smallSize,
      },
      uLargeSize: {
        value: largeSize,
      },
      uColor: {
        value: color,
      },
      uSmallThickness: {
        value: smallThickness,
      },
      uLargeThickness: {
        value: largeThickness,
      },
      uLineOpacity: {
        value: lineOpacity,
      },
      uMinGridDistance: {
        value: minGridDistance,
      },
      uGridDistanceMultiplier: {
        value: gridDistanceMultiplier,
      },
      uAlphaThreshold: {
        value: alphaThreshold,
      },
      uFadeStart: {
        value: fadeStart,
      },
      uFadeEnd: {
        value: fadeEnd,
      },
      uAxes: {
        value: axesIndex,
      },
      uNormalOffset: {
        value: normalOffset,
      },
    },

    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 worldPosition;
  
      uniform float uGridDistanceMultiplier;
      uniform float uMinGridDistance;
      uniform float uNormalOffset;
      uniform int uAxes;
      
      void main() {
        // Calculate the camera distance
        float cameraDistance = length(cameraPosition);
        
        // Calculate grid distance without distance normalization
        float gridDistance = cameraDistance * uGridDistanceMultiplier;
        
        // Always ensure a reasonable minimum distance
        gridDistance = max(gridDistance, uMinGridDistance);
        
        // Scale the grid based on the calculated distance
        // Use conditional logic instead of string interpolation for security
        vec3 pos;
        if (uAxes == 0) {
          // xyz: Grid on XY plane with Z as normal
          pos = position.xyz * gridDistance;
          pos.z -= uNormalOffset;
        } else if (uAxes == 1) {
          // xzy: Grid on XZ plane with Y as normal
          pos = position.xzy * gridDistance;
          pos.y -= uNormalOffset;
        } else {
          // zyx: Grid on ZY plane with X as normal
          pos = position.zyx * gridDistance;
          pos.x -= uNormalOffset;
        }
        
        worldPosition = pos;
        
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        
        #include <logdepthbuf_vertex>
      }
      `,

    fragmentShader: `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      
      varying vec3 worldPosition;
      
      uniform float uSmallSize;
      uniform float uLargeSize;
      uniform float uSmallThickness;
      uniform float uLargeThickness;
      uniform vec3 uColor;
      uniform float uLineOpacity;
      uniform float uGridDistanceMultiplier;
      uniform float uMinGridDistance;
      uniform float uAlphaThreshold;
      uniform float uFadeStart;
      uniform float uFadeEnd;
      uniform int uAxes;

      // Pristine Grid — based on Ben Golus's "The Best Darn Grid Shader (Yet)"
      // https://bgolus.medium.com/the-best-darn-grid-shader-yet-727f9278b9d8
      // Adapted for constant-pixel-width lines with phone-wire AA,
      // draw width clamping, Moire suppression, and premultiplied alpha blending.
      float pristineGrid(vec2 uv, float thickness) {
        // Per-axis screen-space derivatives using length() instead of fwidth().
        // fwidth() = abs(dFdx) + abs(dFdy) overestimates on diagonals;
        // length() gives the geometrically correct derivative magnitude per axis.
        vec4 uvDDXY = vec4(dFdx(uv), dFdy(uv));
        vec2 uvDeriv = vec2(length(uvDDXY.xz), length(uvDDXY.yw));
        
        // Convert pixel thickness to UV-space line width (fraction of cell).
        // Clamp to [0, 1] since a line cannot be wider than the cell itself.
        vec2 targetWidth = clamp(uvDeriv * thickness, 0.0, 1.0);
        
        // Phone-wire AA + draw width clamping:
        // - min = uvDeriv: line is never thinner than 1 screen pixel
        //   (prevents sub-pixel aliasing; instead lines stay 1px and fade)
        // - max = 0.5: ensures correct brightness convergence at the horizon
        //   (at 0.5, average intensity matches the target, preventing dark gutters)
        vec2 drawWidth = clamp(targetWidth, uvDeriv, vec2(0.5));
        
        // 1.5px AA border — smoothstep with 1.5 pixel width produces
        // a similar perceived sharpness to a 1px linear gradient, but smoother.
        vec2 lineAA = max(uvDeriv, 0.000001) * 1.5;
        
        // Distance to nearest grid line (0 at line center, 0.5 at midpoint)
        vec2 gridUV = 1.0 - abs(fract(uv) * 2.0 - 1.0);
        
        // Smooth antialiased grid lines
        vec2 grid2 = smoothstep(drawWidth + lineAA, drawWidth - lineAA, gridUV);
        
        // Phone-wire AA intensity fade: when lines were expanded beyond their
        // target width to stay at minimum 1px, reduce opacity proportionally.
        // This creates the illusion of sub-pixel lines fading out gracefully
        // rather than aliasing as they recede into the distance.
        grid2 *= clamp(targetWidth / drawWidth, 0.0, 1.0);
        
        // Moire suppression: when grid cells approach sub-pixel size
        // (uvDeriv > 0.5), smoothly transition from individual lines to a
        // solid average color. This eliminates interference patterns that
        // appear when multiple grid cells fall within a single pixel.
        grid2 = mix(grid2, targetWidth, clamp(uvDeriv * 2.0 - 1.0, 0.0, 1.0));
        
        // Premultiplied alpha blend to combine both axes.
        // Equivalent to: grid2.x * (1.0 - grid2.y) + grid2.y
        // This correctly composites overlapping transparent lines,
        // unlike max() which loses intensity at intersections.
        return mix(grid2.x, 1.0, grid2.y);
      }
      
      void main() {
        #include <logdepthbuf_fragment>
        
        // Extract plane axes based on configuration
        // Use conditional logic instead of string interpolation for security
        vec2 worldPlane;
        vec2 cameraPlane;
        
        if (uAxes == 0) {
          // xyz: Grid on XY plane
          worldPlane = worldPosition.xy;
          cameraPlane = cameraPosition.xy;
        } else if (uAxes == 1) {
          // xzy: Grid on XZ plane
          worldPlane = worldPosition.xz;
          cameraPlane = cameraPosition.xz;
        } else {
          // zyx: Grid on ZY plane
          worldPlane = worldPosition.zy;
          cameraPlane = cameraPosition.zy;
        }
        
        // Calculate planar distance - distance in the grid plane
        float planarDistance = distance(cameraPlane, worldPlane);
        
        // Calculate the camera distance
        float cameraDistance = length(cameraPosition);
        
        // Calculate grid distance with scaling factors
        float gridDistance = cameraDistance * uGridDistanceMultiplier;
        
        // Ensure minimum distance
        gridDistance = max(gridDistance, uMinGridDistance);
        
        // Calculate distance ratio
        float distanceRatio = planarDistance / gridDistance;
        
        // Calculate fade factor using smoothstep for cleaner fade
        float fadeFactor = smoothstep(uFadeEnd, uFadeStart, distanceRatio);
        
        // Compute grid for both scales using Pristine Grid algorithm.
        // Each grid gets its own UV space (worldPlane / size) so the
        // derivative-based antialiasing is computed per-scale.
        float gridSmall = pristineGrid(worldPlane / uSmallSize, uSmallThickness);
        float gridLarge = pristineGrid(worldPlane / uLargeSize, uLargeThickness);
        
        // Combine grids using premultiplied alpha blend (large over small).
        // Where large grid lines exist, they take priority; elsewhere the
        // small grid shows through. This is equivalent to layered alpha
        // compositing and produces correct brightness at intersections.
        float grid = mix(gridSmall, 1.0, gridLarge);
        
        // Apply final color with basic opacity (linear working space)
        gl_FragColor = vec4(uColor.rgb, grid * fadeFactor * uLineOpacity);
        
        // Use a simple alpha threshold
        if (gl_FragColor.a < uAlphaThreshold) discard;
        
        #include <colorspace_fragment>
      }
      `,
  });

  const applyVisualOverrides = (overrides: InfiniteGridVisualOverrides): void => {
    if (overrides.smallSize !== undefined) {
      material.uniforms['uSmallSize']!.value = overrides.smallSize;
    }

    if (overrides.largeSize !== undefined) {
      material.uniforms['uLargeSize']!.value = overrides.largeSize;
    }

    if (overrides.color !== undefined) {
      material.uniforms['uColor']!.value = overrides.color;
    }
  };

  return { material, applyVisualOverrides };
}

// Original Author: Fyrestar https://mevedia.com (https://github.com/Fyrestar/THREE.InfiniteGridHelper)
// Modified by @rifont to:
// - use varying thickness and enhanced distance falloff
// - work correctly with logarithmic depth buffer
// - use secure uniform-based axis configuration instead of string interpolation
export function infiniteGridMaterial(properties?: InfiniteGridMaterialProperties): THREE.ShaderMaterial {
  return createInfiniteGridGlMaterial(properties).material;
}

/**
 * Dual-stack infinite grid factory. Returns a long-lived material + `applyVisualOverrides` for zoom-driven size/colour updates.
 */
export function infiniteGridMaterialForBackend(
  backend: ResolvedGraphicsBackend,
  properties?: InfiniteGridMaterialProperties,
): InfiniteGridMaterialHandle {
  if (backend === 'webgpu') {
    return createInfiniteGridNodeMaterial(properties);
  }

  return createInfiniteGridGlMaterial(properties);
}
