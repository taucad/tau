import { describe, it, expect, vi, afterEach } from 'vitest';
import { createActor } from 'xstate';
import { logLevels } from '@taucad/types/constants';
import { logMachine } from '#machines/logs.machine.js';

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function createTestActor() {
  const actor = createActor(logMachine);
  actor.start();
  return actor;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('logMachine', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('should start in ready state', () => {
      const actor = createTestActor();
      expect(actor.getSnapshot().value).toBe('ready');
      actor.stop();
    });

    it('should isolate mutable log buffers between actors', () => {
      const first = createTestActor();
      const second = createTestActor();

      first.send({ type: 'addLog', message: 'first project' });
      second.send({ type: 'addLog', message: 'second project' });
      first.send({ type: 'clearLogs' });

      expect(first.getSnapshot().context.logBuffer.size).toBe(0);
      expect(
        second
          .getSnapshot()
          .context.logBuffer.toArray()
          .map(({ message }) => message),
      ).toEqual(['second project']);

      first.stop();
      second.stop();
    });
  });

  describe('addLog', () => {
    it('should add a single log entry with default level', () => {
      const actor = createTestActor();
      actor.send({ type: 'addLog', message: 'test message' });
      const { context } = actor.getSnapshot();
      expect(context.logBuffer.size).toBe(1);
      const entry = context.logBuffer.get(0);
      expect(entry?.message).toBe('test message');
      expect(entry?.level).toBe(logLevels.info);
      actor.stop();
    });

    it('should add log with custom level and origin', () => {
      const actor = createTestActor();
      actor.send({
        type: 'addLog',
        message: 'error occurred',
        options: { level: logLevels.error, origin: { component: 'kernel' } },
      });
      const entry = actor.getSnapshot().context.logBuffer.get(0);
      expect(entry?.level).toBe(logLevels.error);
      expect(entry?.origin?.component).toBe('kernel');
      actor.stop();
    });

    it('should increment version on each add', () => {
      const actor = createTestActor();
      const versionBefore = actor.getSnapshot().context.logVersion;
      actor.send({ type: 'addLog', message: 'first' });
      expect(actor.getSnapshot().context.logVersion).toBe(versionBefore + 1);
      actor.send({ type: 'addLog', message: 'second' });
      expect(actor.getSnapshot().context.logVersion).toBe(versionBefore + 2);
      actor.stop();
    });
  });

  describe('addLogs', () => {
    it('should add multiple log entries in one event', () => {
      const actor = createTestActor();
      actor.send({
        type: 'addLogs',
        entries: [
          { message: 'first' },
          { message: 'second', options: { level: logLevels.warn } },
          { message: 'third' },
        ],
      });
      const { context } = actor.getSnapshot();
      expect(context.logBuffer.size).toBe(3);
      // Ring buffer stores newest at index 0
      expect(context.logBuffer.get(0)?.message).toBe('third');
      expect(context.logBuffer.get(1)?.message).toBe('second');
      expect(context.logBuffer.get(1)?.level).toBe(logLevels.warn);
      expect(context.logBuffer.get(2)?.message).toBe('first');
      actor.stop();
    });
  });

  describe('clearLogs', () => {
    it('should clear all log entries', () => {
      const actor = createTestActor();
      actor.send({ type: 'addLog', message: 'entry 1' });
      actor.send({ type: 'addLog', message: 'entry 2' });
      expect(actor.getSnapshot().context.logBuffer.size).toBe(2);
      actor.send({ type: 'clearLogs' });
      expect(actor.getSnapshot().context.logBuffer.size).toBe(0);
      actor.stop();
    });

    it('should increment version on clear', () => {
      const actor = createTestActor();
      actor.send({ type: 'addLog', message: 'entry' });
      const versionBeforeClear = actor.getSnapshot().context.logVersion;
      actor.send({ type: 'clearLogs' });
      expect(actor.getSnapshot().context.logVersion).toBeGreaterThan(versionBeforeClear);
      actor.stop();
    });
  });
});
