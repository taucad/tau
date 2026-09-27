import { createServer } from 'node:http';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebSocketServer, WebSocket } from 'ws';
import type { Environment } from '#config/environment.config.js';

export type WebSocketConnectionHandler = (socket: WebSocket, request: IncomingMessage) => void | Promise<void>;

/**
 * Shared WebSocket server for development mode.
 *
 * In dev mode, vite-plugin-node doesn't support WebSocket connections,
 * so we need a standalone server on a separate port.
 *
 * This service provides a single HTTP server on port+1 that routes raw
 * WebSocket upgrades (host control and relay routes, the Zoo proxy) to the
 * path and prefix handlers registered with it, and destroys any other upgrade.
 */
@Injectable()
export class DevWebSocketService implements OnModuleDestroy {
  private readonly logger = new Logger(DevWebSocketService.name);
  private httpServer: HttpServer | undefined;
  private wss: WebSocketServer | undefined;
  private readonly wsPort: number;
  private readonly pathHandlers = new Map<string, WebSocketConnectionHandler>();
  private readonly prefixHandlers = new Map<string, WebSocketConnectionHandler>();
  private started = false;
  private startPromise: Promise<void> | undefined;
  private stopPromise: Promise<void> | undefined;

  public constructor(private readonly configService: ConfigService<Environment, true>) {
    const mainPort = Number(this.configService.get('PORT', { infer: true }));
    this.wsPort = mainPort + 1;
  }

  /**
   * Get the WebSocket port.
   */
  public getPort(): number {
    return this.wsPort;
  }

  /**
   * Start the shared dev WebSocket server if it is not already running.
   */
  public async ensureStarted(): Promise<void> {
    if (this.started) {
      return;
    }

    if (this.startPromise) {
      await this.startPromise;
      return;
    }

    this.startPromise = this.initServer();

    try {
      await this.startPromise;
    } finally {
      this.startPromise = undefined;
    }
  }

  /**
   * Register a handler for a specific raw WebSocket path.
   * The handler will be called when a WebSocket connection is made to that path.
   */
  public registerPathHandler(path: string, handler: WebSocketConnectionHandler): void {
    if (this.pathHandlers.has(path)) {
      this.logger.warn(`Path handler for ${path} already registered, overwriting`);
    }

    this.pathHandlers.set(path, handler);
    this.logger.debug(`Registered raw WebSocket handler for path: ${path}`);
  }

  /**
   * Unregister a handler for a specific path.
   */
  public unregisterPathHandler(path: string): void {
    this.pathHandlers.delete(path);
    this.logger.debug(`Unregistered WebSocket handler for path: ${path}`);
  }

  /** Register a handler for dynamic routes below one exact path prefix. */
  public registerPrefixHandler(prefix: string, handler: WebSocketConnectionHandler): void {
    this.prefixHandlers.set(prefix, handler);
  }

  /** Remove a dynamic-route prefix handler. */
  public unregisterPrefixHandler(prefix: string): void {
    this.prefixHandlers.delete(prefix);
  }

  /**
   * Stop the servers when the module is destroyed.
   */
  public async onModuleDestroy(): Promise<void> {
    await this.stop();
  }

  /**
   * Stop the shared dev WebSocket server and all upgraded sockets.
   */
  public async stop(): Promise<void> {
    if (this.stopPromise) {
      await this.stopPromise;
      return;
    }

    this.stopPromise = this.stopServer();

    try {
      await this.stopPromise;
    } finally {
      this.stopPromise = undefined;
    }
  }

  private async stopServer(): Promise<void> {
    if (this.startPromise) {
      await this.startPromise.catch(() => undefined);
    }

    const { wss, httpServer } = this;

    if (wss) {
      for (const client of wss.clients) {
        client.terminate();
      }

      await this.closeWebSocketServer(wss);
    }

    if (httpServer) {
      await this.closeHttpServer(httpServer);
    }

    this.httpServer = undefined;
    this.wss = undefined;
    this.started = false;

    this.logger.log('Dev WebSocket server stopped');
  }

  /**
   * Initialize the HTTP server and its raw WebSocket upgrade routing.
   */
  private async initServer(): Promise<void> {
    // Create HTTP server
    this.httpServer = createServer((_request, response) => {
      response.writeHead(200);
      response.end('Tau Dev WebSocket Server');
    });

    // Create raw WebSocket server with noServer mode
    this.wss = new WebSocketServer({ noServer: true });

    // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- Buffer required by ws library
    this.httpServer.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      const { pathname } = new URL(request.url ?? '/', `http://localhost:${this.wsPort}`);

      // Check for registered raw WebSocket paths
      const handler =
        this.pathHandlers.get(pathname) ??
        [...this.prefixHandlers.entries()]
          .sort(([left], [right]) => right.length - left.length)
          .find(([prefix]) => pathname.startsWith(prefix))?.[1];
      if (handler) {
        this.wss!.handleUpgrade(request, socket, head, (ws) => {
          this.wss!.emit('connection', ws, request);
          void this.handleConnection(ws, request, handler);
        });
        return;
      }

      // No handler found
      this.logger.warn(`No handler registered for WebSocket path: ${pathname}`);
      socket.destroy();
    });

    try {
      await this.listen(this.httpServer);
      this.started = true;
    } catch (error) {
      this.httpServer = undefined;
      this.wss = undefined;
      this.started = false;
      throw error;
    }
  }

  private async listen(httpServer: HttpServer): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => {
        httpServer.off('error', onError);
        reject(error);
      };

      httpServer.once('error', onError);
      httpServer.listen(this.wsPort, () => {
        httpServer.off('error', onError);
        this.logger.log(`Dev WebSocket server started on port ${this.wsPort}`);
        resolve();
      });
    });
  }

  private async closeWebSocketServer(wss: WebSocketServer): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      wss.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  private async closeHttpServer(httpServer: HttpServer): Promise<void> {
    if (!httpServer.listening) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      httpServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
      httpServer.closeAllConnections();
    });
  }

  /**
   * Handle a WebSocket connection with error handling.
   */
  private async handleConnection(
    ws: WebSocket,
    request: IncomingMessage,
    handler: WebSocketConnectionHandler,
  ): Promise<void> {
    try {
      await handler(ws, request);
    } catch (error) {
      this.logger.error('WebSocket handler error', error);
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1011, 'Internal server error');
      }
    }
  }
}
