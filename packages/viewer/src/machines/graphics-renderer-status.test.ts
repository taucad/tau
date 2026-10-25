import { guardActors } from '@taucad/xstate-testing/inspect';
import { createActor, createAsyncLogic, waitFor } from 'xstate';
import { describe, expect, it } from 'vitest';
import { graphicsMachine } from '#machines/graphics.machine.js';

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

  it('should mark only the active canvas presented, and keep it across a repeated report', async () => {
    const guard = guardActors();
    const actor = createActor(
      graphicsMachine.provide({
        actors: { probeWebGpu: createAsyncLogic({ run: async () => true }) },
      }),
      { input: { graphicsBackend: 'webgpu' }, inspect: guard.inspect },
    );
    actor.start();
    try {
      actor.send({ type: 'rendererPresented', canvasId: 'early' });
      expect(actor.getSnapshot().context.activeRenderer).toBeUndefined();
      actor.send({ type: 'rendererInitialized', payload: { canvasId: 'stage', backend: 'webgpu' } });
      actor.send({ type: 'rendererPresented', canvasId: 'retired' });
      expect(actor.getSnapshot().context.activeRenderer?.presented).toBeUndefined();
      actor.send({ type: 'rendererPresented', canvasId: 'stage' });
      expect(actor.getSnapshot().context.activeRenderer).toEqual({
        canvasId: 'stage',
        backend: 'webgpu',
        presented: true,
      });
      actor.send({ type: 'rendererInitialized', payload: { canvasId: 'stage', backend: 'webgpu' } });
      expect(actor.getSnapshot().context.activeRenderer?.presented).toBe(true);
      actor.send({ type: 'rendererInitialized', payload: { canvasId: 'replacement', backend: 'webgl' } });
      expect(actor.getSnapshot().context.activeRenderer).toEqual({ canvasId: 'replacement', backend: 'webgl' });
    } finally {
      actor.stop();
    }
  });
});
