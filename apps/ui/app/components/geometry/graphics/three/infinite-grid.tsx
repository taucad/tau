import * as THREE from 'three';
import { Plane } from '@react-three/drei';
import React from 'react';
import { useTheme } from 'remix-themes';

type InfiniteGridProperties = {
  /**
   * The distance between the lines of the small grid.
   */
  smallSize: number;
  /**
   * The thickness of the lines of the small grid.
   * @default 1.25
   */
  smallThickness?: number;
  /**
   * The distance between the lines of the large grid.
   */
  largeSize: number;
  /**
   * The thickness of the lines of the large grid.
   * @default 2
   */
  largeThickness?: number;
  /**
   * The color of the grid.
   */
  color?: THREE.Color;
  /**
   * The axes to use for the grid.
   * @default 'xyz'
   */
  axes?: 'xyz' | 'xzy' | 'yxz' | 'yzx' | 'zxy' | 'zyx';
  /**
   * The opacity of the lines of the grid.
   * @default 0.3
   */
  lineOpacity?: number;
  /**
   * The distance falloff scale. This is used to control the distance at which the grid lines become more transparent.
   * @default 200
   */
  distanceFalloffScale?: number;
};

// Author: Fyrestar https://mevedia.com (https://github.com/Fyrestar/THREE.InfiniteGridHelper)
function infiniteGridMaterial({
  smallSize,
  largeSize,
  color,
  axes = 'xyz',
  smallThickness = 1.25,
  largeThickness = 2,
  lineOpacity = 0.3,
  distanceFalloffScale = 200,
}: InfiniteGridProperties) {
  // Validate to ensure axes cannot be used to inject malicious code
  if (!['xyz', 'xzy', 'yxz', 'yzx', 'zxy', 'zyx'].includes(axes)) {
    throw new Error('Invalid axes parameter');
  }

  const distance = smallSize * 1000;

  const planeAxes = axes.slice(0, 2);

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
        value: distance,
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
  
      uniform float uDistance;
      
      void main() {
        vec3 pos = position.${axes} * uDistance;
        pos.${planeAxes} += cameraPosition.${planeAxes};
        
        worldPosition = pos;
        
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
      `,

    fragmentShader: `
      varying vec3 worldPosition;
      
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
        float d = 1.0 - min(distance(cameraPosition.${planeAxes}, worldPosition.${planeAxes}) / uDistance, 1.0);
      
        float gridSmall = getGrid(uSize1, uSmallThickness);
        float gridLarge = getGrid(uSize2, uLargeThickness);
        
        float grid = max(gridSmall, gridLarge);
        
        gl_FragColor = vec4(uColor.rgb, grid * pow(d, uDistance / uDistanceFalloffScale) * uLineOpacity);
        
        if ( gl_FragColor.a <= 0.0 ) discard;
      }
      `,
  });

  return material;
}

export const InfiniteGrid = ({ smallSize, largeSize }: InfiniteGridProperties) => {
  const [theme] = useTheme();
  const material = React.useMemo(
    () =>
      infiniteGridMaterial({
        smallSize,
        largeSize,
        color: theme === 'light' ? new THREE.Color('lightgrey') : new THREE.Color('grey'),
      }),
    [smallSize, largeSize, theme],
  );

  return (
    <Plane
      userData={{ isPreviewOnly: true }}
      material={material}
      renderOrder={9999} // Very high render order is used to force the grid to draw on top of other objects, ensuring it is always visible and void of blending issues like z-fighting
    />
  );
};
