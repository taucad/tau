import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';

import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Auth } from 'better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyInstance } from 'fastify';
import { WebSocket, WebSocketServer } from 'ws';
import type { RawData } from 'ws';

import { authInstanceKey } from '#constants/auth.constant.js';
import { asBuffer } from '#api/hosts/host-frame-relay.js';
import { HostsService } from '#api/hosts/hosts.service.js';
import { DevWebSocketService } from '#api/websocket/dev-websocket.service.js';

const controlPath = '/v1/agents/control';
const sessionPathPrefix = '/v1/agents/sessions/';

@Injectable()
export class HostsGateway implements OnModuleInit, OnModuleDestroy {
  private socketServer: WebSocketServer | undefined;
  private httpServer: HttpServer | undefined;
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- Node's `upgrade` event hands the handler a Buffer
  private upgradeHandler: ((request: IncomingMessage, socket: Duplex, head: Buffer) => void) | undefined;

  public constructor(
    private readonly hostsService: HostsService,
    private readonly devWebSocketService: DevWebSocketService,
    @Inject(authInstanceKey) private readonly auth: Auth,
    @Inject(HttpAdapterHost) private readonly httpAdapterHost: HttpAdapterHost,
  ) {}

  public async onModuleInit(): Promise<void> {
    if (import.meta.env.DEV) {
      this.devWebSocketService.registerPathHandler(controlPath, async (socket, request) =>
        this.handle(socket, request),
      );
      this.devWebSocketService.registerPrefixHandler(sessionPathPrefix, async (socket, request) =>
        this.handle(socket, request),
      );
      await this.devWebSocketService.ensureStarted();
      return;
    }
    this.socketServer = new WebSocketServer({ noServer: true });
    const fastify = this.httpAdapterHost.httpAdapter.getInstance<FastifyInstance>();
    this.httpServer = fastify.server;
    // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- Node's `upgrade` event hands the handler a Buffer
    const onUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
      const { pathname } = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
      if (pathname !== controlPath && !pathname.startsWith(sessionPathPrefix)) {
        return;
      }
      this.socketServer?.handleUpgrade(request, socket, head, (accepted) => {
        this.socketServer?.emit('connection', accepted, request);
        void this.closeOnHandleFailure(accepted, request);
      });
    };
    this.upgradeHandler = onUpgrade;
    this.httpServer.on('upgrade', onUpgrade);
  }

  public async onModuleDestroy(): Promise<void> {
    if (import.meta.env.DEV) {
      this.devWebSocketService.unregisterPathHandler(controlPath);
      this.devWebSocketService.unregisterPrefixHandler(sessionPathPrefix);
      return;
    }
    if (this.httpServer && this.upgradeHandler) {
      this.httpServer.off('upgrade', this.upgradeHandler);
    }
    for (const socket of this.socketServer?.clients ?? []) {
      socket.close(1001, 'service stopping');
    }
    // Every client was told 1001 above; shutdown does not wait on their close handshakes.
    this.socketServer?.close();
  }

  /** The upgrade callback is synchronous, so a route that fails admission closes its socket here. */
  private async closeOnHandleFailure(socket: WebSocket, request: IncomingMessage): Promise<void> {
    try {
      await this.handle(socket, request);
    } catch {
      socket.close(1011, 'host gateway failed');
    }
  }

  /**
   * `ws` buffers nothing: a frame that arrives before a `message` listener is
   * attached is dropped on the floor. Every route below attaches its listener
   * only after an await — a device lookup, a Redis subscribe, a one-use grant
   * read — while both callers hand the socket over synchronously from the
   * upgrade callback, and a daemon sends on open (the control `ready` frame goes
   * out in the same turn the socket opens). So the socket stays paused until the
   * route that owns it is listening; the kernel holds those frames meanwhile,
   * and a socket that fails admission is resumed only to finish its close
   * handshake, with nothing listening to what it sent.
   */
  private async handle(socket: WebSocket, request: IncomingMessage): Promise<void> {
    socket.pause();
    try {
      await this.route(socket, request);
    } finally {
      socket.resume();
    }
  }

  /** Control frames are handled strictly in arrival order, one at a time. */
  private async afterControlMessage(previous: Promise<void>, deviceId: string, raw: RawData): Promise<void> {
    await previous;
    await this.hostsService.handleControlMessage(deviceId, asBuffer(raw).toString('utf8'));
  }

  private async route(socket: WebSocket, request: IncomingMessage): Promise<void> {
    const { pathname } = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    if (pathname === controlPath) {
      const device = await this.hostsService.authenticateDevice(request.headers.authorization);
      if (!device) {
        socket.close(4401, 'device credential rejected');
        return;
      }
      await this.hostsService.registerControl(device.id, socket);
      let messages = Promise.resolve();
      socket.on('message', (raw) => {
        messages = this.afterControlMessage(messages, device.id, raw);
      });
      return;
    }

    // Segments are read off sessionPathPrefix (both callers above admit only that prefix) so the
    // route cannot drift from the filter the way a second copy of the path literal did.
    const [sessionId, side, route, ...rest] = pathname.slice(sessionPathPrefix.length).split('/');
    if (
      rest.length > 0 ||
      !sessionId ||
      (side !== 'browser' && side !== 'host') ||
      (route !== 'runtime' && route !== 'fs' && route !== 'agent')
    ) {
      socket.close(1008, 'unknown host route');
      return;
    }
    if (side === 'host') {
      await this.hostsService.acceptHostRoute({
        sessionId,
        route,
        authorization: request.headers.authorization,
        socket,
      });
      return;
    }
    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) {
      socket.close(4401, 'browser session required');
      return;
    }
    await this.hostsService.acceptBrowserRoute({ sessionId, route, userId: session.user.id, socket });
  }
}
