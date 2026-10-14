import '#test/browser.css';
import { cleanup, render } from '@testing-library/react';
import { useFrame } from '@react-three/fiber';
import type { RootState } from '@react-three/fiber';
import { useRef } from 'react';
import type { Mesh } from 'three';
import { Vector4 } from 'three';
import { createActor, createAsyncLogic } from 'xstate';
import { afterEach, describe, expect, inject, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { GraphicsProvider } from '#hooks/use-graphics.jsx';
import { graphicsMachine } from '#machines/graphics.machine.js';
import {
  captureRendererOutput,
  createRendererOutputCanvas,
  disposeRendererOutput,
  installRendererOutput,
} from '@taucad/runtime-testing/browser/three-renderer-output';
import type * as RendererModule from '#graphics/three/renderer.js';
import { ThreeCanvasInstance } from '#graphics/three/three-canvas-instance.jsx';

const renderers = new Set<Awaited<ReturnType<typeof RendererModule.createRenderer>>>();
vi.mock('#graphics/three/renderer.js', async (importOriginal) => {
  const original = await importOriginal<typeof RendererModule>();
  return {
    ...original,
    createRenderer: async (...args: Parameters<typeof original.createRenderer>) => {
      const renderer = await original.createRenderer(...args);
      installRendererOutput(renderer, inject('webGpuProfile'));
      renderers.add(renderer);
      return renderer;
    },
  };
});

const actors: Array<{ stop: () => void }> = [];

afterEach(async () => {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
  }
  await Promise.all(Array.from(renderers, async (renderer) => disposeRendererOutput(renderer)));
  renderers.clear();
  vi.restoreAllMocks();
  cleanup();
  for (const actor of actors.splice(0)) {
    actor.stop();
  }
});

describe('viewer resize demand-frame continuation', () => {
  it('should finish a visible animation invalidated from the prepaint resize frame', async () => {
    await page.viewport(1280, 800);
    const actor = createActor(
      graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
      { input: {} },
    ).start();
    actors.push(actor);
    let renderedWidth = 0;
    let renderedAngle = 0;
    let animationSteps = 0;
    let targetWidth = 0;

    function AnimatedMesh(): React.JSX.Element {
      const meshRef = useRef<Mesh>(null);
      useFrame((state) => {
        if (state.size.width !== targetWidth || animationSteps >= 8 || !meshRef.current) {
          return;
        }
        animationSteps += 1;
        meshRef.current.rotation.y = animationSteps / 10;
        if (animationSteps < 8) {
          // Controls damping and gizmo motion also request their next frame here.
          state.invalidate();
        }
      }, -1);
      useFrame((state) => {
        renderedWidth = state.size.width;
        renderedAngle = meshRef.current?.rotation.y ?? 0;
      }, 4);
      return (
        <mesh ref={meshRef}>
          <boxGeometry />
          <meshStandardMaterial />
        </mesh>
      );
    }

    const view = render(
      <div data-testid='animated-viewer' style={{ width: 900, height: 550 }}>
        <GraphicsProvider graphicsRef={actor}>
          <ThreeCanvasInstance graphicsBackend='webgl' onRetry={() => undefined}>
            <AnimatedMesh />
          </ThreeCanvasInstance>
        </GraphicsProvider>
      </div>,
    );
    await vi.waitFor(
      () => {
        expect(renderedWidth).toBe(900);
      },
      { timeout: 45_000 },
    );
    targetWidth = 640;
    view.getByTestId('animated-viewer').style.width = `${targetWidth}px`;

    await vi.waitFor(() => {
      expect(renderedAngle).toBe(0.8);
    });
    expect(renderedWidth).toBe(targetWidth);
    expect(animationSteps).toBe(8);
  });
});

it.each(['webgl', 'webgpu'] as const)(
  'should keep every %s viewport sized through native fullscreen and pane changes',
  async (backend) => {
    await page.viewport(1280, 800);
    const states = new Map<string, RootState>();
    const mismatches: Array<{ name: string; size: number[]; viewport: number[] }> = [];
    const viewport = new Vector4();
    const captures = new Map<string, ReturnType<typeof Promise.withResolvers<Uint8ClampedArray>>>();
    function Probe({ name }: { readonly name: string }): undefined {
      useFrame((state) => {
        states.set(name, state);
        const capture = captures.get(name);
        if (capture) {
          captures.delete(name);
          capture.resolve(captureRendererOutput(state.gl));
        }
        state.gl.getViewport(viewport);
        if (viewport.z !== state.size.width || viewport.w !== state.size.height) {
          mismatches.push({ name, size: [state.size.width, state.size.height], viewport: viewport.toArray() });
        }
      }, 4);
      return undefined;
    }
    const viewers = ['Primary', 'Secondary'].map((name) => {
      const actor = createActor(
        graphicsMachine.provide({
          actors: { probeWebGpu: createAsyncLogic({ run: async () => backend === 'webgpu' }) },
        }),
        { input: {} },
      ).start();
      actors.push(actor);
      return (
        <div key={name} role='img' aria-label={name} style={{ width: 480, height: 300, position: 'relative' }}>
          <button
            type='button'
            className='absolute z-10'
            onClick={(event) => {
              void event.currentTarget.parentElement!.requestFullscreen();
            }}
          >
            Fullscreen {name}
          </button>
          <GraphicsProvider graphicsRef={actor}>
            <ThreeCanvasInstance enableGizmo enableGrid graphicsBackend={backend} onRetry={() => undefined}>
              <Probe name={name} />
            </ThreeCanvasInstance>
          </GraphicsProvider>
        </div>
      );
    });
    const view = render(<div className='flex'>{viewers}</div>);
    await vi.waitFor(
      () => {
        expect(states.size).toBe(2);
        for (const state of states.values()) {
          expect(state.size.width).toBe(480);
        }
      },
      { timeout: 45_000 },
    );
    const primary = view.getByRole('img', { name: 'Primary' });
    const secondary = view.getByRole('img', { name: 'Secondary' });
    const primaryRenderer = states.get('Primary')!.gl;
    const secondaryRenderer = states.get('Secondary')!.gl;
    const primaryCanvas = primaryRenderer.domElement;
    const secondaryCanvas = secondaryRenderer.domElement;
    const capture = async (name: string): Promise<Uint8ClampedArray> => {
      const request = Promise.withResolvers<Uint8ClampedArray>();
      captures.set(name, request);
      states.get(name)!.invalidate();
      return request.promise;
    };
    const check = (): void => {
      for (const [name, element] of [
        ['Primary', primary],
        ['Secondary', secondary],
      ] as const) {
        const state = states.get(name)!.get();
        const { width, height } = element.getBoundingClientRect();
        expect(state.size.width).toBe(width);
        expect(state.size.height).toBe(height);
        expect(state.gl.getViewport(viewport).toArray()).toEqual([0, 0, width, height]);
        expect(state.gl.domElement.width).toBe(Math.floor(width * state.viewport.dpr));
        expect(state.gl.domElement.height).toBe(Math.floor(height * state.viewport.dpr));
        expect(state.camera.projectionMatrix.elements[5] / state.camera.projectionMatrix.elements[0]).toBeCloseTo(
          width / height,
        );
      }
      expect(states.get('Primary')!.gl.domElement).toBe(primaryCanvas);
      expect(states.get('Secondary')!.gl.domElement).toBe(secondaryCanvas);
    };
    await capture('Primary');
    await capture('Secondary');
    await userEvent.click(view.getByRole('button', { name: 'Fullscreen Primary' }));
    await vi.waitFor(
      () => {
        expect(document.fullscreenElement).toBe(primary);
        expect(primary.clientWidth).toBeGreaterThan(480);
        check();
      },
      { timeout: 10_000 },
    );
    let pixels: Uint8ClampedArray = new Uint8ClampedArray();
    await vi.waitFor(
      async () => {
        pixels = await capture('Primary');
        // The grid must reach the newly exposed right side, not stop at the old viewport edge.
        const x = Math.floor(primaryCanvas.width * 0.9);
        let visible = 0;
        for (let y = Math.floor(primaryCanvas.height * 0.7); y < primaryCanvas.height; y += 1) {
          const offset = (y * primaryCanvas.width + x) * 4;
          if (pixels[offset + 3]! > 0 && pixels[offset]! < 245) {
            visible += 1;
          }
        }
        expect(visible).toBeGreaterThan(10);
      },
      { timeout: 15_000 },
    );
    const snapshot = createRendererOutputCanvas({ renderer: primaryRenderer, pixels });
    primary.append(snapshot);
    try {
      await page.screenshot({
        path: `../../../../../out/test-results/viewer-resize-investigation/${backend}-fullscreen.png`,
      });
    } finally {
      snapshot.remove();
    }
    await document.exitFullscreen();
    await vi.waitFor(check);
    // Changing two panes together must resize each renderer exactly once.
    const primarySizes = vi.spyOn(primaryRenderer, 'setSize');
    const secondarySizes = vi.spyOn(secondaryRenderer, 'setSize');
    primary.style.width = '640px';
    secondary.style.width = '320px';
    await vi.waitFor(check);
    expect(primarySizes).toHaveBeenCalledOnce();
    expect(secondarySizes).toHaveBeenCalledOnce();
    primary.style.display = 'none';
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });
    primary.style.width = '400px';
    primary.style.display = '';
    await vi.waitFor(check);
    await capture('Primary');
    await capture('Secondary');
    expect(mismatches).toEqual([]);
  },
  // Two native WebGPU devices compile their pipelines under the software qualification profile.
  120_000,
);
