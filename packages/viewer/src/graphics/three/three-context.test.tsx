import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import type { ResolvedGraphicsBackend } from '#graphics/graphics-settings.js';
import { ThreeProvider } from '#graphics/three/three-context.jsx';
import { useWebglContextRef, WebglContextTrackerProvider } from '#hooks/use-webgl-context-tracker.jsx';

const canvas = vi.hoisted(() => ({ cssPixels: 0 }));

vi.mock('#environment/viewer-environment.jsx', () => ({ useViewerFeature: () => false }));
vi.mock('#graphics/three/three-canvas-instance.jsx', () => ({
  ThreeCanvasInstance({
    onSurfaceResize,
  }: Readonly<{ onSurfaceResize?: (cssPixels: number, pixelRatio: number) => void }>): React.JSX.Element {
    useEffect(() => {
      onSurfaceResize?.(canvas.cssPixels, 2);
    }, [onSurfaceResize]);
    return <canvas data-testid='viewer-canvas' />;
  },
}));

const stubDevice = ({ coarse, deviceMemory }: Readonly<{ coarse: boolean; deviceMemory?: number }>): void => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: coarse && query === '(pointer: coarse)', media: query })),
  );
  vi.stubGlobal('navigator', { ...globalThis.navigator, deviceMemory });
};

let trackedBytes: () => number = () => 0;

function BytesProbe(): undefined {
  const ref = useWebglContextRef();
  trackedBytes = () => ref?.getSnapshot().context.bytes ?? 0;
  return undefined;
}

const viewers = (backends: readonly ResolvedGraphicsBackend[]): React.JSX.Element => (
  <WebglContextTrackerProvider>
    <BytesProbe />
    {backends.map((backend, index) => (
      // oxlint-disable-next-line react/no-array-index-key -- fixed list of viewer panes
      <ThreeProvider key={index} graphicsBackend={backend} />
    ))}
  </WebglContextTrackerProvider>
);

/** Opens the panes one after another, as a person does, so each admission sees the panes before it. */
const renderViewers = (backends: readonly ResolvedGraphicsBackend[]) => {
  const result = render(viewers(backends.slice(0, 1)));
  for (let open = 2; open <= backends.length; open++) {
    result.rerender(viewers(backends.slice(0, open)));
  }
  return result;
};

describe('ThreeProvider context admission', () => {
  beforeEach(() => {
    // A 4000x3000 CSS window at DPR 2: about 2.9 GiB of estimated surface for a full-window viewer.
    vi.stubGlobal('innerWidth', 4000);
    vi.stubGlobal('innerHeight', 3000);
    vi.stubGlobal('devicePixelRatio', 2);
    canvas.cssPixels = 4000 * 3000;
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('should count WebGPU viewers against the phone context limit', () => {
    stubDevice({ coarse: true });
    canvas.cssPixels = 390 * 844;

    renderViewers(['webgpu', 'webgpu', 'webgpu']);

    expect(screen.getAllByTestId('viewer-canvas')).toHaveLength(2);
    expect(screen.getByText('Too many viewers open')).toBeTruthy();
  });

  it('should refuse a viewer whose surface would exceed the device budget', () => {
    stubDevice({ coarse: false, deviceMemory: 8 });

    renderViewers(['webgl', 'webgl']);

    expect(screen.getAllByTestId('viewer-canvas')).toHaveLength(1);
    expect(screen.getByText('Too many viewers open')).toBeTruthy();
  });

  it('should admit further viewers once mounted canvases report their real size', () => {
    stubDevice({ coarse: false, deviceMemory: 8 });
    canvas.cssPixels = 800 * 600;

    renderViewers(['webgl', 'webgl', 'webgl']);

    expect(screen.getAllByTestId('viewer-canvas')).toHaveLength(3);
    expect(trackedBytes()).toBe(3 * 800 * 600 * 4 * 64);
  });

  it('should return a viewer surface to the budget when it unmounts', () => {
    stubDevice({ coarse: false, deviceMemory: 8 });
    canvas.cssPixels = 800 * 600;
    const { rerender } = renderViewers(['webgl', 'webgl']);
    expect(trackedBytes()).toBe(2 * 800 * 600 * 4 * 64);

    rerender(viewers(['webgl']));

    expect(trackedBytes()).toBe(800 * 600 * 4 * 64);
  });
});
