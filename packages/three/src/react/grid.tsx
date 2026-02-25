import React from 'react';
import * as THREE from 'three';
import { InfiniteGrid } from '#react/infinite-grid.js';
import { useViewerStore } from '#react/stores/store-context.js';

/**
 * Grid component that renders the infinite grid using sizes from the viewer store
 * and handles theme-aware color selection and coordinate system orientation.
 */
export const Grid = React.memo((): React.JSX.Element => {
  const gridSizes = useViewerStore((state) => state.gridSizes);
  const upDirection = useViewerStore((state) => state.upDirection);
  const theme = useViewerStore((state) => state.theme);

  const gridColor = React.useMemo(
    () => (theme === 'light' ? new THREE.Color('lightgrey') : new THREE.Color('grey')),
    [theme],
  );

  // x: X-up (1,0,0) -> grid on YZ plane -> 'zyx'
  // y: Y-up (0,1,0) -> grid on XZ plane -> 'xzy'
  // z: Z-up (0,0,1) -> grid on XY plane -> 'xyz'
  const axes = upDirection === 'x' ? ('zyx' as const) : upDirection === 'y' ? ('xzy' as const) : ('xyz' as const);

  const materialProperties = React.useMemo(
    () => ({ smallSize: gridSizes.smallSize, largeSize: gridSizes.largeSize, color: gridColor }),
    [gridSizes.smallSize, gridSizes.largeSize, gridColor],
  );

  return <InfiniteGrid axes={axes} materialProperties={materialProperties} />;
});
