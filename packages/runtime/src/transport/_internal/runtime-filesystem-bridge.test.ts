import { describe, it, expect, vi } from 'vitest';
import { wrapMessagePort } from '@taucad/rpc';
import type { Port } from '@taucad/rpc';
import { SharedPool } from '@taucad/memory';
import { _fromMemoryFsHandle as fromMemoryFS } from '#transport/_internal/from-memory-fs-handle.js';
import type { RuntimeFileSystemBase } from '#types/runtime-kernel.types.js';
import {
  createBridgeCall,
  createBridgeServer,
  createBridgePort,
  createBridgeProxy,
  catchMessages,
  extractTransferables,
} from '#transport/_internal/runtime-filesystem-bridge.js';

/**
 * Unwrap the discriminated `inline` `RuntimeFileSystemHandle` so the
 * bridge server below receives the bare `RuntimeFileSystemBase` contract
 * it serves over the channel. Keeps test bodies free of `.fs` accessor
 * noise.
 */
function makeFs(files?: Record<string, string>): RuntimeFileSystemBase {
  const handle = fromMemoryFS(files);
  if (handle.kind !== 'inline') {
    throw new Error('fromMemoryFS() must return the inline-kind handle.');
  }
  return handle.create();
}

/** Wrap WHATWG/Web-compatible `MessagePort`s for `@taucad/rpc` (parity with prod call sites). */
function fsBridgePort(port: MessagePort, label: string): Port<unknown> {
  const wrapped = wrapMessagePort<unknown>(port, { label });
  if (wrapped.start !== undefined) {
    wrapped.start();
  }
  return wrapped;
}

describe('runtime-filesystem-bridge', () => {
  describe('createBridgeServer + createBridgeProxy<RuntimeFileSystemBase> integration', () => {
    it('should read a file as utf8 through the bridge', async () => {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- filesystem paths use non-camelCase names
      const fs = makeFs({ '/test.ts': 'const x = 1;' });
      const channel = new MessageChannel();
      createBridgeServer(fs, fsBridgePort(channel.port1, 'fs-bridge-server'));
      const proxy = createBridgeProxy<RuntimeFileSystemBase>(fsBridgePort(channel.port2, 'fs-bridge-client'));

      const content = await proxy.readFile('/test.ts', 'utf8');
      expect(content).toBe('const x = 1;');
    });

    it('should read a file as Uint8Array through the bridge', async () => {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- filesystem paths use non-camelCase names
      const fs = makeFs({ '/test.ts': 'hello' });
      const channel = new MessageChannel();
      createBridgeServer(fs, fsBridgePort(channel.port1, 'fs-bridge-server'));
      const proxy = createBridgeProxy<RuntimeFileSystemBase>(fsBridgePort(channel.port2, 'fs-bridge-client'));

      const content = await proxy.readFile('/test.ts');
      expect(content).toBeInstanceOf(Uint8Array);
      expect(new TextDecoder().decode(content)).toBe('hello');
    });

    it('should write and read back a file', async () => {
      const fs = makeFs();
      const channel = new MessageChannel();
      createBridgeServer(fs, fsBridgePort(channel.port1, 'fs-bridge-server'));
      const proxy = createBridgeProxy<RuntimeFileSystemBase>(fsBridgePort(channel.port2, 'fs-bridge-client'));

      await proxy.writeFile('/new.txt', 'written content');
      const content = await proxy.readFile('/new.txt', 'utf8');
      expect(content).toBe('written content');
    });

    it('should create directories and list them', async () => {
      const fs = makeFs();
      const channel = new MessageChannel();
      createBridgeServer(fs, fsBridgePort(channel.port1, 'fs-bridge-server'));
      const proxy = createBridgeProxy<RuntimeFileSystemBase>(fsBridgePort(channel.port2, 'fs-bridge-client'));

      await proxy.mkdir('/mydir');
      await proxy.writeFile('/mydir/file.txt', 'data');
      const entries = await proxy.readdir('/mydir');
      expect(entries).toContain('file.txt');
    });

    it('should delete a file via unlink', async () => {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- filesystem paths use non-camelCase names
      const fs = makeFs({ '/del.txt': 'gone' });
      const channel = new MessageChannel();
      createBridgeServer(fs, fsBridgePort(channel.port1, 'fs-bridge-server'));
      const proxy = createBridgeProxy<RuntimeFileSystemBase>(fsBridgePort(channel.port2, 'fs-bridge-client'));

      expect(await proxy.exists('/del.txt')).toBe(true);
      await proxy.unlink('/del.txt');
      expect(await proxy.exists('/del.txt')).toBe(false);
    });

    it('should stat a file with correct type and size', async () => {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- filesystem paths use non-camelCase names
      const fs = makeFs({ '/stat.txt': 'abcde' });
      const channel = new MessageChannel();
      createBridgeServer(fs, fsBridgePort(channel.port1, 'fs-bridge-server'));
      const proxy = createBridgeProxy<RuntimeFileSystemBase>(fsBridgePort(channel.port2, 'fs-bridge-client'));

      const stat = await proxy.stat('/stat.txt');
      expect(stat.type).toBe('file');
      expect(stat.size).toBe(5);
      expect(stat.mtimeMs).toBeTypeOf('number');
    });

    it('should report exists correctly', async () => {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- filesystem paths use non-camelCase names
      const fs = makeFs({ '/yes.txt': 'here' });
      const channel = new MessageChannel();
      createBridgeServer(fs, fsBridgePort(channel.port1, 'fs-bridge-server'));
      const proxy = createBridgeProxy<RuntimeFileSystemBase>(fsBridgePort(channel.port2, 'fs-bridge-client'));

      expect(await proxy.exists('/yes.txt')).toBe(true);
      expect(await proxy.exists('/no.txt')).toBe(false);
    });

    it('should remove a directory via rmdir through the bridge', async () => {
      const fs = makeFs();
      const channel = new MessageChannel();
      createBridgeServer(fs, fsBridgePort(channel.port1, 'fs-bridge-server'));
      const proxy = createBridgeProxy<RuntimeFileSystemBase>(fsBridgePort(channel.port2, 'fs-bridge-client'));

      await proxy.mkdir('/rmdir-test');
      expect(await proxy.exists('/rmdir-test')).toBe(true);
      await proxy.rmdir('/rmdir-test');
      expect(await proxy.exists('/rmdir-test')).toBe(false);
    });

    it('should rename a file through the bridge', async () => {
      const fs = makeFs({ '/old-name.txt': 'rename me' });
      const channel = new MessageChannel();
      createBridgeServer(fs, fsBridgePort(channel.port1, 'fs-bridge-server'));
      const proxy = createBridgeProxy<RuntimeFileSystemBase>(fsBridgePort(channel.port2, 'fs-bridge-client'));

      await proxy.rename('/old-name.txt', '/new-name.txt');
      expect(await proxy.exists('/old-name.txt')).toBe(false);
      const content = await proxy.readFile('/new-name.txt', 'utf8');
      expect(content).toBe('rename me');
    });

    it('should lstat a file through the bridge', async () => {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- filesystem paths use non-camelCase names
      const fs = makeFs({ '/lstat.txt': 'abc' });
      const channel = new MessageChannel();
      createBridgeServer(fs, fsBridgePort(channel.port1, 'fs-bridge-server'));
      const proxy = createBridgeProxy<RuntimeFileSystemBase>(fsBridgePort(channel.port2, 'fs-bridge-client'));

      const stat = await proxy.lstat('/lstat.txt');
      expect(stat.type).toBe('file');
      expect(stat.size).toBe(3);
      expect(stat.mtimeMs).toBeTypeOf('number');
    });
  });

  describe('createBridgeServer error handling', () => {
    it('should serialize filesystem errors across the bridge', async () => {
      const fs = makeFs();
      const channel = new MessageChannel();
      createBridgeServer(fs, fsBridgePort(channel.port1, 'fs-bridge-server'));
      const proxy = createBridgeProxy<RuntimeFileSystemBase>(fsBridgePort(channel.port2, 'fs-bridge-client'));

      await expect(proxy.readFile('/nonexistent.txt', 'utf8')).rejects.toThrow('ENOENT');
    });

    it('should reject calls to unknown methods', async () => {
      const fs = makeFs();
      const channel = new MessageChannel();
      createBridgeServer(fs, fsBridgePort(channel.port1, 'fs-bridge-server'));

      const { createBridgeCall } = await import('#transport/_internal/runtime-filesystem-bridge.js');
      const { call, dispose } = createBridgeCall(fsBridgePort(channel.port2, 'fs-bridge-client'));

      await expect(call('fakeMethod', [])).rejects.toThrow(/Unknown method/);

      dispose();
    });

    it('should preserve error name across the bridge', async () => {
      const handlers = {
        async fail() {
          throw new TypeError('type mismatch');
        },
      };
      const channel = new MessageChannel();
      createBridgeServer(handlers, fsBridgePort(channel.port1, 'fs-bridge-server'));

      const { createBridgeCall } = await import('#transport/_internal/runtime-filesystem-bridge.js');
      const { call, dispose } = createBridgeCall(fsBridgePort(channel.port2, 'fs-bridge-client'));

      try {
        await call('fail', []);
        expect.fail('should have thrown');
      } catch (error) {
        expect((error as Error).message).toBe('type mismatch');
        expect((error as Error).name).toBe('TypeError');
      }

      dispose();
    });

    it('should preserve errno code across the bridge', async () => {
      const handlers = {
        async fail() {
          const error = new Error('ENOENT: not found') as NodeJS.ErrnoException;
          error.code = 'ENOENT';
          throw error;
        },
      };
      const channel = new MessageChannel();
      createBridgeServer(handlers, fsBridgePort(channel.port1, 'fs-bridge-server'));

      const { createBridgeCall } = await import('#transport/_internal/runtime-filesystem-bridge.js');
      const { call, dispose } = createBridgeCall(fsBridgePort(channel.port2, 'fs-bridge-client'));

      try {
        await call('fail', []);
        expect.fail('should have thrown');
      } catch (error) {
        expect((error as NodeJS.ErrnoException).code).toBe('ENOENT');
      }

      dispose();
    });

    it('should preserve this binding when dispatching methods', async () => {
      const handlers = {
        async getValue(): Promise<string> {
          return 'base';
        },
        async getDerived(): Promise<string> {
          const base = await this.getValue();
          return `${base}-derived`;
        },
      };
      const channel = new MessageChannel();
      createBridgeServer(handlers, fsBridgePort(channel.port1, 'fs-bridge-server'));

      const { createBridgeCall } = await import('#transport/_internal/runtime-filesystem-bridge.js');
      const { call, dispose } = createBridgeCall(fsBridgePort(channel.port2, 'fs-bridge-client'));

      const result = await call('getDerived', []);
      expect(result).toBe('base-derived');
      dispose();
    });

    it('should handle non-Error throws gracefully', async () => {
      const handlers = {
        async fail() {
          // oxlint-disable-next-line @typescript-eslint/only-throw-error -- testing non-Error throw
          throw 'string error';
        },
      };
      const channel = new MessageChannel();
      createBridgeServer(handlers, fsBridgePort(channel.port1, 'fs-bridge-server'));

      const { createBridgeCall } = await import('#transport/_internal/runtime-filesystem-bridge.js');
      const { call, dispose } = createBridgeCall(fsBridgePort(channel.port2, 'fs-bridge-client'));

      await expect(call('fail', [])).rejects.toThrow('string error');
      dispose();
    });
  });

  describe('createBridgeCall', () => {
    it('should call a method and return the result', async () => {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- filesystem paths use non-camelCase names
      const fs = makeFs({ '/test.txt': 'hello' });
      const channel = new MessageChannel();
      createBridgeServer(fs, fsBridgePort(channel.port1, 'fs-bridge-server'));

      const { createBridgeCall } = await import('#transport/_internal/runtime-filesystem-bridge.js');
      const { call, dispose } = createBridgeCall(fsBridgePort(channel.port2, 'fs-bridge-client'));

      const result = await call('readFile', ['/test.txt', 'utf8']);
      expect(result).toBe('hello');
      dispose();
    });

    it('should reject with reconstructed error on failure', async () => {
      const fs = makeFs();
      const channel = new MessageChannel();
      createBridgeServer(fs, fsBridgePort(channel.port1, 'fs-bridge-server'));

      const { createBridgeCall } = await import('#transport/_internal/runtime-filesystem-bridge.js');
      const { call, dispose } = createBridgeCall(fsBridgePort(channel.port2, 'fs-bridge-client'));

      await expect(call('readFile', ['/nope.txt', 'utf8'])).rejects.toThrow('ENOENT');
      dispose();
    });

    it('should timeout when server never responds', async () => {
      vi.useFakeTimers();

      try {
        const channel = new MessageChannel();
        const { createBridgeCall } = await import('#transport/_internal/runtime-filesystem-bridge.js');
        const { call, dispose } = createBridgeCall(fsBridgePort(channel.port2, 'fs-bridge-client'));

        const callPromise = call('readFile', ['/never.txt']);
        const expectation = expect(callPromise).rejects.toThrow("Bridge call 'readFile' timed out");

        await vi.advanceTimersByTimeAsync(30_000);
        await expectation;
        dispose();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should reject pending calls on dispose', async () => {
      const channel = new MessageChannel();
      const { createBridgeCall } = await import('#transport/_internal/runtime-filesystem-bridge.js');
      const { call, dispose } = createBridgeCall(fsBridgePort(channel.port2, 'fs-bridge-client'));

      const callPromise = call('readFile', ['/pending.txt']);
      dispose();

      await expect(callPromise).rejects.toThrow('Bridge proxy closed');
      channel.port1.close();
    });
  });

  describe('proxy call timeout', () => {
    it('should reject with timeout error when server never responds', async () => {
      vi.useFakeTimers();

      try {
        const channel = new MessageChannel();
        const proxy = createBridgeProxy<RuntimeFileSystemBase>(fsBridgePort(channel.port2, 'fs-bridge-client'));

        const readPromise = proxy.readFile('/never.txt', 'utf8');
        const expectation = expect(readPromise).rejects.toThrow("Bridge call 'readFile' timed out");

        await vi.advanceTimersByTimeAsync(30_000);
        await expectation;
      } finally {
        vi.useRealTimers();
      }
    });

    it('should not reject before timeout elapses when server responds in time', async () => {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- filesystem paths use non-camelCase names
      const fs = makeFs({ '/fast.txt': 'quick' });
      const channel = new MessageChannel();
      createBridgeServer(fs, fsBridgePort(channel.port1, 'fs-bridge-server'));
      const proxy = createBridgeProxy<RuntimeFileSystemBase>(fsBridgePort(channel.port2, 'fs-bridge-client'));

      const content = await proxy.readFile('/fast.txt', 'utf8');
      expect(content).toBe('quick');
    });
  });

  describe('FileSystemProxy dispose', () => {
    it('should reject pending calls when disposed', async () => {
      const channel = new MessageChannel();
      const proxy = createBridgeProxy<RuntimeFileSystemBase>(fsBridgePort(channel.port2, 'fs-bridge-client'));

      const readPromise = proxy.readFile('/pending.txt', 'utf8');
      proxy.dispose();

      await expect(readPromise).rejects.toThrow('Bridge proxy closed');
      channel.port1.close();
    });

    it('should reject multiple pending calls when disposed', async () => {
      const channel = new MessageChannel();
      const proxy = createBridgeProxy<RuntimeFileSystemBase>(fsBridgePort(channel.port2, 'fs-bridge-client'));

      const read1 = proxy.readFile('/a.txt', 'utf8');
      const read2 = proxy.readFile('/b.txt', 'utf8');
      const write1 = proxy.writeFile('/c.txt', 'data');
      proxy.dispose();

      await expect(read1).rejects.toThrow('Bridge proxy closed');
      await expect(read2).rejects.toThrow('Bridge proxy closed');
      await expect(write1).rejects.toThrow('Bridge proxy closed');
      channel.port1.close();
    });

    it('should throw synchronously when calling methods after dispose', () => {
      const channel = new MessageChannel();
      const proxy = createBridgeProxy<RuntimeFileSystemBase>(fsBridgePort(channel.port2, 'fs-bridge-client'));

      proxy.dispose();

      // The disposed guard throws in the Proxy get trap (before the async
      // function is constructed), so we test property access, not invocation.
      expect(() => Reflect.get(proxy, 'readFile')).toThrow('Bridge proxy has been disposed');
    });

    it('should remain in a closed state after disposing twice', () => {
      const channel = new MessageChannel();
      const proxy = createBridgeProxy<RuntimeFileSystemBase>(fsBridgePort(channel.port2, 'fs-bridge-client'));

      proxy.dispose();
      proxy.dispose();

      expect(() => Reflect.get(proxy, 'readFile')).toThrow('Bridge proxy has been disposed');
    });
  });

  describe('createBridgePort convenience', () => {
    it('should return a BridgePort with a working port', async () => {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- filesystem paths use non-camelCase names
      const fs = makeFs({ '/port.txt': 'via port' });
      const { port } = createBridgePort(fs);
      const proxy = createBridgeProxy<RuntimeFileSystemBase>(fsBridgePort(port, 'fs-bridge-client'));

      const content = await proxy.readFile('/port.txt', 'utf8');
      expect(content).toBe('via port');
    });

    it('should support write operations through the port', async () => {
      const fs = makeFs();
      const { port } = createBridgePort(fs);
      const proxy = createBridgeProxy<RuntimeFileSystemBase>(fsBridgePort(port, 'fs-bridge-client'));

      await proxy.writeFile('/new.txt', 'new data');
      const content = await proxy.readFile('/new.txt', 'utf8');
      expect(content).toBe('new data');
    });

    it('should close both ports on dispose, preventing further communication', async () => {
      vi.useFakeTimers();
      try {
        const handler = vi.fn().mockResolvedValue('ok');
        const handle = createBridgePort({ ping: handler });
        const proxy = createBridgeProxy<{ ping(): Promise<string> }>(fsBridgePort(handle.port, 'fs-bridge-client'));

        expect(await proxy.ping()).toBe('ok');
        expect(handler).toHaveBeenCalledOnce();

        handle.dispose();

        const pendingCall = proxy.ping();
        const expectation = expect(pendingCall).rejects.toThrow('timed out');
        await vi.advanceTimersByTimeAsync(30_000);
        await expectation;
        expect(handler).toHaveBeenCalledOnce();

        proxy.dispose();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('bridge disconnect lifecycle', () => {
    it('should fire server onDisconnect when the client port is closed', async () => {
      const onDisconnect = vi.fn();
      const channel = new MessageChannel();
      createBridgeServer({}, fsBridgePort(channel.port1, 'fs-bridge-server'), { onDisconnect });

      const { createBridgeCall } = await import('#transport/_internal/runtime-filesystem-bridge.js');
      const { dispose } = createBridgeCall(fsBridgePort(channel.port2, 'fs-bridge-client'));

      dispose();

      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });

      expect(onDisconnect).toHaveBeenCalledOnce();

      channel.port1.close();
    });
  });

  describe('createBridgeServer primitive purity', () => {
    it('should dispatch exactly the args supplied by the client without injection', async () => {
      // After the per-port wrapper migration, the bridge primitive is a
      // dumb dispatcher: it passes user args verbatim with no slot
      // padding, no context injection, no out-of-band metadata. This
      // pins that contract — any future regression that re-introduces
      // implicit arg manipulation fails here.
      const writeFile = vi.fn().mockResolvedValue(undefined);
      const channel = new MessageChannel();
      createBridgeServer({ writeFile }, fsBridgePort(channel.port1, 'fs-bridge-server'));

      const { createBridgeCall } = await import('#transport/_internal/runtime-filesystem-bridge.js');
      const { call, dispose } = createBridgeCall(fsBridgePort(channel.port2, 'fs-bridge-client'));
      const bytes = new TextEncoder().encode('x');
      await call('writeFile', ['/f.txt', bytes]);

      expect(writeFile).toHaveBeenCalledTimes(1);
      const recordedArgs = writeFile.mock.calls[0]!;
      expect(recordedArgs).toHaveLength(2);
      // The bridge serialises the Uint8Array — assert structural equality on the bytes.
      expect(recordedArgs[0]).toBe('/f.txt');
      expect(recordedArgs[1]).toBeInstanceOf(Uint8Array);

      dispose();
      channel.port1.close();
    });

    it('should not emit legacy fileChanged push messages on mutating RPC alone', async () => {
      const writeFile = vi.fn().mockResolvedValue(undefined);
      const channel = new MessageChannel();
      createBridgeServer({ writeFile }, fsBridgePort(channel.port1, 'fs-bridge-server'));

      const { createBridgeCall } = await import('#transport/_internal/runtime-filesystem-bridge.js');
      const { call, listen, dispose } = createBridgeCall(fsBridgePort(channel.port2, 'fs-bridge-client'));
      const received: unknown[] = [];
      const off = listen('fileChanged', (data) => {
        received.push(data);
      });
      const bytes = new TextEncoder().encode('z');
      await call('writeFile', ['/w.txt', bytes]);
      expect(received).toHaveLength(0);
      off();
      dispose();
      channel.port1.close();
    });
  });

  describe('ChangeEventBus bridge broadcasting', () => {
    it('should broadcast change events to all connected ports via listen()', async () => {
      const { exposeFileSystem } = await import('#filesystem/filesystem-bridge.js');
      const { createBridgeCall } = await import('#transport/_internal/runtime-filesystem-bridge.js');

      const changeEventBus = {
        subscribe: vi.fn((handler: (event: unknown, originClientId?: string) => void) => {
          (changeEventBus as { _handler?: (event: unknown, originClientId?: string) => void })._handler = handler;
          return () => {
            (changeEventBus as { _handler?: undefined })._handler = undefined;
          };
        }),
      };

      const originalSelf = globalThis.self;
      const listeners = new Map<string, Set<(event: MessageEvent) => void>>();

      globalThis.self = {
        addEventListener(type: string, handler: (event: MessageEvent) => void) {
          if (!listeners.has(type)) {
            listeners.set(type, new Set());
          }
          listeners.get(type)!.add(handler);
        },
        removeEventListener(type: string, handler: (event: MessageEvent) => void) {
          listeners.get(type)?.delete(handler);
        },
      } as unknown as typeof globalThis.self;

      try {
        const handle = exposeFileSystem({ readFile: vi.fn() }, { changeEventBus });

        const channel = new MessageChannel();
        const messageHandler = listeners.get('message')?.values().next().value;

        messageHandler?.({
          data: { type: 'connect', port: channel.port1 },
        } as MessageEvent);

        const received: unknown[] = [];
        const bridgeClient = createBridgeCall(fsBridgePort(channel.port2, 'fs-bridge-client'));
        const off = bridgeClient.listen('fileChanged', (data) => {
          received.push(data);
        });

        await new Promise<void>((resolve) => {
          setTimeout(resolve, 50);
        });

        const testEvent = { type: 'fileWritten', path: '/test.ts', backend: 'indexeddb' };
        (changeEventBus as { _handler?: (event: unknown, originClientId?: string) => void })._handler?.(
          testEvent,
          undefined,
        );

        await new Promise<void>((resolve) => {
          setTimeout(resolve, 50);
        });

        expect(received).toHaveLength(1);
        expect(received[0]).toEqual(testEvent);

        off();
        bridgeClient.dispose();
        handle.cleanup();
      } finally {
        globalThis.self = originalSelf;
      }
    });
  });

  describe('SharedPool bridge integration', () => {
    function createTestPool(totalBytes = 64 * 1024, maxEntries = 64) {
      const buffer = new SharedArrayBuffer(totalBytes);
      return new SharedPool(buffer, { maxEntries });
    }

    /**
     * Count outbound `WireCall` (`k:'c'`) frames only — broadcast subscription
     * setup (`k:'l'`) is unrelated framework chatter and not "extra RPC traffic"
     * for the cache hit being measured.
     */
    const countCallFrames = (spy: ReturnType<typeof vi.spyOn>): number => {
      let count = 0;
      for (const callArguments of spy.mock.calls) {
        const message = callArguments[0] as { v?: number; k?: string } | undefined;
        if (message?.v === 1 && message.k === 'c') {
          count += 1;
        }
      }
      return count;
    };

    it('should resolve readFile from pool without dispatching an RPC call', async () => {
      const pool = createTestPool();

      pool.store('/cached.txt', new TextEncoder().encode('from pool'));

      const channel = new MessageChannel();
      const postMessageSpy = vi.spyOn(channel.port2, 'postMessage');

      const bridge = await import('#transport/_internal/runtime-filesystem-bridge.js');
      const { call, dispose } = bridge.createBridgeCall(fsBridgePort(channel.port2, 'fs-bridge-client'), {
        filePool: pool,
      });

      const result = await call('readFile', ['/cached.txt']);
      expect(result).toBeInstanceOf(Uint8Array);
      expect(new TextDecoder().decode(result as Uint8Array<ArrayBuffer>)).toBe('from pool');
      expect(countCallFrames(postMessageSpy)).toBe(0);

      dispose();
    });

    it('should resolve readFile utf8 from pool without dispatching an RPC call', async () => {
      const pool = createTestPool();

      pool.store('/cached.txt', new TextEncoder().encode('utf8 from pool'));

      const channel = new MessageChannel();
      const postMessageSpy = vi.spyOn(channel.port2, 'postMessage');

      const bridge = await import('#transport/_internal/runtime-filesystem-bridge.js');
      const { call, dispose } = bridge.createBridgeCall(fsBridgePort(channel.port2, 'fs-bridge-client'), {
        filePool: pool,
      });

      const result = await call('readFile', ['/cached.txt', 'utf8']);
      expect(result).toBe('utf8 from pool');
      expect(countCallFrames(postMessageSpy)).toBe(0);

      dispose();
    });

    it('should fall through to bridge RPC on pool miss', async () => {
      const pool = createTestPool();

      const fs = makeFs({ '/on-disk.txt': 'from bridge' });
      const channel = new MessageChannel();
      createBridgeServer(fs, fsBridgePort(channel.port1, 'fs-bridge-server'));

      const bridge = await import('#transport/_internal/runtime-filesystem-bridge.js');
      const { call, dispose } = bridge.createBridgeCall(fsBridgePort(channel.port2, 'fs-bridge-client'), {
        filePool: pool,
      });

      const result = await call('readFile', ['/on-disk.txt', 'utf8']);
      expect(result).toBe('from bridge');

      dispose();
    });

    it('should populate pool after successful readFile on server side', async () => {
      const pool = createTestPool();

      // eslint-disable-next-line @typescript-eslint/naming-convention -- filesystem paths use non-camelCase names
      const fs = makeFs({ '/server.txt': 'server data' });
      const channel = new MessageChannel();
      createBridgeServer(fs, fsBridgePort(channel.port1, 'fs-bridge-server'), { filePool: pool });

      const proxy = createBridgeProxy<RuntimeFileSystemBase>(fsBridgePort(channel.port2, 'fs-bridge-client'));
      await proxy.readFile('/server.txt');

      const cached = pool.resolveCopy('/server.txt');
      expect(cached).toBeDefined();
      expect(new TextDecoder().decode(cached)).toBe('server data');

      proxy.dispose();
    });

    it('should not double-store readFile results into the client pool (single-writer invariant)', async () => {
      // Reproduces the v6 regression: when the client (kernel-side) bridge proxy
      // writes back into its own SharedPool, the server-side invalidate() leaves
      // the client's duplicate slot READY and findEntry returns stale bytes for
      // ~225 ms — the exact window in which the parameter-file watch re-render
      // runs. The cache key is content-derived, so the next render hits the
      // geometry memory cache and the user's first parameter edit is dropped.
      const buffer = new SharedArrayBuffer(64 * 1024);
      const writerPool = new SharedPool(buffer, { maxEntries: 64 });
      const readerPool = new SharedPool(buffer, { maxEntries: 64 });

      // eslint-disable-next-line @typescript-eslint/naming-convention -- filesystem paths use non-camelCase names
      const fs = makeFs({ '/params.json': 'V0' });
      const channel = new MessageChannel();
      // Server-side store mirrors WorkspaceFileService.readFile production behavior.
      createBridgeServer(fs, fsBridgePort(channel.port1, 'fs-bridge-server'), { filePool: writerPool });

      const { call, dispose } = createBridgeCall(fsBridgePort(channel.port2, 'fs-bridge-client'), {
        filePool: readerPool,
      });

      const initial = await call('readFile', ['/params.json']);
      expect(initial).toBeInstanceOf(Uint8Array);

      // Server-side mutation: the writer marks its arena slot stale.
      writerPool.invalidate('/params.json');

      // Reader must observe the invalidation. With the v6 client-side write-back
      // a duplicate READY slot would survive and resolveCopy would return V0.
      expect(readerPool.resolveCopy('/params.json')).toBeUndefined();

      dispose();
    });

    it('should work identically without pool (progressive enhancement)', async () => {
      const fs = makeFs({ '/no-pool.txt': 'no pool data' });
      const channel = new MessageChannel();
      createBridgeServer(fs, fsBridgePort(channel.port1, 'fs-bridge-server'));

      const bridge = await import('#transport/_internal/runtime-filesystem-bridge.js');
      const { call, dispose } = bridge.createBridgeCall(fsBridgePort(channel.port2, 'fs-bridge-client'));

      const result = await call('readFile', ['/no-pool.txt', 'utf8']);
      expect(result).toBe('no pool data');

      dispose();
    });
  });

  describe('broadcast invalidation', () => {
    /*
     * Reader-side pool invalidation reacts to `fileChanged` frames on the bridge.
     * The FM worker fans those out from ChangeEventBus via exposeFileSystem; a bare
     * createBridgeServer + in-memory RuntimeFileSystem does not synthesize events
     * on mutating RPC (R13). Use `emit` from the server handle to assert client behaviour.
     */
    it('should not synthesize fileChanged from mutating RPC on the bare bridge', async () => {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- filesystem paths use non-camelCase names
      const fs = makeFs({ '/cached.txt': 'initial' });
      const channel = new MessageChannel();
      createBridgeServer(fs, fsBridgePort(channel.port1, 'fs-bridge-server'));

      const bridge = await import('#transport/_internal/runtime-filesystem-bridge.js');
      const { call, listen, dispose } = bridge.createBridgeCall(fsBridgePort(channel.port2, 'fs-bridge-client'));

      const received: string[] = [];
      listen('fileChanged', (data) => {
        const event = data as { path?: string };
        if (event.path !== undefined) {
          received.push(event.path);
        }
      });

      await call('writeFile', ['/cached.txt', new TextEncoder().encode('updated')]);
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });

      expect(received).toEqual([]);

      dispose();
    });

    it('should auto-invalidate the reader cache when fileChanged arrives', async () => {
      const pool = new SharedPool(new SharedArrayBuffer(4 * 1024 * 1024));
      pool.store('/cached.txt', new TextEncoder().encode('initial'));

      // eslint-disable-next-line @typescript-eslint/naming-convention -- filesystem paths use non-camelCase names
      const fs = makeFs({ '/cached.txt': 'on disk' });
      const channel = new MessageChannel();
      const { emit } = createBridgeServer(fs, fsBridgePort(channel.port1, 'fs-bridge-server'));

      const bridge = await import('#transport/_internal/runtime-filesystem-bridge.js');
      const { call, dispose } = bridge.createBridgeCall(fsBridgePort(channel.port2, 'fs-bridge-client'), {
        filePool: pool,
      });

      const before = await call('readFile', ['/cached.txt', 'utf8']);
      expect(before).toBe('initial');

      emit('fileChanged', { path: '/cached.txt' });
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });

      expect(pool.resolveCopy('/cached.txt')).toBeUndefined();

      dispose();
    });
  });

  describe('extractTransferables', () => {
    it('should extract ArrayBuffer', () => {
      const buffer = new ArrayBuffer(8);
      const result = extractTransferables(buffer);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(buffer);
    });

    it('should extract Uint8Array buffer', () => {
      const array = new Uint8Array([1, 2, 3]);
      const result = extractTransferables(array);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(array.buffer);
    });

    it('should extract from nested objects', () => {
      const a = new Uint8Array([1]);
      const b = new Uint8Array([2]);
      const result = extractTransferables({ data: a, nested: { other: b } });
      expect(result).toHaveLength(2);
      expect(result).toContain(a.buffer);
      expect(result).toContain(b.buffer);
    });

    it('should extract from arrays', () => {
      const a = new Uint8Array([1]);
      const b = new Uint8Array([2]);
      const result = extractTransferables([a, b]);
      expect(result).toHaveLength(2);
      expect(result).toContain(a.buffer);
      expect(result).toContain(b.buffer);
    });

    it('should de-duplicate same ArrayBuffer referenced twice', () => {
      const shared = new ArrayBuffer(8);
      const view1 = new Uint8Array(shared);
      const view2 = new Float32Array(shared);
      const result = extractTransferables([view1, view2]);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(shared);
    });

    it('should return empty array for non-transferable values', () => {
      expect(extractTransferables('string')).toHaveLength(0);
      expect(extractTransferables(42)).toHaveLength(0);
      expect(extractTransferables(null)).toHaveLength(0);
      expect(extractTransferables(undefined)).toHaveLength(0);
      expect(extractTransferables({ key: 'value' })).toHaveLength(0);
    });

    it('should find the shared ArrayBuffer when using new Uint8Array(data.buffer)', () => {
      const original = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);
      const viewOfSameBuffer = new Uint8Array(original.buffer);

      const transferables = extractTransferables([viewOfSameBuffer]);
      expect(transferables).toHaveLength(1);
      expect(transferables[0]).toBe(original.buffer);
    });

    it('should NOT find the original ArrayBuffer when using new Uint8Array(data) (copy)', () => {
      const original = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);
      const copy = new Uint8Array(original);

      const transferables = extractTransferables([copy]);
      expect(transferables).toHaveLength(1);
      expect(transferables[0]).not.toBe(original.buffer);

      expect(original.byteLength).toBe(4);
      expect(original[0]).toBe(0x67);
    });
  });

  describe('createBridgeProxy', () => {
    it('should dispatch method calls to the server', async () => {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- filesystem paths use non-camelCase names
      const fs = makeFs({ '/test.txt': 'proxy test' });
      const channel = new MessageChannel();
      createBridgeServer(fs, fsBridgePort(channel.port1, 'fs-bridge-server'));

      type TestProtocol = {
        readFile(path: string, encoding: 'utf8'): Promise<string>;
        exists(path: string): Promise<boolean>;
      };
      const proxy = createBridgeProxy<TestProtocol>(fsBridgePort(channel.port2, 'fs-bridge-client'));

      const content = await proxy.readFile('/test.txt', 'utf8');
      expect(content).toBe('proxy test');

      const exists = await proxy.exists('/test.txt');
      expect(exists).toBe(true);

      proxy.dispose();
    });

    it('should propagate errors from the server', async () => {
      const fs = makeFs();
      const channel = new MessageChannel();
      createBridgeServer(fs, fsBridgePort(channel.port1, 'fs-bridge-server'));

      type TestProtocol = {
        readFile(path: string, encoding: 'utf8'): Promise<string>;
      };
      const proxy = createBridgeProxy<TestProtocol>(fsBridgePort(channel.port2, 'fs-bridge-client'));

      await expect(proxy.readFile('/nonexistent.txt', 'utf8')).rejects.toThrow('ENOENT');
      proxy.dispose();
    });

    it('should reject pending calls on dispose', async () => {
      const channel = new MessageChannel();

      type TestProtocol = {
        readFile(path: string): Promise<string>;
      };
      const proxy = createBridgeProxy<TestProtocol>(fsBridgePort(channel.port2, 'fs-bridge-client'));

      const promise = proxy.readFile('/pending.txt');
      proxy.dispose();

      await expect(promise).rejects.toThrow('Bridge proxy closed');
      channel.port1.close();
    });

    it('should reject unknown methods with server error', async () => {
      const handlers = {};
      const channel = new MessageChannel();
      createBridgeServer(handlers, fsBridgePort(channel.port1, 'fs-bridge-server'));

      type TestProtocol = {
        nonexistent(): Promise<void>;
      };
      const proxy = createBridgeProxy<TestProtocol>(fsBridgePort(channel.port2, 'fs-bridge-client'));

      await expect(proxy.nonexistent()).rejects.toThrow('Unknown method');
      proxy.dispose();
    });
  });

  describe('catchMessages', () => {
    it('should buffer messages and replay them', async () => {
      const channel = new MessageChannel();
      const received: string[] = [];

      const replay = catchMessages(channel.port1);

      channel.port2.postMessage('first');
      channel.port2.postMessage('second');
      channel.port2.postMessage('third');

      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });

      // oxlint-disable-next-line unicorn/prefer-add-event-listener -- MessagePort requires onmessage (implicitly calls start(); addEventListener does not)
      channel.port1.onmessage = (event: MessageEvent): void => {
        received.push(event.data as string);
      };

      replay();

      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });

      expect(received).toEqual(['first', 'second', 'third']);
    });

    it('should preserve message ordering', async () => {
      const channel = new MessageChannel();
      const received: number[] = [];

      const replay = catchMessages(channel.port1);

      for (let index = 0; index < 10; index++) {
        channel.port2.postMessage(index);
      }

      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });

      // oxlint-disable-next-line unicorn/prefer-add-event-listener -- MessagePort requires onmessage (implicitly calls start(); addEventListener does not)
      channel.port1.onmessage = (event: MessageEvent): void => {
        received.push(event.data as number);
      };

      replay();

      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });

      expect(received).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('should not lose messages sent before server is ready', async () => {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- filesystem paths use non-camelCase names
      const fs = makeFs({ '/early.txt': 'early bird' });
      const channel = new MessageChannel();

      const replay = catchMessages(channel.port1);

      const { createBridgeCall } = await import('#transport/_internal/runtime-filesystem-bridge.js');
      const { call, dispose } = createBridgeCall(fsBridgePort(channel.port2, 'fs-bridge-client'));

      const readPromise = call('readFile', ['/early.txt', 'utf8']);

      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });

      createBridgeServer(fs, fsBridgePort(channel.port1, 'fs-bridge-server'));
      replay();

      const content = await readPromise;
      expect(content).toBe('early bird');
      dispose();
    });
  });
});
