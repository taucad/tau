import * as THREE from 'three';
import { Plane } from '@react-three/drei';
import React from 'react';
import { infiniteGridMaterial } from '#components/geometry/graphics/three/materials/infinite-grid-material.js';
import type { InfiniteGridMaterialProperties } from '#components/geometry/graphics/three/materials/infinite-grid-material.js';

type InfiniteGridProperties = {
  /**
   * The properties for the infinite grid material.
   */
  readonly materialProperties?: InfiniteGridMaterialProperties;
  /**
   * The properties for the infinite grid plane.
   */
  readonly planeProperties?: React.ComponentProps<typeof Plane>;
};

/**
 * An infinite grid component that renders a ground plane grid with automatic orientation
 * based on the Three.js up direction. The grid extends infinitely in all directions and
 * scales dynamically based on camera distance for optimal visibility.
 *
 * ### Features:
 * - **Automatic orientation**: Adapts to Y-up, Z-up, X-up, or any custom up direction
 * - **Infinite extent**: Grid extends as far as needed based on camera position
 * - **Dynamic scaling**: Grid size adjusts to camera distance for consistent visibility
 * - **Dual grid system**: Small and large grid lines with independent sizing and thickness
 * - **Distance-based fading**: Grid fades out at edges to prevent visual artifacts
 * - **Customizable appearance**: Configurable colors, opacity, and thickness
 * - **Performance optimized**: Uses efficient shader-based rendering
 *
 * ### Up Direction Handling:
 * The component automatically detects `THREE.Object3D.DEFAULT_UP` and orients the grid
 * perpendicular to the up direction:
 * - Y-up (0,1,0): Grid on XZ plane (standard Three.js)
 * - Z-up (0,0,1): Grid on XY plane (CAD/engineering)
 * - X-up (1,0,0): Grid on YZ plane (alternative coordinate systems)
 *
 * ### Usage:
 * ```tsx
 * <InfiniteGrid
 *   smallSize={1}
 *   largeSize={10}
 *   color={new THREE.Color('grey')}
 *   smallThickness={1.25}
 *   largeThickness={2.5}
 * />
 * ```
 *
 * @param properties - The properties for the infinite grid material.
 */
export function InfiniteGrid(properties?: InfiniteGridProperties): React.JSX.Element {
  const { materialProperties = {}, planeProperties = {} } = properties ?? {};

  // Determine axes based on DEFAULT_UP direction
  const defaultAxes = React.useMemo(() => {
    const up = THREE.Object3D.DEFAULT_UP;

    // Check which component is the up direction and return appropriate axes
    if (Math.abs(up.y) === 1) {
      // Y-up: grid on XZ plane
      return 'xzy' as const;
    }

    if (Math.abs(up.z) === 1) {
      // Z-up: grid on XY plane
      return 'xyz' as const;
    }

    if (Math.abs(up.x) === 1) {
      // X-up: grid on YZ plane
      return 'zyx' as const;
    }

    throw new Error(`Invalid up direction: [x:${up.x}, y:${up.y}, z:${up.z}]`);
  }, []);

  // Create material with initial properties
  const material = React.useMemo(
    () => infiniteGridMaterial({ ...materialProperties, axes: materialProperties.axes ?? defaultAxes }),
    [defaultAxes, materialProperties],
  );

  return (
    <Plane
      frustumCulled={false} // Ensure the grid is always rendered
      userData={{ isPreviewOnly: true }}
      material={material}
      renderOrder={Infinity}
      {...planeProperties}
    />
  );
}
