import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { RedisService } from '#redis/redis.service.js';
import { RedisReadDedupStore } from '#api/chat/redis-read-dedup-store.js';

/**
 * Time-to-live (seconds) applied to `read_file` dedup pointers in the
 * Redis-backed {@link RedisReadDedupStore}. Bounds staleness across long-lived
 * chats by capping how long a `priorToolCallId` pointer survives before the
 * next read is treated as a fresh hit. Hard-coded here while we still have a
 * single production wiring; promote to a config knob once a second consumer
 * needs a different window.
 */
const dedupEntryTtlSeconds = 3600;

/**
 * Constructs the auxiliary LangGraph `BaseStore` used by the `read_file`
 * dedup cache (see {@link RedisReadDedupStore}). Mirrors the
 * {@link import('#api/chat/checkpointer.service.js').CheckpointerService}
 * shape so test runs can swap implementations via NestJS DI without touching
 * `ChatService`.
 */
@Injectable()
export class StoreService implements OnModuleInit, OnModuleDestroy {
  private store!: RedisReadDedupStore;
  private redis!: Redis;
  private destroyed = false;

  public constructor(private readonly redisService: RedisService) {}

  public onModuleInit(): void {
    this.redis = this.redisService.createDuplicateClient();
    this.store = new RedisReadDedupStore({ redis: this.redis, ttlSeconds: dedupEntryTtlSeconds });
    this.destroyed = false;
  }

  public async onModuleDestroy(): Promise<void> {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    await this.redis.quit();
  }

  public getStore(): RedisReadDedupStore {
    return this.store;
  }
}
