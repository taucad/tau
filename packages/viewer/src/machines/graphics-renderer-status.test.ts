import { guardActors } from '@taucad/xstate-testing/inspect';
import type { CanvasHostCommand } from '#machines/canvas.machine.js';
import { createActor, createAsyncLogic, createCallbackLogic, waitFor } from 'xstate';
import { describe, expect, it } from 'vitest';
import { graphicsMachine } from '#machines/graphics.machine.js';
import { selectCanvasAwaitingFrame, selectCanvasBackend } from '#machines/canvas.machine.js';
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
      expect(actor.getSnapshot().hasTag('backend-probing')).toBe(true);
      expect(actor.getSnapshot().context.webGpuAvailable).toBe(false);
      answer(true);
      await waitFor(actor, (snapshot) => !snapshot.hasTag('backend-probing'), { timeout: 1000 });
      expect(actor.getSnapshot().matches({ operational: { backend: 'resolved' } })).toBe(true);
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
      await waitFor(actor, (snapshot) => !snapshot.hasTag('backend-probing'), { timeout: 1000 });
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
      await waitFor(actor, (snapshot) => !snapshot.hasTag('backend-probing'), { timeout: 1000 });
      expect(actor.getSnapshot().context.resolvedGraphicsBackend).toBe('webgpu');

      reportWebGpuCanvasLoss();

      expect(actor.getSnapshot().context).toMatchObject({ webGpuAvailable: false, resolvedGraphicsBackend: 'webgl' });
      expect(actor.getSnapshot().matches({ operational: { backend: 'lost' } })).toBe(true);
    } finally {
      actor.stop();
    }
  });
});

const surface = { width: 800, height: 600, pixelRatio: 1 } as const;
const idleHost = createCallbackLogic<CanvasHostCommand, undefined>(() => undefined);

const startGraphics = () => {
  const guard = guardActors();
  const actor = createActor(
    graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => true }) } }),
    { input: { graphicsBackend: 'webgpu' }, inspect: guard.inspect },
  );
  actor.start();
  const canvas = () => actor.getSnapshot().context.canvas;
  const host = (backend: 'webgl' | 'webgpu') => {
    canvas()?.ref.send({
      type: 'hostCreated',
      backend,
      surface,
      domElement: document.createElement('canvas'),
      host: idleHost,
    });
  };
  return { actor, canvas, host };
};

describe('canvas slot', () => {
  it('should hold one canvas actor per attached surface and report the renderer only while it draws', () => {
    const { actor, canvas, host } = startGraphics();
    try {
      expect(canvas()).toBeUndefined();
      actor.send({ type: 'canvasAttached', canvasId: 'old', kind: 'canvas' });
      expect(selectCanvasBackend(canvas()?.ref.getSnapshot())).toBeUndefined();
      host('webgpu');
      expect(selectCanvasBackend(canvas()?.ref.getSnapshot())).toBe('webgpu');
      // The fallback canvas replaces the old one; the old surface's late detach does not clear it.
      const old = canvas()?.ref;
      actor.send({ type: 'canvasAttached', canvasId: 'fallback', kind: 'canvas' });
      expect(old?.getSnapshot().status).toBe('stopped');
      host('webgl');
      actor.send({ type: 'canvasDetached', canvasId: 'old' });
      expect(canvas()?.canvasId).toBe('fallback');
      expect(selectCanvasBackend(canvas()?.ref.getSnapshot())).toBe('webgl');
      actor.send({ type: 'canvasDetached', canvasId: 'fallback' });
      expect(canvas()).toBeUndefined();
    } finally {
      actor.stop();
    }
  });

  it('should wait only on an attached surface, and only until its first frame is on screen', () => {
    const { actor, canvas, host } = startGraphics();
    try {
      // Nothing that draws frames is attached: nothing to wait for.
      expect(selectCanvasAwaitingFrame(canvas()?.ref.getSnapshot())).toBe(false);
      actor.send({ type: 'canvasAttached', canvasId: 'stage', kind: 'canvas' });
      expect(selectCanvasAwaitingFrame(canvas()?.ref.getSnapshot())).toBe(true);
      host('webgpu');
      expect(selectCanvasAwaitingFrame(canvas()?.ref.getSnapshot())).toBe(true);
      canvas()?.ref.send({ type: 'framePresented' });
      expect(selectCanvasAwaitingFrame(canvas()?.ref.getSnapshot())).toBe(false);
      // A replacement waits afresh; the retired surface's detach does not clear it.
      actor.send({ type: 'canvasAttached', canvasId: 'replacement', kind: 'canvas' });
      actor.send({ type: 'canvasDetached', canvasId: 'stage' });
      expect(selectCanvasAwaitingFrame(canvas()?.ref.getSnapshot())).toBe(true);
      actor.send({ type: 'canvasDetached', canvasId: 'replacement' });
      expect(canvas()).toBeUndefined();
    } finally {
      actor.stop();
    }
  });

  it('should keep a re-delivered attach on the running canvas actor', () => {
    const { actor, canvas } = startGraphics();
    try {
      actor.send({ type: 'canvasAttached', canvasId: 'stage', kind: 'canvas' });
      const first = canvas()?.ref;
      actor.send({ type: 'canvasAttached', canvasId: 'stage', kind: 'canvas' });
      expect(canvas()?.ref).toBe(first);
    } finally {
      actor.stop();
    }
  });

  it('should stop its canvas actor when graphics stops', () => {
    const { actor, canvas } = startGraphics();
    actor.send({ type: 'canvasAttached', canvasId: 'stage', kind: 'canvas' });
    const ref = canvas()?.ref;
    actor.stop();
    expect(ref?.getSnapshot().status).toBe('stopped');
  });
});
