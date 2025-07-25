import React from 'react';
import { useSelector } from '@xstate/react';
import * as THREE from 'three';
import { Theme, useTheme } from 'remix-themes';
import { InfiniteGrid } from '~/components/geometry/graphics/three/infinite-grid.js';
import { graphicsActor } from '~/routes/builds_.$id/graphics-actor.js';

/**
 * Grid component that renders the infinite grid using sizes from the graphics machine
 * and handles theme-aware color selection
 */
export const Grid = React.memo(() => {
  const gridSizes = useSelector(graphicsActor, (state) => state.context.gridSizes);
  const [theme] = useTheme();

  // Calculate theme-aware grid color
  const gridColor = React.useMemo(
    () => (theme === Theme.LIGHT ? new THREE.Color('lightgrey') : new THREE.Color('grey')),
    [theme],
  );

  return <InfiniteGrid smallSize={gridSizes.smallSize} largeSize={gridSizes.largeSize} color={gridColor} />;
});
