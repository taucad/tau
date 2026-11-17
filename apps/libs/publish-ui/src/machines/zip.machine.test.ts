import { describe, it, expect, vi, afterEach } from 'vitest';
import { createActor, waitFor } from 'xstate';
import { fromSafeAsync } from '@taucad/ui-core/lib/xstate.lib';
import { zipMachine } from '#machines/zip.machine.js';

vi.mock('jszip', () => ({
  default: class MockJsZip {
    public files: Record<string, unknown> = {};
    public file(name: string, content: unknown) {
      this.files[name] = content;
      return this;
    }
    public async generateAsync() {
      return new Blob(['mock-zip-content']);
    }
  },
}));

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function createTestActor() {
  return createActor(zipMachine, { input: {} });
}

function createGeneratingActor(options?: { throwOnGenerate?: boolean }) {
  const machine = zipMachine.provide({
    actors: {
      generateZipActor: fromSafeAsync(async () => {
        if (options?.throwOnGenerate) {
          throw new Error('zip generation failed');
        }
        return { type: 'zipGenerated', blob: new Blob(['test']) };
      }),
    },
  });
  return createActor(machine, { input: {} });
}

const testContent = new Uint8Array([1, 2, 3]);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('zipMachine', () => {
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

  describe('file management', () => {
    it('should add a file to context', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'addFile', filename: 'test.txt', content: testContent });
      expect(actor.getSnapshot().context.files.size).toBe(1);
      expect(actor.getSnapshot().context.files.has('test.txt')).toBe(true);
      actor.stop();
    });

    it('should add multiple files', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({
        type: 'addFiles',
        files: [
          { filename: 'a.txt', content: testContent },
          { filename: 'b.txt', content: testContent },
        ],
      });
      expect(actor.getSnapshot().context.files.size).toBe(2);
      expect(actor.getSnapshot().context.files.has('a.txt')).toBe(true);
      expect(actor.getSnapshot().context.files.has('b.txt')).toBe(true);
      actor.stop();
    });
  });

  describe('generating', () => {
    it('should NOT generate when no files (guard: hasFiles)', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'generate' });
      expect(actor.getSnapshot().value).toBe('idle');
      actor.stop();
    });

    it('should transition to generating then ready on generate', async () => {
      const actor = createGeneratingActor();
      actor.start();
      actor.send({ type: 'addFile', filename: 'test.txt', content: testContent });
      actor.send({ type: 'generate' });
      expect(actor.getSnapshot().value).toBe('generating');

      await waitFor(actor, (s) => s.value === 'ready');
      expect(actor.getSnapshot().value).toBe('ready');
      actor.stop();
    });

    it('should have zipBlob in context after generate', async () => {
      const actor = createGeneratingActor();
      actor.start();
      actor.send({ type: 'addFile', filename: 'test.txt', content: testContent });
      actor.send({ type: 'generate' });

      await waitFor(actor, (s) => s.value === 'ready');
      expect(actor.getSnapshot().context.zipBlob).toBeInstanceOf(Blob);
      actor.stop();
    });

    it('should go back to idle when adding files after ready', async () => {
      const actor = createGeneratingActor();
      actor.start();
      actor.send({ type: 'addFile', filename: 'test.txt', content: testContent });
      actor.send({ type: 'generate' });

      await waitFor(actor, (s) => s.value === 'ready');
      actor.send({ type: 'addFile', filename: 'new.txt', content: testContent });

      expect(actor.getSnapshot().value).toBe('idle');
      expect(actor.getSnapshot().context.files.has('new.txt')).toBe(true);
      expect(actor.getSnapshot().context.zipBlob).toBeUndefined();
      actor.stop();
    });
  });

  describe('error handling', () => {
    it('should transition to error on generate failure', async () => {
      const actor = createGeneratingActor({ throwOnGenerate: true });
      actor.start();
      actor.send({ type: 'addFile', filename: 'test.txt', content: testContent });
      actor.send({ type: 'generate' });

      await waitFor(actor, (s) => s.value === 'error');
      expect(actor.getSnapshot().value).toBe('error');
      expect(actor.getSnapshot().context.error?.message).toBe('zip generation failed');
      actor.stop();
    });
  });

  describe('reset', () => {
    it('should clear files and blob on reset', async () => {
      const actor = createGeneratingActor();
      actor.start();
      actor.send({ type: 'addFile', filename: 'test.txt', content: testContent });
      actor.send({ type: 'generate' });

      await waitFor(actor, (s) => s.value === 'ready');
      actor.send({ type: 'reset' });

      expect(actor.getSnapshot().value).toBe('idle');
      expect(actor.getSnapshot().context.files.size).toBe(0);
      expect(actor.getSnapshot().context.zipBlob).toBeUndefined();
      actor.stop();
    });
  });
});
