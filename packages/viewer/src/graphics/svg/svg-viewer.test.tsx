// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanzoomObject, PanzoomOptions } from '@panzoom/panzoom';
import { createActor, setup } from 'xstate';
import type { AnyActor } from 'xstate';
import type { KnownArtifact } from '@taucad/runtime';
import { SvgViewer } from '#graphics/svg/svg-viewer.jsx';
import { createSvgViewAdapter } from '#graphics/svg/svg-view-adapter.js';
import type { SvgViewAdapterLogic } from '#machines/graphics.machine.js';

type GraphicsEvent = {
  readonly type: string;
  readonly verticalSpan?: number;
  readonly viewId?: string;
  readonly adapter?: SvgViewAdapterLogic;
};

const mocks = vi.hoisted(() => ({
  graphicsSend: vi.fn<(event: GraphicsEvent) => void>(),
  views: new Map<string, AnyActor>(),
  panzoom: vi.fn<(element: Element, options: PanzoomOptions) => PanzoomObject>(),
}));

/** Graphics' part in the view's lifetime: it runs each attached adapter and stops it on detach. */
const hostSvgView = (event: GraphicsEvent): void => {
  mocks.graphicsSend(event);
  if (event.type === 'svgViewDetached' && event.viewId !== undefined) {
    mocks.views.get(event.viewId)?.stop();
    mocks.views.delete(event.viewId);
  }
  if (event.type === 'svgViewAttached' && event.viewId !== undefined && event.adapter !== undefined) {
    const host = createActor(
      setup({ actors: { adapter: event.adapter } }).createMachine({
        invoke: { src: 'adapter', id: 'adapter' },
        on: {
          cameraViewChanged: ({ event: report }) => {
            mocks.graphicsSend(report);
            return {};
          },
        },
      }),
    );
    host.start();
    mocks.views.set(event.viewId, host);
  }
};

const graphicsActor = { send: hostSvgView };

/** What graphics does on the fit control: it sends the mounted view's adapter `fit`. */
const fitView = (): void => {
  const [host] = mocks.views.values();
  if (!host) {
    throw new Error('Expected the SVG viewer to hand graphics its adapter');
  }
  (host.getSnapshot().children as Record<string, AnyActor>)['adapter']!.send({ type: 'fit' });
};

vi.mock('@panzoom/panzoom/dist/panzoom.es.js', () => ({
  default: mocks.panzoom,
}));

vi.mock('#hooks/use-graphics.jsx', () => ({
  useGraphics: () => graphicsActor,
  useGraphicsSelector: <T,>(
    selector: (state: { context: { gridSizes: { largeSize: number; smallSize: number } } }) => T,
  ) => selector({ context: { gridSizes: { largeSize: 10, smallSize: 1 } } }),
}));

const createMockPanzoomInstance = (): PanzoomObject => ({
  bind: vi.fn(),
  destroy: vi.fn(),
  eventNames: { down: 'pointerdown', move: 'pointermove', up: 'pointerup' },
  getOptions: vi.fn(
    () =>
      ({
        maxScale: 10_000,
        minScale: 1e-5,
        step: 0.1,
      }) satisfies PanzoomOptions,
  ),
  getPan: vi.fn(() => ({ x: 0, y: 0 })),
  getScale: vi.fn(() => 1),
  handleDown: vi.fn(),
  handleMove: vi.fn(),
  handleUp: vi.fn(),
  pan: vi.fn(),
  reset: vi.fn(),
  resetStyle: vi.fn(),
  setOptions: vi.fn(),
  setStyle: vi.fn(),
  zoom: vi.fn(),
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
  zoomToPoint: vi.fn(),
  zoomWithWheel: vi.fn(),
});

class TestResizeObserver implements ResizeObserver {
  public readonly disconnect = vi.fn();
  public readonly observe = vi.fn();
  public readonly unobserve = vi.fn();

  public constructor(callback: ResizeObserverCallback) {
    void callback;
  }
}

// oxlint-disable-next-line tau-lint/no-hardcoded-color -- test fixture asserts authored SVG color survives sanitization.
const testStrokeColor = '#ff0000';
const geometry: Extract<KnownArtifact, { mimeType: 'image/svg+xml' }> = {
  mimeType: 'image/svg+xml',
  content: `<svg viewBox="0 0 20 10"><script>alert("x")</script><path d="M0 0 C5 10 15 10 20 0" fill="none" stroke="${testStrokeColor}" stroke-width="1" vector-effect="non-scaling-stroke"/></svg>`,
};

const legacyStrokedGeometry: Extract<KnownArtifact, { mimeType: 'image/svg+xml' }> = {
  mimeType: 'image/svg+xml',
  content: `<svg viewBox="-3.2 -33.31 26.4 56.63"><script>alert("x")</script><path d="M 0 0 C 5.78509 -6.8944 14.21491 -6.8944 20 0" fill="none" stroke="${testStrokeColor}"/></svg>`,
};

let panzoomInstance: PanzoomObject;
let originalResizeObserver: typeof ResizeObserver;

beforeEach(() => {
  for (const host of mocks.views.values()) {
    host.stop();
  }
  mocks.views.clear();
  panzoomInstance = createMockPanzoomInstance();
  mocks.panzoom.mockReturnValue(panzoomInstance);
  originalResizeObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = TestResizeObserver;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 800, 600));
});

afterEach(() => {
  cleanup();
  globalThis.ResizeObserver = originalResizeObserver;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const viewerRoot = (): ShadowRoot => {
  const shadow = document.querySelector('[data-testid="svg-viewer-host"]')?.shadowRoot;
  if (!shadow) {
    throw new Error('Expected isolated SVG viewer root');
  }
  return shadow;
};

describe('SvgViewer', () => {
  it('keeps authored SVG styles inside the viewer shadow root', async () => {
    const styledArtifact: typeof geometry = {
      mimeType: 'image/svg+xml',
      content:
        '<svg viewBox="0 0 10 10"><style>body { color: red } path { stroke: blue }</style><path d="M0 0L10 10"/></svg>',
    };
    render(<SvgViewer artifact={styledArtifact} />);

    await waitFor(() => {
      expect(mocks.panzoom).toHaveBeenCalledOnce();
    });
    expect(viewerRoot().querySelector('style')?.textContent).toContain('path { stroke: blue }');
    expect(document.querySelector('style')).toBeNull();
    expect(viewerRoot().querySelector('path')).not.toBeNull();
  });

  it('should render sanitized SVG document content inside a Panzoom viewport', async () => {
    render(<SvgViewer artifact={geometry} />);

    await waitFor(() => {
      expect(mocks.panzoom).toHaveBeenCalledOnce();
    });

    const root = viewerRoot().querySelector('#panzoom-root');
    expect(root?.tagName.toLowerCase()).toBe('g');
    expect(document.querySelector('script')).toBeNull();
    const geometryPath = viewerRoot().querySelector('[data-slot="geometry"] path');
    expect(geometryPath?.getAttribute('stroke')).toBe(testStrokeColor);
    expect(geometryPath?.getAttribute('stroke-width')).toBe('1');
    expect(geometryPath?.getAttribute('vector-effect')).toBe('non-scaling-stroke');

    // The grid is a canvas behind the drawing, at the 3D grid's line opacity.
    const grid = viewerRoot().querySelector<HTMLCanvasElement>('canvas[data-slot="grid"]');
    expect(grid?.style.opacity).toBe('0.3');
    expect(viewerRoot().querySelector('pattern')).toBeNull();

    expect(mocks.views.size).toBe(1);
    const [target, options] = mocks.panzoom.mock.calls[0]!;
    expect(target).toBe(root);
    expect(options).toMatchObject({ canvas: true, cursor: 'grab', noBind: true, maxScale: 10_000, minScale: 1e-5 });
    const { setTransform } = options;
    if (typeof setTransform !== 'function') {
      throw new TypeError('expected Panzoom setTransform option');
    }
    // The 20 x 10 drawing fits an 800 x 600 viewport as -2 -4 24 18: 0.03 units per pixel.
    const viewport = viewerRoot().querySelector('svg');
    expect(viewport?.getAttribute('viewBox')).toBe('-2 -4 24 18');
    act(() => {
      setTransform(root as SVGElement, { scale: 2, x: 12, y: 34 }, options);
    });
    // Panzoom's pan is in pixels before its scale: the view moves by 12 and 34 px of drawing and shows half as much.
    expect(viewport?.getAttribute('viewBox')).toBe('-2.36 -5.02 12 9');
    // Drawing units are millimetres, so 9 units top to bottom is 9 mm for the grid.
    const cameraViewEvent = mocks.graphicsSend.mock.calls
      .map(([payload]) => payload)
      .findLast((payload) => payload.type === 'cameraViewChanged');
    expect(cameraViewEvent?.verticalSpan).toBeCloseTo(0.009, 12);
  });

  it('should apply constant-screen stroke defaults to sanitized stroked geometry paths', async () => {
    render(<SvgViewer artifact={legacyStrokedGeometry} />);

    await waitFor(() => {
      expect(mocks.panzoom).toHaveBeenCalledOnce();
    });

    expect(document.querySelector('script')).toBeNull();
    const geometryPath = viewerRoot().querySelector('[data-slot="geometry"] path');
    expect(geometryPath?.getAttribute('stroke')).toBe(testStrokeColor);
    expect(geometryPath?.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    expect(geometryPath?.hasAttribute('stroke-width')).toBe(false);
  });

  it('should zoom about the pointer with the mouse wheel', async () => {
    render(<SvgViewer artifact={geometry} />);
    await waitFor(() => {
      expect(mocks.panzoom).toHaveBeenCalledOnce();
    });

    const viewport = viewerRoot().querySelector('svg');
    if (!viewport) {
      throw new Error('expected the SVG viewport');
    }
    const wheelEvent = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: -100,
      clientX: 120,
      clientY: 80,
    });
    act(() => {
      viewport.dispatchEvent(wheelEvent);
    });

    expect(wheelEvent.defaultPrevented).toBe(true);
    const [scale, point] = vi.mocked(panzoomInstance.zoomToPoint).mock.calls[0]!;
    expect(scale).toBeCloseTo(Math.exp(0.2), 12);
    expect([point.clientX, point.clientY]).toEqual([120, 80]);
  });

  it('should fit the SVG view when graphics sends its adapter fit', async () => {
    render(<SvgViewer artifact={geometry} />);
    await waitFor(() => {
      expect(mocks.panzoom).toHaveBeenCalledOnce();
    });

    act(() => {
      fitView();
    });

    expect(panzoomInstance.zoomToPoint).toHaveBeenCalledWith(1, { clientX: 400, clientY: 300 });
    expect(panzoomInstance.pan).toHaveBeenCalledWith(0, 0, { animate: false });
  });

  it('should hand graphics a new adapter for a new drawing that resumes the pan and zoom', async () => {
    const { rerender } = render(<SvgViewer artifact={geometry} />);
    await waitFor(() => {
      expect(mocks.panzoom).toHaveBeenCalledOnce();
    });
    const [root, options] = mocks.panzoom.mock.calls[0]!;
    act(() => {
      options.setTransform?.(root as SVGElement, { scale: 2, x: 12, y: 34 }, options);
    });

    rerender(<SvgViewer artifact={legacyStrokedGeometry} />);

    await waitFor(() => {
      expect(mocks.panzoom).toHaveBeenCalledTimes(2);
    });
    expect(panzoomInstance.destroy).toHaveBeenCalledOnce();
    expect(mocks.views.size).toBe(1);
    expect(mocks.panzoom.mock.calls[1]![1]).toMatchObject({ startScale: 2, startX: 12, startY: 34 });
    expect(panzoomInstance.pan).toHaveBeenCalledWith(12, 34, { animate: false, force: true });
    const types = mocks.graphicsSend.mock.calls.map(([event]) => event.type);
    expect(types.filter((type) => type === 'svgViewAttached')).toHaveLength(2);
    expect(types.at(-1)).toBe('cameraViewChanged');

    // A transform the destroyed instance applies late (panzoom defers it to a frame) no longer reaches the view.
    const sentBefore = mocks.graphicsSend.mock.calls.length;
    act(() => {
      options.setTransform?.(root as SVGElement, { scale: 40, x: 0, y: 0 }, options);
    });
    rerender(<SvgViewer artifact={geometry} />);
    await waitFor(() => {
      expect(mocks.panzoom).toHaveBeenCalledTimes(3);
    });
    expect(mocks.panzoom.mock.calls[2]![1]).toMatchObject({ startScale: 2, startX: 12, startY: 34 });
    expect(mocks.graphicsSend.mock.calls.length).toBeGreaterThan(sentBefore);

    // Panzoom resumes the scale at pan (0, 0) a frame before the pan: a drawing that lands between keeps the pan.
    const [resumedRoot, resumed] = mocks.panzoom.mock.calls[2]!;
    act(() => {
      resumed.setTransform?.(resumedRoot as SVGElement, { scale: 2, x: 0, y: 0 }, resumed);
    });
    rerender(<SvgViewer artifact={legacyStrokedGeometry} />);
    await waitFor(() => {
      expect(mocks.panzoom).toHaveBeenCalledTimes(4);
    });
    expect(mocks.panzoom.mock.calls[3]![1]).toMatchObject({ startScale: 2, startX: 12, startY: 34 });
  });

  it('should make each move before panzoom applies its start pan the start pan, so the deferred pan keeps it', () => {
    const container = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const root = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    root.id = 'panzoom-root';
    svg.append(root);
    container.append(svg);
    const adapter = createActor(
      createSvgViewAdapter({
        svg,
        container,
        verticalSpan: () => 1,
        initialTransform: { scale: 2, x: 12, y: 34 },
        onLayout: () => undefined,
      }),
    ).start();
    try {
      expect(panzoomInstance.pan).toHaveBeenCalledWith(12, 34, { animate: false, force: true });
      vi.mocked(panzoomInstance.getPan).mockReturnValue({ x: 0, y: 0 });
      adapter.send({ type: 'fit' });
      expect(panzoomInstance.setOptions).toHaveBeenLastCalledWith({ startX: 0, startY: 0 });
      vi.mocked(panzoomInstance.getPan).mockReturnValue({ x: 7, y: 8 });
      svg.dispatchEvent(new WheelEvent('wheel', { deltaY: 10, cancelable: true }));
      expect(panzoomInstance.setOptions).toHaveBeenLastCalledWith({ startX: 7, startY: 8 });
    } finally {
      adapter.stop();
    }
  });

  it('should destroy Panzoom on unmount', async () => {
    const { unmount } = render(<SvgViewer artifact={geometry} />);
    await waitFor(() => {
      expect(mocks.panzoom).toHaveBeenCalledOnce();
    });

    unmount();

    expect(panzoomInstance.destroy).toHaveBeenCalledOnce();
  });
});
