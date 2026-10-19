import { describe, it, expect, vi, afterEach } from 'vitest';
import { createActor } from 'xstate';
import {
  admitsViewerContext,
  estimateViewerSurfaceBytes,
  resolveViewerSurfaceByteBudget,
  resolveWebglContextLimit,
  webglContextMachine,
} from '#machines/webgl-context.machine.js';

function createTestActor() {
  return createActor(webglContextMachine);
}

describe('webglContextMachine', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('should start with count 0 and limit 8', () => {
      const actor = createTestActor();
      actor.start();
      const { context } = actor.getSnapshot();
      expect(context.count).toBe(0);
      expect(context.limit).toBe(8);
      actor.stop();
    });
  });

  describe('device-aware limit', () => {
    it('should admit only two contexts on a touch-first device', () => {
      expect(resolveWebglContextLimit({ coarsePointer: true })).toBe(2);
    });

    it('should admit only two contexts on a device with 4 GB of memory or less', () => {
      expect(resolveWebglContextLimit({ coarsePointer: false, deviceMemoryGigabytes: 4 })).toBe(2);
    });

    it('should keep eight contexts on a desktop device', () => {
      expect(resolveWebglContextLimit({ coarsePointer: false, deviceMemoryGigabytes: 8 })).toBe(8);
      expect(resolveWebglContextLimit({ coarsePointer: false })).toBe(8);
    });

    it('should start with the limit its owner resolved for the device', () => {
      const actor = createActor(webglContextMachine, { input: { limit: 2 } });
      actor.start();
      expect(actor.getSnapshot().context).toMatchObject({ count: 0, limit: 2, bytes: 0 });
      actor.stop();
    });
  });

  describe('acquire', () => {
    it('should increment count on acquire', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'acquire' });
      expect(actor.getSnapshot().context.count).toBe(1);
      actor.stop();
    });

    it('should track multiple acquires', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'acquire' });
      actor.send({ type: 'acquire' });
      actor.send({ type: 'acquire' });
      expect(actor.getSnapshot().context.count).toBe(3);
      actor.stop();
    });
  });

  describe('release', () => {
    it('should decrement count on release', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'acquire' });
      actor.send({ type: 'acquire' });
      actor.send({ type: 'release' });
      expect(actor.getSnapshot().context.count).toBe(1);
      actor.stop();
    });

    it('should not decrement below 0 (hasActiveContexts guard)', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'release' });
      expect(actor.getSnapshot().context.count).toBe(0);
      actor.stop();
    });

    it('should not decrement below 0 after multiple releases', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'acquire' });
      actor.send({ type: 'release' });
      actor.send({ type: 'release' });
      actor.send({ type: 'release' });
      expect(actor.getSnapshot().context.count).toBe(0);
      actor.stop();
    });
  });

  describe('acquire and release balance', () => {
    it('should return to 0 after equal acquires and releases', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'acquire' });
      actor.send({ type: 'acquire' });
      actor.send({ type: 'acquire' });
      actor.send({ type: 'release' });
      actor.send({ type: 'release' });
      actor.send({ type: 'release' });
      expect(actor.getSnapshot().context.count).toBe(0);
      actor.stop();
    });

    it('should preserve limit across acquire/release cycles', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'acquire' });
      actor.send({ type: 'release' });
      expect(actor.getSnapshot().context.limit).toBe(8);
      actor.stop();
    });
  });

  describe('surface bytes', () => {
    const mebibyte = 1024 ** 2;

    it('should estimate a viewer surface from its CSS area and pixel ratio', () => {
      // An iPhone canvas at DPR 2: 1.34 Mpx of drawing buffer.
      expect(estimateViewerSurfaceBytes(390 * 844, 2) / mebibyte).toBeCloseTo(80.4, 1);
      expect(estimateViewerSurfaceBytes(-1, 2)).toBe(0);
    });

    it('should budget half the reported device memory, assuming 8 GB when unreported', () => {
      expect(resolveViewerSurfaceByteBudget({ coarsePointer: true, deviceMemoryGigabytes: 4 })).toBe(2 * 1024 ** 3);
      expect(resolveViewerSurfaceByteBudget({ coarsePointer: false })).toBe(4 * 1024 ** 3);
    });

    it('should track each holder until it resizes and releases', () => {
      const actor = createActor(webglContextMachine, { input: { limit: 8, byteBudget: 100 } });
      actor.start();
      actor.send({ type: 'acquire', id: 'a', bytes: 40 });
      actor.send({ type: 'acquire', id: 'b', bytes: 40 });
      expect(actor.getSnapshot().context).toMatchObject({ count: 2, bytes: 80 });
      actor.send({ type: 'resize', id: 'a', bytes: 10 });
      expect(actor.getSnapshot().context.bytes).toBe(50);
      actor.send({ type: 'resize', id: 'unknown', bytes: 1000 });
      expect(actor.getSnapshot().context.bytes).toBe(50);
      actor.send({ type: 'release', id: 'b' });
      expect(actor.getSnapshot().context).toMatchObject({ count: 1, bytes: 10, holders: { a: 10 } });
      actor.stop();
    });

    it('should admit a viewer only within both the context limit and the byte budget', () => {
      const base = { count: 1, limit: 2, bytes: 60, byteBudget: 100 };
      expect(admitsViewerContext(base, 40)).toBe(true);
      expect(admitsViewerContext(base, 41)).toBe(false);
      expect(admitsViewerContext({ ...base, count: 2, bytes: 0 }, 1)).toBe(false);
      // The first viewer always renders, however large its canvas.
      expect(admitsViewerContext({ ...base, count: 0, bytes: 0 }, 1000)).toBe(true);
    });
  });
});
