import React, { useEffect, useState, useRef, useId, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useSelector } from '@xstate/react';
import { Theme, useTheme } from 'remix-themes';
import type { GeometrySvg } from '@taucad/types';
// @ts-expect-error - no types available
import panzoom from '@panzoom/panzoom/dist/panzoom.es.js';
import type { PanzoomObject } from '@panzoom/panzoom';
import { useBuild } from '#hooks/use-build.js';

type Viewbox = {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  width: number;
  height: number;
};

type SvgGridProps = {
  readonly viewbox: Viewbox;
  readonly transform: { scale: number; x: number; y: number };
};

const gridMaxScale = 10_000;
const gridMinScale = 1e-5;
const gridStep = 0.1;

function SvgGrid({ viewbox, transform }: SvgGridProps): React.ReactElement {
  const { xMin, yMin, width, height } = viewbox;
  const { graphicsRef: graphicsActor } = useBuild();
  const gridSizes = useSelector(graphicsActor, (state) => state.context.gridSizes);
  const [theme] = useTheme();
  const id = useId();

  // Calculate theme-aware grid color
  const gridColor = React.useMemo(() => (theme === Theme.LIGHT ? 'lightgrey' : 'grey'), [theme]);

  // Grid sizes come from graphics machine (kept in-sync via controlsChanged)
  const { smallSize, largeSize } = gridSizes;

  // Align the grid to content pan/zoom by translating pattern origin by the world offset modulo the grid step.
  const { scale, x, y } = transform;
  const worldOffsetX = (-x || 0) / (scale || 1);
  const worldOffsetY = (-y || 0) / (scale || 1);

  // Keep offsets within [0, step)
  const wrapOffset = (offset: number, step: number): number => {
    if (!Number.isFinite(step) || step === 0) {
      return 0;
    }

    const m = ((offset % step) + step) % step;
    return m;
  };

  const offsetSmallX = wrapOffset(worldOffsetX, smallSize);
  const offsetSmallY = wrapOffset(worldOffsetY, smallSize);
  const offsetLargeX = wrapOffset(worldOffsetX, largeSize);
  const offsetLargeY = wrapOffset(worldOffsetY, largeSize);

  const widthScaled = width / scale;
  const heightScaled = height / scale;
  const xMinScaled = xMin / scale;
  const yMinScaled = yMin / scale;

  return (
    <>
      <defs>
        <pattern
          id={`${id}-small`}
          width={smallSize}
          height={smallSize}
          patternUnits="userSpaceOnUse"
          patternTransform={`translate(${offsetSmallX} ${offsetSmallY})`}
        >
          <path
            d={`M ${smallSize} 0 L 0 0 0 ${smallSize}`}
            fill="none"
            stroke={gridColor}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </pattern>
        <pattern
          id={`${id}-large`}
          width={largeSize}
          height={largeSize}
          patternUnits="userSpaceOnUse"
          patternTransform={`translate(${offsetLargeX} ${offsetLargeY})`}
        >
          <path
            d={`M ${largeSize} 0 L 0 0 0 ${largeSize}`}
            fill="none"
            stroke={gridColor}
            strokeWidth="4"
            vectorEffect="non-scaling-stroke"
          />
        </pattern>
      </defs>
      <rect x={xMinScaled} y={yMinScaled} width={widthScaled} height={heightScaled} fill={`url(#${id}-small)`} />
      <rect x={xMinScaled} y={yMinScaled} width={widthScaled} height={heightScaled} fill={`url(#${id}-large)`} />
    </>
  );
}

type SvgAxesProps = {
  /**
   * Viewbox of the SVG.
   */
  readonly viewbox: Viewbox;
  /**
   * Stroke width of the axes.
   * @default 8
   */
  readonly strokeWidth?: number;
  /**
   * Opacity of the axes.
   * @default 1
   */
  readonly opacity?: number;
};

/**
 * Simple 2D axes drawn from the origin (0,0) towards positive X and positive Y directions.
 * Uses the same axis colors as the 3D AxesHelper component.
 */
function SvgAxes({
  className,
  viewbox,
  strokeWidth = 2,
  opacity = 1,
}: SvgAxesProps & React.ComponentProps<'g'>): React.ReactElement {
  const xAxisColor = 'oklch(0.85 0.06 22.5)'; // Another 30% lighter, soft red (X axis)
  const yAxisColor = 'oklch(0.85 0.06 135)'; // Another 30% lighter, soft green (Y axis)

  // Make axes effectively infinite relative to current viewbox.
  // Use a very large extension based on the largest viewbox dimension.
  const baseSize = Math.max(viewbox.width, viewbox.height, 1);
  const extension = baseSize * 1000;

  // Only draw in positive directions:
  //  - X axis: from 0 to +extension (positive X)
  //  - Y axis: from 0 to -extension (SVG Y grows down, so negative is "up")
  const xEnd = extension;
  const yEnd = -extension;

  return (
    <g data-slot="axes" id="axes-2d" pointerEvents="none" strokeLinecap="round" className={className}>
      <line
        data-slot="axes-x"
        x1={0}
        y1={0}
        x2={xEnd}
        y2={0}
        stroke={xAxisColor}
        opacity={opacity}
        strokeWidth={strokeWidth}
        vectorEffect="non-scaling-stroke"
      />
      <line
        data-slot="axes-y"
        x1={0}
        y1={0}
        x2={0}
        y2={yEnd}
        stroke={yAxisColor}
        opacity={opacity}
        strokeWidth={strokeWidth}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}

function parseViewbox(viewbox?: string): Viewbox {
  if (!viewbox) {
    return { xMin: 0, yMin: 0, xMax: 0, yMax: 0, width: 0, height: 0 };
  }

  const split = viewbox.split(' ').map((v) => Number.parseFloat(v));

  if (split.length !== 4 || split.some((v) => Number.isNaN(v))) {
    throw new Error(`Invalid viewbox: ${viewbox}`);
  }

  const [x, y, width, height] = split as [number, number, number, number];

  return { xMin: x, yMin: y, xMax: x + width, yMax: y + height, width, height };
}

function mergeViewboxes(viewboxes: string[]): Viewbox {
  let xMin = Infinity;
  let yMin = Infinity;
  let xMax = -Infinity;
  let yMax = -Infinity;

  for (const box of viewboxes) {
    const parsedBox = parseViewbox(box);
    xMin = Math.min(xMin, parsedBox.xMin);
    yMin = Math.min(yMin, parsedBox.yMin);
    xMax = Math.max(xMax, parsedBox.xMax);
    yMax = Math.max(yMax, parsedBox.yMax);
  }

  return { xMin, yMin, xMax, yMax, width: xMax - xMin, height: yMax - yMin };
}

const stringifyViewbox = ({ xMin, yMin, xMax, yMax }: Viewbox): string => {
  return [xMin.toFixed(2), yMin.toFixed(2), (xMax - xMin).toFixed(2), (yMax - yMin).toFixed(2)].join(' ');
};

const dashArray = (strokeType?: string): string | undefined => {
  if (!strokeType) {
    return undefined;
  }

  if (strokeType === 'solid') {
    return undefined;
  }

  if (strokeType === 'dots') {
    return '1, 2';
  }

  if (strokeType === 'dashes') {
    return '5, 5';
  }

  return undefined;
};

type GeometryPathProps = {
  readonly geometry: GeometrySvg;
};

function GeometryPath({ geometry }: GeometryPathProps): React.ReactElement {
  return (
    <path
      data-slot="geometry"
      data-geometry-name={geometry.name}
      d={geometry.paths.flat(Infinity).join(' ')}
      strokeDasharray={dashArray(geometry.strokeType)}
      vectorEffect="non-scaling-stroke"
      style={{ stroke: geometry.color }}
    />
  );
}

const addMarginToViewbox = (viewbox: Viewbox, margin: number): Viewbox => {
  const { xMin, yMin, xMax, yMax, width, height } = viewbox;
  return {
    xMin: xMin - margin * width,
    yMin: yMin - margin * height,
    xMax: xMax + margin * width,
    yMax: yMax + margin * height,
    width: width * (1 + 2 * margin),
    height: height * (1 + 2 * margin),
  };
};

type SvgWindowProps = {
  readonly viewbox: Viewbox;
  readonly enableGrid?: boolean;
  readonly enableAxes?: boolean;
  readonly defaultColor?: string;
  readonly children?: ReactNode;
};

function SvgWindow({ viewbox, enableGrid, enableAxes, defaultColor, children }: SvgWindowProps): React.ReactElement {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [clientRect, setClientRect] = useState<DOMRect | undefined>(undefined);
  const [adaptedViewbox, setAdaptedViewbox] = useState<Viewbox>(viewbox);
  const panzoomRef = useRef<PanzoomObject | undefined>(undefined);
  const { graphicsRef: graphicsActor } = useBuild();
  const [transform, setTransform] = useState<{ scale: number; x: number; y: number }>({ scale: 1, x: 0, y: 0 });

  // Use ResizeObserver instead of window resize event
  useEffect(() => {
    const canvas = canvasRef.current;
    const updateRect = (): void => {
      if (canvas) {
        setClientRect(canvas.getBoundingClientRect());
      }
    };

    // Initial measurement
    updateRect();

    // Set up ResizeObserver to detect any size changes to the element
    const resizeObserver = new ResizeObserver(() => {
      updateRect();
    });

    if (canvas) {
      resizeObserver.observe(canvas);
    }

    return () => {
      if (canvas) {
        resizeObserver.unobserve(canvas);
      }

      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!clientRect) {
      return;
    }

    const marginedViewbox = addMarginToViewbox(viewbox, 0.1);

    const { width: rectWidth, height: rectHeight } = clientRect;
    const { width: boxWidth, height: boxHeight } = marginedViewbox;

    const rectRatio = rectWidth / rectHeight;
    const boxRatio = boxWidth / boxHeight;

    // First we decide which side we need to add padding to
    const paddingSide = rectRatio > boxRatio ? 'width' : 'height';

    if (paddingSide === 'width') {
      const padding = rectRatio * boxHeight - boxWidth;
      setAdaptedViewbox({
        ...marginedViewbox,
        xMin: marginedViewbox.xMin - padding / 2,
        xMax: marginedViewbox.xMax + padding / 2,
        width: marginedViewbox.width + padding,
      });
    } else {
      const padding = boxWidth / rectRatio - boxHeight;
      setAdaptedViewbox({
        ...marginedViewbox,
        yMin: marginedViewbox.yMin - padding / 2,
        yMax: marginedViewbox.yMax + padding / 2,
        height: marginedViewbox.height + padding,
      });
    }
  }, [viewbox, clientRect]);

  // Create onChange handler as useCallback with explicit dependencies
  const onChange = useCallback(
    (instance: PanzoomObject, currentAdaptedViewbox: Viewbox): void => {
      const scale = instance.getScale();
      // Negate x,y to match the reversed transform
      setTransform({ scale, x: 0, y: 0 });

      // Compute 2D-equivalent camera position from scale and current adapted viewbox
      const { height: boxHeight } = currentAdaptedViewbox;
      const visibleHeightWorld = boxHeight / scale;

      graphicsActor.send({
        type: 'controlsChanged',
        zoom: scale,
        position: visibleHeightWorld,
        fov: 60, // FoV is irrelevant for 2D
      });
    },
    [graphicsActor],
  );

  // Create onWheel handler as useCallback with explicit dependencies
  const onWheel = useCallback(
    (event: WheelEvent, instance: PanzoomObject, container: HTMLDivElement, currentAdaptedViewbox: Viewbox): void => {
      // Keep zoom centered around the world origin [0,0]
      event.preventDefault();

      const svg = container.querySelector('svg');
      if (!svg) {
        return;
      }

      const rect = svg.getBoundingClientRect();
      const { height: boxHeight, xMin, yMin } = currentAdaptedViewbox;

      // Convert world origin [0,0] to pre-transform SVG pixel coordinates
      const unitsToPx = rect.height / boxHeight;
      const originPxX = -xMin * unitsToPx;
      const originPxY = -yMin * unitsToPx;

      // With transform 'translate(-x,-y) scale(s)', the screen position is:
      // screenX = rect.left + (originPxX - x) * s
      // screenY = rect.top  + (originPxY - y) * s
      const { x, y } = instance.getPan();
      const scale = instance.getScale();
      const clientX = rect.left + (originPxX - x) * scale;
      const clientY = rect.top + (originPxY - y) * scale;

      // Compute next scale using step and clamp to min/max
      const {
        minScale = gridMinScale,
        maxScale = gridMaxScale,
        step = gridStep,
      } = instance.getOptions() as {
        minScale?: number;
        maxScale?: number;
        step?: number;
      };
      const direction = event.deltaY < 0 ? 1 : -1;
      const factor = direction > 0 ? 1 + step : 1 / (1 + step);
      const nextScale = Math.min(maxScale, Math.max(minScale, scale * factor));

      instance.zoomToPoint(nextScale, { clientX, clientY });
    },
    [],
  );

  // Initialize Panzoom on the content group once mounted
  useEffect(() => {
    const container = canvasRef.current;
    if (!container) {
      return;
    }

    const contentGroup = container.querySelector<SVGGElement>('#panzoom-root');
    if (!contentGroup) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- Panzoom ES module
    const instance = panzoom(contentGroup, {
      maxScale: gridMaxScale,
      animate: true,
      minScale: gridMinScale,
      step: gridStep,
      canvas: true, // Bind pointerdown on parent so drag works anywhere (including grid/background)
      cursor: 'auto',
      setTransform(_element: SVGElement, { scale }: { scale: number; x: number; y: number }): void {
        instance.setStyle('transform', `scale(${scale})`);
      },
    }) as PanzoomObject;
    panzoomRef.current = instance;

    return () => {
      instance.destroy();
      panzoomRef.current = undefined;
    };
  }, []);

  // Set up event listeners separately from initialization
  useEffect(() => {
    const container = canvasRef.current;
    const instance = panzoomRef.current;
    if (!container || !instance) {
      return;
    }

    const contentGroup = container.querySelector<SVGGElement>('#panzoom-root');
    if (!contentGroup) {
      return;
    }

    const handleWheel = (event: WheelEvent): void => {
      onWheel(event, instance, container, adaptedViewbox);
    };

    const handleChange = (): void => {
      onChange(instance, adaptedViewbox);
    };

    // Bind wheel to the container parent for better control
    container.addEventListener('wheel', handleWheel, { passive: false });
    contentGroup.addEventListener('panzoomchange', handleChange as EventListener);
    contentGroup.addEventListener('panzoomzoom', handleChange as EventListener);

    return () => {
      container.removeEventListener('wheel', handleWheel);
      contentGroup.removeEventListener('panzoomchange', handleChange as EventListener);
      contentGroup.removeEventListener('panzoomzoom', handleChange as EventListener);
    };
  }, [adaptedViewbox, onChange, onWheel]);

  return (
    <div ref={canvasRef} className="flex h-full w-full flex-1 touch-none overflow-hidden bg-background">
      <RawCanvas
        viewbox={adaptedViewbox}
        enableGrid={enableGrid}
        enableAxes={enableAxes}
        defaultColor={defaultColor}
        transform={transform}
      >
        {children}
      </RawCanvas>
    </div>
  );
}

type RawCanvasProps = {
  readonly viewbox: Viewbox;
  readonly enableGrid?: boolean;
  readonly enableAxes?: boolean;
  readonly defaultColor?: string;
  readonly children?: ReactNode;
  readonly transform?: { scale: number; x: number; y: number };
};

function RawCanvas({
  viewbox,
  enableGrid,
  enableAxes,
  defaultColor,
  transform,
  children,
}: RawCanvasProps): React.ReactElement {
  const safeTransform = transform ?? { scale: 1, x: 0, y: 0 };

  return (
    <svg
      viewBox={stringifyViewbox(viewbox)}
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      className="h-full w-full bg-background [&>line]:stroke-muted-foreground/20"
      preserveAspectRatio="xMidYMid meet"
    >
      <g id="panzoom-root">
        {enableGrid ? <SvgGrid viewbox={viewbox} transform={safeTransform} /> : null}
        {enableAxes ? <SvgAxes viewbox={viewbox} /> : null}
        <g
          stroke={defaultColor}
          id="raw-canvas"
          vectorEffect="non-scaling-stroke"
          fill="none"
          className="stroke-foreground"
        >
          {children}
        </g>
      </g>
    </svg>
  );
}

type SvgViewerProps = {
  /**
   * The geometries to display.
   */
  readonly geometries: GeometrySvg[];
  /**
   * Whether to display the grid.
   * @default true
   */
  readonly enableGrid?: boolean;
  /**
   * Whether to display the axes.
   * @default true
   */
  readonly enableAxes?: boolean;
  /**
   * Whether to render without a pan/zoom window.
   * @default false
   */
  readonly enableRawWindow?: boolean;
  /**
   * The default color to use for the geometries.
   * @default '#000000'
   */
  readonly defaultColor?: string;
};

export function SvgViewer({
  geometries,
  enableGrid = true,
  enableRawWindow = false,
  enableAxes = true,
  defaultColor,
}: SvgViewerProps): ReactNode {
  const Viewer2D = enableRawWindow ? RawCanvas : SvgWindow;
  const viewbox = mergeViewboxes(geometries.map((s) => s.viewbox));

  return (
    <Viewer2D viewbox={viewbox} enableGrid={enableGrid} enableAxes={enableAxes} defaultColor={defaultColor}>
      {geometries.map((s) => {
        return <GeometryPath key={s.name} geometry={s} />;
      })}
    </Viewer2D>
  );
}
