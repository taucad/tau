import React, { useEffect, useState, useRef } from 'react';
import type { ReactNode } from 'react';
import type { Geometry2D } from '~/types/cad.types.js';

type Viewbox = {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  width: number;
  height: number;
};

const range = (start: number, end: number, step = 1): number[] => {
  const result: number[] = [];
  for (let i = start; i < end; i += step) {
    result.push(i);
  }

  return result;
};

type SvgGridProps = {
  readonly viewbox: Viewbox;
};

function SvgGrid({ viewbox }: SvgGridProps): React.ReactElement {
  const { xMin, yMin, xMax, yMax, width, height } = viewbox;

  const gridStep = 10 ** (Math.ceil(Math.log10(Math.max(width, height))) - 2);

  const xGrid = range(Math.floor(xMin / gridStep) * gridStep, Math.ceil(xMax / gridStep) * gridStep, gridStep);
  const yGrid = range(Math.floor(yMin / gridStep) * gridStep, Math.ceil(yMax / gridStep) * gridStep, gridStep);

  const grid = [
    ...xGrid.map((x) => (
      <line key={`x${x}`} x1={x} y1={yMin} x2={x} y2={yMax} vectorEffect="non-scaling-stroke" strokeWidth="0.5" />
    )),
    ...yGrid.map((y) => (
      <line key={`y${y}`} x1={xMin} y1={y} x2={xMax} y2={y} vectorEffect="non-scaling-stroke" strokeWidth="0.5" />
    )),
  ];

  return (
    <>
      {grid}
      <line x1={xMin} y1={0} x2={xMax} y2={0} vectorEffect="non-scaling-stroke" strokeWidth="2" />
      <line x1={0} y1={yMin} x2={0} y2={yMax} vectorEffect="non-scaling-stroke" strokeWidth="2" />
    </>
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

type ShapePathProps = {
  readonly shape: Geometry2D;
};

function ShapePath({ shape }: ShapePathProps): React.ReactElement {
  return (
    <path
      d={shape.paths.flat(Infinity).join(' ')}
      strokeDasharray={dashArray(shape.strokeType)}
      vectorEffect="non-scaling-stroke"
      style={{ stroke: shape.color }}
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
  readonly defaultColor?: string;
  readonly children?: ReactNode;
};

function SvgWindow({ viewbox, enableGrid, defaultColor, children }: SvgWindowProps): React.ReactElement {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [clientRect, setClientRect] = useState<DOMRect | undefined>(undefined);
  const [adaptedViewbox, setAdaptedViewbox] = useState<Viewbox>(viewbox);

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

    // We change the viewbox to fill the canvas while keeping the
    // coordinate system

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

  return (
    <div ref={canvasRef} className="flex h-full w-full flex-1 bg-background">
      <RawCanvas viewbox={adaptedViewbox} enableGrid={enableGrid} defaultColor={defaultColor}>
        {children}
      </RawCanvas>
    </div>
  );
}

type RawCanvasProps = {
  readonly viewbox: Viewbox;
  readonly enableGrid?: boolean;
  readonly defaultColor?: string;
  readonly children?: ReactNode;
};

function RawCanvas({ viewbox, enableGrid, defaultColor, children }: RawCanvasProps): React.ReactElement {
  return (
    <svg
      viewBox={stringifyViewbox(viewbox)}
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      className="h-full max-h-screen w-full max-w-screen bg-background [&>#raw-canvas]:stroke-foreground [&>line]:stroke-muted-foreground/20"
      preserveAspectRatio="xMidYMid meet"
    >
      {enableGrid ? <SvgGrid viewbox={viewbox} /> : null}
      <g stroke={defaultColor} id="raw-canvas" vectorEffect="non-scaling-stroke" fill="none">
        {children}
      </g>
    </svg>
  );
}

type SvgViewerProps = {
  readonly shapes: Geometry2D | Geometry2D[];
  readonly enableGrid?: boolean;
  readonly enableRawWindow?: boolean;
  readonly defaultColor?: string;
};

export function SvgViewer({
  shapes: shapeOrShapes,
  enableGrid = true,
  enableRawWindow = false,
  defaultColor,
}: SvgViewerProps): ReactNode {
  const Window = enableRawWindow ? RawCanvas : SvgWindow;

  if (Array.isArray(shapeOrShapes)) {
    const viewbox = mergeViewboxes(shapeOrShapes.map((s) => s.viewbox));
    return (
      <Window viewbox={viewbox} enableGrid={enableGrid} defaultColor={defaultColor}>
        {shapeOrShapes.map((s) => {
          return <ShapePath key={s.name} shape={s} />;
        })}
      </Window>
    );
  }

  return (
    <Window viewbox={parseViewbox(shapeOrShapes.viewbox)} enableGrid={enableGrid} defaultColor={defaultColor}>
      <ShapePath shape={shapeOrShapes} />
    </Window>
  );
}
