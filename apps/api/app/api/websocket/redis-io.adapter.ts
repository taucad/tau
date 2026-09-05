import type { INestApplication } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-streams-adapter';
import type { Redis } from 'ioredis';
import type { ServerOptions, Server } from 'socket.io';
import type { RedisService } from '#redis/redis.service.js';

/**
 * Socket.IO adapter with Redis Streams for horizontal scaling.
 * Uses Redis Streams instead of Pub/Sub to survive temporary Redis
 * disconnections without losing packets, and to support Connection
 * State Recovery (CSR).
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor: ReturnType<typeof createAdapter> | undefined;
  private adapterClient: Redis | undefined;

  public constructor(
    app: INestApplication,
    private readonly redisService: RedisService,
  ) {
    super(app);
  }

  /**
   * Initialize Redis Streams adapter with a single client.
   * Must be called before the adapter is used.
   */
  public async connectToRedis(): Promise<void> {
    this.adapterClient = this.redisService.createDuplicateClient();

    this.adapterClient.on('error', (error) => {
      this.logger.error(`Redis adapter error: ${error.message}`);
    });
    this.adapterClient.on('connect', () => {
      this.logger.debug('Redis adapter connected');
    });
    this.adapterClient.on('close', () => {
      this.logger.warn('Redis adapter disconnected');
    });

    await this.adapterClient.connect();

    this.adapterConstructor = createAdapter(this.adapterClient, {
      streamName: 'tau:socketio',
      maxLen: 10_000,
    });
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention -- NestJS IoAdapter method
  public override createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, {
      ...options,
      // Force WebSocket transport only - no polling fallback
      transports: ['websocket'],
      // CORS is handled by NestJS/Fastify
      cors: false,
      // 50MB — accommodates multi-angle base64 image capture responses (default 1MB is too small)
      maxHttpBufferSize: 50e6,
      pingTimeout: 30_000,
      connectionStateRecovery: {
        maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
        skipMiddlewares: false,
      },
    }) as Server;

    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }

    return server;
  }
}
