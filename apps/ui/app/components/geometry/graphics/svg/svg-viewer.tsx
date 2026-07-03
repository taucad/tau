import { useId, useMemo, useRef } from 'react';
import DOMPurify from 'dompurify';
import type { ReactNode } from 'react';
import type { GeometrySvg } from '@taucad/types';
import { SvgActorBridge } from '#components/geometry/graphics/svg/svg-actor-bridge.js';
import { axesColors } from '#constants/color.constants.js';
import { Theme, useTheme } from '#hooks/use-theme.js';
import { useGraphicsSelector } from '#hooks/use-graphics.js';
import { cn } from '#utils/ui.utils.js';

type Viewbox = {
  xMin: number;
  yMin: number;
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

const fallbackViewBox: Viewbox = { xMin: -10, yMin: -10, width: 20, height: 20 };

const getAttributeValue = (element: Element, name: string): string | undefined =>
  element.getAttribute(name) ?? undefined;

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

  return { xMin, yMin, width, height };
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

const parseSvgDocument = (content: string): ParsedSvgDocument => {
  const sanitized = DOMPurify.sanitize(content, { USE_PROFILES: { svg: true } });
  const document_ = new DOMParser().parseFromString(sanitized, 'image/svg+xml');
  const parserError = document_.querySelector('parsererror');
  const root = document_.documentElement;

  if (parserError !== null || root.localName.toLowerCase() !== 'svg') {
    throw new Error('Invalid SVG document');
  }

  const width = parseLength(getAttributeValue(root, 'width'));
  const height = parseLength(getAttributeValue(root, 'height'));
  const inferredViewBox =
    width !== undefined && height !== undefined ? { xMin: 0, yMin: 0, width, height } : fallbackViewBox;
  const viewBox = parseViewBox(getAttributeValue(root, 'viewBox')) ?? inferredViewBox;

  return {
    innerHtml: root.innerHTML,
    viewBox,
  };
};

type SvgGridProps = {
  readonly viewBox: Viewbox;
};

function SvgGrid({ viewBox }: SvgGridProps): ReactNode {
  const gridSizes = useGraphicsSelector((state) => state.context.gridSizes);
  const { theme } = useTheme();
  const id = useId();
  const { xMin, yMin, width, height } = viewBox;
  const { smallSize, largeSize } = gridSizes;
  const gridOpacity = theme === Theme.LIGHT ? 0.15 : 0.1;

  return (
    <>
      <defs>
        <pattern id={`${id}-small`} width={smallSize} height={smallSize} patternUnits='userSpaceOnUse'>
          <path
            d={`M ${smallSize} 0 L 0 0 0 ${smallSize}`}
            fill='none'
            stroke='var(--border)'
            strokeOpacity={gridOpacity}
            strokeWidth='1'
          />
        </pattern>
        <pattern id={`${id}-large`} width={largeSize} height={largeSize} patternUnits='userSpaceOnUse'>
          <path
            d={`M ${largeSize} 0 L 0 0 0 ${largeSize}`}
            fill='none'
            stroke='var(--border)'
            strokeOpacity={gridOpacity}
            strokeWidth='2'
          />
        </pattern>
      </defs>
      <rect x={xMin} y={yMin} width={width} height={height} fill={`url(#${id}-small)`} />
      <rect x={xMin} y={yMin} width={width} height={height} fill={`url(#${id}-large)`} />
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

type SvgViewerProps = {
  readonly geometry: GeometrySvg;
  readonly enableGrid?: boolean;
  readonly enableAxes?: boolean;
  readonly enableRawWindow?: boolean;
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

  const { innerHtml, viewBox } = parsed.data;

  return (
    <div className='relative h-full w-full bg-background'>
      <svg
        ref={svgRef}
        viewBox={stringifyViewBox(viewBox)}
        width='100%'
        height='100%'
        xmlns='http://www.w3.org/2000/svg'
        className={cn('h-full w-full bg-background', defaultColor ? '' : 'text-foreground')}
        preserveAspectRatio='xMidYMid meet'
        style={defaultColor ? { color: defaultColor, stroke: defaultColor } : undefined}
      >
        {enableGrid ? <SvgGrid viewBox={viewBox} /> : null}
        {enableAxes ? <SvgAxes viewBox={viewBox} /> : null}
        {/* eslint-disable-next-line react/no-danger -- DOMPurify sanitizes the SVG document before injection. */}
        <g data-slot='geometry' dangerouslySetInnerHTML={{ __html: innerHtml }} />
      </svg>
      <SvgActorBridge svgRef={svgRef} />
    </div>
  );
}
