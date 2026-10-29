import { guardActors } from '@taucad/xstate-testing/inspect';
import { createActor, createAsyncLogic, waitFor } from 'xstate';
import { describe, expect, it } from 'vitest';
import { graphicsMachine } from '#machines/graphics.machine.js';
import { reportWebGpuCanvasLoss } from '#graphics/graphics-backend.js';

describe('WebGPU capability probe', () => {
  it('should report the probe unsettled until it answers', async () => {
    let answer: (value: boolean) => void = () => undefined;
    const actor = createActor(
      graphicsMachine.provide({
        actors: {
          probeWebGpu: createAsyncLogic({
            run: async () =>
              new Promise<boolean>((resolve) => {
                answer = resolve;
              }),
          }),
        },
      }),
      { input: { graphicsBackend: 'webgpu' } },
    );
    actor.start();
    try {
      expect(actor.getSnapshot().context).toMatchObject({ webGpuProbeSettled: false, webGpuAvailable: false });
      answer(true);
      await waitFor(actor, (snapshot) => snapshot.context.webGpuProbeSettled, { timeout: 1000 });
      expect(actor.getSnapshot().context).toMatchObject({ webGpuAvailable: true, resolvedGraphicsBackend: 'webgpu' });
    } finally {
      actor.stop();
    }
  });

  it('should settle the probe on WebGL when it fails', async () => {
    const actor = createActor(
      graphicsMachine.provide({
        actors: {
          probeWebGpu: createAsyncLogic({
            run: async () => {
              throw new Error('adapter request failed');
            },
          }),
        },
      }),
      { input: { graphicsBackend: 'webgpu' } },
    );
    actor.start();
    try {
      await waitFor(actor, (snapshot) => snapshot.context.webGpuProbeSettled, { timeout: 1000 });
      expect(actor.getSnapshot().context).toMatchObject({ webGpuAvailable: false, resolvedGraphicsBackend: 'webgl' });
    } finally {
      actor.stop();
    }
  });
});

describe('WebGPU canvas loss', () => {
  it('should turn WebGPU off for a live viewer when a canvas on the page loses its device', async () => {
    const actor = createActor(
      graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => true }) } }),
      { input: { graphicsBackend: 'webgpu' } },
    );
    actor.start();
    try {
      await waitFor(actor, (snapshot) => snapshot.context.webGpuProbeSettled, { timeout: 1000 });
      expect(actor.getSnapshot().context.resolvedGraphicsBackend).toBe('webgpu');

      reportWebGpuCanvasLoss();

      expect(actor.getSnapshot().context).toMatchObject({ webGpuAvailable: false, resolvedGraphicsBackend: 'webgl' });
    } finally {
      actor.stop();
    }
  });
});

describe('initialized renderer status', () => {
  it('should distinguish a capability probe from initialization and ignore retired-canvas cleanup', async () => {
    const guard = guardActors();
    const actor = createActor(
      graphicsMachine.provide({
        actors: { probeWebGpu: createAsyncLogic({ run: async () => true }) },
      }),
      { input: { graphicsBackend: 'webgpu' }, inspect: guard.inspect },
    );
    actor.start();
    try {
      await waitFor(actor, (snapshot) => snapshot.context.resolvedGraphicsBackend === 'webgpu', { timeout: 1000 });
      expect(actor.getSnapshot().context.activeRenderer).toBeUndefined();
      actor.send({ type: 'rendererInitialized', payload: { canvasId: 'old', backend: 'webgpu' } });
      expect(actor.getSnapshot().context.activeRenderer).toEqual({ canvasId: 'old', backend: 'webgpu' });
      actor.send({ type: 'rendererInitialized', payload: { canvasId: 'fallback', backend: 'webgl' } });
      actor.send({ type: 'rendererRemoved', canvasId: 'old' });
      expect(actor.getSnapshot().context.activeRenderer).toEqual({ canvasId: 'fallback', backend: 'webgl' });
      actor.send({ type: 'rendererRemoved', canvasId: 'fallback' });
      expect(actor.getSnapshot().context.activeRenderer).toBeUndefined();
    } finally {
      actor.stop();
    }
  });

  it('should wait only for a mounted canvas, and mark only that canvas presented', async () => {
    const guard = guardActors();
    const actor = createActor(
      graphicsMachine.provide({
        actors: { probeWebGpu: createAsyncLogic({ run: async () => true }) },
      }),
      { input: { graphicsBackend: 'webgpu' }, inspect: guard.inspect },
    );
    actor.start();
    try {
      // Nothing that draws frames is mounted: nothing to wait for.
      actor.send({ type: 'rendererPresented', canvasId: 'early' });
      expect(actor.getSnapshot().context.canvasPresentation).toBeUndefined();
      actor.send({ type: 'canvasMounted', canvasId: 'stage' });
      expect(actor.getSnapshot().context.canvasPresentation).toEqual({ canvasId: 'stage', presented: false });
      actor.send({ type: 'rendererPresented', canvasId: 'retired' });
      expect(actor.getSnapshot().context.canvasPresentation?.presented).toBe(false);
      actor.send({ type: 'rendererPresented', canvasId: 'stage' });
      expect(actor.getSnapshot().context.canvasPresentation).toEqual({ canvasId: 'stage', presented: true });
      // A replacement waits afresh; the retired canvas's unmount does not clear it.
      actor.send({ type: 'canvasMounted', canvasId: 'replacement' });
      actor.send({ type: 'canvasUnmounted', canvasId: 'stage' });
      expect(actor.getSnapshot().context.canvasPresentation).toEqual({ canvasId: 'replacement', presented: false });
      actor.send({ type: 'canvasUnmounted', canvasId: 'replacement' });
      expect(actor.getSnapshot().context.canvasPresentation).toBeUndefined();
    } finally {
      actor.stop();
    }
  });
});
