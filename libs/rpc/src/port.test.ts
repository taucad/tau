import { describe, it, expect, vi } from 'vitest';
import { MessageChannel } from 'node:worker_threads';
import type { Codec, Port, WebSocketLike } from '#port.js';
import { wrapMessagePort, wrapWebSocket } from '#port.js';
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
