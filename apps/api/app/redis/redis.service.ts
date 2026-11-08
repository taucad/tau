import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Environment } from '@taucad/api-core';
import { AttributeKey } from '@taucad/telemetry';
import { MetricsService } from '@taucad/api-observability/metrics';

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

/** Milliseconds. Ceiling on the reconnect backoff; reconnection itself never stops. */
const maxReconnectDelayMilliseconds = 3000;

/** Reconnect attempt at which a lasting outage is logged as an error, once per outage. */
const reconnectAlarmAttempt = 10;

/** Milliseconds. How often `INFO memory` is sampled for the memory-utilization gauge. */
const memorySampleIntervalMilliseconds = 30_000;

/**
 * Reads `used_memory / maxmemory` from an `INFO memory` reply, or `undefined` when the server
 * reports no limit (`maxmemory:0`) or omits either field.
 */
export const parseMemoryUtilization = (info: string): number | undefined => {
  const field = (name: string): number => Number(new RegExp(`^${name}:(\\d+)`, 'mu').exec(info)?.[1] ?? 0);
  const used = field('used_memory');
  const max = field('maxmemory');
  return max > 0 ? used / max : undefined;
};

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  /** Primary Redis client for general use */
  public readonly client: Redis;

  private readonly logger = new Logger(RedisService.name);

  private memorySampler: NodeJS.Timeout | undefined;

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
      /* Never give up. Returning `null` here ends reconnection for the life of
       * the process, and because `/health/ready` requires Redis that left every
       * Machine unready after Redis recovered, until a human restarted it.
       * Duplicates inherit this strategy. */
      retryStrategy: (times: number) => {
        if (times === reconnectAlarmAttempt) {
          this.logger.error(
            `Redis still unreachable after ${times} reconnect attempts; retrying every ${maxReconnectDelayMilliseconds} ms`,
          );
        }

        return Math.min(times * 100, maxReconnectDelayMilliseconds);
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
      this.memorySampler = setInterval(() => {
        void this.sampleMemory();
      }, memorySampleIntervalMilliseconds);
      this.memorySampler.unref();
      void this.sampleMemory();
    } catch (error) {
      /* Reconnection never stops on its own, so a failed boot must end it. */
      this.client.disconnect();
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
    clearInterval(this.memorySampler);

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

  /**
   * Records the memory-utilization gauge. A failed sample records nothing: the
   * connection-state gauge already reports an unreachable Redis.
   */
  private async sampleMemory(): Promise<void> {
    try {
      const utilization = parseMemoryUtilization(await this.client.info('memory'));
      if (utilization !== undefined) {
        this.metrics.redisMemoryUtilization.record(utilization);
      }
    } catch {
      // Covered by redis.connection.state.
    }
  }
}
