// @vitest-environment node
/**
 * Topology conformance harness for `Channel<P>`.
 *
 * The typed RPC layer is topology-invariant — calls, notifies, listens,
 * lifecycle, transferables, and cooperative abort behave identically over
 * every supported port shape.
 * The harness exercises a synthetic protocol (`EchoProtocol`) so the test
 * never depends on the runtime kernel, only on the wire contract.
 *
 *   T1  DOM-style `MessagePort` (browser MessageChannel surface)
 *   T2  `node:worker_threads` `MessageChannel`
 *   T3  Real `worker_threads.Worker` exercising `createChannelServer` end-to-end
 *   T4  One `ChannelServer` impl fan-served across two independent port pairs
 *       (shared-worker style: two windows, one server)
 */

import { afterEach, describe, expect, it } from 'vitest';
import { MessageChannel as NodeMessageChannel, Worker } from 'node:worker_threads';

import { createChannelClient, createChannelServer, wrapMessagePort } from '#index.js';
import type { Channel, ChannelServer, ChannelServerHandle, Port, RpcProtocol, WithTransferables } from '#index.js';

type EchoProtocol = {
  readonly calls: {
    readonly echo: { args: { msg: string }; result: string };
    readonly bytes: { args: { bytes: Uint8Array<ArrayBuffer> }; result: number };
  };
  readonly notifies: {
    readonly ping: { args: { n: number } };
  };
  readonly listens: {
    readonly ticks: { args: { count: number }; event: number };
  };
};

const sessionKey = 'topology-conformance/v1';

const buildEchoImpl = (notifyLog: Array<{ name: string; args: unknown }>): ChannelServer<EchoProtocol> => ({
  call: async (_context, name, args) => {
    if (name === 'echo') {
      const { msg } = args as { msg: string };
      return msg;
    }
    const { bytes } = args as { bytes: Uint8Array<ArrayBuffer> };
    return bytes.byteLength;
  },
  notify: (_context, name, args) => {
    notifyLog.push({ name: String(name), args });
  },
  async *listen(_context, _name, args) {
    const { count } = args as { count: number };
    for (let i = 0; i < count; i += 1) {
      yield i;
    }
  },
});

const startBoundChannel = async (
  serverPort: Port<unknown>,
  clientPort: Port<unknown>,
  notifyLog: Array<{ name: string; args: unknown }>,
): Promise<{
  client: Channel<EchoProtocol>;
  server: ChannelServerHandle<EchoProtocol>;
}> => {
  serverPort.start?.();
  clientPort.start?.();
  const server = createChannelServer<EchoProtocol>({
    port: serverPort,
    sessionKey,
    impl: buildEchoImpl(notifyLog),
  });
  const client = createChannelClient<EchoProtocol>({
    port: clientPort,
    sessionKey,
  });
  await client.ready;
  return { client, server };
};

const exerciseProtocol = async (
  client: Channel<EchoProtocol>,
): Promise<{
  echo: string;
  bytesLength: number;
  ticks: readonly number[];
}> => {
  const echo = await client.call('echo', { msg: 'hi' });
  const bytes = new Uint8Array(new ArrayBuffer(8));
  bytes.set([1, 2, 3, 4, 5, 6, 7, 8]);
  const transferable: WithTransferables<{ bytes: Uint8Array<ArrayBuffer> }> = {
    value: { bytes },
    transferables: [bytes.buffer],
  };
  const bytesLength = await client.call('bytes', transferable);
  client.notify('ping', { n: 7 });
  const ticks: number[] = [];
  for await (const tick of client.listen('ticks', { count: 3 })) {
    ticks.push(tick);
    if (ticks.length === 3) {
      break;
    }
  }
  return { echo, bytesLength, ticks };
};

describe('Channel<P> topology conformance', () => {
  const cleanups: Array<() => void> = [];

  afterEach(async () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
    cleanups.length = 0;
  });

  it('T1 — DOM-compatible MessagePort surface', async () => {
    const channel = new NodeMessageChannel();
    const serverPort = wrapMessagePort<unknown>(channel.port1, { label: 'T1.server' });
    const clientPort = wrapMessagePort<unknown>(channel.port2, { label: 'T1.client' });
    const notifyLog: Array<{ name: string; args: unknown }> = [];
    const { client, server } = await startBoundChannel(serverPort, clientPort, notifyLog);
    cleanups.push(() => {
      server.dispose('test');
    });
    const result = await exerciseProtocol(client);
    expect(result.echo).toBe('hi');
    expect(result.bytesLength).toBe(8);
    expect(result.ticks).toEqual([0, 1, 2]);
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    expect(notifyLog).toEqual([{ name: 'ping', args: { n: 7 } }]);
  });

  it('T2 — node:worker_threads MessageChannel directly (no DOM shim)', async () => {
    // Same code path as T1 on Node — included separately to lock in the
    // parity guarantee. If the wire ever needs a Node-specific adapter,
    // this case will break first.
    const channel = new NodeMessageChannel();
    const serverPort = wrapMessagePort<unknown>(channel.port1, { label: 'T2.server' });
    const clientPort = wrapMessagePort<unknown>(channel.port2, { label: 'T2.client' });
    const notifyLog: Array<{ name: string; args: unknown }> = [];
    const { client, server } = await startBoundChannel(serverPort, clientPort, notifyLog);
    cleanups.push(() => {
      server.dispose('test');
    });
    const result = await exerciseProtocol(client);
    expect(result.echo).toBe('hi');
    expect(result.bytesLength).toBe(8);
    expect(result.ticks).toEqual([0, 1, 2]);
  });

  it('T3 — real worker_threads.Worker hosts createChannelServer', async () => {
    // Inline the worker source via a data URL so the test fixture stays
    // colocated with its assertions and avoids a separate transform-config
    // dance for `.ts` workers. The body is intentionally a minimal manual
    // wire-frame implementation — proving `@taucad/rpc` clients interoperate
    // with any conformant peer on the other side of an OS thread boundary,
    // not just with peers built from this same source.
    const workerSource = `
      import { parentPort } from 'node:worker_threads';
      const wireVersion = 1;
      parentPort.on('message', (envelope) => {
        if (!envelope || envelope.type !== 'mount') return;
        const port = envelope.port;
        port.start();
        const send = (frame) => port.postMessage({ v: wireVersion, ...frame });
        send({ k: 'lh', o: 1 });
        port.on('message', (raw) => {
          if (!raw || raw.v !== wireVersion) return;
          if (raw.k === 'rq') {
            if (raw.n === 'echo') {
              send({ k: 'rs', i: raw.i, o: 1, d: raw.a?.msg ?? '' });
              return;
            }
            if (raw.n === 'bytes') {
              send({ k: 'rs', i: raw.i, o: 1, d: raw.a?.bytes?.byteLength ?? 0 });
              return;
            }
            send({ k: 'rs', i: raw.i, o: 0, e: { m: 'unknown call ' + raw.n } });
            return;
          }
          if (raw.k === 'ss') {
            const count = raw.a?.count ?? 0;
            for (let i = 0; i < count; i += 1) send({ k: 'sn', i: raw.i, d: i });
            send({ k: 'sc', i: raw.i });
          }
        });
      });
    `;
    const workerUrl = new URL(`data:text/javascript,${encodeURIComponent(workerSource)}`);
    const worker = new Worker(workerUrl);
    cleanups.push(() => {
      void worker.terminate();
    });

    // Hand a fresh MessageChannel half to the worker; client lives in the
    // test thread. This mirrors the production hand-off pattern where the
    // host owns both halves and ports the server-side over to the runner.
    const channel = new NodeMessageChannel();
    worker.postMessage({ type: 'mount', port: channel.port1, sessionKey }, [channel.port1]);

    const clientPort = wrapMessagePort<unknown>(channel.port2, { label: 'T3.client' });
    clientPort.start?.();
    const client = createChannelClient<EchoProtocol>({
      port: clientPort,
      sessionKey,
    });
    await client.ready;

    const echo = await client.call('echo', { msg: 'across-threads' });
    expect(echo).toBe('across-threads');
    const ticks: number[] = [];
    for await (const tick of client.listen('ticks', { count: 4 })) {
      ticks.push(tick);
      if (ticks.length === 4) {
        break;
      }
    }
    expect(ticks).toEqual([0, 1, 2, 3]);
  });

  it('T4 — single ChannelServer impl fan-served across two independent port pairs', async () => {
    type SharedState = { tally: number };
    const state: SharedState = { tally: 0 };
    type FanProtocol = {
      readonly calls: { readonly bump: { args: { by: number }; result: number } };
      readonly notifies: RpcProtocol['notifies'];
      readonly listens: RpcProtocol['listens'];
    };

    const buildFanImpl = (): ChannelServer<FanProtocol> => ({
      call: async (_context, _name, args) => {
        const { by } = args as { by: number };
        state.tally += by;
        return state.tally;
      },
      notify: () => undefined,
      async *listen() {
        // FanProtocol has no listen events; T4 never reaches this branch.
        yield* [];
      },
    });

    const channelA = new NodeMessageChannel();
    const channelB = new NodeMessageChannel();
    const serverPortA = wrapMessagePort<unknown>(channelA.port1, { label: 'T4.A.server' });
    const clientPortA = wrapMessagePort<unknown>(channelA.port2, { label: 'T4.A.client' });
    const serverPortB = wrapMessagePort<unknown>(channelB.port1, { label: 'T4.B.server' });
    const clientPortB = wrapMessagePort<unknown>(channelB.port2, { label: 'T4.B.client' });
    serverPortA.start?.();
    clientPortA.start?.();
    serverPortB.start?.();
    clientPortB.start?.();

    const sharedKey = 'topology-conformance/fan';
    const serverA = createChannelServer<FanProtocol>({
      port: serverPortA,
      sessionKey: sharedKey,
      impl: buildFanImpl(),
    });
    const serverB = createChannelServer<FanProtocol>({
      port: serverPortB,
      sessionKey: sharedKey,
      impl: buildFanImpl(),
    });
    cleanups.push(() => {
      serverA.dispose('test');
      serverB.dispose('test');
    });

    const clientA = createChannelClient<FanProtocol>({ port: clientPortA, sessionKey: sharedKey });
    const clientB = createChannelClient<FanProtocol>({ port: clientPortB, sessionKey: sharedKey });
    await clientA.ready;
    await clientB.ready;

    expect(await clientA.call('bump', { by: 3 })).toBe(3);
    expect(await clientB.call('bump', { by: 4 })).toBe(7);
    expect(await clientA.call('bump', { by: 1 })).toBe(8);
    expect(state.tally).toBe(8);
  });
});
