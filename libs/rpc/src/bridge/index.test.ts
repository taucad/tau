import { describe, expect, it, vi } from 'vitest';
import {
  createBridgeCall,
  createBridgePort,
  createBridgeProxy,
  createBridgeServer,
  extractTransferables,
} from '@taucad/rpc/bridge';
import { wrapMessagePort } from '@taucad/rpc';

const wrapBridgePort = (port: MessagePort) => {
  const wrapped = wrapMessagePort<unknown>(port, { label: 'bridge-test' });
  if (wrapped.start !== undefined) {
    wrapped.start();
  }
  return wrapped;
};

describe('@taucad/rpc/bridge', () => {
  it('should call methods through a bridge proxy and preserve returned bytes', async () => {
    const channel = new MessageChannel();
    const serverPort = wrapBridgePort(channel.port1);
    const clientPort = wrapBridgePort(channel.port2);
    createBridgeServer(
      {
        async loadBytes(path: string): Promise<Uint8Array<ArrayBuffer>> {
          return new TextEncoder().encode(`content:${path}`);
        },
      },
      serverPort,
    );
    const proxy = createBridgeProxy<{ loadBytes(path: string): Promise<Uint8Array<ArrayBuffer>> }>(clientPort);

    const bytes = await proxy.loadBytes('/main.ts');

    expect(new TextDecoder().decode(bytes)).toBe('content:/main.ts');
    proxy.dispose();
  });

  it('should deliver server events to listen subscribers', async () => {
    const channel = new MessageChannel();
    const server = createBridgeServer({}, wrapBridgePort(channel.port1));
    const client = createBridgeCall(wrapBridgePort(channel.port2));
    const handler = vi.fn();

    client.listen('resourceChanged', handler);
    server.emit('resourceChanged', { path: '/main.ts' });

    await vi.waitFor(() => {
      expect(handler).toHaveBeenCalledWith({ path: '/main.ts' });
    });
    client.dispose();
  });

  it('should acknowledge a watch only after the server installs it', async () => {
    const channel = new MessageChannel();
    const unsubscribe = vi.fn();
    const watch = vi.fn(() => unsubscribe);
    createBridgeServer({ watch }, wrapBridgePort(channel.port1));
    const client = createBridgeCall(wrapBridgePort(channel.port2));

    const handle = client.watchReady({ paths: ['/main.ts'] }, vi.fn());
    expect(watch).not.toHaveBeenCalled();
    await handle.ready;
    expect(watch).toHaveBeenCalledWith({ paths: ['/main.ts'] }, expect.any(Function));

    handle.unsubscribe();
    await vi.waitFor(() => {
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
    client.dispose();
  });

  it('keeps watch readiness pending until asynchronous registration settles and preserves queued event order', async () => {
    const channel = new MessageChannel();
    let finishRegistration!: (unsubscribe: () => void) => void;
    const registration = new Promise<() => void>((resolve) => {
      finishRegistration = resolve;
    });
    let emit!: (event: { path: string }) => void;
    const unsubscribe = vi.fn();
    createBridgeServer(
      {
        async watch(_request: unknown, handler: (event: { path: string }) => void): Promise<() => void> {
          emit = handler;
          return registration;
        },
      },
      wrapBridgePort(channel.port1),
    );
    const client = createBridgeCall<unknown, { path: string }>(wrapBridgePort(channel.port2));
    const events: Array<{ path: string }> = [];
    const handle = client.watchReady({}, (event) => {
      events.push(event);
    });
    await vi.waitFor(() => {
      expect(emit).toBeTypeOf('function');
    });
    emit({ path: 'first' });
    emit({ path: 'second' });
    const pendingMarker = Symbol('pending');
    expect(await Promise.race([handle.ready, Promise.resolve(pendingMarker)])).toBe(pendingMarker);
    expect(events).toEqual([]);

    finishRegistration(unsubscribe);
    await handle.ready;
    await vi.waitFor(() => {
      expect(events).toEqual([{ path: 'first' }, { path: 'second' }]);
    });

    handle.unsubscribe();
    await vi.waitFor(() => {
      expect(unsubscribe).toHaveBeenCalledOnce();
    });
    client.dispose();
  });

  it('suppresses a late watch acknowledgement after cancellation and disposes the eventual registration once', async () => {
    const channel = new MessageChannel();
    let finishRegistration!: (unsubscribe: () => void) => void;
    let emit!: (event: { path: string }) => void;
    const unsubscribe = vi.fn();
    createBridgeServer(
      {
        async watch(_request: unknown, handler: (event: { path: string }) => void): Promise<() => void> {
          emit = handler;
          return new Promise((resolve) => {
            finishRegistration = resolve;
          });
        },
      },
      wrapBridgePort(channel.port1),
    );
    const client = createBridgeCall<unknown, { path: string }>(wrapBridgePort(channel.port2));
    const handler = vi.fn();
    const handle = client.watchReady({}, handler);

    await vi.waitFor(() => {
      expect(finishRegistration).toBeTypeOf('function');
    });
    handle.unsubscribe();
    await expect(handle.ready).rejects.toThrow(/aborted|closed before registration/u);
    emit({ path: 'late' });
    finishRegistration(unsubscribe);

    await vi.waitFor(() => {
      expect(unsubscribe).toHaveBeenCalledOnce();
    });
    expect(handler).not.toHaveBeenCalled();
    client.dispose();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('disposes an asynchronous watch that finishes registering after the server closes', async () => {
    const channel = new MessageChannel();
    let finishRegistration!: (unsubscribe: () => void) => void;
    const unsubscribe = vi.fn();
    const server = createBridgeServer(
      {
        async watch(): Promise<() => void> {
          return new Promise((resolve) => {
            finishRegistration = resolve;
          });
        },
      },
      wrapBridgePort(channel.port1),
    );
    const client = createBridgeCall(wrapBridgePort(channel.port2));
    const handle = client.watchReady({}, vi.fn());

    await vi.waitFor(() => {
      expect(finishRegistration).toBeTypeOf('function');
    });
    server.dispose();
    await expect(handle.ready).rejects.toThrow(/closed/u);
    finishRegistration(unsubscribe);

    await vi.waitFor(() => {
      expect(unsubscribe).toHaveBeenCalledOnce();
    });
    client.dispose();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('cleans up rejected asynchronous registration without disturbing the next watch', async () => {
    const channel = new MessageChannel();
    const unsubscribe = vi.fn();
    let attempt = 0;
    createBridgeServer(
      {
        async watch(): Promise<() => void> {
          attempt += 1;
          if (attempt === 1) {
            throw Object.assign(new Error('root rejected'), { code: 'EACCES' });
          }
          return unsubscribe;
        },
      },
      wrapBridgePort(channel.port1),
    );
    const client = createBridgeCall(wrapBridgePort(channel.port2));

    const rejected = client.watchReady({}, vi.fn());
    await expect(rejected.ready).rejects.toMatchObject({ code: 'EACCES' });
    const accepted = client.watchReady({}, vi.fn());
    await accepted.ready;
    accepted.unsubscribe();
    await vi.waitFor(() => {
      expect(unsubscribe).toHaveBeenCalledOnce();
    });
    client.dispose();
  });

  it('continues shutdown cleanup when one watch disposer throws', async () => {
    const channel = new MessageChannel();
    const secondUnsubscribe = vi.fn();
    let attempt = 0;
    const server = createBridgeServer(
      {
        watch(): () => void {
          attempt += 1;
          if (attempt === 1) {
            return () => {
              throw new Error('cleanup failed');
            };
          }
          return secondUnsubscribe;
        },
      },
      wrapBridgePort(channel.port1),
      {
        onDisconnect() {
          throw new Error('disconnect observer failed');
        },
      },
    );
    const client = createBridgeCall(wrapBridgePort(channel.port2));
    const first = client.watchReady({ path: 'first' }, vi.fn());
    const second = client.watchReady({ path: 'second' }, vi.fn());
    await Promise.all([first.ready, second.ready]);

    server.dispose();

    await vi.waitFor(() => {
      expect(secondUnsubscribe).toHaveBeenCalledOnce();
    });
    client.dispose();
  });

  it('should serialize thrown errors across the bridge', async () => {
    const channel = new MessageChannel();
    createBridgeServer(
      {
        async fail(): Promise<void> {
          throw Object.assign(new TypeError('bad input'), { code: 'EBADINPUT' });
        },
      },
      wrapBridgePort(channel.port1),
    );
    const client = createBridgeCall(wrapBridgePort(channel.port2));

    try {
      await client.call('fail', []);
      expect.fail('should have thrown');
    } catch (error) {
      expect((error as Error).name).toBe('TypeError');
      expect((error as Error).message).toBe('bad input');
      expect((error as { code?: string }).code).toBe('EBADINPUT');
    } finally {
      client.dispose();
    }
  });

  it('should close both ports from createBridgePort dispose', async () => {
    vi.useFakeTimers();
    try {
      const bridge = createBridgePort({ ping: vi.fn().mockResolvedValue('pong') });
      const proxy = createBridgeProxy<{ ping(): Promise<string> }>(wrapBridgePort(bridge.port));

      expect(await proxy.ping()).toBe('pong');
      bridge.dispose();

      const pending = expect(proxy.ping()).rejects.toThrow(/closed|timed out/u);
      await vi.advanceTimersByTimeAsync(30_000);
      await pending;
      proxy.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should publish an optional hello payload from createBridgePort', async () => {
    const bridge = createBridgePort({}, { hello: { capability: 'rooted' } });
    const client = createBridgeCall(wrapBridgePort(bridge.port));

    await client.ready;
    expect(client.hello.payload).toEqual({ capability: 'rooted' });

    client.dispose();
    bridge.dispose();
  });

  it('should collect unique transferable ArrayBuffers', () => {
    const buffer = new ArrayBuffer(8);
    const viewA = new Uint8Array(buffer, 0, 4);
    const viewB = new Uint8Array(buffer, 4, 4);

    expect(extractTransferables({ viewA, nested: [viewB] })).toEqual([buffer]);
  });

  it('applies method-specific deadlines without weakening ordinary calls', async () => {
    vi.useFakeTimers();
    let resolveCommit!: (value: string) => void;
    const commitResult = new Promise<string>((resolve) => {
      resolveCommit = resolve;
    });
    const channel = new MessageChannel();
    createBridgeServer(
      {
        ordinary: async () =>
          new Promise<never>(() => {
            void 0;
          }),
        commitPendingProjectDirectory: async () => commitResult,
      },
      wrapBridgePort(channel.port1),
    );
    const client = createBridgeCall(wrapBridgePort(channel.port2), {
      resolveCallTimeout: (method) => (method === 'commitPendingProjectDirectory' ? 'none' : 10),
    });

    try {
      const ordinary = expect(client.call('ordinary', [])).rejects.toThrow("Bridge call 'ordinary' timed out");
      const commit = client.call('commitPendingProjectDirectory', []);

      await vi.advanceTimersByTimeAsync(30_000);
      await ordinary;
      resolveCommit('committed');
      await expect(commit).resolves.toBe('committed');
    } finally {
      client.dispose();
      vi.useRealTimers();
    }
  });

  it('rejects a deadline-free call when the proxy is disposed', async () => {
    const channel = new MessageChannel();
    createBridgeServer(
      {
        commitPendingProjectDirectory: async () =>
          new Promise<never>(() => {
            void 0;
          }),
      },
      wrapBridgePort(channel.port1),
    );
    const client = createBridgeCall(wrapBridgePort(channel.port2), {
      resolveCallTimeout: () => 'none',
    });
    const pending = client.call('commitPendingProjectDirectory', []);

    client.dispose();

    await expect(pending).rejects.toThrow('Bridge proxy closed');
  });

  it('rejects invalid resolved deadlines before dispatch', async () => {
    const channel = new MessageChannel();
    const handler = vi.fn();
    createBridgeServer({ handler }, wrapBridgePort(channel.port1));
    const client = createBridgeCall(wrapBridgePort(channel.port2), {
      resolveCallTimeout: () => Number.POSITIVE_INFINITY,
    });

    try {
      await expect(client.call('handler', [])).rejects.toThrow(RangeError);
      expect(handler).not.toHaveBeenCalled();
    } finally {
      client.dispose();
    }
  });
});
