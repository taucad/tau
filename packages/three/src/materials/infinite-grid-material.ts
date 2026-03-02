import * as THREE from 'three';

export type InfiniteGridMaterialProperties = {
  /**
   * The distance between the lines of the small grid.
   * Increasing makes the small grid lines more sparse/farther apart.
   */
  readonly smallSize?: number;
  /**
   * The thickness of the lines of the small grid in screen pixels.
   * Increasing makes small grid lines thicker and more prominent.
   * @default 1.25
   */
  readonly smallThickness?: number;
  /**
   * The distance between the lines of the large grid.
   * Increasing makes large grid lines more sparse/farther apart.
   */
  readonly largeSize?: number;
  /**
   * The thickness of the lines of the large grid in screen pixels.
   * Increasing makes large grid lines thicker and more prominent.
   * @default 2
   */
  readonly largeThickness?: number;
  /**
   * The color of the grid.
   * Use darker colors for better visibility against light backgrounds.
   * Use lighter colors for better visibility against dark backgrounds.
   */
  readonly color?: THREE.Color;
  /**
   * The axes to use for the grid.
   * Defines the plane orientation of the grid.
   * - 'xyz': Grid on XY plane with Z as normal (standard top-down view)
   * - 'xzy': Grid on XZ plane with Y as normal (standard front view)
   * - 'zyx': Grid on ZY plane with X as normal (standard side view)
   * @default 'xyz'
   */
  readonly axes?: 'xyz' | 'xzy' | 'zyx';
  /**
   * The base opacity of the grid lines.
   * Increasing makes the entire grid more visible/opaque.
   * @default 0.3
   */
  readonly lineOpacity?: number;
  /**
   * Minimum grid distance to ensure visibility.
   * Increasing ensures grid is always drawn at least this far from camera.
   * @default 10
   */
  readonly minGridDistance?: number;
  /**
   * Controls how far the grid extends from the camera.
   * Increasing extends the grid farther from the camera, creating a larger visible area.
   * @default 10
   */
  readonly gridDistanceMultiplier?: number;
  /**
   * Alpha threshold for fragment discard (transparency cutoff).
   * Increasing makes semi-transparent areas of the grid fully transparent.
   * @default 0.01
   */
  readonly alphaThreshold?: number;
  /**
   * The fade start value for grid smoothstep (0-1). Lower values start fading closer to the camera.
   * @default 0.05
   */
  readonly fadeStart?: number;
  /**
   * The fade end value for grid smoothstep (0-1). Higher values end fading further from the camera.
   * @default 0.2
   */
  readonly fadeEnd?: number;
  /**
   * Offset applied to the grid along its normal axis to prevent z-fighting with other geometry.
   * Increasing this value pushes the grid further away from the plane.
   * @default 0.001
   */
  readonly normalOffset?: number;
};

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

// Original Author: Fyrestar https://mevedia.com (https://github.com/Fyrestar/THREE.InfiniteGridHelper)
// Modified by @rifont to:
// - use varying thickness and enhanced distance falloff
// - work correctly with logarithmic depth buffer
// - use secure uniform-based axis configuration instead of string interpolation
export function infiniteGridMaterial(properties?: InfiniteGridMaterialProperties): THREE.ShaderMaterial {
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
        
        // Apply final color with basic opacity
        gl_FragColor = vec4(uColor.rgb, grid * fadeFactor * uLineOpacity);
        
        // Use a simple alpha threshold
        if (gl_FragColor.a < uAlphaThreshold) discard;
      }
      `,
  });

  return material;
}
