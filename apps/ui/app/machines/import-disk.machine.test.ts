import { describe, it, expect, vi, afterEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { createActor, waitFor } from 'xstate';
import { importDiskMachine } from '#machines/import-disk.machine.js';
import type { ImportPlanner } from '#machines/import-disk.machine.js';
import type { ImportListing, ImportSourceDescriptor } from '#machines/import-staging.js';
import { fromSafeAsync } from '#lib/xstate.lib.js';

vi.mock('#routes/import.$/import.utils.js', () => ({
  findMainFile: vi.fn(() => 'main.ts'),
}));

const listing: ImportListing = {
  name: 'Test Import',
  files: [
    { path: 'main.ts', size: 1 },
    { path: 'src/part.ts', size: 2 },
  ],
  bytes: 3,
  skipped: { excluded: 2, reserved: 0, symlinks: 0 },
};

function createTestActor(options?: {
  throwOnRead?: boolean;
  plan?: ImportPlanner;
  onCreate?: (input: { listing: ImportListing; onProgress: (processed: number, total: number) => void }) => void;
}) {
  const plan: ImportPlanner =
    options?.plan ??
    (async () => {
      if (options?.throwOnRead) {
        throw new Error('read failed');
      }
      return listing;
    });
  const machine = importDiskMachine.provide({
    actors: {
      createProjectActor: fromSafeAsync<
        { type: 'projectCreated'; projectId: string },
        { listing: ImportListing; onProgress: (processed: number, total: number) => void }
      >(async ({ input }) => {
        options?.onCreate?.(input);
        return { type: 'projectCreated', projectId: 'proj_123' };
      }),
    },
  });

  return createActor(machine, { input: { plan } });
}

describe('importDiskMachine', () => {
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

    it('should have correct context defaults', () => {
      const actor = createTestActor();
      actor.start();
      const { context } = actor.getSnapshot();
      expect(context.listing.files).toHaveLength(0);
      expect(context.importName).toBe('Uploaded Files');
      expect(context.selectedMainFile).toBeUndefined();
      expect(context.error).toBeUndefined();
      expect(context.projectId).toBeUndefined();
      actor.stop();
    });
  });

  /* W7 (charter D12): the page hands each source over by reference and reads none of its bytes. */
  describe('planning in the worker', () => {
    it('hands picked files over with their paths, never their bytes', async () => {
      const sources: ImportSourceDescriptor[] = [];
      const actor = createTestActor({
        plan: async (source) => {
          sources.push(source);
          return listing;
        },
      });
      const file = new File(['x'], 'main.ts');
      actor.start();
      actor.send({ type: 'processFiles', files: [file] });
      expect(actor.getSnapshot().value).toBe('reading');
      await waitFor(actor, (s) => s.value === 'selectingMainFile');

      /* The very File, by reference: the page never read it. */
      expect(sources).toStrictEqual([{ kind: 'files', files: [{ file, path: 'main.ts' }] }]);
      expect((sources[0] as Extract<ImportSourceDescriptor, { kind: 'files' }>).files[0]!.file).toBe(file);
      actor.stop();
    });

    it('hands a zip and a picked folder over as they are', async () => {
      const sources: ImportSourceDescriptor[] = [];
      const plan: ImportPlanner = async (source) => {
        sources.push(source);
        return listing;
      };
      const file = new File(['zip'], 'gear.zip');
      const handle = mock<FileSystemDirectoryHandle>();
      const zipActor = createTestActor({ plan });
      zipActor.start();
      zipActor.send({ type: 'processZip', file });
      await waitFor(zipActor, (s) => s.value === 'selectingMainFile');
      const folderActor = createTestActor({ plan });
      folderActor.start();
      folderActor.send({ type: 'processDirectoryHandle', handle });
      await waitFor(folderActor, (s) => s.value === 'selectingMainFile');

      expect(sources).toStrictEqual([
        { kind: 'zip', file },
        { kind: 'directory', handle },
      ]);
      zipActor.stop();
      folderActor.stop();
    });

    it('should keep the listing and its name, and auto-select the main file', async () => {
      const actor = createTestActor();
      const ready: ImportListing[] = [];
      actor.on('filesReady', (event) => {
        ready.push(event.listing);
      });
      actor.start();
      actor.send({ type: 'processFiles', files: [new File(['x'], 'main.ts')] });
      await waitFor(actor, (s) => s.value === 'selectingMainFile');
      const { context } = actor.getSnapshot();
      expect(context.listing).toBe(listing);
      expect(context.importName).toBe('Test Import');
      expect(context.selectedMainFile).toBe('main.ts');
      expect(ready).toStrictEqual([listing]);
      actor.stop();
    });

    it('should fail plainly without a planner', async () => {
      const actor = createActor(importDiskMachine, { input: {} });
      actor.start();
      actor.send({ type: 'processZip', file: new File([''], 'a.zip') });
      await waitFor(actor, (s) => s.value === 'error');
      expect(actor.getSnapshot().context.error?.message).toMatch(/file manager/u);
      actor.stop();
    });
  });

  describe('selecting main file', () => {
    it('should accept selectMainFile event', async () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'processFiles', files: [new File(['x'], 'main.ts')] });
      await waitFor(actor, (s) => s.value === 'selectingMainFile');
      actor.send({ type: 'selectMainFile', file: 'other.ts' });
      expect(actor.getSnapshot().context.selectedMainFile).toBe('other.ts');
      actor.stop();
    });
  });

  describe('creating project', () => {
    it('should transition to creating on confirmImport', async () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'processFiles', files: [new File(['x'], 'main.ts')] });
      await waitFor(actor, (s) => s.value === 'selectingMainFile');
      actor.send({ type: 'confirmImport' });
      expect(actor.getSnapshot().value).toBe('creating');
      actor.stop();
    });

    it('should stage from the listing, report staging progress, and finish with the project', async () => {
      const progress: Array<{ processed: number; total: number }> = [];
      const actor = createTestActor({
        onCreate: (input) => {
          expect(input.listing).toBe(listing);
          input.onProgress(1, 2);
        },
      });
      actor.on('progress', ({ processed, total }) => {
        progress.push({ processed, total });
      });
      actor.start();
      actor.send({ type: 'processFiles', files: [new File(['x'], 'main.ts')] });
      await waitFor(actor, (s) => s.value === 'selectingMainFile');
      actor.send({ type: 'confirmImport' });
      await waitFor(actor, (s) => s.value === 'success');
      expect(actor.getSnapshot().context.projectId).toBe('proj_123');
      expect(progress).toStrictEqual([{ processed: 1, total: 2 }]);
      actor.stop();
    });
  });

  describe('error handling', () => {
    it('should go to error on read failure', async () => {
      const actor = createTestActor({ throwOnRead: true });
      actor.start();
      actor.send({ type: 'processFiles', files: [new File(['x'], 'main.ts')] });
      await waitFor(actor, (s) => s.value === 'error');
      expect(actor.getSnapshot().context.error?.message).toBe('read failed');
      actor.stop();
    });

    it('should recover from error with retry', async () => {
      const actor = createTestActor({ throwOnRead: true });
      actor.start();
      actor.send({ type: 'processFiles', files: [new File(['x'], 'main.ts')] });
      await waitFor(actor, (s) => s.value === 'error');
      actor.send({ type: 'retry' });
      expect(actor.getSnapshot().value).toBe('idle');
      expect(actor.getSnapshot().context.error).toBeUndefined();
      actor.stop();
    });

    it('should reset from error state', async () => {
      const actor = createTestActor({ throwOnRead: true });
      actor.start();
      actor.send({ type: 'processFiles', files: [new File(['x'], 'main.ts')] });
      await waitFor(actor, (s) => s.value === 'error');
      actor.send({ type: 'reset' });
      expect(actor.getSnapshot().value).toBe('idle');
      actor.stop();
    });
  });

  describe('reset', () => {
    it('leaves a host plan still listing on reset, and never turns its late listing into the review', async () => {
      const listed = Promise.withResolvers<ImportListing>();
      const actor = createTestActor({ plan: async () => listed.promise });
      actor.start();
      actor.send({ type: 'processHost', grants: [{ grant: 'grant-1', name: 'folder', kind: 'directory' }] });
      expect(actor.getSnapshot().value).toBe('readingHost');
      actor.send({ type: 'reset' });
      expect(actor.getSnapshot().value).toBe('idle');
      listed.resolve(listing);
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
      expect(actor.getSnapshot().value).toBe('idle');
      expect(actor.getSnapshot().context.listing.files).toHaveLength(0);
      actor.stop();
    });

    it('should reset on reset event from idle', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'reset' });
      const { context } = actor.getSnapshot();
      expect(context.listing.files).toHaveLength(0);
      expect(context.error).toBeUndefined();
      expect(context.projectId).toBeUndefined();
      actor.stop();
    });
  });
});
