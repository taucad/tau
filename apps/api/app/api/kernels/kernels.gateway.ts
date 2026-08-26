import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { FastifyInstance } from 'fastify';
import { WebSocketServer, WebSocket } from 'ws';
import { KernelsService } from '#api/kernels/kernels.service.js';
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
 */
@Injectable()
export class KernelsGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KernelsGateway.name);

  public constructor(
    private readonly kernelsService: KernelsService,
    private readonly devWebSocketService: DevWebSocketService,
    @Inject(HttpAdapterHost) private readonly httpAdapterHost: HttpAdapterHost,
  ) {}

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
   * Handle Zoo API proxy connections.
   */
  @Span()
  private handleZooProxy(socket: WebSocket, queryParameters: URLSearchParams): void {
    this.logger.debug('Client connected to Zoo proxy');
    this.kernelsService.createZooProxy(socket, queryParameters);

    socket.on('close', () => {
      this.logger.debug('Client disconnected from Zoo proxy');
    });
  }

  /**
   * Initialize WebSocket handler for development mode.
   * Uses the shared DevWebSocketService.
   */
  private async initDevWebSocket(): Promise<void> {
    this.devWebSocketService.registerPathHandler(zooWebSocketPath, (socket, request) => {
      const url = new URL(request.url ?? '/', `http://localhost:${this.devWebSocketService.getPort()}`);
      this.handleZooProxy(socket, url.searchParams);
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
          this.handleZooProxy(ws, url.searchParams);
        });
      }
      // Don't call socket.destroy() for other paths - let Socket.IO handle them
    });

    this.logger.log(`Zoo WebSocket proxy registered at ${zooWebSocketPath} (production mode)`);
  }
}
