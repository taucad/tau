/* eslint-disable @typescript-eslint/member-ordering -- NestJS gateway has specific method ordering requirements */
/* oxlint-disable new-cap -- NestJS decorators use PascalCase */
import { Inject, Logger } from '@nestjs/common';
import type { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import type { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit } from '@nestjs/websockets';
import { WebSocketGateway, WebSocketServer, SubscribeMessage, ConnectedSocket, MessageBody } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { Auth } from 'better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import { AttributeKey } from '@taucad/telemetry';
import { chatRpcProtocolErrorCode, chatRpcProtocolVersion } from '@taucad/chat';
import type { ChatRpcJoinAck, ChatRpcJoinMessage } from '@taucad/chat';
import { MetricsService } from '#telemetry/metrics.js';
import { authInstanceKey } from '#constants/auth.constant.js';
import { ChatRpcService } from '#api/chat/chat-rpc.service.js';
import { chatRpcPath, DevWebSocketService } from '#api/websocket/dev-websocket.service.js';

/**
 * WebSocket Gateway for chat RPC execution using Socket.IO.
 *
 * Provides a bidirectional channel for executing client-side RPC operations
 * during LLM chat sessions. The backend sends RPC requests,
 * and the client executes them and returns results.
 *
 * In development: Uses DevWebSocketService's Socket.IO server on port+1
 * because vite-plugin-node doesn't support WebSocket connections.
 *
 * In production: Uses Socket.IO with Redis adapter for horizontal scaling
 * across multiple API instances.
 */
@WebSocketGateway({
  path: chatRpcPath,
  transports: ['websocket'],
  cors: false, // CORS handled by NestJS/Fastify
})
export class ChatRpcGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  @WebSocketServer()
  // @ts-expect-error Injected by NestJS in production, manually set in dev
  private readonly server!: Server;

  private readonly logger = new Logger(ChatRpcGateway.name);

  public constructor(
    private readonly chatRpcService: ChatRpcService,
    private readonly devWebSocketService: DevWebSocketService,
    @Inject(authInstanceKey) private readonly auth: Auth,
    private readonly metrics: MetricsService,
  ) {}

  /**
   * Initialize the gateway based on environment.
   */
  public async onModuleInit(): Promise<void> {
    if (import.meta.env.DEV) {
      await this.initDevSocketIo();
    }
  }

  /**
   * Clean up when module is destroyed.
   */
  public onModuleDestroy(): void {
    // DevWebSocketService handles its own cleanup
  }

  /**
   * Initialize Socket.IO handlers for development mode.
   * Uses the shared DevWebSocketService's Socket.IO server.
   * The server is already configured with path: chatRpcPath to match production.
   *
   * Auth runs as Socket.IO middleware so the `connection` event fires only after
   * auth succeeds. This prevents a race where clients emit 'join' before handlers
   * are registered (the old async handleDevConnection pattern dropped those events).
   */
  private async initDevSocketIo(): Promise<void> {
    const io = await this.devWebSocketService.ensureSocketIoServer();

    this.bindConnectionMetrics(io);

    io.use(async (socket, next) => {
      try {
        const session = await this.auth.api.getSession({
          headers: fromNodeHeaders(socket.handshake.headers),
        });

        if (!session) {
          this.logger.warn(`[Dev] Unauthenticated connection rejected: ${socket.id}`);
          next(new Error('UNAUTHENTICATED'));
          return;
        }

        socket.data.userId = session.user.id;
        this.logger.debug(`[Dev] Authenticated connection: ${socket.id} (user: ${session.user.id})`);
        next();
      } catch (authError) {
        this.logger.error(`[Dev] Authentication error for ${socket.id}:`, authError);
        next(new Error('AUTH_ERROR'));
      }
    });

    io.on('connection', (socket: Socket) => {
      this.handleDevConnection(socket);
    });

    const port = this.devWebSocketService.getPort();
    this.logger.log(`Chat RPC Socket.IO available at http://localhost:${port}${chatRpcPath} (dev mode)`);
  }

  /**
   * Register event handlers for a dev mode connection.
   * Auth is already verified by middleware — handlers are registered synchronously
   * so they are ready before the client's `connect` event fires.
   */
  private handleDevConnection(client: Socket): void {
    this.logger.debug(`[Dev] Client connected: ${client.id}`);

    client.on('join', async (data: ChatRpcJoinMessage, callback?: (ack: ChatRpcJoinAck) => void) => {
      const result = await this.handleJoinMessage(client, data);
      callback?.(result);
    });

    client.on('leave', (data: { chatId: string }) => {
      this.handleLeaveMessage(client, data);
    });

    client.on('disconnect', (reason) => {
      this.chatRpcService.handleSocketDisconnect(client);
      this.logger.warn(`[Dev] Client disconnected: ${client.id} (reason: ${reason})`);
    });
  }

  /**
   * Shared join logic for both dev and prod.
   * Supports joining multiple rooms - doesn't leave previous rooms.
   * Enforces chat ownership: the first user to join a chatId owns it,
   * subsequent joins by different users are rejected.
   */
  private async handleJoinMessage(client: Socket, data: ChatRpcJoinMessage | undefined): Promise<ChatRpcJoinAck> {
    const chatId = data?.chatId;

    if (!chatId) {
      this.logger.warn(`Join request without chatId from ${client.id}`);
      return { success: false };
    }

    if (data.rpcProtocolVersion !== chatRpcProtocolVersion) {
      this.logger.warn(
        `Chat RPC protocol mismatch for socket ${client.id}: received ${data.rpcProtocolVersion}, expected ${chatRpcProtocolVersion}`,
      );
      return {
        success: false,
        code: chatRpcProtocolErrorCode.protocolVersionMismatch,
        message: 'Chat RPC protocol changed. Reload this page to reconnect.',
        expectedProtocolVersion: chatRpcProtocolVersion,
        receivedProtocolVersion: data.rpcProtocolVersion,
      };
    }

    const { userId } = client.data as { userId?: string };
    if (!userId) {
      this.logger.warn(`Join request from unauthenticated socket ${client.id}`);
      return { success: false };
    }

    const registered = this.chatRpcService.registerConnection(chatId, client, userId);
    if (!registered) {
      this.logger.warn(`User ${userId} denied access to chat ${chatId} (owned by another user)`);
      return { success: false };
    }

    try {
      await client.join(chatId);
    } catch (joinError) {
      this.logger.error(`Failed to join room ${chatId} for socket ${client.id}:`, joinError);
      this.chatRpcService.unregisterConnection(chatId, client);
      return { success: false };
    }

    this.logger.debug(`Client ${client.id} joined chat: ${chatId}`);
    return { success: true, rpcProtocolVersion: chatRpcProtocolVersion };
  }

  /**
   * Shared leave logic for both dev and prod.
   */
  private handleLeaveMessage(client: Socket, data: { chatId: string } | undefined): void {
    const chatId = data?.chatId;

    if (!chatId) {
      this.logger.warn(`Leave request without chatId from ${client.id}`);
      return;
    }

    // Leave the room and unregister
    void client.leave(chatId);
    this.chatRpcService.unregisterConnection(chatId, client);

    this.logger.debug(`Client ${client.id} left chat: ${chatId}`);
  }

  private bindConnectionMetrics(server: Server): void {
    server.on('connection', (socket) => {
      this.metrics.wsActiveConnections.add(1);
      socket.on('disconnect', (reason) => {
        this.metrics.wsActiveConnections.add(-1);
        // oxlint-disable-next-line @typescript-eslint/naming-convention -- OTEL semantic convention attribute
        this.metrics.wsDisconnections.add(1, { [AttributeKey.WS_CLOSE_REASON]: reason });
      });
    });
  }

  // ============================================
  // Production mode handlers (NestJS decorators)
  // ============================================

  /**
   * Called when the Socket.IO server is initialized (production only).
   *
   * Auth runs as Socket.IO middleware so the `connection` event fires only after
   * auth succeeds. This prevents a race where `@SubscribeMessage` handlers process
   * events before the async `handleConnection` completes authentication.
   */
  public afterInit(server: Server): void {
    if (import.meta.env.PROD) {
      server.use(async (socket, next) => {
        try {
          const session = await this.auth.api.getSession({
            headers: fromNodeHeaders(socket.handshake.headers),
          });

          if (!session) {
            this.logger.warn(`Unauthenticated connection rejected: ${socket.id}`);
            next(new Error('UNAUTHENTICATED'));
            return;
          }

          socket.data.userId = session.user.id;
          this.logger.debug(`Authenticated connection: ${socket.id} (user: ${session.user.id})`);
          next();
        } catch (authError) {
          this.logger.error(`Authentication error for ${socket.id}:`, authError);
          next(new Error('AUTH_ERROR'));
        }
      });

      server.on('connection', (socket) => {
        socket.on('disconnect', (reason) => {
          this.logger.warn(`Client disconnected: ${socket.id} (reason: ${reason})`);
        });
      });

      this.bindConnectionMetrics(server);

      this.logger.log('Chat RPC Socket.IO gateway initialized (production)');
    }
  }

  /**
   * Handle client joining a chat room (production only).
   */
  @SubscribeMessage('join')
  public async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: ChatRpcJoinMessage,
  ): Promise<ChatRpcJoinAck> {
    if (import.meta.env.DEV) {
      return { success: false };
    }

    return this.handleJoinMessage(client, data);
  }

  /**
   * Handle client leaving a chat room (production only).
   */
  @SubscribeMessage('leave')
  public handleLeave(@ConnectedSocket() client: Socket, @MessageBody() data: { chatId: string }): void {
    // In dev mode, this is handled by the dev connection handler
    if (import.meta.env.DEV) {
      return;
    }

    this.handleLeaveMessage(client, data);
  }

  /**
   * Handle a new client connection (production only).
   * Auth is already verified by middleware registered in afterInit.
   */
  public handleConnection(client: Socket): void {
    if (import.meta.env.DEV) {
      return;
    }

    this.logger.debug(`Client connected: ${client.id} (user: ${client.data.userId})`);
  }

  /**
   * Handle client disconnection (production only).
   */
  public handleDisconnect(client: Socket): void {
    // In dev mode, this is handled by handleDevDisconnect
    if (import.meta.env.DEV) {
      return;
    }

    this.chatRpcService.handleSocketDisconnect(client);
  }
}
