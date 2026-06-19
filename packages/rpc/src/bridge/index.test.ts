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

  it('should collect unique transferable ArrayBuffers', () => {
    const buffer = new ArrayBuffer(8);
    const viewA = new Uint8Array(buffer, 0, 4);
    const viewB = new Uint8Array(buffer, 4, 4);

    expect(extractTransferables({ viewA, nested: [viewB] })).toEqual([buffer]);
  });
});
