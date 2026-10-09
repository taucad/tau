/* oxlint-disable new-cap -- NestJS decorators use PascalCase */
import { readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { Controller, Get, Inject, Injectable, Module } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import { closeGracefully, drainingServerOptions, shutdownPhases } from '#lifecycle/graceful-shutdown.js';
import { LifecycleModule } from '#lifecycle/lifecycle.module.js';
import { ShutdownService } from '#lifecycle/shutdown.service.js';
import { UpgradeRouter } from '#lifecycle/upgrade-router.js';

/** What requests, work and the database record, in the order it happens. */
const events: string[] = [];
let entered: PromiseWithResolvers<void>;
let release: PromiseWithResolvers<void>;
let afterReply: PromiseWithResolvers<void>;

@Injectable()
class DatabaseFixture implements OnModuleDestroy {
  public onModuleDestroy(): void {
    events.push('database closed');
  }
}

@Module({ providers: [DatabaseFixture], exports: [DatabaseFixture] })
class DatabaseFixtureModule {}

@Controller()
class FixtureController {
  public constructor(@Inject(ShutdownService) private readonly shutdown: ShutdownService) {}

  @Get('slow')
  public async slow(): Promise<{ ok: true }> {
    entered.resolve();
    await release.promise;
    events.push('request finished');
    return { ok: true };
  }

  @Get('fast')
  public fast(): { ok: true } {
    return { ok: true };
  }

  /** Answers at once and leaves work running, as a push's announcement or a model step's settlement does. */
  @Get('after-reply')
  public afterReply(): { ok: true } {
    const finish = async (): Promise<void> => {
      await afterReply.promise;
      events.push('post-reply work finished');
    };
    this.shutdown.track(finish());
    return { ok: true };
  }
}

@Module({ imports: [LifecycleModule, DatabaseFixtureModule], controllers: [FixtureController] })
class ShutdownFixtureModule {}

/** Resolves with what the peer sees when a raw request is written to the server. */
const rawExchange = async (
  port: number,
  request: string,
): Promise<{ response: string; closed: Promise<void>; write: (more: string) => void }> => {
  const socket = connect(port, '127.0.0.1');
  let response = '';
  socket.setEncoding('utf8');
  socket.on('data', (chunk: string) => {
    response += chunk;
  });
  const closed = new Promise<void>((resolve) => {
    socket.once('close', () => {
      resolve();
    });
  });
  await new Promise<void>((resolve) => {
    socket.once('connect', resolve);
  });
  socket.write(request);
  return {
    get response() {
      return response;
    },
    closed,
    write: (more) => {
      socket.write(more);
    },
  };
};

describe('closeGracefully', () => {
  let app: NestFastifyApplication;
  let base: string;
  let port: number;
  let sockets: WebSocketServer;

  beforeEach(async () => {
    events.length = 0;
    entered = Promise.withResolvers();
    release = Promise.withResolvers();
    afterReply = Promise.withResolvers();
    app = await NestFactory.create<NestFastifyApplication>(
      ShutdownFixtureModule,
      new FastifyAdapter(drainingServerOptions),
      { logger: false },
    );
    // A route that, unlike the real gateways, never closes its sockets at stop.
    sockets = new WebSocketServer({ noServer: true });
    app.get(UpgradeRouter).route(app.getHttpServer(), {
      gateway: 'hosts',
      matches: (pathname) => pathname === '/socket',
      handle: (request, socket, head) => {
        sockets.handleUpgrade(request, socket, head, (accepted) => {
          sockets.emit('connection', accepted, request);
        });
      },
    });
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
    port = Number(new URL(base).port);
  });

  afterEach(async () => {
    release.resolve();
    afterReply.resolve();
    sockets.close();
    if (app.getHttpServer().listening) {
      await app.close();
    }
  });

  it('should finish a request in flight at shutdown before the database closes', async () => {
    const inFlight = fetch(`${base}/slow`);
    await entered.promise;

    const closing = closeGracefully(app, { cut: 60_000, abandon: 60_000 });
    await vi.waitFor(() => {
      expect(app.getHttpServer().listening).toBe(false);
    });

    await expect(fetch(`${base}/slow`)).rejects.toThrow('fetch failed');
    expect(events).toEqual([]);

    release.resolve();
    const response = await inFlight;
    expect(await response.json()).toEqual({ ok: true });
    // The finished request's keep-alive connection must not hold the drain to its bound.
    const settled = await Promise.race([
      closing.then(() => 'closed'),
      new Promise((resolve) => {
        setTimeout(resolve, 2000, 'held open');
      }),
    ]);
    expect(settled).toBe('closed');
    expect(events).toEqual(['request finished', 'database closed']);
  });

  it('should cut a request that outlives the cut and then close the database', async () => {
    const inFlight = fetch(`${base}/slow`);
    await entered.promise;

    await closeGracefully(app, { cut: 50, abandon: 100 });

    await expect(inFlight).rejects.toThrow('fetch failed');
    expect(events).toEqual(['database closed']);
  });

  it('should finish work a request left running before the database closes', async () => {
    const replied = await fetch(`${base}/after-reply`);
    await replied.json();

    const closing = closeGracefully(app, { cut: 60_000, abandon: 60_000 });
    await vi.waitFor(() => {
      expect(app.getHttpServer().listening).toBe(false);
    });
    expect(events).toEqual([]);

    afterReply.resolve();
    await closing;
    expect(events).toEqual(['post-reply work finished', 'database closed']);
  });

  it('should abandon work still running at the abandon deadline and close the database', async () => {
    const replied = await fetch(`${base}/after-reply`);
    await replied.json();

    await closeGracefully(app, { cut: 50, abandon: 100 });

    expect(events).toEqual(['database closed']);
  });

  it('should not let an open WebSocket hold the stop open past the cut', async () => {
    const client = new WebSocket(`${base.replace('http', 'ws')}/socket`);
    await new Promise((resolve) => {
      client.once('open', resolve);
    });
    const clientClosed = new Promise((resolve) => {
      client.once('close', resolve);
    });

    const outcome = await Promise.race([
      closeGracefully(app, { cut: 100, abandon: 150 }).then(() => 'closed'),
      new Promise((resolve) => {
        setTimeout(resolve, 3000, 'still stopping');
      }),
    ]);

    expect(outcome).toBe('closed');
    expect(events).toEqual(['database closed']);
    await clientClosed;
  });

  it('should refuse an upgrade to a path no route owns rather than leave it open', async () => {
    const exchange = await rawExchange(
      port,
      'GET /nowhere HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n' +
        'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n',
    );

    await exchange.closed;

    expect(exchange.response).toMatch(/^HTTP\/1\.1 404 /);
  });

  it('should serve a request that arrives on an open connection once closing began, with Connection: close', async () => {
    const exchange = await rawExchange(port, 'GET /slow HTTP/1.1\r\nHost: localhost\r\n\r\n');
    await entered.promise;
    const closing = closeGracefully(app, { cut: 60_000, abandon: 60_000 });
    await vi.waitFor(() => {
      expect(app.getHttpServer().listening).toBe(false);
    });
    // The connection is busy with `/slow`, so closing left it open; this request is parsed while closing.
    exchange.write('GET /fast HTTP/1.1\r\nHost: localhost\r\n\r\n');

    release.resolve();
    await exchange.closed;
    await closing;

    const responses = exchange.response.split(/(?=HTTP\/1\.1 )/);
    expect(responses).toHaveLength(2);
    expect(responses[1]).toMatch(/^HTTP\/1\.1 200 /);
    expect(responses[1]).toMatch(/\r\nconnection: close\r\n/i);
  });
});

describe('shutdownPhases', () => {
  it.each(['fly.prod.toml', 'fly.staging.toml'])('should fit inside the kill_timeout in %s', (file) => {
    const config = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    const killTimeout = Number(/^kill_timeout = '(\d+)s'$/mu.exec(config)?.[1]) * 1000;
    // Teardown after the abandon deadline: the OTEL flush (at most 5 s) and a margin for the closes.
    const teardown = 5000 + 2000;

    expect(shutdownPhases.cut).toBeLessThan(shutdownPhases.abandon);
    expect(shutdownPhases.abandon + teardown).toBeLessThanOrEqual(killTimeout);
  });
});
