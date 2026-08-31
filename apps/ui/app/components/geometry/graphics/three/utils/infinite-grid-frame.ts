import type { RenderFrame } from '@taucad/spatial';

type GridAxes = 'xyz' | 'xzy' | 'zyx';
type InfiniteGridFrame = Readonly<{
  gridDistance: number;
  largePhase: readonly [number, number];
  largeSize: number;
  planeOffset: number;
  smallPhase: readonly [number, number];
  smallSize: number;
}>;

/** Camera-visible spans covered by the retained grid proxy in each tangent direction. */
export const infiniteGridProxyDistanceVisibleSpans = 20;

/** Radial fade band in normalized proxy coordinates, shared by GLSL and TSL. */
export const infiniteGridFadeStartRatio = 0.05;
export const infiniteGridFadeEndRatio = 0.2;

/** Physical visible-span radius at which the authored grid is fully transparent. */
export const infiniteGridFadeEndVisibleSpans = infiniteGridProxyDistanceVisibleSpans * infiniteGridFadeEndRatio;

const positiveModulo = (value: number, divisor: number): number => ((value % divisor) + divisor) % divisor;

const tangentAxesByGrid = {
  xyz: [0, 1],
  xzy: [0, 2],
  zyx: [2, 1],
} as const satisfies Record<GridAxes, readonly [0 | 1 | 2, 0 | 1 | 2]>;

const normalAxisByGrid = { xyz: 2, xzy: 1, zyx: 0 } as const satisfies Record<GridAxes, 0 | 1 | 2>;

/** Resolve physical grid state into the small render-local contract consumed by both shaders. */
export const resolveInfiniteGridFrame = ({
  axes,
  cameraVisibleSpanMeters,
  largeSizeMeters,
  renderFrame,
  smallSizeMeters,
}: {
  readonly axes: GridAxes;
  readonly cameraVisibleSpanMeters: number;
  readonly largeSizeMeters: number;
  readonly renderFrame: RenderFrame;
  readonly smallSizeMeters: number;
}): InfiniteGridFrame => {
  const { metersPerRenderUnit, originMeters } = renderFrame;
  const tangentAxes = tangentAxesByGrid[axes];
  const phase = (spacingMeters: number): readonly [number, number] => [
    positiveModulo(originMeters[tangentAxes[0]], spacingMeters) / spacingMeters,
    positiveModulo(originMeters[tangentAxes[1]], spacingMeters) / spacingMeters,
  ];

  return {
    gridDistance: (cameraVisibleSpanMeters / metersPerRenderUnit) * infiniteGridProxyDistanceVisibleSpans,
    largePhase: phase(largeSizeMeters),
    largeSize: largeSizeMeters / metersPerRenderUnit,
    planeOffset: -originMeters[normalAxisByGrid[axes]] / metersPerRenderUnit,
    smallPhase: phase(smallSizeMeters),
    smallSize: smallSizeMeters / metersPerRenderUnit,
  } as const;
};
