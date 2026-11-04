import '#test/browser.css';
/*
 * Viewer parity capture (charter `nanoraster-viewer-parity-charter`, W6, metric D2): mounts the production CadViewer
 * (dark scheme, grid, axes and gizmo off, 768x576) for each parity fixture, settles it, and writes its frame (PNG, the
 * canvas's own alpha), camera, adapter and backend. `libs/tau-examples` renders nanoraster at the same camera and
 * compares (`pnpm nx run tau-examples:test:viewer-parity`). Configured by viewer-parity-capture.vitest.browser.config.ts.
 */
import { cleanup, render } from '@testing-library/react';
import { useFrame } from '@react-three/fiber';
import type { RootState } from '@react-three/fiber';
import type { ComponentProps } from 'react';
import { Vector2 } from 'three';
import { createActor, createAsyncLogic } from 'xstate';
import { afterEach, expect, inject, it, vi } from 'vitest';
import { commands } from 'vitest/browser';
import type { Artifact } from '@taucad/runtime';
import { KeyboardProvider } from '@taucad/ui/components/keyboard';
import {
  captureRendererOutput,
  disposeRendererOutput,
  installRendererOutput,
} from '@taucad/runtime-testing/browser/three-renderer-output';
import { CadViewer } from '#cad/cad-viewer.jsx';
import { GraphicsProvider } from '#hooks/use-graphics.jsx';
import { graphicsMachine } from '#machines/graphics.machine.js';
import type * as threeContextModule from '#graphics/three/three-context.jsx';
import type { ThreeProvider } from '#graphics/three/three-context.jsx';
import type * as rendererModule from '#graphics/three/renderer.js';
import { getGraphicsCameraState } from '#services/graphics-camera-registry.js';
import { defaultPostProcessingSettings } from '#graphics/three/post-processing-settings.js';
import { defaultViewerEnvironment, ViewerEnvironmentProvider } from '#environment/viewer-environment.jsx';

type ParityBackend = 'webgpu' | 'webgl';
type ParityCaptureConfig = {
  outDir: string;
  fixtures: Array<{ name: string; glb: string }>;
  backends: ParityBackend[];
};

declare module 'vitest' {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- Vitest's ProvidedContext is augmented through interface merging.
  interface ProvidedContext {
    parity: ParityCaptureConfig;
  }
}

/*
 * I2: THE ONLY ALTERATION OF THE PRODUCTION VIEWER PIPELINE. On a software adapter (SwiftShader in CI)
 * `rendererUsesSoftwareRasterizer` is true, which disables GTAO, FXAA and speculative camera preparation
 * (post-processing.tsx) and drops the environment cubemap from 512 to 64 (react/lights.tsx). Mocking it false makes
 * the software GPU run the hardware pipeline: AO on, FXAA on, 512 environment.
 */
vi.mock('#graphics/three/utils/software-rasterizer.js', () => ({
  rendererUsesSoftwareRasterizer: (): boolean => false,
}));

let state: RootState | undefined;
let frames = 0;
let captureFrame: (() => Promise<void>) | undefined;

// Capture plumbing, not a pixel change: installs the readback of the final presented frame.
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

function FrameProbe(): undefined {
  useFrame((current) => {
    state = current;
    frames += 1;
    const requested = captureFrame;
    captureFrame = undefined;
    if (requested) {
      void requested();
    }
  }, 4);
  return undefined;
}

// Capture plumbing: a frame counter inside the production ThreeProvider.
vi.mock('#graphics/three/three-context.jsx', async (importOriginal) => {
  const actual = await importOriginal<typeof threeContextModule>();
  return {
    ...actual,
    ThreeProvider: (props: ComponentProps<typeof ThreeProvider>) => (
      <actual.ThreeProvider {...props}>
        {props.children}
        <FrameProbe />
      </actual.ThreeProvider>
    ),
  };
});

afterEach(async () => {
  if (state) {
    await disposeRendererOutput(state.gl);
  }
  cleanup();
  state = undefined;
  frames = 0;
});

const config = inject('parity');
const width = 768;
const height = 576;
const settleInvalidations = 20;
/** Milliseconds between settle invalidations. */
const settleInterval = 250;
const captureSamples = 4;

const sleep = async (milliseconds: number): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
};

/** Reads a fixture through the Vite server, which the config allows to serve the fixture directories. */
const readFixture = async (path: string): Promise<Uint8Array<ArrayBuffer>> => {
  const response = await fetch(`/@fs${path}`);
  if (!response.ok) {
    throw new Error(`Cannot read parity fixture ${path}: HTTP ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
};

/** Base64 of a blob, for `commands.writeFile`. */
const blobToBase64 = async (blob: Blob): Promise<string> => {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      resolve(reader.result as string);
    });
    reader.addEventListener('error', () => {
      reject(reader.error ?? new Error('FileReader failed'));
    });
    reader.readAsDataURL(blob);
  });
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
};

const requireState = (): RootState => {
  if (!state) {
    throw new Error('The viewer has not rendered a frame');
  }
  return state;
};

/** Captures the next presented frame. Frames are captured one after another, never concurrently. */
const captureNextFrame = async (renderer: RootState['gl']): Promise<Uint8ClampedArray> => {
  const done = Promise.withResolvers<Uint8ClampedArray>();
  captureFrame = async () => {
    try {
      done.resolve(await captureRendererOutput(renderer));
    } catch (error) {
      done.reject(error);
    }
  };
  requireState().invalidate();
  return done.promise;
};

const cases = config.fixtures.flatMap((fixture) =>
  config.backends.flatMap((backend) => [
    [fixture.name, backend, true] as const,
    [fixture.name, backend, false] as const,
  ]),
);

it.each(cases)('should capture the viewer frame of %s on %s with ao=%s', async (name, backend, ao) => {
  const fixture = config.fixtures.find((candidate) => candidate.name === name);
  if (!fixture) {
    throw new Error(`Unknown parity fixture ${name}`);
  }
  // The AO-off reference: the production settings object with AO disabled, as the viewer's settings toggle does.
  (defaultPostProcessingSettings as { aoEnabled: boolean }).aoEnabled = ao;
  document.documentElement.classList.add('dark');
  const actor = createActor(
    graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => backend === 'webgpu' }) } }),
    { input: {} },
  ).start();
  if (backend === 'webgpu') {
    await vi.waitFor(() => {
      expect(actor.getSnapshot().context.webGpuAvailable).toBe(true);
    });
  }
  const bytes = await readFixture(fixture.glb);
  const artifact: Artifact = { mimeType: 'model/gltf-binary', content: bytes };
  render(
    <div role='application' aria-label='CAD canvas' style={{ width, height, position: 'relative' }}>
      <ViewerEnvironmentProvider value={{ ...defaultViewerEnvironment, colorScheme: 'dark', graphicsBackend: backend }}>
        <KeyboardProvider>
          <GraphicsProvider graphicsRef={actor}>
            <CadViewer
              enableGrid={false}
              enableAxes={false}
              enableGizmo={false}
              artifact={artifact}
              artifactHash={name}
              sourceFile='main.ts'
            />
          </GraphicsProvider>
        </KeyboardProvider>
      </ViewerEnvironmentProvider>
    </div>,
  );
  // The renderer draws on demand: wait for three frames, then drive it with invalidate() until it settles.
  await vi.waitFor(
    () => {
      expect(frames).toBeGreaterThan(2);
    },
    { timeout: 240_000, interval: 200 },
  );
  for (let invalidation = 0; invalidation < settleInvalidations; invalidation++) {
    requireState().invalidate();
    // oxlint-disable-next-line eslint/no-await-in-loop -- Each invalidation must present before the next one.
    await sleep(settleInterval);
  }
  const renderer = requireState().gl;
  // React Three Fiber types `gl` as a WebGLRenderer; the viewer's renderer is three's WebGPU/WebGL2 node renderer.
  const backendInfo = (
    renderer as unknown as {
      backend: {
        isWebGPUBackend?: boolean;
        device?: { adapterInfo?: { vendor?: string; architecture?: string; description?: string; device?: string } };
        gl?: WebGL2RenderingContext;
      };
    }
  ).backend;
  const isWebGpuBackend = backendInfo.isWebGPUBackend === true;
  if (backend === 'webgpu') {
    // A WebGPU capture that fell back to WebGL2 is not a WebGPU reference.
    expect(isWebGpuBackend, 'WebGPU capture fell back to WebGL2').toBe(true);
  }
  let pixels: Uint8ClampedArray = new Uint8ClampedArray();
  for (let sample = 0; sample < captureSamples; sample++) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Frames are captured one after another; the last one is kept.
    pixels = await captureNextFrame(renderer);
  }
  const size = renderer.getDrawingBufferSize(new Vector2());
  expect([size.x, size.y]).toEqual([width, height]);
  const canvas = new OffscreenCanvas(size.x, size.y);
  canvas.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(pixels), size.x, size.y), 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const stem = `${config.outDir}/${name}/viewer.${backend}.${ao ? 'ao-on' : 'ao-off'}`;
  await commands.writeFile(`${stem}.png`, await blobToBase64(blob), 'base64');
  const camera = getGraphicsCameraState(actor);
  const info = backendInfo.device?.adapterInfo;
  const { gl } = backendInfo;
  const debug = gl?.getExtension('WEBGL_debug_renderer_info');
  const adapter = info
    ? { vendor: info.vendor, architecture: info.architecture, description: info.description, device: info.device }
    : { renderer: debug ? (gl?.getParameter(debug.UNMASKED_RENDERER_WEBGL) as string) : undefined };
  await commands.writeFile(
    `${stem}.json`,
    JSON.stringify(
      {
        fixture: name,
        glb: fixture.glb,
        backend,
        ao,
        camera,
        size: [size.x, size.y],
        devicePixelRatio: globalThis.devicePixelRatio,
        coarsePointer: globalThis.matchMedia('(pointer: coarse)').matches,
        settings: defaultPostProcessingSettings,
        adapter,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Three's own flag name, read by the gate.
        isWebGPUBackend: isWebGpuBackend,
        softwareRasterizerGate: 'mocked false (I2)',
        userAgent: navigator.userAgent,
      },
      undefined,
      2,
    ),
  );
  expect(camera).toBeDefined();
  actor.stop();
});
