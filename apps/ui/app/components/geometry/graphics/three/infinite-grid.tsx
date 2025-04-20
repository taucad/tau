import * as THREE from 'three';
import { Plane } from '@react-three/drei';
import React from 'react';
import type { JSX } from 'react';
import { Theme, useTheme } from 'remix-themes';
import { useThree, useFrame } from '@react-three/fiber';

type InfiniteGridProperties = {
  /**
   * The distance between the lines of the small grid.
   * Increasing: Makes small grid lines more sparse/farther apart.
   * Decreasing: Creates a denser grid with closer lines.
   */
  readonly smallSize: number;
  /**
   * The thickness of the lines of the small grid.
   * Increasing: Makes small grid lines thicker and more prominent.
   * Decreasing: Creates thinner, more subtle small grid lines.
   * @default 1.25
   */
  readonly smallThickness: number;
  /**
   * The distance between the lines of the large grid.
   * Increasing: Makes large grid lines more sparse/farther apart.
   * Decreasing: Creates a denser grid with closer major lines.
   */
  readonly largeSize: number;
  /**
   * The thickness of the lines of the large grid.
   * Increasing: Makes large grid lines thicker and more prominent.
   * Decreasing: Creates thinner, more subtle large grid lines.
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
   * etc.
   * @default 'xyz'
   */
  readonly axes: 'xyz' | 'xzy' | 'yxz' | 'yzx' | 'zxy' | 'zyx';
  /**
   * The base opacity of the grid lines.
   * Increasing: Makes the entire grid more visible/opaque.
   * Decreasing: Makes the entire grid more transparent/subtle.
   * @default 0.3
   */
  readonly lineOpacity: number;
  /**
   * Controls how far the grid extends from the camera.
   * Increasing: Extends the grid farther from the camera, creating a larger visible area.
   * Decreasing: Shrinks the visible area of the grid, making it more concentrated.
   * @default 10
   */
  readonly visibleWidthMultiplier: number;
  /**
   * Minimum angle value used in tangent approximation to prevent division by zero.
   * Increasing: Reduces precision for very small angles but improves stability.
   * Decreasing: Improves precision for small angles but may cause instability.
   * @default 0.0001
   */
  readonly minAngle: number;
  /**
   * Controls blending transition between different tangent calculation methods.
   * Increasing: Makes the transition between calculation methods more gradual.
   * Decreasing: Makes the transition between calculation methods more abrupt.
   * @default 0.2
   */
  readonly tanBlendThreshold: number;
  /**
   * Minimum FOV bias to ensure stability at extreme camera settings.
   * Increasing: Improves stability at very low FOVs but reduces accuracy.
   * Decreasing: Improves accuracy at low FOVs but may cause instability.
   * @default 0.1
   */
  readonly minFovBias: number;
  /**
   * Reference FOV value used for normalization calculations.
   * Increasing: Calibrates grid for wider FOV cameras.
   * Decreasing: Calibrates grid for narrower FOV cameras.
   * @default 90.0
   */
  readonly referenceFov: number;
  /**
   * Controls how much to boost the grid at low FOV values.
   * Increasing: Improves grid visibility at narrow FOVs.
   * Decreasing: Reduces compensation at narrow FOVs for more natural scaling.
   * @default 30.0
   */
  readonly fovExtensionFactor: number;
  /**
   * Bias value for FOV extension calculations.
   * Increasing: Makes FOV extension effect more gradual.
   * Decreasing: Makes FOV extension effect more aggressive.
   * @default 5.0
   */
  readonly fovExtensionBias: number;
  /**
   * Start threshold for steep angle adaptation (0.0-1.0).
   * Increasing: Delays steep angle adaptation until more perpendicular views.
   * Decreasing: Applies steep angle adaptation at more oblique angles.
   * @default 0.7
   */
  readonly steepAngleThresholdStart: number;
  /**
   * End threshold for steep angle adaptation (0.0-1.0).
   * Increasing: Cannot exceed 1.0; keeps maximum at perpendicular view.
   * Decreasing: Completes steep angle adaptation before reaching perpendicular view.
   * @default 1.0
   */
  readonly steepAngleThresholdEnd: number;
  /**
   * Multiplier for grid extension at steep viewing angles.
   * Increasing: Makes grid more visible when viewed from above/perpendicular.
   * Decreasing: Reduces grid extension at steep/perpendicular angles.
   * @default 2.0
   */
  readonly steepAngleBoostMultiplier: number;
  /**
   * Multiplier for grid extension at shallow viewing angles.
   * Increasing: Makes grid more visible when viewed at glancing/oblique angles.
   * Decreasing: Reduces grid extension at shallow/oblique angles.
   * @default 10.0
   */
  readonly shallowAngleBoostMultiplier: number;
  /**
   * Factor for logarithmic distance scaling.
   * Increasing: Makes distance adaptation more sensitive at closer ranges.
   * Decreasing: Makes distance adaptation more gradual across all distances.
   * @default 0.01
   */
  readonly distanceNormalizationFactor: number;
  /**
   * Scale factor for distance-based grid size calculations.
   * Increasing: Makes the grid grow more aggressively with distance.
   * Decreasing: Reduces the growth rate of the grid with distance.
   * @default 100.0
   */
  readonly distanceFactorMultiplier: number;
  /**
   * Minimum grid distance to ensure visibility.
   * Increasing: Ensures grid is always drawn at least this far from camera.
   * Decreasing: Allows grid to be drawn closer to camera.
   * @default 1000.0
   */
  readonly minGridDistance: number;
  /**
   * Maximum factor for camera-relative positioning (when viewed at shallow angles).
   * Increasing: Increases camera-following behavior at shallow angles.
   * Decreasing: Reduces camera-following behavior at shallow angles.
   * @default 0.8
   */
  readonly positionFactorMax: number;
  /**
   * Minimum factor for camera-relative positioning (when viewed from above).
   * Increasing: Increases camera-following behavior when viewed from above.
   * Decreasing: Reduces camera-following behavior when viewed from above.
   * @default 0.5
   */
  readonly positionFactorMin: number;
  /**
   * Threshold for angle-based position factor adjustment.
   * Increasing: Delays transition to minimum position factor until more perpendicular views.
   * Decreasing: Transitions to minimum position factor at more oblique angles.
   * @default 0.7
   */
  readonly positionFactorThreshold: number;
  /**
   * Fragment shader boost multiplier for steep viewing angles.
   * Increasing: Enhances grid visibility at perpendicular viewing angles.
   * Decreasing: Reduces grid visibility enhancement at perpendicular angles.
   * @default 5.0
   */
  readonly fragmentSteepAngleBoostMultiplier: number;
  /**
   * Fragment shader boost multiplier for shallow viewing angles.
   * Increasing: Enhances grid visibility at oblique/glancing viewing angles.
   * Decreasing: Reduces grid visibility enhancement at oblique angles.
   * @default 10.0
   */
  readonly fragmentShallowAngleBoostMultiplier: number;
  /**
   * Power factor for shallow angle boost calculation.
   * Increasing: Makes shallow angle visibility boost more aggressive.
   * Decreasing: Makes shallow angle visibility boost more subtle.
   * @default 3.0
   */
  readonly shallowAnglePowerFactor: number;
  /**
   * Maximum threshold for FOV compensation smoothstep.
   * Increasing: Makes FOV compensation more gradual.
   * Decreasing: Makes FOV compensation more abrupt.
   * @default 3.0
   */
  readonly fovCompThresholdMax: number;
  /**
   * FOV compensation multiplier for visibility adjustments.
   * Increasing: Strengthens FOV-based visibility adjustments.
   * Decreasing: Weakens FOV-based visibility adjustments.
   * @default 2.0
   */
  readonly fovCompMultiplier: number;
  /**
   * Minimum value for angle-based distance adjustment.
   * Increasing: Increases minimum grid visibility at shallow angles.
   * Decreasing: Allows grid to fade more at shallow angles.
   * @default 0.2
   */
  readonly viewAngleAdjustmentMin: number;
  /**
   * Maximum value for angle-based distance adjustment.
   * Increasing: Cannot exceed 1.0; maintains full adjustment at perpendicular views.
   * Decreasing: Reduces adjustment effect even at perpendicular viewing angles.
   * @default 1.0
   */
  readonly viewAngleAdjustmentMax: number;
  /**
   * Base value for FOV-based grid scaling.
   * Increasing: Makes the grid adapt more aggressively to FOV changes.
   * Decreasing: Makes the grid less sensitive to FOV changes.
   * @default 10.0
   */
  readonly fovScalingBase: number;
  /**
   * Multiplier for grid distance calculation.
   * Increasing: Extends the grid farther from camera.
   * Decreasing: Shrinks grid visibility range.
   * @default 10.0
   */
  readonly gridDistanceMultiplier: number;
  /**
   * Maximum value for sigmoid center calculation (for shallow angles).
   * Increasing: Shifts fade-out point farther from camera at shallow angles.
   * Decreasing: Starts fade-out closer to camera at shallow angles.
   * @default 0.7
   */
  readonly sigmoidCenterMax: number;
  /**
   * Minimum value for sigmoid center calculation (for steep angles).
   * Increasing: Shifts fade-out point farther from camera at steep angles.
   * Decreasing: Starts fade-out closer to camera at steep angles.
   * @default 0.4
   */
  readonly sigmoidCenterMin: number;
  /**
   * FOV adjustment factor for sigmoid center calculation.
   * Increasing: Makes fade center more responsive to FOV changes.
   * Decreasing: Makes fade center less sensitive to FOV changes.
   * @default 0.5
   */
  readonly sigmoidCenterFovFactor: number;
  /**
   * Minimum sigmoid sharpness value (for shallow angles).
   * Increasing: Creates more abrupt fade-out transition at shallow angles.
   * Decreasing: Creates more gradual fade-out transition at shallow angles.
   * @default 3.0
   */
  readonly sigmoidSharpnessMin: number;
  /**
   * Maximum sigmoid sharpness value (for steep angles).
   * Increasing: Creates more abrupt fade-out transition at steep angles.
   * Decreasing: Creates more gradual fade-out transition at steep angles.
   * @default 8.0
   */
  readonly sigmoidSharpnessMax: number;
  /**
   * Minimum falloff base value for mixing operation.
   * Increasing: Strengthens minimum opacity at oblique viewing angles.
   * Decreasing: Allows more complete fade-out at oblique viewing angles.
   * @default 0.05
   */
  readonly falloffBaseMin: number;
  /**
   * Maximum falloff base value for mixing operation.
   * Increasing: Strengthens minimum opacity at perpendicular viewing angles.
   * Decreasing: Allows more complete fade-out at perpendicular viewing angles.
   * @default 0.5
   */
  readonly falloffBaseMax: number;
  /**
   * Absolute minimum fade factor to prevent complete disappearance.
   * Increasing: Maintains higher minimum visibility at all distances and angles.
   * Decreasing: Allows grid to become more transparent at distances and extreme angles.
   * @default 0.05
   */
  readonly minFadeFactor: number;
  /**
   * Opacity adjustment multiplier for steep angles.
   * Increasing: Boosts grid opacity when viewed from perpendicular angles.
   * Decreasing: Reduces the opacity boost at perpendicular viewing angles.
   * @default 0.2
   */
  readonly opacityAdjustmentSteep: number;
  /**
   * Opacity adjustment multiplier for shallow angles.
   * Increasing: Boosts grid opacity when viewed from oblique/glancing angles.
   * Decreasing: Reduces the opacity boost at oblique viewing angles.
   * @default 0.2
   */
  readonly opacityAdjustmentShallow: number;
  /**
   * Alpha threshold for fragment discard (transparency cutoff).
   * Increasing: Makes semi-transparent areas of the grid fully transparent.
   * Decreasing: Preserves subtle transparency in grid fade areas.
   * @default 0.01
   */
  readonly alphaThreshold: number;
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
  minFovBias,
  referenceFov,
  fovExtensionFactor,
  fovExtensionBias,
  steepAngleThresholdStart,
  steepAngleThresholdEnd,
  steepAngleBoostMultiplier,
  shallowAngleBoostMultiplier,
  distanceNormalizationFactor,
  distanceFactorMultiplier,
  minGridDistance,
  positionFactorMax,
  positionFactorMin,
  positionFactorThreshold,
  fragmentSteepAngleBoostMultiplier,
  fragmentShallowAngleBoostMultiplier,
  shallowAnglePowerFactor,
  fovCompThresholdMax,
  fovCompMultiplier,
  viewAngleAdjustmentMin,
  viewAngleAdjustmentMax,
  fovScalingBase,
  gridDistanceMultiplier,
  sigmoidCenterMax,
  sigmoidCenterMin,
  sigmoidCenterFovFactor,
  sigmoidSharpnessMin,
  sigmoidSharpnessMax,
  falloffBaseMin,
  falloffBaseMax,
  minFadeFactor,
  opacityAdjustmentSteep,
  opacityAdjustmentShallow,
  alphaThreshold,
}: InfiniteGridProperties) {
  // Validate to ensure axes cannot be used to inject malicious code
  if (!['xyz', 'xzy', 'yxz', 'yzx', 'zxy', 'zyx'].includes(axes)) {
    throw new Error('Invalid axes parameter');
  }

  const planeAxes = axes.slice(0, 2);
  const normalAxis = axes[2]; // The normal axis to the grid (usually 'z')

  const material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,

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
      uMinFovBias: {
        value: minFovBias,
      },
      uReferenceFov: {
        value: referenceFov,
      },
      uFovExtensionFactor: {
        value: fovExtensionFactor,
      },
      uFovExtensionBias: {
        value: fovExtensionBias,
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
      uDistanceNormalizationFactor: {
        value: distanceNormalizationFactor,
      },
      uDistanceFactorMultiplier: {
        value: distanceFactorMultiplier,
      },
      uMinGridDistance: {
        value: minGridDistance,
      },
      uPositionFactorMax: {
        value: positionFactorMax,
      },
      uPositionFactorMin: {
        value: positionFactorMin,
      },
      uPositionFactorThreshold: {
        value: positionFactorThreshold,
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
      uFovCompThresholdMax: {
        value: fovCompThresholdMax,
      },
      uFovCompMultiplier: {
        value: fovCompMultiplier,
      },
      uViewAngleAdjustmentMin: {
        value: viewAngleAdjustmentMin,
      },
      uViewAngleAdjustmentMax: {
        value: viewAngleAdjustmentMax,
      },
      uFovScalingBase: {
        value: fovScalingBase,
      },
      uGridDistanceMultiplier: {
        value: gridDistanceMultiplier,
      },
      uSigmoidCenterMax: {
        value: sigmoidCenterMax,
      },
      uSigmoidCenterMin: {
        value: sigmoidCenterMin,
      },
      uSigmoidCenterFovFactor: {
        value: sigmoidCenterFovFactor,
      },
      uSigmoidSharpnessMin: {
        value: sigmoidSharpnessMin,
      },
      uSigmoidSharpnessMax: {
        value: sigmoidSharpnessMax,
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
      uOpacityAdjustmentSteep: {
        value: opacityAdjustmentSteep,
      },
      uOpacityAdjustmentShallow: {
        value: opacityAdjustmentShallow,
      },
      uAlphaThreshold: {
        value: alphaThreshold,
      },
    },
    transparent: true,
    vertexShader: `
      varying vec3 worldPosition;
      varying vec3 viewVector;
  
      uniform float uVisibleWidthMultiplier;
      uniform float uCameraFov;
      uniform float uMinAngle;
      uniform float uTanBlendThreshold;
      uniform float uMinFovBias;
      uniform float uReferenceFov;
      uniform float uFovExtensionFactor;
      uniform float uFovExtensionBias;
      uniform float uSteepAngleThresholdStart;
      uniform float uSteepAngleThresholdEnd;
      uniform float uSteepAngleBoostMultiplier;
      uniform float uShallowAngleBoostMultiplier;
      uniform float uDistanceNormalizationFactor;
      uniform float uDistanceFactorMultiplier;
      uniform float uMinGridDistance;
      uniform float uPositionFactorMax;
      uniform float uPositionFactorMin;
      uniform float uPositionFactorThreshold;
      
      // Highly accurate tangent approximation that works well for all angles
      // Especially for extreme FOV values
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
        
        // Ensure FOV is never zero by adding a small bias
        float safeFov = max(uCameraFov, uMinFovBias);
        
        // Calculate half FOV in radians
        float halfFovRadians = radians(safeFov * 0.5);
        
        // Use a consistent calculation for all FOV values
        float tanHalfFov = stableTan(halfFovRadians);
        
        // Calculate visible width consistently for all FOV values
        float visibleWidthAtDistance = 2.0 * cameraDistance * tanHalfFov;
        
        // Create a smooth FOV extension factor with higher boost at extremely low FOVs
        // This ensures grid visibility across all FOV values including problematic ranges
        float fovFactor = uReferenceFov / max(safeFov, 1.0);
        float fovExtensionFactor = 1.0 + uFovExtensionFactor / (safeFov + uFovExtensionBias) * smoothstep(0.0, 1.0, fovFactor - 1.0);
        
        // Get normalized camera direction to detect viewing angle relative to grid plane
        vec3 cameraNormal = normalize(cameraPosition);
        float viewAngleFactor = abs(cameraNormal.${normalAxis});
        
        // Enhanced angle extension that increases gradually near top-down views
        // The closer to top-down (viewAngleFactor → 1), the more we need to extend
        // This is counter-intuitive but necessary for stability at steep angles
        float steepAngleBoost = smoothstep(uSteepAngleThresholdStart, uSteepAngleThresholdEnd, viewAngleFactor) * uSteepAngleBoostMultiplier;
        
        // Also boost at shallow angles as before
        float shallowAngleBoost = pow(1.0 - viewAngleFactor, 2.0) * uShallowAngleBoostMultiplier;
        
        // Combined angle extension factor without discontinuities
        float angleExtensionFactor = 1.0 + shallowAngleBoost + steepAngleBoost;
        
        // Apply a continuous scaling factor for all angles and FOVs
        float distanceFactor = log(1.0 + cameraDistance * uDistanceNormalizationFactor) * uDistanceFactorMultiplier;
        float gridDistance = visibleWidthAtDistance * uVisibleWidthMultiplier * 
                           angleExtensionFactor * fovExtensionFactor + 
                           distanceFactor;
        
        // Always ensure a reasonable minimum distance
        gridDistance = max(gridDistance, uMinGridDistance);
        
        // Scale the grid based on the calculated distance
        vec3 pos = position.${axes} * gridDistance;
        
        // Position the grid relative to camera with angle-adaptive positioning
        // Reduce the positioning effect at steep angles to prevent flickering
        float positionFactor = mix(uPositionFactorMax, uPositionFactorMin, smoothstep(uPositionFactorThreshold, uSteepAngleThresholdEnd, viewAngleFactor));
        pos.${planeAxes} += cameraPosition.${planeAxes} * positionFactor;
        
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
      uniform float uMinFovBias;
      uniform float uReferenceFov;
      uniform float uSteepAngleThresholdStart;
      uniform float uSteepAngleThresholdEnd;
      uniform float uFragmentSteepAngleBoostMultiplier;
      uniform float uFragmentShallowAngleBoostMultiplier;
      uniform float uShallowAnglePowerFactor;
      uniform float uFovCompThresholdMax;
      uniform float uFovCompMultiplier;
      uniform float uViewAngleAdjustmentMin;
      uniform float uViewAngleAdjustmentMax;
      uniform float uFovScalingBase;
      uniform float uGridDistanceMultiplier;
      uniform float uMinGridDistance;
      uniform float uSigmoidCenterMax;
      uniform float uSigmoidCenterMin;
      uniform float uSigmoidCenterFovFactor;
      uniform float uSigmoidSharpnessMin;
      uniform float uSigmoidSharpnessMax;
      uniform float uFalloffBaseMin;
      uniform float uFalloffBaseMax;
      uniform float uMinFadeFactor;
      uniform float uOpacityAdjustmentSteep;
      uniform float uOpacityAdjustmentShallow;
      uniform float uAlphaThreshold;

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
        // Ensure FOV is never zero
        float safeFov = max(uCameraFov, uMinFovBias);
        
        // Calculate planar distance - distance in the grid plane
        float planarDistance = distance(cameraPosition.${planeAxes}, worldPosition.${planeAxes});
        
        // Calculate view angle factor - dot product of view vector and grid normal
        float viewAngleFactor = abs(viewVector.${normalAxis});
        
        // Create a smooth angle compensation curve with extra boost for steep angles
        float steepAngleBoost = smoothstep(uSteepAngleThresholdStart, uSteepAngleThresholdEnd, viewAngleFactor) * uFragmentSteepAngleBoostMultiplier;
        float shallowAngleBoost = pow(1.0 - viewAngleFactor, uShallowAnglePowerFactor) * uFragmentShallowAngleBoostMultiplier;
        float angleCompensation = 1.0 + shallowAngleBoost + steepAngleBoost;
        
        // Create a smooth FOV compensation that works across all values
        // Higher boost for both very low and very high FOV values
        float fovFactor = uReferenceFov / max(safeFov, 1.0);
        float fovCompensation = 1.0 + uFovCompMultiplier * smoothstep(0.0, uFovCompThresholdMax, fovFactor);
        
        // Create a smooth distance adjustment that adapts to viewing angle
        float viewAngleAdjustment = mix(uViewAngleAdjustmentMin, uViewAngleAdjustmentMax, viewAngleFactor);
        float adjustedDistance = planarDistance * viewAngleAdjustment / fovCompensation;
        
        // Calculate visible width with stable tangent function
        float cameraDistance = length(cameraPosition);
        float halfFovRadians = radians(safeFov * 0.5);
        float tanHalfFov = stableTan(halfFovRadians);
        float visibleWidthAtDistance = 2.0 * cameraDistance * tanHalfFov;
        
        // Calculate grid distance with enhanced scaling factors
        float fovScalingFactor = 1.0 + uFovScalingBase / sqrt(safeFov + 1.0);
        float gridDistance = visibleWidthAtDistance * uGridDistanceMultiplier * fovScalingFactor;
        
        // Ensure minimum distance
        gridDistance = max(gridDistance, uMinGridDistance);
        
        // Calculate distance ratio with angle compensation
        float distanceRatio = adjustedDistance / (gridDistance * angleCompensation);
        
        // Use a sigmoid function for fade with adaptive center based on angle and FOV
        float sigmoidCenter = mix(uSigmoidCenterMax, uSigmoidCenterMin, viewAngleFactor) * (1.0 + uSigmoidCenterFovFactor / safeFov);
        float sigmoidSharpness = mix(uSigmoidSharpnessMin, uSigmoidSharpnessMax, viewAngleFactor) * fovCompensation;
        float d = 1.0 / (1.0 + exp(sigmoidSharpness * (distanceRatio - sigmoidCenter)));
        
        // Ensure consistent falloff behavior
        float falloffBase = mix(uFalloffBaseMin, uFalloffBaseMax, viewAngleFactor);
        float falloffExponent = 1.0 + viewAngleFactor;
        
        // Apply fade factor with angle-adaptive exponent
        float fadeFactor = pow(d, falloffExponent);
        
        // Add minimal base opacity for stability across all angles and FOVs
        fadeFactor = max(fadeFactor, uMinFadeFactor);
        
        // Apply opacity adjustment that increases at extreme angles
        float opacityFactor = 1.0 + steepAngleBoost * uOpacityAdjustmentSteep + shallowAngleBoost * uOpacityAdjustmentShallow;
        float angleAdjustedOpacity = uLineOpacity * opacityFactor;
        
        float gridSmall = getGrid(uSmallSize, uSmallThickness);
        float gridLarge = getGrid(uLargeSize, uLargeThickness);
        
        float grid = max(gridSmall, gridLarge);
        
        // Apply final color with enhanced opacity
        gl_FragColor = vec4(uColor.rgb, grid * fadeFactor * angleAdjustedOpacity);
        
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
  lineOpacity = 0.2,
  visibleWidthMultiplier = 10,
  minAngle = 0.0001,
  tanBlendThreshold = 0.2,
  minFovBias = 0.1,
  referenceFov = 90,
  fovExtensionFactor = 30,
  fovExtensionBias = 5,
  steepAngleThresholdStart = 0.7,
  steepAngleThresholdEnd = 1,
  steepAngleBoostMultiplier = 2,
  shallowAngleBoostMultiplier = 10,
  distanceNormalizationFactor = 0.01,
  distanceFactorMultiplier = 100,
  minGridDistance = 1000,
  positionFactorMax = 0.8,
  positionFactorMin = 0.5,
  positionFactorThreshold = 0.7,
  fragmentSteepAngleBoostMultiplier = 5,
  fragmentShallowAngleBoostMultiplier = 10,
  shallowAnglePowerFactor = 3,
  fovCompThresholdMax = 3,
  fovCompMultiplier = 2,
  viewAngleAdjustmentMin = 0.2,
  viewAngleAdjustmentMax = 1,
  fovScalingBase = 10,
  gridDistanceMultiplier = 10,
  sigmoidCenterMax = 0.7,
  sigmoidCenterMin = 0.4,
  sigmoidCenterFovFactor = 0.5,
  sigmoidSharpnessMin = 3,
  sigmoidSharpnessMax = 8,
  falloffBaseMin = 0.05,
  falloffBaseMax = 0.5,
  minFadeFactor = 0.05,
  opacityAdjustmentSteep = 0.2,
  opacityAdjustmentShallow = 0.2,
  alphaThreshold = 0.01,
}: Partial<InfiniteGridProperties> & Pick<InfiniteGridProperties, 'smallSize' | 'largeSize'>): JSX.Element {
  const [theme] = useTheme();
  const materialRef = React.useRef<THREE.ShaderMaterial | undefined>(null);
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;

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
        minFovBias,
        referenceFov,
        fovExtensionFactor,
        fovExtensionBias,
        steepAngleThresholdStart,
        steepAngleThresholdEnd,
        steepAngleBoostMultiplier,
        shallowAngleBoostMultiplier,
        distanceNormalizationFactor,
        distanceFactorMultiplier,
        minGridDistance,
        positionFactorMax,
        positionFactorMin,
        positionFactorThreshold,
        fragmentSteepAngleBoostMultiplier,
        fragmentShallowAngleBoostMultiplier,
        shallowAnglePowerFactor,
        fovCompThresholdMax,
        fovCompMultiplier,
        viewAngleAdjustmentMin,
        viewAngleAdjustmentMax,
        fovScalingBase,
        gridDistanceMultiplier,
        sigmoidCenterMax,
        sigmoidCenterMin,
        sigmoidCenterFovFactor,
        sigmoidSharpnessMin,
        sigmoidSharpnessMax,
        falloffBaseMin,
        falloffBaseMax,
        minFadeFactor,
        opacityAdjustmentSteep,
        opacityAdjustmentShallow,
        alphaThreshold,
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
      minFovBias,
      referenceFov,
      fovExtensionFactor,
      fovExtensionBias,
      steepAngleThresholdStart,
      steepAngleThresholdEnd,
      steepAngleBoostMultiplier,
      shallowAngleBoostMultiplier,
      distanceNormalizationFactor,
      distanceFactorMultiplier,
      minGridDistance,
      positionFactorMax,
      positionFactorMin,
      positionFactorThreshold,
      fragmentSteepAngleBoostMultiplier,
      fragmentShallowAngleBoostMultiplier,
      shallowAnglePowerFactor,
      fovCompThresholdMax,
      fovCompMultiplier,
      viewAngleAdjustmentMin,
      viewAngleAdjustmentMax,
      fovScalingBase,
      gridDistanceMultiplier,
      sigmoidCenterMax,
      sigmoidCenterMin,
      sigmoidCenterFovFactor,
      sigmoidSharpnessMin,
      sigmoidSharpnessMax,
      falloffBaseMin,
      falloffBaseMax,
      minFadeFactor,
      opacityAdjustmentSteep,
      opacityAdjustmentShallow,
      alphaThreshold,
    ],
  );

  React.useEffect(() => {
    materialRef.current = material;
  }, [material]);

  // Update camera FOV on every frame render
  useFrame(() => {
    if (!materialRef.current || !camera) return;
    materialRef.current.uniforms.uCameraFov.value = camera.fov;
  });

  return <Plane userData={{ isPreviewOnly: true }} material={material} renderOrder={9999} />;
}
