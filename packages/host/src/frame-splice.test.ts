import { once } from 'node:events';

import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';

import { spliceFrameSockets } from '#frame-splice.js';

type SocketPair = {
  readonly client: WebSocket;
  readonly serverSocket: WebSocket;
  readonly server: WebSocketServer;
};

const resources: Array<{ close(): void }> = [];

afterEach(async () => {
  for (const resource of resources.splice(0)) {
    resource.close();
  }
});

const createSocketPair = async (): Promise<SocketPair> => {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  resources.push(server);
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new TypeError('Expected a TCP WebSocket test address.');
  }
  const accepted = once(server, 'connection');
  const client = new WebSocket(`ws://127.0.0.1:${String(address.port)}`);
  resources.push(client);
  await once(client, 'open');
  const [serverSocket] = (await accepted) as [WebSocket];
  resources.push(serverSocket);
  return { client, serverSocket, server };
};

describe('spliceFrameSockets', () => {
  it('preserves binary bytes and message boundaries under callback backpressure', async () => {
    const left = await createSocketPair();
    const right = await createSocketPair();
    const originalSend = right.serverSocket.send.bind(right.serverSocket);
    right.serverSocket.send = ((data, options, callback) => {
      setTimeout(() => {
        originalSend(data, options, callback);
      }, 10);
    }) as typeof right.serverSocket.send;
    const splice = spliceFrameSockets(left.serverSocket, right.serverSocket);
    const received: Array<Uint8Array<ArrayBuffer>> = [];
    const complete = Promise.withResolvers<void>();
    right.client.on('message', (data) => {
      received.push(Buffer.from(data as Uint8Array<ArrayBuffer>));
      if (received.length === 3) {
        complete.resolve();
      }
    });

    left.client.send(Buffer.from([0, 1, 2]));
    left.client.send(Buffer.from([3, 4]));
    left.client.send(Buffer.from([5]));
    await complete.promise;

    expect(received).toEqual([Buffer.from([0, 1, 2]), Buffer.from([3, 4]), Buffer.from([5])]);
    splice.close();
    expect(await splice.closed).toEqual({ cause: 'requested' });
  });

  it('closes both routes when the bounded queue is exceeded', async () => {
    const left = await createSocketPair();
    const right = await createSocketPair();
    const splice = spliceFrameSockets(left.serverSocket, right.serverSocket, 4);

    left.client.send(Buffer.alloc(5));

    expect(await splice.closed).toEqual({ cause: 'queue-limit' });
  });

  it('mirrors one peer close code and reason', async () => {
    const left = await createSocketPair();
    const right = await createSocketPair();
    const splice = spliceFrameSockets(left.serverSocket, right.serverSocket);
    const rightClosed = once(right.client, 'close');

    left.client.close(4000, 'test complete');

    const [code, reason] = (await rightClosed) as [number, Uint8Array<ArrayBuffer>];
    expect(code).toBe(4000);
    expect(reason.toString()).toBe('test complete');
    expect(await splice.closed).toEqual({ cause: 'peer-closed', code: 4000, reason: 'test complete' });
  });
});
