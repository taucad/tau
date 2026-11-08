import { describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { Environment } from '@taucad/api-core';
import type { MetricsService } from '@taucad/api-observability/metrics';
import { parseMemoryUtilization, RedisService } from '#redis/redis.service.js';

const createService = (): RedisService => {
  const configService = { get: () => 'redis://127.0.0.1:6379' } as unknown as ConfigService<Environment, true>;
  const metrics = {
    redisConnectionState: { record: () => undefined },
    redisMemoryUtilization: { record: () => undefined },
  } as unknown as MetricsService;
  return new RedisService(configService, metrics);
};

describe('RedisService client policy', () => {
  it('should bound the connect and command deadlines and refuse an offline queue', () => {
    const service = createService();

    try {
      expect(service.client.options).toMatchObject({
        connectTimeout: 5000,
        commandTimeout: 5000,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });
    } finally {
      service.client.disconnect();
    }
  });

  it('should shut down cleanly when the connection is already gone', async () => {
    const service = createService();

    /* `quit()` is a command; with no offline queue it rejects on a dead socket
     * and would fail every Nest shutdown that follows a Redis outage. */
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    expect(service.client.status).toBe('end');
  });

  it('should widen only the command deadline on duplicates so blocking reads still fail finitely', () => {
    const service = createService();
    const duplicate = service.createDuplicateClient();

    try {
      /* Blocking XREAD runs on duplicates (BLOCK 5000 in the Socket.IO streams
       * adapter), so the deadline must clear the block yet stay finite. */
      expect(duplicate.options.commandTimeout).toBe(15_000);
      expect(duplicate.options).toMatchObject({
        connectTimeout: 5000,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 3,
      });
    } finally {
      duplicate.disconnect();
      service.client.disconnect();
    }
  });

  it('should keep reconnecting with a capped backoff however long Redis is gone', () => {
    const service = createService();

    try {
      /* A `null` here ends reconnection for the life of the process and leaves
       * the Machine unready after Redis recovers. */
      const retry = service.client.options.retryStrategy!;
      expect(retry(1)).toBe(100);
      expect(retry(10)).toBe(1000);
      expect(retry(11)).toBe(1100);
      expect(retry(10_000)).toBe(3000);
    } finally {
      service.client.disconnect();
    }
  });
});

describe('parseMemoryUtilization', () => {
  it('should divide used_memory by maxmemory', () => {
    expect(parseMemoryUtilization('# Memory\r\nused_memory:50\r\nused_memory_human:50B\r\nmaxmemory:200\r\n')).toBe(
      0.25,
    );
  });

  it('should report nothing when the server has no memory limit', () => {
    expect(parseMemoryUtilization('used_memory:50\r\nmaxmemory:0\r\n')).toBeUndefined();
    expect(parseMemoryUtilization('# Memory\r\n')).toBeUndefined();
  });
});
