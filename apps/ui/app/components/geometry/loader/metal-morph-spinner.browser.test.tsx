import { render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ChatActivitySpinner } from '#components/chat/chat-activity-spinner.js';
import { getMetalMorphSpinnerService } from '#components/geometry/loader/metal-morph-spinner-service.js';

/**
 * The invariant the shared spinner service exists to hold, against a real GPU context rather than a mock: a
 * page full of working chat rows opens one renderer, and every one of those rows still receives pixels.
 *
 * A browser hands a page sixteen live WebGL 2 contexts and silently evicts the oldest beyond that, so the
 * count below is the difference between a chat history that keeps drawing and one whose earlier rows go
 * blank mid-turn.
 */

const spinnerCount = 20;
/** The software rasteriser in CI needs room to bake the environment and compile the body. */
const warmUpTimeout = 120_000;

const mountSpinners = (count: number): ReturnType<typeof render> =>
  render(
    <div style={{ display: 'flex', flexWrap: 'wrap', width: '640px' }}>
      {Array.from({ length: count }, (_unused, index) => (
        <ChatActivitySpinner key={index} className='spinner-probe' />
      ))}
    </div>,
  );

const canvases = (container: HTMLElement): HTMLCanvasElement[] => [
  ...container.querySelectorAll<HTMLCanvasElement>('canvas'),
];

const hasPaintedPixels = (canvas: HTMLCanvasElement): boolean => {
  const context = canvas.getContext('2d');
  if (!context || canvas.width === 0) {
    return false;
  }
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let offset = 3; offset < data.length; offset += 4) {
    if ((data[offset] ?? 0) > 0) {
      return true;
    }
  }
  return false;
};

describe('metal morph spinner service in a real browser', () => {
  beforeAll(() => {
    // The sixteen-context cap this suite exists for is a WebGL 2 limit, and a headless WebGPU adapter loses
    // its device seconds after creation, so pin the backend through the product's own query override.
    globalThis.history.replaceState(undefined, '', '?graphicsBackend=webgl');
    // The app's stylesheet is not loaded here, and a spinner with no box never intersects the viewport, so
    // it would hold still exactly as it is meant to offscreen. Give the probes the size a chat row does.
    const style = document.createElement('style');
    style.textContent =
      '.spinner-probe { display: inline-block; width: 16px; height: 16px; }\n' +
      '.spinner-probe canvas { display: block; width: 100%; height: 100%; }';
    document.head.append(style);
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it(
    'should open one renderer for a page full of working chat rows',
    async () => {
      const view = mountSpinners(spinnerCount);
      const service = getMetalMorphSpinnerService();

      await vi.waitFor(
        () => {
          expect(service.getDiagnostics().subscriberCount).toBe(spinnerCount);
          expect(service.getDiagnostics().rendererCount).toBe(1);
        },
        { timeout: warmUpTimeout, interval: 100 },
      );

      const diagnostics = service.getDiagnostics();
      expect(diagnostics.rendererCount).toBe(1);
      expect(diagnostics.subscriberCount).toBe(spinnerCount);
      expect(diagnostics.sourceSize).toBeGreaterThanOrEqual(32);
      expect(diagnostics.backend).toMatch(/webgpu|webgl2/);

      view.unmount();
    },
    warmUpTimeout,
  );

  it(
    'should paint every spinner, including the last one mounted',
    async () => {
      const view = mountSpinners(spinnerCount);
      const service = getMetalMorphSpinnerService();

      await vi.waitFor(
        () => {
          expect(service.getDiagnostics().rendererCount).toBe(1);
        },
        { timeout: warmUpTimeout, interval: 100 },
      );
      const mounted = canvases(view.container);
      expect(mounted).toHaveLength(spinnerCount);

      // Past a per-row renderer the browser would have evicted the earliest contexts; here the twentieth row
      // receives the same frame as the first.
      await vi.waitFor(
        () => {
          expect(hasPaintedPixels(mounted.at(-1)!)).toBe(true);
        },
        { timeout: warmUpTimeout, interval: 100 },
      );

      expect(hasPaintedPixels(mounted[0]!)).toBe(true);
      expect(hasPaintedPixels(mounted.at(-1)!)).toBe(true);

      view.unmount();
    },
    warmUpTimeout,
  );
});
