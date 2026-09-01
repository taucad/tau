/**
 * @file Hand-rolled minimal `BaseStore` adapter over `ioredis`.
 *
 * Backs the `read_file` dedup cache (see
 * {@link import('#api/tools/tools/tool-read-file.js').readFileTool}). The
 * dedup pointer is a hot-path, write-heavy, loss-tolerant, bounded-working-set
 * cache (~50 bytes per entry, ~200 entries per chat, ~1h relevance window).
 *
 * Why hand-rolled instead of `@langchain/langgraph-checkpoint-redis`'s
 * `RedisStore`:
 *
 * - That package requires Redis 8.0+ OR Redis Stack (RedisJSON + RediSearch).
 *   Tau ships `redis:7-alpine` in dev and a vanilla Redis 7 cluster in prod;
 *   Fly.io's 2026 Valkey path explicitly does NOT bundle the Stack modules.
 * - The dedup cache only needs four BaseStore ops (`get`/`put`/`delete`/
 *   `listNamespaces`). Search / vector / full-text is intentionally out of
 *   scope.
 *
 * Wire shape:
 *
 * - Key encoding: `recent_reads:{chatId}:{fingerprint}`.
 * - Value: a JSON-serialised {@link StoredItem} carrying the full
 *   `BaseStore.Item` round-trip (namespace, key, createdAt, updatedAt, value)
 *   so deserialised items match `@langchain/langgraph-checkpoint`'s
 *   {@link import('@langchain/langgraph').Item} contract.
 * - TTL: injected via constructor and applied through `SET ... EX`, native to
 *   Redis since 1.0. No background sweeper required.
 *
 * Compatible with every Redis-protocol implementation we ship to (Redis 5+,
 * Valkey, Upstash, KeyDB, Dragonfly) because only commands from the Redis 1.0
 * surface (`GET`/`SET`/`DEL`/`SCAN`) are used.
 *
 * @public
 */
import type { Redis } from 'ioredis';
import { BaseStore } from '@langchain/langgraph';
import type {
  GetOperation,
  Item,
  ListNamespacesOperation,
  Operation,
  OperationResults,
  PutOperation,
  SearchOperation,
} from '@langchain/langgraph';

/**
 * Thrown when an unsupported `BaseStore` operation is dispatched to
 * {@link RedisReadDedupStore}. Surfacing a typed error makes it obvious at
 * call sites (e.g. compaction middleware) that the chosen `BaseStore` path
 * does not cover vector / full-text / namespace-listing semantics — callers
 * must adapt rather than silently no-op.
 *
 * @public
 */
export class RedisReadDedupStoreUnsupportedOperationError extends Error {
  public constructor(operationKind: string) {
    super(
      `RedisReadDedupStore does not support ${operationKind}. Only get / put / delete are wired (the read_file dedup cache is a hot-path KV store, not a search index).`,
    );
    this.name = 'RedisReadDedupStoreUnsupportedOperationError';
  }
}

/** Persistent on-wire shape of a single dedup entry. */
type StoredItem = {
  value: Record<string, unknown>;
  namespace: string[];
  key: string;
  createdAt: string;
  updatedAt: string;
};

const recentReadsRoot = 'recent_reads';

const encodeRedisKey = (namespace: string[], key: string): string => `${namespace.join(':')}:${key}`;

const isGetOperation = (op: Operation): op is GetOperation => 'namespace' in op && 'key' in op && !('value' in op);

const isPutOperation = (op: Operation): op is PutOperation => 'namespace' in op && 'key' in op && 'value' in op;

const isSearchOperation = (op: Operation): op is SearchOperation => 'namespacePrefix' in op;

const isListNamespacesOperation = (op: Operation): op is ListNamespacesOperation =>
  !('namespace' in op) && !('namespacePrefix' in op) && 'limit' in op && 'offset' in op;

const safeParse = (raw: string): StoredItem | undefined => {
  try {
    return JSON.parse(raw) as StoredItem;
  } catch {
    return undefined;
  }
};

/**
 * `BaseStore` implementation backed by an `ioredis` client.
 *
 * @public
 */
export class RedisReadDedupStore extends BaseStore {
  private readonly redis: Redis;
  private readonly ttlSeconds: number;

  public constructor(options: { redis: Redis; ttlSeconds: number }) {
    super();
    this.redis = options.redis;
    this.ttlSeconds = options.ttlSeconds;
  }

  /**
   * Single concrete override of the abstract method on `BaseStore`. Every
   * convenience method (`get`/`put`/`delete`/`search`/`listNamespaces`) on the
   * superclass dispatches to `batch()`, so this is the only seam we need.
   */
  public async batch<Op extends Operation[]>(operations: Op): Promise<OperationResults<Op>> {
    const results = await Promise.all(operations.map(async (operation) => this.dispatchOne(operation)));
    return results as unknown as OperationResults<Op>;
  }

  /**
   * Delete every dedup pointer for `chatId` in a SCAN+DEL pipeline. Used by
   * the compaction middleware after the message tail is summarised so dangling
   * `priorToolCallId` pointers cannot be re-served on the next `read_file`
   * call.
   *
   * `SCAN` is inherently cursor-based and Redis requires the next request to
   * carry the previous cursor, so the loop body must `await` sequentially
   * before issuing the next `SCAN`. We collect every batched key delete and
   * run them in parallel after the scan completes.
   *
   * Returns the number of keys removed (best-effort; clients should never rely
   * on the count being accurate across concurrent scans).
   *
   * @public
   */
  public async clearChat(chatId: string): Promise<number> {
    const pattern = `${recentReadsRoot}:${chatId}:*`;
    const batches: string[][] = [];
    let cursor = '0';
    do {
      // oxlint-disable-next-line no-await-in-loop -- Redis SCAN is cursor-paginated; each step needs the prior cursor before the next request can be issued.
      const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 256);
      cursor = nextCursor;
      if (keys.length > 0) {
        batches.push(keys);
      }
    } while (cursor !== '0');

    const deletedCounts = await Promise.all(batches.map(async (keys) => this.redis.del(...keys)));
    return deletedCounts.reduce((total, count) => total + count, 0);
  }

  // oxlint-disable-next-line typescript-eslint/no-restricted-types -- `BaseStore` `GetOperation` result contract is `Item | null` upstream; we mirror that here so the public-facing return type stays in lockstep with `@langchain/langgraph-checkpoint`.
  private async dispatchOne(operation: Operation): Promise<Item | null | undefined | unknown[]> {
    if (isGetOperation(operation)) {
      return this.handleGet(operation);
    }
    if (isPutOperation(operation)) {
      await this.handlePut(operation);
      return undefined;
    }
    if (isSearchOperation(operation)) {
      throw new RedisReadDedupStoreUnsupportedOperationError('search');
    }
    if (isListNamespacesOperation(operation)) {
      throw new RedisReadDedupStoreUnsupportedOperationError('listNamespaces');
    }
    throw new RedisReadDedupStoreUnsupportedOperationError('unknown operation');
  }

  // oxlint-disable-next-line typescript-eslint/no-restricted-types -- Matches the upstream `BaseStore.get` contract (`Promise<Item | null>`).
  private async handleGet(operation: GetOperation): Promise<Item | null> {
    const raw = await this.redis.get(encodeRedisKey(operation.namespace, operation.key));
    if (raw === null) {
      return null;
    }
    const parsed = safeParse(raw);
    if (!parsed) {
      return null;
    }
    return {
      value: parsed.value,
      key: parsed.key,
      namespace: parsed.namespace,
      createdAt: new Date(parsed.createdAt),
      updatedAt: new Date(parsed.updatedAt),
    };
  }

  private async handlePut(operation: PutOperation): Promise<void> {
    const redisKey = encodeRedisKey(operation.namespace, operation.key);
    if (operation.value === null) {
      await this.redis.del(redisKey);
      return;
    }
    const now = new Date().toISOString();
    const existing = await this.redis.get(redisKey);
    const createdAt = existing ? (safeParse(existing)?.createdAt ?? now) : now;
    const stored: StoredItem = {
      value: operation.value,
      namespace: operation.namespace,
      key: operation.key,
      createdAt,
      updatedAt: now,
    };
    await this.redis.set(redisKey, JSON.stringify(stored), 'EX', this.ttlSeconds);
  }
}
