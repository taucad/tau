import { randomBytes } from 'node:crypto';
import process from 'node:process';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '#database/schema.js';
import { databaseReachable } from '#testing/database-reachable.js';
import { createScratchDatabase } from '#testing/scratch-database.js';
import type { ScratchDatabase } from '#testing/scratch-database.js';
import { freezeEverything, parseFreezeSeconds, thawEverything } from '#api/git/routing/global-freeze.js';
import { MemoryInFlightRegistry } from '#api/git/routing/in-flight.js';
import { isFrozen } from '#api/git/routing/route.js';
import { readRoute } from '#api/git/routing/route-table.js';

describe('the freeze lease an operator asks for', () => {
  it('is a whole number of seconds, at most a day', () => {
    expect(parseFreezeSeconds('600')).toBe(600);
    expect(parseFreezeSeconds('86400')).toBe(86_400);
    for (const refused of [undefined, '', '0', '-5', '1.5', '86401', 'forever']) {
      expect(() => parseFreezeSeconds(refused)).toThrow(/--for/u);
    }
  });
});

/**
 * The restore runbook's global freeze (W13 step 0): `revisions-maintenance
 * freeze-all` writes it, then drains every repository's in-flight requests,
 * so a fleet restore starts with no write still landing in the store.
 */
describe.skipIf(!(await databaseReachable(process.env.DATABASE_URL)))('the global freeze command (DW1)', () => {
  let scratch: ScratchDatabase;
  let client: postgres.Sql;
  let database: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    scratch = await createScratchDatabase('git_route_global');
    client = postgres(scratch.url, { max: 2, prepare: false });
    database = drizzle(client, { schema });
  }, 300_000);

  afterAll(async () => {
    await client.end();
    await scratch.drop();
  }, 60_000);

  it('freezes every repository, waits for what was in flight, and thaws', async () => {
    const registry = new MemoryInFlightRegistry();
    const release = await registry.register(`proj_${randomBytes(4).toString('hex')}`);
    setTimeout(release, 200);

    const frozen = await freezeEverything({
      database,
      registry,
      reason: 'inc_restore_1',
      forSeconds: 600,
    });

    expect(frozen).toMatchObject({
      scope: 'global',
      reason: 'inc_restore_1',
      drained: true,
    });
    expect(frozen.frozenUntil.getTime() - frozen.frozenAt.getTime()).toBe(600_000);
    expect(isFrozen(await readRoute(database, 'proj_any'), Date.now())).toBe(true);

    expect(await thawEverything(database)).toStrictEqual({
      scope: 'global',
      lifted: true,
    });
    expect(isFrozen(await readRoute(database, 'proj_any'), Date.now())).toBe(false);
  });

  it('reports a drain that timed out rather than claiming the store is quiet', async () => {
    const registry = new MemoryInFlightRegistry();
    const release = await registry.register('proj_long');
    try {
      const frozen = await freezeEverything({
        database,
        registry,
        reason: 'inc_restore_2',
        forSeconds: 60,
        drainTimeoutMilliseconds: 150,
      });
      expect(frozen.drained).toBe(false);
    } finally {
      release();
      await thawEverything(database);
    }
  });
});
