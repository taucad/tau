import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Environment } from '#config/environment.config.js';
import { AttributeKey } from '@taucad/telemetry';
import { MetricsService } from '#telemetry/metrics.js';

/**
 * Milliseconds. Finite socket-connect deadline: a dial that is accepted but
 * never completes must not stall boot or readiness indefinitely.
 */
const connectTimeoutMilliseconds = 5000;

/**
 * Milliseconds. Finite per-command deadline on the shared client. Without it a
 * connected-but-unresponsive server hangs `/health/ready` forever, so the
 * machine is never taken out of the load balancer.
 */
const commandTimeoutMilliseconds = 5000;

/**
 * Milliseconds. Duplicates run blocking reads — `XREAD BLOCK 5000` in the
 * Socket.IO streams adapter and `XREAD BLOCK 1000` in the host frame relay — so
 * their deadline must clear the longest block while staying finite.
 */
const duplicateCommandTimeoutMilliseconds = 15_000;

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  /** Primary Redis client for general use */
  public readonly client: Redis;

  private readonly logger = new Logger(RedisService.name);

  public constructor(
    private readonly configService: ConfigService<Environment, true>,
    private readonly metrics: MetricsService,
  ) {
    const redisUrl = this.configService.get('REDIS_URL', { infer: true });

    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      connectTimeout: connectTimeoutMilliseconds,
      commandTimeout: commandTimeoutMilliseconds,
      /* No offline queue: a command issued while the socket is down fails now
       * instead of being buffered without bound and replayed on reconnect
       * against state the caller has long since stopped waiting for. Redis
       * holds only coordination state, so failing closed is always correct. */
      enableOfflineQueue: false,
      retryStrategy: (times: number) => {
        if (times > 10) {
          this.logger.error('Redis connection failed after 10 retries');
          return null; // Stop retrying
        }

        return Math.min(times * 100, 3000); // Exponential backoff, max 3s
      },
      lazyConnect: true, // Don't connect until onModuleInit
    });

    this.client.on('error', (error: Error) => {
      this.logger.error(`Redis client error: ${error.message}`);
      this.metrics.redisConnectionState.record(0, { [AttributeKey.REDIS_ROLE]: 'primary' });
    });

    this.client.on('connect', () => {
      this.logger.debug('Redis client connected');
      this.metrics.redisConnectionState.record(1, { [AttributeKey.REDIS_ROLE]: 'primary' });
    });

    this.client.on('close', () => {
      this.metrics.redisConnectionState.record(0, { [AttributeKey.REDIS_ROLE]: 'primary' });
    });
  }

  /**
   * Connect to Redis and verify connection on module init.
   * Throws if connection fails - this prevents app startup with broken Redis.
   */
  public async onModuleInit(): Promise<void> {
    /* `connectTimeout` covers only the TCP handshake. A peer that accepts the
     * socket and never answers the ready check leaves `connect()` pending for
     * ever; closing the client turns that into a bounded boot failure (the
     * rejection trails by ioredis's own 2s `disconnectTimeout`). */
    const readyDeadline = setTimeout(() => {
      this.client.disconnect();
    }, connectTimeoutMilliseconds);
    readyDeadline.unref();

    try {
      await this.client.connect();
      const pong = await this.client.ping();
      if (pong !== ('PONG' as string)) {
        throw new Error(`Unexpected Redis PING response: ${pong}`);
      }

      this.logger.log('Redis connection established');
    } catch (error) {
      this.logger.error('Failed to connect to Redis:', error);
      throw new Error(`Redis connection failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(readyDeadline);
    }
  }

  /**
   * Gracefully close Redis connection on module destroy.
   */
  public async onModuleDestroy(): Promise<void> {
    /* `quit()` is itself a command, so with no offline queue it throws when the
     * socket is already down. Shutdown during an outage must still be clean. */
    if (this.client.status === 'ready') {
      await this.client.quit();
    } else {
      this.client.disconnect();
    }

    this.logger.log('Redis connection closed');
  }

  /**
   * Create a duplicate client for isolated connections (e.g. Socket.IO Redis Streams adapter).
   *
   * The caller owns the returned client's lifetime and must `quit()` or
   * `disconnect()` it. Duplicates inherit every option above except the command
   * deadline, which is widened because these connections carry blocking reads.
   */
  public createDuplicateClient(): Redis {
    return this.client.duplicate({ commandTimeout: duplicateCommandTimeoutMilliseconds });
  }
}
