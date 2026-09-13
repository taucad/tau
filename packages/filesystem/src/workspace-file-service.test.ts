// oxlint-disable-next-line import/no-unassigned-import -- Side-effect import to polyfill IndexedDB for tests
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { WorkspaceFileService } from '#workspace-file-service.js';
import { ProviderRegistry } from '#provider-registry.js';
import { ResourceQueue } from '#resource-queue.js';
import { ChangeEventBus } from '#change-event-bus.js';
import { MountTable } from '#mount-table.js';
import { SharedPool } from '@taucad/memory';
import type { ChangeEvent, FileSystemProvider, WatchEvent } from '#types.js';
import { getEventOrigin } from '#event-origin-registry.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Poll a predicate until it becomes true. Used to await asynchronous
 * timer-driven side effects (e.g. EventCoalescer flushes) without coupling
 * the test to a specific wall-clock duration. Pure scheduler-bounded waits
 * are inherently flaky on loaded CI runners; this loop is bounded by
 * `timeout` (milliseconds) instead, so a slow scheduler delays the test rather
 * than failing it.
 */
async function waitFor(predicate: () => boolean, waitTimeout = 2000, pollInterval = 5): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > waitTimeout) {
      throw new Error(`waitFor timed out after ${waitTimeout}ms`);
    }
    // oxlint-disable-next-line no-await-in-loop -- Sequential execution is intentional for polling
    await new Promise((resolve) => {
      setTimeout(resolve, pollInterval);
    });
  }
}

async function createWorkspaceFileService() {
  const providerRegistry = new ProviderRegistry();
  const provider = await providerRegistry.createMountProvider({ backend: 'memory' });

  const mountTable = new MountTable();
  mountTable.mount('/', provider, { backend: 'memory' });

  const resourceQueue = new ResourceQueue();
  const eventBus = new ChangeEventBus();

  const service = new WorkspaceFileService({
    providerRegistry,
    resourceQueue,
    eventBus,
    mountTable,
  });

  return { service, eventBus, providerRegistry, resourceQueue, mountTable, provider };
}

describe('WorkspaceFileService', () => {
  let service: WorkspaceFileService;
  let eventBus: ChangeEventBus;
  let providerRegistry: ProviderRegistry;
  let rootProvider: FileSystemProvider;

  beforeEach(async () => {
    const context = await createWorkspaceFileService();
    service = context.service;
    eventBus = context.eventBus;
    providerRegistry = context.providerRegistry;
    rootProvider = context.provider;
  });

  describe('Layer 2 composition', () => {
    it('exposes a FileSystemService via fileSystem', () => {
      expect(service.fileSystem).toBeDefined();
      expect(typeof service.fileSystem.readFile).toBe('function');
      expect(typeof service.fileSystem.asProvider).toBe('function');
      expect(typeof service.fileSystem.asRuntimeFileSystem).toBe('function');
    });

    it('Layer 2 service shares the workspace mount table for path routing', async () => {
      await service.writeFile('/layer2.txt', 'hello');
      const bytes = await service.fileSystem.readFile('/layer2.txt');
      expect(decoder.decode(bytes)).toBe('hello');
    });

    it('Layer 2 writes are visible to the workspace eventBus', async () => {
      const events: ChangeEvent[] = [];
      const off = eventBus.subscribe((event) => events.push(event));

      service.fileSystem.publishChangeEvent({ type: 'fileWritten', path: '/probe.txt', backend: 'memory' });

      expect(events.some((event) => event.type === 'fileWritten' && event.path === '/probe.txt')).toBe(true);
      off();
    });
  });

  // ---------------------------------------------------------------------------
  // writeFile / readFile round-trip
  // ---------------------------------------------------------------------------

  describe('writeFile + readFile', () => {
    it('should round-trip a string via utf8 encoding', async () => {
      await service.writeFile('/hello.txt', 'world');
      const result = await service.readFile('/hello.txt', 'utf8');
      expect(result).toBe('world');
    });

    it('should round-trip a string via encoding object', async () => {
      await service.writeFile('/hello.txt', 'world');
      const result = await service.readFile('/hello.txt', { encoding: 'utf8' });
      expect(result).toBe('world');
    });

    it('should round-trip Uint8Array data', async () => {
      const data = encoder.encode('binary content');
      await service.writeFile('/bin.dat', data);
      const result = await service.readFile('/bin.dat');
      expect(result).toBeInstanceOf(Uint8Array);
      expect(decoder.decode(result as Uint8Array<ArrayBuffer>)).toBe('binary content');
    });

    it('should return raw Uint8Array when no encoding is specified', async () => {
      await service.writeFile('/raw.txt', 'hello');
      const result = await service.readFile('/raw.txt');
      expect(result).toBeInstanceOf(Uint8Array);
    });

    it('should overwrite an existing file', async () => {
      await service.writeFile('/file.txt', 'first');
      await service.writeFile('/file.txt', 'second');
      const result = await service.readFile('/file.txt', 'utf8');
      expect(result).toBe('second');
    });

    it('should auto-create parent directories for nested paths', async () => {
      await service.writeFile('/a/b/c/file.txt', 'nested');
      const result = await service.readFile('/a/b/c/file.txt', 'utf8');
      expect(result).toBe('nested');
    });

    it('should write an empty file', async () => {
      await service.writeFile('/empty.txt', '');
      const result = await service.readFile('/empty.txt', 'utf8');
      expect(result).toBe('');
    });
  });

  // ---------------------------------------------------------------------------
  // readFile errors
  // ---------------------------------------------------------------------------

  describe('readFile errors', () => {
    it('should throw for a non-existent file', async () => {
      await expect(service.readFile('/nope.txt')).rejects.toThrow();
    });

    it('should throw for a non-existent nested file', async () => {
      await expect(service.readFile('/a/b/c.txt')).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // AbortSignal cancellation
  // ---------------------------------------------------------------------------

  describe('AbortSignal cancellation', () => {
    it('should throw AbortError for readFile with pre-aborted signal', async () => {
      await service.writeFile('/cancel.txt', 'data');
      const controller = new AbortController();
      controller.abort();
      await expect(service.readFile('/cancel.txt', { signal: controller.signal })).rejects.toThrow('aborted');
    });

    it('should throw AbortError for readDirectory with pre-aborted signal', async () => {
      await service.mkdir('/canceldir', { recursive: true });
      await service.writeFile('/canceldir/a.txt', 'x');
      const controller = new AbortController();
      controller.abort();
      await expect(service.readDirectory('/canceldir', { signal: controller.signal })).rejects.toThrow('aborted');
    });

    it('should throw AbortError for readFiles with pre-aborted signal', async () => {
      await service.writeFile('/f1.txt', 'a');
      const controller = new AbortController();
      controller.abort();
      await expect(service.readFiles(['/f1.txt'], { signal: controller.signal })).rejects.toThrow('aborted');
    });
  });

  // ---------------------------------------------------------------------------
  // readFileStream
  // ---------------------------------------------------------------------------

  describe('readFileStream', () => {
    it('should return a ReadableStream producing correct content', async () => {
      await service.writeFile('/stream.txt', 'hello streaming world');
      const stream = await service.readFileStream('/stream.txt');
      const reader = stream.getReader();
      const chunks: Array<Uint8Array<ArrayBuffer>> = [];

      // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- reader loop
      while (true) {
        // oxlint-disable-next-line no-await-in-loop -- inherent stream reading pattern
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        chunks.push(value);
      }

      const combined = new Uint8Array(chunks.reduce((sum, c) => sum + c.byteLength, 0));
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.byteLength;
      }

      expect(decoder.decode(combined)).toBe('hello streaming world');
    });

    it('should throw AbortError for readFileStream with pre-aborted signal', async () => {
      await service.writeFile('/abort-stream.txt', 'data');
      const controller = new AbortController();
      controller.abort();
      await expect(service.readFileStream('/abort-stream.txt', { signal: controller.signal })).rejects.toThrow(
        'aborted',
      );
    });

    it('should wrap readFile output into single-chunk stream when provider lacks readFileStream', async () => {
      await service.writeFile('/fallback.txt', 'fallback content');
      const stream = await service.readFileStream('/fallback.txt');
      const reader = stream.getReader();
      const { done, value } = await reader.read();

      expect(done).toBe(false);
      expect(decoder.decode(value)).toBe('fallback content');

      const end = await reader.read();
      expect(end.done).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // readFiles
  // ---------------------------------------------------------------------------

  describe('readFiles', () => {
    it('should read multiple files in parallel', async () => {
      await service.writeFile('/a.txt', 'alpha');
      await service.writeFile('/b.txt', 'bravo');
      const results = await service.readFiles(['/a.txt', '/b.txt']);
      expect(decoder.decode(results['/a.txt'])).toBe('alpha');
      expect(decoder.decode(results['/b.txt'])).toBe('bravo');
    });

    it('should return an empty record for an empty input', async () => {
      const results = await service.readFiles([]);
      expect(results).toEqual({});
    });
  });

  // ---------------------------------------------------------------------------
  // readdir
  // ---------------------------------------------------------------------------

  describe('readdir', () => {
    it('should list entries in a directory', async () => {
      await service.writeFile('/dir/a.txt', 'a');
      await service.writeFile('/dir/b.txt', 'b');
      const entries = await service.readdir('/dir');
      expect(entries.sort()).toEqual(['a.txt', 'b.txt']);
    });

    it('should return an empty array for an empty directory', async () => {
      await service.mkdir('/empty');
      const entries = await service.readdir('/empty');
      expect(entries).toEqual([]);
    });

    it('should include subdirectories in the listing', async () => {
      await service.mkdir('/parent/child', { recursive: true });
      await service.writeFile('/parent/file.txt', 'x');
      const entries = await service.readdir('/parent');
      expect(entries.sort()).toEqual(['child', 'file.txt']);
    });
  });

  // ---------------------------------------------------------------------------
  // stat / lstat
  // ---------------------------------------------------------------------------

  describe('stat', () => {
    it('should return file stat with type "file"', async () => {
      await service.writeFile('/f.txt', 'content');
      const stat = await service.stat('/f.txt');
      expect(stat.type).toBe('file');
      expect(stat.size).toBeGreaterThan(0);
      expect(stat.mtimeMs).toBeGreaterThan(0);
    });

    it('should return directory stat with type "dir"', async () => {
      await service.mkdir('/mydir');
      const stat = await service.stat('/mydir');
      expect(stat.type).toBe('dir');
    });

    it('should throw for a non-existent path', async () => {
      await expect(service.stat('/missing')).rejects.toThrow();
    });
  });

  describe('lstat', () => {
    it('should return stat for a file', async () => {
      await service.writeFile('/f.txt', 'data');
      const stat = await service.lstat('/f.txt');
      expect(stat.type).toBe('file');
    });

    it('should return stat for a directory', async () => {
      await service.mkdir('/d');
      const stat = await service.lstat('/d');
      expect(stat.type).toBe('dir');
    });
  });

  // ---------------------------------------------------------------------------
  // exists / batchExists
  // ---------------------------------------------------------------------------

  describe('exists', () => {
    it('should return true for an existing file', async () => {
      await service.writeFile('/e.txt', 'exists');
      expect(await service.exists('/e.txt')).toBe(true);
    });

    it('should return false for a missing file', async () => {
      expect(await service.exists('/missing.txt')).toBe(false);
    });

    it('should return true for an existing directory', async () => {
      await service.mkdir('/dir');
      expect(await service.exists('/dir')).toBe(true);
    });
  });

  describe('batchExists', () => {
    it('should return existence map for multiple paths', async () => {
      await service.writeFile('/yes.txt', 'y');
      const result = await service.batchExists(['/yes.txt', '/no.txt']);
      expect(result['/yes.txt']).toBe(true);
      expect(result['/no.txt']).toBe(false);
    });

    it('should return an empty record for empty input', async () => {
      const result = await service.batchExists([]);
      expect(result).toEqual({});
    });
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

    it('should throw when creating nested directory without recursive', async () => {
      await expect(service.mkdir('/x/y/z')).rejects.toThrow();
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
  // rename
  // ---------------------------------------------------------------------------

  describe('rename', () => {
    it('should rename a file', async () => {
      await service.writeFile('/old.txt', 'data');
      await service.rename('/old.txt', '/new.txt');
      expect(await service.exists('/old.txt')).toBe(false);
      const content = await service.readFile('/new.txt', 'utf8');
      expect(content).toBe('data');
    });

    it('should rename a directory', async () => {
      await service.mkdir('/olddir');
      await service.writeFile('/olddir/file.txt', 'inside');
      await service.rename('/olddir', '/newdir');
      expect(await service.exists('/olddir')).toBe(false);
      expect(await service.exists('/newdir')).toBe(true);
      const content = await service.readFile('/newdir/file.txt', 'utf8');
      expect(content).toBe('inside');
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

    it('should refuse to overwrite an existing target without overwrite: true', async () => {
      await service.writeFile('/keep.txt', 'untouched');
      await service.writeFile('/source.txt', 'replace');
      await expect(service.move('/source.txt', '/keep.txt')).rejects.toThrow('EEXIST');
      const content = await service.readFile('/keep.txt', 'utf8');
      expect(content).toBe('untouched');
    });

    it('should overwrite an existing file target when overwrite: true', async () => {
      await service.writeFile('/keep.txt', 'untouched');
      await service.writeFile('/source.txt', 'replace');
      await service.move('/source.txt', '/keep.txt', { overwrite: true });
      const content = await service.readFile('/keep.txt', 'utf8');
      expect(content).toBe('replace');
      expect(await service.exists('/source.txt')).toBe(false);
    });

    it('should overwrite an existing directory target when overwrite: true', async () => {
      await service.writeFile('/old/a.txt', 'old-a');
      await service.writeFile('/old/b.txt', 'old-b');
      await service.writeFile('/new/c.txt', 'new-c');
      await service.move('/new', '/old', { overwrite: true });
      expect(await service.exists('/old/a.txt')).toBe(false);
      expect(await service.exists('/old/c.txt')).toBe(true);
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

    it('returns true when target exists but overwrite is requested', async () => {
      await service.writeFile('/source.txt', 'src');
      await service.writeFile('/keep.txt', 'keep');
      const result = await service.canMove('/source.txt', '/keep.txt', { overwrite: true });
      expect(result).toBe(true);
    });

    it('returns INVALID_NAME for non-normalised paths', async () => {
      await service.writeFile('/source.txt', 'src');
      const result = await service.canMove('/source.txt', '/foo/../bar.txt');
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
  // R7: bulkMove transaction with rollback
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

    it('rolls back every prior move when a middle edit fails', async () => {
      await service.writeFile('/a.txt', 'a');
      await service.writeFile('/b.txt', 'b');
      await service.writeFile('/c.txt', 'c');
      await service.writeFile('/dst/b.txt', 'collision');

      const result = await service.bulkMove([
        { source: '/a.txt', target: '/dst/a.txt' },
        { source: '/b.txt', target: '/dst/b.txt' },
        { source: '/c.txt', target: '/dst/c.txt' },
      ]);

      expect(result.moved.length).toBe(0);
      expect(result.failed.length).toBe(1);
      expect(result.failed[0]?.edit.source).toBe('/b.txt');
      expect(result.failed[0]?.error.code).toBe('NAME_EXISTS');

      expect(await service.exists('/a.txt')).toBe(true);
      expect(await service.exists('/b.txt')).toBe(true);
      expect(await service.exists('/c.txt')).toBe(true);
      expect(await service.exists('/dst/a.txt')).toBe(false);
      expect(await service.exists('/dst/c.txt')).toBe(false);
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
  });

  // ---------------------------------------------------------------------------
  // ensureDirectoryExists
  // ---------------------------------------------------------------------------

  describe('ensureDirectoryExists', () => {
    it('should create the full directory chain', async () => {
      await service.ensureDirectoryExists('/x/y/z');
      expect(await service.exists('/x')).toBe(true);
      expect(await service.exists('/x/y')).toBe(true);
      expect(await service.exists('/x/y/z')).toBe(true);
    });

    it('should be a no-op when directories already exist', async () => {
      await service.mkdir('/existing', { recursive: true });
      await service.ensureDirectoryExists('/existing');
      expect(await service.exists('/existing')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // duplicateFile
  // ---------------------------------------------------------------------------

  describe('duplicateFile', () => {
    it('should copy a file to a new location', async () => {
      await service.writeFile('/src.txt', 'copy me');
      await service.duplicateFile('/src.txt', '/dst.txt');
      const content = await service.readFile('/dst.txt', 'utf8');
      expect(content).toBe('copy me');
      expect(await service.exists('/src.txt')).toBe(true);
    });

    it('should create parent directories for the destination', async () => {
      await service.writeFile('/orig.txt', 'data');
      await service.duplicateFile('/orig.txt', '/deep/nested/copy.txt');
      const content = await service.readFile('/deep/nested/copy.txt', 'utf8');
      expect(content).toBe('data');
    });
  });

  // ---------------------------------------------------------------------------
  // copyDirectory
  // ---------------------------------------------------------------------------

  describe('copyDirectory', () => {
    it('should recursively copy a directory', async () => {
      await service.writeFile('/source/a.txt', 'aaa');
      await service.writeFile('/source/sub/b.txt', 'bbb');
      await service.copyDirectory('/source', '/dest');
      expect(await service.readFile('/dest/a.txt', 'utf8')).toBe('aaa');
      expect(await service.readFile('/dest/sub/b.txt', 'utf8')).toBe('bbb');
    });
  });

  // ---------------------------------------------------------------------------
  // getDirectoryContents
  // ---------------------------------------------------------------------------

  describe('getDirectoryContents', () => {
    it('should return all files with relative paths', async () => {
      await service.writeFile('/proj/readme.md', '# Hi');
      await service.writeFile('/proj/src/main.ts', 'code');
      const contents = await service.getDirectoryContents('/proj');
      expect(decoder.decode(contents['readme.md'])).toBe('# Hi');
      expect(decoder.decode(contents['src/main.ts'])).toBe('code');
    });

    it('should return an empty record for a non-existent directory', async () => {
      const contents = await service.getDirectoryContents('/nonexistent');
      expect(contents).toEqual({});
    });
  });

  // ---------------------------------------------------------------------------
  // writeFiles
  // ---------------------------------------------------------------------------

  describe('writeFiles', () => {
    it('should write multiple files atomically', async () => {
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
  });

  // ---------------------------------------------------------------------------
  // readDirectory
  // ---------------------------------------------------------------------------

  describe('readDirectory', () => {
    it('should return sorted tree nodes (folders first)', async () => {
      await service.mkdir('/tree/sub', { recursive: true });
      await service.writeFile('/tree/file.txt', 'x');
      const nodes = await service.readDirectory('/tree');
      expect(nodes).toHaveLength(2);
      expect(nodes[0]!.name).toBe('sub');
      expect(nodes[0]!.children).toEqual([]);
      expect(nodes[1]!.name).toBe('file.txt');
      expect(nodes[1]!.children).toBeUndefined();
    });

    it('should propagate ENOENT from the provider when the directory does not exist', async () => {
      try {
        await service.readDirectory('/nowhere');
        expect.fail('should have thrown');
      } catch (error) {
        expect((error as NodeJS.ErrnoException).code).toBe('ENOENT');
        expect((error as Error).message.toLowerCase()).toContain('enoent');
      }
    });

    it('should still skip individual children whose stat fails when using readdir without readdirWithStats', async () => {
      await service.mkdir('/stat-skip', { recursive: true });
      await service.writeFile('/stat-skip/good.txt', 'a');

      const savedReaddirWithStats = rootProvider.readdirWithStats;
      const originalReaddir = rootProvider.readdir.bind(rootProvider);
      const originalStat = rootProvider.stat.bind(rootProvider);

      Object.defineProperty(rootProvider, 'readdirWithStats', {
        value: undefined,
        configurable: true,
        enumerable: true,
      });
      try {
        vi.spyOn(rootProvider, 'readdir').mockImplementation(async (directoryPath: string) => {
          if (directoryPath === '/stat-skip') {
            return ['good.txt', 'ghost.txt'];
          }

          return originalReaddir(directoryPath);
        });
        vi.spyOn(rootProvider, 'stat').mockImplementation(async (filePath: string) => {
          if (filePath === '/stat-skip/ghost.txt') {
            throw new Error('stat failed for deleted child');
          }

          return originalStat(filePath);
        });

        const nodes = await service.readDirectory('/stat-skip');
        const names = nodes.map((n) => n.name).sort();
        expect(names).toEqual(['good.txt']);
      } finally {
        Object.defineProperty(rootProvider, 'readdirWithStats', {
          value: savedReaddirWithStats,
          configurable: true,
          enumerable: true,
        });
      }
    });

    it('should return equivalent listings on subsequent calls', async () => {
      await service.writeFile('/cached/a.txt', 'a');
      const first = await service.readDirectory('/cached');
      const second = await service.readDirectory('/cached');
      expect(first).toEqual(second);
    });

    it('should use readdirWithStats when available', async () => {
      await service.writeFile('/rws/file.txt', 'content');
      await service.mkdir('/rws/dir');

      expect(rootProvider.readdirWithStats).toBeDefined();

      const nodes = await service.readDirectory('/rws');
      expect(nodes).toHaveLength(2);
      const directory = nodes.find((n) => n.name === 'dir');
      const file = nodes.find((n) => n.name === 'file.txt');
      expect(directory!.children).toEqual([]);
      expect(file!.children).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // recursive mkdir + readDirectory
  // ---------------------------------------------------------------------------

  describe('recursive mkdir + readDirectory', () => {
    it('should show new subdirectories in readDirectory after recursive mkdir', async () => {
      await service.writeFile('/project/.tau/parameters/main.ts.json', '{}');
      const before = await service.readDirectory('/project/.tau');
      expect(before.map((n) => n.name)).toEqual(['parameters']);

      await service.mkdir('/project/.tau/cache/params', { recursive: true });
      await service.writeFile('/project/.tau/cache/params/hash.json', '{"key":"value"}');

      const after = await service.readDirectory('/project/.tau');
      const names = after.map((n) => n.name);
      expect(names).toContain('parameters');
      expect(names).toContain('cache');
    });
  });

  // ---------------------------------------------------------------------------
  // getDirectoryStat
  // ---------------------------------------------------------------------------

  describe('getDirectoryStat', () => {
    it('should return stat entries for all files recursively', async () => {
      await service.writeFile('/stats/a.txt', 'aaa');
      await service.writeFile('/stats/sub/b.txt', 'bb');
      const stats = await service.getDirectoryStat('/stats');
      expect(stats).toHaveLength(2);

      const paths = stats.map((s) => s.path).sort();
      expect(paths).toEqual(['a.txt', 'sub/b.txt']);

      const aEntry = stats.find((s) => s.name === 'a.txt')!;
      expect(aEntry.type).toBe('file');
      expect(aEntry.size).toBeGreaterThan(0);
      expect(aEntry.mtimeMs).toBeGreaterThan(0);
    });

    it('should return empty array for an empty directory', async () => {
      await service.mkdir('/emptystats');
      const stats = await service.getDirectoryStat('/emptystats');
      expect(stats).toEqual([]);
    });

    it('should return subdirectory stats from in-memory tree after initial scan', async () => {
      await service.writeFile('/stats/a.txt', 'aaa');
      await service.writeFile('/stats/sub/b.txt', 'bb');
      await service.getDirectoryStat('/stats');

      const subStats = await service.getDirectoryStat('/stats/sub');
      expect(subStats).toHaveLength(1);
      expect(subStats[0]!.path).toBe('b.txt');
      expect(subStats[0]!.name).toBe('b.txt');
    });

    it('should list a new file under a subpath after write following initial scan', async () => {
      await service.writeFile('/stats/a.txt', 'aaa');
      await service.getDirectoryStat('/stats');
      await service.writeFile('/stats/sub/c.txt', 'ccc');

      const subStats = await service.getDirectoryStat('/stats/sub');
      expect(subStats.some((s) => s.path === 'c.txt' && s.name === 'c.txt')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // readShallowDirectory
  // ---------------------------------------------------------------------------

  describe('readShallowDirectory', () => {
    it('should return empty array for memory scope', async () => {
      const nodes = await service.readShallowDirectory('/', { scope: { backend: 'memory' } });
      expect(nodes).toEqual([]);
    });

    it('should return files and folders sorted (folders first, alpha) when backend has entries', async () => {
      const mockProvider = mock<FileSystemProvider>({
        readdir: vi.fn().mockResolvedValue(['zebra.txt', 'alpha', 'beta.txt', 'alpha-dir']),
        stat: vi.fn().mockImplementation(async (path: string) => {
          const directories = new Set(['/alpha', '/alpha-dir']);
          return { type: directories.has(path) ? 'dir' : 'file', size: 10, mtimeMs: 1 };
        }),
        readdirWithStats: undefined,
      });
      vi.spyOn(providerRegistry, 'getStandaloneProvider').mockResolvedValue(mockProvider);

      const nodes = await service.readShallowDirectory('/', { scope: { backend: 'indexeddb' } });

      expect(nodes).toEqual([
        { id: '/alpha', name: 'alpha', size: 10, mtimeMs: 1, children: [] },
        { id: '/alpha-dir', name: 'alpha-dir', size: 10, mtimeMs: 1, children: [] },
        { id: '/beta.txt', name: 'beta.txt', size: 10, mtimeMs: 1 },
        { id: '/zebra.txt', name: 'zebra.txt', size: 10, mtimeMs: 1 },
      ]);
    });

    it('should propagate errors when getStandaloneProvider throws', async () => {
      // Audit R7: structured error propagation replaces the previous
      // swallow-to-`[]` fallback so the /files route can surface
      // recovery UI for revoked permissions / missing handles.
      vi.spyOn(providerRegistry, 'getStandaloneProvider').mockRejectedValue(new Error('no provider'));

      await expect(service.readShallowDirectory('/', { scope: { backend: 'indexeddb' } })).rejects.toThrow(
        'no provider',
      );
    });

    it('should propagate errors when readdir throws', async () => {
      const mockProvider = mock<FileSystemProvider>({
        readdir: vi.fn().mockRejectedValue(new Error('ENOENT')),
        readdirWithStats: undefined,
      });
      vi.spyOn(providerRegistry, 'getStandaloneProvider').mockResolvedValue(mockProvider);

      await expect(service.readShallowDirectory('/', { scope: { backend: 'indexeddb' } })).rejects.toThrow('ENOENT');
    });

    it('should skip entries where stat throws', async () => {
      const mockProvider = mock<FileSystemProvider>({
        readdir: vi.fn().mockResolvedValue(['good.txt', 'bad.txt']),
        stat: vi.fn().mockImplementation(async (path: string) => {
          if (path === '/good.txt') {
            return { type: 'file', size: 5, mtimeMs: 1 };
          }
          throw new Error('stat failed');
        }),
        readdirWithStats: undefined,
      });
      vi.spyOn(providerRegistry, 'getStandaloneProvider').mockResolvedValue(mockProvider);

      const nodes = await service.readShallowDirectory('/', { scope: { backend: 'indexeddb' } });
      expect(nodes).toEqual([{ id: '/good.txt', name: 'good.txt', size: 5, mtimeMs: 1 }]);
    });

    it('should build correct paths when root is /', async () => {
      const mockProvider = mock<FileSystemProvider>({
        readdir: vi.fn().mockResolvedValue(['file.txt']),
        stat: vi.fn().mockResolvedValue({ type: 'file', size: 1, mtimeMs: 1 }),
        readdirWithStats: undefined,
      });
      vi.spyOn(providerRegistry, 'getStandaloneProvider').mockResolvedValue(mockProvider);

      const nodes = await service.readShallowDirectory('/', { scope: { backend: 'indexeddb' } });
      expect(nodes[0]!.id).toBe('/file.txt');
      expect(mockProvider.stat).toHaveBeenCalledWith('/file.txt');
    });

    it('should build correct paths for nested directories', async () => {
      const mockProvider = mock<FileSystemProvider>({
        readdir: vi.fn().mockResolvedValue(['child.txt']),
        stat: vi.fn().mockResolvedValue({ type: 'file', size: 1, mtimeMs: 1 }),
        readdirWithStats: undefined,
      });
      vi.spyOn(providerRegistry, 'getStandaloneProvider').mockResolvedValue(mockProvider);

      const nodes = await service.readShallowDirectory('/parent/sub', { scope: { backend: 'indexeddb' } });
      expect(nodes[0]!.id).toBe('/parent/sub/child.txt');
      expect(mockProvider.stat).toHaveBeenCalledWith('/parent/sub/child.txt');
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
      await service.rename('/mut-r1.txt', '/mut-r2.txt', context);
      await service.writeFile('/mut-u.txt', 'd');
      await service.unlink('/mut-u.txt', undefined, context);
      await service.mkdir('/mut-rmdir', { recursive: true });
      await service.rmdir('/mut-rmdir', undefined, context);
      await service.writeFile('/mut-dup-s.txt', 'e');
      await service.duplicateFile('/mut-dup-s.txt', '/mut-dup-d.txt', context);
      await service.mkdir('/mut-cd-src', { recursive: true });
      await service.writeFile('/mut-cd-src/nested.txt', 'f');
      await service.copyDirectory('/mut-cd-src', '/mut-cd-dst', context);

      const tagged = originsByType.filter((row) => row.origin === 'all_methods');
      expect(tagged.length).toBeGreaterThanOrEqual(8);
      const types = new Set(tagged.map((row) => row.type));
      expect(types.has('fileWritten')).toBe(true);
      expect(types.has('fileRenamed')).toBe(true);
      expect(types.has('fileDeleted')).toBe(true);
      expect(types.has('directoryChanged')).toBe(true);
    });

    it('should emit directoryChanged on writeFiles', async () => {
      const events: ChangeEvent[] = [];
      eventBus.subscribe((event) => events.push(event));

      const filePath = '/batch/f.txt';
      await service.writeFiles({ [filePath]: { content: 'x' } });

      const directoryEvents = events.filter((event) => event.type === 'directoryChanged');
      expect(directoryEvents.length).toBeGreaterThanOrEqual(1);
    });

    it('should emit directoryCreated on mkdir', async () => {
      const events: ChangeEvent[] = [];
      eventBus.subscribe((event) => events.push(event));

      await service.mkdir('/evdir');

      const directoryEvents = events.filter((event) => event.type === 'directoryCreated');
      expect(directoryEvents).toHaveLength(1);
      expect(directoryEvents[0]).toMatchObject({ type: 'directoryCreated', path: '/evdir' });
    });

    it('should emit fileRenamed on rename', async () => {
      await service.writeFile('/ren.txt', 'data');
      const events: ChangeEvent[] = [];
      eventBus.subscribe((event) => events.push(event));

      await service.rename('/ren.txt', '/renamed.txt');

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

    it('should emit fileCopied on duplicateFile', async () => {
      await service.writeFile('/dup-src.txt', 'copy');
      const events: ChangeEvent[] = [];
      eventBus.subscribe((event) => events.push(event));

      await service.duplicateFile('/dup-src.txt', '/dup-dst.txt');

      const copyEvents = events.filter((event) => event.type === 'fileCopied');
      expect(copyEvents).toHaveLength(1);
      expect(copyEvents[0]).toMatchObject({
        type: 'fileCopied',
        sourcePath: '/dup-src.txt',
        targetPath: '/dup-dst.txt',
      });
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
  // readDirectory after mutations
  // ---------------------------------------------------------------------------

  describe('readDirectory after mutations', () => {
    it('should return fresh listing after write', async () => {
      await service.writeFile('/cacheinv/a.txt', 'a');
      const first = await service.readDirectory('/cacheinv');
      expect(first).toHaveLength(1);

      await service.writeFile('/cacheinv/b.txt', 'b');
      const second = await service.readDirectory('/cacheinv');
      expect(second).toHaveLength(2);
    });

    it('should return fresh listing after unlink', async () => {
      await service.writeFile('/cacheinv2/a.txt', 'a');
      await service.readDirectory('/cacheinv2');

      await service.unlink('/cacheinv2/a.txt');
      const after = await service.readDirectory('/cacheinv2');
      expect(after).toHaveLength(0);
    });

    it('should return fresh listing after rename', async () => {
      await service.writeFile('/ren-cache/old.txt', 'data');
      await service.readDirectory('/ren-cache');

      await service.rename('/ren-cache/old.txt', '/ren-cache/new.txt');
      const nodes = await service.readDirectory('/ren-cache');
      const names = nodes.map((n) => n.name);
      expect(names).toContain('new.txt');
      expect(names).not.toContain('old.txt');
    });
  });

  // ---------------------------------------------------------------------------
  // dispose
  // ---------------------------------------------------------------------------

  describe('dispose', () => {
    it('should clear the event bus (no subscribers fire after dispose)', async () => {
      const handler = vi.fn();
      eventBus.subscribe(handler);
      service.dispose();
      eventBus.emit({ type: 'fileWritten', path: '/x', backend: 'memory' });
      expect(handler).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // watch API
  // ---------------------------------------------------------------------------

  describe('watch', () => {
    it('should return an unsubscribe function', async () => {
      const unsub = service.watch({ paths: ['/'] }, () => {
        /* Intentionally empty */
      });
      expect(typeof unsub).toBe('function');
      unsub();
    });

    it('should expose watchRegistry', () => {
      expect(service.watchRegistry).toBeDefined();
      expect(service.watchRegistry.subscriptionCount).toBe(0);
    });

    it('should coalesce watch events within 75ms kernel window', async () => {
      const received: WatchEvent[] = [];
      service.watch({ paths: ['/src'], correlationId: 'c', recursive: true }, (event) => {
        received.push(event);
      });

      eventBus.emit({ type: 'fileWritten', path: '/src/a.txt', backend: 'memory' });
      eventBus.emit({ type: 'fileWritten', path: '/src/b.txt', backend: 'memory' });

      expect(received).toHaveLength(0);
      await waitFor(() => received.length >= 2);
      expect(received).toHaveLength(2);
      expect(received.every((event) => event.type === 'change')).toBe(true);
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

  describe('cleanupWatches', () => {
    it('should delegate to watchRegistry.cleanupOwner', async () => {
      const handler = vi.fn();
      service.watch({ paths: ['/'], correlationId: 'c', recursive: true }, handler, 'owner-1');
      expect(service.watchRegistry.handlerCount).toBe(1);

      service.cleanupWatches('owner-1');
      expect(service.watchRegistry.handlerCount).toBe(0);
    });
  });

  describe('eventBus getter', () => {
    it('should return the event bus instance', () => {
      expect(service.eventBus).toBe(eventBus);
    });
  });

  describe('_ensurePath error propagation', () => {
    it('should propagate non-EEXIST errors during nested writes', async () => {
      const origMkdir = rootProvider.mkdir.bind(rootProvider);
      let callCount = 0;
      rootProvider.mkdir = async (path: string) => {
        callCount++;
        if (callCount === 2) {
          const error = new Error('disk full') as NodeJS.ErrnoException;
          error.code = 'EIO';
          throw error;
        }
        return origMkdir(path);
      };

      await expect(service.writeFile('/a/b/c.txt', 'data')).rejects.toThrow('disk full');
    });
  });

  // ---------------------------------------------------------------------------
  // In-memory tree integration
  // ---------------------------------------------------------------------------

  describe('in-memory tree integration', () => {
    it('should reflect writeFile in subsequent getDirectoryStat', async () => {
      await service.writeFile('/root/a.txt', 'aaa');
      await service.getDirectoryStat('/root');

      await service.writeFile('/root/b.txt', 'bb');

      const stats = await service.getDirectoryStat('/root');
      const paths = stats.map((s) => s.path).sort();
      expect(paths).toEqual(['a.txt', 'b.txt']);
    });

    it('should reflect mkdir in subsequent getDirectoryStat', async () => {
      await service.writeFile('/root/a.txt', 'a');
      await service.getDirectoryStat('/root');

      await service.mkdir('/root/sub');
      await service.writeFile('/root/sub/x.txt', 'x');

      const stats = await service.getDirectoryStat('/root/sub');
      expect(stats).toHaveLength(1);
      expect(stats[0]!.path).toBe('x.txt');
    });

    it('should reflect unlink in subsequent getDirectoryStat', async () => {
      await service.writeFile('/root/a.txt', 'a');
      await service.writeFile('/root/b.txt', 'b');
      await service.getDirectoryStat('/root');

      await service.unlink('/root/a.txt');

      const stats = await service.getDirectoryStat('/root');
      expect(stats).toHaveLength(1);
      expect(stats[0]!.path).toBe('b.txt');
    });

    it('should reflect rename in subsequent getDirectoryStat', async () => {
      await service.writeFile('/root/old.txt', 'data');
      await service.getDirectoryStat('/root');

      await service.rename('/root/old.txt', '/root/new.txt');

      const stats = await service.getDirectoryStat('/root');
      const paths = stats.map((s) => s.path);
      expect(paths).toContain('new.txt');
      expect(paths).not.toContain('old.txt');
    });

    it('should reflect rmdir in subsequent getDirectoryStat', async () => {
      await service.mkdir('/root/sub', { recursive: true });
      await service.writeFile('/root/a.txt', 'a');
      await service.getDirectoryStat('/root');

      await service.rmdir('/root/sub');

      const stats = await service.getDirectoryStat('/root');
      expect(stats).toHaveLength(1);
      expect(stats[0]!.path).toBe('a.txt');
    });

    it('should reflect duplicateFile in subsequent getDirectoryStat', async () => {
      await service.writeFile('/root/src.txt', 'copy');
      await service.getDirectoryStat('/root');

      await service.duplicateFile('/root/src.txt', '/root/dst.txt');

      const stats = await service.getDirectoryStat('/root');
      const paths = stats.map((s) => s.path).sort();
      expect(paths).toEqual(['dst.txt', 'src.txt']);
    });

    it('should reflect copyDirectory in subsequent getDirectoryStat', async () => {
      await service.writeFile('/root/src/a.txt', 'aaa');
      await service.writeFile('/root/src/sub/b.txt', 'bb');
      await service.getDirectoryStat('/root');

      await service.copyDirectory('/root/src', '/root/dest');

      const stats = await service.getDirectoryStat('/root/dest');
      const paths = stats.map((s) => s.path).sort();
      expect(paths).toEqual(['a.txt', 'sub/b.txt']);
    });

    it('should reflect ensureDirectoryExists in subsequent getDirectoryStat', async () => {
      await service.writeFile('/root/a.txt', 'a');
      await service.getDirectoryStat('/root');

      await service.ensureDirectoryExists('/root/new-dir');

      const stats = await service.getDirectoryStat('/root');
      const hasEntry = stats.some((s) => s.path === 'a.txt');
      expect(hasEntry).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // getDirectoryStat abort signal
  // ---------------------------------------------------------------------------

  describe('getDirectoryStat abort signal', () => {
    it('should throw AbortError when signal is already aborted', async () => {
      await service.writeFile('/abort/a.txt', 'a');
      const controller = new AbortController();
      controller.abort();

      await expect(service.getDirectoryStat('/abort', { signal: controller.signal })).rejects.toThrow('aborted');
    });
  });
});

// =============================================================================
// Integration: WorkspaceFileService + DirectIdbProvider
// =============================================================================

describe('WorkspaceFileService integration [DirectIDB]', () => {
  let service: WorkspaceFileService;

  beforeEach(async () => {
    const providerRegistry = new ProviderRegistry({
      databasePrefix: `test-integration-${Date.now()}`,
    });
    const provider = await providerRegistry.createMountProvider({ backend: 'indexeddb' });

    const mountTable = new MountTable();
    mountTable.mount('/', provider, { backend: 'indexeddb' });

    const resourceQueue = new ResourceQueue();
    const eventBus = new ChangeEventBus();

    service = new WorkspaceFileService({
      providerRegistry,
      resourceQueue,
      eventBus,
      mountTable,
    });
  });

  it('should round-trip a string through write and read', async () => {
    await service.writeFile('/test.txt', 'hello');
    const result = await service.readFile('/test.txt', 'utf8');
    expect(result).toBe('hello');
  });

  it('should support writing and reading binary data', async () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    await service.writeFile('/bin.dat', data);
    const result = await service.readFile('/bin.dat');
    expect(result).toEqual(data);
  });

  it('should support batch writeFiles', async () => {
    /* eslint-disable @typescript-eslint/naming-convention -- Path-keyed object */
    await service.writeFiles({
      '/batch/a.txt': { content: encoder.encode('a') },
      '/batch/b.txt': { content: encoder.encode('b') },
    });
    /* eslint-enable @typescript-eslint/naming-convention -- Re-enable after path-keyed object */
    expect(await service.readFile('/batch/a.txt', 'utf8')).toBe('a');
    expect(await service.readFile('/batch/b.txt', 'utf8')).toBe('b');
  });

  it('should emit fileWritten change event on write', async () => {
    const events: ChangeEvent[] = [];
    const eventBus = new ChangeEventBus();

    const providerRegistry = new ProviderRegistry({
      databasePrefix: `test-events-${Date.now()}`,
    });
    const provider = await providerRegistry.createMountProvider({ backend: 'indexeddb' });
    const mountTable = new MountTable();
    mountTable.mount('/', provider, { backend: 'indexeddb' });

    const eventService = new WorkspaceFileService({
      providerRegistry,
      resourceQueue: new ResourceQueue(),
      eventBus,
      mountTable,
    });

    eventBus.subscribe((event) => events.push(event));
    await eventService.writeFile('/evented.txt', 'hello');

    expect(events).toContainEqual(expect.objectContaining({ type: 'fileWritten', path: '/evented.txt' }));
  });

  it('should build in-memory tree via getDirectoryStat', async () => {
    await service.writeFile('/tree/a.txt', 'a');
    await service.writeFile('/tree/b/c.txt', 'c');
    const stats = await service.getDirectoryStat('/');
    expect(stats.length).toBeGreaterThan(0);
  });

  describe('searchFiles', () => {
    it('should return matching files from InMemoryFileTree', async () => {
      await service.writeFile('/src/main.ts', 'console.log("hi")');
      await service.writeFile('/src/utils/helper.ts', 'export {}');
      await service.writeFile('/README.md', '# Hello');
      await service.getDirectoryStat('/');

      const results = service.searchFiles('/', 'helper');
      expect(results).toHaveLength(1);
      expect(results[0]!.path).toBe('src/utils/helper.ts');
    });

    it('should return empty array when tree is not built', () => {
      const results = service.searchFiles('/', 'anything');
      expect(results).toEqual([]);
    });

    it('should forward maxResults option', async () => {
      await service.writeFile('/a.ts', 'a');
      await service.writeFile('/b.ts', 'b');
      await service.writeFile('/c.ts', 'c');
      await service.getDirectoryStat('/');

      const results = service.searchFiles('/', '.ts', { maxResults: 2 });
      expect(results).toHaveLength(2);
    });

    it('should forward includeDirectories option', async () => {
      await service.writeFile('/src/main.ts', 'a');
      await service.getDirectoryStat('/');

      const results = service.searchFiles('/', 'src', { includeDirectories: true });
      const types = results.map((r) => r.type);
      expect(types).toContain('dir');
    });
  });

  // ---------------------------------------------------------------------------
  // SharedPool integration
  // ---------------------------------------------------------------------------

  describe('SharedPool integration', () => {
    async function createWorkspaceFileServiceWithPool() {
      const buffer = new SharedArrayBuffer(128 * 1024);
      const pool = new SharedPool(buffer, { maxEntries: 128 });

      const providerRegistry = new ProviderRegistry();
      const provider = await providerRegistry.createMountProvider({ backend: 'memory' });
      const mountTable = new MountTable();
      mountTable.mount('/', provider, { backend: 'memory' });

      const resourceQueue = new ResourceQueue();
      const eventBus = new ChangeEventBus();

      const svc = new WorkspaceFileService({
        providerRegistry,
        resourceQueue,
        eventBus,
        filePool: pool,
        mountTable,
      });

      return { service: svc, pool, eventBus };
    }

    it('should store binary content in pool after readFile', async () => {
      const { service: svc, pool } = await createWorkspaceFileServiceWithPool();
      await svc.writeFile('/cached.txt', 'pooled content');

      await svc.readFile('/cached.txt');

      const cached = pool.resolveCopy('/cached.txt');
      expect(cached).toBeDefined();
      expect(decoder.decode(cached)).toBe('pooled content');
    });

    it('should invalidate pool entry on writeFile', async () => {
      const { service: svc, pool } = await createWorkspaceFileServiceWithPool();
      await svc.writeFile('/update.txt', 'original');
      await svc.readFile('/update.txt');
      expect(pool.has('/update.txt')).toBe(true);

      await svc.writeFile('/update.txt', 'updated');
      expect(pool.has('/update.txt')).toBe(false);
    });

    it('should invalidate pool entries on rename', async () => {
      const { service: svc, pool } = await createWorkspaceFileServiceWithPool();
      await svc.writeFile('/old.txt', 'data');
      await svc.readFile('/old.txt');
      expect(pool.has('/old.txt')).toBe(true);

      await svc.rename('/old.txt', '/new.txt');
      expect(pool.has('/old.txt')).toBe(false);
      expect(pool.has('/new.txt')).toBe(false);
    });

    it('should invalidate pool entry on unlink', async () => {
      const { service: svc, pool } = await createWorkspaceFileServiceWithPool();
      await svc.writeFile('/delete.txt', 'data');
      await svc.readFile('/delete.txt');
      expect(pool.has('/delete.txt')).toBe(true);

      await svc.unlink('/delete.txt');
      expect(pool.has('/delete.txt')).toBe(false);
    });

    it('should work identically without pool', async () => {
      const { service: svc } = await createWorkspaceFileService();
      await svc.writeFile('/no-pool.txt', 'data');

      const content = await svc.readFile('/no-pool.txt', 'utf8');
      expect(content).toBe('data');
    });

    it('should accept filePool via setFilePool after construction', async () => {
      const { service: svc } = await createWorkspaceFileService();
      const buffer = new SharedArrayBuffer(128 * 1024);
      const pool = new SharedPool(buffer, { maxEntries: 128 });

      svc.setFilePool(pool);

      await svc.writeFile('/late-pool.txt', 'late binding');
      await svc.readFile('/late-pool.txt');

      const cached = pool.resolveCopy('/late-pool.txt');
      expect(cached).toBeDefined();
      expect(decoder.decode(cached)).toBe('late binding');
    });

    it('should invalidate late-bound pool on writeFile', async () => {
      const { service: svc } = await createWorkspaceFileService();
      const buffer = new SharedArrayBuffer(128 * 1024);
      const pool = new SharedPool(buffer, { maxEntries: 128 });

      svc.setFilePool(pool);

      await svc.writeFile('/invalidate.txt', 'original');
      await svc.readFile('/invalidate.txt');
      expect(pool.has('/invalidate.txt')).toBe(true);

      await svc.writeFile('/invalidate.txt', 'updated');
      expect(pool.has('/invalidate.txt')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // getZippedDirectory
  // ---------------------------------------------------------------------------

  describe('getZippedDirectory', () => {
    it('should return a Blob containing the directory files as a zip', async () => {
      await service.writeFile('/ziptest/a.txt', 'hello');
      await service.writeFile('/ziptest/b.txt', 'world');

      const blob = await service.getZippedDirectory('/ziptest');

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBeGreaterThan(0);
    });

    it('should include files with correct relative paths in the zip', async () => {
      await service.writeFile('/ziptest/sub/nested.txt', 'nested content');
      await service.writeFile('/ziptest/root.txt', 'root content');

      const blob = await service.getZippedDirectory('/ziptest');
      const jszipModule = await import('jszip');
      const jszip = jszipModule.default;
      const zip = await jszip.loadAsync(await blob.arrayBuffer());

      const paths = Object.keys(zip.files).sort();
      expect(paths).toContain('root.txt');
      expect(paths).toContain('sub/nested.txt');

      const rootContent = await zip.files['root.txt']!.async('string');
      expect(rootContent).toBe('root content');

      const nestedContent = await zip.files['sub/nested.txt']!.async('string');
      expect(nestedContent).toBe('nested content');
    });

    it('should handle empty directories', async () => {
      await service.mkdir('/emptydir', { recursive: true });

      const blob = await service.getZippedDirectory('/emptydir');

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // mount / unmount (dynamic mount routing)
  // ---------------------------------------------------------------------------

  describe('mount / unmount', () => {
    let mountedService: WorkspaceFileService;
    let mountedEventBus: ChangeEventBus;
    let mountedRegistry: ProviderRegistry;

    beforeEach(async () => {
      mountedRegistry = new ProviderRegistry();
      const rootProvider = await mountedRegistry.createMountProvider({ backend: 'memory' });

      const mountTable = new MountTable();
      mountTable.mount('/', rootProvider, { backend: 'memory' });
      mountedEventBus = new ChangeEventBus();

      mountedService = new WorkspaceFileService({
        providerRegistry: mountedRegistry,
        resourceQueue: new ResourceQueue(),
        eventBus: mountedEventBus,
        mountTable,
      });
    });

    it('should mount a path prefix on the specified backend', async () => {
      await mountedService.mount('/data', { backend: 'memory' });
      await mountedService.writeFile('/data/test.txt', 'hello');
      const content = await mountedService.readFile('/data/test.txt', 'utf8');
      expect(content).toBe('hello');
    });

    it('should unmount a path prefix and dispose the provider', async () => {
      await mountedService.mount('/ephemeral', { backend: 'memory', preservePath: true });
      await mountedService.writeFile('/ephemeral/file.txt', 'temp');
      expect(await mountedService.exists('/ephemeral/file.txt')).toBe(true);

      mountedService.unmount('/ephemeral');

      expect(await mountedService.exists('/ephemeral/file.txt')).toBe(false);
    });

    it('should route writes to the mounted provider and not the root', async () => {
      await mountedService.mount('/isolated', { backend: 'memory' });
      await mountedService.writeFile('/isolated/secret.txt', 'data');

      const rootEntries = await mountedService.readdir('/');
      expect(rootEntries).not.toContain('secret.txt');
    });

    it('should handle unmount of non-existent prefix gracefully', () => {
      expect(() => {
        mountedService.unmount('/nonexistent');
      }).not.toThrow();
    });

    it('should support multiple simultaneous mounts', async () => {
      await mountedService.mount('/a', { backend: 'memory' });
      await mountedService.mount('/b', { backend: 'memory' });

      await mountedService.writeFile('/a/x.txt', 'A');
      await mountedService.writeFile('/b/y.txt', 'B');

      expect(await mountedService.readFile('/a/x.txt', 'utf8')).toBe('A');
      expect(await mountedService.readFile('/b/y.txt', 'utf8')).toBe('B');
      expect(await mountedService.exists('/b/x.txt')).toBe(false);
    });

    it('should pass preservePath option through to mount table', async () => {
      await mountedService.mount('/projects/abc', { backend: 'memory', preservePath: true });
      await mountedService.writeFile('/projects/abc/main.ts', 'code');

      const content = await mountedService.readFile('/projects/abc/main.ts', 'utf8');
      expect(content).toBe('code');

      const entries = await mountedService.readdir('/projects/abc');
      expect(entries).toContain('main.ts');
    });
  });
});
