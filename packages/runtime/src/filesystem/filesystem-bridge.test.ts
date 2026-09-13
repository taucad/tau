import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { wrapMessagePort } from '@taucad/rpc';
import type { Port } from '@taucad/rpc';
import { ChangeEventBus, tagEventOrigin } from '@taucad/filesystem';
import type { ChangeEvent } from '@taucad/types';
import { bindMutationContextForPort, createFileSystemBridge, exposeFileSystem } from '#filesystem/filesystem-bridge.js';
import { createBridgeCall } from '#transport/_internal/runtime-filesystem-bridge.js';

const testBackend = 'memory';
const written = (path: string): ChangeEvent => ({ type: 'fileWritten', path, backend: testBackend });

function fsBridgePort(port: MessagePort, label: string): Port<unknown> {
  const wrapped = wrapMessagePort<unknown>(port, { label });
  if (wrapped.start !== undefined) {
    wrapped.start();
  }
  return wrapped;
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
    rename: vi.fn<AnyAsync>().mockResolvedValue(undefined),
    unlink: vi.fn<AnyAsync>().mockResolvedValue(undefined),
    rmdir: vi.fn<AnyAsync>().mockResolvedValue(undefined),
    duplicateFile: vi.fn<AnyAsync>().mockResolvedValue(undefined),
    copyDirectory: vi.fn<AnyAsync>().mockResolvedValue(undefined),
    readFile: vi.fn<AnyAsync>().mockResolvedValue(new Uint8Array()),
    readdir: vi.fn<AnyAsync>().mockResolvedValue([]),
    stat: vi.fn<AnyAsync>().mockResolvedValue({ type: 'file', size: 0, mtimeMs: 0 }),
    lstat: vi.fn<AnyAsync>().mockResolvedValue({ type: 'file', size: 0, mtimeMs: 0 }),
    exists: vi.fn<AnyAsync>().mockResolvedValue(false),
  };
}

describe('bindMutationContextForPort', () => {
  const mutationContext = { originClientId: 'port_test_abc' };
  const memoryScope: { backend: 'memory' } = { backend: 'memory' };

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

    it('rename(from, to) lands as service.rename(from, to, context)', async () => {
      const handlers = makeMutatingFakeHandlers();
      const wrapper = bindMutationContextForPort(handlers, mutationContext);
      await wrapper.rename('/a', '/b');
      expect(handlers.rename.mock.calls[0]).toEqual(['/a', '/b', mutationContext]);
    });

    it('unlink(path) lands as service.unlink(path, undefined, context)', async () => {
      const handlers = makeMutatingFakeHandlers();
      const wrapper = bindMutationContextForPort(handlers, mutationContext);
      await wrapper.unlink('/x.txt');
      expect(handlers.unlink.mock.calls[0]).toEqual(['/x.txt', undefined, mutationContext]);
    });

    it('unlink(path, { scope }) preserves the options bag and appends context', async () => {
      const handlers = makeMutatingFakeHandlers();
      const wrapper = bindMutationContextForPort(handlers, mutationContext);
      await wrapper.unlink('/x.txt', { scope: memoryScope });
      expect(handlers.unlink.mock.calls[0]).toEqual(['/x.txt', { scope: memoryScope }, mutationContext]);
    });

    it('rmdir(path) lands as service.rmdir(path, undefined, context)', async () => {
      const handlers = makeMutatingFakeHandlers();
      const wrapper = bindMutationContextForPort(handlers, mutationContext);
      await wrapper.rmdir('/d');
      expect(handlers.rmdir.mock.calls[0]).toEqual(['/d', undefined, mutationContext]);
    });

    it('rmdir(path, { scope, recursive: true }) preserves the options bag and appends context', async () => {
      const handlers = makeMutatingFakeHandlers();
      const wrapper = bindMutationContextForPort(handlers, mutationContext);
      const options = { scope: memoryScope, recursive: true };
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
      expect(handlers.unlink.mock.calls[0]).toEqual(['/a', undefined, { originClientId: 'port_A' }]);
      expect(handlers.unlink.mock.calls[1]).toEqual(['/b', undefined, { originClientId: 'port_B' }]);
    });
  });
});

describe('createFileSystemBridge', () => {
  it('should send disconnect message before closing port on dispose', () => {
    const postSpy = vi.spyOn(MessagePort.prototype, 'postMessage');
    try {
      const worker = {
        postMessage: vi.fn(),
      } as unknown as Worker;

      const handle = createFileSystemBridge(worker);
      handle.dispose();

      expect(postSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'disconnect' }));
    } finally {
      postSpy.mockRestore();
    }
  });
});

describe('exposeFileSystem throttled delivery', () => {
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

  it('should create ThrottledWorker when createThrottledWorker is provided', () => {
    let factoryCalled = false;

    const handle = exposeFileSystem(
      {},
      {
        changeEventBus: { subscribe: vi.fn(() => vi.fn()) },
        createCoalescer: () => ({ push: vi.fn(), flush: vi.fn(), dispose: vi.fn() }),
        createThrottledWorker: () => {
          factoryCalled = true;
          return { push: vi.fn(), flush: vi.fn(), dispose: vi.fn() };
        },
      },
    );

    expect(factoryCalled).toBe(true);

    handle.cleanup();
  });

  it('should pass coalesced events to throttled worker push', () => {
    const pushFunction = vi.fn();
    let coalescerDeliver: ((events: ChangeEvent[]) => void) | undefined;

    const handle = exposeFileSystem(
      {},
      {
        changeEventBus: { subscribe: vi.fn(() => vi.fn()) },
        createCoalescer: (deliver) => {
          coalescerDeliver = deliver;
          return { push: vi.fn(), flush: vi.fn(), dispose: vi.fn() };
        },
        createThrottledWorker: () => ({
          push: pushFunction,
          flush: vi.fn(),
          dispose: vi.fn(),
        }),
      },
    );

    expect(coalescerDeliver).toBeDefined();
    const a = written('/a.txt');
    const b = written('/b.txt');
    const batch = [a, b];
    coalescerDeliver!(batch);

    expect(pushFunction).toHaveBeenCalledTimes(1);
    expect(pushFunction).toHaveBeenCalledWith(batch);

    handle.cleanup();
  });

  it('should dispose ThrottledWorker on bridge cleanup', () => {
    const disposeFunction = vi.fn();

    const handle = exposeFileSystem(
      {},
      {
        changeEventBus: { subscribe: vi.fn(() => vi.fn()) },
        createCoalescer: () => ({ push: vi.fn(), flush: vi.fn(), dispose: vi.fn() }),
        createThrottledWorker: () => ({
          push: vi.fn(),
          flush: vi.fn(),
          dispose: disposeFunction,
        }),
      },
    );

    handle.cleanup();

    expect(disposeFunction).toHaveBeenCalledTimes(1);
  });

  it('should deliver directly to handles when no throttled worker is provided', () => {
    let coalescerDeliver: ((events: ChangeEvent[]) => void) | undefined;

    const handle = exposeFileSystem(
      {},
      {
        changeEventBus: { subscribe: vi.fn(() => vi.fn()) },
        createCoalescer: (deliver) => {
          coalescerDeliver = deliver;
          return { push: vi.fn(), flush: vi.fn(), dispose: vi.fn() };
        },
      },
    );

    expect(coalescerDeliver).toBeDefined();
    const writtenEvent = written('/a.txt');
    coalescerDeliver!([writtenEvent]);

    handle.cleanup();
  });

  it('should route throttled worker output through deliverToHandles', () => {
    let throttledHandler: ((chunk: ChangeEvent[]) => void) | undefined;
    let coalescerDeliver: ((events: ChangeEvent[]) => void) | undefined;

    const handle = exposeFileSystem(
      {},
      {
        changeEventBus: { subscribe: vi.fn(() => vi.fn()) },
        createCoalescer: (deliver) => {
          coalescerDeliver = deliver;
          return { push: vi.fn(), flush: vi.fn(), dispose: vi.fn() };
        },
        createThrottledWorker: (handler) => {
          throttledHandler = handler;
          return {
            push: (items: ChangeEvent[]) => {
              handler(items);
            },
            flush: vi.fn(),
            dispose: vi.fn(),
          };
        },
      },
    );

    const channel = new MessageChannel();
    for (const h of messageHandlers) {
      h(new MessageEvent('message', { data: { type: 'connect', port: channel.port1 } }));
    }

    expect(handle.serverHandles.size).toBe(1);
    expect(throttledHandler).toBeDefined();

    const serverHandle = [...handle.serverHandles.values()][0]!;
    const emitSpy = vi.spyOn(serverHandle, 'emit');

    const first = written('/a.txt');
    const second = written('/b.txt');
    coalescerDeliver!([first, second]);

    expect(emitSpy).toHaveBeenCalledWith('fileChanged', first);
    expect(emitSpy).toHaveBeenCalledWith('fileChanged', second);

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
      mh!(new MessageEvent('message', { data: { type: 'connect', port } }));
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
      handler: buildEmitter(() => ({ type: 'directoryChanged', path: '/', backend: 'memory' })),
    },
    {
      name: 'mkdir',
      args: ['/d'],
      handler: buildEmitter(() => ({ type: 'directoryChanged', path: '/', backend: 'memory' })),
    },
    {
      name: 'rename',
      args: ['/a', '/b'],
      handler: buildEmitter((a) => ({
        type: 'fileRenamed',
        oldPath: a[0] as string,
        newPath: a[1] as string,
        backend: 'memory',
      })),
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
      mh!(new MessageEvent('message', { data: { type: 'connect', port } }));
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

  it('should deliver observer-sourced bus events to every connected port', async () => {
    const bus = new ChangeEventBus();

    const handle = exposeFileSystem(
      { readFile: vi.fn() },
      {
        changeEventBus: bus,
      },
    );

    const fireConnect = (port: MessagePort) => {
      messageHandlers[0]!(new MessageEvent('message', { data: { type: 'connect', port } }));
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
});
