import { describe, it, expect, vi, afterEach } from 'vitest';
import { createActor, waitFor } from 'xstate';
import { fromSafeAsync } from '@taucad/ui-core/lib/xstate.lib';
import { unzipMachine } from '#machines/unzip.machine.js';

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

const mockFiles = new Map([['test.txt', { filename: 'test.txt', content: new Uint8Array([1, 2, 3]) }]]);

function createTestActor(options?: { throwOnExtract?: boolean }) {
  const machine = unzipMachine.provide({
    actors: {
      extractZipActor: fromSafeAsync(async () => {
        if (options?.throwOnExtract) {
          throw new Error('extraction failed');
        }
        return { type: 'zipExtracted', files: mockFiles };
      }),
    },
  });
  return createActor(machine, { input: {} });
}

const testBlob = new Blob(['test-zip']);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('unzipMachine', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('should start in idle state', () => {
      const actor = createTestActor();
      actor.start();
      expect(actor.getSnapshot().value).toBe('idle');
      actor.stop();
    });
  });

  describe('extracting', () => {
    it('should transition to extracting on extract event', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'extract', zipBlob: testBlob });
      expect(actor.getSnapshot().value).toBe('extracting');
      actor.stop();
    });

    it('should transition to ready and have files in context after extract', async () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'extract', zipBlob: testBlob });

      await waitFor(actor, (s) => s.value === 'ready');
      expect(actor.getSnapshot().value).toBe('ready');
      expect(actor.getSnapshot().context.files.size).toBe(1);
      expect(actor.getSnapshot().context.files.has('test.txt')).toBe(true);
      actor.stop();
    });

    it('should re-extract from ready state', async () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'extract', zipBlob: testBlob });

      await waitFor(actor, (s) => s.value === 'ready');
      expect(actor.getSnapshot().value).toBe('ready');

      const newBlob = new Blob(['new-zip']);
      actor.send({ type: 'extract', zipBlob: newBlob });
      expect(actor.getSnapshot().value).toBe('extracting');

      await waitFor(actor, (s) => s.value === 'ready');
      expect(actor.getSnapshot().context.zipBlob).toBe(newBlob);
      actor.stop();
    });
  });

  describe('error handling', () => {
    it('should transition to error on extract failure', async () => {
      const actor = createTestActor({ throwOnExtract: true });
      actor.start();
      actor.send({ type: 'extract', zipBlob: testBlob });

      await waitFor(actor, (s) => s.value === 'error');
      expect(actor.getSnapshot().value).toBe('error');
      expect(actor.getSnapshot().context.error?.message).toBe('extraction failed');
      actor.stop();
    });
  });

  describe('reset', () => {
    it('should reset to idle with reset event', async () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'extract', zipBlob: testBlob });

      await waitFor(actor, (s) => s.value === 'ready');
      actor.send({ type: 'reset' });

      expect(actor.getSnapshot().value).toBe('idle');
      expect(actor.getSnapshot().context.files.size).toBe(0);
      expect(actor.getSnapshot().context.zipBlob).toBeUndefined();
      actor.stop();
    });
  });
});
