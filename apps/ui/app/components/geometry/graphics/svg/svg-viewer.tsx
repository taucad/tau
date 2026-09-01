import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import type { ReactNode, RefObject } from 'react';
import type { PanzoomObject } from '@panzoom/panzoom';
import type { GeometrySvg } from '@taucad/types';
// @ts-expect-error - no types available for the ESM build.
import panzoom from '@panzoom/panzoom/dist/panzoom.es.js';
import { usePanzoomReset } from '#components/geometry/graphics/svg/use-panzoom-reset.js';
import { axesColors } from '#constants/color.constants.js';
import { Theme, useTheme } from '#hooks/use-theme.js';
import { useGraphics, useGraphicsSelector } from '#hooks/use-graphics.js';
import { cn } from '@taucad/ui/utils/cn';

type Viewbox = {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  width: number;
  height: number;
};

type ParsedSvgDocument = {
  innerHtml: string;
  viewBox: Viewbox;
};

type ParsedSvgResult =
  | {
      data: ParsedSvgDocument;
      error: undefined;
    }
  | {
      data: undefined;
      error: Error;
    };

type SvgTransform = {
  scale: number;
  x: number;
  y: number;
};

const gridMaxScale = 10_000;
const gridMinScale = 1e-5;
const gridStep = 0.1;
const initialViewBoxMargin = 0.1;
const fallbackViewBox: Viewbox = { xMin: -10, yMin: -10, xMax: 10, yMax: 10, width: 20, height: 20 };
const drawingElementSelector = 'path,line,polyline,polygon,circle,ellipse,rect';
const nonScalingStroke = 'non-scaling-stroke';

const getAttributeValue = (element: Element, name: string): string | undefined =>
  element.getAttribute(name) ?? undefined;

const createViewBox = ({ xMin, yMin, width, height }: Omit<Viewbox, 'xMax' | 'yMax'>): Viewbox => ({
  xMin,
  yMin,
  xMax: xMin + width,
  yMax: yMin + height,
  width,
  height,
});

const parseViewBox = (value: string | undefined): Viewbox | undefined => {
  if (!value) {
    return undefined;
  }

  const [xMin, yMin, width, height] = value
    .trim()
    .split(/[\s,]+/)
    .map((part) => Number.parseFloat(part));

  if (
    xMin === undefined ||
    yMin === undefined ||
    width === undefined ||
    height === undefined ||
    !Number.isFinite(xMin) ||
    !Number.isFinite(yMin) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return undefined;
  }

  return createViewBox({ xMin, yMin, width, height });
};

const stringifyViewBox = ({ xMin, yMin, width, height }: Viewbox): string =>
  [xMin, yMin, width, height].map((part) => part.toString()).join(' ');

const parseLength = (value: string | undefined): number | undefined => {
  if (!value) {
    return undefined;
  }

  const length = Number.parseFloat(value);
  return Number.isFinite(length) && length > 0 ? length : undefined;
};

const hasExplicitVisibleStroke = (element: Element): boolean => {
  const stroke = element.getAttribute('stroke')?.trim().toLowerCase();
  if (stroke !== undefined) {
    return stroke !== '' && stroke !== 'none';
  }

  const style = element.getAttribute('style');
  if (!style) {
    return false;
  }

  return style.split(';').some((declaration) => {
    const separatorIndex = declaration.indexOf(':');
    if (separatorIndex === -1) {
      return false;
    }

    const property = declaration.slice(0, separatorIndex).trim().toLowerCase();
    if (property !== 'stroke') {
      return false;
    }

    const value = declaration
      .slice(separatorIndex + 1)
      .trim()
      .toLowerCase();
    return value !== '' && value !== 'none';
  });
};

const applySvgDrawingDefaults = (root: Element): void => {
  for (const element of root.querySelectorAll(drawingElementSelector)) {
    if (hasExplicitVisibleStroke(element) && !element.hasAttribute('vector-effect')) {
      element.setAttribute('vector-effect', nonScalingStroke);
    }
  }
};

const parseSvgDocument = (content: string): ParsedSvgDocument => {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- DOMPurify API.
  const sanitized = DOMPurify.sanitize(content, { ADD_ATTR: ['vector-effect'], USE_PROFILES: { svg: true } });
  const document_ = new DOMParser().parseFromString(sanitized, 'image/svg+xml');
  const parserError = document_.querySelector('parsererror');
  const root = document_.documentElement;

  if (parserError !== null || root.localName.toLowerCase() !== 'svg') {
    throw new Error('Invalid SVG document');
  }

  const width = parseLength(getAttributeValue(root, 'width'));
  const height = parseLength(getAttributeValue(root, 'height'));
  const inferredViewBox =
    width !== undefined && height !== undefined ? createViewBox({ xMin: 0, yMin: 0, width, height }) : fallbackViewBox;
  const viewBox = parseViewBox(getAttributeValue(root, 'viewBox')) ?? inferredViewBox;
  applySvgDrawingDefaults(root);

  return {
    innerHtml: root.innerHTML,
    viewBox,
  };
};

const addMarginToViewBox = (viewBox: Viewbox, margin: number): Viewbox =>
  createViewBox({
    xMin: viewBox.xMin - margin * viewBox.width,
    yMin: viewBox.yMin - margin * viewBox.height,
    width: viewBox.width * (1 + 2 * margin),
    height: viewBox.height * (1 + 2 * margin),
  });

const adaptViewBoxToClientRect = (viewBox: Viewbox, clientRect: DOMRect | undefined): Viewbox => {
  const marginedViewBox = addMarginToViewBox(viewBox, initialViewBoxMargin);
  if (!clientRect || clientRect.width <= 0 || clientRect.height <= 0) {
    return marginedViewBox;
  }

  const rectRatio = clientRect.width / clientRect.height;
  const boxRatio = marginedViewBox.width / marginedViewBox.height;

  if (rectRatio > boxRatio) {
    const padding = rectRatio * marginedViewBox.height - marginedViewBox.width;
    return createViewBox({
      xMin: marginedViewBox.xMin - padding / 2,
      yMin: marginedViewBox.yMin,
      width: marginedViewBox.width + padding,
      height: marginedViewBox.height,
    });
  }

  const padding = marginedViewBox.width / rectRatio - marginedViewBox.height;
  return createViewBox({
    xMin: marginedViewBox.xMin,
    yMin: marginedViewBox.yMin - padding / 2,
    width: marginedViewBox.width,
    height: marginedViewBox.height + padding,
  });
};

const wrapOffset = (offset: number, step: number): number => {
  if (!Number.isFinite(step) || step === 0) {
    return 0;
  }
  return ((offset % step) + step) % step;
};

type SvgGridProps = {
  readonly viewBox: Viewbox;
  readonly transform: SvgTransform;
};

function SvgGrid({ viewBox, transform }: SvgGridProps): ReactNode {
  const gridSizes = useGraphicsSelector((state) => state.context.gridSizes);
  const { theme } = useTheme();
  const id = useId();
  const { xMin, yMin, width, height } = viewBox;
  const { smallSize, largeSize } = gridSizes;
  /* oxlint-disable tau-lint/no-hardcoded-color -- SVG grid overlay color */
  const gridColor = useMemo(
    () => (theme === Theme.LIGHT ? 'rgba(128, 128, 128, 0.15)' : 'rgba(128, 128, 128, 0.1)'),
    [theme],
  );
  /* oxlint-enable tau-lint/no-hardcoded-color */
  const scale = transform.scale || 1;
  const worldOffsetX = (-transform.x || 0) / scale;
  const worldOffsetY = (-transform.y || 0) / scale;
  const offsetSmallX = wrapOffset(worldOffsetX, smallSize);
  const offsetSmallY = wrapOffset(worldOffsetY, smallSize);
  const offsetLargeX = wrapOffset(worldOffsetX, largeSize);
  const offsetLargeY = wrapOffset(worldOffsetY, largeSize);

  return (
    <>
      <defs>
        <pattern
          id={`${id}-small`}
          width={smallSize}
          height={smallSize}
          patternUnits='userSpaceOnUse'
          patternTransform={`translate(${offsetSmallX} ${offsetSmallY})`}
        >
          <path
            d={`M ${smallSize} 0 L 0 0 0 ${smallSize}`}
            fill='none'
            stroke={gridColor}
            strokeWidth='2'
            vectorEffect='non-scaling-stroke'
          />
        </pattern>
        <pattern
          id={`${id}-large`}
          width={largeSize}
          height={largeSize}
          patternUnits='userSpaceOnUse'
          patternTransform={`translate(${offsetLargeX} ${offsetLargeY})`}
        >
          <path
            d={`M ${largeSize} 0 L 0 0 0 ${largeSize}`}
            fill='none'
            stroke={gridColor}
            strokeWidth='4'
            vectorEffect='non-scaling-stroke'
          />
        </pattern>
      </defs>
      <rect
        x={xMin / scale}
        y={yMin / scale}
        width={width / scale}
        height={height / scale}
        fill={`url(#${id}-small)`}
      />
      <rect
        x={xMin / scale}
        y={yMin / scale}
        width={width / scale}
        height={height / scale}
        fill={`url(#${id}-large)`}
      />
    </>
  );
}

type SvgAxesProps = {
  readonly viewBox: Viewbox;
};

function SvgAxes({ viewBox }: SvgAxesProps): ReactNode {
  const extension = Math.max(viewBox.width, viewBox.height, 1) * 1000;

  return (
    <g data-slot='axes' pointerEvents='none' strokeLinecap='round'>
      <line
        data-slot='axes-x'
        x1={0}
        y1={0}
        x2={extension}
        y2={0}
        stroke={axesColors.x}
        strokeWidth={2}
        vectorEffect='non-scaling-stroke'
      />
      <line
        data-slot='axes-y'
        x1={0}
        y1={0}
        x2={0}
        y2={-extension}
        stroke={axesColors.y}
        strokeWidth={2}
        vectorEffect='non-scaling-stroke'
      />
    </g>
  );
}

type SvgWindowProps = {
  readonly viewBox: Viewbox;
  readonly innerHtml: string;
  readonly enableGrid: boolean;
  readonly enableAxes: boolean;
  readonly defaultColor?: string;
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React ref API requires null
  readonly svgRef: RefObject<SVGSVGElement | null>;
};

type WheelZoomParameters = {
  readonly event: WheelEvent;
  readonly instance: PanzoomObject;
  readonly container: HTMLDivElement;
  readonly viewBox: Viewbox;
};

function SvgWindow({ viewBox, innerHtml, enableGrid, enableAxes, defaultColor, svgRef }: SvgWindowProps): ReactNode {
  const canvasRef = useRef<HTMLDivElement>(null);
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- required by usePanzoomReset API.
  const panzoomRef = useRef<PanzoomObject | null>(null);
  const graphicsActor = useGraphics();
  const [clientRect, setClientRect] = useState<DOMRect | undefined>(undefined);
  const [transform, setTransform] = useState<SvgTransform>({ scale: 1, x: 0, y: 0 });
  const adaptedViewBox = useMemo(() => adaptViewBoxToClientRect(viewBox, clientRect), [clientRect, viewBox]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const updateRect = (): void => {
      setClientRect(canvas.getBoundingClientRect());
    };

    updateRect();
    const resizeObserver = new ResizeObserver(updateRect);
    resizeObserver.observe(canvas);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const onChange = useCallback(
    (instance: PanzoomObject, currentViewBox: Viewbox): void => {
      const scale = instance.getScale();
      setTransform({ scale, x: 0, y: 0 });
      graphicsActor.send({
        type: 'cameraViewChanged',
        verticalSpan: currentViewBox.height / scale,
      });
    },
    [graphicsActor],
  );

  const onWheel = useCallback(({ event, instance, container, viewBox: currentViewBox }: WheelZoomParameters): void => {
    event.preventDefault();

    const svg = container.querySelector('svg');
    if (!svg) {
      return;
    }

    const rect = svg.getBoundingClientRect();
    const unitsToPx = rect.height / currentViewBox.height;
    const originPxX = -currentViewBox.xMin * unitsToPx;
    const originPxY = -currentViewBox.yMin * unitsToPx;
    const { x, y } = instance.getPan();
    const scale = instance.getScale();
    const clientX = rect.left + (originPxX - x) * scale;
    const clientY = rect.top + (originPxY - y) * scale;
    const options = instance.getOptions() as { minScale?: number; maxScale?: number; step?: number };
    const step = options.step ?? gridStep;
    const factor = event.deltaY < 0 ? 1 + step : 1 / (1 + step);
    const nextScale = Math.min(
      options.maxScale ?? gridMaxScale,
      Math.max(options.minScale ?? gridMinScale, scale * factor),
    );

    instance.zoomToPoint(nextScale, { clientX, clientY });
  }, []);

  usePanzoomReset({ panzoomRef, containerRef: canvasRef });

  useEffect(() => {
    const container = canvasRef.current;
    const contentGroup = container?.querySelector<SVGGElement>('#panzoom-root');
    if (!container || !contentGroup) {
      return;
    }

    // oxlint-disable-next-line @typescript-eslint/no-unsafe-call -- Panzoom ESM build has no published types.
    const instance = panzoom(contentGroup, {
      maxScale: gridMaxScale,
      minScale: gridMinScale,
      step: gridStep,
      animate: true,
      canvas: true,
      cursor: 'auto',
      // Panzoom's default translate is CSS-pixel based; the old SVG viewer only scaled this group.
      setTransform(_element: SVGElement, { scale }: { scale: number; x: number; y: number }): void {
        instance.setStyle('transform', `scale(${scale})`);
      },
    }) as PanzoomObject;
    panzoomRef.current = instance;

    return () => {
      instance.destroy();
      panzoomRef.current = null;
    };
  }, []);

  useEffect(() => {
    const container = canvasRef.current;
    const instance = panzoomRef.current;
    const contentGroup = container?.querySelector<SVGGElement>('#panzoom-root');
    if (!container || !instance || !contentGroup) {
      return;
    }

    const handleWheel = (event: WheelEvent): void => {
      onWheel({ event, instance, container, viewBox: adaptedViewBox });
    };
    const handleChange = (): void => {
      onChange(instance, adaptedViewBox);
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    contentGroup.addEventListener('panzoomchange', handleChange);
    contentGroup.addEventListener('panzoomzoom', handleChange);

    return () => {
      container.removeEventListener('wheel', handleWheel);
      contentGroup.removeEventListener('panzoomchange', handleChange);
      contentGroup.removeEventListener('panzoomzoom', handleChange);
    };
  }, [adaptedViewBox, onChange, onWheel]);

  return (
    <div ref={canvasRef} className='flex h-full w-full flex-1 touch-none overflow-hidden bg-background'>
      <svg
        ref={svgRef}
        viewBox={stringifyViewBox(adaptedViewBox)}
        width='100%'
        height='100%'
        xmlns='http://www.w3.org/2000/svg'
        className={cn('h-full w-full bg-background', defaultColor ? '' : 'text-foreground')}
        preserveAspectRatio='xMidYMid meet'
        style={defaultColor ? { color: defaultColor, stroke: defaultColor } : undefined}
      >
        <g id='panzoom-root'>
          {enableGrid ? <SvgGrid viewBox={adaptedViewBox} transform={transform} /> : null}
          {enableAxes ? <SvgAxes viewBox={adaptedViewBox} /> : null}
          {/* oxlint-disable-next-line react/no-danger -- DOMPurify sanitizes the SVG document before injection. */}
          <g data-slot='geometry' dangerouslySetInnerHTML={{ __html: innerHtml }} />
        </g>
      </svg>
    </div>
  );
}

type SvgViewerProps = {
  readonly geometry: GeometrySvg;
  readonly enableGrid?: boolean;
  readonly enableAxes?: boolean;
  readonly defaultColor?: string;
};

export function SvgViewer({ geometry, enableGrid = true, enableAxes = true, defaultColor }: SvgViewerProps): ReactNode {
  const svgRef = useRef<SVGSVGElement>(null);
  const parsed = useMemo<ParsedSvgResult>(() => {
    try {
      return { data: parseSvgDocument(geometry.content), error: undefined };
    } catch (error) {
      return { data: undefined, error: error instanceof Error ? error : new Error('Invalid SVG document') };
    }
  }, [geometry.content]);

  if (parsed.error !== undefined) {
    return (
      <div role='alert' aria-label='Invalid SVG' className='flex size-full items-center justify-center bg-background'>
        <p className='max-w-sm text-center text-sm text-destructive'>{parsed.error.message}</p>
      </div>
    );
  }

  return (
    <div className='relative h-full w-full bg-background'>
      <SvgWindow
        viewBox={parsed.data.viewBox}
        innerHtml={parsed.data.innerHtml}
        enableGrid={enableGrid}
        enableAxes={enableAxes}
        defaultColor={defaultColor}
        svgRef={svgRef}
      />
    </div>
  );
}
