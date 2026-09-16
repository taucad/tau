import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { FastifyInstance } from 'fastify';
import type { IncomingMessage } from 'node:http';
import type { Auth } from 'better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import { WebSocketServer, WebSocket } from 'ws';
import { authInstanceKey } from '#constants/auth.constant.js';
import { KernelsService } from '#api/kernels/kernels.service.js';
import { zooCloseCodes } from '#api/billing/billing.constants.js';
import type { CommercialEntitlementsService } from '#api/entitlements/commercial-entitlements.js';
import { commercialEntitlementsKey } from '#api/entitlements/commercial-entitlements.js';
import { DevWebSocketService } from '#api/websocket/dev-websocket.service.js';
import { Span } from '#telemetry/tracer.service.js';

const zooWebSocketPath = '/v1/kernels/zoo';

/**
 * WebSocket Gateway for Zoo API proxy.
 *
 * In development: Uses the shared DevWebSocketService on port+1 because
 * vite-plugin-node doesn't support WebSocket connections.
 *
 * In production: Uses the ws library with manual upgrade handling on the
 * main HTTP server. This approach avoids conflicts with Socket.IO which
 * also needs to handle WebSocket upgrades for other paths.
 *
 * Every connection is session-authenticated before the service refuses it
 * (B7 R3/S6): hosted Zoo is disabled, so no upstream socket and no billing
 * read happen on this path.
 */
@Injectable()
export class KernelsGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KernelsGateway.name);

  public constructor(
    private readonly kernelsService: KernelsService,
    private readonly devWebSocketService: DevWebSocketService,
    @Inject(authInstanceKey) private readonly auth: Auth,
    @Inject(commercialEntitlementsKey) private readonly entitlements: CommercialEntitlementsService,
    @Inject(HttpAdapterHost) private readonly httpAdapterHost: HttpAdapterHost,
  ) {}

  /**
   * Handle Zoo API proxy connections: authenticate, then hand the socket to
   * the disabled service, which closes it. Rejections close with the typed
   * code the runtime's Zoo transport understands (S49).
   */
  @Span()
  public async handleZooProxy(
    socket: WebSocket,
    queryParameters: URLSearchParams,
    request: IncomingMessage,
  ): Promise<void> {
    const verdict = await this.authorizeZooConnection(request);
    if (!verdict.ok) {
      this.logger.warn(`Zoo proxy connection rejected (${verdict.code}): ${verdict.reason}`);
      socket.close(verdict.code, verdict.reason);
      return;
    }

    this.logger.debug(`Client connected to Zoo proxy (user: ${verdict.userId})`);
    this.kernelsService.createZooProxy(socket, queryParameters, verdict.userId);

    socket.on('close', () => {
      this.logger.debug('Client disconnected from Zoo proxy');
    });
  }

  /**
   * Start the WebSocket server when the module initializes.
   */
  public async onModuleInit(): Promise<void> {
    // Use import.meta.env.DEV to detect Vite dev mode
    // vite-plugin-node doesn't support WebSockets, so we use a standalone server in dev
    if (import.meta.env.DEV) {
      await this.initDevWebSocket();
    } else {
      this.initFastifyWebSocket();
    }
  }

  /**
   * Clean up when the module is destroyed.
   */
  public onModuleDestroy(): void {
    if (import.meta.env.DEV) {
      this.devWebSocketService.unregisterPathHandler(zooWebSocketPath);
    }
  }

  /**
   * Session and commercial-entitlement gate. Self-host composition grants the
   * operator-owned capability without creating a billing account.
   */
  private async authorizeZooConnection(
    request: IncomingMessage,
  ): Promise<{ ok: true; userId: string } | { ok: false; code: number; reason: string }> {
    try {
      const session = await this.auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
      if (!session) {
        return { ok: false, code: zooCloseCodes.unauthenticated, reason: 'UNAUTHENTICATED' };
      }
      const entitlements = await this.entitlements.getEntitlements(session.user.id);
      if (!entitlements.canUseProKernels) {
        return { ok: false, code: zooCloseCodes.proRequired, reason: 'PRO_REQUIRED' };
      }
      return { ok: true, userId: session.user.id };
    } catch (error) {
      // Fail closed: an auth/entitlement outage must not open an unmetered proxy.
      this.logger.error(`Zoo proxy authorization failed: ${String(error)}`);
      return { ok: false, code: zooCloseCodes.unauthenticated, reason: 'AUTH_ERROR' };
    }
  }

  /**
   * Initialize WebSocket handler for development mode.
   * Uses the shared DevWebSocketService.
   */
  private async initDevWebSocket(): Promise<void> {
    this.devWebSocketService.registerPathHandler(zooWebSocketPath, (socket, request) => {
      const url = new URL(request.url ?? '/', `http://localhost:${this.devWebSocketService.getPort()}`);
      void this.handleZooProxy(socket, url.searchParams, request);
    });

    await this.devWebSocketService.ensureStarted();

    const wsPort = this.devWebSocketService.getPort();
    this.logger.log(`Zoo proxy available at ws://localhost:${wsPort}${zooWebSocketPath} (dev mode)`);
  }

  /**
   * Initialize WebSocket routes for production.
   * Uses the ws library directly with manual upgrade handling.
   * This avoids conflicts with Socket.IO which also needs to handle upgrade events.
   */
  private initFastifyWebSocket(): void {
    const fastify = this.httpAdapterHost.httpAdapter.getInstance<FastifyInstance>();
    const httpServer = fastify.server;
    const wss = new WebSocketServer({ noServer: true });

    // Handle WebSocket upgrades manually for the Zoo proxy path
    // Socket.IO will handle other paths (like /v1/chat/rpc)
    httpServer.on('upgrade', (request, socket, head) => {
      const { pathname } = new URL(request.url ?? '/', `http://${request.headers.host}`);

      if (pathname === zooWebSocketPath) {
        wss.handleUpgrade(request, socket, head, (ws) => {
          const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
          void this.handleZooProxy(ws, url.searchParams, request);
        });
      }
      // Don't call socket.destroy() for other paths - let Socket.IO handle them
    });

    this.logger.log(`Zoo WebSocket proxy registered at ${zooWebSocketPath} (production mode)`);
  }
}
