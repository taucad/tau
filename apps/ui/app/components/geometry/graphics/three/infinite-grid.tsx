import * as THREE from 'three';
import { Plane } from '@react-three/drei';
import React from 'react';
import type { JSX } from 'react';
import { Theme, useTheme } from 'remix-themes';

type InfiniteGridProperties = {
  /**
   * The distance between the lines of the small grid.
   */
  readonly smallSize: number;
  /**
   * The thickness of the lines of the small grid.
   * @default 1.25
   */
  readonly smallThickness: number;
  /**
   * The distance between the lines of the large grid.
   */
  readonly largeSize: number;
  /**
   * The thickness of the lines of the large grid.
   * @default 2
   */
  readonly largeThickness: number;
  /**
   * The color of the grid.
   */
  readonly color: THREE.Color;
  /**
   * The axes to use for the grid.
   * @default 'xyz'
   */
  readonly axes: 'xyz' | 'xzy' | 'yxz' | 'yzx' | 'zxy' | 'zyx';
  /**
   * The opacity of the lines of the grid.
   * @default 0.3
   */
  readonly lineOpacity: number;
  /**
   * The distance falloff scale. This is used to control the distance at which the grid lines become more transparent.
   * @default 800
   */
  readonly distanceFalloffScale: number;
  /**
   * The overall distance for which the grid will be rendered. Higher values show grid further away.
   */
  readonly distance?: number;
};

// Original Author: Fyrestar https://mevedia.com (https://github.com/Fyrestar/THREE.InfiniteGridHelper)
// Modified by @rifont to use varying thickness and enhanced distance falloff
function infiniteGridMaterial({
  smallSize,
  largeSize,
  color,
  axes,
  smallThickness,
  largeThickness,
  lineOpacity,
  distanceFalloffScale,
  distance,
}: InfiniteGridProperties) {
  // Validate to ensure axes cannot be used to inject malicious code
  if (!['xyz', 'xzy', 'yxz', 'yzx', 'zxy', 'zyx'].includes(axes)) {
    throw new Error('Invalid axes parameter');
  }

  // If no distance is provided, calculate based on grid size
  const actualDistance = distance ?? smallSize * 1000;

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
      uDistance: {
        value: actualDistance,
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
      uDistanceFalloffScale: {
        value: distanceFalloffScale,
      },
    },
    transparent: true,
    vertexShader: `
      varying vec3 worldPosition;
      varying vec3 viewVector;
  
      uniform float uDistance;
      
      void main() {
        vec3 pos = position.${axes} * uDistance;
        pos.${planeAxes} += cameraPosition.${planeAxes};
        
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
      uniform float uDistance;
      uniform float uLineOpacity;
      uniform float uDistanceFalloffScale;

      float getGrid(float size, float thickness) {
        vec2 r = worldPosition.${planeAxes} / size;
        
        vec2 grid = abs(fract(r - 0.5) - 0.5) / (fwidth(r) * thickness);
        float line = min(grid.x, grid.y);
        
        return 1.0 - min(line, 1.0);
      }
      
      void main() {
        // Calculate planar distance - distance in the grid plane
        float planarDistance = distance(cameraPosition.${planeAxes}, worldPosition.${planeAxes});
        
        // Calculate view angle factor - dot product of view vector and grid normal
        float viewAngleFactor = abs(viewVector.${normalAxis});
        
        // Create a much more forgiving distance adjustment for shallow viewing angles
        // This ensures grid remains visible even at extreme angles
        float adjustedDistance = planarDistance * pow(viewAngleFactor, 0.3);
        
        // Calculate fade factor with a softer transition
        float d = 1.0 - min(adjustedDistance / uDistance, 1.0);
        
        // Calculate a viewing-angle aware falloff exponent
        // This makes the falloff much gentler at shallow viewing angles
        float falloffBase = max(0.5, viewAngleFactor);
        float falloffExponent = uDistance / (uDistanceFalloffScale * falloffBase);
        
        // Apply power function with a minimum to prevent complete fade at distance
        float fadeFactor = max(0.2, pow(d, falloffExponent));
        
        // Apply different opacity based on viewing angle
        // Higher opacity at shallow angles to compensate for stretching
        float angleAdjustedOpacity = uLineOpacity * (1.0 + (1.0 - viewAngleFactor));
        
        float gridSmall = getGrid(uSize1, uSmallThickness);
        float gridLarge = getGrid(uSize2, uLargeThickness);
        
        float grid = max(gridSmall, gridLarge);
        
        // Apply enhanced fade that maintains visibility at all angles
        gl_FragColor = vec4(uColor.rgb, grid * fadeFactor * angleAdjustedOpacity);
        
        if (gl_FragColor.a <= 0.0) discard;
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
  lineOpacity = 0.3,
  distanceFalloffScale = 800,
  distance,
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
        distanceFalloffScale,
        distance,
      }),
    [smallSize, largeSize, smallThickness, largeThickness, theme, axes, lineOpacity, distanceFalloffScale, distance],
  );

  React.useEffect(() => {
    materialRef.current = material;
  }, [material]);

  // Update distanceFalloffScale immediately when it changes from props
  React.useEffect(() => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.uDistanceFalloffScale.value = distanceFalloffScale;
  }, [distanceFalloffScale]);

  return (
    <Plane
      userData={{ isPreviewOnly: true }}
      material={material}
      renderOrder={9999} // Very high render order is used to force the grid to draw on top of other objects, ensuring it is always visible and void of blending issues like z-fighting
    />
  );
}
