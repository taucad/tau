// oxlint-disable-next-line import/no-unassigned-import -- Side-effect import to polyfill IndexedDB for tests
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ChangeEventBus } from '#change-event-bus.js';
import { CrossTabCoordinator } from '#cross-tab-coordinator.js';
import { getEventOrigin } from '#event-origin-registry.js';
import { createWorkspaceFileService, encoder, waitFor } from '#testing/workspace-service-harness.js';
import type { ProjectRootConfig } from '#mount-table.js';
import type { ChangeEvent, FileSystemProvider, WatchEvent } from '#types.js';
import type { WorkspaceFileService } from '#workspace-file-service.js';

/**
 * `mutation-pipeline.ts` owns every write: lock sets, commit, cache and index
 * bookkeeping, events and batch semantics. These rows drive that behaviour
 * through `WorkspaceFileService` because the pipeline is reached from the
 * composition root; W5 moved them here byte-for-byte because the pipeline owns
 * it, and added the first direct `mutationLockPaths` rows at the end.
 */
describe('WorkspaceFileService', () => {
  let service: WorkspaceFileService;
  let eventBus: ChangeEventBus;
  let rootProvider: FileSystemProvider;

  beforeEach(async () => {
    const context = await createWorkspaceFileService();
    service = context.service;
    eventBus = context.eventBus;
    rootProvider = context.provider;
  });

  // ---------------------------------------------------------------------------
  // mkdir
  // ---------------------------------------------------------------------------

  describe('mkdir', () => {
    it('should create a single directory', async () => {
      await service.mkdir('/newdir');
      expect(await service.exists('/newdir')).toBe(true);
      const stat = await service.stat('/newdir');
      expect(stat.type).toBe('dir');
    });

    it('should create nested directories with recursive option', async () => {
      await service.mkdir('/a/b/c', { recursive: true });
      expect(await service.exists('/a')).toBe(true);
      expect(await service.exists('/a/b')).toBe(true);
      expect(await service.exists('/a/b/c')).toBe(true);
    });

    it('keeps recursive mkdir of an existing directory silent', async () => {
      const coordinator = new CrossTabCoordinator();
      const notifyMutation = vi.spyOn(coordinator, 'notifyMutation');
      const context = await createWorkspaceFileService({ crossTabCoordinator: coordinator });
      const events: ChangeEvent[] = [];
      context.eventBus.subscribe((event) => events.push(event));

      try {
        await context.service.mkdir('/existing', { recursive: true });
        notifyMutation.mockClear();
        events.length = 0;

        await expect(context.service.mkdir('/existing', { recursive: true })).resolves.toBeUndefined();
        expect(events).toEqual([]);
        expect(notifyMutation).not.toHaveBeenCalled();
      } finally {
        context.service.dispose();
        coordinator.dispose();
      }
    });

    it('should throw when creating nested directory without recursive', async () => {
      await expect(service.mkdir('/x/y/z')).rejects.toThrow();
    });

    it('broadly invalidates local and peer projections after a partial recursive mkdir failure', async () => {
      const coordinator = new CrossTabCoordinator();
      const notifyDirectoryChange = vi.spyOn(coordinator, 'notifyDirectoryChange');
      const context = await createWorkspaceFileService({ crossTabCoordinator: coordinator });
      const events: ChangeEvent[] = [];
      context.eventBus.subscribe((event) => events.push(event));
      const originalMkdir = context.provider.mkdir.bind(context.provider);
      vi.spyOn(context.provider, 'mkdir').mockImplementationOnce(async () => {
        await originalMkdir('partial');
        throw new Error('injected recursive mkdir failure');
      });

      try {
        await expect(context.service.mkdir('/partial/nested', { recursive: true })).rejects.toThrow(
          'injected recursive mkdir failure',
        );
        await expect(context.provider.exists('partial')).resolves.toBe(true);
        expect(events).toContainEqual({ type: 'backendChanged', backend: 'memory' });
        expect(notifyDirectoryChange).toHaveBeenCalledWith('/', {
          storageRootKey: 'memory:0',
          providerBasePath: '',
        });
      } finally {
        context.service.dispose();
        coordinator.dispose();
      }
    });

    it('should list new subdirectories in readDirectory after recursive mkdir', async () => {
      await service.writeFile('/root/existing.txt', 'x');
      const beforeMkdir = await service.readDirectory('/root');
      expect(beforeMkdir.map((n) => n.name)).toEqual(['existing.txt']);

      await service.mkdir('/root/deep/nested', { recursive: true });

      const afterMkdir = await service.readDirectory('/root');
      const names = afterMkdir.map((n) => n.name);
      expect(names).toContain('existing.txt');
      expect(names).toContain('deep');
    });

    it('should not require unrelated directory reads to refresh siblings after mkdir', async () => {
      await service.mkdir('/other', { recursive: true });
      await service.writeFile('/other/file.txt', 'y');
      await service.readDirectory('/other');

      await service.writeFile('/root/file.txt', 'x');
      await service.readDirectory('/root');

      await service.mkdir('/root/child');

      const rootEntries = await service.readDirectory('/root');
      expect(rootEntries.map((n) => n.name)).toContain('child');

      const otherEntries = await service.readDirectory('/other');
      expect(otherEntries.map((n) => n.name)).toContain('file.txt');
    });
  });

  // ---------------------------------------------------------------------------
  // move
  // ---------------------------------------------------------------------------

  describe('move', () => {
    it('should return a stat for the resulting file', async () => {
      await service.writeFile('/source.txt', 'data');
      const stat = await service.move('/source.txt', '/target.txt');
      expect(stat.type).toBe('file');
      expect(stat.size).toBe(4);
    });

    it('should move an entire directory subtree', async () => {
      await service.writeFile('/src/index.ts', 'export {}');
      await service.writeFile('/src/utils/helpers.ts', 'export {}');
      const stat = await service.move('/src', '/lib');
      expect(stat.type).toBe('dir');
      expect(await service.exists('/src')).toBe(false);
      expect(await service.exists('/lib/index.ts')).toBe(true);
      expect(await service.exists('/lib/utils/helpers.ts')).toBe(true);
    });

    it('should refuse to overwrite an existing target', async () => {
      await service.writeFile('/keep.txt', 'untouched');
      await service.writeFile('/source.txt', 'replace');
      await expect(service.move('/source.txt', '/keep.txt')).rejects.toThrow('EEXIST');
      const content = await service.readFile('/keep.txt', 'utf8');
      expect(content).toBe('untouched');
    });

    // Persisted-record writers (durable chat claims, RPC responses) create and
    // then repeatedly UPDATE one path. `move` is fail-closed on an existing
    // target, so a temp-file + `move` "atomic write" throws EEXIST on every
    // update; `writeFile` is the replace primitive. Guards the real semantics
    // that the UI's `writePersistedRecord` depends on.
    it('should replace a persisted record in place across repeated updates', async () => {
      const path = '/.tau/runs/run_1.json';
      await service.writeFile(path, '{"admitted":false}');
      await service.writeFile(path, '{"admitted":true}');
      await service.writeFile(path, '{"admitted":true,"turnId":"turn_2"}');

      expect(await service.readFile(path, 'utf8')).toBe('{"admitted":true,"turnId":"turn_2"}');
      await service.writeFile('/replacement.json', '{}');
      await expect(service.move('/replacement.json', path)).rejects.toThrow('EEXIST');
    });

    it('should emit directoryRenamed for directory sources', async () => {
      await service.writeFile('/src/a.txt', 'a');
      const events: ChangeEvent[] = [];
      eventBus.subscribe((event) => events.push(event));
      await service.move('/src', '/lib');
      expect(events).toContainEqual(
        expect.objectContaining({ type: 'directoryRenamed', oldPath: '/src', newPath: '/lib' }),
      );
    });

    it('should emit fileRenamed for file sources', async () => {
      await service.writeFile('/a.txt', 'a');
      const events: ChangeEvent[] = [];
      eventBus.subscribe((event) => events.push(event));
      await service.move('/a.txt', '/b.txt');
      expect(events).toContainEqual(
        expect.objectContaining({ type: 'fileRenamed', oldPath: '/a.txt', newPath: '/b.txt' }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // R6: canMove / canRename / canCreate / canDelete preflights
  // ---------------------------------------------------------------------------

  describe('canMove preflight', () => {
    it('returns true when source exists and target is free', async () => {
      await service.writeFile('/source.txt', 'data');
      const result = await service.canMove('/source.txt', '/target.txt');
      expect(result).toBe(true);
    });

    it('returns NOT_FOUND when the source does not exist', async () => {
      const result = await service.canMove('/missing.txt', '/target.txt');
      expect(result).not.toBe(true);
      if (result === true) {
        return;
      }
      expect(result.code).toBe('NOT_FOUND');
      expect(result.path).toBe('/missing.txt');
    });

    it('returns NAME_EXISTS when the target already exists', async () => {
      await service.writeFile('/source.txt', 'src');
      await service.writeFile('/keep.txt', 'keep');
      const result = await service.canMove('/source.txt', '/keep.txt');
      expect(result).not.toBe(true);
      if (result === true) {
        return;
      }
      expect(result.code).toBe('NAME_EXISTS');
      expect(result.target).toBe('/keep.txt');
    });

    it('returns INVALID_NAME for paths that traverse above virtual root', async () => {
      await service.writeFile('/source.txt', 'src');
      const result = await service.canMove('/source.txt', '/../bar.txt');
      expect(result).not.toBe(true);
      if (result === true) {
        return;
      }
      expect(result.code).toBe('INVALID_NAME');
    });

    it('returns BUNDLED_TYPES_WORKSPACE for /node_modules paths', async () => {
      await service.writeFile('/source.txt', 'src');
      const result = await service.canMove('/source.txt', '/node_modules/foo.ts');
      expect(result).not.toBe(true);
      if (result === true) {
        return;
      }
      expect(result.code).toBe('BUNDLED_TYPES_WORKSPACE');
    });
  });

  describe('canRename preflight', () => {
    it('rejects newName containing a slash with INVALID_NAME', async () => {
      await service.writeFile('/a.txt', 'a');
      const result = await service.canRename('/a.txt', 'b/c.txt');
      expect(result).not.toBe(true);
      if (result === true) {
        return;
      }
      expect(result.code).toBe('INVALID_NAME');
    });

    it('rejects rename onto a sibling that already exists with NAME_EXISTS', async () => {
      await service.writeFile('/a.txt', 'a');
      await service.writeFile('/b.txt', 'b');
      const result = await service.canRename('/a.txt', 'b.txt');
      expect(result).not.toBe(true);
      if (result === true) {
        return;
      }
      expect(result.code).toBe('NAME_EXISTS');
    });

    it('accepts a sibling rename to a free name', async () => {
      await service.writeFile('/a.txt', 'a');
      const result = await service.canRename('/a.txt', 'b.txt');
      expect(result).toBe(true);
    });
  });

  describe('canCreate preflight', () => {
    it('returns true for a new file path', async () => {
      const result = await service.canCreate('/new.txt', 'file');
      expect(result).toBe(true);
    });

    it('returns NAME_EXISTS for an occupied path', async () => {
      await service.writeFile('/existing.txt', 'x');
      const result = await service.canCreate('/existing.txt', 'file');
      expect(result).not.toBe(true);
      if (result === true) {
        return;
      }
      expect(result.code).toBe('NAME_EXISTS');
    });

    it('rejects /node_modules with BUNDLED_TYPES_WORKSPACE', async () => {
      const result = await service.canCreate('/node_modules/new.ts', 'file');
      expect(result).not.toBe(true);
      if (result === true) {
        return;
      }
      expect(result.code).toBe('BUNDLED_TYPES_WORKSPACE');
    });

    it('rejects non-canonical aliases before interpreting their target', async () => {
      const result = await service.canCreate('/safe/../node_modules/new.ts', 'file');
      expect(result).not.toBe(true);
      if (result === true) {
        return;
      }
      expect(result.code).toBe('INVALID_NAME');
    });

    it('rejects relative paths with INVALID_NAME', async () => {
      const result = await service.canCreate('relative.txt', 'file');
      expect(result).not.toBe(true);
      if (result === true) {
        return;
      }
      expect(result.code).toBe('INVALID_NAME');
    });
  });

  describe('canDelete preflight', () => {
    it('returns true for an existing path', async () => {
      await service.writeFile('/gone.txt', 'g');
      const result = await service.canDelete('/gone.txt');
      expect(result).toBe(true);
    });

    it('returns NOT_FOUND for a missing path', async () => {
      const result = await service.canDelete('/never.txt');
      expect(result).not.toBe(true);
      if (result === true) {
        return;
      }
      expect(result.code).toBe('NOT_FOUND');
    });

    it('rejects /node_modules with BUNDLED_TYPES_WORKSPACE', async () => {
      const result = await service.canDelete('/node_modules/foo/index.d.ts');
      expect(result).not.toBe(true);
      if (result === true) {
        return;
      }
      expect(result.code).toBe('BUNDLED_TYPES_WORKSPACE');
    });
  });

  // ---------------------------------------------------------------------------
  // Sequential bulkMove with truthful partial results
  // ---------------------------------------------------------------------------

  describe('bulkMove', () => {
    it('moves every edit when all succeed', async () => {
      await service.writeFile('/a.txt', 'a');
      await service.writeFile('/b.txt', 'b');
      await service.writeFile('/c.txt', 'c');
      const result = await service.bulkMove([
        { source: '/a.txt', target: '/dst/a.txt' },
        { source: '/b.txt', target: '/dst/b.txt' },
        { source: '/c.txt', target: '/dst/c.txt' },
      ]);
      expect(result.moved.length).toBe(3);
      expect(result.failed.length).toBe(0);
      expect(await service.exists('/dst/a.txt')).toBe(true);
      expect(await service.exists('/dst/b.txt')).toBe(true);
      expect(await service.exists('/dst/c.txt')).toBe(true);
    });

    it('reports a failed middle edit without rolling back completed moves', async () => {
      await service.writeFile('/a.txt', 'a');
      await service.writeFile('/b.txt', 'b');
      await service.writeFile('/c.txt', 'c');
      await service.writeFile('/dst/b.txt', 'collision');

      const result = await service.bulkMove([
        { source: '/a.txt', target: '/dst/a.txt' },
        { source: '/b.txt', target: '/dst/b.txt' },
        { source: '/c.txt', target: '/dst/c.txt' },
      ]);

      expect(result.moved.map(({ edit }) => edit.source)).toEqual(['/a.txt', '/c.txt']);
      expect(result.failed.length).toBe(1);
      expect(result.failed[0]?.edit.source).toBe('/b.txt');
      expect(result.failed[0]?.error.code).toBe('NAME_EXISTS');

      expect(await service.exists('/a.txt')).toBe(false);
      expect(await service.exists('/b.txt')).toBe(true);
      expect(await service.exists('/c.txt')).toBe(false);
      expect(await service.exists('/dst/a.txt')).toBe(true);
      expect(await service.exists('/dst/c.txt')).toBe(true);
      expect(await service.readFile('/dst/b.txt', 'utf8')).toBe('collision');
    });

    it('does not misreport an unknown provider failure as a missing source', async () => {
      await service.writeFile('/source.txt', 'data');
      const denied = Object.assign(new Error('permission denied'), { code: 'EACCES' });
      vi.spyOn(rootProvider, 'rename').mockRejectedValueOnce(denied);

      const result = await service.bulkMove([{ source: '/source.txt', target: '/target.txt' }]);

      expect(result.moved).toEqual([]);
      expect(result.failed[0]?.error).toMatchObject({
        code: 'OPERATION_FAILED',
        path: '/source.txt',
        target: '/target.txt',
      });
      expect(await service.readFile('/source.txt', 'utf8')).toBe('data');
    });

    it('never rolls a completed move back over a peer write after a later edit fails', async () => {
      await service.writeFile('/a.txt', 'original');
      await service.writeFile('/b.txt', 'blocked');
      await service.writeFile('/dst/b.txt', 'collision');
      const originalMove = service.move.bind(service);
      let moveCount = 0;
      vi.spyOn(service, 'move').mockImplementation(async (source, target, context) => {
        const stat = await originalMove(source, target, context);
        moveCount += 1;
        if (moveCount === 1) {
          await service.writeFile(target, 'peer update');
        }
        return stat;
      });

      const result = await service.bulkMove([
        { source: '/a.txt', target: '/dst/a.txt' },
        { source: '/b.txt', target: '/dst/b.txt' },
      ]);

      expect(result.moved.map(({ edit }) => edit.source)).toEqual(['/a.txt']);
      expect(result.failed.map(({ edit }) => edit.source)).toEqual(['/b.txt']);
      expect(await service.readFile('/dst/a.txt', 'utf8')).toBe('peer update');
      expect(await service.readFile('/dst/b.txt', 'utf8')).toBe('collision');
    });

    it('returns an empty result for an empty edit list', async () => {
      const result = await service.bulkMove([]);
      expect(result.moved).toEqual([]);
      expect(result.failed).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // unlink
  // ---------------------------------------------------------------------------

  describe('unlink', () => {
    it('should delete a file', async () => {
      await service.writeFile('/del.txt', 'gone');
      await service.unlink('/del.txt');
      expect(await service.exists('/del.txt')).toBe(false);
    });

    it('should throw when deleting a non-existent file', async () => {
      await expect(service.unlink('/nonexistent.txt')).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // rmdir
  // ---------------------------------------------------------------------------

  describe('rmdir', () => {
    it('should remove an empty directory', async () => {
      await service.mkdir('/todel');
      await service.rmdir('/todel');
      expect(await service.exists('/todel')).toBe(false);
    });

    it('should throw when removing a non-existent directory', async () => {
      await expect(service.rmdir('/nope')).rejects.toThrow();
    });

    it('broadly invalidates local and peer projections after a partial recursive removal failure', async () => {
      const coordinator = new CrossTabCoordinator();
      const notifyDirectoryChange = vi.spyOn(coordinator, 'notifyDirectoryChange');
      const context = await createWorkspaceFileService({ crossTabCoordinator: coordinator });
      await context.service.writeFile('/partial/a.txt', 'a');
      await context.service.writeFile('/partial/b.txt', 'b');
      const events: ChangeEvent[] = [];
      context.eventBus.subscribe((event) => events.push(event));
      const originalUnlink = context.provider.unlink.bind(context.provider);
      let unlinkCount = 0;
      vi.spyOn(context.provider, 'unlink').mockImplementation(async (path) => {
        unlinkCount++;
        if (unlinkCount === 2) {
          throw new Error('injected recursive removal failure');
        }
        await originalUnlink(path);
      });

      try {
        await expect(context.service.rmdir('/partial', { recursive: true })).rejects.toThrow(
          'injected recursive removal failure',
        );
        expect(await context.provider.exists('partial/a.txt')).not.toBe(await context.provider.exists('partial/b.txt'));
        expect(events).toContainEqual({ type: 'backendChanged', backend: 'memory' });
        expect(notifyDirectoryChange).toHaveBeenCalledWith('/', {
          storageRootKey: 'memory:0',
          providerBasePath: '',
        });
      } finally {
        context.service.dispose();
        coordinator.dispose();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // writeFiles
  // ---------------------------------------------------------------------------

  describe('writeFiles', () => {
    it('should write multiple files through one batch call', async () => {
      const pathA = '/batch/a.txt';
      const pathB = '/batch/b.txt';
      await service.writeFiles({
        [pathA]: { content: 'alpha' },
        [pathB]: { content: 'bravo' },
      });
      expect(await service.readFile(pathA, 'utf8')).toBe('alpha');
      expect(await service.readFile(pathB, 'utf8')).toBe('bravo');
    });

    it('should create parent directories for each file', async () => {
      const pathA = '/deep/a/file.txt';
      const pathB = '/deep/b/file.txt';
      await service.writeFiles({
        [pathA]: { content: 'deep-a' },
        [pathB]: { content: 'deep-b' },
      });
      expect(await service.readFile(pathA, 'utf8')).toBe('deep-a');
      expect(await service.readFile(pathB, 'utf8')).toBe('deep-b');
    });

    it('should notify an exact-path watcher when restoring a file', async () => {
      vi.useFakeTimers();
      const path = '/main.scad';
      const received: WatchEvent[] = [];
      const unsubscribe = service.watch({ paths: [path] }, (event) => {
        received.push(event);
      });

      try {
        await service.writeFiles({ [path]: { content: 'plain-cube' } });
        await vi.advanceTimersByTimeAsync(75);

        expect(received).toEqual([{ type: 'change', path }]);
      } finally {
        unsubscribe();
        vi.useRealTimers();
      }
    });

    it('should use the cross-tab mutation lock for every batch path', async () => {
      const coordinator = new CrossTabCoordinator();
      const withMutationLocks = vi.spyOn(coordinator, 'withMutationLocks');
      const { service: svc } = await createWorkspaceFileService({ crossTabCoordinator: coordinator });
      const pathA = '/batch/a.txt';
      const pathB = '/batch/b.txt';

      try {
        await svc.writeFiles({
          [pathA]: { content: 'a' },
          [pathB]: { content: 'b' },
        });

        expect(withMutationLocks).toHaveBeenCalledTimes(2);
        expect(withMutationLocks).toHaveBeenCalledWith(
          [pathA, '/batch', 'memory:0:batch/a.txt', 'memory:0:batch', 'memory:0:'],
          { type: 'write', path: pathA, authority: { storageRootKey: 'memory:0', providerBasePath: '' } },
          expect.any(Function),
        );
        expect(withMutationLocks).toHaveBeenCalledWith(
          [pathB, '/batch', 'memory:0:batch/b.txt', 'memory:0:batch', 'memory:0:'],
          { type: 'write', path: pathB, authority: { storageRootKey: 'memory:0', providerBasePath: '' } },
          expect.any(Function),
        );
      } finally {
        svc.dispose();
        coordinator.dispose();
      }
    });

    it('waits for every admitted write and invalidates local and peer projections after a partial failure', async () => {
      const coordinator = new CrossTabCoordinator();
      const notifyDirectoryChange = vi.spyOn(coordinator, 'notifyDirectoryChange');
      const context = await createWorkspaceFileService({ crossTabCoordinator: coordinator });
      const originalWriteFile = context.provider.writeFile.bind(context.provider);
      const failedPath = '/batch/failed.txt';
      const delayedPath = '/batch/delayed.txt';
      const failedProviderPath = 'batch/failed.txt';
      const delayedProviderPath = 'batch/delayed.txt';
      let releaseDelayedWrite: (() => void) | undefined;
      const delayedWrite = new Promise<void>((resolve) => {
        releaseDelayedWrite = resolve;
      });
      let delayedWriteStarted = false;
      vi.spyOn(context.provider, 'writeFile').mockImplementation(async (path, data) => {
        if (path === failedProviderPath) {
          throw new Error('injected write failure');
        }
        if (path === delayedProviderPath) {
          delayedWriteStarted = true;
          await delayedWrite;
        }
        return originalWriteFile(path, data);
      });
      const events: ChangeEvent[] = [];
      const unsubscribe = context.eventBus.subscribe((event) => events.push(event));

      try {
        const result = context.service.writeFiles({
          [failedPath]: { content: 'failed' },
          [delayedPath]: { content: 'completed' },
        });
        let settled = false;
        const observeSettlement = async (): Promise<void> => {
          try {
            await result;
          } catch {
            settled = true;
            return;
          }
          settled = true;
        };
        const settlementObservation = observeSettlement();

        await waitFor(() => delayedWriteStarted);
        await Promise.resolve();
        expect(settled).toBe(false);

        releaseDelayedWrite?.();
        await expect(result).rejects.toThrow('injected write failure');
        await settlementObservation;

        expect(await context.provider.readFile(delayedProviderPath)).toEqual(encoder.encode('completed'));
        expect(events).toContainEqual({ type: 'backendChanged', backend: 'memory' });
        expect(notifyDirectoryChange).toHaveBeenCalledWith('/batch', {
          storageRootKey: 'memory:0',
          providerBasePath: '',
        });
      } finally {
        unsubscribe();
        context.service.dispose();
        coordinator.dispose();
      }
    });

    it('should perform no provider, lock, or event work for an empty batch', async () => {
      const coordinator = new CrossTabCoordinator();
      const withMutationLocks = vi.spyOn(coordinator, 'withMutationLocks');
      const context = await createWorkspaceFileService({ crossTabCoordinator: coordinator });
      const providerWrite = vi.spyOn(context.provider, 'writeFile');
      const events: ChangeEvent[] = [];
      const unsubscribe = context.eventBus.subscribe((event) => {
        events.push(event);
      });

      try {
        await context.service.writeFiles({});

        expect(providerWrite).not.toHaveBeenCalled();
        expect(withMutationLocks).not.toHaveBeenCalled();
        expect(events).toEqual([]);
      } finally {
        unsubscribe();
        context.service.dispose();
        coordinator.dispose();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Event emission
  // ---------------------------------------------------------------------------

  describe('event emission', () => {
    it('should emit fileWritten on writeFile', async () => {
      const events: ChangeEvent[] = [];
      eventBus.subscribe((event) => events.push(event));

      await service.writeFile('/ev.txt', 'data');

      const writeEvents = events.filter((event) => event.type === 'fileWritten');
      expect(writeEvents).toHaveLength(1);
      expect(writeEvents[0]!.path).toBe('/ev.txt');
    });

    it('should leave event untagged on direct mutations (no context)', async () => {
      const origins: Array<string | undefined> = [];
      eventBus.subscribe((event) => origins.push(getEventOrigin(event)));
      await service.writeFile('/direct-origin.txt', 'x');
      expect(origins).toEqual([undefined]);
    });

    it('should tag fileWritten via WorkspaceMutationContext on writeFile', async () => {
      const received: Array<{ type: string; origin: string | undefined }> = [];
      eventBus.subscribe((event) => {
        received.push({ type: event.type, origin: getEventOrigin(event) });
      });
      await service.writeFile('/ctx.txt', 'y12345678901234567890123456789012', { originClientId: 'port_kernel' });
      expect(received.some((r) => r.type === 'fileWritten' && r.origin === 'port_kernel')).toBe(true);
    });

    it('should leave observer-raw emits untagged when emit() is used without tagEventOrigin', async () => {
      const origins: Array<string | undefined> = [];
      eventBus.subscribe((changeEvent) => origins.push(getEventOrigin(changeEvent)));
      eventBus.emit({ type: 'fileWritten', path: '/observer.txt', backend: 'memory' });
      expect(origins).toEqual([undefined]);
    });

    it('should tag events for every mutating method when context.originClientId is set', async () => {
      const context = { originClientId: 'all_methods' };
      const originsByType: Array<{ type: ChangeEvent['type']; origin?: string }> = [];
      eventBus.subscribe((event) => {
        originsByType.push({ type: event.type, origin: getEventOrigin(event) });
      });

      await service.writeFile('/mut-w.txt', 'a', context);
      await service.writeFiles({ '/mut-batch/x.txt': { content: 'b' } }, context);
      await service.mkdir('/mut-mkdir', { recursive: true }, context);
      await service.writeFile('/mut-r1.txt', 'c');
      await service.move('/mut-r1.txt', '/mut-r2.txt', context);
      await service.writeFile('/mut-u.txt', 'd');
      await service.unlink('/mut-u.txt', context);
      await service.mkdir('/mut-rmdir', { recursive: true });
      await service.rmdir('/mut-rmdir', undefined, context);
      /* `duplicate` and `copyTree` are the rooted surface's since W12d, and a
       * rooted connection carries its own origin rather than this context. */

      const tagged = originsByType.filter((row) => row.origin === 'all_methods');
      expect(tagged.length).toBeGreaterThanOrEqual(6);
      const types = new Set(tagged.map((row) => row.type));
      expect(types.has('fileWritten')).toBe(true);
      expect(types.has('fileRenamed')).toBe(true);
      expect(types.has('fileDeleted')).toBe(true);
    });

    it('should emit one exact fileWritten event per batch path with the caller origin', async () => {
      const events: ChangeEvent[] = [];
      const unsubscribe = eventBus.subscribe((event) => events.push(event));
      const pathA = '/batch/a.txt';
      const pathB = '/batch/b.txt';

      try {
        await service.writeFiles(
          {
            [pathA]: { content: 'a' },
            [pathB]: { content: 'b' },
          },
          { originClientId: 'batch_author' },
        );

        const writtenEvents = events
          .filter((event) => event.type === 'fileWritten')
          .map((event) => ({ event, origin: getEventOrigin(event) }))
          .sort((a, b) => a.event.path.localeCompare(b.event.path));
        expect(writtenEvents).toEqual([
          {
            event: { type: 'fileWritten', path: pathA, backend: 'memory' },
            origin: 'batch_author',
          },
          {
            event: { type: 'fileWritten', path: pathB, backend: 'memory' },
            origin: 'batch_author',
          },
        ]);
        expect(events).not.toContainEqual(expect.objectContaining({ type: 'directoryChanged', path: '/' }));
      } finally {
        unsubscribe();
      }
    });

    it('should emit directoryCreated on mkdir', async () => {
      const events: ChangeEvent[] = [];
      eventBus.subscribe((event) => events.push(event));

      await service.mkdir('/evdir');

      const directoryEvents = events.filter((event) => event.type === 'directoryCreated');
      expect(directoryEvents).toHaveLength(1);
      expect(directoryEvents[0]).toMatchObject({ type: 'directoryCreated', path: '/evdir' });
    });

    it('should emit fileRenamed on a file move', async () => {
      await service.writeFile('/ren.txt', 'data');
      const events: ChangeEvent[] = [];
      eventBus.subscribe((event) => events.push(event));

      await service.move('/ren.txt', '/renamed.txt');

      const renameEvents = events.filter((event) => event.type === 'fileRenamed');
      expect(renameEvents).toHaveLength(1);
      const renameEvent = renameEvents[0]!;
      expect(renameEvent.oldPath).toBe('/ren.txt');
      expect(renameEvent.newPath).toBe('/renamed.txt');
    });

    it('should emit fileDeleted on unlink', async () => {
      await service.writeFile('/gone.txt', 'bye');
      const events: ChangeEvent[] = [];
      eventBus.subscribe((event) => events.push(event));

      await service.unlink('/gone.txt');

      const deleteEvents = events.filter((event) => event.type === 'fileDeleted');
      expect(deleteEvents).toHaveLength(1);
      expect(deleteEvents[0]!.path).toBe('/gone.txt');
    });

    it('should emit directoryDeleted on rmdir', async () => {
      await service.mkdir('/rmd');
      const events: ChangeEvent[] = [];
      eventBus.subscribe((event) => events.push(event));

      await service.rmdir('/rmd');

      const directoryEvents = events.filter((event) => event.type === 'directoryDeleted');
      expect(directoryEvents).toHaveLength(1);
      expect(directoryEvents[0]).toMatchObject({ type: 'directoryDeleted', path: '/rmd' });
    });

    it('should emit fileWritten for the duplicated destination', async () => {
      await service.writeFile('/dup-src.txt', 'copy');
      const events: ChangeEvent[] = [];
      eventBus.subscribe((event) => events.push(event));

      await service.createRootedFileSystem('/').duplicate!('dup-src.txt', 'dup-dst.txt');

      expect(events).toContainEqual(
        expect.objectContaining({ type: 'fileWritten', path: '/dup-dst.txt', backend: 'memory' }),
      );
    });

    it('should include backend in emitted events', async () => {
      const events: ChangeEvent[] = [];
      eventBus.subscribe((event) => events.push(event));

      await service.writeFile('/backend.txt', 'x');

      const writeEvent = events.find((event) => event.type === 'fileWritten')!;
      expect('backend' in writeEvent && writeEvent.backend).toBe('memory');
    });
  });

  // ---------------------------------------------------------------------------
  // Concurrent writes are serialized
  // ---------------------------------------------------------------------------

  describe('write serialization', () => {
    it('should serialize concurrent writes to the same file', async () => {
      const order: string[] = [];
      eventBus.subscribe((event) => {
        if (event.type === 'fileWritten' && 'path' in event) {
          order.push(event.path);
        }
      });

      const w1 = service.writeFile('/same.txt', 'a');
      const w2 = service.writeFile('/same.txt', 'b');
      const w3 = service.writeFile('/same.txt', 'c');

      await Promise.all([w1, w2, w3]);

      expect(order).toEqual(['/same.txt', '/same.txt', '/same.txt']);
      const finalContent = await service.readFile('/same.txt', 'utf8');
      expect(finalContent).toBe('c');
    });

    it('should allow parallel writes to different files', async () => {
      const w1 = service.writeFile('/p1.txt', 'a');
      const w2 = service.writeFile('/p2.txt', 'b');
      const w3 = service.writeFile('/p3.txt', 'c');

      await Promise.all([w1, w2, w3]);

      expect(await service.readFile('/p1.txt', 'utf8')).toBe('a');
      expect(await service.readFile('/p2.txt', 'utf8')).toBe('b');
      expect(await service.readFile('/p3.txt', 'utf8')).toBe('c');
    });
  });

  describe('provider write error propagation', () => {
    it('should propagate provider errors during nested writes', async () => {
      rootProvider.writeFile = async () => {
        const error = new Error('disk full') as NodeJS.ErrnoException;
        error.code = 'EIO';
        throw error;
      };

      await expect(service.writeFile('/a/b/c.txt', 'data')).rejects.toThrow('disk full');
    });
  });
});

describe('flat workspace layout locks', () => {
  const projectId = 'proj_lllllllllllllllllllll';

  const configureFlatProject = async (
    context: Awaited<ReturnType<typeof createWorkspaceFileService>>,
  ): Promise<void> => {
    await context.service.configureProjectRoots({
      projects: [{ projectId, backend: 'memory', storageRootKey: 'memory:0', providerBasePath: 'cube-design' }],
      roots: [],
    });
  };

  it('locks the owning project for a root-mount write into its physical directory', async () => {
    const context = await createWorkspaceFileService();
    await configureFlatProject(context);
    const queueForMany = vi.spyOn(context.resourceQueue, 'queueForMany');

    try {
      await context.service.writeFile('/cube-design/main.ts', 'physical route');

      expect(queueForMany.mock.calls.at(-1)?.[0]).toContain(`project:${projectId}`);
    } finally {
      context.service.dispose();
    }
  });

  it('leaves an unmounted root child free of project locks', async () => {
    const context = await createWorkspaceFileService();
    await configureFlatProject(context);
    const queueForMany = vi.spyOn(context.resourceQueue, 'queueForMany');

    try {
      await context.service.writeFile('/loose-directory/main.ts', 'no project');

      expect(queueForMany.mock.calls.at(-1)?.[0].filter((lock) => lock.startsWith('project:'))).toEqual([]);
    } finally {
      context.service.dispose();
    }
  });
});

/*
 * `MutationPipeline.mutationLockPaths` is the one place a lock set is decided,
 * and until now it was only ever observed sideways — through a `writeFiles`
 * expectation or the flat-layout rows above. These are its direct pins (W5,
 * T5 seed). The seam is the `ResourceQueue.queueForMany` spy the flat-layout
 * rows already use: the array it receives IS the array `mutationLockPaths`
 * returned, so no production visibility had to widen.
 */
describe('mutationLockPaths', () => {
  const alpha = 'proj_aaaaaaaaaaaaaaaaaaaaa';
  const beta = 'proj_bbbbbbbbbbbbbbbbbbbbb';

  /** The lock set the pipeline claimed for one write. */
  const locksForWrite = async (path: string, projects: ProjectRootConfig[] = []): Promise<readonly string[]> => {
    const context = await createWorkspaceFileService();
    try {
      await context.service.configureProjectRoots({ projects, roots: [] });
      const queueForMany = vi.spyOn(context.resourceQueue, 'queueForMany');
      await context.service.writeFile(path, 'lock probe');
      return queueForMany.mock.calls.at(-1)?.[0] ?? [];
    } finally {
      context.service.dispose();
    }
  };

  const flatProject = (projectId: string, providerBasePath: string): ProjectRootConfig => ({
    projectId,
    backend: 'memory',
    storageRootKey: 'memory:0',
    providerBasePath,
  });

  it('should claim every virtual ancestor of a nested path, exclusive of the root', async () => {
    const locks = await locksForWrite('/a/b/c.txt');

    expect(locks.filter((lock) => lock.startsWith('/'))).toEqual(['/a/b/c.txt', '/a/b', '/a']);
  });

  it('should claim the storage-root-keyed physical hierarchy down to the authority root', async () => {
    const locks = await locksForWrite('/a/b/c.txt');

    expect(locks.filter((lock) => lock.startsWith('memory:0:'))).toEqual([
      'memory:0:a/b/c.txt',
      'memory:0:a/b',
      'memory:0:a',
      'memory:0:',
    ]);
  });

  it('should claim the owning project lock for a write on its route', async () => {
    const locks = await locksForWrite(`/projects/${alpha}/main.ts`, [flatProject(alpha, 'cube-design')]);

    expect(locks.filter((lock) => lock.startsWith('project:'))).toEqual([`project:${alpha}`]);
  });

  it('should share no lock between paths in different projects', async () => {
    const projects = [flatProject(alpha, 'cube-design'), flatProject(beta, 'gear-system')];

    const alphaLocks = await locksForWrite(`/projects/${alpha}/main.ts`, projects);
    const betaLocks = await locksForWrite(`/projects/${beta}/main.ts`, projects);

    expect(alphaLocks.filter((lock) => betaLocks.includes(lock))).toEqual([]);
    expect(alphaLocks).not.toEqual([]);
  });
});
