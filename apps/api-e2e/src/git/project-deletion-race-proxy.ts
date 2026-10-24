/* oxlint-disable promise/prefer-await-to-then -- Socket callbacks schedule tracked forwarding promises in transport order. */
import { createServer, request } from 'node:http';
import { createConnection, createServer as createTcpServer } from 'node:net';
import type { Socket } from 'node:net';

/** A single observable transport boundary; no application code is replaced. */
export class ProjectDeletionRaceGate {
  public readonly entered = Promise.withResolvers<number>();
  private readonly resumed = Promise.withResolvers<void>();

  public async hold(status = 0): Promise<void> {
    this.entered.resolve(status);
    await this.resumed.promise;
  }

  public release(): void {
    this.resumed.resolve();
  }

  public async wait(): Promise<number> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.entered.promise,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            reject(new Error('The admitted HTTP request did not reach the armed transport barrier.'));
          }, 30_000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}

type StoreProxy = {
  endpoint: string;
  observations: Array<{ method: string; path: string; status: number }>;
  arm(projectId: string, phase: 'before' | 'after'): ProjectDeletionRaceGate;
  close(): Promise<void>;
};
type RedisProxy = {
  endpoint: string;
  arm(ownerId: string): ProjectDeletionRaceGate;
  close(): Promise<void>;
};

/** Forward signed S3 requests unchanged, pausing one selected manifest PUT. */
export const createProjectDeletionRaceStoreProxy = async (endpoint: string): Promise<StoreProxy> => {
  const upstream = new URL(endpoint);
  if (upstream.hostname !== '127.0.0.1' || upstream.port === '9000' || upstream.protocol !== 'http:') {
    throw new Error('Race proxy requires the isolated loopback MinIO endpoint.');
  }
  let armed: { suffix: string; phase: 'before' | 'after'; gate: ProjectDeletionRaceGate } | undefined;
  const gates: ProjectDeletionRaceGate[] = [];
  const observations: Array<{ method: string; path: string; status: number }> = [];
  const forwarding = new Set<Promise<void>>();
  const server = createServer((incoming, outgoing) => {
    const path = new URL(incoming.url ?? '/', endpoint).pathname;
    const selected = incoming.method === 'PUT' && armed && path.endsWith(armed.suffix) ? armed : undefined;
    if (selected) {
      armed = undefined;
    }
    const forward = async (): Promise<void> => {
      if (selected?.phase === 'before') {
        await selected.gate.hold();
      }
      const forwarded = request(
        {
          hostname: upstream.hostname,
          port: upstream.port,
          path: incoming.url,
          method: incoming.method,
          headers: incoming.headers,
        },
        (response) => {
          const relay = async (): Promise<void> => {
            const status = response.statusCode ?? 502;
            observations.push({ method: incoming.method ?? '', path, status });
            if (selected?.phase === 'after') {
              await selected.gate.hold(status);
            }
            outgoing.writeHead(status, response.headers);
            response.pipe(outgoing);
          };
          const relaying = relay().catch(() => {
            outgoing.destroy();
          });
          forwarding.add(relaying);
          // async-iife: bootstrap — settlement is tracked above and drained on close.
          void relaying.finally(() => {
            forwarding.delete(relaying);
          });
        },
      );
      forwarded.on('error', () => outgoing.destroy());
      incoming.on('error', () => forwarded.destroy());
      incoming.pipe(forwarded);
    };
    const pending = forward().catch(() => {
      outgoing.destroy();
    });
    forwarding.add(pending);
    // async-iife: bootstrap — settlement is tracked above and drained on close.
    void pending.finally(() => {
      forwarding.delete(pending);
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('No store proxy TCP address.');
  }
  return {
    endpoint: `http://127.0.0.1:${String(address.port)}`,
    observations,
    arm(projectId: string, phase: 'before' | 'after'): ProjectDeletionRaceGate {
      if (armed) {
        throw new Error('A store barrier is already armed.');
      }
      const gate = new ProjectDeletionRaceGate();
      gates.push(gate);
      armed = { suffix: `/repos/${projectId}/manifest.json`, phase, gate };
      return gate;
    },
    async close(): Promise<void> {
      for (const gate of gates) {
        gate.release();
      }
      await Promise.all(forwarding);
      server.closeAllConnections();
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    },
  };
};

/** Redis commands on this connection are RESP arrays of bulk strings. */
const commandLength = (bytes: Uint8Array<ArrayBuffer>): number | undefined => {
  const buffer = Buffer.from(bytes);
  const headerEnd = buffer.indexOf('\r\n');
  if (headerEnd === -1) {
    return undefined;
  }
  if (buffer[0] !== 42) {
    throw new Error('Expected a RESP command array.');
  }
  const count = Number(buffer.subarray(1, headerEnd).toString());
  let offset = headerEnd + 2;
  for (let index = 0; index < count; index += 1) {
    const end = buffer.indexOf('\r\n', offset);
    if (end === -1) {
      return undefined;
    }
    if (buffer[offset] !== 36) {
      throw new Error('Expected a RESP bulk string.');
    }
    const length = Number(buffer.subarray(offset + 1, end).toString());
    offset = end + 2 + length + 2;
    if (buffer.length < offset) {
      return undefined;
    }
  }
  return offset;
};

/** Pause the real invitation budget command, which the HTTP controller issues after authorization. */
export const createProjectDeletionRaceRedisProxy = async (endpoint: string): Promise<RedisProxy> => {
  const upstream = new URL(endpoint);
  if (upstream.hostname !== '127.0.0.1' || upstream.port === '6379' || upstream.protocol !== 'redis:') {
    throw new Error('Race proxy requires the isolated loopback Redis endpoint.');
  }
  let armed: { marker: string; gate: ProjectDeletionRaceGate } | undefined;
  const gates: ProjectDeletionRaceGate[] = [];
  const sockets = new Set<Socket>();
  const server = createTcpServer((client) => {
    const backend = createConnection({ host: upstream.hostname, port: Number(upstream.port) });
    for (const socket of [client, backend]) {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      socket.on('error', () => {
        client.destroy();
        backend.destroy();
      });
    }
    client.on('close', () => backend.destroy());
    backend.on('close', () => client.destroy());
    backend.pipe(client);
    let buffer = Buffer.alloc(0);
    let forwarding = Promise.resolve();
    client.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
      buffer = Buffer.concat([buffer, chunk]);
      try {
        let length = commandLength(buffer);
        while (length !== undefined) {
          const command = buffer.subarray(0, length);
          buffer = buffer.subarray(length);
          const selected = armed && command.includes(armed.marker) ? armed : undefined;
          if (selected) {
            armed = undefined;
          }
          forwarding = forwarding
            .then(async () => {
              if (selected) {
                await selected.gate.hold();
              }
              backend.write(command);
            })
            .catch(() => {
              client.destroy();
            });
          length = commandLength(buffer);
        }
      } catch {
        client.destroy();
      }
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('No Redis proxy TCP address.');
  }
  const proxy = new URL(endpoint);
  proxy.port = String(address.port);
  return {
    endpoint: proxy.href,
    arm(ownerId: string): ProjectDeletionRaceGate {
      if (armed) {
        throw new Error('An invitation barrier is already armed.');
      }
      const gate = new ProjectDeletionRaceGate();
      gates.push(gate);
      armed = { marker: `project:invite:${ownerId}:`, gate };
      return gate;
    },
    async close(): Promise<void> {
      for (const gate of gates) {
        gate.release();
      }
      for (const socket of sockets) {
        socket.destroy();
      }
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    },
  };
};
