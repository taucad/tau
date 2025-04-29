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
   * @default 0.3
   */
  readonly lineOpacity: number;
  /**
   * Controls how far the grid extends from the camera.
   * Increasing extends the grid farther from the camera, creating a larger visible area.
   * @default 10
   */
  readonly visibleWidthMultiplier: number;
  /**
   * Minimum grid distance to ensure visibility.
   * Increasing ensures grid is always drawn at least this far from camera.
   * @default 1000.0
   */
  readonly minGridDistance: number;
  /**
   * Multiplier for grid distance calculation.
   * Increasing extends the grid farther from camera.
   * @default 10.0
   */
  readonly gridDistanceMultiplier: number;
  /**
   * Minimum falloff base value for mixing operation.
   * @default 0.05
   */
  readonly falloffBaseMin: number;
  /**
   * Absolute minimum fade factor to prevent complete disappearance.
   * Increasing maintains higher minimum visibility at all distances.
   * @default 0.05
   */
  readonly minFadeFactor: number;
  /**
   * Alpha threshold for fragment discard (transparency cutoff).
   * Increasing makes semi-transparent areas of the grid fully transparent.
   * @default 0.01
   */
  readonly alphaThreshold: number;
  /**
   * The distance falloff ratio between 0 and 1. Lower values make the grid fade faster with distance.
   * @default 0.7
   */
  readonly distanceFalloffRatio?: number;
};

// Original Author: Fyrestar https://mevedia.com (https://github.com/Fyrestar/THREE.InfiniteGridHelper)
// Modified by @rifont to:
// - use varying thickness and enhanced distance falloff
function infiniteGridMaterial({
  smallSize,
  largeSize,
  color,
  axes,
  smallThickness,
  largeThickness,
  lineOpacity,
  visibleWidthMultiplier,
  minGridDistance,
  gridDistanceMultiplier,
  falloffBaseMin,
  minFadeFactor,
  alphaThreshold,
  distanceFalloffRatio,
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
      uVisibleWidthMultiplier: {
        value: visibleWidthMultiplier,
      },
      uCameraFov: {
        value: 60, // Default value, will be updated by component
      },
      uMinGridDistance: {
        value: minGridDistance,
      },
      uGridDistanceMultiplier: {
        value: gridDistanceMultiplier,
      },
      uFalloffBaseMin: {
        value: falloffBaseMin,
      },
      uMinFadeFactor: {
        value: minFadeFactor,
      },
      uAlphaThreshold: {
        value: alphaThreshold,
      },
      uDistanceFalloffRatio: {
        value: distanceFalloffRatio,
      },
    },

    vertexShader: `
      varying vec3 worldPosition;
  
      uniform float uVisibleWidthMultiplier;
      uniform float uCameraFov;
      uniform float uMinGridDistance;
      
      void main() {
        // Calculate the camera distance
        float cameraDistance = length(cameraPosition);
        
        // Calculate half FOV in radians
        float halfFovRadians = radians(uCameraFov * 0.5);
        
        // Use a consistent calculation for all FOV values
        float tanHalfFov = tan(halfFovRadians);
        
        // Calculate visible width consistently for all FOV values
        float visibleWidthAtDistance = 2.0 * cameraDistance * tanHalfFov;
        
        // Calculate grid distance without distance normalization
        float gridDistance = visibleWidthAtDistance * uVisibleWidthMultiplier;
        
        // Always ensure a reasonable minimum distance
        gridDistance = max(gridDistance, uMinGridDistance);
        
        // Scale the grid based on the calculated distance
        vec3 pos = position.${axes} * gridDistance;
        
        worldPosition = pos;
        
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
      `,

    fragmentShader: `
      varying vec3 worldPosition;
      
      uniform float uSmallSize;
      uniform float uLargeSize;
      uniform float uSmallThickness;
      uniform float uLargeThickness;
      uniform vec3 uColor;
      uniform float uLineOpacity;
      uniform float uCameraFov;
      uniform float uGridDistanceMultiplier;
      uniform float uMinGridDistance;
      uniform float uFalloffBaseMin;
      uniform float uMinFadeFactor;
      uniform float uAlphaThreshold;
      uniform float uDistanceFalloffRatio;

      float getGrid(float size, float thickness) {
        vec2 r = worldPosition.${planeAxes} / size;
        
        vec2 grid = abs(fract(r - 0.5) - 0.5) / (fwidth(r) * thickness);
        float line = min(grid.x, grid.y);
        
        // Use a smooth transition instead of hard clamping
        return 1.0 - smoothstep(0.0, 1.0, line);
      }
      
      void main() {
        // Calculate planar distance - distance in the grid plane
        float planarDistance = distance(cameraPosition.${planeAxes}, worldPosition.${planeAxes});
        
        // Calculate visible width with standard tangent function
        float cameraDistance = length(cameraPosition);
        float halfFovRadians = radians(uCameraFov * 0.5);
        float tanHalfFov = tan(halfFovRadians);
        float visibleWidthAtDistance = 2.0 * cameraDistance * tanHalfFov;
        
        // Calculate grid distance with scaling factors
        float gridDistance = visibleWidthAtDistance * uGridDistanceMultiplier;
        
        // Ensure minimum distance
        gridDistance = max(gridDistance, uMinGridDistance);
        
        // Calculate distance ratio
        float distanceRatio = planarDistance / gridDistance;
        
        // Simple fade calculation with constant base
        float falloffBase = uFalloffBaseMin;
        float falloffExponent = 1.0;
        
        // Calculate fade factor using simple power function
        float fadeFactor = pow(max(0.0, 1.0 - distanceRatio), falloffExponent);
        
        // Apply simple distance falloff based on the ratio
        float distanceRatioSimple = min(planarDistance / gridDistance, 1.0);
        float simpleFalloff = 1.0 - distanceRatioSimple;
        float simpleDistanceFade = pow(simpleFalloff, (1.0 - uDistanceFalloffRatio) * 10.0);
        
        // Combine the current fade with simple distance falloff
        fadeFactor = fadeFactor * simpleDistanceFade;
        
        // Add minimal base opacity for stability
        fadeFactor = max(fadeFactor, uMinFadeFactor);
        
        float gridSmall = getGrid(uSmallSize, uSmallThickness);
        float gridLarge = getGrid(uLargeSize, uLargeThickness);
        
        float grid = max(gridSmall, gridLarge);
        
        // Apply final color with basic opacity
        gl_FragColor = vec4(uColor.rgb, grid * fadeFactor * uLineOpacity);
        
        // Use a simple alpha threshold
        if (gl_FragColor.a < uAlphaThreshold) gl_FragColor.a = 0.0;
      }
      `,
  });

  return material;
}

export function InfiniteGrid({
  smallSize,
  largeSize,
  smallThickness = 1.25,
  largeThickness = 2,
  axes = 'xyz',
  lineOpacity = 0.4,
  distanceFalloffRatio = 0.7,
  visibleWidthMultiplier = 10,
  minGridDistance = 1000,
  gridDistanceMultiplier = 10,
  falloffBaseMin = 0.05,
  minFadeFactor = 0.05,
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
        visibleWidthMultiplier,
        minGridDistance,
        gridDistanceMultiplier,
        falloffBaseMin,
        minFadeFactor,
        alphaThreshold,
        distanceFalloffRatio,
      }),
    [
      smallSize,
      largeSize,
      smallThickness,
      largeThickness,
      theme,
      axes,
      lineOpacity,
      visibleWidthMultiplier,
      minGridDistance,
      gridDistanceMultiplier,
      falloffBaseMin,
      minFadeFactor,
      alphaThreshold,
      distanceFalloffRatio,
    ],
  );

  React.useEffect(() => {
    materialRef.current = material;
  }, [material]);

  return <Plane userData={{ isPreviewOnly: true }} material={material} renderOrder={9999} />;
}
