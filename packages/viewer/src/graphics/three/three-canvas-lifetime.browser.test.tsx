import { claimCanvasRenderer } from '#graphics/three/canvas-renderer-ownership.js';
import { createRoot, _roots, flushSync, extend } from '@react-three/fiber';
import {
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
} from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { afterEach, describe, expect, it, vi } from 'vitest';

extend({ Group });

const forcedWebGlBackend = {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Three's public backend-selection option.
  forceWebGL: true,
};

const renderers = new Set<WebGLRenderer | WebGPURenderer>();
const canvases = new Set<HTMLCanvasElement>();
const roots = new Set<ReturnType<typeof createRoot>>();
afterEach(() => {
  for (const root of roots) {
    flushSync(() => {
      root.unmount();
    });
  }
  for (const canvas of canvases) {
    canvas.remove();
  }
  roots.clear();
  for (const renderer of renderers) {
    renderer.dispose();
  }
  canvases.clear();
  renderers.clear();
});

describe('same-canvas WebGL ownership', () => {
  it.each(['before replacement', 'after replacement'] as const)(
    'keeps the replacement context usable when the retired factory constructs %s',
    async (construction) => {
      const canvas = document.createElement('canvas');
      document.body.append(canvas);
      canvases.add(canvas);
      const makeRenderer = (): WebGLRenderer => {
        const renderer = new WebGLRenderer({ canvas });
        renderers.add(renderer);
        return renderer;
      };
      const attachOld = claimCanvasRenderer(canvas, () => undefined);
      let oldRenderer = construction === 'before replacement' ? makeRenderer() : undefined;
      let release: ((renderer: WebGLRenderer) => void) | undefined;
      const camera = new PerspectiveCamera();
      const old = createRoot(canvas);
      const oldConfiguration = old.configure({
        gl: async () =>
          new Promise<WebGLRenderer>((resolve) => {
            release = resolve;
          }),
        camera,
        size: { width: 10, height: 10, top: 0, left: 0 },
        frameloop: 'never',
      });
      old.render(<group name='retired' />);
      flushSync(() => {
        old.unmount();
      });
      const survivor = createRoot(canvas);
      roots.add(survivor);
      const attachSurvivor = claimCanvasRenderer(canvas, () => undefined);
      const renderer = makeRenderer();
      attachSurvivor(renderer);
      await survivor.configure({
        gl: renderer,
        camera,
        size: { width: 80, height: 60, top: 0, left: 0 },
        dpr: 1.5,
        frameloop: 'never',
      });
      survivor.render(<group name='survivor' />);
      const backing = [canvas.width, canvas.height];
      const projection = camera.projectionMatrix.toArray();
      oldRenderer ??= makeRenderer();
      attachOld(oldRenderer);
      expect(oldRenderer.getContext()).toBe(renderer.getContext());
      const dispose = vi.spyOn(oldRenderer, 'dispose');
      const loseContext = vi.spyOn(oldRenderer, 'forceContextLoss');
      release!(oldRenderer);
      await oldConfiguration;
      await vi.waitFor(() => {
        expect(dispose).toHaveBeenCalledOnce();
      });
      expect(loseContext).not.toHaveBeenCalled();
      expect([canvas.width, canvas.height]).toEqual(backing);
      expect(camera.projectionMatrix.toArray()).toEqual(projection);
      expect(_roots.get(canvas)?.store.getState().gl).toBe(renderer);
      const gl = renderer.getContext();
      expect(gl.isContextLost()).toBe(false);
      renderer.setClearColor(0x00_ff_00, 1);
      renderer.render(new Scene(), camera);
      const pixel = new Uint8Array(4);
      gl.readPixels(1, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      expect([...pixel]).toEqual([0, 255, 0, 255]);
      expect(gl.getError()).toBe(gl.NO_ERROR);
    },
  );
});

describe('shared-context mesh continuity', () => {
  it.each([
    'classic late construction',
    'initialized WebGPU fallback',
    'fallback survivor',
    'fallback before late classic',
    'fallback before late classic with reversed depth',
    'fallback before late classic with external blend',
    'fallback before late classic with pending successor',
  ] as const)('preserves an already-rendered back-facing mesh after %s retires', async (mode) => {
    const canvas = document.createElement('canvas');
    document.body.append(canvas);
    canvases.add(canvas);
    const attachOld = claimCanvasRenderer(canvas, () => undefined);
    const fallback =
      mode === 'classic late construction' || mode.startsWith('fallback before late classic')
        ? undefined
        : new WebGPURenderer({ canvas, ...forcedWebGlBackend });
    await fallback?.init();
    let release: ((renderer: WebGLRenderer | WebGPURenderer) => void) | undefined;
    const old = createRoot(canvas);
    const oldConfiguration = old.configure({
      gl: async () =>
        new Promise<WebGLRenderer | WebGPURenderer>((resolve) => {
          release = resolve;
        }),
      frameloop: 'never',
    });
    old.render(<group />);
    flushSync(() => {
      old.unmount();
    });
    const survivor = createRoot(canvas);
    roots.add(survivor);
    const attachSurvivor = claimCanvasRenderer(canvas, () => undefined);
    const renderer =
      mode === 'fallback survivor' || mode.startsWith('fallback before late classic')
        ? new WebGPURenderer({ canvas, ...forcedWebGlBackend, reversedDepthBuffer: mode.endsWith('reversed depth') })
        : new WebGLRenderer({ canvas });
    if (renderer instanceof WebGPURenderer) {
      await renderer.init();
      if (mode.endsWith('reversed depth')) {
        expect(renderer.reversedDepthBuffer).toBe(true);
      }
    }
    attachSurvivor(renderer);
    renderers.add(renderer);
    const camera = new PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 2;
    await survivor.configure({
      gl: renderer,
      camera,
      size: { width: 80, height: 80, top: 0, left: 0 },
      dpr: 1,
      flat: true,
      frameloop: 'never',
    });
    survivor.render(<group />);
    const geometry = new PlaneGeometry(2, 2);
    const material = new MeshBasicMaterial({ color: 0x00_ff_00, side: DoubleSide, toneMapped: false });
    const mesh = new Mesh(geometry, material);
    mesh.rotation.y = Math.PI;
    const scene = new Scene();
    scene.add(mesh);
    const gl = canvas.getContext('webgl2')!;
    if (mode.endsWith('reversed depth')) {
      expect(gl.getExtension('EXT_clip_control')).not.toBeNull();
    }
    const readMesh = () => {
      renderer.setClearColor(0x00_00_00, 1);
      renderer.render(scene, camera);
      const pixel = new Uint8Array(4);
      gl.readPixels(40, 40, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      return [...pixel];
    };
    const pendingSuccessor = mode.endsWith('pending successor')
      ? claimCanvasRenderer(canvas, () => undefined)
      : undefined;
    try {
      expect(readMesh()).toEqual([0, 255, 0, 255]);
      expect(gl.getError(), 'initial mesh render').toBe(gl.NO_ERROR);
      const backing = [canvas.width, canvas.height];
      const projection = camera.projectionMatrix.toArray();
      const retiring = fallback ?? new WebGLRenderer({ canvas });
      if (mode.endsWith('external blend')) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ZERO, gl.ZERO);
      }
      attachOld(retiring);
      expect(gl.getError(), 'late renderer attachment').toBe(gl.NO_ERROR);
      expect(retiring.domElement.getContext('webgl2')).toBe(gl);
      const disposed = vi.spyOn(retiring, 'dispose');
      release!(retiring);
      await oldConfiguration;
      await vi.waitFor(() => {
        expect(disposed).toHaveBeenCalledOnce();
      });
      expect(gl.getError(), 'retired renderer cleanup').toBe(gl.NO_ERROR);
      expect(gl.isContextLost()).toBe(false);
      expect([canvas.width, canvas.height]).toEqual(backing);
      expect(camera.projectionMatrix.toArray()).toEqual(projection);
      expect(readMesh()).toEqual([0, 255, 0, 255]);
      expect(gl.getError()).toBe(gl.NO_ERROR);
    } finally {
      pendingSuccessor?.cancel();
      geometry.dispose();
      material.dispose();
    }
  });
});

it('releases the initialized fallback context when its final owning root retires', async () => {
  const canvas = document.createElement('canvas');
  document.body.append(canvas);
  canvases.add(canvas);
  const attach = claimCanvasRenderer(canvas, () => undefined);
  const renderer = new WebGPURenderer({ canvas, ...forcedWebGlBackend });
  await renderer.init();
  attach(renderer);
  const context = canvas.getContext('webgl2')!;
  const dispose = vi.spyOn(renderer, 'dispose');
  const root = createRoot(canvas);
  await root.configure({ gl: () => renderer, frameloop: 'never' });
  root.render(<group />);
  flushSync(() => {
    root.unmount();
  });
  await vi.waitFor(() => {
    expect(dispose).toHaveBeenCalledOnce();
  });
  expect(context.isContextLost()).toBe(true);
  expect(_roots.has(canvas)).toBe(false);
});
