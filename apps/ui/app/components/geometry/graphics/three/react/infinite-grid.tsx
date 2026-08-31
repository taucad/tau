import { Plane } from '@react-three/drei';
import React from 'react';
import { useThree } from '@react-three/fiber';
import type { Camera, Mesh, Object3D } from 'three';
import { infiniteGridMaterialForBackend } from '#components/geometry/graphics/three/materials/infinite-grid-material.js';
import type { InfiniteGridMaterialProperties } from '#components/geometry/graphics/three/materials/infinite-grid-material.js';
import type { InfiniteGridMaterialHandle } from '#components/geometry/graphics/three/materials/infinite-grid-material.types.js';
import { useThreeGraphicsBackend } from '#components/geometry/graphics/three/three-graphics-backend-context.js';
import { useCameraRig } from '#hooks/use-graphics.js';

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
   * - 'xyz': Grid on XY plane (Z-up coordinate system, CAD/engineering)
   * - 'xzy': Grid on XZ plane (Y-up coordinate system, standard Three.js)
   * - 'zyx': Grid on ZY plane (X-up coordinate system)
   */
  readonly axes: 'xyz' | 'xzy' | 'zyx';
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
 * - **Distance-based fading**: Grid fades radially before its camera-local proxy boundary
 * - **Customizable appearance**: Configurable colors, opacity, and thickness
 * - **Performance optimized**: Uses efficient shader-based rendering
 *
 * ### Grid Orientation:
 * The grid orientation is controlled by the `axes` prop:
 * - 'xyz': Grid on XY plane (Z-up coordinate system, CAD/engineering)
 * - 'xzy': Grid on XZ plane (Y-up coordinate system, standard Three.js)
 * - 'zyx': Grid on ZY plane (X-up coordinate system)
 *
 * ### Usage:
 * ```tsx
 * <InfiniteGrid
 *   axes="xyz"
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

  const backendWeb = useThreeGraphicsBackend();
  const { gl, invalidate } = useThree();
  const cameraRig = useCameraRig();
  const meshRef = React.useRef<Mesh>(null);

  const gridHandle = React.useMemo((): InfiniteGridMaterialHandle => {
    return infiniteGridMaterialForBackend(backendWeb, { ...materialProperties, axes });
    // Intentionally omit `materialProperties`: zoom-driven size/colour updates use `applyVisualOverrides`
    // so the material is not rebuilt every camera decade (see `docs/research/webgpu-render-loop-audit.md`).
  }, [axes, backendWeb]);

  React.useLayoutEffect(() => {
    const mesh = meshRef.current;
    const renderer = gl as unknown as {
      compileAsync?: (scene: Object3D, camera: Camera) => Promise<unknown>;
    };
    const compile = renderer.compileAsync;
    const cancellation = { cancelled: false };

    if (mesh && typeof compile === 'function') {
      // async-iife: bootstrap — layout effects cannot await finite endpoint pipeline warmup.
      void (async (): Promise<void> => {
        try {
          await Promise.all([
            compile.call(renderer, mesh, cameraRig.perspectiveCamera),
            compile.call(renderer, mesh, cameraRig.orthographicCamera),
          ]);
          if (!cancellation.cancelled) {
            invalidate();
          }
        } catch (error) {
          console.error('Infinite-grid pipeline warm-up failed', error);
        }
      })();
    }

    return () => {
      cancellation.cancelled = true;
      gridHandle.material.dispose();
    };
  }, [cameraRig, gl, gridHandle, invalidate]);

  React.useEffect(() => {
    gridHandle.applyVisualOverrides({
      smallSize: materialProperties.smallSize,
      largeSize: materialProperties.largeSize,
      color: materialProperties.color,
      lineOpacity: materialProperties.lineOpacity,
      gridDistance: materialProperties.gridDistance,
      planeOffset: materialProperties.planeOffset,
      smallPhase: materialProperties.smallPhase,
      largePhase: materialProperties.largePhase,
    });
    invalidate();
  }, [
    gridHandle,
    invalidate,
    materialProperties.smallSize,
    materialProperties.largeSize,
    materialProperties.color,
    materialProperties.lineOpacity,
    materialProperties.gridDistance,
    materialProperties.planeOffset,
    materialProperties.smallPhase,
    materialProperties.largePhase,
  ]);

  return (
    <Plane
      ref={meshRef}
      frustumCulled={false} // Ensure the grid is always rendered
      material={gridHandle.material}
      {...planeProperties}
    />
  );
}
