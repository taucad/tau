import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { createTauR3fGlProp } from '@taucad/viewer/graphics/three/canvas-three-gl';
import {
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  NoToneMapping,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
} from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

function hasDispose(value: unknown): value is { dispose: () => void } {
  return typeof value === 'object' && value !== null && 'dispose' in value && typeof value.dispose === 'function';
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it.each(['webgl', 'webgpu'] as const)(
  'keeps a public-factory %s survivor usable when an initialized automatic fallback retires late',
  async (survivorBackend) => {
    const canvas = document.createElement('canvas');
    document.body.append(canvas);
    // Exercise Three's real automatic fallback, representing an unavailable adapter.
    if (!('gpu' in navigator)) {
      throw new Error('Expected browser GPU adapter surface');
    }
    const { gpu } = navigator;
    if (typeof gpu !== 'object' || gpu === null) {
      throw new Error('Expected browser GPU adapter surface');
    }
    const adapterDescriptor = Object.getOwnPropertyDescriptor(gpu, 'requestAdapter');
    Object.defineProperty(gpu, 'requestAdapter', { configurable: true, value: async () => null });
    const { init } = WebGPURenderer.prototype;
    let initialized: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => {
      initialized = resolve;
    });
    let release: (() => void) | undefined;
    const retiredReady = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(WebGPURenderer.prototype, 'init').mockImplementationOnce(async function (this: WebGPURenderer) {
      await init.call(this);
      initialized!();
      await retiredReady;
      return this;
    });
    const oldFactory = createTauR3fGlProp('webgpu');
    const pending = oldFactory({ canvas });
    await ready;
    const factory = createTauR3fGlProp(survivorBackend);
    const survivor = await factory({ canvas });
    if (!(survivor instanceof WebGLRenderer || survivor instanceof WebGPURenderer)) {
      throw new Error('Expected a real initialized WebGL or fallback survivor');
    }
    expect(survivor instanceof WebGPURenderer).toBe(survivorBackend === 'webgpu');
    survivor.setSize(80, 80, false);
    survivor.setPixelRatio(1);
    survivor.toneMapping = NoToneMapping;
    const camera = new PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 2;
    const geometry = new PlaneGeometry(2, 2);
    const material = new MeshBasicMaterial({ color: 0x00_ff_00, side: DoubleSide, toneMapped: false });
    const mesh = new Mesh(geometry, material);
    mesh.rotation.y = Math.PI;
    const scene = new Scene();
    scene.add(mesh);
    const context = canvas.getContext('webgl2')!;
    const pixels = () => {
      survivor.setClearColor(0x00_00_00, 1);
      survivor.render(scene, camera);
      const pixel = new Uint8Array(4);
      context.readPixels(40, 40, 1, 1, context.RGBA, context.UNSIGNED_BYTE, pixel);
      return [...pixel];
    };
    try {
      expect(pixels()).toEqual([0, 255, 0, 255]);
      release!();
      const old = await pending;
      if (!(old instanceof WebGPURenderer)) {
        throw new Error('Expected a real initialized node renderer');
      }
      expect('isWebGLBackend' in old.backend && old.backend.isWebGLBackend).toBe(true);
      expect(old.getContext()).toBe(context);
      const backend: unknown = old.backend;
      if (!hasDispose(backend)) {
        throw new Error('Expected initialized backend disposal');
      }
      const backendDispose = vi.spyOn(backend, 'dispose');
      old.dispose();
      expect(backendDispose).toHaveBeenCalledOnce();
      expect(context.isContextLost()).toBe(false);
      expect(pixels()).toEqual([0, 255, 0, 255]);
      expect(context.getError()).toBe(context.NO_ERROR);
      survivor.dispose();
      if (survivor instanceof WebGLRenderer) {
        survivor.forceContextLoss();
      }
      expect(context.isContextLost()).toBe(true);
    } finally {
      release!();
      geometry.dispose();
      material.dispose();
      survivor.dispose();
      canvas.remove();
      if (adapterDescriptor) {
        Object.defineProperty(gpu, 'requestAdapter', adapterDescriptor);
      } else {
        Reflect.deleteProperty(gpu, 'requestAdapter');
      }
    }
  },
);

it('disposes a public-factory renderer through unmodified Canvas fresh-element remounts', async () => {
  const host = document.createElement('div');
  host.style.width = '80px';
  host.style.height = '80px';
  document.body.append(host);
  const mounted = createRoot(host);
  const first = createTauR3fGlProp('webgl');
  const second = createTauR3fGlProp('webgl');
  const created: WebGLRenderer[] = [];
  const onCreated = ({ gl }: { gl: unknown }) => {
    if (!(gl instanceof WebGLRenderer)) {
      throw new Error('Expected classic renderer');
    }
    created.push(gl);
  };
  try {
    await act(async () => {
      mounted.render(createElement(Canvas, { key: 'first', gl: first, frameloop: 'never', onCreated }));
    });
    await vi.waitFor(() => {
      expect(created).toHaveLength(1);
    });
    const firstRenderer = created[0]!;
    const firstContext = firstRenderer.getContext();
    const firstDispose = vi.spyOn(firstRenderer, 'dispose');
    await act(async () => {
      mounted.render(createElement(Canvas, { key: 'second', gl: second, frameloop: 'never', onCreated }));
    });
    await vi.waitFor(() => {
      expect(created).toHaveLength(2);
      expect(firstDispose).toHaveBeenCalledOnce();
    });
    const secondRenderer = created[1]!;
    expect(secondRenderer.domElement).not.toBe(firstRenderer.domElement);
    expect(secondRenderer.getContext()).not.toBe(firstContext);
    expect(firstContext.isContextLost()).toBe(true);
    expect(secondRenderer.getContext().isContextLost()).toBe(false);
    const secondDispose = vi.spyOn(secondRenderer, 'dispose');
    await act(async () => {
      mounted.unmount();
    });
    await vi.waitFor(() => {
      expect(secondDispose).toHaveBeenCalledOnce();
    });
    expect(secondRenderer.getContext().isContextLost()).toBe(true);
  } finally {
    await act(async () => {
      mounted.unmount();
    });
    host.remove();
  }
});
