/**
 * The SVG view's DOM adapter: the callback actor graphics runs while an SVG view is mounted (charter D4). Its closure
 * holds the panzoom instance, the pointer and wheel listeners and the resize observer, so no React effect sends,
 * subscribes or times for the 2D view. It reports each new visible span to graphics as `cameraViewChanged`, which
 * re-derives the grid, and fits the drawing when graphics sends it `fit` (the viewer's fit control and F).
 */
import { createCallbackLogic } from 'xstate';
import type { PanzoomObject } from '@panzoom/panzoom';
// @ts-expect-error - no types available for the ESM build.
import panzoom from '@panzoom/panzoom/dist/panzoom.es.js';
import type { SvgViewAdapterLogic } from '#machines/graphics.machine.js';

/** Panzoom's scale and pan, in CSS pixels from the viewport's corner. @public */
export type SvgViewTransform = Readonly<{ scale: number; x: number; y: number }>;

/** What the view renders from: panzoom's transform and the viewport's size. @public */
export type SvgViewLayout = Readonly<{ transform: SvgViewTransform; clientRect: DOMRect | undefined }>;

/**
 * The elements and drawing one mounted SVG view is built around.
 *
 * @public
 */
export type SvgViewHost = Readonly<{
  /** The `<svg>` element; panzoom moves its `#panzoom-root` group and listens on it. */
  svg: SVGSVGElement;
  /** The viewport the drawing is fitted to; its size is observed. */
  container: HTMLElement;
  /** The visible SVG height, in metres, for a transform and viewport. */
  verticalSpan: (layout: SvgViewLayout) => number;
  /** The transform the previous adapter of this view left, so a new drawing keeps the person's pan and zoom. */
  initialTransform?: SvgViewTransform;
  /** Hands each new layout to the component that draws it. */
  onLayout: (layout: SvgViewLayout) => void;
}>;

const maxScale = 10_000;
const minScale = 1e-5;
/** Zoom per wheel pixel; a trackpad pinch arrives as a `ctrlKey` wheel with small deltas, so it zooms faster. */
const wheelZoomRate = 0.002;
const pinchZoomRate = 0.01;
/** Pixels per wheel line, for wheels that report lines (`deltaMode` 1). */
const wheelLinePixels = 16;

/**
 * Returns the drawing to the fitted view about the viewport's centre.
 *
 * `zoomToPoint` follows the wheel's code path, so the patterns update during the change. The pan resets without
 * animation: panzoom defers both `setTransform` and its events into `requestAnimationFrame`, and an animated pan would
 * re-enable the CSS transition in a second frame, after `zoomToPoint` had turned it off, leaving the SVG patterns
 * stale.
 */
const fitDrawing = (instance: PanzoomObject, container: HTMLElement): void => {
  const rect = container.getBoundingClientRect();
  instance.zoomToPoint(1, { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 });
  instance.pan(0, 0, { animate: false });
};

/**
 * Creates the adapter for one mounted SVG view, which its `<svg>` ref callback sends graphics in `svgViewAttached`.
 *
 * @param host - The view's elements, its span function, the transform to resume from and the layout callback.
 * @returns The adapter logic.
 * @public
 */
export const createSvgViewAdapter = (host: SvgViewHost): SvgViewAdapterLogic =>
  createCallbackLogic(({ sendBack, receive }) => {
    const { svg, container, verticalSpan, initialTransform, onLayout } = host;
    const contentGroup = svg.querySelector<SVGGElement>('#panzoom-root');
    if (!contentGroup) {
      return undefined;
    }
    let layout: SvgViewLayout = {
      transform: initialTransform ?? { scale: 1, x: 0, y: 0 },
      clientRect: container.getBoundingClientRect(),
    };
    let reportedSpan: number | undefined;
    // The transform panzoom is still resuming, until it reports it (or the person moves the view first).
    let resuming: SvgViewTransform | undefined = initialTransform;
    // Panzoom applies a transform in `requestAnimationFrame`, so a destroyed instance can still call back once.
    let stopped = false;
    const publish = (next: SvgViewLayout): void => {
      if (stopped) {
        return;
      }
      layout = next;
      onLayout(next);
      const span = verticalSpan(next);
      if (span !== reportedSpan) {
        reportedSpan = span;
        sendBack({ type: 'cameraViewChanged', verticalSpan: span });
      }
    };

    // Panzoom owns the gesture math (drag, pinch, zoom about a point); the view applies its result as a viewBox.
    // oxlint-disable-next-line @typescript-eslint/no-unsafe-call -- Panzoom ESM build has no published types.
    const instance = panzoom(contentGroup, {
      maxScale,
      minScale,
      canvas: true,
      cursor: 'grab',
      noBind: true,
      startScale: layout.transform.scale,
      startX: layout.transform.x,
      startY: layout.transform.y,
      // Keep the press from starting a text selection or a native image drag, and let it reach the pane.
      handleStartEvent(event: Event): void {
        event.preventDefault();
      },
      setTransform(_element: SVGElement, next: SvgViewTransform): void {
        if (resuming) {
          // Panzoom resumes in two frames, the scale at pan (0, 0) first and the pan after it; the view already holds
          // the resumed transform, so the half-applied one is never drawn or handed to the next drawing's adapter.
          if (next.x !== resuming.x || next.y !== resuming.y) {
            return;
          }
          resuming = undefined;
        }
        publish({ ...layout, transform: { scale: next.scale, x: next.x, y: next.y } });
      },
    }) as PanzoomObject;
    // Panzoom applies its start pan from a timer, which reads `startX` and `startY` when it fires. The resumed pan is
    // applied now, and until the timer has fired each move the person makes becomes the start pan, so the timer
    // repeats the current pan instead of undoing a fit, wheel or drag made before it.
    let startPanPending = true;
    const startPanSettled = setTimeout(() => {
      startPanPending = false;
    });
    const followStartPan = (): void => {
      if (startPanPending) {
        const { x, y } = instance.getPan();
        instance.setOptions({ startX: x, startY: y });
      }
    };
    if (initialTransform) {
      instance.pan(initialTransform.x, initialTransform.y, { animate: false, force: true });
    }

    const handleDown = (event: PointerEvent): void => {
      // The primary or middle mouse button, any touch or pen.
      if (event.pointerType === 'mouse' && event.button > 1) {
        return;
      }
      // Capture keeps the drag alive outside the viewport and delivers the release wherever it happens.
      svg.setPointerCapture(event.pointerId);
      resuming = undefined;
      instance.handleDown(event);
    };
    const handleWheel = (event: WheelEvent): void => {
      event.preventDefault();
      resuming = undefined;
      const delta = (event.deltaY || event.deltaX) * (event.deltaMode === 1 ? wheelLinePixels : 1);
      const rate = event.ctrlKey ? pinchZoomRate : wheelZoomRate;
      instance.zoomToPoint(instance.getScale() * Math.exp(-delta * rate), event);
      followStartPan();
    };
    const handleMove = (event: PointerEvent): void => {
      instance.handleMove(event);
      followStartPan();
    };
    const resizeObserver = new ResizeObserver(() => {
      publish({ ...layout, clientRect: container.getBoundingClientRect() });
    });

    svg.addEventListener('pointerdown', handleDown);
    svg.addEventListener('pointermove', handleMove);
    svg.addEventListener('pointerup', instance.handleUp);
    svg.addEventListener('pointercancel', instance.handleUp);
    svg.addEventListener('wheel', handleWheel, { passive: false });
    resizeObserver.observe(container);
    publish(layout);

    // `fit` is the only command.
    receive(() => {
      resuming = undefined;
      fitDrawing(instance, container);
      followStartPan();
    });

    return () => {
      stopped = true;
      clearTimeout(startPanSettled);
      resizeObserver.disconnect();
      svg.removeEventListener('pointerdown', handleDown);
      svg.removeEventListener('pointermove', handleMove);
      svg.removeEventListener('pointerup', instance.handleUp);
      svg.removeEventListener('pointercancel', instance.handleUp);
      svg.removeEventListener('wheel', handleWheel);
      instance.destroy();
    };
  });
