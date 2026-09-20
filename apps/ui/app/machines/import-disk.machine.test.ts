import { describe, it, expect, vi, afterEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { createActor, waitFor } from 'xstate';
import { importDiskMachine } from '#machines/import-disk.machine.js';
import { fromSafeAsync } from '#lib/xstate.lib.js';
import type * as FileReaderUtilities from '#utils/file-reader.utils.js';

vi.mock('#utils/file-reader.utils.js', async (importOriginal) => ({
  ...(await importOriginal<typeof FileReaderUtilities>()),
  readFromFileList: vi.fn(async () => new Map([['main.ts', { filename: 'main.ts', content: new Uint8Array([1]) }]])),
  readFromDataTransfer: vi.fn(
    async () => new Map([['main.ts', { filename: 'main.ts', content: new Uint8Array([1]) }]]),
  ),
  readFromDirectoryHandle: vi.fn(
    async () => new Map([['main.ts', { filename: 'main.ts', content: new Uint8Array([1]) }]]),
  ),
  normalizeFilePaths: vi.fn((files: unknown) => files),
  getImportName: vi.fn(() => 'Test Import'),
}));

vi.mock('#routes/import.$/import.utils.js', () => ({
  findMainFile: vi.fn(() => 'main.ts'),
}));

vi.mock('jszip', () => ({
  default: {
    loadAsync: vi.fn(async () => ({ files: {} })),
  },
}));

const mockFiles = new Map([['main.ts', { filename: 'main.ts', content: new Uint8Array([1]) }]]);

/** A zip a person exported from a checkout: working tree plus the repository. */
const repositoryFiles = new Map([
  ['main.ts', { filename: 'main.ts', content: new Uint8Array([1]) }],
  ['src/part.ts', { filename: 'src/part.ts', content: new Uint8Array([2]) }],
  ['.git/HEAD', { filename: '.git/HEAD', content: new Uint8Array([3]) }],
  ['.git/objects/ab/cdef', { filename: '.git/objects/ab/cdef', content: new Uint8Array([4]) }],
  ['.tau/binding.json', { filename: '.tau/binding.json', content: new Uint8Array([5]) }],
  ['node_modules/replicad/index.js', { filename: 'node_modules/replicad/index.js', content: new Uint8Array([6]) }],
  /* Anchored, so a vendored repository is the user's own content. */
  ['vendor/dep/.git/HEAD', { filename: 'vendor/dep/.git/HEAD', content: new Uint8Array([7]) }],
]);

type OnProgress = (processed: number, total: number) => void;

type FilesReadEvent = { type: 'filesRead'; files: typeof mockFiles; importName: string };

function createReadActor<Input>() {
  return fromSafeAsync<FilesReadEvent, Input>(async () => {
    return { type: 'filesRead', files: mockFiles, importName: 'Test Import' };
  });
}

function createTestActor(options?: { throwOnRead?: boolean; files?: typeof mockFiles }) {
  const machine = importDiskMachine.provide({
    actors: {
      readFilesActor: fromSafeAsync(async () => {
        if (options?.throwOnRead) {
          throw new Error('read failed');
        }
        return { type: 'filesRead', files: options?.files ?? mockFiles, importName: 'Test Import' };
      }),
      readDataTransferActor: createReadActor<{ items: DataTransferItemList; onProgress: OnProgress }>(),
      readDirectoryHandleActor: createReadActor<{ handle: FileSystemDirectoryHandle; onProgress: OnProgress }>(),
      extractZipActor: createReadActor<{ file: File; onProgress: OnProgress }>(),
      createProjectActor: fromSafeAsync(async () => {
        return { type: 'projectCreated', projectId: 'proj_123' };
      }),
    },
  });

  return createActor(machine, { input: {} });
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
      expect(context.files.size).toBe(0);
      expect(context.importName).toBe('Uploaded Files');
      expect(context.selectedMainFile).toBeUndefined();
      expect(context.error).toBeUndefined();
      expect(context.projectId).toBeUndefined();
      actor.stop();
    });
  });

  describe('reading files', () => {
    it('should transition to reading on processFiles', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'processFiles', files: mock<FileList>() });
      expect(actor.getSnapshot().value).toBe('reading');
      actor.stop();
    });

    it('should transition to selectingMainFile after reading completes', async () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'processFiles', files: mock<FileList>() });
      await waitFor(actor, (s) => s.value === 'selectingMainFile');
      expect(actor.getSnapshot().value).toBe('selectingMainFile');
      actor.stop();
    });

    it('should set files and importName in context', async () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'processFiles', files: mock<FileList>() });
      await waitFor(actor, (s) => s.value === 'selectingMainFile');
      const { context } = actor.getSnapshot();
      expect(context.files.size).toBe(1);
      expect(context.files.has('main.ts')).toBe(true);
      expect(context.importName).toBe('Test Import');
      actor.stop();
    });

    it('should auto-select main file', async () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'processFiles', files: mock<FileList>() });
      await waitFor(actor, (s) => s.value === 'selectingMainFile');
      expect(actor.getSnapshot().context.selectedMainFile).toBe('main.ts');
      actor.stop();
    });
  });

  /* D29/ND23: the project's own repository lives at `.git` in the same
   * filesystem as its working tree, so an imported `.git` would be written over
   * it. The import carries the tree and drops the repository that came with it. */
  describe('an import that carries its own repository', () => {
    it('imports the working tree and drops what no import carries', async () => {
      const actor = createTestActor({ files: repositoryFiles });
      actor.start();
      actor.send({ type: 'processFiles', files: mock<FileList>() });
      await waitFor(actor, (s) => s.value === 'selectingMainFile');

      expect([...actor.getSnapshot().context.files.keys()]).toStrictEqual([
        'main.ts',
        'src/part.ts',
        'vendor/dep/.git/HEAD',
      ]);
      actor.stop();
    });

    it('never emits the dropped bytes to the route that creates the project', async () => {
      const actor = createTestActor({ files: repositoryFiles });
      const ready: string[][] = [];
      actor.on('filesReady', (event) => {
        ready.push([...event.files.keys()]);
      });
      actor.start();
      actor.send({ type: 'processFiles', files: mock<FileList>() });
      await waitFor(actor, (s) => s.value === 'selectingMainFile');

      expect(ready).toStrictEqual([['main.ts', 'src/part.ts', 'vendor/dep/.git/HEAD']]);
      actor.stop();
    });
  });

  describe('selecting main file', () => {
    it('should accept selectMainFile event', async () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'processFiles', files: mock<FileList>() });
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
      actor.send({ type: 'processFiles', files: mock<FileList>() });
      await waitFor(actor, (s) => s.value === 'selectingMainFile');
      actor.send({ type: 'confirmImport' });
      expect(actor.getSnapshot().value).toBe('creating');
      actor.stop();
    });

    it('should transition to success after project creation', async () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'processFiles', files: mock<FileList>() });
      await waitFor(actor, (s) => s.value === 'selectingMainFile');
      actor.send({ type: 'confirmImport' });
      await waitFor(actor, (s) => s.value === 'success');
      expect(actor.getSnapshot().context.projectId).toBe('proj_123');
      actor.stop();
    });
  });

  describe('error handling', () => {
    it('should go to error on read failure', async () => {
      const actor = createTestActor({ throwOnRead: true });
      actor.start();
      actor.send({ type: 'processFiles', files: mock<FileList>() });
      await waitFor(actor, (s) => s.value === 'error');
      expect(actor.getSnapshot().context.error?.message).toBe('read failed');
      actor.stop();
    });

    it('should recover from error with retry', async () => {
      const actor = createTestActor({ throwOnRead: true });
      actor.start();
      actor.send({ type: 'processFiles', files: mock<FileList>() });
      await waitFor(actor, (s) => s.value === 'error');
      actor.send({ type: 'retry' });
      expect(actor.getSnapshot().value).toBe('idle');
      expect(actor.getSnapshot().context.error).toBeUndefined();
      actor.stop();
    });

    it('should reset from error state', async () => {
      const actor = createTestActor({ throwOnRead: true });
      actor.start();
      actor.send({ type: 'processFiles', files: mock<FileList>() });
      await waitFor(actor, (s) => s.value === 'error');
      actor.send({ type: 'reset' });
      expect(actor.getSnapshot().value).toBe('idle');
      actor.stop();
    });
  });

  describe('reset', () => {
    it('should reset on reset event from idle', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'reset' });
      const { context } = actor.getSnapshot();
      expect(context.files.size).toBe(0);
      expect(context.error).toBeUndefined();
      expect(context.projectId).toBeUndefined();
      actor.stop();
    });
  });
});
