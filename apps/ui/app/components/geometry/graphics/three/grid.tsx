import React from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { InfiniteGrid } from '#components/geometry/graphics/three/react/infinite-grid.js';
import {
  infiniteGridColorDarkMode,
  infiniteGridColorLightMode,
} from '#components/geometry/graphics/three/overlay-colors.constants.js';
import { Theme, useTheme } from '#hooks/use-theme.js';
import { useGraphicsSelector } from '#hooks/use-graphics.js';

/**
 * Grid component that renders the infinite grid using sizes from the graphics machine
 * and handles theme-aware color selection and coordinate system orientation.
 * Uses GraphicsProvider context for per-view state.
 */
export const Grid = React.memo(() => {
  const gridSizes = useGraphicsSelector((state) => state.context.gridSizes);
  const upDirection = useGraphicsSelector((state) => state.context.upDirection);
  const { theme } = useTheme();
  const { invalidate } = useThree();

  React.useEffect(() => {
    invalidate();
  }, [invalidate]);

  const gridColor = React.useMemo(
    () => new THREE.Color(theme === Theme.LIGHT ? infiniteGridColorLightMode : infiniteGridColorDarkMode),
    [theme],
  );

  // Calculate grid axes based on the up direction
  // x: X-up (1,0,0) -> grid on YZ plane -> 'zyx'
  // y: Y-up (0,1,0) -> grid on XZ plane -> 'xzy'
  // z: Z-up (0,0,1) -> grid on XY plane -> 'xyz'
  const axes = upDirection === 'x' ? 'zyx' : upDirection === 'y' ? 'xzy' : 'xyz';

  // Memoize materialProperties to prevent InfiniteGrid from recreating its
  // ShaderMaterial on every Grid re-render (the inline object would be a new reference each time).
  const materialProperties = React.useMemo(
    () => ({ smallSize: gridSizes.smallSize, largeSize: gridSizes.largeSize, color: gridColor }),
    [gridSizes.smallSize, gridSizes.largeSize, gridColor],
  );

  return <InfiniteGrid axes={axes} materialProperties={materialProperties} />;
});
