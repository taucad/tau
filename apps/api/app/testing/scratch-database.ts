import path from 'node:path';
import process from 'node:process';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

/**
 * A disposable, migrated database for a suite that runs an unscoped job.
 *
 * Most suites here are safe on a shared database because every row they touch
 * is bound to an id they generated. A job that selects by *state* rather than
 * by identity cannot be scoped that way — the zero-count blob collector takes
 * every `refcount = 0` row there is — so the only honest boundary is the
 * database itself. `app/testing/git-storage-migration.integration.test.ts`
 * already owns one this way; this is that pattern, shared.
 *
 * The configured `DATABASE_URL` is the admin connection the scratch database is
 * created from and beside, never the one the suite runs against.
 */

const migrationsFolder = path.resolve(import.meta.dirname, '../database/migrations');
/** Postgres identifiers are interpolated into DDL, so they are checked rather than escaped. */
const identifier = /^[a-z][a-z0-9_]*$/u;

/** A scratch database, and the disposer that removes it. */
export type ScratchDatabase = {
  /** The connection URL of the scratch database. */
  readonly url: string;
  /** Drops it. Safe to call when creation partly failed. */
  readonly drop: () => Promise<void>;
};

/**
 * Create a migrated scratch database beside the configured one.
 *
 * Named per process id, so two suites — or two checkouts — never share one, and
 * dropped first in case a killed run left it behind.
 *
 * @param label - A short identifier naming the owning suite.
 * @returns Its URL and a disposer for `afterAll`.
 * @throws When `DATABASE_URL` is absent or the derived name is not an identifier.
 */
export const createScratchDatabase = async (label: string): Promise<ScratchDatabase> => {
  const adminUrl = process.env.DATABASE_URL;
  if (!adminUrl) {
    throw new Error('A scratch database needs DATABASE_URL to name the server it is created on.');
  }
  const name = `tau_scratch_${label}_${String(process.pid)}`;
  if (!identifier.test(name)) {
    throw new Error(`Scratch database label "${label}" is not a PostgreSQL identifier.`);
  }
  const admin = postgres(adminUrl, {
    max: 1,
    onnotice() {
      /* An expected `DROP DATABASE IF EXISTS` notice is not a diagnostic. */
    },
  });
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const scratchUrl = url.toString();
  const drop = async (): Promise<void> => {
    const disposer = postgres(adminUrl, {
      max: 1,
      onnotice() {
        /* As above. */
      },
    });
    try {
      await disposer.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    } finally {
      await disposer.end();
    }
  };
  try {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.unsafe(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }
  const client = postgres(scratchUrl, {
    max: 1,
    onnotice() {
      /* Idempotent DDL notices are not diagnostics. */
    },
  });
  try {
    await migrate(drizzle(client), { migrationsFolder });
  } catch (error) {
    await drop();
    throw error;
  } finally {
    await client.end();
  }
  return { url: scratchUrl, drop };
};
