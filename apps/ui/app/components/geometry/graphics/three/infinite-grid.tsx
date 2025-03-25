import * as THREE from 'three';
import { Plane } from '@react-three/drei';
import React from 'react';
import { useTheme } from 'remix-themes';

type InfiniteGridProperties = {
  size1: number;
  size2: number;
  color?: THREE.Color;
  axes?: 'xyz' | 'xzy' | 'yxz' | 'yzx' | 'zxy' | 'zyx';
  showSize?: boolean;
};

// Author: Fyrestar https://mevedia.com (https://github.com/Fyrestar/THREE.InfiniteGridHelper)
const infiniteGridMaterial = function InfiniteGridMaterial({
  size1,
  size2,
  color = new THREE.Color('grey'),
  axes = 'xyz',
}: InfiniteGridProperties) {
  // Validate to ensure axes cannot be used to inject malicious code
  if (!['xyz', 'xzy', 'yxz', 'yzx', 'zxy', 'zyx'].includes(axes)) {
    throw new Error('Invalid axes parameter');
  }

  const distance = size1 * 1000;

  const planeAxes = axes.slice(0, 2);

  const material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,

    uniforms: {
      uSize1: {
        value: size1,
      },
      uSize2: {
        value: size2,
      },
      uColor: {
        value: color,
      },
      uDistance: {
        value: distance,
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
      uniform vec3 uColor;
      uniform float uDistance;

      float getGrid(float size) {
        vec2 r = worldPosition.${planeAxes} / size;
        
        
        vec2 grid = abs(fract(r - 0.5) - 0.5) / fwidth(r);
        float line = min(grid.x, grid.y);
        
    
        return 1.0 - min(line, 1.0);
      }
      
      void main() {
        float d = 1.0 - min(distance(cameraPosition.${planeAxes}, worldPosition.${planeAxes}) / uDistance, 1.0);
      
        float g1 = getGrid(uSize1);
        float g2 = getGrid(uSize2);
        
        
        gl_FragColor = vec4(uColor.rgb, mix(g2, g1, g1) * pow(d, uDistance / 200.0));
        gl_FragColor.a = mix(0.7 * gl_FragColor.a, gl_FragColor.a, g2);
      
        if ( gl_FragColor.a <= 0.0 ) discard;
      }
      `,
  });

  return material;
};

export const InfiniteGrid = ({ size1, size2 }: InfiniteGridProperties) => {
  const [theme] = useTheme();
  const material = React.useMemo(
    () =>
      infiniteGridMaterial({
        size1,
        size2,
        color: theme === 'light' ? new THREE.Color('lightgrey') : new THREE.Color('grey'),
      }),
    [size1, size2, theme],
  );

  return <Plane userData={{ isPreviewOnly: true }} material={material} />;
};
