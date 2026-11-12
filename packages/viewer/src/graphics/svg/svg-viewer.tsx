import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DOMPurify from 'dompurify';
import type { ReactNode, RefCallback } from 'react';
import type { KnownArtifact } from '@taucad/runtime';
import { SvgGrid } from '#graphics/svg/svg-grid.jsx';
import { createSvgViewAdapter } from '#graphics/svg/svg-view-adapter.js';
import type { SvgViewLayout, SvgViewTransform } from '#graphics/svg/svg-view-adapter.js';
import { axesColors } from '#constants/axes-colors.js';
import { useGraphics, useGraphicsSelector } from '#hooks/use-graphics.jsx';

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
  /** Metres per SVG user unit, so the grid and its readout are physical lengths. */
  metersPerUnit: number;
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

const metersPerMillimeter = 0.001;
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

/**
 * Metres per user unit. tscircuit schematics declare their pixels per millimetre in
 * `data-real-to-screen-transform`; any other drawing is read in Tau's CAD millimetres.
 *
 * @param root - The sanitized SVG root element.
 * @returns Metres per user unit.
 */
const parseMetersPerUnit = (root: Element): number => {
  const transform = getAttributeValue(root, 'data-real-to-screen-transform') ?? '';
  const pixelsPerMillimeter = Number.parseFloat(/matrix\(\s*([^\s),]+)/.exec(transform)?.[1] ?? '');
  return pixelsPerMillimeter > 0 ? metersPerMillimeter / pixelsPerMillimeter : metersPerMillimeter;
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
    metersPerUnit: parseMetersPerUnit(root),
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

/** The part of the drawing a transform and viewport show, as a viewBox. */
const resolveVisibleViewBox = (viewBox: Viewbox, { transform, clientRect }: SvgViewLayout): Viewbox => {
  const fitted = adaptViewBoxToClientRect(viewBox, clientRect);
  const scale = transform.scale || 1;
  const unitsPerPixel = clientRect && clientRect.height > 0 ? fitted.height / clientRect.height : 1;
  return createViewBox({
    xMin: fitted.xMin - transform.x * unitsPerPixel,
    yMin: fitted.yMin - transform.y * unitsPerPixel,
    width: fitted.width / scale,
    height: fitted.height / scale,
  });
};

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
  readonly metersPerUnit: number;
  readonly enableGrid: boolean;
  readonly enableAxes: boolean;
  readonly defaultColor?: string;
};

function SvgWindow({
  viewBox,
  innerHtml,
  metersPerUnit,
  enableGrid,
  enableAxes,
  defaultColor,
}: SvgWindowProps): ReactNode {
  const graphicsActor = useGraphics();
  const gridSizes = useGraphicsSelector((state) => state.context.gridSizes);
  const viewId = useId();
  const [layout, setLayout] = useState<SvgViewLayout>({ transform: { scale: 1, x: 0, y: 0 }, clientRect: undefined });
  /** The transform the last adapter reported, so the adapter for a new drawing resumes the person's pan and zoom. */
  const lastTransformRef = useRef<SvgViewTransform | undefined>(undefined);
  const { transform, clientRect } = layout;
  const fittedViewBox = useMemo(() => adaptViewBoxToClientRect(viewBox, clientRect), [clientRect, viewBox]);

  /*
   * Graphics runs the view's panzoom, listeners and resize observer as a callback actor (charter D4): the `<svg>` ref
   * callback only hands the element over and takes it back. A new drawing or unit is a new adapter, which resumes the
   * transform the previous one left and reports the new visible span to graphics for the grid.
   */
  const attachView = useCallback<RefCallback<SVGSVGElement>>(
    (svg) => {
      const container = svg?.parentElement;
      if (!svg || !container) {
        graphicsActor.send({ type: 'svgViewDetached', viewId });
        return;
      }
      graphicsActor.send({
        type: 'svgViewAttached',
        viewId,
        adapter: createSvgViewAdapter({
          svg,
          container,
          verticalSpan: (next) => resolveVisibleViewBox(viewBox, next).height * metersPerUnit,
          ...(lastTransformRef.current === undefined ? {} : { initialTransform: lastTransformRef.current }),
          onLayout: (next) => {
            lastTransformRef.current = next.transform;
            setLayout(next);
          },
        }),
      });
    },
    [graphicsActor, metersPerUnit, viewBox, viewId],
  );

  // Panzoom's model for an SVG child is `screen = scale * (fitted + pan)` in CSS pixels from the viewport's corner.
  // The view is that model written as a viewBox, so the drawing, the axes and the grid share one mapping.
  const scale = transform.scale || 1;
  const unitsPerPixel = clientRect && clientRect.height > 0 ? fittedViewBox.height / clientRect.height : 1;
  const pixelsPerUnit = scale / unitsPerPixel;
  const visibleViewBox = resolveVisibleViewBox(viewBox, layout);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', touchAction: 'none' }}>
      {enableGrid && clientRect && clientRect.width > 0 && clientRect.height > 0 ? (
        <SvgGrid
          width={clientRect.width}
          height={clientRect.height}
          originX={-visibleViewBox.xMin * pixelsPerUnit}
          originY={-visibleViewBox.yMin * pixelsPerUnit}
          smallCell={(gridSizes.smallSize / metersPerUnit) * pixelsPerUnit}
          largeCell={(gridSizes.largeSize / metersPerUnit) * pixelsPerUnit}
        />
      ) : null}
      <svg
        ref={attachView}
        role='img'
        aria-label='SVG view'
        viewBox={stringifyViewBox(visibleViewBox)}
        width='100%'
        height='100%'
        xmlns='http://www.w3.org/2000/svg'
        preserveAspectRatio='xMidYMid meet'
        style={{
          position: 'absolute',
          inset: 0,
          ...(defaultColor ? { color: defaultColor, stroke: defaultColor } : undefined),
        }}
      >
        <g id='panzoom-root'>
          {enableAxes ? <SvgAxes viewBox={fittedViewBox} /> : null}
          {/* oxlint-disable-next-line react/no-danger -- DOMPurify sanitizes the SVG document before injection. */}
          <g data-slot='geometry' dangerouslySetInnerHTML={{ __html: innerHtml }} />
        </g>
      </svg>
    </div>
  );
}

type SvgViewerProps = {
  readonly artifact: Extract<KnownArtifact, { mimeType: 'image/svg+xml' }>;
  readonly enableGrid?: boolean;
  readonly enableAxes?: boolean;
  readonly defaultColor?: string;
};

/**
 * Views an SVG artifact: drag to pan, wheel or pinch to zoom about the pointer, and the viewer's fit control to
 * return to the fitted view. The grid behind the drawing matches the 3D viewer's grid.
 *
 * @param props - The SVG artifact, the grid and axes switches and an optional default stroke colour.
 * @returns The SVG viewer.
 * @public
 */
export function SvgViewer({ artifact, enableGrid = true, enableAxes = true, defaultColor }: SvgViewerProps): ReactNode {
  const [shadowRoot, setShadowRoot] = useState<ShadowRoot>();
  const attachHost = useCallback<RefCallback<HTMLDivElement>>((host) => {
    if (host) {
      setShadowRoot(host.shadowRoot ?? host.attachShadow({ mode: 'open' }));
    }
  }, []);
  const parsed = useMemo<ParsedSvgResult>(() => {
    try {
      return { data: parseSvgDocument(artifact.content), error: undefined };
    } catch (error) {
      return { data: undefined, error: error instanceof Error ? error : new Error('Invalid SVG document') };
    }
  }, [artifact.content]);

  if (parsed.error !== undefined) {
    return (
      <div role='alert' aria-label='Invalid SVG' className='flex size-full items-center justify-center bg-background'>
        <p className='max-w-sm text-center text-sm text-feature'>{parsed.error.message}</p>
      </div>
    );
  }

  return (
    <div ref={attachHost} className='relative h-full w-full bg-background' data-testid='svg-viewer-host'>
      {shadowRoot
        ? createPortal(
            <SvgWindow
              viewBox={parsed.data.viewBox}
              innerHtml={parsed.data.innerHtml}
              metersPerUnit={parsed.data.metersPerUnit}
              enableGrid={enableGrid}
              enableAxes={enableAxes}
              defaultColor={defaultColor}
            />,
            shadowRoot,
          )
        : null}
    </div>
  );
}
