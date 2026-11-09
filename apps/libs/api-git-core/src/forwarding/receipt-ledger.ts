import type { Redis } from 'ioredis';

/**
 * Which receipts the API has applied, by `rid` and `kind` (DC1; W9 Finding 2:
 * "rejects a `rid` it has already applied"). Shared by every API Machine
 * through Redis, so a receipt replayed to another Machine still changes no row.
 *
 * Kept longer than a receipt can be accepted (600 s old at most), so a replay
 * the age check would let through is still found here.
 */

/** How long a claim is held: past `maximumReceiptAgeSeconds` with room for clock skew. */
export const receiptClaimSeconds = 900;

export type ReceiptLedger = {
  /** Claims `(rid, kind)`; false when it was already claimed. */
  claim(rid: string, kind: string): Promise<boolean>;
  /** Gives a claim back when its apply failed before changing anything, so a retry can land. */
  release(rid: string, kind: string): Promise<void>;
};

const keyOf = (rid: string, kind: string): string => `git:receipt:${rid}:${kind}`;

/**
 * The ledger in the API's Redis: `SET NX EX`, one round trip per receipt.
 *
 * @param client - The API's Redis client.
 * @returns The ledger.
 */
export const redisReceiptLedger = (client: Pick<Redis, 'set' | 'del'>): ReceiptLedger => ({
  async claim(rid, kind) {
    return (await client.set(keyOf(rid, kind), '1', 'EX', receiptClaimSeconds, 'NX')) === 'OK';
  },
  async release(rid, kind) {
    await client.del(keyOf(rid, kind));
  },
});

/**
 * A process-local ledger, for a `GitRepositoryService` built outside the Nest
 * module (the unit suites).
 *
 * @returns The ledger.
 */
export const memoryReceiptLedger = (now: () => number = Date.now): ReceiptLedger => {
  /* Claim times by key, oldest first (insertion order); a claim older than
     `receiptClaimSeconds` is pruned, as the Redis key would expire. */
  const claimed = new Map<string, number>();
  const prune = (at: number): void => {
    for (const [key, claimedAt] of claimed) {
      if (at - claimedAt < receiptClaimSeconds * 1000) {
        return;
      }
      claimed.delete(key);
    }
  };
  return {
    async claim(rid, kind) {
      const at = now();
      prune(at);
      const key = keyOf(rid, kind);
      if (claimed.has(key)) {
        return false;
      }
      claimed.set(key, at);
      return true;
    },
    async release(rid, kind) {
      claimed.delete(keyOf(rid, kind));
    },
  };
};
