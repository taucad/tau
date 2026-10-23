import { KeyboardProvider } from '@taucad/ui/components/keyboard';
import { AxesHelper } from '#graphics/three/react/axes-helper.jsx';
import type { Group } from 'three';
import { GltfMesh } from '#graphics/three/react/gltf-mesh.jsx';
import '#test/browser.css';
import { cleanup, render } from '@testing-library/react';
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { createPortal, useFrame, useThree } from '@react-three/fiber';
import type { RootState } from '@react-three/fiber';
import {
  BoxGeometry,
  Color,
  DataTexture,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  RGBAFormat,
  Scene,
  OrthographicCamera,
  Vector4,
} from 'three';
import { WebGPUBackend, WebGLBackend, WebGPURenderer } from 'three/webgpu';
import { screenUV, select, uniform } from 'three/tsl';
import type * as fxaaModule from '#graphics/three/fxaa.js';
import { createActor, createAsyncLogic } from 'xstate';
import { afterEach, expect, inject, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { SceneOverlay, useOverlayDepthRestorer } from '#graphics/three/scene-overlay.jsx';
import { GraphicsProvider, useCameraRig, useViewCameraFraming } from '#hooks/use-graphics.jsx';
import { graphicsMachine } from '#machines/graphics.machine.js';
import { ThreeCanvasInstance } from '#graphics/three/three-canvas-instance.jsx';
import { isViewportWebGpu } from '#graphics/three/viewport-cad-renderer.js';
import { syncGltfSurfaceDepthBias } from '#graphics/three/materials/gltf-surface-depth-bias.js';
import { resolveSectionPieces } from '#graphics/section-cuts.js';
import { writeSectionClip } from '#graphics/three/materials/section-clip.js';
import {
  createModelEmphasisResources,
  renderModelEmphasisMask,
  syncModelEmphasisFrame,
  syncModelEmphasisProxies,
} from '#graphics/three/react/model-emphasis-overlay.jsx';
import {
  compositeEmphasisPixels,
  measureEmphasisPixels,
} from '#graphics/three/materials/model-emphasis-pixels.test-utils.js';
import { useSectionClip } from '#graphics/three/react/section-clipping-group.jsx';
import { createSectionStencilCaps } from '#graphics/three/utils/section-stencil-caps.js';
import type * as rendererModule from '#graphics/three/renderer.js';
import type * as preparationModule from '#graphics/three/camera-preparation.js';
import {
  captureRendererOutput as captureInstalledRendererOutput,
  disposeRendererOutput as disposeInstalledRendererOutput,
  installRendererOutput,
} from '@taucad/runtime-testing/browser/three-renderer-output';

const referenceMode = vi.hoisted(() => ({
  manualPreparation: false,
  compareSurfaceFiltering: false,
  surfaceQuality: undefined as { value: number } | undefined,
  preparations: new Set<() => boolean>(),
  forceNodeWebGl2: false,
  validationErrors: [] as string[],
  removeObservers: [] as Array<() => void>,
}));

// The alternative skips surface AA only; actual line/material and overlay paths are unchanged.
vi.mock('#graphics/three/fxaa.js', async (importOriginal) => {
  const actual = await importOriginal<typeof fxaaModule>();
  return {
    ...actual,
    createViewportFxaa: (...args: Parameters<typeof actual.createViewportFxaa>) => {
      if (referenceMode.compareSurfaceFiltering) {
        const quality = uniform(6);
        referenceMode.surfaceQuality = quality;
        const unfiltered = args[1] ? args[1](screenUV) : args[0].sample(screenUV);
        return select<'vec4'>(
          quality.equal(0),
          unfiltered,
          select<'vec4'>(
            quality.equal(12),
            actual.createViewportFxaa(args[0], args[1], 12),
            actual.createViewportFxaa(args[0], args[1], 6),
          ),
        );
      }
      return inject('surfaceAa') === 'off' && args[1] ? args[1](screenUV) : actual.createViewportFxaa(...args);
    },
  };
});

// Control only scheduling; preparation still executes the actual production graph.
vi.mock('#graphics/three/camera-preparation.js', async (importOriginal) => {
  const actual = await importOriginal<typeof preparationModule>();
  return {
    ...actual,
    scheduleCameraPreparation: (...args: Parameters<typeof actual.scheduleCameraPreparation>) => {
      if (!referenceMode.manualPreparation) {
        return actual.scheduleCameraPreparation(...args);
      }
      referenceMode.preparations.add(args[1]);
      return {
        onFrame: () => undefined,
        dispose: () => {
          referenceMode.preparations.delete(args[1]);
        },
      };
    },
  };
});

const captureRendererOutput = async (renderer: rendererModule.RendererInstance): Promise<Uint8ClampedArray> => {
  if (isViewportWebGpu(renderer) && renderer.backend instanceof WebGLBackend) {
    const copy = document.createElement('canvas');
    copy.width = renderer.domElement.width;
    copy.height = renderer.domElement.height;
    const context = copy.getContext('2d');
    if (!context) {
      throw new Error('Node WebGL2 reference requires Canvas2D');
    }
    context.drawImage(renderer.domElement, 0, 0);
    return context.getImageData(0, 0, copy.width, copy.height).data;
  }
  return captureInstalledRendererOutput(renderer);
};
const disposeRendererOutput = async (renderer: rendererModule.RendererInstance): Promise<void> => {
  if (isViewportWebGpu(renderer) && renderer.backend instanceof WebGLBackend) {
    return;
  }
  await disposeInstalledRendererOutput(renderer);
};

vi.mock('#graphics/three/renderer.js', async (importOriginal) => {
  const actual = await importOriginal<typeof rendererModule>();
  return {
    ...actual,
    createRenderer: async (...args: Parameters<typeof actual.createRenderer>) => {
      if (referenceMode.forceNodeWebGl2) {
        const target = args[2];
        const renderer = new WebGPURenderer({
          canvas: 'canvas' in target ? target.canvas : target,
          // eslint-disable-next-line @typescript-eslint/naming-convention -- Three constructor option.
          forceWebGL: true,
          antialias: false,
          samples: 0,
          alpha: true,
          stencil: true,
        });
        await renderer.init();
        renderer.setRenderObjectFunction((...draw) => {
          syncGltfSurfaceDepthBias.call(draw[4], renderer);
          renderer.renderObject(...draw);
        });
        return renderer;
      }
      const renderer = await actual.createRenderer(...args);
      if (isViewportWebGpu(renderer) && renderer.backend instanceof WebGPUBackend) {
        const { device } = renderer.backend as typeof renderer.backend & {
          device: EventTarget;
        };
        const observe = (event: Event): void => {
          const gpuError = event as Event & { error: { message: string } };
          referenceMode.validationErrors.push(gpuError.error.message);
        };
        device.addEventListener('uncapturederror', observe);
        referenceMode.removeObservers.push(() => {
          device.removeEventListener('uncapturederror', observe);
        });
      }
      installRendererOutput(renderer, inject('webGpuProfile'));
      return renderer;
    },
  };
});

afterEach(() => {
  cleanup();
  referenceMode.forceNodeWebGl2 = false;
  referenceMode.compareSurfaceFiltering = false;
  referenceMode.surfaceQuality = undefined;
  referenceMode.manualPreparation = false;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const remove of referenceMode.removeObservers.splice(0)) {
    remove();
  }
  expect(referenceMode.validationErrors.splice(0)).toEqual([]);
});

it.each(
  ['webgl', 'webgpu', 'node-webgl2'].flatMap((execution) => [
    { execution, width: 256, height: 256, dpr: 1 },
    { execution, width: 2560, height: 1440, dpr: 2 },
  ]),
)(
  'should smooth shader edges in the final $execution image at width $width',
  async ({ execution, width, height, dpr }) => {
    referenceMode.forceNodeWebGl2 = execution === 'node-webgl2';
    const backend = execution === 'webgl' ? 'webgl' : 'webgpu';
    vi.stubGlobal('devicePixelRatio', dpr);
    await page.viewport(600, 500);
    const actor = createActor(
      graphicsMachine.provide({
        actors: {
          probeWebGpu: createAsyncLogic({
            run: async () => backend === 'webgpu',
          }),
        },
      }),
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
    let captures = 0;
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
        captures++;
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
      state = useThree();
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
        <div style={{ width, height }}>
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
          // Explicit test frames also exercise the graph when the OS suspends rAF.
          // Software profile reads the final offscreen target, not screen presentation.
          state?.advance(performance.now(), true);
          if (captureError) {
            throw captureError;
          }
          expect(captures).toBeGreaterThanOrEqual(4);
          expect(state?.gl.domElement.width).toBe(width * dpr);
          expect(state?.gl.domElement.height).toBe(height * dpr);
        },
        { timeout: 45_000 },
      );
      expect(isViewportWebGpu(state!.gl)).toBe(backend === 'webgpu');
      if (isViewportWebGpu(state!.gl)) {
        expect(state!.gl.backend).toBeInstanceOf(execution === 'node-webgl2' ? WebGLBackend : WebGPUBackend);
      }
      // This discontinuous shader texture is the negative control for surface-AA-off,
      // not a CAD-line coverage test. Preserve its failure as an explicit tradeoff.
      const diagnostic = JSON.stringify({
        execution,
        width,
        height,
        dpr,
        smoothed,
        dark,
        bright,
        surfaceAa: inject('surfaceAa'),
      });
      if (execution !== 'webgl' && inject('surfaceAa') === 'off') {
        expect(smoothed, diagnostic).toBe(0);
      } else {
        expect(smoothed, diagnostic).toBeGreaterThan(32);
      }
      expect(dark).toBeGreaterThan(1000);
      expect(bright).toBeGreaterThan(1000);
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
  },
);

// A straight wall meets a flat floor. Away from its ends, occlusion must be
// constant along each horizontal row; noise cannot masquerade as surface detail.
it.each(
  (['webgl', 'webgpu', 'node-webgl2'] as const).flatMap((execution) =>
    [1, 2].flatMap((dpr) => [0, 45].map((fov) => ({ execution, dpr, fov }))),
  ),
)('should keep contact AO smooth without erasing it: $execution DPR $dpr FOV $fov', async ({ execution, dpr, fov }) => {
  referenceMode.forceNodeWebGl2 = execution === 'node-webgl2';
  const backend = execution === 'webgl' ? 'webgl' : 'webgpu';
  vi.stubGlobal('devicePixelRatio', dpr);
  await page.viewport(600, 500);
  const actor = createActor(
    graphicsMachine.provide({
      actors: {
        probeWebGpu: createAsyncLogic({
          run: async () => backend === 'webgpu',
        }),
      },
    }),
    { input: { enablePostProcessing: true } },
  ).start();
  let state: RootState | undefined;
  let pending: Promise<void> | undefined;
  let pixels: Uint8ClampedArray | undefined;
  let captureError: Error | undefined;
  let retired = false;
  let movingWall: Mesh | undefined;
  let motionPhase: number | undefined;
  let cameraOriginX = 0;
  let cameraOriginY = 0;
  let wallOriginY = 0;
  let frame = 0;
  let capturedFrame = 0;
  const measure = async (current: RootState): Promise<void> => {
    try {
      const requestedFrame = frame;
      pixels = await captureRendererOutput(current.gl);
      capturedFrame = requestedFrame;
    } catch (error) {
      captureError = error instanceof Error ? error : new Error(String(error));
    } finally {
      pending = undefined;
    }
  };
  const Probe = (): undefined => {
    const currentState = useThree();
    state = currentState;
    useFrame((current) => {
      if (motionPhase === undefined || !movingWall) {
        return;
      }
      current.camera.position.x = cameraOriginX + (motionPhase * 4) / current.gl.domElement.width;
      current.camera.position.y = cameraOriginY + (motionPhase * 4) / current.gl.domElement.width;
      current.camera.updateMatrix();
      current.camera.updateMatrixWorld(true);
      movingWall.matrix.elements[12] = (motionPhase * 2) / current.gl.domElement.width;
      movingWall.matrix.elements[13] = wallOriginY + (motionPhase * 2) / current.gl.domElement.width;
      movingWall.matrixWorldNeedsUpdate = true;
      movingWall.updateMatrixWorld(true);
    }, 0.9);
    useFrame((current) => {
      frame++;
      state = current;
      if (!pending && !retired) {
        pending = measure(current);
      }
    }, 4);
    return undefined;
  };
  const currentWidth = (): number => state?.gl.domElement.width ?? 0;
  try {
    render(
      <div style={{ width: 384, height: 384 }}>
        <GraphicsProvider
          graphicsRef={actor}
          seed={{
            camera: {
              cameraFovAngle: fov,
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
            postProcessingSettings={{
              displayMode: 'ao',
              radiusCssPixels: 24,
            }}
            onRetry={() => undefined}
          >
            <mesh>
              <planeGeometry args={[4, 4]} />
              <meshStandardMaterial />
            </mesh>
            <mesh
              position={[0, 0.5, 0.2]}
              ref={(mesh) => {
                movingWall = mesh ?? undefined;
              }}
            >
              <boxGeometry args={[3, 1, 0.4]} />
              <meshStandardMaterial />
            </mesh>
            <Probe />
          </ThreeCanvasInstance>
        </GraphicsProvider>
      </div>,
    );
    await vi.waitFor(
      () => {
        // Keep at most one readback in flight. Queuing more software frames while
        // waiting for its GPU saturates the queue and makes the oracle time out.
        if (!pending && capturedFrame < 4) {
          state?.advance(performance.now(), true);
        }
        if (captureError) {
          throw captureError;
        }
        const width = currentWidth();
        expect(width).toBe(384 * dpr);
        expect(pixels?.length).toBe(width * width * 4);
        // Admit a completed graph after camera settling; do not wait on the quality assertion.
        expect(capturedFrame).toBeGreaterThanOrEqual(4);
      },
      { timeout: 45_000 },
    );
    retired = true;
    await pending;
    const { width, height } = state!.gl.domElement;
    const measureContact = (image: Uint8ClampedArray): { noise: number; contact: number; residuals: number[] } => {
      const rowNoise: number[] = [];
      const rowMeans: number[] = [];
      const residuals: number[] = [];
      // A planar contact must be uniform along each row, including fractional-pixel motion.
      for (let y = Math.ceil(height * 0.51); y < Math.floor(height * 0.55); y++) {
        const values: number[] = [];
        for (let x = Math.ceil(width * 0.35); x < Math.floor(width * 0.65); x++) {
          values.push(image[(y * width + x) * 4]!);
        }
        const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
        rowMeans.push(mean);
        residuals.push(...values.map((value) => value - mean));
        rowNoise.push(Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length));
      }
      return {
        noise: Math.sqrt(rowNoise.reduce((sum, value) => sum + value ** 2, 0) / rowNoise.length),
        contact: Math.min(...rowMeans),
        residuals,
      };
    };
    cameraOriginX = state!.camera.position.x;
    cameraOriginY = state!.camera.position.y;
    wallOriginY = movingWall!.matrix.elements[13]!;
    const initialImage = new Uint8ClampedArray(pixels!);
    let changedPixels = 0;
    let previous = measureContact(pixels!).residuals;
    // Remove each row's mean to separate the moving contact gradient from grain.
    // Move camera and wall in both axes through subpixel phases.
    for (const phase of [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 0]) {
      motionPhase = phase;
      // Node passes update once per animation frame; synchronous advances would reuse their textures.
      // oxlint-disable-next-line no-await-in-loop -- Each phase must reach a separate GPU frame before changing transforms.
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
      state!.advance(performance.now(), true);
      // oxlint-disable-next-line no-await-in-loop -- Read this phase before submitting the next one.
      const image = await captureRendererOutput(state!.gl);
      changedPixels = Math.max(
        changedPixels,
        image.reduce((count, value, index) => count + Number(index % 4 === 0 && value !== initialImage[index]), 0),
      );
      const sample = measureContact(image);
      const previousResiduals = previous;
      const shimmer = Math.sqrt(
        sample.residuals.reduce((sum, value, i) => sum + (value - previousResiduals[i]!) ** 2, 0) /
          previousResiduals.length,
      );
      const diagnostic = JSON.stringify({
        execution,
        dpr,
        fov,
        phase,
        noise: sample.noise,
        contact: sample.contact,
        shimmer,
      });
      expect(sample.noise, diagnostic).toBeLessThan(0.75);
      expect(shimmer, diagnostic).toBeLessThan(1);
      expect(sample.contact, diagnostic).toBeLessThan(250);
      expect(sample.contact, diagnostic).toBeGreaterThan(80);
      expect(image[(Math.floor(height * 0.8) * width + Math.floor(width / 2)) * 4], diagnostic).toBeGreaterThan(250);
      previous = sample.residuals;
    }
    expect(changedPixels, 'Motion must change the rendered image').toBeGreaterThan(10);
    expect(state!.camera.type).toBe(fov === 0 ? 'OrthographicCamera' : 'PerspectiveCamera');
    expect(isViewportWebGpu(state!.gl)).toBe(backend === 'webgpu');
    if (isViewportWebGpu(state!.gl)) {
      expect(state!.gl.backend).toBeInstanceOf(execution === 'node-webgl2' ? WebGLBackend : WebGPUBackend);
    }
  } finally {
    retired = true;
    await pending;
    if (state) {
      await disposeRendererOutput(state.gl);
    }
    cleanup();
    actor.stop();
  }
});

// A cap is drawn by a child of Scene after post-processing, before the grid/axes overlay.
// Exercise that ownership boundary with flat colours so either lost depth has an unambiguous pixel.
it.each((['webgl', 'webgpu'] as const).flatMap((backend) => ['front', 'behind'].map((cap) => ({ backend, cap }))))(
  'should retain scene and cap depth before later overlays: $backend cap $cap',
  async ({ backend, cap }) => {
    vi.stubGlobal('devicePixelRatio', 1);
    await page.viewport(400, 400);
    const actor = createActor(
      graphicsMachine.provide({
        actors: {
          probeWebGpu: createAsyncLogic({
            run: async () => backend === 'webgpu',
          }),
        },
      }),
      { input: { enablePostProcessing: true } },
    ).start();
    let state: RootState | undefined;
    let pending: Promise<void> | undefined;
    let pixels: Uint8ClampedArray | undefined;
    let captureError: Error | undefined;
    let retired = false;
    let frames = 0;
    let captured = 0;
    const Cap = () => {
      const scene = useMemo(() => new Scene(), []);
      const restoreDepth = useOverlayDepthRestorer();
      useFrame(({ gl, camera }) => {
        restoreDepth();
        const previous = gl.autoClear;
        gl.autoClear = false;
        try {
          gl.render(scene, camera);
        } finally {
          gl.autoClear = previous;
        }
      }, 1.2);
      return createPortal(
        <mesh position={[0, 0, cap === 'front' ? 0.2 : -0.2]}>
          <planeGeometry args={[2, 2]} />
          <meshBasicMaterial color='red' toneMapped={false} />
        </mesh>,
        scene,
      );
    };
    const measure = async (current: RootState): Promise<void> => {
      const requested = frames;
      try {
        pixels = await captureRendererOutput(current.gl);
        captured = requested;
      } catch (error) {
        captureError = error instanceof Error ? error : new Error(String(error));
      } finally {
        pending = undefined;
      }
    };
    const Probe = (): undefined => {
      state = useThree();
      useFrame((current) => {
        frames++;
        if (!pending && !retired) {
          pending = measure(current);
        }
      }, 4);
      return undefined;
    };
    try {
      render(
        <div style={{ width: 128, height: 128 }}>
          <GraphicsProvider
            graphicsRef={actor}
            seed={{
              camera: {
                cameraFovAngle: 0,
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
              onRetry={() => undefined}
              postProcessingSettings={{
                intensity: 0,
                gtaoIntensity: 0,
                toneMapping: 'none',
              }}
            >
              <mesh>
                <planeGeometry args={[4, 4]} />
                <meshBasicMaterial color='blue' toneMapped={false} />
              </mesh>
              <Cap />
              <SceneOverlay overlayActive>
                <mesh position={[0, 0, cap === 'front' ? 0.1 : -0.1]}>
                  <planeGeometry args={[4, 4]} />
                  <meshBasicMaterial color='lime' toneMapped={false} />
                </mesh>
              </SceneOverlay>
              <Probe />
            </ThreeCanvasInstance>
          </GraphicsProvider>
        </div>,
      );
      await vi.waitFor(
        () => {
          if (!pending && captured < 4) {
            state?.advance(performance.now(), true);
          }
          if (captureError) {
            throw captureError;
          }
          expect(captured).toBeGreaterThanOrEqual(4);
        },
        { timeout: 45_000 },
      );
      retired = true;
      await pending;
      const { width } = state!.gl.domElement;
      const centre = [...pixels!.subarray((64 * width + 64) * 4, (64 * width + 64) * 4 + 3)];
      expect(isViewportWebGpu(state!.gl)).toBe(backend === 'webgpu');
      expect(centre, JSON.stringify({ backend, cap, centre })).toEqual(cap === 'front' ? [255, 0, 0] : [0, 0, 255]);
      const outside = [...pixels!.subarray((64 * width + 8) * 4, (64 * width + 8) * 4 + 3)];
      expect(outside).toEqual(cap === 'front' ? [0, 255, 0] : [0, 0, 255]);
    } finally {
      retired = true;
      await pending;
      if (state) {
        await disposeRendererOutput(state.gl);
      }
      cleanup();
      actor.stop();
    }
  },
);

// Decode display bytes before integrating coverage: encoded 188 is ~0.5 linear,
// not 74% uncovered area. Keep perceived core contrast as a separate real-rim gate.
const linearChannel = Array.from({ length: 256 }, (_, value) => {
  const encoded = value / 255;
  return encoded <= 0.04045 ? encoded / 12.92 : ((encoded + 0.055) / 1.055) ** 2.4;
});

// Diagnostic qualification: accepted WebGL is the reference. Integrate contrast
// around isolated strokes so subpixel placement cannot hide width differences.
it.each(
  [
    { dpr: 1, width: 256, height: 256 },
    { dpr: 1.5, width: 256, height: 256 },
    { dpr: 2, width: 256, height: 256 },
    { dpr: 2, width: 2560, height: 1440 },
  ].flatMap((viewport) =>
    [0x00_00_00, 0xff_d5_4a].flatMap((color) =>
      (viewport.dpr === 1 ? [1, 0.5, 1.5] : [1]).map((lineWidth) => ({
        ...viewport,
        color,
        lineWidth,
      })),
    ),
  ),
)(
  'should preserve nominal unlit stroke coverage across phases at DPR $dpr color $color width $width line $lineWidth',
  async ({ dpr, color, width, height, lineWidth }) => {
    vi.stubGlobal('devicePixelRatio', dpr);
    await page.viewport(600, 500);
    const { Vector2 } = await import('three');
    const { createGltfFatLineMaterial, createGltfFatLineSegmentsFromPositions } =
      await import('#graphics/three/materials/gltf-edges.js');
    const phases = [0, 0.25, 0.5, 0.75];
    const centers = phases.flatMap((phase, row) =>
      [0, Math.PI / 2, Math.PI / 4, null].map((angle, column) => ({
        x: 32 + column * 64 + phase,
        y: 32 + row * 64 + phase,
        angle,
      })),
    );
    const positions = new Float32Array(
      centers.flatMap(({ x, y, angle }) => {
        if (angle === null) {
          const radius = 16;
          const point = (index: number) => {
            const theta = -1.25 + (index * 2.5) / 32;
            return [x - 128 - radius + radius * Math.cos(theta), 128 - y + radius * Math.sin(theta), 0.01];
          };
          return Array.from({ length: 32 }, (_, index) => [...point(index), ...point(index + 1)]).flat();
        }
        const dx = Math.cos(angle) * 20;
        const dy = Math.sin(angle) * 20;
        return [x - 128 - dx, 128 - y - dy, 0.01, x - 128 + dx, 128 - y + dy, 0.01];
      }),
    );
    const results: number[][] = [];
    const motionResults: Array<{ energy: number[]; minimumCoverage: number }> = [];
    for (const execution of ['webgl', 'webgpu', 'node-webgl2'] as const) {
      referenceMode.forceNodeWebGl2 = execution === 'node-webgl2';
      const backend = execution === 'webgl' ? 'webgl' : 'webgpu';
      const actor = createActor(
        graphicsMachine.provide({
          actors: {
            probeWebGpu: createAsyncLogic({
              run: async () => backend === 'webgpu',
            }),
          },
        }),
        { input: { enablePostProcessing: true } },
      ).start();
      const material = createGltfFatLineMaterial({
        backend,
        resolution: new Vector2(width, height),
        edgeColor: color,
      });
      if (backend === 'webgpu') {
        material.linewidth = lineWidth;
      }
      const lines = createGltfFatLineSegmentsFromPositions({
        backend,
        positions,
        material,
      });
      if (!lines) {
        throw new Error('Expected non-empty edge fixture');
      }
      let state: RootState | undefined;
      let pending: Promise<void> | undefined;
      let pixels: Uint8ClampedArray | undefined;
      let captureError: Error | undefined;
      let frame = 0;
      let capturedFrame = 0;
      let retired = false;
      const measure = async (current: RootState): Promise<void> => {
        const requestedFrame = frame;
        try {
          pixels = await captureRendererOutput(current.gl);
          capturedFrame = requestedFrame;
        } catch (error) {
          captureError = error instanceof Error ? error : new Error(String(error));
        } finally {
          pending = undefined;
        }
      };
      const Probe = (): undefined => {
        state = useThree();
        useFrame((current) => {
          frame++;
          if (!pending && !retired) {
            pending = measure(current);
          }
        }, 4);
        return undefined;
      };
      try {
        render(
          <div style={{ width, height }}>
            <GraphicsProvider
              graphicsRef={actor}
              seed={{
                camera: {
                  cameraFovAngle: 0,
                  cameraView: {
                    frameId: 'tau:root',
                    target: [0, 0, 0],
                    direction: [0, 0, 1],
                    up: [0, 1, 0],
                    verticalSpan: height,
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
                  <planeGeometry args={[width * 2, height * 2]} />
                  <meshBasicMaterial color={0xff_ff_ff} />
                </mesh>
                <primitive object={lines} />
                <Probe />
              </ThreeCanvasInstance>
            </GraphicsProvider>
          </div>,
        );
        // oxlint-disable-next-line no-await-in-loop -- comparison must dispose one backend before opening the next.
        await vi.waitFor(
          () => {
            if (!pending && capturedFrame < 4) {
              state?.advance(performance.now(), true);
            }
            if (captureError) {
              throw captureError;
            }
            expect(state?.gl.domElement.width).toBe(width * dpr);
            expect(state?.gl.domElement.height).toBe(height * dpr);
            expect(capturedFrame).toBeGreaterThanOrEqual(4);
          },
          { timeout: 45_000 },
        );
        retired = true;
        // oxlint-disable-next-line no-await-in-loop -- drain the final readback before measurement.
        await pending;
        // Synchronous advances share Three's NodeFrame and can capture a cached pass
        // after a preceding case. Qualify only distinct displayed animation frames.
        for (let warm = 0; warm < 3; warm++) {
          // oxlint-disable-next-line no-await-in-loop -- distinct frame identity is the oracle.
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => {
              resolve();
            });
          });
          retired = false;
          state!.advance(performance.now(), true);
          // oxlint-disable-next-line no-await-in-loop -- read the submitted frame before advancing.
          await pending;
          retired = true;
        }
        expect(state!.camera.type).toBe('OrthographicCamera');
        expect(isViewportWebGpu(state!.gl)).toBe(backend === 'webgpu');
        if (isViewportWebGpu(state!.gl)) {
          expect(state!.gl.backend).toBeInstanceOf(execution === 'node-webgl2' ? WebGLBackend : WebGPUBackend);
        }
        expect(pixels![2]!).toBeGreaterThan(200);
        const background = linearChannel[pixels![2]!]!;
        const widths = centers.map(({ x, y }) => {
          const pixelX = x + width / 2 - 128;
          const pixelY = y + height / 2 - 128;
          let contrast = 0;
          for (let row = Math.floor((pixelY - 26) * dpr); row < Math.ceil((pixelY + 26) * dpr); row++) {
            for (let column = Math.floor((pixelX - 26) * dpr); column < Math.ceil((pixelX + 26) * dpr); column++) {
              contrast +=
                (background - linearChannel[pixels![(row * width * dpr + column) * 4 + 2]!]!) /
                (background - linearChannel[color % 256]!);
            }
          }
          return contrast / (40 * dpr * dpr);
        });
        results.push(widths);
        if (width === 2560) {
          // Move the actual geometry through one CSS pixel. This exercises the full
          // production frame, rather than treating unrelated static strokes as history.
          const energy: number[] = [];
          let minimumCoverage = 1;
          for (let step = 0; step < 8; step++) {
            const shift = step / 8;
            lines.position.set(shift, -shift, 0);
            // NodeFrame deduplicates passes within an animation frame.
            // oxlint-disable-next-line no-await-in-loop -- sample distinct frames, not cached pass results.
            await new Promise<void>((resolve) => {
              requestAnimationFrame(() => {
                resolve();
              });
            });
            retired = false;
            state!.advance(performance.now(), true);
            // oxlint-disable-next-line no-await-in-loop -- each motion sample owns its completed frame/readback.
            await pending;
            retired = true;
            const center = centers[3]!;
            const cx = center.x + width / 2 - 128 + shift;
            const cy = center.y + height / 2 - 128 + shift;
            let ink = 0;
            for (let row = Math.floor((cy - 26) * dpr); row < Math.ceil((cy + 26) * dpr); row++) {
              for (let column = Math.floor((cx - 26) * dpr); column < Math.ceil((cx + 26) * dpr); column++) {
                ink +=
                  (background - linearChannel[pixels![(row * width * dpr + column) * 4 + 2]!]!) /
                  (background - linearChannel[color % 256]!);
              }
            }
            energy.push(ink / (40 * dpr * dpr));
            // Probe every join, excluding endpoints. A near-white hole anywhere
            // on the curved stroke fails independently of its integrated ink.
            for (let join = 1; join < 32; join++) {
              const theta = -1.25 + (join * 2.5) / 32;
              const px = Math.round((cx - 16 + 16 * Math.cos(theta)) * dpr);
              const py = Math.round((cy - 16 * Math.sin(theta)) * dpr);
              let coverage = 0;
              for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                  coverage = Math.max(
                    coverage,
                    1 - linearChannel[pixels![((py + dy) * width * dpr + px + dx) * 4 + 2]!]! / background,
                  );
                }
              }
              minimumCoverage = Math.min(minimumCoverage, coverage);
            }
          }
          motionResults.push({ energy, minimumCoverage });
        }
      } finally {
        retired = true;
        // oxlint-disable-next-line no-await-in-loop -- drain owned resources before the next backend.
        await pending;
        if (state) {
          // oxlint-disable-next-line no-await-in-loop -- teardown is sequential.
          await disposeRendererOutput(state.gl);
        }
        cleanup();
        actor.stop();
        lines.geometry.dispose();
        material.dispose();
      }
    }
    if (motionResults.length > 0) {
      const variation = motionResults.map(({ energy }) => Math.max(...energy) - Math.min(...energy));
      console.info(
        'line-motion',
        JSON.stringify({
          dpr,
          width,
          color,
          motionResults,
          variation,
          results,
        }),
      );
      expect(Math.min(...motionResults.map(({ minimumCoverage }) => minimumCoverage))).toBeGreaterThan(0.05);
      for (const candidate of variation.slice(1)) {
        expect(candidate).toBeLessThanOrEqual(variation[0]! + 0.08);
      }
    }
    const differences = results
      .slice(1)
      .flatMap((candidate) => results[0]!.map((value, index) => Math.abs(value - candidate[index]!)));
    // Continuous coverage must match reference weight and stability, not reproduce
    // the reference's discrete MSAA phase jumps. Keep each phase inside the reference
    // envelope, and separately bound mean weight and variation for every orientation.
    const comparisons = results.slice(1).flatMap((candidate) =>
      [0, 1, 2, 3].map((orientation) => {
        const reference = results[0]!.filter((_, index) => index % 4 === orientation);
        const values = candidate.filter((_, index) => index % 4 === orientation);
        const mean = (entries: number[]) => entries.reduce((sum, value) => sum + value, 0) / entries.length;
        const low = Math.min(...reference);
        const high = Math.max(...reference);
        return {
          orientation,
          meanDifference: Math.abs(mean(values) - mean(reference)),
          envelopeExcess: Math.max(0, ...values.map((value) => Math.max(low - value, value - high))),
          extraVariation: Math.max(...values) - Math.min(...values) - (high - low),
        };
      }),
    );
    const accepted = comparisons.every(
      (value) => value.meanDifference <= 0.1 && value.envelopeExcess <= 0.1 && value.extraVariation <= 0.08,
    );
    console.info(
      'line-phase-evidence',
      JSON.stringify({
        dpr,
        color,
        width,
        lineWidth,
        results,
        comparisons,
        maxPhaseDifference: Math.max(...differences),
      }),
    );
    expect(Math.min(...results.flat()), JSON.stringify(results)).toBeGreaterThan(0.05);
    // Real rendered half/double-error controls must fail; the accepted reference is unchanged.
    // Classic remains an unchanged visual comparison, but its FXAA can remove
    // thin-stroke energy. Nominal CSS width, not that loss, owns the coverage oracle.
    const nominal = results.slice(1).every((values) => values.every((value) => Math.abs(value - 1) <= 0.08));
    expect(nominal, JSON.stringify({ dpr, width, height, lineWidth, results, classicParity: accepted })).toBe(
      lineWidth === 1,
    );
    for (let i = 0; i < results[1]!.length; i++) {
      // Two finite endpoints may differ by one raster column between APIs.
      // Bound their area by two physical pixels / stroke length, plus 8-bit rounding.
      expect(Math.abs(results[1]![i]! - results[2]![i]!)).toBeLessThan(2 / (40 * dpr) + 0.005);
    }
  },
);

it.each(
  ['webgl', 'webgpu', 'node-webgl2'].flatMap((execution) =>
    [1, -1].flatMap((side) =>
      (['none', 'neutral'] as const).flatMap((toneMapping) =>
        (execution === 'webgl' ? [128] : [128, 5120]).map((width) => ({
          execution,
          side,
          toneMapping,
          width,
        })),
      ),
    ),
  ),
)(
  'should occlude grid and hidden outlines through actual stencil caps: $execution side $side tone $toneMapping width $width',
  async ({ execution, side, toneMapping, width }) => {
    const height = width === 5120 ? 2880 : 128;
    // Keep world-space probes at the same camera-relative positions when the
    // 5K buffer changes aspect. The independent color overlay fills clip space.
    const offsetAt = (x: number, y: number): number =>
      (Math.floor((y / 128) * height) * width + Math.floor(width / 2 + ((x - 64) / 128) * height)) * 4;
    vi.stubGlobal('devicePixelRatio', 1);
    await page.viewport(400, 400);
    referenceMode.forceNodeWebGl2 = execution === 'node-webgl2';
    const backend = execution === 'webgl' ? 'webgl' : 'webgpu';
    const actor = createActor(
      graphicsMachine.provide({
        actors: {
          probeWebGpu: createAsyncLogic({
            run: async () => backend === 'webgpu',
          }),
        },
      }),
      { input: { enablePostProcessing: true } },
    ).start();
    const geometry = new BoxGeometry(2, 2, 2);
    const material = new MeshBasicMaterial({
      color: 'blue',
      side: DoubleSide,
      toneMapped: false,
    });
    const surface = new Mesh(geometry, material);
    const pieces = resolveSectionPieces([{ id: 'cut', kind: 'plane', plane: 'xy', offset: 0, isFlipped: false }]);
    const caps = createSectionStencilCaps(backend);
    let state: RootState | undefined;
    let outputTransforms = 0;
    let surfaceDraws = 0;
    let reusedSurface = false;
    let measuredOutputTransforms = 0;
    let observedRenderer: RootState['gl'] | undefined;
    let pending: Promise<void> | undefined;
    let pixels: Uint8ClampedArray | undefined;
    let beforeGrid: Uint8ClampedArray | undefined;
    let beforeCaps: Uint8ClampedArray | undefined;
    let capsEnabled = side === 1;
    let grid: Mesh | undefined;
    let captureError: Error | undefined;
    let frame = 0;
    let captured = 0;
    let retired = false;
    const Cap = (): undefined => {
      const clip = useSectionClip();
      useFrame(() => {
        writeSectionClip(clip, pieces);
      }, 0.5);
      const restoreDepth = useOverlayDepthRestorer();
      useFrame(({ gl, camera }) => {
        if (!capsEnabled) {
          return;
        }
        restoreDepth();
        caps.render(gl, {
          camera,
          pieces,
          sources: [
            {
              key: 'box',
              ownerKey: 'box',
              meshes: [surface],
              tintHex: 0xff_00_00,
              edgeHex: 0xff_ff_00,
            },
          ],
          stripes: { stripeFrequency: 1e6, stripeWidth: 0 },
          outlineWidthPixels: 1.5,
          viewportHeightPixels: height,
        });
      }, 1.2);
      return undefined;
    };
    const ColorProbe = (): ReactNode => {
      const overlayScene = useMemo(() => new Scene(), []);
      const camera = useMemo(() => new OrthographicCamera(-1, 1, 1, -1, 0.1, 10), []);
      camera.position.z = 2;
      useFrame(({ gl }) => {
        const previous = gl.autoClear;
        gl.autoClear = false;
        try {
          gl.render(overlayScene, camera);
        } finally {
          gl.autoClear = previous;
        }
      }, 2.2);
      return createPortal(
        <>
          <mesh position={[-0.75, 0.75, 0]}>
            <planeGeometry args={[0.25, 0.25]} />
            <meshBasicMaterial color='#808080' depthTest={false} depthWrite={false} toneMapped={false} />
          </mesh>
          <mesh position={[0.75, 0.75, 0]} renderOrder={1}>
            <planeGeometry args={[0.25, 0.25]} />
            <meshBasicMaterial color='#808080' depthTest={false} depthWrite={false} toneMapped={false} />
          </mesh>
          <mesh position={[0.75, 0.75, 0]} renderOrder={2}>
            <planeGeometry args={[0.25, 0.25]} />
            <meshBasicMaterial
              color='red'
              transparent
              opacity={0.5}
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </>,
        overlayScene,
      );
    };
    const measure = async (current: RootState): Promise<void> => {
      const requestedFrame = frame;
      try {
        pixels = await captureRendererOutput(current.gl);
        captured = requestedFrame;
        if (captured >= 4 && !beforeCaps) {
          beforeCaps = pixels;
          capsEnabled = true;
        }
        if (captured >= 8 && !beforeGrid && grid) {
          beforeGrid = pixels;
          grid.visible = true;
        }
      } catch (error) {
        captureError = error instanceof Error ? error : new Error('Renderer capture failed', { cause: error });
      } finally {
        pending = undefined;
      }
    };
    const Probe = (): undefined => {
      const current = useThree();
      state = current;
      if (current.gl !== observedRenderer && isViewportWebGpu(current.gl)) {
        observedRenderer = current.gl;
        const renderer = current.gl;
        const previous = renderer.getRenderObjectFunction();
        renderer.setRenderObjectFunction((...draw) => {
          if (draw[0] === surface) {
            surfaceDraws++;
          }
          if (draw[0].name === 'Tau reused surface FXAA') {
            reusedSurface = true;
          }
          if (draw[0].name === 'Output Color Transform' || draw[0].name === 'Tau final output') {
            outputTransforms++;
          }
          if (previous) {
            previous(...draw);
          } else {
            renderer.renderObject(...draw);
          }
        });
      }
      useFrame(() => {
        outputTransforms = 0;
        surfaceDraws = 0;
        reusedSurface = false;
      }, 0.9);
      useFrame((current) => {
        measuredOutputTransforms = outputTransforms;
        if (reusedSurface) {
          expect(surfaceDraws, 'One scene acquisition per composition, including nested AO/filter draws').toBe(1);
        }
        frame++;
        if (!pending && !retired) {
          pending = measure(current);
        }
      }, 4);
      return undefined;
    };
    try {
      render(
        <div style={{ width, height }}>
          <GraphicsProvider
            graphicsRef={actor}
            seed={{
              camera: {
                cameraFovAngle: 0,
                cameraView: {
                  frameId: 'tau:root',
                  target: [0, 0, 0],
                  direction: [0.4, 0, side],
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
              onRetry={() => undefined}
              postProcessingSettings={{
                intensity: 0,
                gtaoIntensity: 0,
                toneMapping,
              }}
            >
              <primitive object={surface} />
              <mesh visible={side === -1} position={[0, 0, -1.5]}>
                <boxGeometry args={[2.4, 2.4, 0.1]} />
                <meshBasicMaterial color='magenta' toneMapped={false} />
              </mesh>
              <Cap />
              <SceneOverlay overlayActive>
                <mesh
                  ref={(node) => {
                    grid = node ?? undefined;
                  }}
                  visible={false}
                  position={[0, 0, -0.25]}
                >
                  <planeGeometry args={[4, 4]} />
                  <meshBasicMaterial color='lime' side={DoubleSide} toneMapped={false} />
                </mesh>
              </SceneOverlay>
              <ColorProbe />
              <Probe />
            </ThreeCanvasInstance>
          </GraphicsProvider>
        </div>,
      );
      await vi.waitFor(
        () => {
          if (!pending && captured < 12) {
            state?.advance(performance.now(), true);
          }
          if (captureError) {
            throw captureError;
          }
          expect(captured).toBeGreaterThanOrEqual(12);
        },
        { timeout: 45_000 },
      );
      retired = true;
      await pending;
      // Two compositions can share Three's animation frame (explicit redraw or
      // preparation). Reused scene color must be freshly acquired on each one.
      state!.advance(performance.now(), true);
      state!.advance(performance.now(), true);
      pixels = await captureRendererOutput(state!.gl);
      expect([state!.gl.domElement.width, state!.gl.domElement.height]).toEqual([width, height]);
      if (isViewportWebGpu(state!.gl)) {
        expect(state!.gl.backend).toBeInstanceOf(execution === 'node-webgl2' ? WebGLBackend : WebGPUBackend);
      }
      if (backend === 'webgpu') {
        expect(measuredOutputTransforms, 'one encoding after all cap and overlay draws').toBe(1);
        // Encoded grey and a linear-light 50% red blend distinguish missing/double encoding.
        for (const [x, expected] of [
          [16, [128, 128, 128]],
          [112, [205, 92, 92]],
        ] as const) {
          const offset = (Math.floor(height / 8) * width + Math.floor((x / 128) * width)) * 4;
          const actual = pixels.subarray(offset, offset + 3);
          for (const [channel, value] of expected.entries()) {
            expect(Math.abs(actual[channel]! - value)).toBeLessThanOrEqual(2);
          }
        }
      }
      const occluderColor = [...beforeCaps!.subarray(offsetAt(64, 64), offsetAt(64, 64) + 3)];
      if (side === -1) {
        expect(occluderColor[0]! - occluderColor[1]!).toBeGreaterThan(100);
        expect(occluderColor[2]! - occluderColor[1]!).toBeGreaterThan(100);
      }
      // The cut-facing view is red; the back-facing cut is hidden by a magenta
      // opaque occluder. Neither
      // may contain the later green grid or a yellow hidden cap outline. Compare
      // before/after adding the grid so the existing striped tint is preserved.
      for (let y = 38; y < 90; y++) {
        for (let x = 48; x < 80; x++) {
          const offset = offsetAt(x, y);
          const actual = [...pixels.subarray(offset, offset + 3)];
          expect(actual, `${execution}, side ${side}, ${x},${y}`).toEqual([
            ...beforeGrid!.subarray(offset, offset + 3),
          ]);
          if (side === 1) {
            expect(actual[0]! - actual[1]!).toBeGreaterThan(100);
            expect(Math.abs(actual[1]! - actual[2]!)).toBeLessThanOrEqual(1);
          } else {
            expect(
              actual,
              JSON.stringify({
                execution,
                width,
                toneMapping,
                probe: [x, y],
                beforeCaps: [...beforeCaps!.subarray(offset, offset + 3)],
                beforeGrid: [...beforeGrid!.subarray(offset, offset + 3)],
                occluderCenter: occluderColor,
                captured,
              }),
            ).toEqual(occluderColor);
          }
        }
      }
      if (side === -1) {
        const isOccluderInterior = (x: number, y: number): boolean =>
          [-2, 0, 2].every((dy) =>
            [-2, 0, 2].every((dx) => {
              const offset = offsetAt(x + dx, y + dy);
              return occluderColor.every((value, channel) => beforeCaps![offset + channel] === value);
            }),
          );
        let checked = 0;
        for (let y = 38; y < 90; y++) {
          for (let x = 8; x < 120; x++) {
            if (!isOccluderInterior(x, y)) {
              continue;
            }
            const offset = offsetAt(x, y);
            expect([...beforeGrid!.subarray(offset, offset + 3)], `hidden outline at ${x},${y}`).toEqual(occluderColor);
            checked++;
          }
        }
        expect(checked).toBeGreaterThan(1000);
      }
      expect([...pixels.subarray(offsetAt(20, 64), offsetAt(20, 64) + 3)]).toEqual([0, 255, 0]);
    } finally {
      retired = true;
      await pending;
      if (state) {
        await disposeRendererOutput(state.gl);
      }
      cleanup();
      actor.stop();
      caps.dispose();
      material.dispose();
      geometry.dispose();
    }
  },
);

// Use the live post owner (PBR, AO, retained frame depth, overlays and final encoding),
// not a standalone mask render. The prior native fusion passed isolated mask pixels.
it.each([false, true].flatMap((forceNodeWebGl2) => [256, 2560].map((width) => ({ forceNodeWebGl2, width }))))(
  'should clear persistent emphasis through the production node frame: WebGL2=$forceNodeWebGl2 width=$width',
  async ({ forceNodeWebGl2, width }) => {
    referenceMode.forceNodeWebGl2 = forceNodeWebGl2;
    vi.stubGlobal('devicePixelRatio', 2);
    await page.viewport(500, 500);
    const actor = createActor(
      graphicsMachine.provide({
        actors: {
          probeWebGpu: createAsyncLogic({ run: async () => true }),
        },
      }),
      { input: { enablePostProcessing: true } },
    ).start();
    let state: RootState | undefined;
    let resources: ReturnType<typeof createModelEmphasisResources> | undefined;
    let source: Mesh | undefined;
    let occluder: Mesh | undefined;
    let cameraRig: ReturnType<typeof useCameraRig> | undefined;
    let separate = false;
    let cropped = true;
    const comparisons: unknown[] = [];
    let pixels: Uint8ClampedArray | undefined;
    let pending: Promise<void> | undefined;
    let captureError: Error | undefined;
    let retired = false;
    let frames = 0;
    let captured = 0;
    const Mask = (): ReactNode => {
      state = useThree();
      cameraRig = useCameraRig();
      const clip = useSectionClip();
      const restoreDepth = useOverlayDepthRestorer();
      const owned = useMemo(() => createModelEmphasisResources('webgpu', clip), [clip]);
      resources = owned;
      const previousClear = useMemo(() => new Color(), []);
      useFrame(({ gl, camera }) => {
        if (!source) {
          return;
        }
        owned.setMaskSize({
          width: gl.domElement.width,
          height: gl.domElement.height,
          pixelRatio: gl.getPixelRatio(),
        });
        syncModelEmphasisFrame(owned);
        const selected = separate ? { ...owned, setFrameDepth: () => false } : owned;
        renderModelEmphasisMask(selected, {
          gl,
          camera,
          restoreDepth,
          previousClear,
          boundedComposite: true,
          croppedMask: cropped,
          fuseNativeClear: !separate,
        });
      }, 1.4);
      useFrame((current) => {
        frames++;
        if (retired || pending) {
          return;
        }
        const requested = frames;
        pending = (async () => {
          try {
            pixels = new Uint8ClampedArray(await captureRendererOutput(current.gl));
            captured = requested;
          } catch (error) {
            captureError = error instanceof Error ? error : new Error(String(error));
          } finally {
            pending = undefined;
          }
        })();
      }, 4);
      return (
        <SceneOverlay overlayActive renderPriority={1.5}>
          <primitive object={owned.overlayGroup} />
        </SceneOverlay>
      );
    };
    try {
      render(
        <div style={{ width, height: width === 2560 ? 1440 : 256 }}>
          <GraphicsProvider
            graphicsRef={actor}
            seed={{
              camera: {
                cameraFovAngle: 0,
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
            <ThreeCanvasInstance graphicsBackend='webgpu' upDirection='y' onRetry={() => undefined}>
              <mesh
                ref={(mesh) => {
                  source = mesh ?? undefined;
                }}
              >
                <sphereGeometry args={[0.5, 24, 16]} />
                <meshStandardMaterial color={0x42_8a_c4} roughness={0.6} metalness={0.2} />
              </mesh>
              <mesh
                ref={(mesh) => {
                  occluder = mesh ?? undefined;
                }}
                position={[0.4, 0, 0.8]}
              >
                <boxGeometry args={[0.35, 1.6, 0.1]} />
                <meshStandardMaterial color='white' />
              </mesh>
              <directionalLight position={[1, 2, 4]} intensity={3} />
              <Mask />
            </ThreeCanvasInstance>
          </GraphicsProvider>
        </div>,
      );
      await vi.waitFor(
        () => {
          expect(state).toBeDefined();
          expect(resources).toBeDefined();
          expect(source).toBeDefined();
        },
        { timeout: 30_000 },
      );
      const capture = async (): Promise<Uint8ClampedArray> => {
        await pending;
        const start = captured;
        for (let frame = 0; frame < 3; frame++) {
          // oxlint-disable-next-line no-await-in-loop -- separate Three NodeFrame cache identities.
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => {
              resolve();
            });
          });
          state!.advance(performance.now(), true);
          // oxlint-disable-next-line no-await-in-loop -- finish each readback before the next draw.
          await pending;
        }
        if (captureError) {
          throw captureError;
        }
        expect(captured).toBeGreaterThan(start);
        return new Uint8ClampedArray(pixels!);
      };
      for (const [index, x] of [-0.6, 0.6, 0, -0.3, 0.25, -0.5, 0, 0.5].entries()) {
        source!.position.x = x;
        if (index === 2 || index === 5) {
          cameraRig!.actorRef.send({
            type: 'setVerticalFieldOfView',
            verticalFieldOfView: index === 2 ? 40 : 0,
          });
        }
        if (index === 4) {
          syncModelEmphasisProxies(resources!, { hover: [], selected: [] });
          expect(resources!.maskTarget.width).toBe(1);
          state!.setDpr(1.5);
        }
        if (index === 1) {
          syncModelEmphasisProxies(resources!, { hover: [], selected: [] });
        }
        syncModelEmphasisProxies(
          resources!,
          index % 3 === 0
            ? { hover: [occluder!], selected: [source!] }
            : index % 3 === 1
              ? { hover: [], selected: [source!] }
              : { hover: [source!], selected: [] },
        );
        separate = false;
        cropped = true;
        // oxlint-disable-next-line no-await-in-loop -- Reuse the same frame and mask through successive poses.
        const candidate = await capture();
        expect(state!.gl.domElement.width).toBe(width * (index < 4 ? 2 : 1.5));
        expect(state!.gl.domElement.height).toBe((width === 2560 ? 1440 : 256) * (index < 4 ? 2 : 1.5));
        if (index === 1) {
          expect(resources!.maskTarget.width * resources!.maskTarget.height).toBeLessThan(
            state!.gl.domElement.width * state!.gl.domElement.height,
          );
        }
        expect(state!.camera instanceof OrthographicCamera).toBe(index < 2 || index >= 5);
        expect(state!.gl.getPixelRatio()).toBe(index < 4 ? 2 : 1.5);
        const candidateCamera = {
          world: state!.camera.matrixWorld.toArray(),
          projection: state!.camera.projectionMatrix.toArray(),
        };
        cropped = false;
        // oxlint-disable-next-line no-await-in-loop -- Clear-only control isolates pass ordering from changed projection.
        const clearOnly = await capture();
        separate = true;
        // oxlint-disable-next-line no-await-in-loop -- Explicit-clear reference for exactly the same live composition.
        const reference = await capture();
        expect({
          world: state!.camera.matrixWorld.toArray(),
          projection: state!.camera.projectionMatrix.toArray(),
        }).toEqual(candidateCamera);
        let yellow = 0;
        for (let i = 0; i < reference.length; i += 4) {
          if (reference[i]! > reference[i + 2]! + 15 && reference[i + 1]! > reference[i + 2]! + 10) {
            yellow++;
          }
        }
        expect(yellow).toBeGreaterThan(30);
        const clearResult = measureEmphasisPixels(clearOnly, reference, state!.gl.domElement.width);
        expect(clearResult.maxDelta, JSON.stringify({ forceNodeWebGl2, index, clearResult })).toBeLessThanOrEqual(1);
        const result = measureEmphasisPixels(candidate, reference, state!.gl.domElement.width);
        comparisons.push({ index, result });
        // Gate revision 2: boundary-local screen, with negative controls in model-emphasis-pixels.test.ts.
        expect(result.interiorChanges, JSON.stringify({ forceNodeWebGl2, index, result })).toBe(0);
        // Canvas captures contain straight alpha. Judge visible boundary error over
        // both extreme backgrounds, not unstable RGB recovered near zero alpha.
        for (const background of [0, 255]) {
          const displayed = measureEmphasisPixels(
            compositeEmphasisPixels(candidate, background),
            compositeEmphasisPixels(reference, background),
            state!.gl.domElement.width,
          );
          expect(displayed.interiorChanges, JSON.stringify({ forceNodeWebGl2, index, background, displayed })).toBe(0);
          expect(
            displayed.maxLocalMean,
            JSON.stringify({ forceNodeWebGl2, index, background, displayed }),
          ).toBeLessThanOrEqual(16);
        }
      }
      console.info('Mask crop pixel evidence', JSON.stringify({ forceNodeWebGl2, comparisons }));
      expect(isViewportWebGpu(state!.gl)).toBe(true);
      if (isViewportWebGpu(state!.gl)) {
        expect(state!.gl.backend).toBeInstanceOf(forceNodeWebGl2 ? WebGLBackend : WebGPUBackend);
      }
    } finally {
      retired = true;
      await pending;
      if (state) {
        await disposeRendererOutput(state.gl);
      }
      cleanup();
      resources?.dispose();
      actor.stop();
    }
  },
);

it.each(
  (['webgpu', 'node-webgl2'] as const).flatMap((execution) =>
    [384, 5120].flatMap((width) => [0, 1].map((transmission) => ({ execution, width, transmission }))),
  ),
)(
  'should retain transmissive composition and bounded resources across camera switches: $execution width $width transmission $transmission',
  async ({ execution, width, transmission }) => {
    referenceMode.manualPreparation = true;
    const height = width === 5120 ? 2880 : 256;
    let renderWidth = width;
    let renderHeight = height;
    referenceMode.forceNodeWebGl2 = execution === 'node-webgl2';
    await page.viewport(600, 500);
    const actor = createActor(
      graphicsMachine.provide({
        actors: { probeWebGpu: createAsyncLogic({ run: async () => true }) },
      }),
      { input: { enablePostProcessing: true } },
    ).start();
    let state: RootState | undefined;
    let rig: ReturnType<typeof useCameraRig> | undefined;
    let pixels: Uint8ClampedArray | undefined;
    let pending: Promise<void> | undefined;
    let captureError: Error | undefined;
    let retired = false;
    const Probe = (): undefined => {
      state = useThree();
      rig = useCameraRig();
      useFrame((current) => {
        if (!pending && !retired) {
          const read = async (): Promise<void> => {
            try {
              pixels = await captureRendererOutput(current.gl);
            } catch (error) {
              captureError = error instanceof Error ? error : new Error(String(error));
            } finally {
              pending = undefined;
            }
          };
          pending = read();
        }
      }, 4);
      return undefined;
    };
    const capture = async (): Promise<Uint8ClampedArray> => {
      await pending;
      pixels = undefined;
      // Let camera subscriptions and pass frame IDs settle before the oracle.
      for (let frame = 0; frame < 4; frame++) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- Advance consecutive frames before reading their output.
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
        state!.advance(performance.now(), true);
        // oxlint-disable-next-line eslint/no-await-in-loop -- Finish this frame readback before advancing the next.
        await pending;
      }
      if (captureError) {
        throw captureError;
      }
      expect(pixels).toBeDefined();
      expect([state!.gl.domElement.width, state!.gl.domElement.height]).toEqual([renderWidth, renderHeight]);
      return new Uint8ClampedArray(pixels!);
    };
    const fixture = (fov: number): ReactNode => (
      <div key={fov} style={{ width: renderWidth, height: renderHeight }}>
        <GraphicsProvider
          graphicsRef={actor}
          seed={{
            camera: {
              cameraFovAngle: fov,
              cameraView: {
                frameId: 'tau:root',
                target: [0, 0, 0],
                direction: [0.3, 0.2, 1],
                up: [0, 1, 0],
                verticalSpan: 4,
                perspectiveZoom: 1,
              },
            },
          }}
        >
          <ThreeCanvasInstance graphicsBackend='webgpu' upDirection='y' onRetry={() => undefined}>
            <ambientLight intensity={2} />
            <mesh position={[0, 0, -0.8]}>
              <planeGeometry args={[4, 4]} />
              <meshStandardMaterial color='#c03030' />
            </mesh>
            <mesh>
              <boxGeometry args={[1.5, 1.5, 0.5]} />
              <meshPhysicalMaterial transmission={transmission} thickness={0.5} roughness={0.2} side={DoubleSide} />
            </mesh>
            <mesh position={[0.7, -0.4, 0.5]}>
              <boxGeometry args={[0.5, 0.5, 0.5]} />
              <meshStandardMaterial color='#2040c0' />
            </mesh>
            <Probe />
          </ThreeCanvasInstance>
        </GraphicsProvider>
      </div>
    );
    try {
      const mounted = render(fixture(0));
      await vi.waitFor(
        () => {
          expect(state).toBeDefined();
          expect(rig).toBeDefined();
        },
        { timeout: 45_000 },
      );
      const renderer = state!.gl;
      expect(isViewportWebGpu(renderer)).toBe(true);
      if (!isViewportWebGpu(renderer)) {
        throw new Error('Expected initialized node renderer');
      }
      expect(renderer.backend instanceof WebGLBackend).toBe(execution === 'node-webgl2');
      const initial = await capture();
      retired = true;
      await pending;
      const targetBefore = renderer.getRenderTarget();
      const texturesBefore = renderer.info.memory.textures;
      const callsBefore = renderer.info.render.calls;
      expect(referenceMode.preparations.size).toBe(1);
      const readCompositionState = (): Record<string, unknown> => ({
        viewport: renderer.getViewport(new Vector4()).toArray(),
        scissor: renderer.getScissor(new Vector4()).toArray(),
        scissorTest: renderer.getScissorTest(),
        clear: [renderer.autoClear, renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil],
        color: renderer.getClearColor(new Color()).toArray(),
        alpha: renderer.getClearAlpha(),
        toneMapping: renderer.toneMapping,
        exposure: renderer.toneMappingExposure,
        colorSpace: renderer.outputColorSpace,
      });
      const originalClear = renderer.autoClear;
      const originalDepth = renderer.autoClearDepth;
      const originalStencil = renderer.autoClearStencil;
      // A preparation must not reset the live overlay owner's clear policy.
      renderer.autoClear = false;
      renderer.autoClearDepth = false;
      renderer.autoClearStencil = false;
      const compositionBefore = readCompositionState();
      try {
        for (const prepare of referenceMode.preparations) {
          expect(prepare()).toBe(true);
        }
        expect(readCompositionState(), 'Idle preparation must preserve the live composition state').toEqual(
          compositionBefore,
        );
      } finally {
        renderer.autoClear = originalClear;
        renderer.autoClearDepth = originalDepth;
        renderer.autoClearStencil = originalStencil;
      }
      expect(renderer.getRenderTarget()).toBe(targetBefore);
      expect(renderer.info.memory.textures).toBe(texturesBefore);
      expect(renderer.info.render.calls > callsBefore).toBe(transmission === 0);
      const untouchedCanvas = await captureRendererOutput(renderer);
      const changedChannels = (image: Uint8ClampedArray): number => {
        let changed = 0;
        for (const [index, value] of image.entries()) {
          changed += Number(value !== initial[index]);
        }
        return changed;
      };
      expect(changedChannels(untouchedCanvas), 'Preparation must not draw to the visible canvas').toBe(0);
      retired = false;
      expect(changedChannels(await capture()), 'The following live frame must restore the active camera').toBe(0);
      const expected = new Map<number, Uint8ClampedArray>();
      let warmedTextures = 0;
      for (const [index, fov] of [0, 45, 0, 45, 0, 45].entries()) {
        rig!.actorRef.send({
          type: 'setVerticalFieldOfView',
          verticalFieldOfView: fov,
        });
        // oxlint-disable-next-line eslint/no-await-in-loop -- Each projection depends on the previous rendered endpoint.
        const image = await capture();
        if (renderer.backend instanceof WebGLBackend) {
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Initialized node GL backend.
          expect((renderer.getContext() as WebGL2RenderingContext).getError(), `FOV ${fov}, switch ${index}`).toBe(0);
        }
        const reference = expected.get(fov);
        if (reference) {
          let differences = 0;
          for (const [pixel, value] of image.entries()) {
            differences += Number(value !== reference[pixel]);
          }
          expect(differences, `FOV ${fov}, switch ${index}`).toBe(0);
          expect(renderer.info.memory.textures).toBe(warmedTextures);
        } else {
          expected.set(fov, image);
          warmedTextures = renderer.info.memory.textures;
          expect(image.some((value, pixel) => pixel % 4 === 0 && value > 100)).toBe(true);
        }
      }
      if (renderer.backend instanceof WebGLBackend) {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Initialized backend is narrowed above.
        expect((renderer.getContext() as WebGL2RenderingContext).getError()).toBe(0);
      }
      // Repeated wrong shaders could be stable. Compare the switched perspective
      // result with a separately initialized perspective graph as an independent oracle.
      retired = true;
      await pending;
      await disposeRendererOutput(renderer);
      state = undefined;
      mounted.rerender(fixture(45));
      await vi.waitFor(
        () => {
          expect(state).toBeDefined();
        },
        { timeout: 45_000 },
      );
      retired = false;
      const fresh = await capture();
      const switched = expected.get(45)!;
      let freshDifferences = 0;
      for (const [pixel, value] of fresh.entries()) {
        freshDifferences += Number(value !== switched[pixel]);
      }
      expect(freshDifferences, 'Switched perspective must match a fresh perspective graph').toBe(0);
      if (width === 5120) {
        const fullAllocation = state!.gl.info.memory.textures;
        const expectBufferSize = (): void => {
          expect([state!.gl.domElement.width, state!.gl.domElement.height]).toEqual([renderWidth, renderHeight]);
        };
        for (const scale of [0.5, 1]) {
          renderWidth = width * scale;
          renderHeight = height * scale;
          mounted.rerender(fixture(45));
          // oxlint-disable-next-line eslint/no-await-in-loop -- Resize observer commits each requested buffer before its draw.
          await vi.waitFor(expectBufferSize);
          // oxlint-disable-next-line eslint/no-await-in-loop -- Validate resized attachments before retiring them again.
          const resized = await capture();
          expect(state!.gl.info.memory.textures, 'Resize must not retain another set of attachments').toBe(
            fullAllocation,
          );
          if (scale === 1) {
            let resizeDifferences = 0;
            for (const [pixel, value] of resized.entries()) {
              resizeDifferences += Number(value !== fresh[pixel]);
            }
            expect(resizeDifferences, 'Returning to 5K must restore exact color and depth composition').toBe(0);
          }
        }
      }
    } finally {
      retired = true;
      await pending;
      if (state) {
        await disposeRendererOutput(state.gl);
      }
      cleanup();
      actor.stop();
      referenceMode.manualPreparation = false;
      expect(referenceMode.preparations.size).toBe(0);
    }
  },
);

it.each(
  (['webgpu', 'node-webgl2'] as const).flatMap((execution) =>
    [false, true].map((aoEnabled) => ({ execution, aoEnabled })),
  ),
)(
  'should retain the continuous unlit planetary rim through production composition at 5K on $execution AO $aoEnabled',
  async ({ execution, aoEnabled }) => {
    referenceMode.forceNodeWebGl2 = execution === 'node-webgl2';
    vi.stubGlobal('devicePixelRatio', 2);
    await page.viewport(600, 500);
    const response = await fetch(new URL('fixtures/planetary.glb', import.meta.url));
    const bytes = new Uint8Array(await response.arrayBuffer());
    const actor = createActor(
      graphicsMachine.provide({
        actors: { probeWebGpu: createAsyncLogic({ run: async () => true }) },
      }),
      { input: { enablePostProcessing: true } },
    ).start();
    let state: RootState | undefined;
    let rig: ReturnType<typeof useCameraRig> | undefined;
    let pixels: Uint8ClampedArray | undefined;
    let pending: Promise<void> | undefined;
    let captureError: Error | undefined;
    let retired = false;
    const measure = async (current: RootState): Promise<void> => {
      try {
        pixels = await captureRendererOutput(current.gl);
      } catch (error) {
        captureError = error instanceof Error ? error : new Error(String(error));
      } finally {
        pending = undefined;
      }
    };
    const Probe = (): undefined => {
      state = useThree();
      rig = useCameraRig();
      useFrame((current) => {
        if (!pending && !retired) {
          pending = measure(current);
        }
      }, 4);
      return undefined;
    };
    try {
      render(
        <KeyboardProvider>
          <div style={{ width: 2560, height: 1440 }}>
            <GraphicsProvider graphicsRef={actor} initialVerticalFieldOfView={0}>
              <ThreeCanvasInstance
                graphicsBackend='webgpu'
                upDirection='z'
                postProcessingSettings={{ aoEnabled, toneMapping: 'neutral' }}
                onRetry={() => undefined}
              >
                <ambientLight intensity={2} />
                <GltfMesh gltfFile={bytes} enableLines enableSurfaces enableMatcap={false} />
                <Probe />
              </ThreeCanvasInstance>
            </GraphicsProvider>
          </div>
        </KeyboardProvider>,
      );
      await vi.waitFor(
        () => {
          if (captureError) {
            throw captureError;
          }
          expect(state).toBeDefined();
          expect(state!.scene.getObjectByName('Internal_Ring_Gear')).toBeDefined();
        },
        { timeout: 45_000 },
      );
      rig!.actorRef.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 0 });
      rig!.actorRef.send({
        type: 'setView',
        target: [0.00003115460276603699, 0, 0.0059999991208314896],
        direction: [1, -1, 1],
        up: [0, 0, 1],
        verticalSpan: 0.22615948766469957,
      });
      for (let frame = 0; frame < 4; frame++) {
        // oxlint-disable-next-line no-await-in-loop -- Distinct rendered frames must settle in sequence.
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
        state!.advance(performance.now(), true);
        // oxlint-disable-next-line no-await-in-loop -- Drain this frame before advancing the next.
        await pending;
      }
      if (captureError) {
        throw captureError;
      }
      expect(state!.gl.domElement.width).toBe(5120);
      expect(state!.gl.domElement.height).toBe(2880);
      expect(isViewportWebGpu(state!.gl)).toBe(true);
      if (isViewportWebGpu(state!.gl)) {
        expect(state!.gl.backend).toBeInstanceOf(execution === 'node-webgl2' ? WebGLBackend : WebGPUBackend);
      }
      expect(pixels).toBeDefined();
      // This 400px run of the front rim is fully visible and two physical pixels wide.
      // An analytic stroke has a black core; filtering it into a varying grey core is a regression.
      const contrasts: number[] = [];
      for (let x = 2300; x < 2700; x++) {
        let minimum = 255;
        let maximum = 0;
        for (let y = 1900; y < 2010; y++) {
          const value = pixels![(y * 5120 + x) * 4]!;
          minimum = Math.min(minimum, value);
          maximum = Math.max(maximum, value);
        }
        expect(maximum, 'Rim ROI must contain a lit, opaque surface').toBeGreaterThan(100);
        contrasts.push(1 - minimum / maximum);
      }
      const mean = contrasts.reduce((a, b) => a + b) / contrasts.length;
      const variation = Math.sqrt(
        contrasts
          .slice(1, -1)
          .reduce((sum, value, i) => sum + (contrasts[i]! - 2 * value + contrasts[i + 2]!) ** 2, 0) /
          (contrasts.length - 2),
      );
      const receipt = JSON.stringify({ execution, aoEnabled, mean, variation });
      expect(mean, receipt).toBeGreaterThanOrEqual(0.9);
      expect(variation, receipt).toBeLessThanOrEqual(0.025);
    } finally {
      retired = true;
      await pending;
      if (state) {
        await disposeRendererOutput(state.gl);
      }
      cleanup();
      actor.stop();
    }
  },
);

it.each(['webgpu', 'node-webgl2'] as const)(
  'should isolate two 5K node views through sibling resize and remount on %s',
  async (execution) => {
    referenceMode.forceNodeWebGl2 = execution === 'node-webgl2';
    referenceMode.manualPreparation = true;
    await page.viewport(600, 500);
    const actors = [0, 1].map(() =>
      createActor(
        graphicsMachine.provide({
          actors: { probeWebGpu: createAsyncLogic({ run: async () => true }) },
        }),
        { input: { enablePostProcessing: true } },
      ).start(),
    );
    const states = new Map<number, RootState>();
    const Probe = ({ index }: { readonly index: number }): undefined => {
      states.set(index, useThree());
      return undefined;
    };
    const fixture = (index: number, width: number, generation: number): ReactNode => (
      <div key={generation} style={{ width, height: (width * 2880) / 5120 }}>
        <GraphicsProvider
          graphicsRef={actors[index]!}
          seed={{
            camera: {
              cameraFovAngle: 35,
              cameraView: {
                frameId: 'tau:root',
                target: [0, 0, 0],
                direction: [0.3, 0.2, 1],
                up: [0, 1, 0],
                verticalSpan: 4,
                perspectiveZoom: 1,
              },
            },
          }}
        >
          <ThreeCanvasInstance graphicsBackend='webgpu' upDirection='y' onRetry={() => undefined}>
            <ambientLight intensity={2} />
            <mesh position={[0, 0, -0.7]}>
              <planeGeometry args={[4, 4]} />
              <meshStandardMaterial color={index ? '#2040c0' : '#c03030'} />
            </mesh>
            <mesh>
              <boxGeometry args={[1.5, 1.5, 0.5]} />
              <meshStandardMaterial color='#aaaaaa' />
            </mesh>
            <Probe index={index} />
          </ThreeCanvasInstance>
        </GraphicsProvider>
      </div>
    );
    const capture = async (index: number, width = 5120): Promise<Uint8ClampedArray> => {
      await vi.waitFor(() => {
        expect(states.get(index)?.gl.domElement.width).toBe(width);
      });
      for (let frame = 0; frame < 4; frame++) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- Each frame settles the current resized graph.
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
        states.get(index)!.advance(performance.now(), true);
      }
      const renderer = states.get(index)!.gl;
      expect(isViewportWebGpu(renderer)).toBe(true);
      if (!isViewportWebGpu(renderer)) {
        throw new Error('Expected initialized node renderer');
      }
      expect(renderer.backend).toBeInstanceOf(execution === 'node-webgl2' ? WebGLBackend : WebGPUBackend);
      expect(renderer.domElement.height).toBe((width * 2880) / 5120);
      return captureRendererOutput(renderer);
    };
    const differences = (actual: Uint8ClampedArray, expected: Uint8ClampedArray): number => {
      expect(actual.length).toBe(expected.length);
      let changed = 0;
      for (const [index, value] of actual.entries()) {
        changed += Number(value !== expected[index]);
      }
      return changed;
    };
    try {
      const first = render(fixture(0, 5120, 0));
      const firstPixels = await capture(0);
      render(fixture(1, 5120, 0));
      const secondPixels = await capture(1);
      const secondRenderer = states.get(1)!.gl;
      const secondTextures = secondRenderer.info.memory.textures;
      expect(states.get(0)!.gl).not.toBe(secondRenderer);
      expect(differences(secondPixels, firstPixels)).toBeGreaterThan(1000);
      first.rerender(fixture(0, 2560, 0));
      await capture(0, 2560);
      expect(differences(await capture(1), secondPixels), 'Sibling resize must preserve every output pixel').toBe(0);
      first.rerender(fixture(0, 5120, 0));
      expect(differences(await capture(0), firstPixels), 'Resize back to 5K must restore exact composition').toBe(0);
      await disposeRendererOutput(states.get(0)!.gl);
      first.unmount();
      expect(differences(await capture(1), secondPixels), 'Sibling teardown must preserve every output pixel').toBe(0);
      expect(secondRenderer.info.memory.textures).toBe(secondTextures);
      states.delete(0);
      render(fixture(0, 5120, 1));
      expect(differences(await capture(0), firstPixels), 'New renderer must recover exact composition').toBe(0);
      expect(differences(await capture(1), secondPixels)).toBe(0);
      expect(states.get(1)!.gl).toBe(secondRenderer);
    } finally {
      for (const state of states.values()) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- Release each renderer's output observer before owner teardown.
        await disposeRendererOutput(state.gl);
      }
      cleanup();
      for (const actor of actors) {
        actor.stop();
      }
      referenceMode.manualPreparation = false;
      expect(referenceMode.preparations.size).toBe(0);
    }
  },
);

it.each((['webgpu', 'node-webgl2'] as const).flatMap((execution) => [0, 35].map((fov) => ({ execution, fov }))))(
  'should preserve opaque planetary pixels beneath workspace axes at 5K on $execution FOV $fov',
  async ({ execution, fov }) => {
    referenceMode.forceNodeWebGl2 = execution === 'node-webgl2';
    vi.stubGlobal('devicePixelRatio', 2);
    await page.viewport(600, 500);
    const response = await fetch(new URL('fixtures/planetary.glb', import.meta.url));
    const bytes = new Uint8Array(await response.arrayBuffer());
    const actor = createActor(
      graphicsMachine.provide({
        actors: { probeWebGpu: createAsyncLogic({ run: async () => true }) },
      }),
      { input: { enablePostProcessing: true } },
    ).start();
    let state: RootState | undefined;
    let axes: Group | undefined;
    let rig: ReturnType<typeof useCameraRig> | undefined;
    const Probe = (): undefined => {
      state = useThree();
      rig = useCameraRig();
      return undefined;
    };
    const capture = async (): Promise<Uint8ClampedArray> => {
      // PassNode updates once per animation frame; reuse retires its scene color.
      // Do not manufacture a second composed frame under the same frame identity.
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
      state!.advance(performance.now(), true);
      return captureRendererOutput(state!.gl);
    };
    try {
      render(
        <KeyboardProvider>
          <div style={{ width: 2560, height: 1440 }}>
            <GraphicsProvider graphicsRef={actor} initialVerticalFieldOfView={0}>
              <ThreeCanvasInstance
                graphicsBackend='webgpu'
                upDirection='z'
                postProcessingSettings={{ aoEnabled: true, toneMapping: 'neutral' }}
                onRetry={() => undefined}
              >
                <ambientLight intensity={2} />
                <GltfMesh gltfFile={bytes} enableLines enableSurfaces enableMatcap={false} />
                <SceneOverlay overlayActive>
                  <group
                    visible={false}
                    ref={(value) => {
                      axes = value ?? undefined;
                    }}
                  >
                    <AxesHelper />
                  </group>
                </SceneOverlay>
                <Probe />
              </ThreeCanvasInstance>
            </GraphicsProvider>
          </div>
        </KeyboardProvider>,
      );
      await vi.waitFor(
        () => {
          expect(state).toBeDefined();
          expect(state!.scene.getObjectByName('Internal_Ring_Gear')).toBeDefined();
        },
        { timeout: 45_000 },
      );
      rig!.actorRef.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: fov });
      rig!.actorRef.send({
        type: 'setView',
        target: [0.00003115460276603699, 0, 0.0059999991208314896],
        direction: [1, 1, 1],
        up: [0, 0, 1],
        verticalSpan: 0.22615948766469957,
      });
      for (let frame = 0; frame < 4; frame++) {
        // oxlint-disable-next-line no-await-in-loop -- Distinct rendered frames must settle in sequence.
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
        state!.advance(performance.now(), true);
      }
      expect(state!.gl.domElement.width).toBe(5120);
      expect(state!.gl.domElement.height).toBe(2880);
      expect(isViewportWebGpu(state!.gl)).toBe(true);
      if (isViewportWebGpu(state!.gl)) {
        expect(state!.gl.backend).toBeInstanceOf(execution === 'node-webgl2' ? WebGLBackend : WebGPUBackend);
      }
      state!.setFrameloop('never');
      const withoutAxes = await capture();
      const repeated = await capture();
      let unchangedDifferences = 0;
      for (const [index, value] of withoutAxes.entries()) {
        unchangedDifferences += Number(value !== repeated[index]);
      }
      expect(unchangedDifferences, 'Unchanged A/A capture must be exact before testing overlays').toBe(0);
      axes!.visible = true;
      const pixels = await capture();
      let erasedOpaquePixels = 0;

      let changedPixels = 0;
      for (let i = 0; i < withoutAxes.length; i += 4) {
        if (withoutAxes[i + 3] === 255 && pixels[i + 3]! < 255) {
          erasedOpaquePixels++;
        }
        if (
          withoutAxes[i] !== pixels[i] ||
          withoutAxes[i + 1] !== pixels[i + 1] ||
          withoutAxes[i + 2] !== pixels[i + 2]
        ) {
          changedPixels++;
        }
      }
      expect(changedPixels, 'Axes must actually draw').toBeGreaterThan(100);
      expect(erasedOpaquePixels, 'Transparent axes must preserve opaque assembly coverage').toBe(0);
    } finally {
      if (state) {
        await disposeRendererOutput(state.gl);
      }
      cleanup();
      actor.stop();
    }
  },
);

it.each(['webgpu', 'node-webgl2'] as const)(
  'should retain planetary surface boundaries and motion with six-step filtering at 5K on %s',
  async (execution) => {
    referenceMode.forceNodeWebGl2 = execution === 'node-webgl2';
    referenceMode.manualPreparation = true;
    referenceMode.compareSurfaceFiltering = true;
    vi.stubGlobal('devicePixelRatio', 2);
    await page.viewport(600, 500);
    const response = await fetch(new URL('fixtures/planetary.glb', import.meta.url));
    const bytes = new Uint8Array(await response.arrayBuffer());
    const actor = createActor(
      graphicsMachine.provide({
        actors: { probeWebGpu: createAsyncLogic({ run: async () => true }) },
      }),
      { input: { enablePostProcessing: true } },
    ).start();
    let state: RootState | undefined;
    let rig: ReturnType<typeof useCameraRig> | undefined;
    const Probe = (): undefined => {
      state = useThree();
      rig = useCameraRig();
      return undefined;
    };
    // Crop only empty margins after a complete native 5K render/readback.
    const width = 2560;
    const height = 2160;
    const capture = async (quality: number): Promise<Uint8ClampedArray> => {
      referenceMode.surfaceQuality!.value = quality;
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
      state!.advance(performance.now(), true);
      const full = await captureRendererOutput(state!.gl);
      const cropped = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y++) {
        const from = ((y + 540) * 5120 + 1280) * 4;
        cropped.set(full.subarray(from, from + width * 4), y * width * 4);
      }
      return cropped;
    };
    try {
      render(
        <KeyboardProvider>
          <div style={{ width: 2560, height: 1440 }}>
            <GraphicsProvider graphicsRef={actor} initialVerticalFieldOfView={0}>
              <ThreeCanvasInstance
                graphicsBackend='webgpu'
                upDirection='z'
                postProcessingSettings={{ aoEnabled: true, toneMapping: 'neutral' }}
                onRetry={() => undefined}
              >
                <ambientLight intensity={2} />
                <GltfMesh gltfFile={bytes} enableLines={false} enableSurfaces enableMatcap={false} />
                <Probe />
              </ThreeCanvasInstance>
            </GraphicsProvider>
          </div>
        </KeyboardProvider>,
      );
      await vi.waitFor(
        () => {
          expect(state?.scene.getObjectByName('Internal_Ring_Gear')).toBeDefined();
          expect(referenceMode.surfaceQuality).toBeDefined();
        },
        { timeout: 45_000 },
      );
      expect(state!.gl.domElement.width).toBe(5120);
      expect(state!.gl.domElement.height).toBe(2880);
      expect(isViewportWebGpu(state!.gl)).toBe(true);
      if (isViewportWebGpu(state!.gl)) {
        expect(state!.gl.backend).toBeInstanceOf(execution === 'node-webgl2' ? WebGLBackend : WebGPUBackend);
      }
      const gear = state!.scene.getObjectByName('Internal_Ring_Gear')!;
      const originalRotation = gear.rotation.z;
      let previous: { reference: Uint8ClampedArray; candidate: Uint8ClampedArray } | undefined;
      let initial: Uint8ClampedArray | undefined;
      let completedPhases = 0;
      for (const phase of [0, 0.25, 0.5, 0.75, 0]) {
        gear.rotation.z = originalRotation + phase * 0.002;
        rig!.actorRef.send({
          type: 'setView',
          target: [0.00003115460276603699 + (phase * 0.22615948766469957) / 2880, 0, 0.0059999991208314896],
          direction: [1, -1, 1],
          up: [0, 0, 1],
          verticalSpan: 0.22615948766469957,
        });
        for (let settle = 0; settle < 4; settle++) {
          // eslint-disable-next-line no-await-in-loop -- Let camera/loader subscriptions settle before comparing a pose.
          await capture(6);
        }
        const cameraPose = [...state!.camera.matrixWorld.elements, ...state!.camera.projectionMatrix.elements];
        // Ordered samples share a pose and the same live composition/attachments.
        // eslint-disable-next-line no-await-in-loop -- Drain each GPU capture before changing the quality uniform.
        const raw = await capture(0);
        // eslint-disable-next-line no-await-in-loop -- Reference must see the identical pose.
        const reference = await capture(12);
        // eslint-disable-next-line no-await-in-loop -- Candidate must see the identical pose.
        const candidate = await capture(6);
        expect([...state!.camera.matrixWorld.elements, ...state!.camera.projectionMatrix.elements]).toEqual(cameraPose);
        let smoothed = 0;
        let lost = 0;
        let count = 0;
        let error = 0;
        let large = 0;
        let shiftedError = 0;
        let temporalError = 0;
        let returnDifferences = 0;
        let movedChannels = 0;
        // Visible RGB on both backgrounds; transparent RGB alone is not appearance.
        const displayed = (pixels: Uint8ClampedArray, i: number, background: number): number =>
          (pixels[i]! * pixels[i - (i % 4) + 3]! + background * (255 - pixels[i - (i % 4) + 3]!)) / 255;
        for (let i = 4; i < reference.length; i += 4) {
          let filtering = 0;
          let candidateFiltering = 0;
          for (const background of [0, 255]) {
            for (let c = 0; c < 3; c++) {
              filtering = Math.max(
                filtering,
                Math.abs(displayed(reference, i + c, background) - displayed(raw, i + c, background)),
              );
              candidateFiltering = Math.max(
                candidateFiltering,
                Math.abs(displayed(candidate, i + c, background) - displayed(raw, i + c, background)),
              );
            }
          }
          if (filtering > 8) {
            smoothed++;
            lost += Number(candidateFiltering < 2);
            for (const background of [0, 255]) {
              for (let c = 0; c < 3; c++) {
                const residual = displayed(candidate, i + c, background) - displayed(reference, i + c, background);
                error += Math.abs(residual) / 255;
                large += Number(Math.abs(residual) / 255 > 0.125);
                shiftedError +=
                  Math.abs(displayed(reference, i + c - 4, background) - displayed(reference, i + c, background)) / 255;
                if (previous) {
                  const oldResidual =
                    displayed(previous.candidate, i + c, background) - displayed(previous.reference, i + c, background);
                  temporalError += Math.abs(residual - oldResidual) / 255;
                }
                count++;
              }
            }
          }
          if (initial) {
            for (let c = 0; c < 4; c++) {
              movedChannels += Number(candidate[i + c] !== initial[i + c]);
            }
          }
          if (initial && phase === 0) {
            for (let c = 0; c < 4; c++) {
              returnDifferences += Number(candidate[i + c] !== initial[i + c]);
            }
          }
        }
        const receipt = {
          execution,
          phase,
          smoothed,
          mean: error / count,
          large: large / count,
          lost: lost / smoothed,
          shifted: shiftedError / count,
          temporal: temporalError / count,
          returnDifferences,
          movedChannels,
        };
        console.info('Surface motion receipt', JSON.stringify(receipt));
        expect(smoothed, JSON.stringify(receipt)).toBeGreaterThan(1000);
        expect(error / count, JSON.stringify(receipt)).toBeLessThanOrEqual(0.025);
        expect(large / count, JSON.stringify(receipt)).toBeLessThanOrEqual(0.05);
        expect(lost / smoothed, JSON.stringify(receipt)).toBeLessThanOrEqual(0.05);
        expect(temporalError / count, JSON.stringify(receipt)).toBeLessThanOrEqual(0.025);
        // AA-off would lose every smoothed pixel; a one-pixel shift must also fail.
        expect(shiftedError / count, 'Boundary gate must reject a one-pixel output displacement').toBeGreaterThan(
          0.025,
        );
        expect(returnDifferences, 'Returning to the same pose must restore every captured channel').toBe(0);
        if (phase > 0) {
          expect(movedChannels, 'Motion fixture must change the actual displayed assembly').toBeGreaterThan(0);
        }
        completedPhases++;
        initial ??= candidate;
        previous = { reference, candidate };
      }
      expect(completedPhases).toBe(5);
    } finally {
      if (state) {
        await disposeRendererOutput(state.gl);
      }
      cleanup();
      actor.stop();
    }
  },
  120_000,
);

it.each([
  ['webgpu', true],
  ['node-webgl2', true],
  ['webgpu', false],
  ['node-webgl2', false],
] as const)(
  'should preserve the saved rear planetary section through preparation and cut reset at 5K on %s with AO %s',
  async (execution, aoEnabled) => {
    referenceMode.forceNodeWebGl2 = execution === 'node-webgl2';
    referenceMode.manualPreparation = true;
    vi.stubGlobal('devicePixelRatio', 2);
    await page.viewport(600, 500);
    const response = await fetch(new URL('fixtures/planetary.glb', import.meta.url));
    const bytes = new Uint8Array(await response.arrayBuffer());
    const cuts = [
      { kind: 'plane', plane: 'xz', offset: 0.01, isFlipped: false },
      { kind: 'plane', plane: 'yz', offset: 0, isFlipped: false },
    ] as const;
    const cameraView = {
      frameId: 'tau:root',
      target: [0, 0, 0.006],
      direction: [0.5773502691896258, 0.5773502691896258, 0.5773502691896258],
      up: [0, 0, 1],
      verticalSpan: 0.23668560039290423,
      perspectiveZoom: 1,
    } as const;
    const machine = graphicsMachine.provide({
      actors: { probeWebGpu: createAsyncLogic({ run: async () => true }) },
    });
    const actor = createActor(machine, {
      input: {
        enablePostProcessing: true,
        sectionView: { active: true, cuts: [...cuts] },
      },
    }).start();
    const sibling = createActor(machine, {
      input: {
        enablePostProcessing: true,
        sectionView: { active: true, cuts: cuts.slice(0, 1) },
      },
    }).start();
    let state: RootState | undefined;
    let rig: ReturnType<typeof useCameraRig> | undefined;
    let framing: ReturnType<typeof useViewCameraFraming> | undefined;
    const Probe = (): undefined => {
      state = useThree();
      rig = useCameraRig();
      framing = useViewCameraFraming();
      return undefined;
    };
    const capture = async (): Promise<Uint8ClampedArray> => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
      await vi.waitFor(
        () => {
          state!.advance(performance.now(), true);
          expect(Reflect.get(state!.camera, 'aspect')).toBe(2560 / 1440);
          expect(actor.getSnapshot().context.committedSectionCuts).toEqual(actor.getSnapshot().context.sectionCuts);
          const pending: number[] = [];
          state!.scene.traverse((object) => {
            const census = object.userData['sectionCapCompleteness'] as { pendingSourceCount: number } | undefined;
            if (census) {
              pending.push(census.pendingSourceCount);
            }
          });
          expect(pending).toEqual([0]);
        },
        { timeout: 30_000 },
      );
      return captureRendererOutput(state!.gl);
    };
    try {
      render(
        <KeyboardProvider>
          <div data-testid='history-root' style={{ width: 381, height: 1047 }}>
            <GraphicsProvider graphicsRef={actor} seed={{ camera: { cameraView } }} initialVerticalFieldOfView={35}>
              <ThreeCanvasInstance
                graphicsBackend='webgpu'
                upDirection='z'
                enableGrid
                enableAxes
                enableGizmo
                gizmoContainer={document.body}
                postProcessingSettings={{ aoEnabled, toneMapping: 'neutral' }}
                onRetry={() => undefined}
              >
                <GltfMesh gltfFile={bytes} enableLines enableSurfaces enableMatcap={false} />
                <Probe />
              </ThreeCanvasInstance>
            </GraphicsProvider>
          </div>
          <div style={{ width: 2560, height: 1440 }}>
            <GraphicsProvider graphicsRef={sibling} initialVerticalFieldOfView={35}>
              <ThreeCanvasInstance
                graphicsBackend='webgpu'
                upDirection='z'
                enableGrid
                enableAxes
                postProcessingSettings={{ aoEnabled, toneMapping: 'neutral' }}
                onRetry={() => undefined}
              >
                <GltfMesh gltfFile={bytes} enableLines enableSurfaces enableMatcap={false} />
              </ThreeCanvasInstance>
            </GraphicsProvider>
          </div>
        </KeyboardProvider>,
      );
      await vi.waitFor(
        () => {
          expect(state?.scene.getObjectByName('Internal_Ring_Gear')).toBeDefined();
          expect(framing?.initialized).toBe(true);
        },
        { timeout: 45_000 },
      );
      state!.setFrameloop('never');
      const host = document.querySelector<HTMLElement>('[data-testid=history-root]')!;
      host.style.width = '2560px';
      host.style.height = '1440px';
      state!.setSize(2560, 1440);
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
      state!.advance(performance.now(), true);
      await vi.waitFor(() => {
        state!.advance(performance.now(), true);
        for (const prepare of referenceMode.preparations) {
          expect(prepare()).toBe(true);
        }
      });
      // Do not set the camera or inspect/compile shaders before the startup capture.
      const before = await capture();
      const firstMatrices = [...state!.camera.matrixWorld.elements, ...state!.camera.projectionMatrix.elements];
      for (let frame = 0; frame < 32; frame++) {
        // oxlint-disable-next-line no-await-in-loop -- Each captured frame must complete before advancing the same renderer.
        const repeat = await capture();
        expect([...state!.camera.matrixWorld.elements, ...state!.camera.projectionMatrix.elements]).toEqual(
          firstMatrices,
        );
        let firstRedrawChanges = 0;
        const changedSamples: Array<{ x: number; y: number; difference: number }> = [];
        for (let offset = 0; offset < before.length; offset += 4) {
          let difference = 0;
          for (const background of [0, 255]) {
            for (let channel = 0; channel < 3; channel++) {
              const first =
                (before[offset + channel]! * before[offset + 3]! + background * (255 - before[offset + 3]!)) / 255;
              const second =
                (repeat[offset + channel]! * repeat[offset + 3]! + background * (255 - repeat[offset + 3]!)) / 255;
              difference = Math.max(difference, Math.abs(first - second));
            }
          }
          firstRedrawChanges += Number(difference > 3);
          if (difference > 3 && changedSamples.length < 20) {
            changedSamples.push({ x: (offset / 4) % 5120, y: Math.floor(offset / 4 / 5120), difference });
          }
        }
        expect(
          firstRedrawChanges,
          `First complete redraw versus subsequent frame ${frame}: ${JSON.stringify(changedSamples)}`,
        ).toBe(0);
      }
      expect(Reflect.get(state!.camera, 'fov')).toBe(35);

      expect([state!.gl.domElement.width, state!.gl.domElement.height]).toEqual([5120, 2880]);
      if (!isViewportWebGpu(state!.gl)) {
        throw new Error('Node renderer required');
      }
      expect(state!.gl.backend).toBeInstanceOf(execution === 'node-webgl2' ? WebGLBackend : WebGPUBackend);
      const matrices = [...state!.camera.matrixWorld.elements, ...state!.camera.projectionMatrix.elements];
      // Match the packaged section picker: remove/add/update allocates new cut IDs.
      // Direct adoption alone omits that material/owner history.
      const resetCuts = (next: ReadonlyArray<(typeof cuts)[number]>): void => {
        for (const { id } of actor.getSnapshot().context.sectionCuts) {
          actor.send({ type: 'removeSectionCut', payload: id });
        }
        for (const cut of next) {
          const index = actor.getSnapshot().context.sectionCuts.length;
          actor.send({ type: 'addSectionCut', payload: { kind: 'plane', plane: cut.plane } });
          const added = actor.getSnapshot().context.sectionCuts[index]!;
          actor.send({ type: 'updateSectionCut', payload: { id: added.id, patch: cut } });
        }
        actor.send({ type: 'selectSectionCut', payload: undefined });
      };
      resetCuts(cuts.slice(0, 1));
      await capture();
      resetCuts(cuts);
      rig!.actorRef.send({ type: 'setView', ...cameraView });
      const after = await capture();
      expect([...state!.camera.matrixWorld.elements, ...state!.camera.projectionMatrix.elements]).toEqual(matrices);
      let changed = 0;
      let covered = 0;
      for (let offset = 0; offset < before.length; offset += 4) {
        covered += Number(before[offset + 3]! > 0);
        let difference = 0;
        for (const background of [0, 255]) {
          for (let channel = 0; channel < 3; channel++) {
            const a =
              (before[offset + channel]! * before[offset + 3]!) / 255 + background * (1 - before[offset + 3]! / 255);
            const b =
              (after[offset + channel]! * after[offset + 3]!) / 255 + background * (1 - after[offset + 3]! / 255);
            difference = Math.max(difference, Math.abs(a - b));
          }
        }
        changed += Number(difference > 3);
      }
      expect(covered).toBeGreaterThan(100_000);
      expect(changed, 'Saved startup must match the same camera and cuts after reset within 3/255').toBe(0);
    } finally {
      if (state) {
        await disposeRendererOutput(state.gl);
      }
      cleanup();
      actor.stop();
      sibling.stop();
    }
  },
  120_000,
);
