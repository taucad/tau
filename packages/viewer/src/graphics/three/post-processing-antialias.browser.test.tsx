import '#test/browser.css';
import { cleanup, render } from '@testing-library/react';
import { useFrame } from '@react-three/fiber';
import type { RootState } from '@react-three/fiber';
import { DataTexture, NearestFilter, RGBAFormat } from 'three';
import { createActor, createAsyncLogic } from 'xstate';
import { afterEach, expect, inject, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { GraphicsProvider } from '#hooks/use-graphics.jsx';
import { graphicsMachine } from '#machines/graphics.machine.js';
import { ThreeCanvasInstance } from '#graphics/three/three-canvas-instance.jsx';
import { isViewportWebGpu } from '#graphics/three/viewport-cad-renderer.js';
import type * as rendererModule from '#graphics/three/renderer.js';
import {
  captureRendererOutput,
  disposeRendererOutput,
  installRendererOutput,
} from '@taucad/runtime-testing/browser/three-renderer-output';

vi.mock('#graphics/three/renderer.js', async (importOriginal) => {
  const actual = await importOriginal<typeof rendererModule>();
  return {
    ...actual,
    createRenderer: async (...args: Parameters<typeof actual.createRenderer>) => {
      const renderer = await actual.createRenderer(...args);
      installRendererOutput(renderer, inject('webGpuProfile'));
      return renderer;
    },
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it.each(['webgl', 'webgpu'] as const)('should smooth shader edges in the final %s image', async (backend) => {
  await page.viewport(600, 500);
  const actor = createActor(
    graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => backend === 'webgpu' }) } }),
    { input: { enablePostProcessing: true } },
  ).start();
  // Nearest-filtered diagonal is a shader edge: geometry MSAA alone cannot smooth it.
  const pixels = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const offset = (y * 64 + x) * 4;
      pixels.fill(x > y * 0.37 + 18 ? 255 : 0, offset, offset + 3);
      pixels[offset + 3] = 255;
    }
  }
  const texture = new DataTexture(pixels, 64, 64, RGBAFormat);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.needsUpdate = true;
  let smoothed = 0;
  let dark = 0;
  let bright = 0;
  let state: RootState | undefined;
  let pending: Promise<void> | undefined;
  let retired = false;
  let captureError: Error | undefined;
  const measure = async (current: RootState): Promise<void> => {
    try {
      const data = await captureRendererOutput(current.gl);
      smoothed = 0;
      dark = 0;
      bright = 0;
      for (let index = 0; index < data.length; index += 4) {
        if (data[index + 3] !== 255) {
          continue;
        }
        const value = data[index]!;
        if (value > 25 && value < 215) {
          smoothed += 1;
        } else if (value < 5) {
          dark += 1;
        } else if (value > 230) {
          bright += 1;
        }
      }
    } catch (error) {
      captureError = error instanceof Error ? error : new Error(String(error));
    } finally {
      pending = undefined;
    }
  };
  const Probe = (): undefined => {
    useFrame((current) => {
      state = current;
      if (!pending && !retired) {
        pending = measure(current);
      }
    }, 4);
    return undefined;
  };
  try {
    render(
      <div style={{ width: 256, height: 256 }}>
        <GraphicsProvider
          graphicsRef={actor}
          seed={{
            camera: {
              cameraView: {
                frameId: 'tau:root',
                target: [0, 0, 0],
                direction: [0, 0, 1],
                up: [0, 1, 0],
                verticalSpan: 4,
                perspectiveZoom: 1,
              },
            },
          }}
        >
          <ThreeCanvasInstance
            graphicsBackend={backend}
            upDirection='y'
            postProcessingSettings={{ intensity: 0, gtaoIntensity: 0 }}
            onRetry={() => undefined}
          >
            <mesh>
              <planeGeometry args={[4, 4]} />
              <meshBasicMaterial map={texture} />
            </mesh>
            <Probe />
          </ThreeCanvasInstance>
        </GraphicsProvider>
      </div>,
    );
    await vi.waitFor(
      () => {
        state?.invalidate();
        if (captureError) {
          throw captureError;
        }
        expect(smoothed, JSON.stringify({ smoothed, dark, bright })).toBeGreaterThan(32);
        expect(dark).toBeGreaterThan(1000);
        expect(bright).toBeGreaterThan(1000);
      },
      { timeout: 45_000 },
    );
    expect(isViewportWebGpu(state!.gl)).toBe(backend === 'webgpu');
    if (isViewportWebGpu(state!.gl)) {
      expect('isWebGPUBackend' in state!.gl.backend && state!.gl.backend.isWebGPUBackend).toBe(true);
      expect(state!.gl.samples).toBe(4);
      expect(state!.gl.reversedDepthBuffer).toBe(true);
    }
  } finally {
    retired = true;
    await pending;
    if (state) {
      await disposeRendererOutput(state.gl);
    }
    cleanup();
    actor.stop();
    texture.dispose();
  }
  if (captureError) {
    throw captureError;
  }
});
