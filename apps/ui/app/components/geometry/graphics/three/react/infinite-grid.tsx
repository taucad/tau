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
  /**
   * The axes to use for the grid orientation.
   * - 'xzy': Grid on XZ plane (Y-up coordinate system)
   * - 'xyz': Grid on XY plane (Z-up coordinate system)
   * - 'zyx': Grid on YZ plane (X-up coordinate system)
   */
  readonly axes: 'xzy' | 'xyz' | 'zyx';
};

/**
 * An infinite grid component that renders a ground plane grid.
 * The grid extends infinitely in all directions and scales dynamically
 * based on camera distance for optimal visibility.
 *
 * ### Features:
 * - **Infinite extent**: Grid extends as far as needed based on camera position
 * - **Dynamic scaling**: Grid size adjusts to camera distance for consistent visibility
 * - **Dual grid system**: Small and large grid lines with independent sizing and thickness
 * - **Distance-based fading**: Grid fades out at edges to prevent visual artifacts
 * - **Customizable appearance**: Configurable colors, opacity, and thickness
 * - **Performance optimized**: Uses efficient shader-based rendering
 *
 * ### Grid Orientation:
 * The grid orientation is controlled by the `axes` prop:
 * - 'xzy': Grid on XZ plane (Y-up coordinate system, standard Three.js)
 * - 'xyz': Grid on XY plane (Z-up coordinate system, CAD/engineering)
 * - 'zyx': Grid on YZ plane (X-up coordinate system)
 *
 * ### Usage:
 * ```tsx
 * <InfiniteGrid
 *   axes="xzy"
 *   materialProperties={{
 *     smallSize: 1,
 *     largeSize: 10,
 *     color: new THREE.Color('grey'),
 *     smallThickness: 1.25,
 *     largeThickness: 2.5
 *   }}
 * />
 * ```
 *
 * @param properties - The properties for the infinite grid.
 */
export function InfiniteGrid(properties: InfiniteGridProperties): React.JSX.Element {
  const { materialProperties = {}, planeProperties = {}, axes } = properties;

  // Create material with provided axes
  const material = React.useMemo(
    () => infiniteGridMaterial({ ...materialProperties, axes }),
    [axes, materialProperties],
  );

  return (
    <Plane
      frustumCulled={false} // Ensure the grid is always rendered
      userData={{ isPreviewOnly: true }}
      material={material}
      {...planeProperties}
    />
  );
}
