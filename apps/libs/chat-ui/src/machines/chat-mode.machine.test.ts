import { describe, it, expect, vi, afterEach } from 'vitest';
import { createActor } from 'xstate';
import { chatMode } from '@taucad/chat/constants';
import { chatModeMachine } from '#machines/chat-mode.machine.js';

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function createTestActor() {
  return createActor(chatModeMachine);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('chatModeMachine', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('should start in idle state with agent mode', () => {
      const actor = createTestActor();
      actor.start();
      expect(actor.getSnapshot().value).toBe('idle');
      expect(actor.getSnapshot().context.mode).toBe(chatMode.agent);
      expect(actor.getSnapshot().context.activePlanPath).toBeUndefined();
      actor.stop();
    });
  });

  describe('SET_MODE', () => {
    it('should update mode in idle state', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'SET_MODE', mode: chatMode.plan });
      expect(actor.getSnapshot().context.mode).toBe(chatMode.plan);
      expect(actor.getSnapshot().value).toBe('idle');
      actor.stop();
    });

    it('should clear activePlanPath and return to idle from planCreated', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'PLAN_FILE_DETECTED', path: '/plans/v1.md' });
      expect(actor.getSnapshot().value).toBe('planCreated');
      actor.send({ type: 'SET_MODE', mode: chatMode.agent });
      expect(actor.getSnapshot().value).toBe('idle');
      expect(actor.getSnapshot().context.activePlanPath).toBeUndefined();
      actor.stop();
    });
  });

  describe('plan lifecycle', () => {
    it('should transition to planCreated on PLAN_FILE_DETECTED', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'PLAN_FILE_DETECTED', path: '/plans/v1.md' });
      expect(actor.getSnapshot().value).toBe('planCreated');
      expect(actor.getSnapshot().context.activePlanPath).toBe('/plans/v1.md');
      actor.stop();
    });

    it('should transition to building on BUILD_APPROVED', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'PLAN_FILE_DETECTED', path: '/plans/v1.md' });
      actor.send({ type: 'BUILD_APPROVED' });
      expect(actor.getSnapshot().value).toBe('building');
      expect(actor.getSnapshot().context.activePlanPath).toBe('/plans/v1.md');
      actor.stop();
    });

    it('should return to idle with agent mode on BUILD_COMPLETE', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'PLAN_FILE_DETECTED', path: '/plans/v1.md' });
      actor.send({ type: 'BUILD_APPROVED' });
      actor.send({ type: 'BUILD_COMPLETE' });
      expect(actor.getSnapshot().value).toBe('idle');
      expect(actor.getSnapshot().context.activePlanPath).toBeUndefined();
      expect(actor.getSnapshot().context.mode).toBe(chatMode.agent);
      actor.stop();
    });
  });

  describe('ignored events', () => {
    it('should ignore BUILD_APPROVED in idle state', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'BUILD_APPROVED' });
      expect(actor.getSnapshot().value).toBe('idle');
      actor.stop();
    });

    it('should ignore PLAN_FILE_DETECTED in building state', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'PLAN_FILE_DETECTED', path: '/plans/v1.md' });
      actor.send({ type: 'BUILD_APPROVED' });
      expect(actor.getSnapshot().value).toBe('building');
      actor.send({ type: 'PLAN_FILE_DETECTED', path: '/plans/v2.md' });
      expect(actor.getSnapshot().value).toBe('building');
      expect(actor.getSnapshot().context.activePlanPath).toBe('/plans/v1.md');
      actor.stop();
    });
  });
});
