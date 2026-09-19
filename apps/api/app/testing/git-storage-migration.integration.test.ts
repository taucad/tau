import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { assertSchemaCompatibility, readMigrationHead } from '#database/database-migration.js';
import { databaseReachable } from '#testing/database-reachable.js';

/**
 * Testing policy §13: a durable migration needs failure-injection and restart
 * tests, applied against a real PostgreSQL.
 *
 * The W3 migration adds five tables and three columns, and the deployment that
 * runs it is a one-shot release command (`apps/api/fly.*.toml`) that every
 * replica then asserts itself against. Two properties therefore have to hold
 * beyond "it applies": a run interrupted part-way leaves the schema exactly
 * where it was, rather than half-migrated with its bookkeeping row missing; and
 * a re-run completes without re-applying anything, so a retried release is
 * safe. This suite proves both on a scratch database it creates and drops.
 */
const migrationsFolder = path.resolve(import.meta.dirname, '../database/migrations');
/*
 * The workspace's own PostgreSQL, which `pnpm infra:up` starts and CI's
 * `docker-compose` job brings up with the same credentials. Its own variable
 * rather than `DATABASE_URL`: this connection is only the admin one a scratch
 * database is created from, so an operator can aim it elsewhere without moving
 * the database the rest of the suites use.
 */
const adminUrl =
  process.env['TAU_MIGRATION_TEST_DATABASE_URL'] ?? 'postgresql://dev_user:dev_password@localhost:5432/tau_dev';

/** Tables and columns the W3 migration introduces (D10, D11, D19, D26, D27). */
const addedTables = ['storage_account', 'project_collaborator', 'project_invitation', 'storage_tombstone'] as const;
const addedColumns = [
  { table: 'project', column: 'storage_account_id' },
  { table: 'project_git', column: 'generation' },
  { table: 'project_git', column: 'derived_generation' },
  { table: 'project_git', column: 'copied_generation' },
] as const;

type Journal = { entries: Array<{ readonly tag: string; readonly when: number }> };

/*
 * W3's own migration, located by tag rather than by being last: later work adds
 * later migrations, and injecting the failure into whichever one happens to be
 * newest tests somebody else's DDL against W3's assertions.
 */
const w3MigrationTag = '0041_git_storage_substrate';

describe.skipIf(!(await databaseReachable(adminUrl)))('W3 migration on a real PostgreSQL', () => {
  const scratchName = `tau_w3_migration_${String(process.pid)}`;
  let scratchUrl: string;
  let admin: postgres.Sql;
  let client: postgres.Sql;
  /** The migrations folder with W3's entry, and everything after it, removed. */
  let previousHeadFolder: string;
  let head: Awaited<ReturnType<typeof readMigrationHead>>;
  /** How many migrations precede W3's, which is what the truncated folder applies. */
  let beforeW3: number;

  /**
   * How many migrations the migrator believes it has applied.
   *
   * @returns The bookkeeping row count, or zero before the table exists.
   */
  const appliedCount = async (): Promise<number> => {
    const [marker] = await client<Array<{ present: boolean }>>`
      SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS present`;
    if (marker?.present !== true) {
      return 0;
    }
    const [row] = await client<Array<{ applied: number }>>`
      SELECT count(*)::int AS applied FROM drizzle.__drizzle_migrations`;
    return row?.applied ?? 0;
  };

  /**
   * Which of the migration's objects the database actually has.
   *
   * @returns The present table names and qualified column names.
   */
  const present = async (): Promise<{ tables: string[]; columns: string[] }> => {
    const tables = await client<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY(${[...addedTables]})`;
    const wanted = new Set(addedColumns.map((entry) => `${entry.table}.${entry.column}`));
    const columns = await client<Array<{ table_name: string; column_name: string }>>`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ANY(${[...new Set(addedColumns.map((entry) => entry.table))]})
        AND column_name = ANY(${[...new Set(addedColumns.map((entry) => entry.column))]})`;
    return {
      tables: tables.map((row) => row.table_name).sort(),
      columns: columns
        .map((row) => `${row.table_name}.${row.column_name}`)
        .filter((name) => wanted.has(name))
        .sort(),
    };
  };

  beforeAll(async () => {
    head = await readMigrationHead();
    admin = postgres(adminUrl, {
      max: 1,
      onnotice() {
        /* Expected `DROP DATABASE IF EXISTS` notices are not diagnostics. */
      },
    });
    await admin.unsafe(`DROP DATABASE IF EXISTS ${scratchName}`);
    await admin.unsafe(`CREATE DATABASE ${scratchName}`);
    const url = new URL(adminUrl);
    url.pathname = `/${scratchName}`;
    scratchUrl = url.toString();
    client = postgres(scratchUrl, {
      max: 1,
      onnotice() {
        /* Expected idempotent DDL notices are not diagnostics. */
      },
    });

    previousHeadFolder = await mkdtemp(path.join(tmpdir(), 'tau-w3-migrations-'));
    await cp(migrationsFolder, previousHeadFolder, { recursive: true });
    const journalPath = path.join(previousHeadFolder, 'meta', '_journal.json');
    const journal = JSON.parse(await readFile(journalPath, 'utf8')) as Journal;
    beforeW3 = journal.entries.findIndex((entry) => entry.tag === w3MigrationTag);
    expect(beforeW3, `${w3MigrationTag} is not in the migration journal`).toBeGreaterThan(-1);
    journal.entries = journal.entries.slice(0, beforeW3);
    await writeFile(journalPath, JSON.stringify(journal, undefined, 2));
  }, 300_000);

  afterAll(async () => {
    await client.end();
    await admin.unsafe(`DROP DATABASE IF EXISTS ${scratchName}`);
    await admin.end();
    await rm(previousHeadFolder, { recursive: true, force: true });
  }, 300_000);

  it('should leave the previous schema untouched when the migration is interrupted part-way', async () => {
    await migrate(drizzle(client), { migrationsFolder: previousHeadFolder });
    const before = await appliedCount();
    expect(before).toBe(beforeW3);
    await expect(present()).resolves.toStrictEqual({ tables: [], columns: [] });

    /* The injection: run the new migration's statements the way the migrator
       does — one transaction, split on drizzle's own breakpoints — and lose the
       process after the first one. */
    const migrationSql = await readFile(path.join(migrationsFolder, `${w3MigrationTag}.sql`), 'utf8');
    const statements = migrationSql
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);
    expect(statements.length).toBeGreaterThan(1);

    await expect(
      client.begin(async (transaction) => {
        await transaction.unsafe(statements[0] ?? '');
        throw new Error('release command killed mid-migration');
      }),
    ).rejects.toThrow('release command killed mid-migration');

    await expect(present()).resolves.toStrictEqual({ tables: [], columns: [] });
    await expect(appliedCount()).resolves.toBe(before);
  }, 300_000);

  it('should complete the migration on the next run and add every table and column once', async () => {
    await migrate(drizzle(client), { migrationsFolder });

    await expect(present()).resolves.toStrictEqual({
      tables: [...addedTables].sort(),
      columns: addedColumns.map((entry) => `${entry.table}.${entry.column}`).sort(),
    });
    await expect(appliedCount()).resolves.toBe(head.count);
  }, 300_000);

  it('should apply nothing on a restart and satisfy the bookkeeping a booting replica asserts', async () => {
    await migrate(drizzle(client), { migrationsFolder });

    await expect(appliedCount()).resolves.toBe(head.count);
    await expect(assertSchemaCompatibility(client)).resolves.toBeUndefined();
  }, 300_000);
});
