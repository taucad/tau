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
   * Minimum angle value used in tangent approximation to prevent division by zero.
   * Increasing reduces precision for very small angles but improves stability.
   * @default 0.0001
   */
  readonly minAngle: number;
  /**
   * Controls blending transition between different tangent calculation methods.
   * Increasing makes the transition between calculation methods more gradual.
   * @default 0.2
   */
  readonly tanBlendThreshold: number;
  /**
   * Start threshold for steep angle adaptation (0.0-1.0).
   * Increasing delays steep angle adaptation until more perpendicular views.
   * @default 0.7
   */
  readonly steepAngleThresholdStart: number;
  /**
   * End threshold for steep angle adaptation (0.0-1.0).
   * Increasing cannot exceed 1.0; keeps maximum at perpendicular view.
   * @default 1.0
   */
  readonly steepAngleThresholdEnd: number;
  /**
   * Multiplier for grid extension at steep viewing angles.
   * Increasing makes grid more visible when viewed from above/perpendicular.
   * @default 2.0
   */
  readonly steepAngleBoostMultiplier: number;
  /**
   * Multiplier for grid extension at shallow viewing angles.
   * Increasing makes grid more visible when viewed at glancing/oblique angles.
   * @default 10.0
   */
  readonly shallowAngleBoostMultiplier: number;
  /**
   * Minimum grid distance to ensure visibility.
   * Increasing ensures grid is always drawn at least this far from camera.
   * @default 1000.0
   */
  readonly minGridDistance: number;
  /**
   * Fragment shader boost multiplier for steep viewing angles.
   * Increasing enhances grid visibility at perpendicular viewing angles.
   * @default 5.0
   */
  readonly fragmentSteepAngleBoostMultiplier: number;
  /**
   * Fragment shader boost multiplier for shallow viewing angles.
   * Increasing enhances grid visibility at oblique/glancing viewing angles.
   * @default 10.0
   */
  readonly fragmentShallowAngleBoostMultiplier: number;
  /**
   * Power factor for shallow angle boost calculation.
   * Increasing makes shallow angle visibility boost more aggressive.
   * @default 3.0
   */
  readonly shallowAnglePowerFactor: number;
  /**
   * Minimum value for angle-based distance adjustment.
   * Increasing increases minimum grid visibility at shallow angles.
   * @default 0.2
   */
  readonly viewAngleAdjustmentMin: number;
  /**
   * Maximum value for angle-based distance adjustment.
   * Increasing cannot exceed 1.0; maintains full adjustment at perpendicular views.
   * @default 1.0
   */
  readonly viewAngleAdjustmentMax: number;
  /**
   * Multiplier for grid distance calculation.
   * Increasing extends the grid farther from camera.
   * @default 10.0
   */
  readonly gridDistanceMultiplier: number;
  /**
   * Minimum falloff base value for mixing operation.
   * Increasing strengthens minimum opacity at oblique viewing angles.
   * @default 0.05
   */
  readonly falloffBaseMin: number;
  /**
   * Maximum falloff base value for mixing operation.
   * Increasing strengthens minimum opacity at perpendicular viewing angles.
   * @default 0.5
   */
  readonly falloffBaseMax: number;
  /**
   * Absolute minimum fade factor to prevent complete disappearance.
   * Increasing maintains higher minimum visibility at all distances and angles.
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
// - use a Taylor series approximation for the tangent function to avoid discontinuities at 90 degrees
function infiniteGridMaterial({
  smallSize,
  largeSize,
  color,
  axes,
  smallThickness,
  largeThickness,
  lineOpacity,
  visibleWidthMultiplier,
  minAngle,
  tanBlendThreshold,
  steepAngleThresholdStart,
  steepAngleThresholdEnd,
  steepAngleBoostMultiplier,
  shallowAngleBoostMultiplier,
  minGridDistance,
  fragmentSteepAngleBoostMultiplier,
  fragmentShallowAngleBoostMultiplier,
  shallowAnglePowerFactor,
  viewAngleAdjustmentMin,
  viewAngleAdjustmentMax,
  gridDistanceMultiplier,
  falloffBaseMin,
  falloffBaseMax,
  minFadeFactor,
  alphaThreshold,
  distanceFalloffRatio,
}: InfiniteGridProperties) {
  // Validate to ensure axes cannot be used to inject malicious code
  if (!['xyz', 'xzy', 'yxz', 'yzx', 'zxy', 'zyx'].includes(axes)) {
    throw new Error('Invalid axes parameter');
  }

  const planeAxes = axes.slice(0, 2);
  const normalAxis = axes[2]; // The normal axis to the grid (usually 'z')

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
      uMinAngle: {
        value: minAngle,
      },
      uTanBlendThreshold: {
        value: tanBlendThreshold,
      },
      uSteepAngleThresholdStart: {
        value: steepAngleThresholdStart,
      },
      uSteepAngleThresholdEnd: {
        value: steepAngleThresholdEnd,
      },
      uSteepAngleBoostMultiplier: {
        value: steepAngleBoostMultiplier,
      },
      uShallowAngleBoostMultiplier: {
        value: shallowAngleBoostMultiplier,
      },
      uMinGridDistance: {
        value: minGridDistance,
      },
      uFragmentSteepAngleBoostMultiplier: {
        value: fragmentSteepAngleBoostMultiplier,
      },
      uFragmentShallowAngleBoostMultiplier: {
        value: fragmentShallowAngleBoostMultiplier,
      },
      uShallowAnglePowerFactor: {
        value: shallowAnglePowerFactor,
      },
      uViewAngleAdjustmentMin: {
        value: viewAngleAdjustmentMin,
      },
      uViewAngleAdjustmentMax: {
        value: viewAngleAdjustmentMax,
      },
      uGridDistanceMultiplier: {
        value: gridDistanceMultiplier,
      },
      uFalloffBaseMin: {
        value: falloffBaseMin,
      },
      uFalloffBaseMax: {
        value: falloffBaseMax,
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
      varying vec3 viewVector;
  
      uniform float uVisibleWidthMultiplier;
      uniform float uCameraFov;
      uniform float uMinAngle;
      uniform float uTanBlendThreshold;
      uniform float uSteepAngleThresholdStart;
      uniform float uSteepAngleThresholdEnd;
      uniform float uSteepAngleBoostMultiplier;
      uniform float uShallowAngleBoostMultiplier;
      uniform float uMinGridDistance;
      
      // Highly accurate tangent approximation that works well for all angles
      float stableTan(float angle) {
        // Ensure angle is never exactly zero
        angle = max(angle, uMinAngle);
        
        // Use a continuous function that works for all angle ranges
        // This combines Taylor series for small angles with direct calculation
        // for larger angles in a continuous way
        float x2 = angle * angle;
        float x3 = x2 * angle;
        float x5 = x3 * x2;
        float x7 = x5 * x2;
        
        // Taylor series approximation: x + x³/3 + 2x⁵/15 + 17x⁷/315
        float taylorTan = angle + (x3/3.0) + (2.0*x5/15.0) + (17.0*x7/315.0);
        
        // Standard calculation
        float standardTan = sin(angle) / cos(angle);
        
        // Blend based on angle size - continuous transition
        float blendFactor = 1.0 - smoothstep(0.0, uTanBlendThreshold, angle);
        return mix(standardTan, taylorTan, blendFactor);
      }
      
      void main() {
        // Calculate the camera distance
        float cameraDistance = length(cameraPosition);
        
        // Calculate half FOV in radians
        float halfFovRadians = radians(uCameraFov * 0.5);
        
        // Use a consistent calculation for all FOV values
        float tanHalfFov = stableTan(halfFovRadians);
        
        // Calculate visible width consistently for all FOV values
        float visibleWidthAtDistance = 2.0 * cameraDistance * tanHalfFov;
        
        // Get normalized camera direction to detect viewing angle relative to grid plane
        vec3 cameraNormal = normalize(cameraPosition);
        float viewAngleFactor = abs(cameraNormal.${normalAxis});
        
        // Enhanced angle extension that increases gradually near top-down views
        float steepAngleBoost = smoothstep(uSteepAngleThresholdStart, uSteepAngleThresholdEnd, viewAngleFactor) * uSteepAngleBoostMultiplier;
        
        // Also boost at shallow angles as before
        float shallowAngleBoost = pow(1.0 - viewAngleFactor, 2.0) * uShallowAngleBoostMultiplier;
        
        // Combined angle extension factor without discontinuities
        float angleExtensionFactor = 1.0 + shallowAngleBoost + steepAngleBoost;
        
        // Calculate grid distance without distance normalization
        float gridDistance = visibleWidthAtDistance * uVisibleWidthMultiplier * angleExtensionFactor;
        
        // Always ensure a reasonable minimum distance
        gridDistance = max(gridDistance, uMinGridDistance);
        
        // Scale the grid based on the calculated distance
        vec3 pos = position.${axes} * gridDistance;
        
        worldPosition = pos;
        
        // Calculate view vector from camera to this vertex
        viewVector = normalize(cameraPosition - pos);
        
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
      `,

    fragmentShader: `
      varying vec3 worldPosition;
      varying vec3 viewVector;
      
      uniform float uSmallSize;
      uniform float uLargeSize;
      uniform float uSmallThickness;
      uniform float uLargeThickness;
      uniform vec3 uColor;
      uniform float uLineOpacity;
      uniform float uCameraFov;
      uniform float uMinAngle;
      uniform float uTanBlendThreshold;
      uniform float uSteepAngleThresholdStart;
      uniform float uSteepAngleThresholdEnd;
      uniform float uFragmentSteepAngleBoostMultiplier;
      uniform float uFragmentShallowAngleBoostMultiplier;
      uniform float uShallowAnglePowerFactor;
      uniform float uViewAngleAdjustmentMin;
      uniform float uViewAngleAdjustmentMax;
      uniform float uGridDistanceMultiplier;
      uniform float uMinGridDistance;
      uniform float uFalloffBaseMin;
      uniform float uFalloffBaseMax;
      uniform float uMinFadeFactor;
      uniform float uAlphaThreshold;
      uniform float uDistanceFalloffRatio;

      // Highly accurate tangent approximation that works well for all angles
      float stableTan(float angle) {
        // Ensure angle is never exactly zero
        angle = max(angle, uMinAngle);
        
        // Use a continuous function that works for all angle ranges
        float x2 = angle * angle;
        float x3 = x2 * angle;
        float x5 = x3 * x2;
        float x7 = x5 * x2;
        
        // Taylor series approximation
        float taylorTan = angle + (x3/3.0) + (2.0*x5/15.0) + (17.0*x7/315.0);
        
        // Standard calculation
        float standardTan = sin(angle) / cos(angle);
        
        // Blend based on angle size - continuous transition
        float blendFactor = 1.0 - smoothstep(0.0, uTanBlendThreshold, angle);
        return mix(standardTan, taylorTan, blendFactor);
      }

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
        
        // Calculate view angle factor - dot product of view vector and grid normal
        float viewAngleFactor = abs(viewVector.${normalAxis});
        
        // Create a smooth angle compensation curve with extra boost for steep angles
        float steepAngleBoost = smoothstep(uSteepAngleThresholdStart, uSteepAngleThresholdEnd, viewAngleFactor) * uFragmentSteepAngleBoostMultiplier;
        float shallowAngleBoost = pow(1.0 - viewAngleFactor, uShallowAnglePowerFactor) * uFragmentShallowAngleBoostMultiplier;
        float angleCompensation = 1.0 + shallowAngleBoost + steepAngleBoost;
        
        // Create a smooth distance adjustment that adapts to viewing angle
        float viewAngleAdjustment = mix(uViewAngleAdjustmentMin, uViewAngleAdjustmentMax, viewAngleFactor);
        float adjustedDistance = planarDistance * viewAngleAdjustment;
        
        // Calculate visible width with stable tangent function
        float cameraDistance = length(cameraPosition);
        float halfFovRadians = radians(uCameraFov * 0.5);
        float tanHalfFov = stableTan(halfFovRadians);
        float visibleWidthAtDistance = 2.0 * cameraDistance * tanHalfFov;
        
        // Calculate grid distance with scaling factors
        float gridDistance = visibleWidthAtDistance * uGridDistanceMultiplier;
        
        // Ensure minimum distance
        gridDistance = max(gridDistance, uMinGridDistance);
        
        // Calculate distance ratio with angle compensation
        float distanceRatio = adjustedDistance / (gridDistance * angleCompensation);
        
        // Simple power-based fade calculation
        float falloffBase = mix(uFalloffBaseMin, uFalloffBaseMax, viewAngleFactor);
        float falloffExponent = 1.0 + viewAngleFactor;
        
        // Calculate fade factor using simple power function
        float fadeFactor = pow(max(0.0, 1.0 - distanceRatio), falloffExponent);
        
        // Apply simple distance falloff based on the ratio
        float distanceRatioSimple = min(planarDistance / gridDistance, 1.0);
        float simpleFalloff = 1.0 - distanceRatioSimple;
        float simpleDistanceFade = pow(simpleFalloff, (1.0 - uDistanceFalloffRatio) * 10.0);
        
        // Combine the current fade with simple distance falloff
        fadeFactor = fadeFactor * simpleDistanceFade;
        
        // Add minimal base opacity for stability across all angles
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

// eslint-disable-next-line complexity -- This is a complex component, but it's necessary for the grid
export function InfiniteGrid({
  smallSize,
  largeSize,
  smallThickness = 1.25,
  largeThickness = 2,
  axes = 'xyz',
  lineOpacity = 0.4,
  distanceFalloffRatio = 0.7,
  visibleWidthMultiplier = 10,
  minAngle = 0.0001,
  tanBlendThreshold = 0.2,
  steepAngleThresholdStart = 0.7,
  steepAngleThresholdEnd = 1,
  steepAngleBoostMultiplier = 2,
  shallowAngleBoostMultiplier = 10,
  minGridDistance = 1000,
  fragmentSteepAngleBoostMultiplier = 5,
  fragmentShallowAngleBoostMultiplier = 10,
  shallowAnglePowerFactor = 3,
  viewAngleAdjustmentMin = 0.2,
  viewAngleAdjustmentMax = 1,
  gridDistanceMultiplier = 10,
  falloffBaseMin = 0.05,
  falloffBaseMax = 0.5,
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
        minAngle,
        tanBlendThreshold,
        steepAngleThresholdStart,
        steepAngleThresholdEnd,
        steepAngleBoostMultiplier,
        shallowAngleBoostMultiplier,
        minGridDistance,
        fragmentSteepAngleBoostMultiplier,
        fragmentShallowAngleBoostMultiplier,
        shallowAnglePowerFactor,
        viewAngleAdjustmentMin,
        viewAngleAdjustmentMax,
        gridDistanceMultiplier,
        falloffBaseMin,
        falloffBaseMax,
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
      minAngle,
      tanBlendThreshold,
      steepAngleThresholdStart,
      steepAngleThresholdEnd,
      steepAngleBoostMultiplier,
      shallowAngleBoostMultiplier,
      minGridDistance,
      fragmentSteepAngleBoostMultiplier,
      fragmentShallowAngleBoostMultiplier,
      shallowAnglePowerFactor,
      viewAngleAdjustmentMin,
      viewAngleAdjustmentMax,
      gridDistanceMultiplier,
      falloffBaseMin,
      falloffBaseMax,
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
