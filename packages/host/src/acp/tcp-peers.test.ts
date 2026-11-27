import { connect, createServer } from 'node:net';
import type { Socket } from 'node:net';

import { expect, it } from 'vitest';

import { sampleTcpPeers } from '#acp/tcp-peers.js';

it('should observe a connection this process opens, with its peer port and this process as its owner', async () => {
  const accepted: Socket[] = [];
  const server = createServer((socket) => accepted.push(socket));
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as { port: number };
  const client = connect(port, '127.0.0.1');
  try {
    await new Promise<void>((resolve, reject) => {
      client.once('connect', resolve);
      client.once('error', reject);
    });

    const rows = await sampleTcpPeers();

    expect(rows).toContainEqual({ pid: process.pid, peer: `127.0.0.1:${String(port)}` });
  } finally {
    client.destroy();
    for (const socket of accepted) {
      socket.destroy();
    }
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  }
});
