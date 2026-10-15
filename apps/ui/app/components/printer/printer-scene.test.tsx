import type { CanvasProps } from '@react-three/fiber';
import type * as FiberModule from '@react-three/fiber';
import type { RendererInstance } from '@taucad/viewer/graphics/three/renderer';
import type { TauR3fGlFactory } from '@taucad/viewer/graphics/three/canvas-three-gl';
import { act, cleanup, render, screen } from '@testing-library/react';
import { StrictMode, useEffect, useRef, useState } from 'react';
import type { RefCallback } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { PrinterSceneProps } from '#components/printer/printer-scene.js';

const mocks = vi.hoisted(() => ({
  createRenderer: vi.fn<() => Promise<RendererInstance>>(),
  initializations: new Set<Promise<void>>(),
}));
vi.mock('@taucad/viewer/graphics/three/renderer', () => ({ createRenderer: mocks.createRenderer }));
vi.mock('@react-three/fiber', async (importOriginal) => ({
  ...(await importOriginal<typeof FiberModule>()),
  // Exercise the real printer ref and renderer factory without rendering scene children in jsdom.
  Canvas({ gl, ref }: CanvasProps & { ref?: RefCallback<HTMLCanvasElement> }): React.JSX.Element {
    const canvas = useRef<HTMLCanvasElement>(null);
    const [ready, setReady] = useState(false);
    useEffect(() => {
      if (typeof gl !== 'function') {
        throw new TypeError('Printer canvas requires a renderer factory');
      }
      const defaults = mock<Parameters<TauR3fGlFactory>[0]>();
      defaults.canvas = canvas.current!;
      const initialize = async (): Promise<void> => {
        await gl(defaults);
        setReady(true);
      };
      mocks.initializations.add(initialize());
    }, [gl]);
    return (
      <canvas
        aria-label={ready ? 'Ready printer canvas' : 'Loading printer canvas'}
        ref={(node) => {
          canvas.current = node;
          ref?.(node);
        }}
      />
    );
  },
}));

const { PrinterScene } = await import('#components/printer/printer-scene.js');
const createProps = (): PrinterSceneProps =>
  mock<PrinterSceneProps>({
    geometry: mock<PrinterSceneProps['geometry']>({ enclosure: { center: [0, 0, 0], size: [100, 100, 100] } }),
    preparedBounds: { min: [0, 0, 0], max: [20, 20, 20] },
    isWholePrinter: true,
    onContextLost: vi.fn(),
  });
const createRenderer = (): RendererInstance => mock<RendererInstance>({ getPixelRatio: () => 1 });

afterEach(() => {
  cleanup();
  mocks.initializations.clear();
  vi.clearAllMocks();
});

describe('PrinterScene renderer lifetime', () => {
  it('should dispose a closed view once while retaining the other live canvas through StrictMode replay', async () => {
    const firstRenderer = createRenderer();
    const secondRenderer = createRenderer();
    mocks.createRenderer.mockResolvedValueOnce(firstRenderer).mockResolvedValueOnce(secondRenderer);
    const first = render(
      <StrictMode>
        <PrinterScene {...createProps()} />
      </StrictMode>,
    );
    await act(async () => undefined);
    await screen.findByLabelText('Ready printer canvas');
    const second = render(
      <StrictMode>
        <PrinterScene {...createProps()} />
      </StrictMode>,
    );
    await act(async () => undefined);
    await vi.waitFor(() => {
      expect(screen.getAllByLabelText('Ready printer canvas')).toHaveLength(2);
    });
    const retainedCanvas = second.container.querySelector('canvas');
    expect(firstRenderer.dispose).not.toHaveBeenCalled();
    expect(secondRenderer.dispose).not.toHaveBeenCalled();

    first.unmount();
    await act(async () => undefined);
    expect(firstRenderer.dispose).toHaveBeenCalledOnce();
    expect(secondRenderer.dispose).not.toHaveBeenCalled();
    expect(second.container.querySelector('canvas')).toBe(retainedCanvas);
    expect(retainedCanvas).toHaveAttribute('aria-label', 'Ready printer canvas');

    second.unmount();
    await act(async () => undefined);
    expect(firstRenderer.dispose).toHaveBeenCalledOnce();
    expect(secondRenderer.dispose).toHaveBeenCalledOnce();
  });

  it('should dispose a renderer that finishes initialization after its printer view closes', async () => {
    const renderer = createRenderer();
    const initialization = Promise.withResolvers<RendererInstance>();
    mocks.createRenderer.mockReturnValueOnce(initialization.promise);
    const view = render(<PrinterScene {...createProps()} />);
    expect(screen.getByLabelText('Loading printer canvas')).toBeInTheDocument();
    view.unmount();
    await act(async () => {
      initialization.resolve(renderer);
      await initialization.promise;
    });
    expect(renderer.dispose).toHaveBeenCalledOnce();
    expect(screen.queryByLabelText('Ready printer canvas')).not.toBeInTheDocument();
  });
});
