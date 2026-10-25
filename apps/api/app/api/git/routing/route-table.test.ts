import { randomBytes } from 'node:crypto';
import process from 'node:process';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '#database/schema.js';
import { project, projectGitRoute, user } from '#database/schema.js';
import { databaseReachable } from '#testing/database-reachable.js';
import { createScratchDatabase } from '#testing/scratch-database.js';
import type { ScratchDatabase } from '#testing/scratch-database.js';
import { defaultRoute, isFrozen } from '#api/git/routing/route.js';
import {
  freezeAll,
  freezeRoute,
  readFrozenSummary,
  readRoute,
  switchRoute,
  unfreezeAll,
  unfreezeRoute,
} from '#api/git/routing/route-table.js';

/**
 * The route table in Postgres (DW1, W10 R1). Its own database, because the
 * global freeze and the frozen summary are selected by state, not by an id
 * this suite generated.
 */
describe.skipIf(!(await databaseReachable(process.env.DATABASE_URL)))('the repository route table (DW1)', () => {
  let scratch: ScratchDatabase;
  let client: postgres.Sql;
  let database: ReturnType<typeof drizzle<typeof schema>>;

  const seedProject = async (): Promise<string> => {
    const ownerId = `user_dw1_${randomBytes(4).toString('hex')}`;
    const projectId = `proj_dw1_${randomBytes(4).toString('hex')}`;
    await database.insert(user).values({ id: ownerId, name: 'DW1', email: `${ownerId}@test.invalid` });
    await database.insert(project).values({ id: projectId, ownerId, name: 'Route' });
    return projectId;
  };

  beforeAll(async () => {
    scratch = await createScratchDatabase('git_route');
    client = postgres(scratch.url, { max: 4, prepare: false });
    database = drizzle(client, { schema });
  }, 300_000);

  afterAll(async () => {
    await client.end();
    await scratch.drop();
  }, 60_000);

  describe('the lookup default (north star compatibility: no backfill)', () => {
    it('serves a repository with no route row from today’s R2 store, unfrozen', async () => {
      const projectId = await seedProject();

      const route = await readRoute(database, projectId);

      expect(route).toStrictEqual(defaultRoute);
      expect(route.store).toBe('r2');
      expect(isFrozen(route, Date.now())).toBe(false);
    });

    it('serves a row that holds only its column defaults the same way', async () => {
      const projectId = await seedProject();
      await database.insert(projectGitRoute).values({ projectId });

      expect(await readRoute(database, projectId)).toStrictEqual(defaultRoute);
    });

    it('serves a project that does not exist the same way, so the lookup never decides authorization', async () => {
      expect(await readRoute(database, `proj_missing_${randomBytes(4).toString('hex')}`)).toStrictEqual(defaultRoute);
    });

    it('refuses a store no build serves at the database', async () => {
      const projectId = await seedProject();
      await expect(database.insert(projectGitRoute).values({ projectId, store: 'enroute' })).rejects.toThrow();
    });
  });

  describe('a per-repository freeze', () => {
    it('is a lease that lapses on its own, held by one migration id', async () => {
      const projectId = await seedProject();
      const now = new Date();

      const frozen = await freezeRoute(database, {
        projectId,
        migrationId: 'mig_a',
        forMilliseconds: 20_000,
        now,
      });
      expect(frozen).toMatchObject({ frozen: true });

      const route = await readRoute(database, projectId);
      expect(route).toMatchObject({ store: 'r2', migrationId: 'mig_a' });
      expect(isFrozen(route, now.getTime() + 19_000)).toBe(true);
      expect(isFrozen(route, now.getTime() + 20_001)).toBe(false);

      /* A second migration cannot take a live freeze. */
      expect(
        await freezeRoute(database, {
          projectId,
          migrationId: 'mig_b',
          forMilliseconds: 20_000,
        }),
      ).toStrictEqual({
        frozen: false,
        heldBy: 'mig_a',
      });
      /* Nor thaw or switch it. */
      expect(await unfreezeRoute(database, { projectId, migrationId: 'mig_b' })).toBe(false);
      expect(
        await switchRoute(database, {
          projectId,
          migrationId: 'mig_b',
          store: 'r2',
        }),
      ).toBe(false);
      expect(await unfreezeRoute(database, { projectId, migrationId: 'mig_a' })).toBe(true);
      expect(isFrozen(await readRoute(database, projectId), Date.now())).toBe(false);
    });

    it('can be taken by another migration once the first one’s lease has lapsed', async () => {
      const projectId = await seedProject();
      const past = new Date(Date.now() - 60_000);
      await freezeRoute(database, {
        projectId,
        migrationId: 'mig_dead',
        forMilliseconds: 20_000,
        now: past,
      });

      expect(
        await freezeRoute(database, {
          projectId,
          migrationId: 'mig_next',
          forMilliseconds: 20_000,
        }),
      ).toMatchObject({ frozen: true });
    });

    it('keeps the original frozen_at when the holder extends its own freeze', async () => {
      const projectId = await seedProject();
      const start = new Date(Date.now() - 5000);
      await freezeRoute(database, {
        projectId,
        migrationId: 'mig_a',
        forMilliseconds: 20_000,
        now: start,
      });
      await freezeRoute(database, {
        projectId,
        migrationId: 'mig_a',
        forMilliseconds: 20_000,
      });

      const [row] = await database.select().from(projectGitRoute).where(eq(projectGitRoute.projectId, projectId));
      expect(row?.frozenAt?.getTime()).toBe(start.getTime());
    });

    it('switches only with at least 2 s of the freeze left, and thaws in the same write', async () => {
      const projectId = await seedProject();
      const now = new Date();
      await freezeRoute(database, {
        projectId,
        migrationId: 'mig_a',
        forMilliseconds: 1500,
        now,
      });
      expect(
        await switchRoute(database, {
          projectId,
          migrationId: 'mig_a',
          store: 'r2',
          now,
        }),
      ).toBe(false);

      await freezeRoute(database, {
        projectId,
        migrationId: 'mig_a',
        forMilliseconds: 20_000,
        now,
      });
      expect(
        await switchRoute(database, {
          projectId,
          migrationId: 'mig_a',
          store: 'r2',
          now,
        }),
      ).toBe(true);
      const route = await readRoute(database, projectId);
      expect(route).toStrictEqual(defaultRoute);
    });
  });

  describe('the global freeze (restore runbook)', () => {
    it('freezes every repository, routed or not, until it is lifted', async () => {
      const unrouted = await seedProject();
      const routed = await seedProject();
      await database.insert(projectGitRoute).values({ projectId: routed });

      const { frozenUntil } = await freezeAll(database, {
        migrationId: 'inc_42',
        forMilliseconds: 60_000,
      });
      try {
        for (const projectId of [unrouted, routed]) {
          // oxlint-disable-next-line no-await-in-loop -- two reads, in order
          const route = await readRoute(database, projectId);
          expect(route).toMatchObject({
            store: 'r2',
            migrationId: 'inc_42',
            global: true,
          });
          expect(route.frozenUntil?.getTime()).toBe(frozenUntil.getTime());
          expect(isFrozen(route, Date.now())).toBe(true);
        }
      } finally {
        expect(await unfreezeAll(database)).toBe(true);
      }
      expect(await readRoute(database, unrouted)).toStrictEqual(defaultRoute);
    });

    it('reports the later of a repository freeze and the global one', async () => {
      const projectId = await seedProject();
      const now = new Date();
      await freezeRoute(database, {
        projectId,
        migrationId: 'mig_long',
        forMilliseconds: 120_000,
        now,
      });
      await freezeAll(database, {
        migrationId: 'inc_short',
        forMilliseconds: 10_000,
        now,
      });
      try {
        const route = await readRoute(database, projectId);
        expect(route).toMatchObject({ migrationId: 'mig_long' });
        expect(route.global).toBeUndefined();
      } finally {
        await unfreezeAll(database);
        await unfreezeRoute(database, { projectId, migrationId: 'mig_long' });
      }
    });
  });

  describe('the frozen summary (OB5 gauges)', () => {
    it('counts live freezes by scope and ages the oldest', async () => {
      await database.execute(sql`DELETE FROM project_git_route`);
      const now = new Date();
      const [first, second, lapsed] = [await seedProject(), await seedProject(), await seedProject()];
      await freezeRoute(database, {
        projectId: first,
        migrationId: 'mig_a',
        forMilliseconds: 120_000,
        now: new Date(now.getTime() - 90_000),
      });
      await freezeRoute(database, {
        projectId: second,
        migrationId: 'mig_a',
        forMilliseconds: 20_000,
        now,
      });
      await freezeRoute(database, {
        projectId: lapsed,
        migrationId: 'mig_a',
        forMilliseconds: 20_000,
        now: new Date(now.getTime() - 60_000),
      });

      const summary = await readFrozenSummary(database, now);

      expect(summary.repository.frozen).toBe(2);
      expect(summary.repository.oldestSeconds).toBeCloseTo(90, 0);
      expect(summary.global).toStrictEqual({ frozen: 0, oldestSeconds: 0 });
    });
  });
});
