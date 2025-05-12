import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { InfiniteGrid } from '@/components/geometry/graphics/three/infinite-grid.js';
import { useGraphics } from '@/components/geometry/graphics/graphics-context.js';

// Grid size calculation constants
export const gridSizeConstants = {
  // Coefficient for the grid size calculation to fine-tune the result (lower = larger grid)
  baseGridSizeCoefficient: 5,
  // Threshold for rounding to 1× or 5× powers of 10
  roundingThreshold: Math.sqrt(10),
} as const;

export type GridSizes = {
  smallSize: number;
  largeSize: number;
  effectiveSize?: number;
  baseSize?: number;
  zoomFactor?: number;
  fov?: number;
};

/**
 * Hook to calculate grid sizes based on camera properties
 */
export function useGridSizes(currentZoom: number): GridSizes {
  const camera = useThree((state) => state.camera);

  return useMemo(() => {
    // Get current camera distance
    const cameraDistance = camera.position.length();

    // Get current FOV
    const { fov } = camera as THREE.PerspectiveCamera;

    // Calculate the visible width at the center of the view
    // This is the key formula: 2 * distance * tan(fov/2)
    const visibleWidthAtDistance = 2 * cameraDistance * Math.tan(THREE.MathUtils.degToRad(fov / 2));

    // Set base grid size as fraction of visible width (e.g. 1/20th)
    // This ensures grid size is proportional to what's visible in the viewport
    const baseGridSize = visibleWidthAtDistance / gridSizeConstants.baseGridSizeCoefficient;

    // Find appropriate power of 10 for clean grid intervals
    const exponent = Math.floor(Math.log10(baseGridSize));
    const mantissa = baseGridSize / 10 ** exponent;

    // Round to nice numbers (1, 2, or 5 times power of 10)
    let largeSize;
    // eslint-disable-next-line unicorn/prefer-ternary -- this is more readable
    if (mantissa < gridSizeConstants.roundingThreshold) {
      // ≈ 2.236
      largeSize = 10 ** exponent;
    } else {
      largeSize = 5 * 10 ** exponent;
    }

    return {
      smallSize: largeSize / 10,
      largeSize,
      effectiveSize: baseGridSize,
      baseSize: cameraDistance,
      zoomFactor: 1 / currentZoom,
      fov,
    };
  }, [camera, currentZoom]);
}

type GridProps = {
  /**
   * Current zoom level
   */
  readonly currentZoom: number;
};

/**
 * Grid component that calculates and renders the infinite grid
 */
function GridComponent({ currentZoom }: GridProps) {
  const calculatedGridSizes = useGridSizes(currentZoom);
  const { setGridSizes, gridSizes } = useGraphics();

  // Update context with grid sizes
  React.useEffect(() => {
    setGridSizes(calculatedGridSizes);
  }, [calculatedGridSizes, setGridSizes]);

  return <InfiniteGrid smallSize={gridSizes.smallSize} largeSize={gridSizes.largeSize} />;
}

/**
 * A memoized Grid component
 */
export const Grid = React.memo(GridComponent);
