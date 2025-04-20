import * as THREE from 'three';
import { Plane } from '@react-three/drei';
import React from 'react';
import type { JSX } from 'react';
import { Theme, useTheme } from 'remix-themes';
import { useThree, useFrame } from '@react-three/fiber';

type InfiniteGridProperties = {
  /**
   * The distance between the lines of the small grid.
   * Increasing this value makes the small grid lines more sparse/farther apart.
   * Decreasing creates a denser grid with closer lines.
   */
  readonly smallSize: number;
  /**
   * The thickness of the lines of the small grid.
   * Increasing this value makes the small grid lines thicker/more prominent.
   * @default 1.25
   */
  readonly smallThickness: number;
  /**
   * The distance between the lines of the large grid.
   * Increasing this value makes the large grid lines more sparse/farther apart.
   * Decreasing creates a denser grid with closer major lines.
   */
  readonly largeSize: number;
  /**
   * The thickness of the lines of the large grid.
   * Increasing this value makes the large grid lines thicker/more prominent.
   * @default 2
   */
  readonly largeThickness: number;
  /**
   * The color of the grid.
   */
  readonly color: THREE.Color;
  /**
   * The axes to use for the grid.
   * Defines the plane and orientation of the grid.
   * First two letters determine the grid plane axes, third letter is the normal axis.
   * @default 'xyz'
   */
  readonly axes: 'xyz' | 'xzy' | 'yxz' | 'yzx' | 'zxy' | 'zyx';
  /**
   * The opacity of the lines of the grid.
   * Increasing this value makes the grid more visible/opaque.
   * Decreasing makes it more transparent.
   * @default 0.3
   */
  readonly lineOpacity: number;
  /**
   * The base distance falloff scale for the grid.
   * Increasing this value makes the grid visible from farther away.
   * Decreasing causes the grid to fade out at shorter distances.
   * @default 800
   */
  readonly baseFalloffScale: number;
  /**
   * The visible width multiplier for distance calculation.
   * Increasing this value extends the grid farther from the camera.
   * Decreasing shrinks the visible area of the grid.
   * @default 10
   */
  readonly visibleWidthMultiplier: number;
  /**
   * View angle power factor for visibility calculations.
   * Increasing this value makes the view angle effect more aggressive.
   * Decreasing softens the effect of viewing angle on grid visibility.
   * @default 0.3
   */
  readonly viewAnglePowerFactor: number;
  /**
   * Minimum falloff base value for distance calculations.
   * Increasing this value strengthens the minimum opacity at distance.
   * Decreasing allows the grid to fade more completely at far distances.
   * @default 0.5
   */
  readonly minFalloffBase: number;
  /**
   * Minimum fade factor to prevent grid from completely disappearing.
   * Increasing this value maintains higher visibility at distances.
   * Decreasing allows more complete fading when far away.
   * @default 0.2
   */
  readonly minFadeFactor: number;
  /**
   * The minimum value for the FOV factor calculation.
   * Increasing this value maintains grid visibility at extreme FOVs.
   * Decreasing allows more aggressive fading at non-standard FOVs.
   * @default 1
   */
  readonly minFovFactor: number;
  /**
   * Whether to use dynamic falloff scale calculation.
   * When true, the grid adapts its appearance based on camera position and FOV.
   * When false, uses baseFalloffScale directly for more static appearance.
   * @default true
   */
  readonly useDynamicFalloff: boolean;
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
  baseFalloffScale,
  visibleWidthMultiplier,
  viewAnglePowerFactor,
  minFalloffBase,
  minFadeFactor,
  minFovFactor,
  useDynamicFalloff,
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
      uSize1: {
        value: smallSize,
      },
      uSize2: {
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
      uBaseFalloffScale: {
        value: baseFalloffScale,
      },
      uVisibleWidthMultiplier: {
        value: visibleWidthMultiplier,
      },
      uCameraFov: {
        value: 60, // Default value, will be updated by component
      },
      uViewAnglePowerFactor: {
        value: viewAnglePowerFactor,
      },
      uMinFalloffBase: {
        value: minFalloffBase,
      },
      uMinFadeFactor: {
        value: minFadeFactor,
      },
      uMinFovFactor: {
        value: minFovFactor,
      },
      uUseDynamicFalloff: {
        value: useDynamicFalloff ? 1 : 0,
      },
    },
    transparent: true,
    vertexShader: `
      varying vec3 worldPosition;
      varying vec3 viewVector;
  
      uniform float uVisibleWidthMultiplier;
      uniform float uCameraFov;
      
      // Highly accurate tangent approximation that works well for all angles
      // Especially for extreme FOV values
      float stableTan(float angle) {
        // Ensure angle is never exactly zero
        angle = max(angle, 0.0001);
        
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
        float blendFactor = 1.0 - smoothstep(0.0, 0.2, angle);
        return mix(standardTan, taylorTan, blendFactor);
      }
      
      void main() {
        // Calculate the camera distance
        float cameraDistance = length(cameraPosition);
        
        // Ensure FOV is never zero by adding a small bias
        float safeFov = max(uCameraFov, 0.1);
        
        // Calculate half FOV in radians
        float halfFovRadians = radians(safeFov * 0.5);
        
        // Use a consistent calculation for all FOV values
        float tanHalfFov = stableTan(halfFovRadians);
        
        // Calculate visible width consistently for all FOV values
        float visibleWidthAtDistance = 2.0 * cameraDistance * tanHalfFov;
        
        // Create a smooth FOV extension factor with higher boost at extremely low FOVs
        // This ensures grid visibility across all FOV values including problematic ranges
        float fovFactor = 90.0 / max(safeFov, 1.0);
        float fovExtensionFactor = 1.0 + 30.0 / (safeFov + 5.0) * smoothstep(0.0, 1.0, fovFactor - 1.0);
        
        // Get normalized camera direction to detect viewing angle relative to grid plane
        vec3 cameraNormal = normalize(cameraPosition);
        float viewAngleFactor = abs(cameraNormal.${normalAxis});
        
        // Enhanced angle extension that increases gradually near top-down views
        // The closer to top-down (viewAngleFactor → 1), the more we need to extend
        // This is counter-intuitive but necessary for stability at steep angles
        float steepAngleBoost = smoothstep(0.7, 1.0, viewAngleFactor) * 2.0;
        
        // Also boost at shallow angles as before
        float shallowAngleBoost = pow(1.0 - viewAngleFactor, 2.0) * 10.0;
        
        // Combined angle extension factor without discontinuities
        float angleExtensionFactor = 1.0 + shallowAngleBoost + steepAngleBoost;
        
        // Apply a continuous scaling factor for all angles and FOVs
        float distanceFactor = log(1.0 + cameraDistance * 0.01) * 100.0;
        float gridDistance = visibleWidthAtDistance * uVisibleWidthMultiplier * 
                           angleExtensionFactor * fovExtensionFactor + 
                           distanceFactor;
        
        // Always ensure a reasonable minimum distance
        gridDistance = max(gridDistance, 1000.0);
        
        // Scale the grid based on the calculated distance
        vec3 pos = position.${axes} * gridDistance;
        
        // Position the grid relative to camera with angle-adaptive positioning
        // Reduce the positioning effect at steep angles to prevent flickering
        float positionFactor = mix(0.8, 0.5, smoothstep(0.7, 1.0, viewAngleFactor));
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
      
      uniform float uSize1;
      uniform float uSize2;
      uniform float uSmallThickness;
      uniform float uLargeThickness;
      uniform vec3 uColor;
      uniform float uLineOpacity;
      uniform float uBaseFalloffScale;
      uniform float uCameraFov;
      uniform float uViewAnglePowerFactor;
      uniform float uMinFalloffBase;
      uniform float uMinFadeFactor;
      uniform float uMinFovFactor;
      uniform float uUseDynamicFalloff;

      // Highly accurate tangent approximation that works well for all angles
      float stableTan(float angle) {
        // Ensure angle is never exactly zero
        angle = max(angle, 0.0001);
        
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
        float blendFactor = 1.0 - smoothstep(0.0, 0.2, angle);
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
        float safeFov = max(uCameraFov, 0.1);
        
        // Calculate planar distance - distance in the grid plane
        float planarDistance = distance(cameraPosition.${planeAxes}, worldPosition.${planeAxes});
        
        // Calculate view angle factor - dot product of view vector and grid normal
        float viewAngleFactor = abs(viewVector.${normalAxis});
        
        // Create a smooth angle compensation curve with extra boost for steep angles
        float steepAngleBoost = smoothstep(0.7, 1.0, viewAngleFactor) * 5.0;
        float shallowAngleBoost = pow(1.0 - viewAngleFactor, 3.0) * 10.0;
        float angleCompensation = 1.0 + shallowAngleBoost + steepAngleBoost;
        
        // Create a smooth FOV compensation that works across all values
        // Higher boost for both very low and very high FOV values
        float fovFactor = 90.0 / max(safeFov, 1.0);
        float fovCompensation = 1.0 + 2.0 * smoothstep(0.0, 3.0, fovFactor);
        
        // Create a smooth distance adjustment that adapts to viewing angle
        float viewAngleAdjustment = mix(0.2, 1.0, viewAngleFactor);
        float adjustedDistance = planarDistance * viewAngleAdjustment / fovCompensation;
        
        // Calculate visible width with stable tangent function
        float cameraDistance = length(cameraPosition);
        float halfFovRadians = radians(safeFov * 0.5);
        float tanHalfFov = stableTan(halfFovRadians);
        float visibleWidthAtDistance = 2.0 * cameraDistance * tanHalfFov;
        
        // Calculate grid distance with enhanced scaling factors
        float fovScalingFactor = 1.0 + 10.0 / sqrt(safeFov + 1.0);
        float gridDistance = visibleWidthAtDistance * 10.0 * fovScalingFactor;
        
        // Ensure minimum distance
        gridDistance = max(gridDistance, 1000.0);
        
        // Calculate distance ratio with angle compensation
        float distanceRatio = adjustedDistance / (gridDistance * angleCompensation);
        
        // Use a sigmoid function for fade with adaptive center based on angle and FOV
        float sigmoidCenter = mix(0.7, 0.4, viewAngleFactor) * (1.0 + 0.5 / safeFov);
        float sigmoidSharpness = mix(3.0, 8.0, viewAngleFactor) * fovCompensation;
        float d = 1.0 / (1.0 + exp(sigmoidSharpness * (distanceRatio - sigmoidCenter)));
        
        // Ensure consistent falloff behavior
        float falloffBase = mix(0.05, 0.5, viewAngleFactor);
        float falloffExponent = 1.0 + viewAngleFactor;
        
        // Apply fade factor with angle-adaptive exponent
        float fadeFactor = pow(d, falloffExponent);
        
        // Add minimal base opacity for stability across all angles and FOVs
        fadeFactor = max(fadeFactor, 0.05);
        
        // Apply opacity adjustment that increases at extreme angles
        float opacityFactor = 1.0 + steepAngleBoost * 0.2 + shallowAngleBoost * 0.2;
        float angleAdjustedOpacity = uLineOpacity * opacityFactor;
        
        float gridSmall = getGrid(uSize1, uSmallThickness);
        float gridLarge = getGrid(uSize2, uLargeThickness);
        
        float grid = max(gridSmall, gridLarge);
        
        // Apply final color with enhanced opacity
        gl_FragColor = vec4(uColor.rgb, grid * fadeFactor * angleAdjustedOpacity);
        
        // Use a simple alpha threshold
        if (gl_FragColor.a < 0.01) gl_FragColor.a = 0.0;
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
  lineOpacity = 0.2,
  baseFalloffScale = 800,
  visibleWidthMultiplier = 10,
  viewAnglePowerFactor = 0.3,
  minFalloffBase = 0.5,
  minFadeFactor = 0.2,
  minFovFactor = 1,
  useDynamicFalloff = true,
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
        baseFalloffScale,
        visibleWidthMultiplier,
        viewAnglePowerFactor,
        minFalloffBase,
        minFadeFactor,
        minFovFactor,
        useDynamicFalloff,
      }),
    [
      smallSize,
      largeSize,
      smallThickness,
      largeThickness,
      theme,
      axes,
      lineOpacity,
      baseFalloffScale,
      visibleWidthMultiplier,
      viewAnglePowerFactor,
      minFalloffBase,
      minFadeFactor,
      minFovFactor,
      useDynamicFalloff,
    ],
  );

  React.useEffect(() => {
    materialRef.current = material;
  }, [material]);

  // Update camera FOV on every frame render
  // This is the most reliable way to ensure the shader always has the current camera properties
  useFrame(() => {
    if (!materialRef.current || !camera) return;
    materialRef.current.uniforms.uCameraFov.value = camera.fov;
  });

  // Update properties when they change
  React.useEffect(() => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.uBaseFalloffScale.value = baseFalloffScale;
    materialRef.current.uniforms.uVisibleWidthMultiplier.value = visibleWidthMultiplier;
    materialRef.current.uniforms.uViewAnglePowerFactor.value = viewAnglePowerFactor;
    materialRef.current.uniforms.uMinFalloffBase.value = minFalloffBase;
    materialRef.current.uniforms.uMinFadeFactor.value = minFadeFactor;
    materialRef.current.uniforms.uMinFovFactor.value = minFovFactor;
    materialRef.current.uniforms.uUseDynamicFalloff.value = useDynamicFalloff ? 1 : 0;
  }, [
    baseFalloffScale,
    visibleWidthMultiplier,
    viewAnglePowerFactor,
    minFalloffBase,
    minFadeFactor,
    minFovFactor,
    useDynamicFalloff,
  ]);

  return (
    <Plane
      userData={{ isPreviewOnly: true }}
      material={material}
      renderOrder={9999} // Very high render order is used to force the grid to draw on top of other objects, ensuring it is always visible and void of blending issues like z-fighting
    />
  );
}
