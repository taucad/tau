import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { setTimeout as wait } from 'node:timers/promises';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrationJob } from '#database/database-migration.js';

/**
 * The release command against a lock another session holds. Every deploy re-runs
 * DDL (trigger reinstalls, migrations' `ALTER`s) on tables the API writes; an
 * `ALTER` queued behind a long transaction would queue every later write behind
 * itself. The job waits a bounded time for each lock, then retries.
 */
const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const name = `migration_lock_${randomUUID().slice(0, 8)}`;
const target = new URL(databaseUrl);
target.pathname = `/${name}`;
const quiet = {
  onnotice() {
    /* Expected idempotent DDL notices are not diagnostics. */
  },
};
const owner = postgres(databaseUrl, { max: 1, ...quiet });

/** Holds `ROW EXCLUSIVE` on a table the job's trigger reinstall locks, as an open write transaction does. */
const holdWriteLock = async (): Promise<{ release: () => Promise<void> }> => {
  const holder = postgres(target.toString(), { max: 1, ...quiet });
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let locked!: () => void;
  const isLocked = new Promise<void>((resolve) => {
    locked = resolve;
  });
  const transaction = holder.begin(async (sql) => {
    await sql`LOCK TABLE billing.credit_operation IN ROW EXCLUSIVE MODE`;
    locked();
    await released;
  });
  await isLocked;
  return {
    async release() {
      release();
      await transaction;
      await holder.end();
    },
  };
};

beforeAll(async () => {
  await owner.unsafe(`CREATE DATABASE "${name}"`);
  await runMigrationJob(target.toString());
}, 120_000);

afterAll(async () => {
  await owner.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await owner.end();
});

describe('runMigrationJob under a held lock', () => {
  it('should give up with lock_not_available after its bounded attempts instead of queueing', async () => {
    const lock = await holdWriteLock();
    const started = Date.now();
    try {
      await expect(
        runMigrationJob(target.toString(), { lockTimeoutMilliseconds: 200, attempts: 3, retryDelayMilliseconds: 10 }),
      ).rejects.toMatchObject({ code: '55P03' });
      expect(Date.now() - started).toBeLessThan(10_000);
    } finally {
      await lock.release();
    }
  }, 30_000);

  it('should retry and complete once the lock is released', async () => {
    const lock = await holdWriteLock();
    const releasing = (async () => {
      await wait(600);
      await lock.release();
    })();

    const result = await runMigrationJob(target.toString(), {
      lockTimeoutMilliseconds: 200,
      attempts: 20,
      retryDelayMilliseconds: 50,
    });
    await releasing;

    expect(result.applied).toBe(0);
  }, 30_000);
});
