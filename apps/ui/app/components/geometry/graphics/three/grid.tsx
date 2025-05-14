import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { InfiniteGrid } from '~/components/geometry/graphics/three/infinite-grid.js';
import { useGraphics } from '~/components/geometry/graphics/graphics-context.js';

// Grid size calculation constants
export const gridSizeConstants = {
  // Coefficient for the grid size calculation to fine-tune the result (lower = larger grid)
  baseGridSizeCoefficient: 5,
  // Threshold for rounding to 1× or 5× powers of 10
  roundingThreshold: Math.sqrt(10),
  // Metric to imperial conversion factor (1 inch = 25.4mm)
  metricToImperial: 25.4,
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
  // Only subscribe to the specific properties you need
  const cameraPosition = useThree((state) => state.camera.position.length());
  const cameraFov = useThree((state) => (state.camera instanceof THREE.PerspectiveCamera ? state.camera.fov : 75));
  const { gridUnitSystem, gridUnitFactor } = useGraphics();

  return useMemo(() => {
    // Calculate grid sizes based on these specific values
    const visibleWidthAtDistance = 2 * cameraPosition * Math.tan(THREE.MathUtils.degToRad(cameraFov / 2));

    // Set base grid size as fraction of visible width (e.g. 1/20th)
    // This ensures grid size is proportional to what's visible in the viewport
    let baseGridSize = visibleWidthAtDistance / gridSizeConstants.baseGridSizeCoefficient;

    // Adjust grid size only for imperial units
    if (gridUnitSystem === 'imperial') {
      // Convert from mm to inches for calculations, and adjust for unit factor
      // For inches, factor = 1, for feet, factor = 12
      baseGridSize /= gridSizeConstants.metricToImperial;
    }

    // Find appropriate power of 10 for clean grid intervals
    const exponent = Math.floor(Math.log10(baseGridSize));
    const mantissa = baseGridSize / 10 ** exponent;

    // Round to nice numbers (1, 2, or 5 times power of 10)
    const largeSize =
      mantissa < gridSizeConstants.roundingThreshold
        ? 10 ** exponent // ≈ 2.236
        : 5 * 10 ** exponent;

    // Ensure minimum grid size
    const safeSize = Math.max(1, largeSize);
    const smallSize = safeSize / 10;

    return {
      smallSize,
      largeSize: safeSize,
      effectiveSize: baseGridSize,
      baseSize: cameraPosition,
      zoomFactor: 1 / currentZoom,
      fov: cameraFov,
    };
  }, [cameraPosition, cameraFov, currentZoom, gridUnitSystem]);
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
  const { setGridSizes, gridSizes, gridUnitFactor, gridUnitSystem } = useGraphics();
  const previousGridSizesRef = React.useRef(calculatedGridSizes);
  const previousUnitSystemRef = React.useRef(gridUnitSystem);
  const previousUnitFactorRef = React.useRef(gridUnitFactor);

  // Update when grid sizes change significantly or when unit system/factor changes
  React.useEffect(() => {
    // Check if the difference is significant enough to update or if unit system/factor changed
    const unitSystemChanged = previousUnitSystemRef.current !== gridUnitSystem;
    const unitFactorChanged = previousUnitFactorRef.current !== gridUnitFactor;
    const sizeChangedSignificantly =
      Math.abs(previousGridSizesRef.current.smallSize - calculatedGridSizes.smallSize) > 0.001 ||
      Math.abs(previousGridSizesRef.current.largeSize - calculatedGridSizes.largeSize) > 0.001;

    if (sizeChangedSignificantly || unitSystemChanged || unitFactorChanged) {
      previousGridSizesRef.current = calculatedGridSizes;
      previousUnitSystemRef.current = gridUnitSystem;
      previousUnitFactorRef.current = gridUnitFactor;

      // Update with the calculated grid sizes based on the current unit system
      setGridSizes(calculatedGridSizes);
    }
  }, [calculatedGridSizes, setGridSizes, gridUnitFactor, gridUnitSystem]);

  // Render the grid using the current grid sizes
  return <InfiniteGrid smallSize={gridSizes.smallSize} largeSize={gridSizes.largeSize} />;
}

/**
 * A memoized Grid component
 */
export const Grid = React.memo(GridComponent);
