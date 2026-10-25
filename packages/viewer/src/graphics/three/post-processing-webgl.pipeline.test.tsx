import { act, render } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { Mesh, DepthTexture, OrthographicCamera, PerspectiveCamera, Scene, ShaderMaterial, Texture } from 'three';
import type { WebGLRenderer } from 'three';
import type { RootState } from '@react-three/fiber';
import type { ThreeCamera } from '@taucad/three/camera';
import type { PostProcessingSettings } from '#graphics/three/post-processing-settings.js';

const callbacks = vi.hoisted(() => ({
  frame: undefined as ((state: RootState, delta: number) => void) | undefined,
  retarget: undefined as ((camera: ThreeCamera) => void) | undefined,
  restore: undefined as (() => void) | undefined,
}));

const perspectiveCamera = new PerspectiveCamera();
const orthographicCamera = new OrthographicCamera();
const rig = { perspectiveCamera, orthographicCamera, activeCamera: perspectiveCamera as ThreeCamera };
const scene = new Scene();
const size = { width: 800, height: 600, top: 0, left: 0 };
const viewport = mock<RootState['viewport']>({ dpr: 2 });
type Draw = {
  target: Parameters<WebGLRenderer['setRenderTarget']>[0];
  geometry: boolean;
  material?: ShaderMaterial;
  textures: unknown[];
  depth: Texture | undefined;
};
const draws: Draw[] = [];
let target: Parameters<WebGLRenderer['setRenderTarget']>[0] = null;
const context = mock<WebGL2RenderingContext>({ getContextAttributes: () => ({ alpha: true }) });
const renderer = mock<WebGLRenderer>({
  getSize: (value) => value.set(size.width, size.height),
  getDrawingBufferSize: (value) => value.set(size.width * viewport.dpr, size.height * viewport.dpr),
  getContext: () => context,
  getRenderTarget: () => null,
  capabilities: mock<WebGLRenderer['capabilities']>({ logarithmicDepthBuffer: true }),
  xr: mock<WebGLRenderer['xr']>({ enabled: false }),
  shadowMap: mock<WebGLRenderer['shadowMap']>({ autoUpdate: true }),
  properties: mock<WebGLRenderer['properties']>({ get: () => ({}) }),
});
const state = mock<RootState>();
state.size = size;
state.viewport = viewport;
state.gl = renderer;
state.scene = scene;
state.camera = perspectiveCamera;

vi.mock('@react-three/fiber', () => ({
  useThree: () => state,
  useFrame: (callback: typeof callbacks.frame) => {
    callbacks.frame = callback;
  },
}));
vi.mock('#hooks/use-graphics.jsx', () => ({
  useCameraRig: () => rig,
  useCameraRetarget: (callback: typeof callbacks.retarget) => {
    useLayoutEffect(() => {
      callbacks.retarget = callback;
      return () => {
        callbacks.retarget = undefined;
      };
    }, [callback]);
  },
}));
vi.mock('#graphics/three/scene-overlay.jsx', () => ({
  useOverlayDepthRestore: (callback: typeof callbacks.restore) => {
    callbacks.restore = callback;
  },
}));

beforeEach(() => {
  draws.length = 0;
  target = null;
  size.width = 800;
  size.height = 600;
  viewport.dpr = 2;
  rig.activeCamera = perspectiveCamera;
  renderer.setRenderTarget.mockImplementation((value) => {
    target = value;
  });
  renderer.render.mockImplementation((object) => {
    const mesh = object instanceof Mesh ? object : object.children.find((child) => child instanceof Mesh);
    const material = mesh instanceof Mesh && mesh.material instanceof ShaderMaterial ? mesh.material : undefined;
    draws.push({
      target,
      geometry: object === scene,
      material,
      depth: target?.depthTexture ?? undefined,
      textures: material
        ? Object.values(material.uniforms).flatMap(({ value }: { value: unknown }) =>
            value instanceof Texture ? [value] : [],
          )
        : [],
    });
  });
});

describe('PostProcessingWebGL native complete pass chain', () => {
  it.each([
    { aoCompositeStage: 'display' },
    { aoCompositeStage: 'scene' },
    { displayMode: 'ao' },
    { aoEnabled: false },
    { aoEnabled: false, aoCompositeStage: 'scene' },
    { webglHalfResolution: true },
  ] satisfies Array<Partial<PostProcessingSettings>>)(
    'should keep fullscreen color writes out of geometry MSAA across frames with %j',
    async (settings) => {
      const { PostProcessingWebGL: PostProcessingWebGl } = await import('#graphics/three/post-processing-webgl.jsx');
      const mounted = render(<PostProcessingWebGl settings={settings} />);
      try {
        for (const camera of [perspectiveCamera, orthographicCamera]) {
          act(() => callbacks.retarget?.(camera));
          for (const frame of [0, 1]) {
            draws.length = 0;
            callbacks.frame?.(state, 1 / 60);
            const geometryDraws = draws.filter((draw) => draw.geometry);
            const colorDraws = draws.filter((draw) => !draw.geometry);
            expect(geometryDraws).toHaveLength(1);
            expect(geometryDraws[0]?.target?.samples).toBe(4);
            expect(geometryDraws[0]?.target?.width).toBe(size.width * viewport.dpr);
            expect(geometryDraws[0]?.target?.height).toBe(size.height * viewport.dpr);
            // The actual final FXAA EffectPass must be included, not a four-pass proxy.
            expect(colorDraws.at(-1)?.target).toBeNull();
            expect(colorDraws.at(-1)?.material?.fragmentShader).toContain('Fxaa(');
            expect(colorDraws.flatMap((draw) => (draw.target ? [draw.target.samples] : []))).not.toContain(4);
            expect(colorDraws.every((draw) => !draw.target || !draw.textures.includes(draw.target.textures[0]!))).toBe(
              true,
            );
            const encodedColor = colorDraws.at(-2)?.target;
            expect(encodedColor?.depthBuffer).toBe(false);
            expect(encodedColor?.width).toBe(size.width * viewport.dpr);
            expect(encodedColor?.height).toBe(size.height * viewport.dpr);
            expect(colorDraws.at(-1)?.textures).toContain(encodedColor?.textures[0]);
            callbacks.restore?.();
            const restoredDepth: unknown = draws.at(-1)?.material?.uniforms['depthBuffer']?.value;
            expect(restoredDepth).toBeInstanceOf(DepthTexture);
            expect(restoredDepth).not.toBe(geometryDraws[0]?.depth);
            expect(draws.at(-1)?.material?.colorWrite).toBe(false);
            expect(draws.at(-1)?.material?.depthWrite).toBe(true);
            if (frame === 0) {
              size.width = 1024;
              viewport.dpr = 1;
              mounted.rerender(<PostProcessingWebGl settings={settings} />);
            }
          }
        }
      } finally {
        mounted.unmount();
      }
    },
  );

  it('should release the retained display target and native effects once on unmount', async () => {
    const { PostProcessingWebGL: PostProcessingWebGl } = await import('#graphics/three/post-processing-webgl.jsx');
    const mounted = render(<PostProcessingWebGl />);
    try {
      callbacks.frame?.(state, 1 / 60);
      const colorTarget = draws.at(-2)!.target!;
      const targetDisposed = vi.fn();
      const outputDisposed = vi.fn();
      const antialiasDisposed = vi.fn();
      colorTarget.addEventListener('dispose', targetDisposed);
      draws.at(-2)!.material!.addEventListener('dispose', outputDisposed);
      draws.at(-1)!.material!.addEventListener('dispose', antialiasDisposed);
      const versions = draws.slice(-2).map((draw) => draw.material!.version);
      callbacks.frame?.(state, 1 / 60);
      expect(draws.at(-2)?.target).toBe(colorTarget);
      expect(draws.slice(-2).map((draw) => draw.material!.version)).toEqual(versions);
      mounted.unmount();
      expect(targetDisposed).toHaveBeenCalledOnce();
      expect(outputDisposed).toHaveBeenCalledOnce();
      expect(antialiasDisposed).toHaveBeenCalledOnce();
    } finally {
      mounted.unmount();
    }
  });
});
