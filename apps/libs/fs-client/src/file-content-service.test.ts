import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import * as hash from '@taucad/utils/hash';
import { EditorSaveConflictError, FileContentService } from '#file-content-service.js';
import type { ContentChangeEvent, FileContentResult, OutcomeChangeEvent } from '#file-content-service.js';
import { BinaryFileError, FileNotFoundError, FileTooLargeError } from '#file-content-errors.js';
import { SharedPool } from '@taucad/memory';
import type { ChangeEvent, FileStat } from '@taucad/types';
import type { WorkerChangeChannelTransport } from '#worker-change-channel.js';
import type { WatchEvent } from '@taucad/filesystem';
import { WorkerChangeChannel } from '#worker-change-channel.js';
import { WorkspacePathResolver, WorkspaceScopeViolationError } from '#workspace-path-resolver.js';
import { RefreshGenerationGuard } from '#refresh-generation-guard.js';
import { WorkspaceMutationError } from '@taucad/filesystem';
import { composeView } from '@taucad/filesystem/composed-view';
import type { ComposedViewOverlay } from '@taucad/filesystem/composed-view';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import { createComposedViewClient } from '#composed-view-client.js';
import type { ComposedViewClient, ComposedViewProxy } from '#composed-view-client.js';
import type { WorkspaceAuthorityClient } from '#file-system-client.js';

function createMockProxy(overrides?: Partial<ComposedViewClient>): ComposedViewClient {
  const proxy = mock<ComposedViewClient>({
    readFile: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    writeFile: vi.fn().mockResolvedValue(undefined),
    writeFiles: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    rmdir: vi.fn().mockResolvedValue(undefined),
    move: vi.fn().mockResolvedValue({ type: 'file', size: 0, mtimeMs: 0 }),
    unlink: vi.fn().mockResolvedValue(undefined),
    getZippedDirectory: vi.fn().mockResolvedValue(new Blob()),
    duplicateFile: vi.fn().mockResolvedValue(undefined),
  });
  /* A checked editor save (RV-W5b F4) on this fake filesystem is a write whose check passes. */
  proxy.writeFileChecked.mockImplementation(async ({ path, data }) => {
    await proxy.writeFile(path, data);
    return { status: 'applied', content: typeof data === 'string' ? new TextEncoder().encode(data) : data };
  });
  if (overrides) {
    Object.assign(proxy, overrides);
  }
  return proxy;
}

type FileContentHarness = {
  service: FileContentService;
  proxy: ComposedViewClient;
  emitFileChanged: (event: ChangeEvent) => void;
  disposeChannel: () => void;
};

function createHarness(
  init?: Partial<Omit<ConstructorParameters<typeof FileContentService>[0], 'channel' | 'refreshGuard'>> & {
    workspaceRoot?: string;
    watchReady?: WorkerChangeChannelTransport['watchReady'];
  },
): FileContentHarness {
  const listen = vi.fn().mockReturnValue(vi.fn());
  const {
    watchReady,
    workspaceRoot = '/project',
    paths: inputPaths,
    proxy: inputProxy,
    ...serviceOptions
  } = init ?? {};
  const paths = inputPaths ?? new WorkspacePathResolver(workspaceRoot);
  const channel = new WorkerChangeChannel({ transport: { listen, watchReady } });
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
  return { type: 'fileWritten', path: pathRelative, backend: 'indexeddb' };
}

describe('FileContentService', () => {
  let proxy: ComposedViewClient;
  let service: FileContentService;
  let emitFileChanged: (event: ChangeEvent) => void;

  beforeEach(() => {
    const harness = createHarness();
    proxy = harness.proxy;
    service = harness.service;
    emitFileChanged = harness.emitFileChanged;
  });

  it('should fence old content health and reads across source replacement with active leases', async () => {
    const oldRead = Promise.withResolvers<Uint8Array<ArrayBuffer>>();
    const oldClosed = Promise.withResolvers<void>();
    const newReady = Promise.withResolvers<void>();
    const watchReady = vi
      .fn<NonNullable<WorkerChangeChannelTransport['watchReady']>>()
      .mockReturnValueOnce({ ready: Promise.resolve(), closed: oldClosed.promise, unsubscribe: vi.fn() })
      .mockReturnValueOnce({
        ready: newReady.promise,
        closed: Promise.withResolvers<void>().promise,
        unsubscribe: vi.fn(),
      });
    const proxy = createMockProxy({
      readFile: vi.fn().mockReturnValueOnce(oldRead.promise).mockResolvedValue(new TextEncoder().encode('new source')),
    });
    const harness = createHarness({ proxy, watchReady });
    const old = harness.service.observeContent('main.txt').acquire();
    await vi.waitFor(() => {
      expect(proxy.readFile).toHaveBeenCalledOnce();
    });
    harness.service.reset('/replacement');
    const current = harness.service.observeContent('main.txt').acquire();
    oldClosed.resolve();
    expect(current.getSnapshot().status).toBe('registering');
    expect(harness.service.peekOutcome('main.txt').kind).toBe('loading');
    newReady.resolve();
    await vi.waitFor(() => {
      expect(current.getSnapshot().status).toBe('ready');
    });
    oldRead.resolve(new TextEncoder().encode('old source'));
    old.release();
    expect(harness.service.peekOutcome('main.txt')).toMatchObject({
      kind: 'text',
      content: new TextEncoder().encode('new source'),
    });
    expect(current.getSnapshot().status).toBe('ready');
    current.release();
    harness.service.dispose();
    harness.disposeChannel();
  });

  it('should notify mounted content on rejected registration and recover through the same owner', async () => {
    const ready = Promise.withResolvers<void>();
    const closed = Promise.withResolvers<void>();
    const watchReady = vi
      .fn()
      .mockReturnValueOnce({ ready: ready.promise, closed: closed.promise, unsubscribe: vi.fn() })
      .mockReturnValue({
        ready: Promise.resolve(),
        closed: Promise.withResolvers<void>().promise,
        unsubscribe: vi.fn(),
      });
    const harness = createHarness({ watchReady });
    const notify = vi.fn();
    const unsubscribe = harness.service.subscribe('main.txt', notify);
    expect(harness.proxy.readFile).not.toHaveBeenCalled();
    ready.reject(new Error('registration refused'));
    await vi.waitFor(() => {
      expect(harness.service.peekOutcome('main.txt').kind).toBe('error');
    });
    expect(notify).toHaveBeenCalled();
    vi.mocked(harness.proxy.readFile).mockResolvedValue(new TextEncoder().encode('fresh'));
    harness.service.observeContent('main.txt').refresh();
    await vi.waitFor(() => {
      expect(harness.service.peekOutcome('main.txt').kind).toBe('text');
    });
    expect(harness.service.peekOutcome('main.txt')).toMatchObject({ kind: 'text' });
    expect(watchReady).toHaveBeenCalledTimes(2);
    unsubscribe();
    harness.service.dispose();
    harness.disposeChannel();
  });

  it('should notify mounted content when its isolated watch closes while retaining safe bytes', async () => {
    const closed = Promise.withResolvers<void>();
    const harness = createHarness({
      watchReady: () => ({ ready: Promise.resolve(), closed: closed.promise, unsubscribe: vi.fn() }),
    });
    const notify = vi.fn();
    const unsubscribe = harness.service.subscribe('main.txt', notify);
    await vi.waitFor(() => {
      expect(harness.service.peekOutcome('main.txt').kind).toBe('text');
    });
    notify.mockClear();
    closed.resolve();
    await vi.waitFor(() => {
      expect(harness.service.peekOutcome('main.txt').kind).toBe('error');
    });
    expect(notify).toHaveBeenCalled();
    unsubscribe();
    harness.service.dispose();
    harness.disposeChannel();
  });

  it.each<ChangeEvent>([
    fileWritten('dir/file.txt'),
    { type: 'fileRenamed', oldPath: 'dir/file.txt', newPath: 'dir/new.txt', backend: 'indexeddb' },
    { type: 'directoryChanged', path: 'dir', backend: 'indexeddb' },
    { type: 'directoryRenamed', oldPath: 'dir', newPath: 'moved', backend: 'indexeddb' },
    { type: 'backendChanged', backend: 'indexeddb' },
  ])('uses one acquisition owner for exact watch followed by delayed $type', async (generic) => {
    const closed = Promise.withResolvers<void>();
    let onWatch = (_event: WatchEvent): void => undefined;
    const harness = createHarness({
      watchReady: (_request, handler) => {
        onWatch = handler;
        return { ready: Promise.resolve(), closed: closed.promise, unsubscribe: () => undefined };
      },
    });
    const localService = harness.service;
    const localProxy = harness.proxy;
    vi.mocked(localProxy.readFile).mockResolvedValue(new TextEncoder().encode('before'));
    const unsubscribe = localService.subscribe('dir/file.txt', () => undefined);
    await localService.resolve('dir/file.txt');
    vi.mocked(localProxy.readFile).mockClear();
    vi.mocked(localProxy.readFile).mockResolvedValue(new TextEncoder().encode('after'));
    onWatch(generic.type === 'backendChanged' ? { type: 'reset' } : { type: 'change', path: 'dir/file.txt' });
    await vi.waitFor(() => {
      expect(localService.peekOutcome('dir/file.txt')).toEqual({
        kind: 'text',
        content: new TextEncoder().encode('after'),
      });
    });
    expect(localProxy.readFile).toHaveBeenCalledTimes(1);
    vi.useFakeTimers();
    await vi.advanceTimersByTimeAsync(500);
    harness.emitFileChanged(generic);
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();
    expect(localProxy.readFile).toHaveBeenCalledTimes(1);
    expect(localService.peekOutcome('dir/file.txt')).toEqual({
      kind: 'text',
      content: new TextEncoder().encode('after'),
    });
    unsubscribe();
    localService.dispose();
    harness.disposeChannel();
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

    expect(proxy.writeFile).toHaveBeenCalledOnce();
    const [_path, sent] = vi.mocked(proxy.writeFile).mock.calls[0] as [string, Uint8Array<ArrayBuffer>];
    expect(sent).toEqual(new Uint8Array([1, 2, 3]));
    expect(sent).not.toBe(original);
    expect(sent.buffer).not.toBe(original.buffer);

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

  it('should preserve A→C→A write intent while the committed cache still contains A', async () => {
    const initial = new TextEncoder().encode('A');
    const intermediate = new TextEncoder().encode('C');
    vi.mocked(proxy.readFile).mockResolvedValue(initial);
    await service.resolve('main.ts');

    const intermediateWrite = Promise.withResolvers<void>();
    const finalWrite = Promise.withResolvers<void>();
    vi.mocked(proxy.writeFile).mockReturnValueOnce(intermediateWrite.promise).mockReturnValueOnce(finalWrite.promise);
    const events: ContentChangeEvent[] = [];
    service.onDidContentChange((event) => {
      events.push(event);
    });

    const persistIntermediate = service.write('main.ts', intermediate, 'editor');
    const persistFinal = service.write('main.ts', initial, 'editor');

    expect(proxy.writeFile).toHaveBeenCalledTimes(2);
    expect(vi.mocked(proxy.writeFile).mock.calls.map(([path, data]) => [path, data])).toEqual([
      ['/project/main.ts', intermediate],
      ['/project/main.ts', initial],
    ]);
    expect(service.peek('main.ts')).toEqual(initial);

    intermediateWrite.resolve();
    await persistIntermediate;
    expect(service.peek('main.ts')).toEqual(intermediate);

    finalWrite.resolve();
    await persistFinal;
    expect(service.peek('main.ts')).toEqual(initial);
    expect(events.flatMap((event) => (event.type === 'written' ? [new TextDecoder().decode(event.data)] : []))).toEqual(
      ['C', 'A'],
    );
  });

  describe('editor save backpressure', () => {
    it('should persist only the active and latest pending model values', async () => {
      const first = Promise.withResolvers<void>();
      vi.mocked(proxy.writeFile).mockReturnValueOnce(first.promise).mockResolvedValue(undefined);

      const active = service.saveEditor('main.ts', new Uint8Array([1]));
      const replaced = service.saveEditor('main.ts', new Uint8Array([2]));
      const latest = service.saveEditor('main.ts', new Uint8Array([3]));
      expect(proxy.writeFile).toHaveBeenCalledOnce();

      first.resolve();
      await Promise.all([active, replaced, latest]);

      expect(vi.mocked(proxy.writeFile).mock.calls.map(([path, data]) => [path, data])).toEqual([
        ['/project/main.ts', new Uint8Array([1])],
        ['/project/main.ts', new Uint8Array([3])],
      ]);
    });

    it('should retain only one latest value while the follow-up save is active', async () => {
      const first = Promise.withResolvers<void>();
      const second = Promise.withResolvers<void>();
      vi.mocked(proxy.writeFile)
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise)
        .mockResolvedValue(undefined);

      const completion = service.saveEditor('main.ts', new Uint8Array([1]));
      void service.saveEditor('main.ts', new Uint8Array([2]));
      first.resolve();
      await vi.waitFor(() => {
        expect(proxy.writeFile).toHaveBeenCalledTimes(2);
      });

      void service.saveEditor('main.ts', new Uint8Array([3]));
      void service.saveEditor('main.ts', new Uint8Array([4]));
      second.resolve();
      await completion;

      expect(vi.mocked(proxy.writeFile).mock.calls.map(([, data]) => data)).toEqual([
        new Uint8Array([1]),
        new Uint8Array([2]),
        new Uint8Array([4]),
      ]);
    });

    it('should continue to the latest pending value after an active write rejects', async () => {
      const first = Promise.withResolvers<void>();
      vi.mocked(proxy.writeFile).mockReturnValueOnce(first.promise).mockResolvedValue(undefined);

      const completion = service.saveEditor('main.ts', new Uint8Array([1]));
      void service.saveEditor('main.ts', new Uint8Array([2]));
      first.reject(new Error('first failed'));
      await completion;

      expect(proxy.writeFile).toHaveBeenCalledTimes(2);
      expect(service.peek('main.ts')).toEqual(new Uint8Array([2]));
    });

    it('should save different paths independently', async () => {
      const first = Promise.withResolvers<void>();
      const second = Promise.withResolvers<void>();
      vi.mocked(proxy.writeFile).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

      const a = service.saveEditor('a.ts', new Uint8Array([1]));
      const b = service.saveEditor('b.ts', new Uint8Array([2]));
      expect(proxy.writeFile).toHaveBeenCalledTimes(2);
      first.resolve();
      second.resolve();
      await Promise.all([a, b]);
    });

    it('should drain accepted saves before moving and route edits during the move to the destination', async () => {
      const firstWrite = Promise.withResolvers<void>();
      const move = Promise.withResolvers<FileStat>();
      vi.mocked(proxy.writeFile).mockReturnValueOnce(firstWrite.promise).mockResolvedValue(undefined);
      vi.mocked(proxy.move).mockReturnValueOnce(move.promise);

      const active = service.saveEditor('main.ts', new Uint8Array([1]));
      void service.saveEditor('main.ts', new Uint8Array([2]));
      const moving = service.move('main.ts', 'renamed.ts');
      firstWrite.resolve();
      await vi.waitFor(() => {
        expect(proxy.move).toHaveBeenCalledOnce();
      });
      expect(proxy.writeFile).toHaveBeenCalledTimes(2);

      const duringMove = service.saveEditor('main.ts', new Uint8Array([3]));
      expect(proxy.writeFile).toHaveBeenCalledTimes(2);
      move.resolve({ type: 'file', size: 1, mtimeMs: 0, contentKind: 'binary' });
      await Promise.all([active, moving, duringMove]);

      expect(vi.mocked(proxy.writeFile).mock.calls[2]).toEqual(['/project/renamed.ts', new Uint8Array([3])]);
    });

    it('should discard pending and in-delete edits after a successful delete', async () => {
      const activeWrite = Promise.withResolvers<void>();
      const unlink = Promise.withResolvers<void>();
      vi.mocked(proxy.writeFile).mockReturnValueOnce(activeWrite.promise).mockResolvedValue(undefined);
      vi.mocked(proxy.unlink).mockReturnValueOnce(unlink.promise);

      const active = service.saveEditor('main.ts', new Uint8Array([1]));
      void service.saveEditor('main.ts', new Uint8Array([2]));
      const deleting = service.delete('main.ts', 'user');
      activeWrite.resolve();
      await vi.waitFor(() => {
        expect(proxy.unlink).toHaveBeenCalledOnce();
      });
      const duringDelete = service.saveEditor('main.ts', new Uint8Array([3]));
      unlink.resolve();
      await Promise.all([active, deleting, duringDelete]);

      expect(proxy.writeFile).toHaveBeenCalledOnce();
      expect(service.peekOutcome('main.ts')).toEqual({ kind: 'orphaned' });
    });

    it('should check each editor save against the bytes the editor was made from (RV-W5b F4)', async () => {
      vi.mocked(proxy.readFile).mockResolvedValueOnce(new Uint8Array([1]));
      await service.resolve('main.ts');

      await service.saveEditor('main.ts', new Uint8Array([2]));
      await service.saveEditor('main.ts', new Uint8Array([3]));

      expect(vi.mocked(proxy.writeFileChecked).mock.calls.map(([write]) => write.preconditions)).toEqual([
        [{ path: '/project/main.ts', expected: new Uint8Array([1]) }],
        [{ path: '/project/main.ts', expected: new Uint8Array([2]) }],
      ]);
    });

    it('should refuse an editor save over bytes it never loaded, and drop the value queued behind it (RV-W5b F4)', async () => {
      vi.mocked(proxy.readFile).mockResolvedValueOnce(new Uint8Array([1]));
      await service.resolve('main.ts');
      const check = Promise.withResolvers<Awaited<ReturnType<ComposedViewClient['writeFileChecked']>>>();
      vi.mocked(proxy.writeFileChecked).mockReturnValueOnce(check.promise);

      const saving = service.saveEditor('main.ts', new Uint8Array([2]));
      void service.saveEditor('main.ts', new Uint8Array([3]));
      /* An applied revision wrote [9] underneath. */
      check.resolve({ status: 'conflict', conflicts: [{ path: '/project/main.ts', actual: new Uint8Array([9]) }] });

      const refusal = await saving.then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(refusal).toBeInstanceOf(EditorSaveConflictError);
      expect((refusal as EditorSaveConflictError).base).toEqual(new Uint8Array([1]));
      expect(proxy.writeFileChecked).toHaveBeenCalledOnce();
      expect(proxy.writeFile).not.toHaveBeenCalled();
      expect(service.peekOutcome('main.ts')).toEqual({ kind: 'text', content: new Uint8Array([9]) });
    });

    it('should check a save against the bytes its model was made from, not the latest outcome (RV-W5b2 N3)', async () => {
      vi.mocked(proxy.readFile).mockResolvedValueOnce(new Uint8Array([9]));
      await service.resolve('main.ts');

      await service.saveEditor('main.ts', new Uint8Array([2]), new Uint8Array([1]));

      expect(vi.mocked(proxy.writeFileChecked).mock.calls[0]?.[0].preconditions).toEqual([
        { path: '/project/main.ts', expected: new Uint8Array([1]) },
      ]);
    });

    it('should check a save of a file it never read against its absence, never write it blind (RV-W5b2 N3)', async () => {
      await service.saveEditor('fresh.ts', new Uint8Array([1]));

      expect(vi.mocked(proxy.writeFileChecked).mock.calls[0]?.[0].preconditions).toEqual([
        { path: '/project/fresh.ts', expected: null },
      ]);
    });

    it('should refuse a save past the checked-write ceiling when the file changed since its model was made (RV-W5b2 N3)', async () => {
      const large = (fill: number): Uint8Array<ArrayBuffer> => new Uint8Array(5 * 1024 * 1024).fill(fill);
      vi.mocked(proxy.readFile).mockResolvedValueOnce(large(0x43));

      const refusal = await service.saveEditor('big.stl', large(0x42), large(0x41)).then(
        () => undefined,
        (error: unknown) => error,
      );

      expect(refusal).toBeInstanceOf(EditorSaveConflictError);
      expect(proxy.writeFile).not.toHaveBeenCalled();
      expect(proxy.writeFileChecked).not.toHaveBeenCalled();
    });

    it('should replay only the latest deferred edit when deletion fails', async () => {
      const activeWrite = Promise.withResolvers<void>();
      const unlink = Promise.withResolvers<void>();
      vi.mocked(proxy.writeFile).mockReturnValueOnce(activeWrite.promise).mockResolvedValue(undefined);
      vi.mocked(proxy.unlink).mockReturnValueOnce(unlink.promise);

      void service.saveEditor('main.ts', new Uint8Array([1]));
      void service.saveEditor('main.ts', new Uint8Array([2]));
      const deleting = service.delete('main.ts', 'user');
      activeWrite.resolve();
      await vi.waitFor(() => {
        expect(proxy.unlink).toHaveBeenCalledOnce();
      });
      const duringDelete = service.saveEditor('main.ts', new Uint8Array([3]));
      unlink.reject(new Error('delete failed'));
      await expect(deleting).rejects.toThrow('delete failed');
      await duringDelete;

      expect(vi.mocked(proxy.writeFile).mock.calls).toHaveLength(2);
      expect(vi.mocked(proxy.writeFile).mock.calls[1]).toEqual(['/project/main.ts', new Uint8Array([3])]);
    });
  });

  it('should await dependent records around a source move', async () => {
    const order: string[] = [];
    service.addFileOperationParticipant(async (operation) => {
      order.push(`prepare:${operation.kind}`);
      return {
        commit: async () => {
          order.push('commit');
        },
        rollback: async () => {
          order.push('rollback');
        },
      };
    });
    vi.mocked(proxy.move).mockImplementation(async () => {
      order.push('source');
      return { type: 'file', size: 0, mtimeMs: 0, contentKind: 'binary' };
    });

    await service.move('old.ts', 'new.ts');

    expect(order).toEqual(['prepare:move', 'source', 'commit']);
  });

  it('should restore the source and dependent records when move commit fails', async () => {
    const rollback = vi.fn(async () => undefined);
    service.addFileOperationParticipant(async () => ({
      commit: async () => {
        throw new Error('sidecar move failed');
      },
      rollback,
    }));

    await expect(service.move('old.ts', 'new.ts')).rejects.toThrow('sidecar move failed');

    expect(proxy.move).toHaveBeenNthCalledWith(1, '/project/old.ts', '/project/new.ts');
    expect(proxy.move).toHaveBeenNthCalledWith(2, '/project/new.ts', '/project/old.ts');
    expect(rollback).toHaveBeenCalledOnce();
  });

  it('should release the editor barrier when participant preparation rejects', async () => {
    service.addFileOperationParticipant(async () => {
      throw new Error('prepare failed');
    });

    await expect(service.delete('main.ts', 'user')).rejects.toThrow('prepare failed');
    await service.saveEditor('main.ts', new Uint8Array([7]));

    expect(proxy.unlink).not.toHaveBeenCalled();
    expect(proxy.writeFile).toHaveBeenCalledWith('/project/main.ts', new Uint8Array([7]));
  });

  it('should update cache on rename', async () => {
    const data = new Uint8Array([1, 2, 3]);
    vi.mocked(proxy.readFile).mockResolvedValue(data);

    await service.resolve('old.ts');
    await service.move('old.ts', 'new.ts');

    expect(service.has('old.ts')).toBe(false);
    expect(service.has('new.ts')).toBe(true);
    expect(service.peek('new.ts')).toEqual(data);
  });

  it('should apply every completed bulk move even when another edit fails', async () => {
    const committed: string[] = [];
    const rolledBack: string[] = [];
    service.addFileOperationParticipant(async (operation) => {
      if (operation.kind !== 'move') {
        return undefined;
      }
      const label = `${operation.oldPath}->${operation.newPath}`;
      return {
        commit: async () => {
          committed.push(label);
        },
        rollback: async () => {
          rolledBack.push(label);
        },
      };
    });
    const sourceBytes = new Map([
      ['/project/a.ts', new Uint8Array([1])],
      ['/project/b.ts', new Uint8Array([2])],
      ['/project/c.ts', new Uint8Array([3])],
    ]);
    vi.mocked(proxy.readFile).mockImplementation(async (path) => sourceBytes.get(path)!);
    await Promise.all(['a.ts', 'b.ts', 'c.ts'].map(async (path) => service.resolve(path)));
    vi.mocked(proxy.bulkMove).mockResolvedValue({
      moved: [
        {
          edit: { source: '/project/a.ts', target: '/project/dst/a.ts' },
          stat: { type: 'file', size: 1, mtimeMs: 0, contentKind: 'binary' },
        },
        {
          edit: { source: '/project/c.ts', target: '/project/dst/c.ts' },
          stat: { type: 'file', size: 1, mtimeMs: 0, contentKind: 'binary' },
        },
      ],
      failed: [
        {
          edit: { source: '/project/b.ts', target: '/project/dst/b.ts' },
          error: new WorkspaceMutationError('NAME_EXISTS', '/project/dst/b.ts'),
        },
      ],
    });

    const result = await service.bulkMove([
      { source: 'a.ts', target: 'dst/a.ts' },
      { source: 'b.ts', target: 'dst/b.ts' },
      { source: 'c.ts', target: 'dst/c.ts' },
    ]);

    expect(result.moved).toHaveLength(2);
    expect(service.peek('a.ts')).toBeUndefined();
    expect(service.peek('dst/a.ts')).toEqual(new Uint8Array([1]));
    expect(service.peek('b.ts')).toEqual(new Uint8Array([2]));
    expect(service.peek('dst/b.ts')).toBeUndefined();
    expect(service.peek('c.ts')).toBeUndefined();
    expect(service.peek('dst/c.ts')).toEqual(new Uint8Array([3]));
    expect(committed).toEqual(['a.ts->dst/a.ts', 'c.ts->dst/c.ts']);
    expect(rolledBack).toEqual(['b.ts->dst/b.ts']);
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
    const written = vi.mocked(proxy.writeFiles).mock.calls[0]![0];
    const sentA = written['/project/a.ts']?.content;
    const sentB = written['/project/b.ts']?.content;
    expect(sentA).toEqual(new Uint8Array([1, 2]));
    expect(sentB).toEqual(new Uint8Array([3, 4]));
    expect(sentA).not.toBe(file1);
    expect(sentB).not.toBe(file2);
    expect(sentA?.buffer).not.toBe(file1.buffer);
    expect(sentB?.buffer).not.toBe(file2.buffer);

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

  it('should duplicate a file and emit a fileCopied event with the target path', async () => {
    const events: ContentChangeEvent[] = [];
    service.onDidContentChange((event) => {
      events.push(event);
    });
    const source = new Uint8Array([9, 8, 7]);
    vi.mocked(proxy.readFile).mockResolvedValue(source);
    await service.resolve('src/main.ts');

    await service.duplicate('src/main.ts', 'src/main-copy.ts');

    expect(proxy.writeFile).toHaveBeenCalledOnce();
    const [path, sent] = vi.mocked(proxy.writeFile).mock.calls[0] as [string, Uint8Array<ArrayBuffer>];
    expect(path).toBe('/project/src/main-copy.ts');
    expect(sent).toEqual(source);
    expect(sent).not.toBe(source);
    expect(events).toContainEqual({ type: 'fileCopied', sourcePath: 'src/main.ts', targetPath: 'src/main-copy.ts' });
    expect(service.peek('src/main-copy.ts')).toEqual(source);
  });

  it('should call proxy.getZippedDirectory for getZippedDirectory', async () => {
    const blob = new Blob(['zip']);
    vi.mocked(proxy.getZippedDirectory).mockResolvedValue(blob);

    const result = await service.getZippedDirectory('');

    expect(proxy.getZippedDirectory).toHaveBeenCalledWith('/project', undefined);
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
      expect(service.peek('mystery.dat')?.byteLength).toBe(binaryBytes.byteLength);
    });

    it('should produce too-large before binary when bytes exceed the open limit', async () => {
      const { service: tinyService, proxy: tinyProxy } = createHarness({ proxy, openSizeBytes: 2 });
      vi.mocked(tinyProxy.readFile).mockResolvedValue(new Uint8Array([0x00, 0x01, 0x02]));

      const result = await tinyService.resolve('large.png');

      expect(result).toEqual({ kind: 'too-large', size: 3, limit: 2 });
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
      proxy: ComposedViewClient;
      emitFileChanged: (event: ChangeEvent) => void;
    } {
      const buffer = new SharedArrayBuffer(16 * 1024 * 1024);
      const pool = new SharedPool(buffer, { maxEntries: 128 });
      const mockProxy = createMockProxy();
      const listen = vi.fn().mockReturnValue(vi.fn());
      const paths = new WorkspacePathResolver('/project');
      const channel = new WorkerChangeChannel({ transport: { listen } });
      const refreshGuard = new RefreshGenerationGuard();
      const svc = new FileContentService({
        proxy: mockProxy,
        paths,
        channel,
        refreshGuard,
        filePool: pool,
        openSizeBytes: options?.openSizeBytes ?? 50 * 1024 * 1024,
      });
      return {
        service: svc,
        pool,
        proxy: mockProxy,
        emitFileChanged: (event) => {
          (listen.mock.calls[0]![1] as (data: unknown) => void)(event);
        },
      };
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
      expect(svc.peek('mystery.dat')).toEqual(binaryBytes);
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

    it('should bypass stale pooled bytes when a worker invalidation requests an authoritative reread', async () => {
      const { service: svc, pool, proxy: mockProxy, emitFileChanged: emit } = createPoolService();
      pool.store('/project/main.ts', encoder.encode('stale'));
      await svc.resolve('main.ts');
      vi.mocked(mockProxy.readFile).mockResolvedValue(encoder.encode('fresh'));

      emit({ type: 'directoryChanged', path: '', backend: 'webaccess' });

      await vi.waitFor(() => {
        const outcome = svc.peekOutcome('main.ts');
        expect(outcome.kind).toBe('text');
        if (outcome.kind === 'text') {
          expect(new TextDecoder().decode(outcome.content)).toBe('fresh');
        }
      });
      expect(mockProxy.readFile).toHaveBeenCalledWith('/project/main.ts');
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

    it('should treat separately allocated equal text bytes as the same outcome', async () => {
      vi.mocked(proxy.readFile).mockResolvedValueOnce(new Uint8Array([65, 66]));
      await service.resolve('main.ts');
      const handler = vi.fn<(event: OutcomeChangeEvent) => void>();
      service.onDidChangeOutcome(handler);
      vi.mocked(proxy.readFile).mockResolvedValueOnce(new Uint8Array([65, 66]));

      emitFileChanged(fileWritten('main.ts'));
      await vi.waitFor(() => {
        expect(proxy.readFile).toHaveBeenCalledTimes(2);
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should retain the binary outcome for separately allocated equal bytes', async () => {
      vi.mocked(proxy.readFile).mockImplementation(async () => new Uint8Array([0, 1, 2]));
      await service.resolve('asset.bin');
      const first = service.peekOutcome('asset.bin');
      const handler = vi.fn<(event: OutcomeChangeEvent) => void>();
      service.onDidChangeOutcome(handler);
      const digest = vi.spyOn(hash, 'sha256Bytes');
      try {
        emitFileChanged(fileWritten('asset.bin'));
        await vi.waitFor(() => {
          expect(digest).toHaveBeenCalledOnce();
        });
        await digest.mock.results[0]!.value;
        await Promise.resolve();

        const second = service.peekOutcome('asset.bin');
        expect(second).toBe(first);
        expect(handler).not.toHaveBeenCalled();
        expect(await service.resolve('asset.bin')).toBe(first);
      } finally {
        digest.mockRestore();
      }
    });

    it('should retain an unchanged binary outcome across broad refreshes', async () => {
      const bytes = new Uint8Array([0, 1, 2]);
      vi.mocked(proxy.readFile).mockImplementation(async () => new Uint8Array(bytes));
      const first = await service.resolve('asset.bin');
      const handler = vi.fn<(event: OutcomeChangeEvent) => void>();
      service.onDidChangeOutcome(handler);
      const digest = vi.spyOn(hash, 'sha256Bytes');
      try {
        emitFileChanged({ type: 'directoryChanged', path: '', backend: 'indexeddb' });
        await vi.waitFor(() => {
          expect(digest).toHaveBeenCalledOnce();
        });
        await digest.mock.results[0]!.value;
        await Promise.resolve();
        expect(service.peekOutcome('asset.bin')).toBe(first);
        expect(handler).not.toHaveBeenCalled();

        emitFileChanged({ type: 'backendChanged', backend: 'opfs' });
        await vi.waitFor(() => {
          expect(digest).toHaveBeenCalledTimes(2);
        });
        await digest.mock.results[1]!.value;
        await Promise.resolve();

        expect(service.peekOutcome('asset.bin')).toBe(first);
        expect(handler).not.toHaveBeenCalled();
      } finally {
        digest.mockRestore();
      }
    });

    it('should publish a changed binary tail after the same 512-byte head and size', async () => {
      const firstBytes = new Uint8Array(1024);
      const changedBytes = new Uint8Array(firstBytes);
      changedBytes[900] = 1;
      vi.mocked(proxy.readFile).mockResolvedValueOnce(firstBytes).mockResolvedValueOnce(changedBytes);
      const first = await service.resolve('asset.bin');
      const handler = vi.fn<(event: OutcomeChangeEvent) => void>();
      service.onDidChangeOutcome(handler);

      emitFileChanged(fileWritten('asset.bin'));
      await vi.waitFor(() => {
        expect(handler).toHaveBeenCalledOnce();
      });

      const second = service.peekOutcome('asset.bin');
      expect(first.kind).toBe('binary');
      expect(second.kind).toBe('binary');
      if (first.kind === 'binary' && second.kind === 'binary') {
        expect(second.head).toEqual(first.head);
        expect(second.size).toBe(first.size);
        expect(second.revision).toBeGreaterThan(first.revision);
      }
    });

    it('should discard an older binary refresh after its delayed digest completes', async () => {
      vi.mocked(proxy.readFile).mockResolvedValueOnce(new Uint8Array([0, 1, 0]));
      await service.resolve('asset.bin');
      const older = new Uint8Array([0, 1, 1]);
      const newer = new Uint8Array([0, 1, 2]);
      vi.mocked(proxy.readFile).mockResolvedValueOnce(older).mockResolvedValueOnce(newer);
      const olderDigest = Promise.withResolvers<string>();
      const actualHash = hash.sha256Bytes;
      const digest = vi
        .spyOn(hash, 'sha256Bytes')
        .mockImplementationOnce(async () => olderDigest.promise)
        .mockImplementation(actualHash);
      const handler = vi.fn<(event: OutcomeChangeEvent) => void>();
      service.onDidChangeOutcome(handler);
      try {
        emitFileChanged(fileWritten('asset.bin'));
        await vi.waitFor(() => {
          expect(digest).toHaveBeenCalledOnce();
        });
        emitFileChanged(fileWritten('asset.bin'));
        expect(proxy.readFile).toHaveBeenCalledTimes(2);
        olderDigest.resolve(await actualHash(older));
        await digest.mock.results[0]!.value;
        await vi.waitFor(() => {
          const result = service.peekOutcome('asset.bin');
          expect(result.kind).toBe('binary');
          if (result.kind === 'binary') {
            expect(result.head[2]).toBe(2);
          }
        });
        const latest = service.peekOutcome('asset.bin');

        expect(service.peekOutcome('asset.bin')).toBe(latest);
        expect(handler).toHaveBeenCalledOnce();
      } finally {
        digest.mockRestore();
      }
    });

    it('should publish orphan and recreated binary outcomes even when the bytes match', async () => {
      const bytes = new Uint8Array([0, 1, 2]);
      vi.mocked(proxy.readFile).mockResolvedValue(bytes);
      const first = await service.resolve('asset.bin');
      const handler = vi.fn<(event: OutcomeChangeEvent) => void>();
      service.onDidChangeOutcome(handler);

      emitFileChanged({ type: 'fileDeleted', path: 'asset.bin', backend: 'indexeddb' });
      expect(service.peekOutcome('asset.bin').kind).toBe('orphaned');
      emitFileChanged(fileWritten('asset.bin'));
      await vi.waitFor(() => {
        expect(handler).toHaveBeenCalledTimes(2);
      });
      expect(service.peekOutcome('asset.bin').kind).toBe('binary');
      expect(service.peekOutcome('asset.bin')).not.toBe(first);
    });

    it('should keep the binary outcome on equal local single and batch writes', async () => {
      const bytes = new Uint8Array([0, 1, 2]);
      vi.mocked(proxy.readFile).mockResolvedValue(bytes);
      const first = await service.resolve('asset.bin');
      const handler = vi.fn<(event: OutcomeChangeEvent) => void>();
      service.onDidChangeOutcome(handler);

      await service.write('asset.bin', new Uint8Array(bytes), 'machine');
      await service.writeFiles({ 'asset.bin': { content: new Uint8Array(bytes) } }, 'machine');

      expect(service.peekOutcome('asset.bin')).toBe(first);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should classify a changed local binary write and preserve editor text intent', async () => {
      const bytes = new Uint8Array([0, 1, 2]);
      await service.write('asset.bin', bytes, 'machine');
      const first = service.peekOutcome('asset.bin');
      expect(first.kind).toBe('binary');

      const changed = new Uint8Array([0, 1, 3]);
      await service.writeFiles({ 'asset.bin': { content: changed } }, 'machine');
      const afterBatch = service.peekOutcome('asset.bin');
      expect(afterBatch.kind).toBe('binary');
      if (first.kind === 'binary' && afterBatch.kind === 'binary') {
        expect(afterBatch.revision).toBeGreaterThan(first.revision);
      }

      await service.saveEditor('main.ts', new Uint8Array([0, 65]));
      expect(service.peekOutcome('main.ts').kind).toBe('text');
    });

    it('should apply the open size limit to local binary writes', async () => {
      const { service: tinyService } = createHarness({ openSizeBytes: 2 });
      await tinyService.write('asset.bin', new Uint8Array([0, 1, 2]), 'machine');
      expect(tinyService.peekOutcome('asset.bin')).toEqual({ kind: 'too-large', size: 3, limit: 2 });
    });

    it('should publish binary outcomes before write facts in commit order when an earlier digest is slow', async () => {
      const firstBytes = new Uint8Array([0, 1, 2]);
      const secondBytes = new Uint8Array([0, 1, 3]);
      const firstDigest = Promise.withResolvers<string>();
      const actualHash = hash.sha256Bytes;
      const digest = vi
        .spyOn(hash, 'sha256Bytes')
        .mockImplementationOnce(async () => firstDigest.promise)
        .mockImplementation(actualHash);
      const written: number[] = [];
      const visible: FileContentResult[] = [];
      service.onDidContentChange((event) => {
        if (event.type === 'written') {
          written.push(event.data[2]!);
          visible.push(service.peekOutcome(event.path));
        }
      });
      try {
        const first = service.write('asset.bin', firstBytes, 'machine');
        await vi.waitFor(() => {
          expect(digest).toHaveBeenCalledOnce();
        });
        const second = service.write('asset.bin', secondBytes, 'machine');
        await second;

        expect(written).toEqual([3]);
        expect(visible[0]?.kind).toBe('binary');
        const secondOutcome = service.peekOutcome('asset.bin');

        firstDigest.resolve(await actualHash(firstBytes));
        await first;
        expect(written).toEqual([3, 2]);
        expect(visible[1]?.kind).toBe('binary');
        expect(visible[0]).toBe(secondOutcome);
        expect(visible[1]).toBe(service.peekOutcome('asset.bin'));
      } finally {
        digest.mockRestore();
      }
    });

    it('should expose the classified binary outcome to a synchronous batch subscriber', async () => {
      const snapshots: FileContentResult[] = [];
      service.onDidContentChange((event) => {
        if (event.type === 'batchWritten') {
          snapshots.push(service.peekOutcome('asset.bin'));
        }
      });

      await service.writeFiles({ 'asset.bin': { content: new Uint8Array([0, 1, 2]) } }, 'machine');

      expect(snapshots).toHaveLength(1);
      expect(snapshots[0]?.kind).toBe('binary');
      expect(service.peek('asset.bin')).toEqual(new Uint8Array([0, 1, 2]));
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

  describe('readRawBytes', () => {
    it('should reuse classified binary bytes without another provider read and preserve copy isolation', async () => {
      const bytes = new Uint8Array(5 * 1024 * 1024);
      bytes[1] = 1;
      vi.mocked(proxy.stat).mockResolvedValue({
        type: 'file',
        size: bytes.byteLength,
        mtimeMs: 0,
        contentKind: 'binary',
      });
      vi.mocked(proxy.readFile).mockResolvedValue(bytes);
      const classified = await service.resolve('preview.png');
      expect(classified.kind).toBe('binary');
      const raw = await service.readRawBytes('preview.png');
      raw[1] = 99;
      expect(await service.resolve('preview.png')).toBe(classified);
      const next = await service.readRawBytes('preview.png');
      expect(next.byteLength).toBe(bytes.byteLength);
      expect(next[1]).toBe(1);
      expect(next).not.toBe(raw);
      expect(proxy.readFile).toHaveBeenCalledTimes(1);
      expect(proxy.stat).toHaveBeenCalled();
    });

    it('should return owned text bytes without changing text resolution semantics', async () => {
      const bytes = new TextEncoder().encode('hello');
      vi.mocked(proxy.stat).mockResolvedValue({
        type: 'file',
        size: bytes.byteLength,
        mtimeMs: 0,
        contentKind: 'text',
        lineCount: 1,
      });
      vi.mocked(proxy.readFile).mockResolvedValue(bytes);

      const result = await service.readRawBytes('notes.txt');

      expect(new TextDecoder().decode(result)).toBe('hello');
      expect(result).not.toBe(bytes);
    });

    it('should stat before reading and return owned binary bytes', async () => {
      const bytes = new Uint8Array([0, 1, 2]);
      vi.mocked(proxy.stat).mockResolvedValue({
        type: 'file',
        size: bytes.byteLength,
        mtimeMs: 0,
        contentKind: 'binary',
      });
      vi.mocked(proxy.readFile).mockResolvedValue(bytes);

      const result = await service.readRawBytes('preview.png');

      expect(proxy.stat).toHaveBeenCalledWith('/project/preview.png');
      expect(proxy.readFile).toHaveBeenCalledWith('/project/preview.png');
      expect(result).toEqual(bytes);
      expect(result).not.toBe(bytes);
    });

    it('should reject an oversized resource before reading it', async () => {
      vi.mocked(proxy.stat).mockResolvedValue({ type: 'file', size: 10, mtimeMs: 0, contentKind: 'binary' });

      await expect(service.readRawBytes('preview.png', { sizeLimit: 5 })).rejects.toBeInstanceOf(FileTooLargeError);
      expect(proxy.readFile).not.toHaveBeenCalled();
    });

    it('should map missing resources to FileNotFoundError', async () => {
      vi.mocked(proxy.stat).mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));

      await expect(service.readRawBytes('missing.png')).rejects.toBeInstanceOf(FileNotFoundError);
    });

    it('should enforce workspace scope before touching the proxy', async () => {
      await expect(service.readRawBytes('../outside.png')).rejects.toBeInstanceOf(WorkspaceScopeViolationError);
      expect(proxy.stat).not.toHaveBeenCalled();
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
        vi.mocked(proxy.readFile).mockImplementation(async (absolutePath: string) => {
          if (absolutePath === '/project/old.ts') {
            throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
          }
          return new Uint8Array([3]);
        });
        emitFileChanged({
          type: 'fileRenamed',
          oldPath: 'old.ts',
          newPath: 'new.ts',
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
        emitFileChanged({ type: 'directoryChanged', path: 'lib', backend: 'indexeddb' });
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
    it('should catch up before returning bytes when an unsubscribed first resolve becomes stale', async () => {
      const firstRead = Promise.withResolvers<Uint8Array<ArrayBuffer>>();
      vi.mocked(proxy.readFile)
        .mockReturnValueOnce(firstRead.promise)
        .mockResolvedValueOnce(new Uint8Array([2]));

      const resolving = service.resolveBytes('main.ts');
      await vi.waitFor(() => {
        expect(proxy.readFile).toHaveBeenCalledOnce();
      });
      emitFileChanged(fileWritten('main.ts'));
      firstRead.resolve(new Uint8Array([1]));

      await expect(resolving).resolves.toEqual(new Uint8Array([2]));
      expectTextContent(service.peekOutcome('main.ts'), new Uint8Array([2]));
      await expect(service.resolveBytes('main.ts')).resolves.toEqual(new Uint8Array([2]));
    });

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
        await vi.advanceTimersByTimeAsync(0);
        expect(refreshReadCount).toBe(1);
        emitFileChanged(fileWritten('main.ts'));
        expect(refreshReadCount).toBe(1);
        expectTextContent(service.peekOutcome('main.ts'), new Uint8Array([1]));
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

    it('should not let a slow external reread replace a newer successful local write', async () => {
      vi.mocked(proxy.readFile).mockResolvedValueOnce(new Uint8Array([65]));
      await service.resolve('main.ts');
      const slowRead = Promise.withResolvers<Uint8Array<ArrayBuffer>>();
      vi.mocked(proxy.readFile).mockImplementationOnce(async () => slowRead.promise);
      emitFileChanged(fileWritten('main.ts'));
      await vi.waitFor(() => {
        expect(proxy.readFile).toHaveBeenCalledTimes(2);
      });

      await service.write('main.ts', new Uint8Array([66]), 'editor');
      slowRead.resolve(new Uint8Array([65]));
      await slowRead.promise;
      await Promise.resolve();
      await vi.waitFor(() => {
        expectTextContent(service.peekOutcome('main.ts'), new Uint8Array([66]));
      });
    });

    it.each([Object.assign(new Error('missing'), { code: 'ENOENT' }), new Error('read failed')])(
      'should suppress a stale refresh failure after a successful local write',
      async (failure) => {
        vi.mocked(proxy.readFile).mockResolvedValueOnce(new Uint8Array([65]));
        await service.resolve('main.ts');
        const slowRead = Promise.withResolvers<Uint8Array<ArrayBuffer>>();
        vi.mocked(proxy.readFile).mockImplementationOnce(async () => slowRead.promise);
        emitFileChanged(fileWritten('main.ts'));
        await vi.waitFor(() => {
          expect(proxy.readFile).toHaveBeenCalledTimes(2);
        });

        await service.write('main.ts', new Uint8Array([66]), 'editor');
        slowRead.reject(failure);
        await slowRead.promise.catch(() => undefined);
        await Promise.resolve();
        await vi.waitFor(() => {
          expectTextContent(service.peekOutcome('main.ts'), new Uint8Array([66]));
        });
        expect(service.isOrphaned('main.ts')).toBe(false);
      },
    );
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
      emitFileChanged({ type: 'fileWritten', path: 'main.ts', backend: 'indexeddb' });

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
      emitFileChanged({ type: 'fileWritten', path: 'main.ts', backend: 'indexeddb' });

      await vi.waitFor(() => {
        expectTextContent(service.peekOutcome('main.ts'), after);
      });
      expect(proxy.readFile).toHaveBeenCalledTimes(2);
    });

    it('should mark the path as orphaned and publish an orphaned outcome on fileDeleted', async () => {
      vi.mocked(proxy.readFile).mockResolvedValue(new Uint8Array([1]));
      await service.resolve('main.ts');

      emitFileChanged({ type: 'fileDeleted', path: 'main.ts', backend: 'indexeddb' });

      expect(service.has('main.ts')).toBe(false);
      expect(service.isOrphaned('main.ts')).toBe(true);
      expect(service.peekOutcome('main.ts')).toEqual({ kind: 'orphaned' });
    });

    it('should orphan old path and refresh new path on fileRenamed', async () => {
      vi.mocked(proxy.readFile).mockResolvedValueOnce(new Uint8Array([1]));
      await service.resolve('old.ts');
      vi.mocked(proxy.readFile).mockResolvedValueOnce(new Uint8Array([2]));
      await service.resolve('new.ts');

      vi.mocked(proxy.readFile).mockImplementation(async (absolutePath: string) => {
        if (absolutePath === '/project/old.ts') {
          throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        }
        return new Uint8Array([3]);
      });
      emitFileChanged({
        type: 'fileRenamed',
        oldPath: 'old.ts',
        newPath: 'new.ts',
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

    it('re-reads an open file an applied revision renames aside and back, never publishing orphaned (RV-W5b2 R2-2)', async () => {
      vi.mocked(proxy.readFile).mockResolvedValueOnce(new Uint8Array([1]));
      await service.resolve('main.ts');
      const recorded = recordOutcomeKinds(service, 'main.ts');
      try {
        recorded.kinds.length = 0;
        vi.mocked(proxy.readFile).mockResolvedValue(new Uint8Array([2]));
        /* `applyTree`'s pair, delivered in one coalesced batch after both renames happened. */
        emitFileChanged({ type: 'fileRenamed', oldPath: 'main.ts', newPath: 'main.ts.backup', backend: 'indexeddb' });
        emitFileChanged({ type: 'fileRenamed', oldPath: 'main.ts.staged', newPath: 'main.ts', backend: 'indexeddb' });

        await vi.waitFor(() => {
          expectTextContent(service.peekOutcome('main.ts'), new Uint8Array([2]));
        });
        expect(recorded.kinds).not.toContain('orphaned');
        expect(service.isOrphaned('main.ts')).toBe(false);
      } finally {
        recorded.unsubscribe();
      }
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
      emitFileChanged({ type: 'directoryChanged', path: 'lib', backend: 'indexeddb' });

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

    it('should emit a directoryCreated ContentChangeEvent when the worker reports a directoryCreated change', async () => {
      const handler = vi.fn();
      service.onDidContentChange(handler);

      emitFileChanged({ type: 'directoryCreated', path: 'newdir', backend: 'indexeddb' });

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: 'directoryCreated', path: 'newdir' }));
    });

    it('should emit a directoryDeleted ContentChangeEvent when the worker reports a directoryDeleted change', async () => {
      const handler = vi.fn();
      service.onDidContentChange(handler);

      emitFileChanged({ type: 'directoryDeleted', path: 'old', backend: 'indexeddb' });

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: 'directoryDeleted', path: 'old' }));
    });

    it('should emit a directoryRenamed ContentChangeEvent when the worker reports a directoryRenamed change', async () => {
      const handler = vi.fn();
      service.onDidContentChange(handler);

      emitFileChanged({
        type: 'directoryRenamed',
        oldPath: 'old',
        newPath: 'new',
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

  describe('getZippedDirectory', () => {
    it('should forward the export options bag to the authority', async () => {
      const harness = createHarness({ workspaceRoot: '/projects/p1' });

      await harness.service.getZippedDirectory('', { versionedOnly: true });

      expect(harness.proxy.getZippedDirectory).toHaveBeenCalledWith('/projects/p1', { versionedOnly: true });
      harness.disposeChannel();
    });

    it('should reject an absolute alias of its own root before touching the proxy', async () => {
      const harness = createHarness({ workspaceRoot: '/projects/p1' });

      await expect(harness.service.getZippedDirectory('/projects/p1')).rejects.toBeInstanceOf(
        WorkspaceScopeViolationError,
      );
      expect(harness.proxy.getZippedDirectory).not.toHaveBeenCalled();
      harness.disposeChannel();
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

    it('createDirectory rejects foreign-absolute keys with WorkspaceScopeViolationError before touching the proxy', async () => {
      const harness = createHarness({ workspaceRoot: '/' });

      await expect(harness.service.createDirectory('/projects/x/new-dir', { recursive: true })).rejects.toBeInstanceOf(
        WorkspaceScopeViolationError,
      );
      expect(harness.proxy.mkdir).not.toHaveBeenCalled();
      harness.disposeChannel();
    });

    it('deleteDirectory rejects foreign-absolute keys with WorkspaceScopeViolationError before touching the proxy', async () => {
      const harness = createHarness({ workspaceRoot: '/' });

      await expect(harness.service.deleteDirectory('/projects/x/old-dir', { recursive: true })).rejects.toBeInstanceOf(
        WorkspaceScopeViolationError,
      );
      expect(harness.proxy.rmdir).not.toHaveBeenCalled();
      harness.disposeChannel();
    });

    it('move rejects foreign-absolute keys with WorkspaceScopeViolationError before touching the proxy', async () => {
      const harness = createHarness({ workspaceRoot: '/projects/abc' });

      await expect(harness.service.move('main.ts', '/projects/other/main.ts')).rejects.toBeInstanceOf(
        WorkspaceScopeViolationError,
      );
      expect(harness.proxy.move).not.toHaveBeenCalled();
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

    it('writeFiles preserves canonical rooted keys in batchWritten', async () => {
      const harness = createHarness({ workspaceRoot: '/projects/abc' });
      const events: ContentChangeEvent[] = [];
      harness.service.onDidContentChange((event) => {
        events.push(event);
      });

      const rootFileKey = 'main.ts';
      const relativeKey = 'lib/util.ts';
      await harness.service.writeFiles(
        {
          [rootFileKey]: { content: new Uint8Array([1, 2, 3]) },
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

    it('write preserves canonical rooted keys in written events', async () => {
      const harness = createHarness({ workspaceRoot: '/projects/abc' });
      const events: ContentChangeEvent[] = [];
      harness.service.onDidContentChange((event) => {
        events.push(event);
      });

      await harness.service.write('main.ts', new Uint8Array([1, 2, 3]), 'machine');

      const written = events.find((event) => event.type === 'written');
      expect(written).toBeDefined();
      if (written?.type === 'written') {
        expect(written.path).toBe('main.ts');
      }
      expect(harness.service.has('main.ts')).toBe(true);
      expect(harness.service.has('/projects/abc/main.ts')).toBe(false);
      harness.disposeChannel();
    });

    it('createDirectory preserves canonical rooted keys in directoryCreated events', async () => {
      const harness = createHarness({ workspaceRoot: '/projects/abc' });
      const events: ContentChangeEvent[] = [];
      harness.service.onDidContentChange((event) => {
        events.push(event);
      });

      await harness.service.createDirectory('src/new-dir', { recursive: true });

      expect(harness.proxy.mkdir).toHaveBeenCalledWith('/projects/abc/src/new-dir', { recursive: true });
      const created = events.find((event) => event.type === 'directoryCreated');
      expect(created).toEqual({ type: 'directoryCreated', path: 'src/new-dir' });
      harness.disposeChannel();
    });

    it('deleteDirectory preserves canonical rooted keys in directoryDeleted events', async () => {
      const harness = createHarness({ workspaceRoot: '/projects/abc' });
      const events: ContentChangeEvent[] = [];
      harness.service.onDidContentChange((event) => {
        events.push(event);
      });

      await harness.service.deleteDirectory('src/old-dir', { recursive: true });

      expect(harness.proxy.rmdir).toHaveBeenCalledWith('/projects/abc/src/old-dir', { recursive: true });
      const deleted = events.find((event) => event.type === 'directoryDeleted');
      expect(deleted).toEqual({ type: 'directoryDeleted', path: 'src/old-dir' });
      harness.disposeChannel();
    });

    it('getZippedDirectory resolves workspace-relative keys before proxying', async () => {
      const harness = createHarness({ workspaceRoot: '/projects/abc' });
      const blob = new Blob();
      vi.mocked(harness.proxy.getZippedDirectory).mockResolvedValue(blob);

      const result = await harness.service.getZippedDirectory('src/assets');

      expect(result).toBe(blob);
      expect(harness.proxy.getZippedDirectory).toHaveBeenCalledWith('/projects/abc/src/assets', undefined);
      harness.disposeChannel();
    });

    it('delete preserves canonical rooted keys in deleted events', async () => {
      const harness = createHarness({ workspaceRoot: '/projects/abc' });
      const events: ContentChangeEvent[] = [];
      harness.service.onDidContentChange((event) => {
        events.push(event);
      });

      await harness.service.delete('main.ts', 'machine');

      const deleted = events.find((event) => event.type === 'deleted');
      expect(deleted).toBeDefined();
      if (deleted?.type === 'deleted') {
        expect(deleted.path).toBe('main.ts');
      }
      harness.disposeChannel();
    });

    it('rename preserves canonical rooted keys in renamed events', async () => {
      const harness = createHarness({ workspaceRoot: '/projects/abc' });
      const events: ContentChangeEvent[] = [];
      harness.service.onDidContentChange((event) => {
        events.push(event);
      });

      await harness.service.move('old.ts', 'new.ts');

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

describe('FileContentService over the composed view (north star W2)', () => {
  const skillContents = '---\nname: cad-replicad\n---\n';
  const skillBytes = new TextEncoder().encode(skillContents);
  const skillsRoot = '.agents/skills';
  const skillPath = `${skillsRoot}/cad-replicad/SKILL.md`;
  const identity = 'skill:cad-replicad@1.0.0#fingerprint';

  const overlay = (): ComposedViewOverlay => {
    const nodes = new Map<string, 'dir' | 'file'>([
      ['', 'dir'],
      ['.agents', 'dir'],
      [skillsRoot, 'dir'],
      [`${skillsRoot}/cad-replicad`, 'dir'],
      [skillPath, 'file'],
    ]);
    const children = new Map<string, readonly string[]>([
      ['', ['.agents']],
      ['.agents', ['skills']],
      [skillsRoot, ['cad-replicad']],
      [`${skillsRoot}/cad-replicad`, ['SKILL.md']],
    ]);
    return {
      root: skillsRoot,
      source: 'system-skills',
      unit: (path) =>
        path.startsWith(`${skillsRoot}/`) && path.slice(skillsRoot.length + 1).split('/')[0] === 'cad-replicad'
          ? { root: `${skillsRoot}/cad-replicad`, identity }
          : undefined,
      node: (path) => {
        const kind = nodes.get(path);
        if (kind === undefined) {
          return undefined;
        }
        return kind === 'dir'
          ? { type: 'dir', children: children.get(path) ?? [] }
          : { type: 'file', size: skillBytes.byteLength, contentKind: 'text', lineCount: 3 };
      },
      read: async () => skillBytes,
    };
  };

  const composedHarness = async (): Promise<FileContentHarness & { provider: MemoryProvider }> => {
    const provider = new MemoryProvider();
    await provider.writeFile('main.ts', 'export {};\n');
    const proxy = createComposedViewClient({
      workspace: mock<WorkspaceAuthorityClient>(),
      /* No test here reads a dependency; the mount's own view is wired so the
       * composition is the production one (W11). */
      dependencies: mock<ComposedViewProxy>(),
      /* The rooted connection also archives a subtree (charter D2) and serves the
       * mutation pipeline's porcelain (D4); this harness reads and writes single
       * files, which the view itself answers, so the rest is not stubbed. */
      view: Object.assign(
        composeView({ filesystem: provider }, { consumer: 'user', overlays: [overlay()], policy: tauPathPolicy }),
        {
          archive: vi.fn<ComposedViewProxy['archive']>(),
          search: vi.fn<ComposedViewProxy['search']>(),
          statTree: vi.fn<ComposedViewProxy['statTree']>(),
        },
      ) as unknown as ComposedViewProxy,
      paths: new WorkspacePathResolver('/projects/abc'),
    });
    return { ...createHarness({ workspaceRoot: '/projects/abc', proxy }), provider };
  };

  /*
   * The content half of W0 pin 2 (W0 review F2): the bytes a chat's skill row
   * links to resolve through the same composition the agent's tools read, and
   * the entry says it is a read-only system skill.
   */
  it('should resolve a system skill file through the composed view as a read-only system-skills entry', async () => {
    const harness = await composedHarness();

    expect(new TextDecoder().decode(await harness.service.resolveBytes(skillPath))).toBe(skillContents);
    const stat = await harness.proxy.stat(`/projects/abc/${skillPath}`);
    expect(stat.provenance).toStrictEqual({
      source: 'system-skills',
      versioned: false,
      agentAccess: 'read-only',
      identity,
    });
    harness.disposeChannel();
  });

  it('should refuse a write to a system skill file before any worker call', async () => {
    const harness = await composedHarness();

    await expect(harness.service.write(skillPath, new Uint8Array([1]), 'user')).rejects.toMatchObject({
      code: 'EROFS',
    });
    harness.disposeChannel();
  });

  it('should keep the project half of the same view writable', async () => {
    const harness = await composedHarness();

    expect(new TextDecoder().decode(await harness.service.resolveBytes('main.ts'))).toBe('export {};\n');
    await harness.service.write('main.ts', new TextEncoder().encode('export const a = 1;\n'), 'user');
    /* The write lands on the view, on the same connection the reads use (charter
     * D12) — and since W11 the authority has no `writeFile` for it to land on. */
    await expect(harness.provider.readFile('main.ts', 'utf8')).resolves.toBe('export const a = 1;\n');
    harness.disposeChannel();
  });
});

describe('inactive content outcome budget', () => {
  it('should reuse a released selection and dispose its shared active watch with the content domain', async () => {
    const unsubscribeWatch = vi.fn();
    const watchReady = vi.fn<NonNullable<WorkerChangeChannelTransport['watchReady']>>().mockImplementation(() => ({
      ready: Promise.resolve(),
      closed: Promise.withResolvers<void>().promise,
      unsubscribe: unsubscribeWatch,
    }));
    const harness = createHarness({
      watchReady,
      cacheOptions: { maxEntries: 1, maxTotalBytes: 4, maxSingleFileBytes: 4 },
    });
    const selected = harness.service.observeContent('selected.txt');
    const initial = selected.acquire();
    let releaseCurrent = (): void => undefined;
    let releaseShared = (): void => undefined;
    try {
      await vi.waitFor(() => {
        expect(initial.getSnapshot().status).toBe('ready');
      });
      initial.release();
      expect(selected.activeLeaseCount).toBe(0);
      expect(unsubscribeWatch).toHaveBeenCalledOnce();
      const reselected = harness.service.observeContent('selected.txt');
      await harness.service.resolve('unrelated.txt');
      expect(harness.service.peekOutcome('selected.txt').kind).toBe('loading');
      expect(harness.service.observeContent('selected.txt')).toBe(reselected);
      expect(reselected).toBe(selected);
      watchReady.mockClear();
      unsubscribeWatch.mockClear();
      const current = reselected.acquire();
      releaseCurrent = current.release;
      const shared = harness.service.observeContent('selected.txt').acquire();
      releaseShared = shared.release;
      await vi.waitFor(() => {
        expect(current.getSnapshot().status).toBe('ready');
      });
      expect(shared.getSnapshot()).toBe(current.getSnapshot());
      expect(reselected.activeLeaseCount).toBe(2);
      expect(watchReady).toHaveBeenCalledOnce();
      current.release();
      expect(unsubscribeWatch).not.toHaveBeenCalled();
      harness.service.dispose();
      expect(unsubscribeWatch).toHaveBeenCalledOnce();
      expect(shared.getSnapshot().status).toBe('closed');
      expect(reselected.diagnostics.activeWatches).toBe(0);
    } finally {
      initial.release();
      releaseCurrent();
      releaseShared();
      harness.service.dispose();
      harness.disposeChannel();
    }
  });

  it('should ignore stale finalized identity metadata after the content domain replaces a source', () => {
    const callbacks: Array<(held: unknown) => void> = [];
    const registrations: unknown[] = [];
    const nativeRegistry = globalThis.FinalizationRegistry;
    class ControlledRegistry extends nativeRegistry<unknown> {
      public constructor(callback: (held: unknown) => void) {
        super(callback);
        callbacks.push(callback);
      }

      public override register(...args: Parameters<FinalizationRegistry<unknown>['register']>): void {
        registrations.push(args[1]);
        super.register(...args);
      }
    }
    vi.stubGlobal('FinalizationRegistry', ControlledRegistry);
    const harness = createHarness();
    try {
      const old = harness.service.observeContent('selected.txt');
      expect(registrations).toHaveLength(1);
      const stale = registrations[0];
      harness.service.reset('/replacement');
      const current = harness.service.observeContent('selected.txt');
      expect(current).not.toBe(old);
      expect(registrations).toHaveLength(2);
      callbacks[0]!(stale);
      expect(harness.service.observeContent('selected.txt')).toBe(current);
      expect(current.getSnapshot().status).toBe('registering');
    } finally {
      harness.service.dispose();
      harness.disposeChannel();
      vi.unstubAllGlobals();
    }
  });

  it.each(['before publication', 'after publication'] as const)(
    'should retain a selected content owner across unrelated publication before its first lease with subscription %s',
    async (subscriptionTiming) => {
      const closed = Promise.withResolvers<void>();
      const watchReady = vi.fn<NonNullable<WorkerChangeChannelTransport['watchReady']>>().mockReturnValue({
        ready: Promise.resolve(),
        closed: closed.promise,
        unsubscribe: vi.fn(),
      });
      const harness = createHarness({ watchReady });
      const selected = harness.service.observeContent('selected.txt');
      const notifiedStatuses: string[] = [];
      const notify = vi.fn(() => {
        notifiedStatuses.push(selected.getSnapshot().status);
      });
      let unsubscribe = (): void => undefined;
      if (subscriptionTiming === 'before publication') {
        unsubscribe = selected.subscribe(notify);
      }
      let release = (): void => undefined;
      try {
        expect(selected.activeLeaseCount).toBe(0);
        expect(watchReady).not.toHaveBeenCalled();
        await harness.service.resolve('unrelated.txt');
        expect(harness.service.peekOutcome('unrelated.txt').kind).toBe('text');
        if (subscriptionTiming === 'after publication') {
          unsubscribe = selected.subscribe(notify);
        }
        notify.mockClear();
        notifiedStatuses.length = 0;
        watchReady.mockClear();
        const lease = selected.acquire();
        release = lease.release;
        await vi.waitFor(() => {
          expect(lease.getSnapshot().status).toBe('ready');
        });
        expect.soft(harness.service.observeContent('selected.txt')).toBe(selected);
        expect.soft(notifiedStatuses).toContain('ready');
        expect.soft(watchReady).toHaveBeenCalledOnce();
        expect(harness.service.peekOutcome('selected.txt').kind).toBe('text');
        notify.mockClear();
        notifiedStatuses.length = 0;
        closed.resolve();
        await vi.waitFor(() => {
          expect(lease.getSnapshot().status).toBe('closed');
        });
        expect.soft(notifiedStatuses).toContain('closed');
        expect.soft(harness.service.peekOutcome('selected.txt').kind).toBe('error');
        expect(harness.service.peekOutcome('selected.txt', { retainValue: true }).kind).toBe('text');
      } finally {
        release();
        unsubscribe();
        harness.service.dispose();
        harness.disposeChannel();
      }
    },
  );

  it('should preserve the safe content base held by a selecting observation lease', async () => {
    const harness = createHarness({ cacheOptions: { maxEntries: 2, maxTotalBytes: 4, maxSingleFileBytes: 4 } });
    vi.mocked(harness.proxy.readFile).mockResolvedValue(new Uint8Array([65, 66]));
    const lease = harness.service.observeContent('active.ts').acquire();
    await vi.waitFor(() => {
      expect(lease.getSnapshot().status).toBe('ready');
    });
    await harness.service.resolve('old.ts');
    await harness.service.resolve('latest.ts');
    expect(harness.service.peekOutcome('active.ts').kind).toBe('text');
    lease.release();
    harness.service.dispose();
    harness.disposeChannel();
  });

  it('should evict inactive decoded bytes while preserving an active editor base', async () => {
    const harness = createHarness({ cacheOptions: { maxEntries: 2, maxTotalBytes: 4, maxSingleFileBytes: 4 } });
    vi.mocked(harness.proxy.readFile).mockResolvedValue(new Uint8Array([65, 66]));
    await harness.service.resolve('active.ts');
    const unsubscribe = harness.service.subscribe('active.ts', () => undefined);
    await harness.service.resolve('old.ts');
    await harness.service.resolve('latest.ts');
    expect(harness.service.peekOutcome('active.ts').kind).toBe('text');
    expect(harness.service.peekOutcome('old.ts')).toEqual({ kind: 'loading' });
    expect(harness.service.peekOutcome('latest.ts').kind).toBe('text');
    unsubscribe();
    harness.service.dispose();
    harness.disposeChannel();
  });
});
