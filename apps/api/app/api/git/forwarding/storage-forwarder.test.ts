import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { MetricsService } from '#telemetry/metrics.js';
import { developmentSigningKeyJson } from '#api/git/forwarding/contract/development-keys.js';
import { outcomeHeader, refusedOutcome } from '#api/git/forwarding/contract/framing.js';
import { forwardIdleTimeoutMilliseconds } from '#api/git/forwarding/contract/hop.js';
import { parseSigningKey } from '#api/git/forwarding/contract/keys.js';
import type { GrantFacts } from '#api/git/forwarding/git-executor.js';
import { StorageForwarder, forwardTimeoutMilliseconds } from '#api/git/forwarding/storage-forwarder.js';
import { commitDeadlineMilliseconds, gitRpcTimeoutMilliseconds } from '#api/git/store/limits.js';

/**
 * The forwarder's connection handling (DC1 review S2, S6, S7), against a bare
 * `node:http` server standing in for tau-storage.
 */

const facts: GrantFacts = {
  owner: 'user-dc1-hop',
  project: 'proj-dc1-hop',
  callerId: 'user-dc1-hop',
  committedBy: 'user-dc1-hop',
  remainingBytes: 1024 ** 3,
  storageLimitBytes: 1024 ** 3,
  recordedGeneration: 0,
  route: { store: 'r2', authoritative: true },
};

const servers: Server[] = [];
const forwarders: StorageForwarder[] = [];

afterEach(async () => {
  for (const forwarder of forwarders.splice(0)) {
    forwarder.close();
  }
  await Promise.all(
    servers.splice(0).map(
      async (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => {
            resolve();
          });
        }),
    ),
  );
});

const listen = async (
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<{ readonly forwarder: StorageForwarder; readonly server: Server }> => {
  const server = createServer({ keepAliveTimeout: 60_000 }, handler);
  servers.push(server);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  const forwarder = new StorageForwarder({
    urls: [`http://127.0.0.1:${String(port)}`],
    key: parseSigningKey(developmentSigningKeyJson('grant'), 'grant'),
    metrics: new MetricsService(),
  });
  forwarders.push(forwarder);
  return { forwarder, server };
};

describe('storage forwarder connections (DC1 review)', () => {
  it('should outlast the worker’s own bound on a push and cut an idle hop at Fly’s idle timeout (S2)', () => {
    expect(forwardTimeoutMilliseconds).toBeGreaterThan(gitRpcTimeoutMilliseconds + commitDeadlineMilliseconds);
    expect(forwardIdleTimeoutMilliseconds).toBe(600_000);
    expect(forwardIdleTimeoutMilliseconds).toBeGreaterThan(commitDeadlineMilliseconds);
  });

  it('should send a request once more on a fresh connection when its pooled one was already closed (S6)', async () => {
    const served = new Set<Socket>();
    let requests = 0;
    const { forwarder } = await listen((request, response) => {
      requests += 1;
      if (served.has(request.socket)) {
        /* The connection this side already closed, as a keep-alive timeout would. */
        request.socket.destroy();
        return;
      }
      served.add(request.socket);
      request.resume();
      request.once('end', () => {
        response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ receipt: undefined }));
      });
    });

    await expect(forwarder.derive(facts)).resolves.toEqual({});
    await expect(forwarder.derive(facts)).resolves.toEqual({});
    expect(requests).toBe(3);
  });

  it('should not send a fully written remove-ref again when its pooled connection resets (review b)', async () => {
    const served = new Set<Socket>();
    let requests = 0;
    const { forwarder } = await listen((request, response) => {
      requests += 1;
      request.resume();
      request.once('end', () => {
        if (served.has(request.socket)) {
          /* The whole request arrived; the connection dies before the answer. */
          request.socket.destroy();
          return;
        }
        served.add(request.socket);
        response
          .writeHead(200, { 'content-type': 'application/json' })
          .end(JSON.stringify({ ref: 'refs/tags/v1', tip: '0'.repeat(40), generation: 2 }));
      });
    });

    await expect(forwarder.removeRef(facts)).resolves.toMatchObject({ ref: 'refs/tags/v1' });
    const second = await forwarder.removeRef(facts).catch((error: unknown) => error);

    expect(second).toBeInstanceOf(HttpException);
    expect((second as HttpException).getStatus()).toBe(503);
    expect(requests, 'a written remove-ref must not be replayed').toBe(2);
  });

  it('should stop sending the client’s body once tau-storage refused it (S7)', async () => {
    let closed = false;
    const { forwarder } = await listen((request, response) => {
      request.socket.once('close', () => {
        closed = true;
      });
      response
        .writeHead(429, { 'content-type': 'application/json', [outcomeHeader]: refusedOutcome })
        .end(JSON.stringify({ code: 'GIT_OWNER_IN_FLIGHT_LIMIT', message: 'Too many.' }));
    });
    let sent = 0;
    const body = new Readable({
      read() {
        sent += 1024;
        setTimeout(() => this.push(Buffer.alloc(1024)), 1);
      },
    });

    const refused = await forwarder.receivePack(facts, { body, gzipped: false }).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(HttpException);
    expect((refused as HttpException).getStatus()).toBe(429);
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
    const afterRefusal = sent;
    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });

    expect(sent, 'the body kept streaming after the refusal').toBe(afterRefusal);
    expect(closed, 'the refused request’s connection must be closed').toBe(true);
    body.destroy();
  });
});
