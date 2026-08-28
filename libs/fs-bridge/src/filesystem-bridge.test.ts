/* eslint-disable @typescript-eslint/naming-convention -- test data uses virtual paths as object keys */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { wrapMessagePort } from '@taucad/rpc';
import type { Port } from '@taucad/rpc';
import {
  ChangeEventBus,
  CrossTabCoordinator,
  EventCoalescer,
  MountTable,
  ProviderRegistry,
  ResourceQueue,
  tagEventOrigin,
  WorkspaceFileService,
  WorkspaceMutationError,
} from '@taucad/filesystem';
import { MemoryProvider } from '@taucad/filesystem/backend';
import type { WatchEvent, WatchRequest, WorkspaceScope } from '@taucad/filesystem';
import type { ChangeEvent } from '@taucad/types';
import {
  bindMutationContextForPort,
  createFileSystemBridge,
  createFileSystemBridgeProxy,
  createTransferredFileSystemBridgeProxy,
  fileSystemBridgeSchemas,
  filesystemBridgeConnectMessageType,
} from '@taucad/fs-bridge';
import { createBridgeCall, createBridgeServer } from '@taucad/rpc/bridge';
import { exposeFileSystemForTesting as exposeFileSystem } from '#filesystem-bridge.js';
import { createFileSystemBridgeHello } from '#filesystem-bridge-protocol.js';

const testBackend = 'memory';
const workspaceMutationErrorMarker = '__workspaceMutationError__';
const written = (path: string): ChangeEvent => ({ type: 'fileWritten', path, backend: testBackend });

function fsBridgePort(port: MessagePort, label: string): Port<unknown> {
  const wrapped = wrapMessagePort<unknown>(port, { label });
  if (wrapped.start !== undefined) {
    wrapped.start();
  }
  return wrapped;
}

function firstFailedBulkMoveError(result: unknown): unknown {
  if (typeof result !== 'object' || result === null) {
    return undefined;
  }
  const { failed } = result as { readonly failed?: unknown };
  if (!Array.isArray(failed)) {
    return undefined;
  }
  return (failed[0] as { readonly error?: unknown } | undefined)?.error;
}

/**
 * Build a fresh fake handler object containing every mutating method
 * plus the common reads. Each method is a typed `vi.fn<…>()` so tests
 * can call it directly via the wrapper and inspect `.mock.calls`.
 */
type AnyAsync = (...args: unknown[]) => Promise<unknown>;
function makeMutatingFakeHandlers() {
  return {
    writeFile: vi.fn<AnyAsync>().mockResolvedValue(undefined),
    writeFiles: vi.fn<AnyAsync>().mockResolvedValue(undefined),
    mkdir: vi.fn<AnyAsync>().mockResolvedValue(undefined),
    move: vi.fn<AnyAsync>().mockResolvedValue({ type: 'file', size: 0, mtimeMs: 0 }),
    bulkMove: vi.fn<AnyAsync>().mockResolvedValue({ moved: [], failed: [] }),
    canMove: vi.fn<AnyAsync>().mockResolvedValue(true),
    canRename: vi.fn<AnyAsync>().mockResolvedValue(true),
    canCreate: vi.fn<AnyAsync>().mockResolvedValue(true),
    canDelete: vi.fn<AnyAsync>().mockResolvedValue(true),
    unlink: vi.fn<AnyAsync>().mockResolvedValue(undefined),
    rmdir: vi.fn<AnyAsync>().mockResolvedValue(undefined),
    duplicateFile: vi.fn<AnyAsync>().mockResolvedValue(undefined),
    copyDirectory: vi.fn<AnyAsync>().mockResolvedValue(undefined),
    commitPendingProjectDirectory: vi.fn<AnyAsync>().mockResolvedValue({ status: 'committed' }),
    readFile: vi.fn<AnyAsync>().mockResolvedValue(new Uint8Array()),
    readdir: vi.fn<AnyAsync>().mockResolvedValue([]),
    stat: vi.fn<AnyAsync>().mockResolvedValue({ type: 'file', size: 0, mtimeMs: 0 }),
    lstat: vi.fn<AnyAsync>().mockResolvedValue({ type: 'file', size: 0, mtimeMs: 0 }),
    exists: vi.fn<AnyAsync>().mockResolvedValue(false),
  };
}

describe('bindMutationContextForPort', () => {
  const mutationContext = { originClientId: 'port_test_abc' };

  describe('mutating-method context injection', () => {
    it('writeFile(path, data) lands as service.writeFile(path, data, context)', async () => {
      const handlers = makeMutatingFakeHandlers();
      const wrapper = bindMutationContextForPort(handlers, mutationContext);
      const data = new TextEncoder().encode('hi');
      await wrapper.writeFile('/x.txt', data);
      expect(handlers.writeFile).toHaveBeenCalledTimes(1);
      expect(handlers.writeFile.mock.calls[0]).toEqual(['/x.txt', data, mutationContext]);
    });

    it('writeFiles(files) lands as service.writeFiles(files, context)', async () => {
      const handlers = makeMutatingFakeHandlers();
      const wrapper = bindMutationContextForPort(handlers, mutationContext);
      // Path-keyed map; constructed via fromEntries to keep the linter
      // (which insists on strictCamelCase property names) happy with
      // these absolute paths.
      const files = Object.fromEntries([['/a.txt', { content: 'hi' }]]);
      await wrapper.writeFiles(files);
      expect(handlers.writeFiles).toHaveBeenCalledTimes(1);
      expect(handlers.writeFiles.mock.calls[0]).toEqual([files, mutationContext]);
    });

    it('mkdir(path) lands as service.mkdir(path, undefined, context)', async () => {
      const handlers = makeMutatingFakeHandlers();
      const wrapper = bindMutationContextForPort(handlers, mutationContext);
      await wrapper.mkdir('/d');
      expect(handlers.mkdir).toHaveBeenCalledTimes(1);
      expect(handlers.mkdir.mock.calls[0]).toEqual(['/d', undefined, mutationContext]);
    });

    it('mkdir(path, { recursive: true }) preserves the options bag and appends context', async () => {
      const handlers = makeMutatingFakeHandlers();
      const wrapper = bindMutationContextForPort(handlers, mutationContext);
      await wrapper.mkdir('/d', { recursive: true });
      expect(handlers.mkdir.mock.calls[0]).toEqual(['/d', { recursive: true }, mutationContext]);
    });

    it('move(source, target) lands as service.move(source, target, context)', async () => {
      const handlers = makeMutatingFakeHandlers();
      const wrapper = bindMutationContextForPort(handlers, mutationContext);
      await wrapper.move('/a', '/b');
      expect(handlers.move.mock.calls[0]).toEqual(['/a', '/b', mutationContext]);
    });

    it('bulkMove serializes failed WorkspaceMutationError instances before they cross the bridge', async () => {
      const handlers = makeMutatingFakeHandlers();
      const error = new WorkspaceMutationError('NAME_EXISTS', '/b', { target: '/b' });
      handlers.bulkMove.mockResolvedValueOnce({
        moved: [],
        failed: [{ edit: { source: '/a', target: '/b' }, error }],
      });

      const wrapper = bindMutationContextForPort(handlers, mutationContext);
      const result = await wrapper.bulkMove([{ source: '/a', target: '/b' }]);
      const firstError = firstFailedBulkMoveError(result);

      expect(handlers.bulkMove.mock.calls[0]).toEqual([[{ source: '/a', target: '/b' }], mutationContext]);
      expect(firstError).toEqual({
        [workspaceMutationErrorMarker]: true,
        name: 'WorkspaceMutationError',
        code: 'NAME_EXISTS',
        path: '/b',
        target: '/b',
        message: "A file or folder already exists at '/b'.",
      });
      expect(firstError).not.toBeInstanceOf(WorkspaceMutationError);
    });

    it('unlink(path) lands as service.unlink(path, context)', async () => {
      const handlers = makeMutatingFakeHandlers();
      const wrapper = bindMutationContextForPort(handlers, mutationContext);
      await wrapper.unlink('/x.txt');
      expect(handlers.unlink.mock.calls[0]).toEqual(['/x.txt', mutationContext]);
    });

    it('rmdir(path) lands as service.rmdir(path, undefined, context)', async () => {
      const handlers = makeMutatingFakeHandlers();
      const wrapper = bindMutationContextForPort(handlers, mutationContext);
      await wrapper.rmdir('/d');
      expect(handlers.rmdir.mock.calls[0]).toEqual(['/d', undefined, mutationContext]);
    });

    it('rmdir(path, { recursive: true }) preserves the options bag and appends context', async () => {
      const handlers = makeMutatingFakeHandlers();
      const wrapper = bindMutationContextForPort(handlers, mutationContext);
      const options = { recursive: true };
      await wrapper.rmdir('/d', options);
      expect(handlers.rmdir.mock.calls[0]).toEqual(['/d', options, mutationContext]);
    });

    it('duplicateFile(source, dest) lands as service.duplicateFile(source, dest, context)', async () => {
      const handlers = makeMutatingFakeHandlers();
      const wrapper = bindMutationContextForPort(handlers, mutationContext);
      await wrapper.duplicateFile('/a', '/b');
      expect(handlers.duplicateFile.mock.calls[0]).toEqual(['/a', '/b', mutationContext]);
    });

    it('copyDirectory(source, dest) lands as service.copyDirectory(source, dest, context)', async () => {
      const handlers = makeMutatingFakeHandlers();
      const wrapper = bindMutationContextForPort(handlers, mutationContext);
      await wrapper.copyDirectory('/d1', '/d2');
      expect(handlers.copyDirectory.mock.calls[0]).toEqual(['/d1', '/d2', mutationContext]);
    });

    it('commitPendingProjectDirectory(input) appends the mutation context', async () => {
      const handlers = makeMutatingFakeHandlers();
      const wrapper = bindMutationContextForPort(handlers, mutationContext);
      const input: Parameters<typeof wrapper.commitPendingProjectDirectory>[0] = {
        projectId: 'proj_ppppppppppppppppppppp',
        providerBasePath: 'pending',
        scope: { backend: 'memory', storageRootKey: 'memory:0' },
        files: { 'main.ts': { content: new Uint8Array([1]) } },
        manifest: new Uint8Array([2]),
      };

      await wrapper.commitPendingProjectDirectory(input);

      expect(handlers.commitPendingProjectDirectory.mock.calls[0]).toEqual([input, mutationContext]);
    });
  });

  describe('non-mutating passthrough — must NOT inject context', () => {
    it('readFile(path) calls service.readFile with exactly one argument', async () => {
      const handlers = makeMutatingFakeHandlers();
      const wrapper = bindMutationContextForPort(handlers, mutationContext);
      await wrapper.readFile('/x.ts');
      expect(handlers.readFile).toHaveBeenCalledTimes(1);
      expect(handlers.readFile.mock.calls[0]).toHaveLength(1);
      expect(handlers.readFile.mock.calls[0]).toEqual(['/x.ts']);
    });

    it('readFile(path, "utf8") calls service.readFile with exactly two arguments', async () => {
      const handlers = makeMutatingFakeHandlers();
      const wrapper = bindMutationContextForPort(handlers, mutationContext);
      await wrapper.readFile('/x.ts', 'utf8');
      expect(handlers.readFile.mock.calls[0]).toHaveLength(2);
      expect(handlers.readFile.mock.calls[0]).toEqual(['/x.ts', 'utf8']);
    });

    it('readdir, stat, lstat, exists forward exactly the caller args (no context appended)', async () => {
      const handlers = makeMutatingFakeHandlers();
      const wrapper = bindMutationContextForPort(handlers, mutationContext);
      await wrapper.readdir('/');
      await wrapper.stat('/a');
      await wrapper.lstat('/b');
      await wrapper.exists('/c');
      expect(handlers.readdir.mock.calls[0]).toEqual(['/']);
      expect(handlers.stat.mock.calls[0]).toEqual(['/a']);
      expect(handlers.lstat.mock.calls[0]).toEqual(['/b']);
      expect(handlers.exists.mock.calls[0]).toEqual(['/c']);
    });

    it('preflight methods do not inject context and serialize WorkspaceMutationError results', async () => {
      const handlers = makeMutatingFakeHandlers();
      handlers.canMove.mockResolvedValueOnce(new WorkspaceMutationError('NAME_EXISTS', '/b', { target: '/b' }));
      handlers.canRename.mockResolvedValueOnce(new WorkspaceMutationError('INVALID_NAME', 'bad/name'));
      handlers.canCreate.mockResolvedValueOnce(
        new WorkspaceMutationError('BUNDLED_TYPES_WORKSPACE', '/node_modules/x'),
      );
      handlers.canDelete.mockResolvedValueOnce(new WorkspaceMutationError('NOT_FOUND', '/gone'));

      const wrapper = bindMutationContextForPort(handlers, mutationContext);

      await expect(wrapper.canMove('/a', '/b')).resolves.toMatchObject({
        [workspaceMutationErrorMarker]: true,
        code: 'NAME_EXISTS',
        path: '/b',
        target: '/b',
      });
      await expect(wrapper.canRename('/a', 'bad/name')).resolves.toMatchObject({
        [workspaceMutationErrorMarker]: true,
        code: 'INVALID_NAME',
        path: 'bad/name',
      });
      await expect(wrapper.canCreate('/node_modules/x', 'file')).resolves.toMatchObject({
        [workspaceMutationErrorMarker]: true,
        code: 'BUNDLED_TYPES_WORKSPACE',
        path: '/node_modules/x',
      });
      await expect(wrapper.canDelete('/gone')).resolves.toMatchObject({
        [workspaceMutationErrorMarker]: true,
        code: 'NOT_FOUND',
        path: '/gone',
      });

      expect(handlers.canMove.mock.calls[0]).toEqual(['/a', '/b']);
      expect(handlers.canRename.mock.calls[0]).toEqual(['/a', 'bad/name']);
      expect(handlers.canCreate.mock.calls[0]).toEqual(['/node_modules/x', 'file']);
      expect(handlers.canDelete.mock.calls[0]).toEqual(['/gone']);
    });
  });

  describe('prototype-method `this` binding', () => {
    it('binds prototype methods to the real target so `this` is never the proxy', () => {
      // A class with a JS `#private` field — accessing `#secret` via a
      // proxy receiver throws TypeError in V8, which is exactly the
      // failure mode the wrapper's `.bind(target)` guards against.
      // The non-literal initialiser keeps the linter quiet about
      // class-literal-property-style without changing the semantics.
      const seedId = `service-${Date.now()}`;
      class FakeService {
        public readonly id: string = seedId;
        readonly #secret: string = `hush-${seedId}`;
        public reveal(): string {
          return this.#secret;
        }
        public who(): string {
          return this.id;
        }
      }
      const service = new FakeService();
      const wrapper = bindMutationContextForPort(service, mutationContext);
      // Without `.bind(target)` in the proxy, these would TypeError on
      // the `#secret` access because `this` would be the proxy.
      expect(wrapper.reveal()).toBe(`hush-${seedId}`);
      expect(wrapper.who()).toBe(seedId);
    });

    it('non-function properties pass through unchanged', () => {
      const service = { id: 'x', count: 42, nested: { a: 1 } };
      const wrapper = bindMutationContextForPort(service, mutationContext);
      expect(wrapper.id).toBe('x');
      expect(wrapper.count).toBe(42);
      expect(wrapper.nested).toBe(service.nested);
    });
  });

  describe('partial-handler safety', () => {
    it('does NOT synthesise mutating methods on a partial handler that lacks them', () => {
      const partial = { readFile: vi.fn<AnyAsync>().mockResolvedValue(new Uint8Array()) };
      const wrapper = bindMutationContextForPort(partial, mutationContext);
      expect('writeFile' in wrapper).toBe(false);
      expect('unlink' in wrapper).toBe(false);
      expect((wrapper as { writeFile?: unknown }).writeFile).toBeUndefined();
      expect((wrapper as { unlink?: unknown }).unlink).toBeUndefined();
    });

    it('still proxies non-mutating reads on a partial handler', async () => {
      const partial = { readFile: vi.fn<AnyAsync>().mockResolvedValue(new Uint8Array([1, 2, 3])) };
      const wrapper = bindMutationContextForPort(partial, mutationContext);
      const result: unknown = await wrapper.readFile('/x');
      expect(result).toEqual(new Uint8Array([1, 2, 3]));
      expect(partial.readFile.mock.calls[0]).toEqual(['/x']);
    });
  });

  describe('distinct port contexts', () => {
    it('two wrappers around the same service carry independent contexts', async () => {
      const handlers = makeMutatingFakeHandlers();
      const wrapperA = bindMutationContextForPort(handlers, { originClientId: 'port_A' });
      const wrapperB = bindMutationContextForPort(handlers, { originClientId: 'port_B' });
      await wrapperA.unlink('/a');
      await wrapperB.unlink('/b');
      expect(handlers.unlink.mock.calls[0]).toEqual(['/a', { originClientId: 'port_A' }]);
      expect(handlers.unlink.mock.calls[1]).toEqual(['/b', { originClientId: 'port_B' }]);
    });
  });
});

describe('createFileSystemBridge', () => {
  it('should close its port on dispose without sending a non-protocol frame', () => {
    const postSpy = vi.spyOn(MessagePort.prototype, 'postMessage');
    const closeSpy = vi.spyOn(MessagePort.prototype, 'close');
    try {
      const worker = {
        postMessage: vi.fn(),
      } as unknown as Worker;

      const handle = createFileSystemBridge(worker);
      handle.dispose();

      expect(postSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'disconnect' }));
      expect(closeSpy).toHaveBeenCalled();
    } finally {
      postSpy.mockRestore();
      closeSpy.mockRestore();
    }
  });

  it('sends the requested root only in the trusted connection envelope', () => {
    const postMessage = vi.fn<(message: unknown, transfer: Transferable[]) => void>();
    const worker = { postMessage } as unknown as Worker;

    const handle = createFileSystemBridge(worker, { root: '/projects/alpha' });

    expect(postMessage).toHaveBeenCalledOnce();
    const [envelope, transfer] = postMessage.mock.calls[0]!;
    expect(envelope).toMatchObject({ v: 1, type: filesystemBridgeConnectMessageType, root: '/projects/alpha' });
    const { port } = envelope as { readonly port: unknown };
    expect(port).toBeInstanceOf(MessagePort);
    expect(transfer).toEqual([port]);
    handle.dispose();
  });
});

describe('createFileSystemBridgeProxy', () => {
  it('rejects malformed method arguments before a mutating handler runs', async () => {
    const channel = new MessageChannel();
    const writeFile = vi.fn();
    createBridgeServer({ writeFile }, fsBridgePort(channel.port1, 'fs-bridge-invalid-args-server'), {
      hello: createFileSystemBridgeHello({
        state: 'ready',
        capabilities: { persistent: false, writable: true, quotaBased: false },
        watchable: false,
      }),
      protocolSchemas: fileSystemBridgeSchemas,
    });
    const proxy = createFileSystemBridgeProxy({
      port: fsBridgePort(channel.port2, 'fs-bridge-invalid-args-client'),
      dispose: () => {
        channel.port2.close();
      },
    });

    await expect(proxy.writeFile('main.ts', 42 as unknown as string)).rejects.toThrow(/server-call-args 'writeFile'/);
    expect(writeFile).not.toHaveBeenCalled();
    proxy.dispose();
  });

  it('rejects malformed method results before resolving the client call', async () => {
    const channel = new MessageChannel();
    createBridgeServer({ exists: async () => 'yes' }, fsBridgePort(channel.port1, 'fs-bridge-invalid-result-server'), {
      hello: createFileSystemBridgeHello({
        state: 'ready',
        capabilities: { persistent: false, writable: true, quotaBased: false },
        watchable: false,
      }),
      protocolSchemas: fileSystemBridgeSchemas,
    });
    const proxy = createFileSystemBridgeProxy({
      port: fsBridgePort(channel.port2, 'fs-bridge-invalid-result-client'),
      dispose: () => {
        channel.port2.close();
      },
    });

    await expect(proxy.exists('main.ts')).rejects.toMatchObject({
      name: 'WireValidationError',
      site: 'client-call-result',
      entry: 'exists',
    });
    proxy.dispose();
  });

  it('rejects malformed nested project-root arguments before the handler runs', async () => {
    const channel = new MessageChannel();
    const configureProjectRoots = vi.fn();
    createBridgeServer(
      { configureProjectRoots },
      fsBridgePort(channel.port1, 'fs-bridge-invalid-project-roots-server'),
      {
        hello: createFileSystemBridgeHello({ state: 'workspace', watchable: false }),
        protocolSchemas: fileSystemBridgeSchemas,
      },
    );
    const proxy = createFileSystemBridgeProxy({
      port: fsBridgePort(channel.port2, 'fs-bridge-invalid-project-roots-client'),
      dispose: () => {
        channel.port2.close();
      },
    });

    await expect(
      proxy.configureProjectRoots({
        projects: [{ backend: 'ftp' }],
        roots: [],
      } as unknown as Parameters<typeof proxy.configureProjectRoots>[0]),
    ).rejects.toThrow(/server-call-args 'configureProjectRoots'/);
    expect(configureProjectRoots).not.toHaveBeenCalled();
    proxy.dispose();
  });

  it('rejects unknown permanent-delete result modes before client resolution', async () => {
    const channel = new MessageChannel();
    createBridgeServer(
      { permanentlyDeleteProjectDirectory: async () => ({ status: 'surprise' }) },
      fsBridgePort(channel.port1, 'fs-bridge-invalid-delete-result-server'),
      {
        hello: createFileSystemBridgeHello({ state: 'workspace', watchable: false }),
        protocolSchemas: fileSystemBridgeSchemas,
      },
    );
    const proxy = createFileSystemBridgeProxy({
      port: fsBridgePort(channel.port2, 'fs-bridge-invalid-delete-result-client'),
      dispose: () => {
        channel.port2.close();
      },
    });

    await expect(
      proxy.permanentlyDeleteProjectDirectory({
        projectId: 'proj_000000000000000000000',
        providerBasePath: 'project',
        scope: { backend: 'indexeddb' },
      }),
    ).rejects.toMatchObject({
      name: 'WireValidationError',
      site: 'client-call-result',
      entry: 'permanentlyDeleteProjectDirectory',
    });
    proxy.dispose();
  });

  it('rejects unknown project-discovery result modes before client resolution', async () => {
    const channel = new MessageChannel();
    createBridgeServer(
      { listProjectManifests: async () => ({ entries: [{ status: 'surprise' }], roots: [] }) },
      fsBridgePort(channel.port1, 'fs-bridge-invalid-discovery-result-server'),
      {
        hello: createFileSystemBridgeHello({ state: 'workspace', watchable: false }),
        protocolSchemas: fileSystemBridgeSchemas,
      },
    );
    const proxy = createFileSystemBridgeProxy({
      port: fsBridgePort(channel.port2, 'fs-bridge-invalid-discovery-result-client'),
      dispose: () => {
        channel.port2.close();
      },
    });

    await expect(proxy.listProjectManifests()).rejects.toMatchObject({
      name: 'WireValidationError',
      site: 'client-call-result',
      entry: 'listProjectManifests',
    });
    proxy.dispose();
  });

  it('rejects unknown workspace mutation error codes before client resolution', async () => {
    const channel = new MessageChannel();
    createBridgeServer(
      { canDelete: async () => ({ code: 'SURPRISE', path: '/main.ts', message: 'surprise' }) },
      fsBridgePort(channel.port1, 'fs-bridge-invalid-mutation-result-server'),
      {
        hello: createFileSystemBridgeHello({ state: 'workspace', watchable: false }),
        protocolSchemas: fileSystemBridgeSchemas,
      },
    );
    const proxy = createFileSystemBridgeProxy({
      port: fsBridgePort(channel.port2, 'fs-bridge-invalid-mutation-result-client'),
      dispose: () => {
        channel.port2.close();
      },
    });

    await expect(proxy.canDelete('main.ts')).rejects.toMatchObject({
      name: 'WireValidationError',
      site: 'client-call-result',
      entry: 'canDelete',
    });
    proxy.dispose();
  });

  it('rejects malformed watch requests before registering the server watcher', async () => {
    const channel = new MessageChannel();
    const watch = vi.fn(() => () => undefined);
    createBridgeServer({ watch }, fsBridgePort(channel.port1, 'fs-bridge-invalid-watch-request-server'), {
      hello: createFileSystemBridgeHello({
        state: 'ready',
        capabilities: { persistent: false, writable: true, quotaBased: false },
        watchable: true,
      }),
      protocolSchemas: fileSystemBridgeSchemas,
    });
    const proxy = createFileSystemBridgeProxy({
      port: fsBridgePort(channel.port2, 'fs-bridge-invalid-watch-request-client'),
      dispose: () => {
        channel.port2.close();
      },
    });

    const subscription = proxy.watchReady({ paths: [42 as unknown as string] }, vi.fn());
    await expect(subscription.ready).rejects.toThrow(/server-listen-args 'watch'/);
    expect(watch).not.toHaveBeenCalled();
    proxy.dispose();
  });

  it('rejects malformed watch events before invoking the client handler', async () => {
    const channel = new MessageChannel();
    createBridgeServer(
      {
        watch(_request: WatchRequest, handler: (event: unknown) => void): () => void {
          handler({ type: 'change', path: 42 });
          return () => undefined;
        },
      },
      fsBridgePort(channel.port1, 'fs-bridge-invalid-watch-event-server'),
      {
        hello: createFileSystemBridgeHello({
          state: 'ready',
          capabilities: { persistent: false, writable: true, quotaBased: false },
          watchable: true,
        }),
        protocolSchemas: fileSystemBridgeSchemas,
      },
    );
    const proxy = createFileSystemBridgeProxy({
      port: fsBridgePort(channel.port2, 'fs-bridge-invalid-watch-event-client'),
      dispose: () => {
        channel.port2.close();
      },
    });
    const handler = vi.fn();

    const subscription = proxy.watchReady({ paths: ['main.ts'] }, handler);
    await subscription.ready;
    await expect(subscription.closed).rejects.toMatchObject({
      name: 'WireValidationError',
      site: 'client-listen-event',
      entry: 'watch',
    });
    expect(handler).not.toHaveBeenCalled();
    proxy.dispose();
  });

  it('clones pending-commit bytes before transfer and exempts only that method from the bridge deadline', async () => {
    vi.useFakeTimers();
    const channel = new MessageChannel();
    let resolveCommit!: () => void;
    const commitGate = new Promise<void>((resolve) => {
      resolveCommit = resolve;
    });
    const received = vi.fn();
    createBridgeServer(
      {
        async commitPendingProjectDirectory(input: unknown): Promise<{ status: 'committed' }> {
          received(input);
          await commitGate;
          return { status: 'committed' };
        },
      },
      fsBridgePort(channel.port1, 'fs-bridge-pending-commit-server'),
      {
        hello: createFileSystemBridgeHello({
          state: 'ready',
          capabilities: { persistent: false, writable: true, quotaBased: false },
          watchable: false,
        }),
        protocolSchemas: fileSystemBridgeSchemas,
      },
    );
    const proxy = createFileSystemBridgeProxy({
      port: fsBridgePort(channel.port2, 'fs-bridge-pending-commit-client'),
      dispose() {
        channel.port2.close();
      },
    });
    const content = new Uint8Array([1, 2, 3]);
    const manifest = new Uint8Array([4, 5, 6]);

    try {
      const pending = proxy.commitPendingProjectDirectory({
        providerBasePath: 'pending',
        scope: { backend: 'indexeddb' },
        files: { 'main.ts': { content } },
        manifest,
      });

      await vi.advanceTimersByTimeAsync(30_001);
      expect(content).toEqual(new Uint8Array([1, 2, 3]));
      expect(manifest).toEqual(new Uint8Array([4, 5, 6]));
      resolveCommit();
      await expect(pending).resolves.toEqual({ status: 'committed' });
      expect(received).toHaveBeenCalledOnce();
    } finally {
      proxy.dispose();
      channel.port1.close();
      vi.useRealTimers();
    }
  });
});

describe('exposeFileSystem coalesced delivery', () => {
  let messageHandlers: Array<(event: MessageEvent) => void>;

  beforeEach(() => {
    messageHandlers = [];
    vi.stubGlobal('self', {
      addEventListener: (_type: string, handler: (event: MessageEvent) => void) => {
        messageHandlers.push(handler);
      },
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('publishes the filesystem bridge protocol version in hello', async () => {
    const handle = exposeFileSystem({
      capabilities: { persistent: false, writable: true, quotaBased: false },
    });
    const channel = new MessageChannel();
    messageHandlers[0]!(
      new MessageEvent('message', {
        data: { v: 1, type: filesystemBridgeConnectMessageType, port: channel.port1 },
      }),
    );
    const proxy = createTransferredFileSystemBridgeProxy(channel.port2);

    await proxy.ready;
    expect(proxy.hello.payload).toMatchObject({ v: 1 });

    proxy.dispose();
    handle.cleanup();
    channel.port1.close();
  });

  it('rejects a mismatched connect envelope with a typed protocol error', async () => {
    const handle = exposeFileSystem({});
    const channel = new MessageChannel();
    messageHandlers[0]!(
      new MessageEvent('message', {
        data: { v: 2, type: filesystemBridgeConnectMessageType, port: channel.port1 },
      }),
    );
    const proxy = createTransferredFileSystemBridgeProxy(channel.port2);

    await expect(proxy.ready).rejects.toMatchObject({
      code: 'FILESYSTEM_BRIDGE_PROTOCOL_VERSION_MISMATCH',
    });

    proxy.dispose();
    handle.cleanup();
    channel.port1.close();
  });

  it('should replace every discarded backend with one backendChanged loss signal', () => {
    const bus = new ChangeEventBus();
    const handle = exposeFileSystem(
      {},
      {
        changeEventBus: bus,
        createCoalescer: (deliver, coalescingWindow, onOverflow) =>
          new EventCoalescer(deliver, { coalescingWindow, maxQueueDepth: 2, onOverflow }),
      },
    );
    const channel = new MessageChannel();
    for (const h of messageHandlers) {
      h(new MessageEvent('message', { data: { v: 1, type: filesystemBridgeConnectMessageType, port: channel.port1 } }));
    }
    const serverHandle = [...handle.serverHandles.values()][0]!;
    const emitSpy = vi.spyOn(serverHandle, 'emit');

    bus.emit(written('/a.txt'));
    bus.emit(written('/b.txt'));
    bus.emit({ type: 'fileWritten', path: '/c.txt', backend: 'opfs' });

    expect(emitSpy).toHaveBeenCalledTimes(2);
    expect(emitSpy).toHaveBeenNthCalledWith(1, 'fileChanged', { type: 'backendChanged', backend: 'memory' });
    expect(emitSpy).toHaveBeenNthCalledWith(2, 'fileChanged', { type: 'backendChanged', backend: 'opfs' });

    handle.cleanup();
    channel.port2.close();
  });

  it('releases server connection state when the remote port closes without a protocol frame', async () => {
    const unsubscribe = vi.fn();
    const handle = exposeFileSystem({ watch: vi.fn(() => unsubscribe) });
    const channel = new MessageChannel();
    for (const handler of messageHandlers) {
      handler(
        new MessageEvent('message', { data: { v: 1, type: filesystemBridgeConnectMessageType, port: channel.port1 } }),
      );
    }
    const client = createTransferredFileSystemBridgeProxy(channel.port2);
    const watch = client.watchReady({ paths: ['main.ts'] }, vi.fn());
    await watch.ready;
    expect(handle.activePorts.size).toBe(1);

    channel.port2.close();

    await vi.waitFor(() => {
      expect(handle.activePorts.size).toBe(0);
      expect(handle.serverHandles.size).toBe(0);
      expect(unsubscribe).toHaveBeenCalledOnce();
    });
    handle.cleanup();
  });

  it('should deliver continuous UI traffic by the first 500 ms deadline', () => {
    vi.useFakeTimers();
    const bus = new ChangeEventBus();
    const handle = exposeFileSystem(
      {},
      {
        changeEventBus: bus,
        createCoalescer: (deliver, coalescingWindow, onOverflow) =>
          new EventCoalescer(deliver, { coalescingWindow, onOverflow }),
      },
    );
    const channel = new MessageChannel();
    for (const handler of messageHandlers) {
      handler(
        new MessageEvent('message', { data: { v: 1, type: filesystemBridgeConnectMessageType, port: channel.port1 } }),
      );
    }
    const emitSpy = vi.spyOn([...handle.serverHandles.values()][0]!, 'emit');

    bus.emit(written('/a.txt'));
    vi.advanceTimersByTime(400);
    bus.emit(written('/b.txt'));
    vi.advanceTimersByTime(100);

    expect(emitSpy).toHaveBeenCalledTimes(2);
    expect(emitSpy).toHaveBeenNthCalledWith(1, 'fileChanged', written('/a.txt'));
    expect(emitSpy).toHaveBeenNthCalledWith(2, 'fileChanged', written('/b.txt'));

    handle.cleanup();
    channel.port2.close();
  });
});

describe('exposeFileSystem skip-originator dispatch', () => {
  let messageHandlers: Array<(event: MessageEvent) => void>;

  beforeEach(() => {
    messageHandlers = [];
    vi.stubGlobal('self', {
      addEventListener: (_type: string, handler: (event: MessageEvent) => void) => {
        messageHandlers.push(handler);
      },
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should deliver fileChanged to peer ports but skip the originating port on self-write', async () => {
    const bus = new ChangeEventBus();

    const handle = exposeFileSystem(
      {
        async writeFile(
          path: string,
          data: Uint8Array<ArrayBuffer>,
          context?: { originClientId?: string },
        ): Promise<void> {
          void data;
          const event: ChangeEvent = { type: 'fileWritten', path, backend: 'memory' };
          if (context?.originClientId !== undefined) {
            tagEventOrigin(event, context.originClientId);
          }
          bus.emit(event);
        },
      },
      {
        changeEventBus: bus,
      },
    );

    const fireConnect = (port: MessagePort) => {
      const mh = messageHandlers[0];
      expect(mh).toBeDefined();
      mh!(new MessageEvent('message', { data: { v: 1, type: filesystemBridgeConnectMessageType, port } }));
    };

    const chA = new MessageChannel();
    const chB = new MessageChannel();
    fireConnect(chA.port1);
    fireConnect(chB.port1);

    expect(handle.serverHandles.size).toBe(2);

    const clientA = createBridgeCall(fsBridgePort(chA.port2, 'fs-bridge-client-a'));
    const clientB = createBridgeCall(fsBridgePort(chB.port2, 'fs-bridge-client-b'));

    const receivedA: unknown[] = [];
    const receivedB: unknown[] = [];
    const offA = clientA.listen('fileChanged', (d) => {
      receivedA.push(d);
    });
    const offB = clientB.listen('fileChanged', (d) => {
      receivedB.push(d);
    });

    const bytes = new TextEncoder().encode('hi');
    await clientA.call('writeFile', ['/x.txt', bytes]);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 30);
    });

    expect(receivedA).toHaveLength(0);
    expect(receivedB).toHaveLength(1);
    expect(receivedB[0]).toEqual({ type: 'fileWritten', path: '/x.txt', backend: 'memory' });

    offA();
    offB();
    clientA.dispose();
    clientB.dispose();
    handle.cleanup();
    chA.port2.close();
    chB.port2.close();
  });

  it('should deliver a batch write to a peer exact watcher while suppressing the author echo', async () => {
    const providerRegistry = new ProviderRegistry();
    const provider = await providerRegistry.getProvider({ backend: 'memory', storageRootKey: 'memory:bridge-test' });
    const mountTable = new MountTable();
    mountTable.mount('/', provider, { backend: 'memory', storageRootKey: 'memory:bridge-test' });
    const bus = new ChangeEventBus();
    const crossTabCoordinator = new CrossTabCoordinator();
    const service = new WorkspaceFileService({
      providerRegistry,
      resourceQueue: new ResourceQueue(),
      eventBus: bus,
      crossTabCoordinator,
      mountTable,
    });
    const handle = exposeFileSystem(service, { changeEventBus: bus });
    const fireConnect = (port: MessagePort): void => {
      const messageHandler = messageHandlers[0];
      expect(messageHandler).toBeDefined();
      messageHandler!(new MessageEvent('message', { data: { v: 1, type: filesystemBridgeConnectMessageType, port } }));
    };
    const channelA = new MessageChannel();
    const channelB = new MessageChannel();
    fireConnect(channelA.port1);
    fireConnect(channelB.port1);

    const clientA = createTransferredFileSystemBridgeProxy(channelA.port2);
    const clientB = createTransferredFileSystemBridgeProxy(channelB.port2);
    const authorEvents: unknown[] = [];
    const peerEvents: unknown[] = [];
    const peerWatchEvents: WatchEvent[] = [];
    const path = '/main.scad';
    const stopAuthorEvents = clientA.listen('fileChanged', (event) => {
      authorEvents.push(event);
    });
    const stopPeerEvents = clientB.listen('fileChanged', (event) => {
      peerEvents.push(event);
    });
    const peerWatch = clientB.watchReady({ paths: [path] }, (event) => {
      peerWatchEvents.push(event);
    });

    try {
      await peerWatch.ready;
      await clientA.writeFiles({ [path]: { content: 'cube([10, 10, 10]);' } });
      await vi.waitFor(() => {
        expect(peerWatchEvents).toEqual([{ type: 'change', path }]);
        expect(peerEvents).toEqual([{ type: 'fileWritten', path, backend: 'memory' }]);
      });

      expect(authorEvents).toEqual([]);
    } finally {
      peerWatch.unsubscribe();
      stopAuthorEvents();
      stopPeerEvents();
      clientA.dispose();
      clientB.dispose();
      handle.cleanup();
      service.dispose();
      crossTabCoordinator.dispose();
      channelA.port1.close();
      channelA.port2.close();
      channelB.port1.close();
      channelB.port2.close();
    }
  });

  /**
   * Parameterised echo-suppression matrix.
   *
   * For each mutating method the bridge handles, the per-port wrapper
   * must thread `originClientId` from port-connect time all the way
   * through to {@link tagEventOrigin} so the event-bus broadcaster can
   * suppress echo to the originator. This was previously covered only
   * by the `writeFile` test above; the other seven methods could
   * silently lose context if the wrapper or bridge changed.
   *
   * Each case provides a fake handler that reads `context.originClientId`
   * and emits a synthetic event tagged with that origin. The matrix
   * proves: caller A invokes method → fake handler tags origin → peer
   * B receives, A is suppressed.
   */
  type EchoCase<Args extends readonly unknown[]> = {
    name: string;
    args: Args;
    handler: (context: { originClientId?: string }, bus: ChangeEventBus, args: Args) => Promise<void>;
  };

  const buildEmitter =
    (eventFactory: (args: readonly unknown[]) => ChangeEvent) =>
    async (context: { originClientId?: string }, bus: ChangeEventBus, args: readonly unknown[]): Promise<void> => {
      const event = eventFactory(args);
      if (context.originClientId !== undefined) {
        tagEventOrigin(event, context.originClientId);
      }
      bus.emit(event);
    };

  const echoCases: ReadonlyArray<EchoCase<readonly unknown[]>> = [
    {
      name: 'writeFile',
      args: ['/x.txt', new TextEncoder().encode('hi')],
      handler: buildEmitter((a) => ({ type: 'fileWritten', path: a[0] as string, backend: 'memory' })),
    },
    {
      name: 'writeFiles',
      args: [Object.fromEntries([['/a.txt', { content: 'hi' }]])],
      handler: buildEmitter(() => ({ type: 'fileWritten', path: '/a.txt', backend: 'memory' })),
    },
    {
      name: 'mkdir',
      args: ['/d'],
      handler: buildEmitter(() => ({ type: 'directoryChanged', path: '/', backend: 'memory' })),
    },
    {
      name: 'unlink',
      args: ['/x.txt'],
      handler: buildEmitter((a) => ({ type: 'fileDeleted', path: a[0] as string, backend: 'memory' })),
    },
    {
      name: 'rmdir',
      args: ['/d'],
      handler: buildEmitter(() => ({ type: 'directoryChanged', path: '/', backend: 'memory' })),
    },
    {
      name: 'duplicateFile',
      args: ['/a', '/b'],
      handler: buildEmitter((a) => ({ type: 'fileWritten', path: a[1] as string, backend: 'memory' })),
    },
    {
      name: 'copyDirectory',
      args: ['/d1', '/d2'],
      handler: buildEmitter(() => ({ type: 'directoryChanged', path: '/', backend: 'memory' })),
    },
  ];

  it.each(echoCases)('should suppress echo to the originating port on $name', async ({ name, args, handler }) => {
    const bus = new ChangeEventBus();

    const handlers: Record<string, (...callArgs: unknown[]) => Promise<void>> = {};
    handlers[name] = async (...callArgs: unknown[]): Promise<void> => {
      // The bridge wrapper appends `context` as the trailing arg for
      // mutating methods. Pop it off so we hand the original args
      // to the event factory.
      const context = callArgs.at(-1) as { originClientId?: string };
      const userArgs = callArgs.slice(0, -1) as readonly unknown[];
      await handler(context, bus, userArgs);
    };

    const handle = exposeFileSystem(handlers, { changeEventBus: bus });

    const fireConnect = (port: MessagePort): void => {
      const mh = messageHandlers[0];
      expect(mh).toBeDefined();
      mh!(new MessageEvent('message', { data: { v: 1, type: filesystemBridgeConnectMessageType, port } }));
    };

    const chA = new MessageChannel();
    const chB = new MessageChannel();
    fireConnect(chA.port1);
    fireConnect(chB.port1);

    const clientA = createBridgeCall(fsBridgePort(chA.port2, `fs-bridge-client-a-${name}`));
    const clientB = createBridgeCall(fsBridgePort(chB.port2, `fs-bridge-client-b-${name}`));

    const receivedA: unknown[] = [];
    const receivedB: unknown[] = [];
    const offA = clientA.listen('fileChanged', (data) => {
      receivedA.push(data);
    });
    const offB = clientB.listen('fileChanged', (data) => {
      receivedB.push(data);
    });

    await clientA.call(name, args as unknown[]);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 30);
    });

    expect(receivedA, `${name}: originator should be suppressed`).toHaveLength(0);
    expect(receivedB, `${name}: peer should receive exactly one event`).toHaveLength(1);

    offA();
    offB();
    clientA.dispose();
    clientB.dispose();
    handle.cleanup();
    chA.port2.close();
    chB.port2.close();
  });

  it('declares read bytes on the response transfer list instead of cloning them', async () => {
    const provider = new MemoryProvider();
    await provider.writeFile('data.bin', new Uint8Array([4, 5, 6]));
    const channel = new MessageChannel();
    const posted: Array<{ frame: unknown; transfer: readonly Transferable[] | undefined }> = [];
    const postMessage = channel.port1.postMessage.bind(channel.port1);
    vi.spyOn(channel.port1, 'postMessage').mockImplementation(
      (frame: unknown, transfer?: readonly Transferable[] | StructuredSerializeOptions) => {
        const transferList = Array.isArray(transfer) ? (transfer as readonly Transferable[]) : undefined;
        posted.push({ frame, transfer: transferList });
        Reflect.apply(postMessage, channel.port1, [frame, transferList]);
      },
    );
    const handle = exposeFileSystem({ readFile: provider.readFile.bind(provider) });
    messageHandlers[0]!(
      new MessageEvent('message', {
        data: { v: 1, type: filesystemBridgeConnectMessageType, port: channel.port1 },
      }),
    );
    const client = createBridgeCall(fsBridgePort(channel.port2, 'fs-bridge-transfer-list-client'));

    try {
      await expect(client.call('readFile', ['data.bin'])).resolves.toEqual(new Uint8Array([4, 5, 6]));

      const responses = posted.filter(({ frame }) => (frame as { k?: string }).k === 'rs');
      expect(responses).toHaveLength(1);
      const payload = (responses[0]!.frame as { d: Uint8Array<ArrayBuffer> }).d;
      expect(responses[0]!.transfer).toEqual([payload.buffer]);
    } finally {
      client.dispose();
      handle.cleanup();
      channel.port1.close();
      channel.port2.close();
    }
  });

  it('transfers provider-owned reads without detaching authoritative bytes', async () => {
    const provider = new MemoryProvider();
    await provider.writeFile('data.bin', new Uint8Array([1, 2, 3]));
    const handle = exposeFileSystem({ readFile: provider.readFile.bind(provider) });
    const channel = new MessageChannel();
    messageHandlers[0]!(
      new MessageEvent('message', {
        data: { v: 1, type: filesystemBridgeConnectMessageType, port: channel.port1 },
      }),
    );
    const client = createBridgeCall(fsBridgePort(channel.port2, 'fs-bridge-owned-read-client'));

    try {
      await expect(client.call('readFile', ['data.bin'])).resolves.toEqual(new Uint8Array([1, 2, 3]));
      await expect(client.call('readFile', ['data.bin'])).resolves.toEqual(new Uint8Array([1, 2, 3]));
      await expect(provider.readFile('data.bin')).resolves.toEqual(new Uint8Array([1, 2, 3]));
    } finally {
      client.dispose();
      handle.cleanup();
      channel.port1.close();
      channel.port2.close();
    }
  });

  it('should deliver observer-sourced bus events to every connected port', async () => {
    const bus = new ChangeEventBus();

    const handle = exposeFileSystem(
      { readFile: vi.fn() },
      {
        changeEventBus: bus,
      },
    );

    const fireConnect = (port: MessagePort) => {
      messageHandlers[0]!(
        new MessageEvent('message', { data: { v: 1, type: filesystemBridgeConnectMessageType, port } }),
      );
    };

    const chA = new MessageChannel();
    const chB = new MessageChannel();
    fireConnect(chA.port1);
    fireConnect(chB.port1);

    const clientA = createBridgeCall(fsBridgePort(chA.port2, 'fs-bridge-client-a'));
    const clientB = createBridgeCall(fsBridgePort(chB.port2, 'fs-bridge-client-b'));

    const receivedA: unknown[] = [];
    const receivedB: unknown[] = [];
    clientA.listen('fileChanged', (d) => {
      receivedA.push(d);
    });
    clientB.listen('fileChanged', (d) => {
      receivedB.push(d);
    });

    bus.emit({ type: 'fileWritten', path: '/ext.txt', backend: 'memory' });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 30);
    });

    expect(receivedA).toHaveLength(1);
    expect(receivedB).toHaveLength(1);
    expect(receivedA[0]).toEqual({ type: 'fileWritten', path: '/ext.txt', backend: 'memory' });
    expect(receivedB[0]).toEqual({ type: 'fileWritten', path: '/ext.txt', backend: 'memory' });

    clientA.dispose();
    clientB.dispose();
    handle.cleanup();
    chA.port2.close();
    chB.port2.close();
  });

  it('does not broadcast an in-flight write after its project route is replaced', async () => {
    const projectId = 'proj_aaaaaaaaaaaaaaaaaaaaa';
    const oldScope = { backend: 'memory', storageRootKey: 'memory:bridge-stale-old' } satisfies WorkspaceScope;
    const providerRegistry = new ProviderRegistry();
    const rootProvider = await providerRegistry.getProvider({
      backend: 'memory',
      storageRootKey: 'memory:bridge-stale-root',
    });
    const mountTable = new MountTable();
    mountTable.mount('/', rootProvider, { backend: 'memory', storageRootKey: 'memory:bridge-stale-root' });
    const bus = new ChangeEventBus();
    const service = new WorkspaceFileService({
      providerRegistry,
      resourceQueue: new ResourceQueue(),
      eventBus: bus,
      mountTable,
    });
    await service.configureProjectRoots({
      projects: [
        {
          projectId,
          ...oldScope,
          providerBasePath: projectId,
        },
      ],
      roots: [],
    });
    const oldProvider = await providerRegistry.getProvider(oldScope);
    const originalWrite = oldProvider.writeFile.bind(oldProvider);
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    vi.spyOn(oldProvider, 'writeFile').mockImplementation(async (path, data) => {
      started.resolve();
      await release.promise;
      await originalWrite(path, data);
    });
    const rooted = service.createRootedFileSystem(`/projects/${projectId}`);
    const queuedWrite = rooted.writeFile('queued.txt', 'old provider');
    await started.promise;
    await service.configureProjectRoots({
      projects: [
        {
          projectId,
          backend: 'memory',
          storageRootKey: 'memory:bridge-stale-new',
          providerBasePath: projectId,
        },
      ],
      roots: [],
    });

    const handle = exposeFileSystem(service, { changeEventBus: bus });
    const channel = new MessageChannel();
    messageHandlers[0]!(
      new MessageEvent('message', {
        data: { v: 1, type: filesystemBridgeConnectMessageType, port: channel.port1 },
      }),
    );
    const client = createBridgeCall(fsBridgePort(channel.port2, 'fs-bridge-stale-route-client'));
    const received: unknown[] = [];
    const stopListening = client.listen('fileChanged', (event) => received.push(event));

    try {
      release.resolve();
      await queuedWrite;
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 30);
      });

      expect(received).toEqual([]);
      await expect(oldProvider.readFile(`${projectId}/queued.txt`, 'utf8')).resolves.toBe('old provider');
      await expect(service.exists(`/projects/${projectId}/queued.txt`)).resolves.toBe(false);
    } finally {
      release.resolve();
      stopListening();
      client.dispose();
      handle.cleanup();
      service.dispose();
      channel.port1.close();
      channel.port2.close();
    }
  });

  it('captures one rooted handler per scoped port and excludes scoped ports from global broadcasts', async () => {
    const alphaProjectId = 'proj_aaaaaaaaaaaaaaaaaaaaa';
    const betaProjectId = 'proj_bbbbbbbbbbbbbbbbbbbbb';
    const providerRegistry = new ProviderRegistry();
    const rootProvider = await providerRegistry.getProvider({
      backend: 'memory',
      storageRootKey: 'memory:bridge-root',
    });
    const mountTable = new MountTable();
    mountTable.mount('/', rootProvider, { backend: 'memory' });
    const bus = new ChangeEventBus();
    const service = new WorkspaceFileService({
      providerRegistry,
      resourceQueue: new ResourceQueue(),
      eventBus: bus,
      mountTable,
    });
    await service.configureProjectRoots({
      projects: [
        {
          projectId: alphaProjectId,
          backend: 'memory',
          storageRootKey: 'memory:bridge-alpha',
          providerBasePath: alphaProjectId,
        },
        {
          projectId: betaProjectId,
          backend: 'memory',
          storageRootKey: 'memory:bridge-beta',
          providerBasePath: betaProjectId,
        },
      ],
      roots: [],
    });
    const handlerForRoot = vi.fn((root: string, context: { originClientId?: string }) =>
      service.createRootedFileSystem(root, context),
    );
    const handle = exposeFileSystem(service, { changeEventBus: bus, handlerForRoot });
    const connect = (port: MessagePort, root: string): void => {
      messageHandlers[0]!(
        new MessageEvent('message', {
          data: { v: 1, type: filesystemBridgeConnectMessageType, port, root },
        }),
      );
    };
    const alphaChannel = new MessageChannel();
    const betaChannel = new MessageChannel();
    connect(alphaChannel.port1, `/projects/${alphaProjectId}`);
    connect(betaChannel.port1, `/projects/${betaProjectId}`);
    const alpha = createTransferredFileSystemBridgeProxy(alphaChannel.port2);
    const beta = createTransferredFileSystemBridgeProxy(betaChannel.port2);
    const globalEvents: unknown[] = [];
    const stopBroadcast = alpha.listen('fileChanged', (event) => globalEvents.push(event));
    const watchEvents: WatchEvent[] = [];
    const stopWatch = alpha.watch({ paths: [''], recursive: true }, (event) => watchEvents.push(event));

    try {
      await alpha.writeFile('same.ts', 'alpha');
      await beta.writeFile('same.ts', 'beta');
      await service.writeFile(`/projects/${alphaProjectId}/external.ts`, 'external');

      await expect(alpha.readFile('same.ts', 'utf8')).resolves.toBe('alpha');
      await expect(beta.readFile('same.ts', 'utf8')).resolves.toBe('beta');
      await vi.waitFor(() => {
        expect(watchEvents).toContainEqual({ type: 'change', path: 'external.ts' });
      });
      expect(watchEvents).not.toContainEqual({ type: 'change', path: 'same.ts' });
      expect(globalEvents).toEqual([]);
      expect(handlerForRoot).toHaveBeenCalledTimes(2);
      expect(handlerForRoot.mock.calls[0]?.[0]).toBe(`/projects/${alphaProjectId}`);
      expect(handlerForRoot.mock.calls[0]?.[1].originClientId).toMatch(/^port_/u);
      expect(handlerForRoot.mock.calls[1]?.[0]).toBe(`/projects/${betaProjectId}`);
      expect(handlerForRoot.mock.calls[1]?.[1].originClientId).toMatch(/^port_/u);
    } finally {
      stopWatch();
      stopBroadcast();
      alpha.dispose();
      beta.dispose();
      handle.cleanup();
      service.dispose();
      alphaChannel.port1.close();
      betaChannel.port1.close();
    }
  });

  it('returns a typed root error over RPC instead of exposing the authority namespace', async () => {
    const handle = exposeFileSystem({}, { handlerForRoot: () => undefined });
    const channel = new MessageChannel();
    messageHandlers[0]!(
      new MessageEvent('message', {
        data: { v: 1, type: filesystemBridgeConnectMessageType, port: channel.port1, root: '/projects/missing' },
      }),
    );
    const proxy = createTransferredFileSystemBridgeProxy(channel.port2);

    try {
      await proxy.ready;
      expect(proxy.hello.payload).toMatchObject({
        state: 'unavailable',
        capabilities: null,
        watchable: false,
        error: { code: 'ROOT_UNAVAILABLE' },
      });
      await expect(proxy.readFile('main.ts')).rejects.toMatchObject({
        code: 'ROOT_UNAVAILABLE',
        message: 'The requested filesystem root is unavailable.',
      });
    } finally {
      proxy.dispose();
      handle.cleanup();
      channel.port1.close();
    }
  });
});
