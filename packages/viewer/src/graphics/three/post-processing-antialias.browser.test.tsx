import '#test/browser.css';
import { cleanup, render } from '@testing-library/react';
import { useFrame } from '@react-three/fiber';
import { DataTexture, NearestFilter, RGBAFormat } from 'three';
import { createActor, createAsyncLogic } from 'xstate';
import { afterEach, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { GraphicsProvider } from '#hooks/use-graphics.jsx';
import { graphicsMachine } from '#machines/graphics.machine.js';
import { ThreeCanvasInstance } from '#graphics/three/three-canvas-instance.jsx';

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
  const Probe = (): undefined => {
    useFrame(({ gl }) => {
      const copy = document.createElement('canvas');
      copy.width = gl.domElement.width;
      copy.height = gl.domElement.height;
      const context = copy.getContext('2d')!;
      context.drawImage(gl.domElement, 0, 0);
      const { data } = context.getImageData(0, 0, copy.width, copy.height);
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
        expect(smoothed, JSON.stringify({ smoothed, dark, bright })).toBeGreaterThan(32);
        expect(dark).toBeGreaterThan(1000);
        expect(bright).toBeGreaterThan(1000);
      },
      { timeout: 45_000 },
    );
  } finally {
    cleanup();
    actor.stop();
    texture.dispose();
  }
});
