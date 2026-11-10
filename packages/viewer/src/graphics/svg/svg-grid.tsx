import { useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useViewerEnvironment } from '#environment/viewer-environment.jsx';
import {
  infiniteGridLargeThickness,
  infiniteGridSmallThickness,
  resolveInfiniteGridTint,
} from '#graphics/three/overlay-colors.constants.js';
import { resolveViewerPixelRatio } from '#graphics/three/utils/device-tier.js';

/** The 3D grid shader discards fragments below this alpha (`alphaThreshold` in the grid materials). */
const alphaThreshold = 0.01;

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

/**
 * Coverage of one grid axis at a pixel centre: the 3D grid shader's `pristineGrid` for a single axis, term for term
 * (`infinite-grid-material.ts`). `svg-grid-parity.browser.test.tsx` fails when the two drift.
 *
 * @param cells - The pixel centre's distance from a grid line, in cells.
 * @param cellsPerPixel - The shader's `uvDeriv`: cells covered by one framebuffer pixel.
 * @param thickness - The line width in framebuffer pixels.
 * @returns The line coverage, 0 to 1.
 */
export const gridLineCoverage = (cells: number, cellsPerPixel: number, thickness: number): number => {
  const targetWidth = clamp(cellsPerPixel * thickness, 0, 1);
  const drawWidth = clamp(targetWidth, cellsPerPixel, 0.5);
  const antiAlias = Math.max(cellsPerPixel, 1e-6) * 1.5;
  const lineDistance = 1 - Math.abs((cells - Math.floor(cells)) * 2 - 1);
  const edge = clamp((drawWidth + antiAlias - lineDistance) / (2 * antiAlias), 0, 1);
  const line = edge * edge * (3 - 2 * edge) * clamp(targetWidth / drawWidth, 0, 1);
  return line + (targetWidth - line) * clamp(cellsPerPixel * 2 - 1, 0, 1);
};

type AxisGrid = {
  /** The axis length in framebuffer pixels. */
  readonly length: number;
  /** The origin's position along the axis, in framebuffer pixels. */
  readonly origin: number;
  readonly smallCell: number;
  readonly largeCell: number;
};

/**
 * Minor and major coverage along one axis, combined as the shader combines them: `mix(small, 1, large)`.
 *
 * @param grid - The axis length, the origin's position and the cell sizes, in framebuffer pixels.
 * @returns The coverage of each pixel along the axis.
 */
const axisCoverage = ({ length, origin, smallCell, largeCell }: AxisGrid): Float32Array => {
  const coverage = new Float32Array(length);
  for (let pixel = 0; pixel < length; pixel++) {
    const offset = pixel + 0.5 - origin;
    const small = gridLineCoverage(offset / smallCell, 1 / smallCell, infiniteGridSmallThickness);
    const large = gridLineCoverage(offset / largeCell, 1 / largeCell, infiniteGridLargeThickness);
    coverage[pixel] = small + (1 - small) * large;
  }
  return coverage;
};

type SvgGridProps = {
  /** The viewport size in CSS pixels. */
  readonly width: number;
  readonly height: number;
  /** Where the drawing's origin sits in the viewport, in CSS pixels. */
  readonly originX: number;
  readonly originY: number;
  /** Minor and major cell sizes in CSS pixels. */
  readonly smallCell: number;
  readonly largeCell: number;
};

/**
 * The SVG viewer's grid: the 3D viewer's grid lines, evaluated per framebuffer pixel on a 2D canvas behind the drawing.
 *
 * @param props - The viewport, the origin's position and the cell sizes.
 * @returns The grid canvas.
 */
export function SvgGrid({ width, height, originX, originY, smallCell, largeCell }: SvgGridProps): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { colorScheme, isHighContrast } = useViewerEnvironment();
  const { color, opacity } = resolveInfiniteGridTint({ colorScheme, isHighContrast });

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || !(smallCell > 0) || !(largeCell > 0)) {
      return;
    }
    // The 3D canvas draws at this ratio too, so a line is the same number of device pixels wide in both viewers.
    const ratio = resolveViewerPixelRatio() || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    const cells = { smallCell: smallCell * ratio, largeCell: largeCell * ratio };
    const columns = axisCoverage({ length: canvas.width, origin: originX * ratio, ...cells });
    const rows = axisCoverage({ length: canvas.height, origin: originY * ratio, ...cells });
    // Source-over of one colour unions the alphas, which is the shader's `mix(x, 1, y)` across the two axes.
    for (const [index, coverage] of columns.entries()) {
      if (coverage * opacity >= alphaThreshold) {
        context.globalAlpha = coverage;
        context.fillRect(index, 0, 1, canvas.height);
      }
    }
    for (const [index, coverage] of rows.entries()) {
      if (coverage * opacity >= alphaThreshold) {
        context.globalAlpha = coverage;
        context.fillRect(0, index, canvas.width, 1);
      }
    }
  }, [color, opacity, width, height, originX, originY, smallCell, largeCell]);

  return (
    <canvas
      ref={canvasRef}
      data-slot='grid'
      aria-hidden='true'
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity, pointerEvents: 'none' }}
    />
  );
}
