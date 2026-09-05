import { createServer } from 'node:http';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createAdapter } from '@socket.io/redis-streams-adapter';
import type { Redis } from 'ioredis';
import { WebSocketServer, WebSocket } from 'ws';
import { Server as SocketIoServer } from 'socket.io';
import type { Environment } from '#config/environment.config.js';
import { RedisService } from '#redis/redis.service.js';

export const chatRpcPath = '/v1/chat/rpc';

export type WebSocketConnectionHandler = (socket: WebSocket, request: IncomingMessage) => void | Promise<void>;

/**
 * Shared WebSocket server for development mode.
 *
 * In dev mode, vite-plugin-node doesn't support WebSocket connections,
 * so we need a standalone server on a separate port.
 *
 * This service provides a single HTTP server on port+1 that handles:
 * - Raw WebSocket connections (for Zoo proxy) via path handlers
 * - Socket.IO connections (for chat RPC) via the configured Socket.IO path
 *
 * The upgrade event is intercepted to route connections based on path:
 * - Paths starting with chatRpcPath (/v1/chat/rpc) go to Socket.IO
 * - Other registered paths go to raw WebSocket handlers
 */
@Injectable()
export class DevWebSocketService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DevWebSocketService.name);
  private httpServer: HttpServer | undefined;
  private wss: WebSocketServer | undefined;
  private io: SocketIoServer | undefined;
  private readonly wsPort: number;
  private readonly pathHandlers = new Map<string, WebSocketConnectionHandler>();
  private readonly prefixHandlers = new Map<string, WebSocketConnectionHandler>();
  private started = false;
  private startPromise: Promise<void> | undefined;
  private stopPromise: Promise<void> | undefined;
  private adapterConstructor: ReturnType<typeof createAdapter> | undefined;
  private adapterClient: Redis | undefined;

  public constructor(
    private readonly configService: ConfigService<Environment, true>,
    private readonly redisService: RedisService,
  ) {
    const mainPort = Number(this.configService.get('PORT', { infer: true }));
    this.wsPort = mainPort + 1;
  }

  /**
   * Connect a dedicated Redis client for the Socket.IO Streams adapter.
   * Matches the production RedisIoAdapter configuration exactly.
   */
  public async onModuleInit(): Promise<void> {
    if (!import.meta.env.DEV) {
      return;
    }

    try {
      this.adapterClient = this.redisService.createDuplicateClient();

      this.adapterClient.on('error', (error) => {
        this.logger.error(`[Dev] Redis adapter error: ${error.message}`);
      });
      this.adapterClient.on('connect', () => {
        this.logger.debug('[Dev] Redis adapter connected');
      });
      this.adapterClient.on('close', () => {
        this.logger.warn('[Dev] Redis adapter disconnected');
      });

      await this.adapterClient.connect();

      this.adapterConstructor = createAdapter(this.adapterClient, {
        streamName: 'tau:socketio',
        maxLen: 10_000,
      });

      this.logger.log('Redis Streams adapter initialized for dev Socket.IO');
    } catch (error) {
      this.logger.warn(
        `Redis Streams adapter failed to initialize (falling back to in-memory): ${error instanceof Error ? error.message : String(error)}`,
      );
      this.adapterClient = undefined;
      this.adapterConstructor = undefined;
    }
  }

  /**
   * Get the WebSocket port.
   */
  public getPort(): number {
    return this.wsPort;
  }

  /**
   * Get the Socket.IO server instance.
   * Initializes the server if not already done.
   */
  public async ensureSocketIoServer(): Promise<SocketIoServer> {
    await this.ensureStarted();
    return this.io!;
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

    const { io, wss, httpServer, adapterClient } = this;

    if (io) {
      io.disconnectSockets(true);
      await this.closeSocketIoServer(io);
    }

    if (wss) {
      for (const client of wss.clients) {
        client.terminate();
      }

      await this.closeWebSocketServer(wss);
    }

    if (httpServer) {
      await this.closeHttpServer(httpServer);
    }

    if (adapterClient) {
      await adapterClient.quit();
      this.adapterClient = undefined;
      this.adapterConstructor = undefined;
      this.logger.debug('Redis adapter client disconnected');
    }

    this.httpServer = undefined;
    this.wss = undefined;
    this.io = undefined;
    this.started = false;

    this.logger.log('Dev WebSocket server stopped');
  }

  /**
   * Initialize the combined HTTP/WebSocket/Socket.IO server.
   */
  private async initServer(): Promise<void> {
    // Create HTTP server
    this.httpServer = createServer((_request, response) => {
      response.writeHead(200);
      response.end('Tau Dev WebSocket Server');
    });

    // Create raw WebSocket server with noServer mode
    this.wss = new WebSocketServer({ noServer: true });

    // Create Socket.IO server attached to HTTP server
    // Uses chatRpcPath to match production configuration
    this.io = new SocketIoServer(this.httpServer, {
      path: chatRpcPath,
      cors: {
        origin: this.configService.get('TAU_FRONTEND_URL', { infer: true }),
        credentials: true,
      },
      transports: ['websocket'],
      maxHttpBufferSize: 50e6,
      pingTimeout: 30_000,
      connectionStateRecovery: {
        maxDisconnectionDuration: 2 * 60 * 1000,
        skipMiddlewares: false,
      },
    });

    if (this.adapterConstructor) {
      this.io.adapter(this.adapterConstructor);
      this.logger.debug('Redis Streams adapter applied to dev Socket.IO server');
    }

    // Handle upgrade requests manually to route between Socket.IO and raw WebSocket
    // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- Buffer required by ws library
    this.httpServer.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      const { pathname } = new URL(request.url ?? '/', `http://localhost:${this.wsPort}`);

      // Check if this is the Socket.IO path (configured to chatRpcPath to match production)
      // Socket.IO's engine handles paths starting with the configured path
      if (pathname.startsWith(chatRpcPath)) {
        // Socket.IO handles this via its attachment to httpServer
        // The upgrade event is already being listened to by Socket.IO
        return;
      }

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
      this.io = undefined;
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
        this.logger.log(`  - Raw WebSocket: ws://localhost:${this.wsPort}/v1/kernels/zoo`);
        this.logger.log(`  - Socket.IO: ws://localhost:${this.wsPort}${chatRpcPath}`);
        resolve();
      });
    });
  }

  private async closeSocketIoServer(io: SocketIoServer): Promise<void> {
    await io.close();
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
