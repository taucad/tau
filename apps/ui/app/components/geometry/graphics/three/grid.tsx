import React from 'react';
import { useSelector } from '@xstate/react';
import { InfiniteGrid } from '~/components/geometry/graphics/three/infinite-grid.js';
import { graphicsActor } from '~/routes/builds_.$id/graphics-actor.js';

/**
 * Grid component that renders the infinite grid using sizes from the graphics machine
 */
export const Grid = React.memo(() => {
  const gridSizes = useSelector(graphicsActor, (state) => state.context.gridSizes);

  return <InfiniteGrid smallSize={gridSizes.smallSize} largeSize={gridSizes.largeSize} />;
});
