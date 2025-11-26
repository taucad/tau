import React from 'react';
import { useSelector } from '@xstate/react';
import * as THREE from 'three';
import { Theme, useTheme } from 'remix-themes';
import { InfiniteGrid } from '#components/geometry/graphics/three/react/infinite-grid.js';
import { useBuild } from '#hooks/use-build.js';

/**
 * Grid component that renders the infinite grid using sizes from the graphics machine
 * and handles theme-aware color selection and coordinate system orientation.
 */
export const Grid = React.memo(() => {
  const { graphicsRef: graphicsActor } = useBuild();
  const gridSizes = useSelector(graphicsActor, (state) => state.context.gridSizes);
  const upDirection = useSelector(graphicsActor, (state) => state.context.upDirection);
  const [theme] = useTheme();

  // Calculate theme-aware grid color
  const gridColor = React.useMemo(
    () => (theme === Theme.LIGHT ? new THREE.Color('lightgrey') : new THREE.Color('grey')),
    [theme],
  );

  // Calculate grid axes based on the up direction
  // x: X-up (1,0,0) -> grid on YZ plane -> 'zyx'
  // y: Y-up (0,1,0) -> grid on XZ plane -> 'xzy'
  // z: Z-up (0,0,1) -> grid on XY plane -> 'xyz'
  const axes = upDirection === 'x' ? ('zyx' as const) : upDirection === 'y' ? ('xzy' as const) : ('xyz' as const);

  return (
    <InfiniteGrid
      axes={axes}
      materialProperties={{ smallSize: gridSizes.smallSize, largeSize: gridSizes.largeSize, color: gridColor }}
    />
  );
});
