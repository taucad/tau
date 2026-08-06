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
