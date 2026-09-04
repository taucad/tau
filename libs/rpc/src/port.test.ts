import { describe, it, expect, vi } from 'vitest';
import { MessageChannel } from 'node:worker_threads';
import type { Codec, MessagePortMainLike, Port, WebSocketLike } from '#port.js';
import { wrapMessagePort, wrapMessagePortMain, wrapWebSocket } from '#port.js';
import { createChannelClient, createChannelServer } from '#channel.js';

describe('wrapMessagePort', () => {
  it('routes postMessage and onMessage with unsubscribe', () => {
    const handlers: Array<(d: string) => void> = [];
    const mock: Port<string> = {
      postMessage(data) {
        for (const h of handlers) {
          h(data);
        }
      },
      onMessage(handler) {
        handlers.push(handler);
        return () => {
          const index = handlers.indexOf(handler);
          if (index !== -1) {
            handlers.splice(index, 1);
          }
        };
      },
      close() {
        handlers.length = 0;
      },
    };
    const received: string[] = [];
    const off = mock.onMessage((d) => {
      received.push(d);
    });
    mock.postMessage('x');
    off();
    mock.postMessage('y');
    expect(received).toEqual(['x']);
  });

  it('wraps close errors with context', () => {
    const { port1 } = new MessageChannel();
    vi.spyOn(port1, 'close').mockImplementation(() => {
      throw new Error('fail');
    });
    const a = wrapMessagePort(port1, { label: 'P' });
    expect(() => {
      a.close();
    }).toThrow('P close failed');
  });
});

/* JSON stands in for the production msgpack codec, which lives in
 * `@taucad/runtime` (rpc declares no codec dependency). Only the byte-oriented
 * shape matters to the adapter. */
const jsonCodec: Codec = {
  encode: (value) => new TextEncoder().encode(JSON.stringify(value)),
  decode: (bytes) => JSON.parse(new TextDecoder().decode(bytes)) as unknown,
};

const connecting = 0;
const open = 1;
const closedState = 3;

/** Fake {@link WebSocketLike}: one listener per event type is all the adapter registers. */
class FakeWebSocket implements WebSocketLike {
  public binaryType = 'nodebuffer';
  public readyState = connecting;
  public readonly sent: Array<Uint8Array<ArrayBuffer>> = [];
  public readonly close = vi.fn((): void => {
    this.readyState = closedState;
    this.emit('close', {});
  });
  /** Peer that receives everything this socket sends. */
  public peer: FakeWebSocket | undefined;
  private readonly listeners = new Map<string, (event: unknown) => void>();

  public addEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.set(type, listener);
  }

  public removeEventListener(type: string, listener: (event: unknown) => void): void {
    if (this.listeners.get(type) === listener) {
      this.listeners.delete(type);
    }
  }

  public send(data: Uint8Array<ArrayBuffer>): void {
    this.sent.push(data);
    const { peer } = this;
    if (peer) {
      // A real wire never delivers re-entrantly inside send().
      queueMicrotask(() => {
        peer.deliver(data);
      });
    }
  }

  /** Move to OPEN and notify, as a real socket does after its handshake. */
  public didOpen(): void {
    this.readyState = open;
    this.emit('open', {});
  }

  /** Push an inbound frame at the adapter. */
  public deliver(bytes: Uint8Array<ArrayBuffer>): void {
    this.emit('message', { data: bytes });
  }

  private emit(type: string, event: unknown): void {
    this.listeners.get(type)?.(event);
  }
}

describe('wrapWebSocket', () => {
  it('buffers a frame received before onMessage and delivers it exactly once', () => {
    const socket = new FakeWebSocket();
    const port = wrapWebSocket<{ hello: number }>(socket, jsonCodec);

    socket.deliver(jsonCodec.encode({ hello: 1 }));

    const received: Array<{ hello: number }> = [];
    port.onMessage((data) => received.push(data));
    port.onMessage((data) => received.push(data));

    expect(received).toEqual([{ hello: 1 }]);

    socket.deliver(jsonCodec.encode({ hello: 2 }));
    expect(received).toEqual([{ hello: 1 }, { hello: 2 }, { hello: 2 }]);
  });

  it('disarms the buffer even when the draining handler throws', () => {
    const socket = new FakeWebSocket();
    const port = wrapWebSocket<number>(socket, jsonCodec);

    socket.deliver(jsonCodec.encode(1));

    expect(() =>
      port.onMessage(() => {
        throw new Error('handler exploded');
      }),
    ).toThrow('handler exploded');

    /* Without the finally the buffer stays armed and the next subscriber
     * replays the same frame. */
    const received: number[] = [];
    port.onMessage((data) => received.push(data));
    expect(received).toEqual([]);
  });

  it('unsubscribes a registered handler', () => {
    const socket = new FakeWebSocket();
    const port = wrapWebSocket<number>(socket, jsonCodec);
    const received: number[] = [];
    const off = port.onMessage((data) => received.push(data));

    socket.deliver(jsonCodec.encode(1));
    off();
    socket.deliver(jsonCodec.encode(2));

    expect(received).toEqual([1]);
  });

  it('queues sends until the socket opens, then flushes in order', () => {
    const socket = new FakeWebSocket();
    const port = wrapWebSocket<string>(socket, jsonCodec);

    port.postMessage('first');
    port.postMessage('second');
    expect(socket.sent).toEqual([]);

    socket.didOpen();
    expect(socket.sent.map((frame) => jsonCodec.decode(frame))).toEqual(['first', 'second']);

    port.postMessage('third');
    expect(socket.sent.map((frame) => jsonCodec.decode(frame))).toEqual(['first', 'second', 'third']);
  });

  it('forces binaryType to arraybuffer', () => {
    const socket = new FakeWebSocket();
    wrapWebSocket(socket, jsonCodec);

    expect(socket.binaryType).toBe('arraybuffer');
  });

  it('closes the socket once and drops sends after a local close', () => {
    const socket = new FakeWebSocket();
    const port = wrapWebSocket<string>(socket, jsonCodec);
    socket.didOpen();

    port.close();
    port.close();
    port.postMessage('after-close');

    expect(socket.close).toHaveBeenCalledOnce();
    expect(socket.sent).toEqual([]);
  });

  it('drops sends after the socket closes remotely', () => {
    const socket = new FakeWebSocket();
    const port = wrapWebSocket<string>(socket, jsonCodec);
    socket.didOpen();

    socket.close();
    socket.close.mockClear();
    port.postMessage('after-close');
    port.close();

    expect(socket.sent).toEqual([]);
    expect(socket.close).not.toHaveBeenCalled();
  });

  it('treats a socket already closing at wrap time as closed instead of queueing forever', () => {
    const socket = new FakeWebSocket();
    socket.readyState = closedState;
    const port = wrapWebSocket<string>(socket, jsonCodec);

    port.postMessage('never');
    port.close();

    expect(socket.sent).toEqual([]);
    expect(socket.close).not.toHaveBeenCalled();
  });

  it('reports a remote close through onClose exactly once', () => {
    const socket = new FakeWebSocket();
    const port = wrapWebSocket<string>(socket, jsonCodec);
    socket.didOpen();
    const deaths: number[] = [];
    port.onClose?.(() => deaths.push(1));

    socket.close();
    port.close();

    expect(deaths).toEqual([1]);
  });

  it('does not report a local close as a death', () => {
    const socket = new FakeWebSocket();
    const port = wrapWebSocket<string>(socket, jsonCodec);
    socket.didOpen();
    const deaths: number[] = [];
    port.onClose?.(() => deaths.push(1));

    port.close();

    expect(socket.close).toHaveBeenCalledOnce();
    expect(deaths).toEqual([]);
  });

  it('fires onClose immediately for a socket already closed at wrap time', () => {
    const socket = new FakeWebSocket();
    socket.readyState = closedState;
    const port = wrapWebSocket<string>(socket, jsonCodec);
    const deaths: number[] = [];

    port.onClose?.(() => deaths.push(1));

    expect(deaths).toEqual([1]);
  });

  it('reports the 1003 close for an undecodable frame as a death', () => {
    const socket = new FakeWebSocket();
    const port = wrapWebSocket<string>(socket, jsonCodec);
    socket.didOpen();
    const deaths: number[] = [];
    port.onClose?.(() => deaths.push(1));

    socket.deliver(new TextEncoder().encode('not json'));

    expect(deaths).toEqual([1]);
  });

  it('closes with 1003 instead of throwing when a frame cannot be decoded', () => {
    const socket = new FakeWebSocket();
    const port = wrapWebSocket<string>(socket, jsonCodec);
    socket.didOpen();
    const received: string[] = [];
    port.onMessage((data) => received.push(data));

    expect(() => {
      socket.deliver(new TextEncoder().encode('not json'));
    }).not.toThrow();

    expect(socket.close).toHaveBeenCalledExactlyOnceWith(1003, 'undecodable frame');
    expect(received).toEqual([]);
  });

  it('keeps order when a frame lands while the pre-subscribe buffer is draining', () => {
    const socket = new FakeWebSocket();
    const port = wrapWebSocket<number>(socket, jsonCodec);
    socket.deliver(jsonCodec.encode(1));
    socket.deliver(jsonCodec.encode(2));

    const received: number[] = [];
    port.onMessage((data) => {
      received.push(data);
      if (data === 1) {
        // A synchronous fake can deliver re-entrantly mid-drain.
        socket.deliver(jsonCodec.encode(3));
      }
    });

    expect(received).toEqual([1, 2, 3]);
  });

  it('runs a full channel handshake and call over two wrapped sockets', async () => {
    const serverSocket = new FakeWebSocket();
    const clientSocket = new FakeWebSocket();
    serverSocket.peer = clientSocket;
    clientSocket.peer = serverSocket;
    serverSocket.didOpen();
    clientSocket.didOpen();
    // Both sides are wrapped before either channel exists, as a dialled socket
    // is: the server's hello is posted during construction and must be buffered.
    const serverPort = wrapWebSocket<unknown>(serverSocket, jsonCodec);
    const clientPort = wrapWebSocket<unknown>(clientSocket, jsonCodec);

    const server = createChannelServer({
      port: serverPort,
      sessionKey: 'ws',
      hello: { server: 'kernel-runtime-worker' },
      impl: {
        call: async (_context, name, args) => {
          if (name === 'add') {
            const { a, b } = args as { a: number; b: number };
            return a + b;
          }
          throw new Error(`unknown: ${name}`);
        },
        async *listen() {
          yield 0;
        },
      },
    });

    try {
      const client = createChannelClient({ port: clientPort, sessionKey: 'ws' });
      await client.ready;

      expect(client.hello.payload).toEqual({ server: 'kernel-runtime-worker' });
      await expect(client.call('add', { a: 2, b: 3 })).resolves.toBe(5);
    } finally {
      server.dispose();
    }
  });
});

/**
 * Electron's `MessagePortMain`, faithfully: payloads arrive wrapped in
 * `{ data }`, the transfer list accepts ports and **nothing** else, and the
 * far end disentangling is reported as a `close` event. The throw on a
 * non-port transfer entry is what makes the adapter's filter load-bearing —
 * without it every framed `ArrayBuffer` would take the channel down.
 */
class FakeMessagePortMain implements MessagePortMainLike {
  public peer: FakeMessagePortMain | undefined;
  public started = false;
  public readonly closed = vi.fn((): void => undefined);
  private readonly listeners = new Map<string, Array<(payload?: unknown) => void>>();

  public postMessage(value: unknown, transfer?: readonly unknown[]): void {
    for (const [index, entry] of (transfer ?? []).entries()) {
      if (!(entry instanceof FakeMessagePortMain)) {
        throw new Error(`Port at index ${index} is not a valid port`);
      }
    }
    this.peer?.emit('message', { data: value });
  }

  public on(event: 'close' | 'message', listener: (payload?: unknown) => void): this {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    return this;
  }

  public start(): void {
    this.started = true;
  }

  public close(): void {
    this.closed();
    this.peer?.emit('close');
  }

  /** Deliver one event to every listener, the way an `EventEmitter` does. */
  public emit(event: 'close' | 'message', payload?: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(payload);
    }
  }
}

const linkedFakePorts = (): readonly [FakeMessagePortMain, FakeMessagePortMain] => {
  const a = new FakeMessagePortMain();
  const b = new FakeMessagePortMain();
  a.peer = b;
  b.peer = a;
  return [a, b];
};

describe('wrapMessagePortMain', () => {
  it('carries frames over a node:worker_threads channel driven as an emitter', async () => {
    const { port1, port2 } = new MessageChannel();
    const server = createChannelServer({
      port: wrapMessagePortMain(port1, { label: 'emitter.server' }),
      sessionKey: 'emitter',
      impl: {
        call: async (_context, _name, args) => (args as { n: number }).n * 2,
        async *listen() {
          yield 0;
        },
      },
    });
    try {
      const client = createChannelClient({
        port: wrapMessagePortMain(port2, { label: 'emitter.client' }),
        sessionKey: 'emitter',
      });
      await client.ready;
      await expect(client.call('double', { n: 21 })).resolves.toBe(42);
    } finally {
      server.dispose();
      port1.close();
      port2.close();
    }
  });

  it('unwraps the Electron { data } envelope and starts the port lazily', () => {
    const [near, far] = linkedFakePorts();
    const wrapped = wrapMessagePortMain<string>(near);
    expect(far.started).toBe(false);

    const received: string[] = [];
    const off = wrapped.onMessage((data) => received.push(data));
    expect(near.started).toBe(true);

    far.postMessage('hello');
    off();
    far.postMessage('ignored');

    expect(received).toEqual(['hello']);
  });

  it('drops non-port transfer entries Electron would reject, and still posts the value', () => {
    const [near, far] = linkedFakePorts();
    const [handoff] = linkedFakePorts();
    const received: unknown[] = [];
    wrapMessagePortMain<unknown>(far).onMessage((data) => received.push(data));
    const wrapped = wrapMessagePortMain<unknown>(near);

    const bytes = new Uint8Array([1, 2, 3]);
    expect(() => {
      wrapped.postMessage({ bytes }, [bytes.buffer as unknown as Transferable]);
    }).not.toThrow();
    wrapped.postMessage({ handoff }, [handoff as unknown as Transferable]);

    expect(received).toEqual([{ bytes }, { handoff }]);
  });

  it('goes silent and reports the death exactly once when the far end disentangles', () => {
    const [near, far] = linkedFakePorts();
    const wrapped = wrapMessagePortMain<string>(near);
    let deaths = 0;
    wrapped.onClose?.(() => {
      deaths += 1;
    });

    far.close();
    far.emit('close');

    expect(deaths).toBe(1);
    /* A bye frame racing teardown must not throw through a dead port. */
    expect(() => {
      wrapped.postMessage('after-death');
    }).not.toThrow();
    /* A handler registered after the death still learns about it, once. */
    let late = 0;
    wrapped.onClose?.(() => {
      late += 1;
    });
    expect(late).toBe(1);
  });

  it('wraps close errors with the label and closes at most once', () => {
    const [near] = linkedFakePorts();
    vi.spyOn(near, 'close').mockImplementation(() => {
      throw new Error('fail');
    });
    const wrapped = wrapMessagePortMain(near, { label: 'PM' });

    expect(() => {
      wrapped.close();
    }).toThrow('PM close failed');
    expect(() => {
      wrapped.close();
    }).not.toThrow();
    expect(near.close).toHaveBeenCalledTimes(1);
  });

  it('rejects a pending call when the underlying port dies', async () => {
    const [near] = linkedFakePorts();
    const port = wrapMessagePortMain<unknown>(near, { label: 'dying' });
    const client = createChannelClient({ port, sessionKey: 'dying' });
    const closes: Array<{ origin: string; reason?: string }> = [];
    client.onClose((info) => closes.push(info));

    const pending = client.call('never', {});
    near.emit('close');

    await expect(pending).rejects.toThrow('Channel closed');
    expect(closes).toEqual([{ origin: 'remote', reason: 'port-closed' }]);
  });
});
