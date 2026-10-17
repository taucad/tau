import { describe, it, expect, vi, afterEach } from 'vitest';
import { createActor } from 'xstate';
import { resolveWebglContextLimit, webglContextMachine } from '#machines/webgl-context.machine.js';

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
      expect(actor.getSnapshot().context).toEqual({ count: 0, limit: 2 });
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
});
