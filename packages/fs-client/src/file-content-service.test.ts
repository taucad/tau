import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { FileContentService } from '#file-content-service.js';
import type { ContentChangeEvent, FileContentResult, OutcomeChangeEvent } from '#file-content-service.js';
import { BinaryFileError, FileNotFoundError, FileTooLargeError } from '#file-content-errors.js';
import type { FileSystemClient } from '#file-system-client.js';
import { SharedPool } from '@taucad/memory';
import type { ChangeEvent } from '@taucad/types';
import { WorkerChangeChannel } from '#worker-change-channel.js';
import { WorkspacePathResolver, WorkspaceScopeViolationError } from '#workspace-path-resolver.js';
import { RefreshGenerationGuard } from '#refresh-generation-guard.js';

function createMockProxy(overrides?: Partial<FileSystemClient>): FileSystemClient {
  const proxy = mock<FileSystemClient>({
    readFile: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    writeFile: vi.fn().mockResolvedValue(undefined),
    writeFiles: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    copyDirectory: vi.fn().mockResolvedValue(undefined),
    getZippedDirectory: vi.fn().mockResolvedValue(new Blob()),
    duplicateFile: vi.fn().mockResolvedValue(undefined),
  });
  if (overrides) {
    Object.assign(proxy, overrides);
  }
  return proxy;
}

type FileContentHarness = {
  service: FileContentService;
  proxy: FileSystemClient;
  emitFileChanged: (event: ChangeEvent) => void;
  disposeChannel: () => void;
};

function createHarness(
  init?: Partial<Omit<ConstructorParameters<typeof FileContentService>[0], 'channel' | 'refreshGuard'>> & {
    workspaceRoot?: string;
  },
): FileContentHarness {
  const listen = vi.fn().mockReturnValue(vi.fn());
  const { workspaceRoot = '/project', paths: inputPaths, proxy: inputProxy, ...serviceOptions } = init ?? {};
  const paths = inputPaths ?? new WorkspacePathResolver(workspaceRoot);
  const channel = new WorkerChangeChannel({ transport: { listen }, paths });
  const refreshGuard = new RefreshGenerationGuard();
  const proxy = inputProxy ?? createMockProxy();
  const service = new FileContentService({
    openSizeBytes: 50 * 1024 * 1024,
    ...serviceOptions,
    proxy,
    paths,
    channel,
    refreshGuard,
  });
  const emitFileChanged = (event: ChangeEvent): void => {
    (listen.mock.calls[0]![1] as (data: unknown) => void)(event);
  };
  return {
    service,
    proxy,
    emitFileChanged,
    disposeChannel: () => {
      channel.dispose();
    },
  };
}

function expectTextContent(result: FileContentResult, expected: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  expect(result.kind).toBe('text');
  if (result.kind !== 'text') {
    throw new Error(`Expected text outcome, got ${result.kind}`);
  }
  expect(result.content).toEqual(expected);
  return result.content;
}

function makeAsciiBuffer(byteLength: number): Uint8Array<ArrayBuffer> {
  const buffer = new Uint8Array(byteLength);
  buffer.fill(0x41);
  return buffer;
}

/** Record `peekOutcome(path).kind` on each subscribe callback (matches useSyncExternalStore snapshot cadence). */
function recordOutcomeKinds(
  service: FileContentService,
  path: string,
): {
  readonly kinds: Array<FileContentResult['kind']>;
  readonly unsubscribe: () => void;
} {
  const kinds: Array<FileContentResult['kind']> = [];
  const unsubscribe = service.subscribe(path, () => {
    kinds.push(service.peekOutcome(path).kind);
  });
  return { kinds, unsubscribe };
}

function fileWritten(pathRelative: string): ChangeEvent {
  return { type: 'fileWritten', path: `/project/${pathRelative}`, backend: 'indexeddb' };
}

describe('FileContentService', () => {
  let proxy: FileSystemClient;
  let service: FileContentService;
  let emitFileChanged: (event: ChangeEvent) => void;

  beforeEach(() => {
    const harness = createHarness();
    proxy = harness.proxy;
    service = harness.service;
    emitFileChanged = harness.emitFileChanged;
  });

  it('resolve reads bundled typings from the global /node_modules mount, not under the project root', async () => {
    const harness = createHarness({ workspaceRoot: '/projects/abc' });
    const localService = harness.service;
    const localProxy = harness.proxy;
    const dts = new TextEncoder().encode('export declare const x: 1;');
    vi.mocked(localProxy.readFile).mockImplementation(async (absolutePath: string) => {
      if (absolutePath === '/node_modules/replicad/index.d.ts') {
        return dts;
      }
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    const result = await localService.resolve('node_modules/replicad/index.d.ts');
    expectTextContent(result, dts);
    expect(localProxy.readFile).toHaveBeenCalledWith('/node_modules/replicad/index.d.ts');
    expect(localProxy.readFile).not.toHaveBeenCalledWith('/projects/abc/node_modules/replicad/index.d.ts');
    harness.disposeChannel();
  });

  it('populateText sets text outcome and cache without worker read', async () => {
    vi.mocked(proxy.readFile).mockClear();
    const data = new TextEncoder().encode('manual');
    service.populateText('typed.ts', data);

    expect(service.peekOutcome('typed.ts').kind).toBe('text');
    const result = await service.resolve('typed.ts');
    expect(proxy.readFile).not.toHaveBeenCalled();
    expectTextContent(result, data);
  });

  it('should resolve text content from worker on cache miss', async () => {
    const data = new Uint8Array([10, 20, 30]);
    vi.mocked(proxy.readFile).mockResolvedValue(data);

    const result = await service.resolve('main.ts');

    expect(proxy.readFile).toHaveBeenCalledWith('/project/main.ts');
    expectTextContent(result, data);
  });

  it('should return cached text content without worker call on cache hit', async () => {
    const data = new Uint8Array([10, 20, 30]);
    vi.mocked(proxy.readFile).mockResolvedValue(data);

    await service.resolve('main.ts');
    vi.mocked(proxy.readFile).mockClear();

    const result = await service.resolve('main.ts');

    expect(proxy.readFile).not.toHaveBeenCalled();
    expectTextContent(result, data);
  });

  it('should join pending resolves for concurrent reads of same path', async () => {
    const data = new Uint8Array([10, 20, 30]);
    vi.mocked(proxy.readFile).mockResolvedValue(data);

    const [first, second] = await Promise.all([service.resolve('main.ts'), service.resolve('main.ts')]);

    expect(proxy.readFile).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it('should clone buffer before transfer on write, keeping valid local copy', async () => {
    const original = new Uint8Array([1, 2, 3]);

    await service.write('main.ts', original, 'machine');

    expect(proxy.writeFile).toHaveBeenCalledWith('/project/main.ts', original);

    const cached = service.peek('main.ts');
    expect(cached).toBeDefined();
    expect(cached).toEqual(new Uint8Array([1, 2, 3]));
    expect(cached).not.toBe(original);
  });

  it('should fire onDidContentChange with valid data after write', async () => {
    const handler = vi.fn<(event: ContentChangeEvent) => void>();
    service.onDidContentChange(handler);

    const data = new Uint8Array([1, 2, 3]);
    await service.write('main.ts', data, 'editor');

    expect(handler).toHaveBeenCalledOnce();
    const event = handler.mock.calls[0]![0];
    expect(event.type).toBe('written');
    if (event.type === 'written') {
      expect(event.path).toBe('main.ts');
      expect(event.source).toBe('editor');
      expect(event.data.byteLength).toBe(3);
    }
  });

  it('should update cache on rename', async () => {
    const data = new Uint8Array([1, 2, 3]);
    vi.mocked(proxy.readFile).mockResolvedValue(data);

    await service.resolve('old.ts');
    await service.rename('old.ts', 'new.ts');

    expect(service.has('old.ts')).toBe(false);
    expect(service.has('new.ts')).toBe(true);
    expect(service.peek('new.ts')).toEqual(data);
  });

  it('should fire content change on delete', async () => {
    const handler = vi.fn<(event: ContentChangeEvent) => void>();
    service.onDidContentChange(handler);

    const data = new Uint8Array([1]);
    vi.mocked(proxy.readFile).mockResolvedValue(data);
    await service.resolve('main.ts');

    handler.mockClear();

    await service.delete('main.ts', 'user');

    expect(service.has('main.ts')).toBe(false);
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0]![0].type).toBe('deleted');
  });

  it('should return data without LRU promotion via peek()', async () => {
    const data = new Uint8Array([1]);
    vi.mocked(proxy.readFile).mockResolvedValue(data);

    await service.resolve('main.ts');

    const peeked = service.peek('main.ts');
    expect(peeked).toEqual(data);
  });

  it('should clone each file buffer on writeFiles', async () => {
    const file1 = new Uint8Array([1, 2]);
    const file2 = new Uint8Array([3, 4]);

    const filePathA = 'a.ts';
    const filePathB = 'b.ts';
    await service.writeFiles({ [filePathA]: { content: file1 }, [filePathB]: { content: file2 } }, 'machine');

    expect(proxy.writeFiles).toHaveBeenCalledOnce();

    const cachedA = service.peek('a.ts');
    const cachedB = service.peek('b.ts');
    expect(cachedA).toEqual(new Uint8Array([1, 2]));
    expect(cachedB).toEqual(new Uint8Array([3, 4]));
    expect(cachedA).not.toBe(file1);
    expect(cachedB).not.toBe(file2);
  });

  it('should notify path subscribers on write', async () => {
    const callback = vi.fn();
    service.subscribe('main.ts', callback);

    await service.write('main.ts', new Uint8Array([1]), 'user');

    expect(callback).toHaveBeenCalledOnce();
  });

  it('should notify path subscribers on resolve (outcome change)', async () => {
    const callback = vi.fn();
    service.subscribe('main.ts', callback);

    vi.mocked(proxy.readFile).mockResolvedValue(new Uint8Array([1]));
    await service.resolve('main.ts');

    expect(callback).toHaveBeenCalledOnce();
  });

  it('should call proxy.copyDirectory for copyDirectory', async () => {
    await service.copyDirectory('/src', '/dest');

    expect(proxy.copyDirectory).toHaveBeenCalledWith('/src', '/dest');
  });

  it('should call proxy.getZippedDirectory for getZippedDirectory', async () => {
    const blob = new Blob(['zip']);
    vi.mocked(proxy.getZippedDirectory).mockResolvedValue(blob);

    const result = await service.getZippedDirectory('/project');

    expect(proxy.getZippedDirectory).toHaveBeenCalledWith('/project');
    expect(result).toBe(blob);
  });

  describe('peekOutcome', () => {
    it('should return loading kind before any resolve', () => {
      expect(service.peekOutcome('main.ts')).toEqual({ kind: 'loading' });
    });

    it('should return a referentially stable loading sentinel for unresolved paths', () => {
      // `useSyncExternalStore` requires getSnapshot to be referentially stable
      // when nothing has changed. Returning a fresh `{ kind: 'loading' }` on
      // every call previously caused a crash-loop where the project tree was
      // continuously remounted by the surrounding error boundary.
      const first = service.peekOutcome('main.ts');
      const second = service.peekOutcome('main.ts');
      const third = service.peekOutcome('other.ts');

      expect(first).toBe(second);
      expect(first).toBe(third);
    });

    it('should return text outcome after a successful resolve', async () => {
      const data = new Uint8Array([1, 2, 3]);
      vi.mocked(proxy.readFile).mockResolvedValue(data);

      await service.resolve('main.ts');

      const outcome = service.peekOutcome('main.ts');
      expect(outcome.kind).toBe('text');
      if (outcome.kind === 'text') {
        expect(outcome.content).toEqual(data);
      }
    });
  });

  describe('discriminated resolve outcomes', () => {
    it('should produce binary outcome when content sniffs as binary', async () => {
      const binaryBytes = new Uint8Array(5 * 1024 * 1024);
      binaryBytes[0] = 0x00;
      vi.mocked(proxy.readFile).mockResolvedValue(binaryBytes);

      const result = await service.resolve('mystery.dat');

      expect(result.kind).toBe('binary');
      if (result.kind === 'binary') {
        expect(result.size).toBe(5 * 1024 * 1024);
        expect(result.head.byteLength).toBe(512);
        expect(result.head[0]).toBe(0x00);
      }
      expect(service.peek('mystery.dat')).toBeUndefined();
    });

    it('should produce too-large outcome when ASCII content exceeds open limit', async () => {
      const { service: tinyService, proxy: tinyProxy } = createHarness({
        proxy,
        openSizeBytes: 1024,
      });
      const ascii = makeAsciiBuffer(5000);
      vi.mocked(tinyProxy.readFile).mockResolvedValue(ascii);

      const result = await tinyService.resolve('mystery.dat');

      expect(result.kind).toBe('too-large');
      if (result.kind === 'too-large') {
        expect(result.size).toBe(5000);
        expect(result.limit).toBe(1024);
      }
      expect(tinyService.peek('mystery.dat')).toBeUndefined();
    });

    it('should bypass binary sniff when forceText override is set', async () => {
      const buffer = new Uint8Array([0x00, 0x41, 0x42, 0x43]);
      vi.mocked(proxy.readFile).mockResolvedValue(buffer);

      const result = await service.resolve('mystery.dat', { forceText: true });

      expectTextContent(result, buffer);
    });

    it('should bypass open-limit when sizeLimit override is set', async () => {
      const { service: tinyService, proxy: tinyProxy } = createHarness({
        proxy,
        openSizeBytes: 1024,
      });
      const ascii = makeAsciiBuffer(4096);
      vi.mocked(tinyProxy.readFile).mockResolvedValue(ascii);

      const result = await tinyService.resolve('mystery.dat', { sizeLimit: Number.MAX_SAFE_INTEGER });

      expectTextContent(result, ascii);
    });

    it('should produce orphaned outcome when worker rejects with ENOENT', async () => {
      const error = new Error("ENOENT: no such file or directory '/project/missing.ts'");
      (error as NodeJS.ErrnoException).code = 'ENOENT';
      vi.mocked(proxy.readFile).mockRejectedValue(error);

      const result = await service.resolve('missing.ts');

      expect(result.kind).toBe('orphaned');
      expect(service.isOrphaned('missing.ts')).toBe(true);
    });

    it('should produce error outcome carrying the original cause for generic worker rejection', async () => {
      const cause = new Error('disk on fire');
      vi.mocked(proxy.readFile).mockRejectedValue(cause);

      const result = await service.resolve('main.ts');

      expect(result.kind).toBe('error');
      if (result.kind === 'error') {
        expect(result.cause).toBe(cause);
      }
    });
  });

  describe('open-limit decoupled from cache budget', () => {
    it('should reject ASCII bytes with too-large when openSizeBytes is below cache.maxSingleFileBytes', async () => {
      const { service: decoupled, proxy: decoupledProxy } = createHarness({
        proxy,
        openSizeBytes: 2 * 1024 * 1024,
        cacheOptions: { maxSingleFileBytes: 50 * 1024 * 1024 },
      });
      const ascii = makeAsciiBuffer(5 * 1024 * 1024);
      vi.mocked(decoupledProxy.readFile).mockResolvedValue(ascii);

      const result = await decoupled.resolve('mystery.dat');

      expect(result.kind).toBe('too-large');
      if (result.kind === 'too-large') {
        expect(result.size).toBe(5 * 1024 * 1024);
        expect(result.limit).toBe(2 * 1024 * 1024);
      }
    });
  });

  describe('cache rejection does not become too-large', () => {
    it('should still produce text outcome when cache.set rejects but bytes fit the open-limit', async () => {
      const { service: tinyCache, proxy: tinyCacheProxy } = createHarness({
        proxy,
        openSizeBytes: 10 * 1024 * 1024,
        cacheOptions: { maxSingleFileBytes: 1024, maxEntries: 10, maxTotalBytes: 100 * 1024 },
      });
      const ascii = makeAsciiBuffer(5 * 1024);
      vi.mocked(tinyCacheProxy.readFile).mockResolvedValue(ascii);

      const callback = vi.fn();
      tinyCache.subscribe('mystery.dat', callback);

      const result = await tinyCache.resolve('mystery.dat');

      expectTextContent(result, ascii);
      expect(tinyCache.peek('mystery.dat')).toBeUndefined();
      expect(callback).toHaveBeenCalledOnce();
    });
  });

  describe('SharedPool fast path', () => {
    const encoder = new TextEncoder();

    function createPoolService(options?: { openSizeBytes?: number }): {
      service: FileContentService;
      pool: SharedPool;
      proxy: FileSystemClient;
    } {
      const buffer = new SharedArrayBuffer(16 * 1024 * 1024);
      const pool = new SharedPool(buffer, { maxEntries: 128 });
      const mockProxy = createMockProxy();
      const listen = vi.fn().mockReturnValue(vi.fn());
      const paths = new WorkspacePathResolver('/project');
      const channel = new WorkerChangeChannel({ transport: { listen }, paths });
      const refreshGuard = new RefreshGenerationGuard();
      const svc = new FileContentService({
        proxy: mockProxy,
        paths,
        channel,
        refreshGuard,
        filePool: pool,
        openSizeBytes: options?.openSizeBytes ?? 50 * 1024 * 1024,
      });
      return { service: svc, pool, proxy: mockProxy };
    }

    it('should resolve text from shared pool on cache miss', async () => {
      const { service: svc, pool, proxy: mockProxy } = createPoolService();

      pool.store('/project/pooled.ts', encoder.encode('pool content'));

      const result = await svc.resolve('pooled.ts');
      expect(result.kind).toBe('text');
      if (result.kind === 'text') {
        expect(new TextDecoder().decode(result.content)).toBe('pool content');
      }
      expect(mockProxy.readFile).not.toHaveBeenCalled();
    });

    it('should produce binary outcome when pool returns binary bytes', async () => {
      const { service: svc, pool, proxy: mockProxy } = createPoolService();

      const binaryBytes = new Uint8Array(2048);
      binaryBytes[0] = 0x00;
      pool.store('/project/mystery.dat', binaryBytes);

      const result = await svc.resolve('mystery.dat');

      expect(result.kind).toBe('binary');
      if (result.kind === 'binary') {
        expect(result.size).toBe(2048);
      }
      expect(mockProxy.readFile).not.toHaveBeenCalled();
      expect(svc.peek('mystery.dat')).toBeUndefined();
    });

    it('should produce too-large outcome when pool returns oversize ASCII bytes', async () => {
      const { service: svc, pool, proxy: mockProxy } = createPoolService({ openSizeBytes: 1024 });

      const big = makeAsciiBuffer(4096);
      pool.store('/project/mystery.dat', big);

      const result = await svc.resolve('mystery.dat');

      expect(result.kind).toBe('too-large');
      if (result.kind === 'too-large') {
        expect(result.size).toBe(4096);
        expect(result.limit).toBe(1024);
      }
      expect(mockProxy.readFile).not.toHaveBeenCalled();
    });

    it('should fall through to worker RPC on double miss', async () => {
      const { service: svc, proxy: mockProxy } = createPoolService();

      const workerData = new Uint8Array([7, 8, 9]);
      vi.mocked(mockProxy.readFile).mockResolvedValue(workerData);

      const result = await svc.resolve('worker-only.ts');
      expect(mockProxy.readFile).toHaveBeenCalledWith('/project/worker-only.ts');
      expectTextContent(result, workerData);
    });

    it('should preserve existing cache hit behaviour after pool fast path', async () => {
      const { service: svc, proxy: mockProxy } = createPoolService();

      const workerData = new Uint8Array([1, 2, 3]);
      vi.mocked(mockProxy.readFile).mockResolvedValue(workerData);

      await svc.resolve('cached.ts');
      vi.mocked(mockProxy.readFile).mockClear();

      const result = await svc.resolve('cached.ts');
      expect(mockProxy.readFile).not.toHaveBeenCalled();
      expectTextContent(result, workerData);
    });
  });

  describe('outcome subscription channel', () => {
    it('should fire onDidChangeOutcome once per outcome transition', async () => {
      const handler = vi.fn<(event: OutcomeChangeEvent) => void>();
      service.onDidChangeOutcome(handler);

      const data = new Uint8Array([1, 2, 3]);
      vi.mocked(proxy.readFile).mockResolvedValue(data);

      await service.resolve('main.ts');

      expect(handler).toHaveBeenCalledOnce();
      const [event] = handler.mock.calls[0]!;
      expect(event.path).toBe('main.ts');
      expect(event.result.kind).toBe('text');
    });

    it('should not fire onDidChangeOutcome when outcome is unchanged', async () => {
      const handler = vi.fn<(event: OutcomeChangeEvent) => void>();
      service.onDidChangeOutcome(handler);

      const data = new Uint8Array([1, 2, 3]);
      vi.mocked(proxy.readFile).mockResolvedValue(data);

      await service.resolve('main.ts');
      handler.mockClear();

      await service.resolve('main.ts');

      expect(handler).not.toHaveBeenCalled();
    });

    it('should stop firing onDidChangeOutcome after unsubscribe', async () => {
      const handler = vi.fn<(event: OutcomeChangeEvent) => void>();
      const dispose = service.onDidChangeOutcome(handler);
      dispose();

      vi.mocked(proxy.readFile).mockResolvedValue(new Uint8Array([1]));
      await service.resolve('main.ts');

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('resolveBytes typed errors', () => {
    it('should resolve with bytes for text outcome', async () => {
      const data = new Uint8Array([1, 2, 3]);
      vi.mocked(proxy.readFile).mockResolvedValue(data);

      const bytes = await service.resolveBytes('main.ts');

      expect(bytes).toEqual(data);
    });

    it('should reject with BinaryFileError for binary outcome', async () => {
      const binaryBytes = new Uint8Array([0x00, 0x01, 0x02]);
      vi.mocked(proxy.readFile).mockResolvedValue(binaryBytes);

      try {
        await service.resolveBytes('mystery.dat');
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(BinaryFileError);
        expect((error as BinaryFileError).name).toBe('BinaryFileError');
        expect((error as BinaryFileError).path).toBe('mystery.dat');
        expect((error as BinaryFileError).size).toBe(3);
      }
    });

    it('should reject with FileTooLargeError for too-large outcome', async () => {
      const { service: tinyService, proxy: tinyProxy } = createHarness({
        proxy,
        openSizeBytes: 2,
      });
      const ascii = makeAsciiBuffer(64);
      vi.mocked(tinyProxy.readFile).mockResolvedValue(ascii);

      try {
        await tinyService.resolveBytes('mystery.dat');
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(FileTooLargeError);
        expect((error as FileTooLargeError).name).toBe('FileTooLargeError');
        expect((error as FileTooLargeError).size).toBe(64);
        expect((error as FileTooLargeError).limit).toBe(2);
      }
    });

    it('should reject with FileNotFoundError for orphaned outcome', async () => {
      const enoent = new Error("ENOENT: no such file or directory '/project/missing.ts'");
      (enoent as NodeJS.ErrnoException).code = 'ENOENT';
      vi.mocked(proxy.readFile).mockRejectedValue(enoent);

      try {
        await service.resolveBytes('missing.ts');
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(FileNotFoundError);
        expect((error as FileNotFoundError).name).toBe('FileNotFoundError');
        expect((error as FileNotFoundError).path).toBe('missing.ts');
      }
    });

    it('should reject with the original cause for generic worker error', async () => {
      const cause = new Error('disk on fire');
      vi.mocked(proxy.readFile).mockRejectedValue(cause);

      await expect(service.resolveBytes('main.ts')).rejects.toBe(cause);
    });
  });

  describe('orphan tracking', () => {
    function createEnoentError(path: string): Error {
      const error = new Error(`ENOENT: no such file or directory '${path}'`);
      (error as NodeJS.ErrnoException).code = 'ENOENT';
      return error;
    }

    it('should mark path as orphaned when resolve produces orphaned outcome', async () => {
      vi.mocked(proxy.readFile).mockRejectedValue(createEnoentError('/project/missing.ts'));

      expect(service.isOrphaned('missing.ts')).toBe(false);

      const result = await service.resolve('missing.ts');

      expect(result.kind).toBe('orphaned');
      expect(service.isOrphaned('missing.ts')).toBe(true);
    });

    it('should clear orphan when resolve succeeds after reset', async () => {
      vi.mocked(proxy.readFile).mockRejectedValueOnce(createEnoentError('/project/main.ts'));
      const failed = await service.resolve('main.ts');
      expect(failed.kind).toBe('orphaned');
      expect(service.isOrphaned('main.ts')).toBe(true);

      vi.mocked(proxy.readFile).mockResolvedValueOnce(new Uint8Array([1, 2, 3]));
      service.reset('/project');
      await service.resolve('main.ts');

      expect(service.isOrphaned('main.ts')).toBe(false);
    });

    it('should clear orphan when write succeeds', async () => {
      vi.mocked(proxy.readFile).mockRejectedValueOnce(createEnoentError('/project/main.ts'));
      const failed = await service.resolve('main.ts');
      expect(failed.kind).toBe('orphaned');
      expect(service.isOrphaned('main.ts')).toBe(true);

      await service.write('main.ts', new Uint8Array([1]), 'user');

      expect(service.isOrphaned('main.ts')).toBe(false);
    });

    it('should set orphan when delete is called', async () => {
      vi.mocked(proxy.readFile).mockResolvedValue(new Uint8Array([1]));
      await service.resolve('main.ts');
      expect(service.isOrphaned('main.ts')).toBe(false);

      await service.delete('main.ts', 'user');

      expect(service.isOrphaned('main.ts')).toBe(true);
    });

    it('should fire onDidChangeOrphaned event on orphan state transition', async () => {
      const handler = vi.fn<(event: { path: string; orphaned: boolean }) => void>();
      service.onDidChangeOrphaned(handler);

      vi.mocked(proxy.readFile).mockRejectedValue(createEnoentError('/project/main.ts'));
      const result = await service.resolve('main.ts');
      expect(result.kind).toBe('orphaned');

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith({ path: 'main.ts', orphaned: true });
    });

    it('should not fire onDidChangeOrphaned when state is unchanged', async () => {
      const handler = vi.fn<(event: { path: string; orphaned: boolean }) => void>();
      service.onDidChangeOrphaned(handler);

      vi.mocked(proxy.readFile).mockRejectedValue(createEnoentError('/project/main.ts'));
      await service.resolve('main.ts');
      handler.mockClear();

      service.reset('/project');
      vi.mocked(proxy.readFile).mockRejectedValue(createEnoentError('/project/main.ts'));
      await service.resolve('main.ts');

      expect(handler).toHaveBeenCalledOnce();
    });

    it('should clear all orphans on reset', async () => {
      vi.mocked(proxy.readFile).mockRejectedValue(createEnoentError('/project/a.ts'));
      const result = await service.resolve('a.ts');
      expect(result.kind).toBe('orphaned');
      expect(service.isOrphaned('a.ts')).toBe(true);

      service.reset('/project');

      expect(service.isOrphaned('a.ts')).toBe(false);
    });
  });

  describe('open-file outcome contract', () => {
    it('should not transition an open file outcome back to loading on fileWritten echo', async () => {
      vi.mocked(proxy.readFile).mockResolvedValue(new Uint8Array([1, 2, 3]));
      await service.resolve('main.ts');
      const { kinds, unsubscribe } = recordOutcomeKinds(service, 'main.ts');
      try {
        vi.mocked(proxy.readFile).mockResolvedValue(new Uint8Array([9, 9]));
        emitFileChanged(fileWritten('main.ts'));
        await vi.waitFor(() => {
          if (service.peekOutcome('main.ts').kind !== 'text') {
            throw new Error('expected text');
          }
          expectTextContent(service.peekOutcome('main.ts'), new Uint8Array([9, 9]));
        });
        const afterFirstText = kinds.indexOf('text');
        expect(afterFirstText).toBeGreaterThanOrEqual(0);
        expect(kinds.slice(afterFirstText).includes('loading')).toBe(false);
      } finally {
        unsubscribe();
      }
    });

    it('should swap text to text with new bytes on external fileWritten without a loading snapshot', async () => {
      const before = new Uint8Array([1]);
      const after = new Uint8Array([2, 3, 4]);
      vi.mocked(proxy.readFile).mockResolvedValueOnce(before);
      await service.resolve('main.ts');
      const { kinds, unsubscribe } = recordOutcomeKinds(service, 'main.ts');
      try {
        kinds.length = 0;
        vi.mocked(proxy.readFile).mockResolvedValue(after);
        emitFileChanged(fileWritten('main.ts'));
        await vi.waitFor(() => {
          expectTextContent(service.peekOutcome('main.ts'), after);
        });
        expect(kinds.includes('loading')).toBe(false);
      } finally {
        unsubscribe();
      }
    });

    it('should reclassify text to binary on refresh when new bytes trip the binary sniffer', async () => {
      vi.mocked(proxy.readFile).mockResolvedValueOnce(new Uint8Array([0x41, 0x42]));
      await service.resolve('main.ts');
      const binaryPayload = new Uint8Array([0x00]);
      vi.mocked(proxy.readFile).mockResolvedValue(binaryPayload);
      const { kinds, unsubscribe } = recordOutcomeKinds(service, 'main.ts');
      try {
        kinds.length = 0;
        emitFileChanged(fileWritten('main.ts'));
        await vi.waitFor(() => {
          expect(service.peekOutcome('main.ts').kind).toBe('binary');
        });
        expect(kinds.includes('loading')).toBe(false);
      } finally {
        unsubscribe();
      }
    });

    it('should reclassify text to too-large on refresh when new bytes exceed openSizeBytes', async () => {
      const {
        service: smallLimitService,
        proxy: smallProxy,
        emitFileChanged: emitSmall,
      } = createHarness({
        openSizeBytes: 4,
      });
      vi.mocked(smallProxy.readFile).mockResolvedValueOnce(new Uint8Array([1, 2, 3]));
      await smallLimitService.resolve('main.ts');
      vi.mocked(smallProxy.readFile).mockResolvedValue(makeAsciiBuffer(10));
      const { kinds, unsubscribe } = recordOutcomeKinds(smallLimitService, 'main.ts');
      try {
        kinds.length = 0;
        emitSmall(fileWritten('main.ts'));
        await vi.waitFor(() => {
          expect(smallLimitService.peekOutcome('main.ts').kind).toBe('too-large');
        });
        expect(kinds.includes('loading')).toBe(false);
      } finally {
        unsubscribe();
      }
    });

    it('should not transition open paths to loading on fileRenamed for old or new path', async () => {
      vi.mocked(proxy.readFile).mockResolvedValueOnce(new Uint8Array([1]));
      await service.resolve('old.ts');
      vi.mocked(proxy.readFile).mockResolvedValueOnce(new Uint8Array([2]));
      await service.resolve('new.ts');
      const oldRec = recordOutcomeKinds(service, 'old.ts');
      const newRec = recordOutcomeKinds(service, 'new.ts');
      try {
        oldRec.kinds.length = 0;
        newRec.kinds.length = 0;
        vi.mocked(proxy.readFile).mockResolvedValue(new Uint8Array([3]));
        emitFileChanged({
          type: 'fileRenamed',
          oldPath: '/project/old.ts',
          newPath: '/project/new.ts',
          backend: 'indexeddb',
        });
        await vi.waitFor(() => {
          expect(service.peekOutcome('old.ts').kind).toBe('orphaned');
        });
        await vi.waitFor(() => {
          expect(service.peekOutcome('new.ts').kind).toBe('text');
        });
        expect(oldRec.kinds.includes('loading')).toBe(false);
        expect(newRec.kinds.includes('loading')).toBe(false);
      } finally {
        oldRec.unsubscribe();
        newRec.unsubscribe();
      }
    });

    it('should not transition any path under the prefix to loading on directoryChanged', async () => {
      const populate = async (path: string): Promise<void> => {
        vi.mocked(proxy.readFile).mockResolvedValueOnce(new Uint8Array([1]));
        await service.resolve(path);
      };
      await populate('lib/a.ts');
      await populate('lib/sub/b.ts');
      await populate('main.ts');
      const recA = recordOutcomeKinds(service, 'lib/a.ts');
      const recB = recordOutcomeKinds(service, 'lib/sub/b.ts');
      try {
        recA.kinds.length = 0;
        recB.kinds.length = 0;
        vi.mocked(proxy.readFile).mockImplementation(async (abs: string) => {
          if (abs.endsWith('lib/a.ts')) {
            return new Uint8Array([2]);
          }
          if (abs.endsWith('lib/sub/b.ts')) {
            return new Uint8Array([3]);
          }
          return new Uint8Array([1]);
        });
        emitFileChanged({ type: 'directoryChanged', path: '/project/lib', backend: 'indexeddb' });
        await vi.waitFor(() => {
          expect(service.peekOutcome('lib/a.ts').kind).toBe('text');
        });
        await vi.waitFor(() => {
          expect(service.peekOutcome('lib/sub/b.ts').kind).toBe('text');
        });
        expect(recA.kinds.includes('loading')).toBe(false);
        expect(recB.kinds.includes('loading')).toBe(false);
        expect(service.peekOutcome('main.ts').kind).toBe('text');
      } finally {
        recA.unsubscribe();
        recB.unsubscribe();
      }
    });

    it('should not transition any open path to loading on backendChanged', async () => {
      vi.mocked(proxy.readFile).mockResolvedValue(new Uint8Array([1]));
      await service.resolve('a.ts');
      await service.resolve('b.ts');
      const recA = recordOutcomeKinds(service, 'a.ts');
      const recB = recordOutcomeKinds(service, 'b.ts');
      try {
        recA.kinds.length = 0;
        recB.kinds.length = 0;
        vi.mocked(proxy.readFile).mockResolvedValue(new Uint8Array([5]));
        emitFileChanged({ type: 'backendChanged', backend: 'opfs' });
        await vi.waitFor(() => {
          expect(service.peekOutcome('a.ts').kind).toBe('text');
        });
        await vi.waitFor(() => {
          expect(service.peekOutcome('b.ts').kind).toBe('text');
        });
        expect(recA.kinds.includes('loading')).toBe(false);
        expect(recB.kinds.includes('loading')).toBe(false);
      } finally {
        recA.unsubscribe();
        recB.unsubscribe();
      }
    });

    it('should not show loading after editor write when a fileWritten echo still arrives', async () => {
      const data = new Uint8Array([7, 8]);
      vi.mocked(proxy.readFile).mockResolvedValue(data);
      await service.resolve('main.ts');
      const { kinds, unsubscribe } = recordOutcomeKinds(service, 'main.ts');
      try {
        kinds.length = 0;
        await service.write('main.ts', new Uint8Array([9, 10]), 'editor');
        vi.mocked(proxy.readFile).mockResolvedValue(new Uint8Array([9, 10]));
        emitFileChanged(fileWritten('main.ts'));
        await vi.waitFor(() => {
          expect(service.peekOutcome('main.ts').kind).toBe('text');
        });
        expect(kinds.includes('loading')).toBe(false);
      } finally {
        unsubscribe();
      }
    });
  });

  describe('refresh generation guard', () => {
    it('should discard a stale refresh result when a newer refresh started before the slow read settled', async () => {
      vi.useFakeTimers();
      try {
        vi.mocked(proxy.readFile).mockResolvedValue(new Uint8Array([1]));
        await service.resolve('main.ts');

        let refreshReadCount = 0;
        vi.mocked(proxy.readFile).mockImplementation(async (): Promise<Uint8Array<ArrayBuffer>> => {
          refreshReadCount += 1;
          if (refreshReadCount === 1) {
            return new Promise<Uint8Array<ArrayBuffer>>((resolve) => {
              setTimeout(() => {
                resolve(new Uint8Array([7]));
              }, 1000);
            });
          }
          return new Uint8Array([9]);
        });

        emitFileChanged(fileWritten('main.ts'));
        emitFileChanged(fileWritten('main.ts'));

        await vi.advanceTimersByTimeAsync(0);
        await vi.waitFor(() => {
          expectTextContent(service.peekOutcome('main.ts'), new Uint8Array([9]));
        });

        await vi.advanceTimersByTimeAsync(1000);
        await vi.advanceTimersByTimeAsync(0);

        expectTextContent(service.peekOutcome('main.ts'), new Uint8Array([9]));
      } finally {
        vi.useRealTimers();
      }
    });

    it('should publish the latest refresh result when refresh generations are strictly monotonic', async () => {
      vi.mocked(proxy.readFile).mockResolvedValue(new Uint8Array([1]));
      await service.resolve('main.ts');

      vi.mocked(proxy.readFile).mockResolvedValueOnce(new Uint8Array([2]));
      vi.mocked(proxy.readFile).mockResolvedValueOnce(new Uint8Array([51]));
      emitFileChanged(fileWritten('main.ts'));
      await vi.waitFor(() => {
        expectTextContent(service.peekOutcome('main.ts'), new Uint8Array([2]));
      });

      emitFileChanged(fileWritten('main.ts'));
      await vi.waitFor(() => {
        expectTextContent(service.peekOutcome('main.ts'), new Uint8Array([51]));
      });
    });
  });

  describe('handleWorkerFileChanged', () => {
    it('should refresh in place and notify subscribers when a watched file is written externally', async () => {
      const initialBytes = new Uint8Array([1, 2, 3]);
      vi.mocked(proxy.readFile).mockResolvedValue(initialBytes);
      await service.resolve('main.ts');
      expect(service.has('main.ts')).toBe(true);

      const callback = vi.fn();
      service.subscribe('main.ts', callback);

      vi.mocked(proxy.readFile).mockResolvedValue(new Uint8Array([4, 5]));
      emitFileChanged({ type: 'fileWritten', path: '/project/main.ts', backend: 'indexeddb' });

      await vi.waitFor(() => {
        expect(callback.mock.calls.length).toBeGreaterThanOrEqual(1);
      });
      expect(service.peekOutcome('main.ts').kind).toBe('text');
      expect(service.peekOutcome('main.ts')).toEqual(
        expect.objectContaining({ kind: 'text', content: new Uint8Array([4, 5]) }),
      );
    });

    it('should re-read fresh bytes from the proxy after fileWritten without requiring explicit resolve', async () => {
      const before = new Uint8Array([1]);
      const after = new Uint8Array([2, 3, 4]);
      vi.mocked(proxy.readFile).mockResolvedValueOnce(before);
      await service.resolve('main.ts');

      vi.mocked(proxy.readFile).mockResolvedValueOnce(after);
      emitFileChanged({ type: 'fileWritten', path: '/project/main.ts', backend: 'indexeddb' });

      await vi.waitFor(() => {
        expectTextContent(service.peekOutcome('main.ts'), after);
      });
      expect(proxy.readFile).toHaveBeenCalledTimes(2);
    });

    it('should mark the path as orphaned and publish an orphaned outcome on fileDeleted', async () => {
      vi.mocked(proxy.readFile).mockResolvedValue(new Uint8Array([1]));
      await service.resolve('main.ts');

      emitFileChanged({ type: 'fileDeleted', path: '/project/main.ts', backend: 'indexeddb' });

      expect(service.has('main.ts')).toBe(false);
      expect(service.isOrphaned('main.ts')).toBe(true);
      expect(service.peekOutcome('main.ts')).toEqual({ kind: 'orphaned' });
    });

    it('should orphan old path and refresh new path on fileRenamed', async () => {
      vi.mocked(proxy.readFile).mockResolvedValueOnce(new Uint8Array([1]));
      await service.resolve('old.ts');
      vi.mocked(proxy.readFile).mockResolvedValueOnce(new Uint8Array([2]));
      await service.resolve('new.ts');

      vi.mocked(proxy.readFile).mockResolvedValue(new Uint8Array([3]));
      emitFileChanged({
        type: 'fileRenamed',
        oldPath: '/project/old.ts',
        newPath: '/project/new.ts',
        backend: 'indexeddb',
      });

      await vi.waitFor(() => {
        expect(service.peekOutcome('old.ts').kind).toBe('orphaned');
      });
      await vi.waitFor(() => {
        expect(service.peekOutcome('new.ts').kind).toBe('text');
      });
      expectTextContent(service.peekOutcome('new.ts'), new Uint8Array([3]));
    });

    it('should refresh every cached entry under a directoryChanged prefix without dropping main.ts', async () => {
      const populate = async (path: string): Promise<void> => {
        vi.mocked(proxy.readFile).mockResolvedValueOnce(new Uint8Array([1]));
        await service.resolve(path);
      };
      await populate('lib/a.ts');
      await populate('lib/sub/b.ts');
      await populate('main.ts');

      vi.mocked(proxy.readFile).mockImplementation(async (abs: string) => {
        if (abs.includes('/lib/')) {
          return new Uint8Array([2]);
        }
        return new Uint8Array([1]);
      });
      emitFileChanged({ type: 'directoryChanged', path: '/project/lib', backend: 'indexeddb' });

      await vi.waitFor(() => {
        expect(service.peekOutcome('lib/a.ts').kind).toBe('text');
      });
      expect(service.peekOutcome('main.ts').kind).toBe('text');
    });

    it('should refresh open paths on backendChanged', async () => {
      vi.mocked(proxy.readFile).mockResolvedValue(new Uint8Array([1]));
      await service.resolve('a.ts');
      await service.resolve('b.ts');

      const callback = vi.fn();
      service.subscribe('a.ts', callback);

      vi.mocked(proxy.readFile).mockResolvedValue(new Uint8Array([9]));
      emitFileChanged({ type: 'backendChanged', backend: 'opfs' });

      await vi.waitFor(() => {
        expectTextContent(service.peekOutcome('a.ts'), new Uint8Array([9]));
      });
      expect(callback.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    it('should evict cache for a closed path on fileWritten without readFile roundtrip', async () => {
      vi.mocked(proxy.readFile).mockResolvedValue(new Uint8Array([1]));
      await service.resolve('open.ts');
      vi.mocked(proxy.readFile).mockClear();

      emitFileChanged(fileWritten('never-opened.ts'));

      expect(vi.mocked(proxy.readFile)).not.toHaveBeenCalled();
    });

    it('should ignore events that fall outside the project root', async () => {
      vi.mocked(proxy.readFile).mockResolvedValue(new Uint8Array([1]));
      await service.resolve('main.ts');

      emitFileChanged({ type: 'fileWritten', path: '/other/main.ts', backend: 'indexeddb' });

      expect(service.has('main.ts')).toBe(true);
    });

    it('should emit a directoryCreated ContentChangeEvent when the worker reports a directoryCreated change', async () => {
      const handler = vi.fn();
      service.onDidContentChange(handler);

      emitFileChanged({ type: 'directoryCreated', path: '/project/newdir', backend: 'indexeddb' });

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: 'directoryCreated', path: 'newdir' }));
    });

    it('should emit a directoryDeleted ContentChangeEvent when the worker reports a directoryDeleted change', async () => {
      const handler = vi.fn();
      service.onDidContentChange(handler);

      emitFileChanged({ type: 'directoryDeleted', path: '/project/old', backend: 'indexeddb' });

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: 'directoryDeleted', path: 'old' }));
    });

    it('should emit a directoryRenamed ContentChangeEvent when the worker reports a directoryRenamed change', async () => {
      const handler = vi.fn();
      service.onDidContentChange(handler);

      emitFileChanged({
        type: 'directoryRenamed',
        oldPath: '/project/old',
        newPath: '/project/new',
        backend: 'indexeddb',
      });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'directoryRenamed', oldPath: 'old', newPath: 'new' }),
      );
    });
  });

  describe('cache capacity', () => {
    it('should accept 500 entries before eviction with default cache options', async () => {
      const customProxy = createMockProxy({
        readFile: vi.fn().mockImplementation(async () => new Uint8Array([1])),
      });
      const { service: svc } = createHarness({ proxy: customProxy });

      for (let i = 0; i < 500; i++) {
        // oxlint-disable-next-line no-await-in-loop -- Sequential cache population required
        await svc.resolve(`file-${i}.ts`);
      }

      for (let i = 0; i < 500; i++) {
        expect(svc.peek(`file-${i}.ts`)).toBeDefined();
      }
    });
  });

  describe('workspace scope contract', () => {
    it('write rejects foreign-absolute keys with WorkspaceScopeViolationError before touching the proxy', async () => {
      const harness = createHarness({ workspaceRoot: '/' });
      const data = new Uint8Array([1, 2, 3]);

      await expect(harness.service.write('/projects/x/main.ts', data, 'machine')).rejects.toBeInstanceOf(
        WorkspaceScopeViolationError,
      );
      expect(harness.proxy.writeFile).not.toHaveBeenCalled();
      harness.disposeChannel();
    });

    it('writeFiles rejects foreign-absolute keys with WorkspaceScopeViolationError before touching the proxy', async () => {
      const harness = createHarness({ workspaceRoot: '/' });
      const foreignKey = '/projects/x/main.ts';

      await expect(
        harness.service.writeFiles({ [foreignKey]: { content: new Uint8Array([1, 2, 3]) } }, 'machine'),
      ).rejects.toBeInstanceOf(WorkspaceScopeViolationError);
      expect(harness.proxy.writeFiles).not.toHaveBeenCalled();
      harness.disposeChannel();
    });

    it('delete rejects foreign-absolute keys with WorkspaceScopeViolationError before touching the proxy', async () => {
      const harness = createHarness({ workspaceRoot: '/' });

      await expect(harness.service.delete('/projects/x/main.ts', 'machine')).rejects.toBeInstanceOf(
        WorkspaceScopeViolationError,
      );
      expect(harness.proxy.unlink).not.toHaveBeenCalled();
      harness.disposeChannel();
    });

    it('rename rejects foreign-absolute keys with WorkspaceScopeViolationError before touching the proxy', async () => {
      const harness = createHarness({ workspaceRoot: '/projects/abc' });

      await expect(harness.service.rename('main.ts', '/projects/other/main.ts')).rejects.toBeInstanceOf(
        WorkspaceScopeViolationError,
      );
      expect(harness.proxy.rename).not.toHaveBeenCalled();
      harness.disposeChannel();
    });

    it('duplicate rejects foreign-absolute keys with WorkspaceScopeViolationError before touching the proxy', async () => {
      const harness = createHarness({ workspaceRoot: '/projects/abc' });

      await expect(harness.service.duplicate('main.ts', '/projects/other/copy.ts')).rejects.toBeInstanceOf(
        WorkspaceScopeViolationError,
      );
      expect(harness.proxy.duplicateFile).not.toHaveBeenCalled();
      expect(harness.proxy.writeFile).not.toHaveBeenCalled();
      harness.disposeChannel();
    });

    it('writeFiles normalizes absolute-but-in-scope keys to workspace-relative paths in batchWritten', async () => {
      const harness = createHarness({ workspaceRoot: '/projects/abc' });
      const events: ContentChangeEvent[] = [];
      harness.service.onDidContentChange((event) => {
        events.push(event);
      });

      const absoluteKey = '/projects/abc/main.ts';
      const relativeKey = 'lib/util.ts';
      await harness.service.writeFiles(
        {
          [absoluteKey]: { content: new Uint8Array([1, 2, 3]) },
          [relativeKey]: { content: new Uint8Array([4, 5, 6]) },
        },
        'machine',
      );

      const batchWritten = events.find((event) => event.type === 'batchWritten');
      expect(batchWritten).toBeDefined();
      if (batchWritten?.type === 'batchWritten') {
        expect(batchWritten.paths).toEqual(['main.ts', 'lib/util.ts']);
      }
      harness.disposeChannel();
    });

    it('write normalizes absolute-but-in-scope keys to workspace-relative paths in written events', async () => {
      const harness = createHarness({ workspaceRoot: '/projects/abc' });
      const events: ContentChangeEvent[] = [];
      harness.service.onDidContentChange((event) => {
        events.push(event);
      });

      await harness.service.write('/projects/abc/main.ts', new Uint8Array([1, 2, 3]), 'machine');

      const written = events.find((event) => event.type === 'written');
      expect(written).toBeDefined();
      if (written?.type === 'written') {
        expect(written.path).toBe('main.ts');
      }
      // Cache is keyed by the normalized workspace-relative form.
      expect(harness.service.has('main.ts')).toBe(true);
      expect(harness.service.has('/projects/abc/main.ts')).toBe(false);
      harness.disposeChannel();
    });

    it('delete normalizes absolute-but-in-scope keys to workspace-relative paths in deleted events', async () => {
      const harness = createHarness({ workspaceRoot: '/projects/abc' });
      const events: ContentChangeEvent[] = [];
      harness.service.onDidContentChange((event) => {
        events.push(event);
      });

      await harness.service.delete('/projects/abc/main.ts', 'machine');

      const deleted = events.find((event) => event.type === 'deleted');
      expect(deleted).toBeDefined();
      if (deleted?.type === 'deleted') {
        expect(deleted.path).toBe('main.ts');
      }
      harness.disposeChannel();
    });

    it('rename normalizes absolute-but-in-scope keys to workspace-relative paths in renamed events', async () => {
      const harness = createHarness({ workspaceRoot: '/projects/abc' });
      const events: ContentChangeEvent[] = [];
      harness.service.onDidContentChange((event) => {
        events.push(event);
      });

      await harness.service.rename('/projects/abc/old.ts', '/projects/abc/new.ts');

      const renamed = events.find((event) => event.type === 'renamed');
      expect(renamed).toBeDefined();
      if (renamed?.type === 'renamed') {
        expect(renamed.oldPath).toBe('old.ts');
        expect(renamed.newPath).toBe('new.ts');
      }
      harness.disposeChannel();
    });
  });
});
