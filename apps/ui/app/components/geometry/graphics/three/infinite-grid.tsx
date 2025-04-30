import * as THREE from 'three';
import { Plane } from '@react-three/drei';
import React from 'react';
import type { JSX } from 'react';
import { Theme, useTheme } from 'remix-themes';

type InfiniteGridProperties = {
  /**
   * The distance between the lines of the small grid.
   * Increasing makes the small grid lines more sparse/farther apart.
   */
  readonly smallSize: number;
  /**
   * The thickness of the lines of the small grid.
   * Increasing makes small grid lines thicker and more prominent.
   * @default 1.25
   */
  readonly smallThickness: number;
  /**
   * The distance between the lines of the large grid.
   * Increasing makes large grid lines more sparse/farther apart.
   */
  readonly largeSize: number;
  /**
   * The thickness of the lines of the large grid.
   * Increasing makes large grid lines thicker and more prominent.
   * @default 2
   */
  readonly largeThickness: number;
  /**
   * The color of the grid.
   * Use darker colors for better visibility against light backgrounds.
   * Use lighter colors for better visibility against dark backgrounds.
   */
  readonly color: THREE.Color;
  /**
   * The axes to use for the grid.
   * Defines the plane orientation of the grid.
   * First two letters determine the grid plane axes, third letter is the normal axis.
   * 'xyz': Grid on XY plane with Z as normal (standard top-down view)
   * 'xzy': Grid on XZ plane with Y as normal (standard front view)
   * @default 'xyz'
   */
  readonly axes: 'xyz' | 'xzy' | 'yxz' | 'yzx' | 'zxy' | 'zyx';
  /**
   * The base opacity of the grid lines.
   * Increasing makes the entire grid more visible/opaque.
   * @default 0.5
   */
  readonly lineOpacity: number;
  /**
   * Minimum grid distance to ensure visibility.
   * Increasing ensures grid is always drawn at least this far from camera.
   * @default 1000
   */
  readonly minGridDistance: number;
  /**
   * Controls how far the grid extends from the camera.
   * Increasing extends the grid farther from the camera, creating a larger visible area.
   * @default 30
   */
  readonly gridDistanceMultiplier: number;
  /**
   * Alpha threshold for fragment discard (transparency cutoff).
   * Increasing makes semi-transparent areas of the grid fully transparent.
   * @default 0.01
   */
  readonly alphaThreshold: number;
  /**
   * The fade start value for grid smoothstep (0-1). Lower values start fading closer to the camera.
   * @default 0.05
   */
  readonly fadeStart?: number;
  /**
   * The fade end value for grid smoothstep (0-1). Higher values end fading further from the camera.
   * @default 0.3
   */
  readonly fadeEnd?: number;
};

// Original Author: Fyrestar https://mevedia.com (https://github.com/Fyrestar/THREE.InfiniteGridHelper)
// Modified by @rifont to:
// - use varying thickness and enhanced distance falloff
// - work correctly with logarithmic depth buffer
function infiniteGridMaterial({
  smallSize,
  largeSize,
  color,
  axes,
  smallThickness,
  largeThickness,
  lineOpacity,
  minGridDistance,
  gridDistanceMultiplier,
  alphaThreshold,
  fadeStart,
  fadeEnd,
}: InfiniteGridProperties) {
  // Validate to ensure axes cannot be used to inject malicious code
  if (!['xyz', 'xzy', 'yxz', 'yzx', 'zxy', 'zyx'].includes(axes)) {
    throw new Error('Invalid axes parameter');
  }

  const planeAxes = axes.slice(0, 2);

  const material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: true,
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
    },

    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 worldPosition;
  
      uniform float uGridDistanceMultiplier;
      uniform float uMinGridDistance;
      
      void main() {
        // Calculate the camera distance
        float cameraDistance = length(cameraPosition);
        
        // Calculate grid distance without distance normalization
        float gridDistance = cameraDistance * uGridDistanceMultiplier;
        
        // Always ensure a reasonable minimum distance
        gridDistance = max(gridDistance, uMinGridDistance);
        
        // Scale the grid based on the calculated distance
        vec3 pos = position.${axes} * gridDistance;
        
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

      float getGrid(float size, float thickness) {
        vec2 r = worldPosition.${planeAxes} / size;
        
        vec2 grid = abs(fract(r - 0.5) - 0.5) / (fwidth(r) * thickness);
        float line = min(grid.x, grid.y);
        
        return 1.0 - min(line, 1.0);
      }
      
      void main() {
        #include <logdepthbuf_fragment>
        
        // Calculate planar distance - distance in the grid plane
        float planarDistance = distance(cameraPosition.${planeAxes}, worldPosition.${planeAxes});
        
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
        
        float gridSmall = getGrid(uSmallSize, uSmallThickness);
        float gridLarge = getGrid(uLargeSize, uLargeThickness);
        
        float grid = max(gridSmall, gridLarge);
        
        // Apply final color with basic opacity
        gl_FragColor = vec4(uColor.rgb, grid * fadeFactor * uLineOpacity);
        
        // Use a simple alpha threshold
        if (gl_FragColor.a < uAlphaThreshold) discard;
      }
      `,
  });

  return material;
}

export function InfiniteGrid({
  smallSize,
  largeSize,
  smallThickness = 1.25,
  largeThickness = 2.5,
  axes = 'xyz',
  lineOpacity = 0.4,
  minGridDistance = 1000,
  gridDistanceMultiplier = 30,
  fadeStart = 0.05,
  fadeEnd = 0.3,
  alphaThreshold = 0.01,
}: Partial<InfiniteGridProperties> & Pick<InfiniteGridProperties, 'smallSize' | 'largeSize'>): JSX.Element {
  const [theme] = useTheme();
  const materialRef = React.useRef<THREE.ShaderMaterial | undefined>(null);

  // Create material with initial properties
  const material = React.useMemo(
    () =>
      infiniteGridMaterial({
        smallSize,
        largeSize,
        smallThickness,
        largeThickness,
        color: theme === Theme.LIGHT ? new THREE.Color('lightgrey') : new THREE.Color('grey'),
        axes,
        lineOpacity,
        minGridDistance,
        gridDistanceMultiplier,
        alphaThreshold,
        fadeStart,
        fadeEnd,
      }),
    [
      smallSize,
      largeSize,
      smallThickness,
      largeThickness,
      theme,
      axes,
      lineOpacity,
      minGridDistance,
      gridDistanceMultiplier,
      alphaThreshold,
      fadeStart,
      fadeEnd,
    ],
  );

  React.useEffect(() => {
    materialRef.current = material;
  }, [material]);

  return <Plane userData={{ isPreviewOnly: true }} material={material} renderOrder={9999} />;
}
