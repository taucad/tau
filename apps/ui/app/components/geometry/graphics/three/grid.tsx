import React from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { InfiniteGrid } from '#components/geometry/graphics/three/react/infinite-grid.js';
import { resolveInfiniteGridFrame } from '#components/geometry/graphics/three/utils/infinite-grid-frame.js';
import {
  infiniteGridColorDarkMode,
  infiniteGridColorHighContrastDarkMode,
  infiniteGridColorHighContrastLightMode,
  infiniteGridColorLightMode,
  infiniteGridOpacity,
  infiniteGridOpacityHighContrast,
} from '#components/geometry/graphics/three/overlay-colors.constants.js';
import { Theme, useTheme } from '#hooks/use-theme.js';
import { useGraphicsSelector, useRenderFrame } from '#hooks/use-graphics.js';

/**
 * Grid component that renders the infinite grid using sizes from the graphics machine
 * and handles theme-aware color selection and coordinate system orientation.
 * Uses GraphicsProvider context for per-view state.
 */
export const Grid = React.memo(() => {
  const gridSizes = useGraphicsSelector((state) => state.context.gridSizes);
  const cameraVisibleSpan = useGraphicsSelector((state) => state.context.cameraVisibleSpan);
  const renderFrame = useRenderFrame();
  const upDirection = useGraphicsSelector((state) => state.context.upDirection);
  const { theme, isHighContrast } = useTheme();
  const { invalidate } = useThree();

  React.useEffect(() => {
    invalidate();
  }, [invalidate]);

  const gridColor = React.useMemo(
    () =>
      new THREE.Color(
        isHighContrast
          ? theme === Theme.LIGHT
            ? infiniteGridColorHighContrastLightMode
            : infiniteGridColorHighContrastDarkMode
          : theme === Theme.LIGHT
            ? infiniteGridColorLightMode
            : infiniteGridColorDarkMode,
      ),
    [isHighContrast, theme],
  );

  // Calculate grid axes based on the up direction
  // x: X-up (1,0,0) -> grid on YZ plane -> 'zyx'
  // y: Y-up (0,1,0) -> grid on XZ plane -> 'xzy'
  // z: Z-up (0,0,1) -> grid on XY plane -> 'xyz'
  const axes = upDirection === 'x' ? 'zyx' : upDirection === 'y' ? 'xzy' : 'xyz';

  // Memoize materialProperties to prevent InfiniteGrid from recreating its
  // ShaderMaterial on every Grid re-render (the inline object would be a new reference each time).
  const materialProperties = React.useMemo(() => {
    const gridFrame = resolveInfiniteGridFrame({
      axes,
      cameraVisibleSpanMeters: cameraVisibleSpan,
      largeSizeMeters: gridSizes.largeSize,
      renderFrame,
      smallSizeMeters: gridSizes.smallSize,
    });

    return {
      ...gridFrame,
      color: gridColor,
      lineOpacity: isHighContrast ? infiniteGridOpacityHighContrast : infiniteGridOpacity,
    };
  }, [axes, cameraVisibleSpan, gridSizes, gridColor, isHighContrast, renderFrame]);

  return <InfiniteGrid axes={axes} materialProperties={materialProperties} />;
});
