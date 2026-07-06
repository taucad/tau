// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanzoomObject, PanzoomOptions } from '@panzoom/panzoom';
import type { GeometrySvg } from '@taucad/types';
import { SvgViewer } from '#components/geometry/graphics/svg/svg-viewer.js';

type CameraEvent = {
  readonly type: string;
  readonly reset?: () => void;
};

type GraphicsEvent = {
  readonly fov?: number;
  readonly position?: number;
  readonly type: string;
  readonly zoom?: number;
};

const mocks = vi.hoisted(() => ({
  cameraSend: vi.fn<(event: CameraEvent) => void>(),
  graphicsSend: vi.fn<(event: GraphicsEvent) => void>(),
  panzoom: vi.fn<(element: Element, options: PanzoomOptions) => PanzoomObject>(),
  screenshotSend: vi.fn<(event: { readonly type: string }) => void>(),
}));

vi.mock('@panzoom/panzoom/dist/panzoom.es.js', () => ({
  default: mocks.panzoom,
}));

vi.mock('#hooks/use-graphics.js', () => ({
  useCameraCapability: () => ({ send: mocks.cameraSend }),
  useGraphics: () => ({ send: mocks.graphicsSend }),
  useGraphicsSelector: <T,>(
    selector: (state: { context: { gridSizes: { largeSize: number; smallSize: number } } }) => T,
  ) => selector({ context: { gridSizes: { largeSize: 10, smallSize: 1 } } }),
  useScreenshotCapability: () => ({ send: mocks.screenshotSend }),
}));

vi.mock('#hooks/use-theme.js', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- mirrors the production Theme enum shape.
  Theme: { LIGHT: 'light' },
  useTheme: () => ({ theme: 'light' }),
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
// oxlint-disable-next-line tau-lint/no-hardcoded-color -- test asserts staging SVG grid parity.
const expectedLightGridStroke = 'rgba(128, 128, 128, 0.15)';
const geometry: GeometrySvg = {
  format: 'svg',
  content: `<svg viewBox="0 0 20 10"><script>alert("x")</script><path d="M0 0 C5 10 15 10 20 0" fill="none" stroke="${testStrokeColor}" stroke-width="1" vector-effect="non-scaling-stroke"/></svg>`,
};

const legacyStrokedGeometry: GeometrySvg = {
  format: 'svg',
  content: `<svg viewBox="-3.2 -33.31 26.4 56.63"><script>alert("x")</script><path d="M 0 0 C 5.78509 -6.8944 14.21491 -6.8944 20 0" fill="none" stroke="${testStrokeColor}"/></svg>`,
};

let panzoomInstance: PanzoomObject;
let originalResizeObserver: typeof ResizeObserver;

beforeEach(() => {
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

const getRegisteredReset = (): (() => void) => {
  const event = mocks.cameraSend.mock.calls
    .map(([payload]) => payload)
    .find((payload) => payload.type === 'registerReset');
  expect(event).toBeDefined();
  expect(typeof event.reset).toBe('function');
  return event.reset;
};

describe('SvgViewer', () => {
  it('should render sanitized SVG document content inside a Panzoom viewport', async () => {
    render(<SvgViewer geometry={geometry} />);

    await waitFor(() => {
      expect(mocks.panzoom).toHaveBeenCalledOnce();
    });

    const root = document.querySelector('#panzoom-root');
    expect(root?.tagName.toLowerCase()).toBe('g');
    expect(document.querySelector('script')).toBeNull();
    const geometryPath = document.querySelector('[data-slot="geometry"] path');
    expect(geometryPath?.getAttribute('stroke')).toBe(testStrokeColor);
    expect(geometryPath?.getAttribute('stroke-width')).toBe('1');
    expect(geometryPath?.getAttribute('vector-effect')).toBe('non-scaling-stroke');

    const gridPaths = [...document.querySelectorAll('pattern path')];
    expect(gridPaths).toHaveLength(2);
    const [smallGridPath, largeGridPath] = gridPaths;
    expect(smallGridPath?.getAttribute('stroke')).toBe(expectedLightGridStroke);
    expect(smallGridPath?.getAttribute('stroke-width')).toBe('2');
    expect(smallGridPath?.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    expect(smallGridPath?.hasAttribute('stroke-opacity')).toBe(false);
    expect(largeGridPath?.getAttribute('stroke')).toBe(expectedLightGridStroke);
    expect(largeGridPath?.getAttribute('stroke-width')).toBe('4');
    expect(largeGridPath?.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    expect(largeGridPath?.hasAttribute('stroke-opacity')).toBe(false);

    expect(typeof getRegisteredReset()).toBe('function');
    const [target, options] = mocks.panzoom.mock.calls[0]!;
    expect(target).toBe(root);
    expect(options).toMatchObject({
      animate: true,
      canvas: true,
      cursor: 'auto',
      maxScale: 10_000,
      minScale: 1e-5,
      step: 0.1,
    });
    const { setTransform } = options;
    expect(typeof setTransform).toBe('function');
    if (typeof setTransform !== 'function') {
      throw new TypeError('expected Panzoom setTransform option');
    }
    setTransform(root as SVGElement, { scale: 2, x: 12, y: 34 }, options);
    expect(panzoomInstance.setStyle).toHaveBeenCalledWith('transform', 'scale(2)');
  });

  it('should apply constant-screen stroke defaults to sanitized stroked geometry paths', async () => {
    render(<SvgViewer geometry={legacyStrokedGeometry} />);

    await waitFor(() => {
      expect(mocks.panzoom).toHaveBeenCalledOnce();
    });

    expect(document.querySelector('script')).toBeNull();
    const geometryPath = document.querySelector('[data-slot="geometry"] path');
    expect(geometryPath?.getAttribute('stroke')).toBe(testStrokeColor);
    expect(geometryPath?.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    expect(geometryPath?.hasAttribute('stroke-width')).toBe(false);
  });

  it('should zoom with the mouse wheel and notify graphics state on Panzoom changes', async () => {
    render(<SvgViewer geometry={geometry} />);
    await waitFor(() => {
      expect(mocks.panzoom).toHaveBeenCalledOnce();
    });

    const root = document.querySelector('#panzoom-root');
    const container = root?.closest('div');
    expect(root?.tagName.toLowerCase()).toBe('g');
    expect(container).toBeInstanceOf(HTMLDivElement);
    if (!root || !container) {
      throw new Error('expected SVG Panzoom root and container');
    }

    const wheelEvent = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -1 });
    act(() => {
      container.dispatchEvent(wheelEvent);
    });

    expect(wheelEvent.defaultPrevented).toBe(true);
    const [scale, point] = vi.mocked(panzoomInstance.zoomToPoint).mock.calls[0]!;
    expect(scale).toBe(1.1);
    expect(typeof point.clientX).toBe('number');
    expect(typeof point.clientY).toBe('number');

    vi.mocked(panzoomInstance.getScale).mockReturnValue(2);
    vi.mocked(panzoomInstance.getPan).mockReturnValue({ x: 4, y: 6 });

    act(() => {
      root.dispatchEvent(new Event('panzoomchange'));
      root.dispatchEvent(new Event('panzoomzoom'));
    });

    const patternTransforms = [...document.querySelectorAll('pattern')].map((pattern) =>
      pattern.getAttribute('patternTransform'),
    );
    expect(patternTransforms).toEqual(['translate(0 0)', 'translate(0 0)']);

    const controlsEvent = mocks.graphicsSend.mock.calls
      .map(([payload]) => payload)
      .find((payload) => payload.type === 'controlsChanged');
    expect(controlsEvent?.fov).toBe(60);
    expect(typeof controlsEvent?.position).toBe('number');
    expect(controlsEvent?.zoom).toBe(2);
  });

  it('should reset the SVG camera through the shared camera capability', async () => {
    render(<SvgViewer geometry={geometry} />);
    await waitFor(() => {
      expect(mocks.panzoom).toHaveBeenCalledOnce();
    });

    act(() => {
      getRegisteredReset()();
    });

    expect(panzoomInstance.zoomToPoint).toHaveBeenCalledWith(1, { clientX: 400, clientY: 300 });
    expect(panzoomInstance.pan).toHaveBeenCalledWith(0, 0, { animate: false });
  });

  it('should destroy Panzoom on unmount', async () => {
    const { unmount } = render(<SvgViewer geometry={geometry} />);
    await waitFor(() => {
      expect(mocks.panzoom).toHaveBeenCalledOnce();
    });

    unmount();

    expect(panzoomInstance.destroy).toHaveBeenCalledOnce();
  });
});
