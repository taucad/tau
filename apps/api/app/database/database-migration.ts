import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { installBillingProtections } from '#database/billing-protections.js';

/** Drizzle's generated journal; `when` is the millisecond stamp the migrator stores as `created_at`. */
type MigrationJournal = { entries: Array<{ readonly tag: string; readonly when: number }> };

/** Schema head the running build was generated against. */
export type MigrationHead = { readonly count: number; readonly when: number; readonly tag: string };

/** Applied-migration marker read from the migrator's own bookkeeping table. */
export type AppliedMigrations = { readonly count: number; readonly when: number };

/**
 * Migrations ship beside the entry bundle (`viteStaticCopy` flattens them to `dist/migrations`),
 * so the folder resolves identically from source and from the built API/billing images.
 */
const migrationsFolder = path.join(import.meta.dirname, 'migrations');

/** Reads the schema head this build expects from the generated Drizzle journal. */
export async function readMigrationHead(): Promise<MigrationHead> {
  const journal = JSON.parse(
    await readFile(path.join(migrationsFolder, 'meta', '_journal.json'), 'utf8'),
  ) as MigrationJournal;
  const last = journal.entries.at(-1);
  if (!last) {
    throw new Error('Migration journal is empty');
  }
  return { count: journal.entries.length, when: last.when, tag: last.tag };
}

/** Reads the migrator's applied-migration marker; an absent bookkeeping table means nothing is applied. */
export async function readAppliedMigrations(client: postgres.Sql): Promise<AppliedMigrations> {
  const [marker] = await client<Array<{ present: boolean }>>`
    SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS present`;
  if (!marker?.present) {
    return { count: 0, when: 0 };
  }
  const [row] = await client<Array<{ applied_count: number; applied_at: string }>>`
    SELECT count(*)::int AS applied_count, coalesce(max(created_at), 0)::text AS applied_at
    FROM drizzle.__drizzle_migrations`;
  return { count: row?.applied_count ?? 0, when: Number(row?.applied_at ?? 0) };
}

/**
 * Fails closed when the database schema does not match the build's journal head.
 *
 * Ordinary API replicas must never run DDL (B7 R8): a replica whose image is older
 * or newer than the deployed schema refuses readiness instead of migrating or writing
 * against a schema it was not generated for.
 */
export async function assertSchemaCompatibility(client: postgres.Sql): Promise<void> {
  const expected = await readMigrationHead();
  const applied = await readAppliedMigrations(client);
  const state =
    applied.count < expected.count || applied.when < expected.when
      ? 'behind'
      : applied.count > expected.count || applied.when > expected.when
        ? 'ahead'
        : 'current';
  if (state !== 'current') {
    throw new Error(
      `Database schema is ${state === 'behind' ? 'behind' : 'ahead of'} this build: ` +
        `applied ${applied.count} migration(s) at ${applied.when}, ` +
        `build expects ${expected.count} through ${expected.tag} at ${expected.when}. ` +
        'Run the protected migration job before deploying this image.',
    );
  }
}

/**
 * Installs the de-privileged role every API request connection runs as.
 *
 * `tau_api_runtime` owns nothing and is granted `tau_billing_runtime`, so the request
 * path inherits exactly the column-scoped billing grants installed by
 * `installBillingProtections` and can never exceed them. The two protected `public`
 * tables are revoked so they too reach the runtime only through those grants.
 */
export async function installApiRuntimeRole(client: postgres.Sql): Promise<void> {
  await client.begin(async (transaction) => {
    await transaction`DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tau_billing_runtime') THEN CREATE ROLE tau_billing_runtime NOLOGIN; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tau_api_runtime') THEN CREATE ROLE tau_api_runtime NOLOGIN; END IF;
    END $$`;
    await transaction`GRANT tau_billing_runtime TO tau_api_runtime`;
    // PostgreSQL 15+ already withholds this; stating it keeps an adopted older database fail-closed.
    await transaction`REVOKE CREATE ON SCHEMA public FROM PUBLIC`;
    await transaction`GRANT USAGE ON SCHEMA public TO tau_api_runtime`;
    await transaction`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tau_api_runtime`;
    await transaction`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tau_api_runtime`;
    await transaction`REVOKE ALL ON public.subscription, public.subscription_extension FROM tau_api_runtime`;
    // Every replica proves schema compatibility at boot by reading the migrator's bookkeeping table.
    await transaction`GRANT USAGE ON SCHEMA drizzle TO tau_api_runtime`;
    await transaction`GRANT SELECT ON drizzle.__drizzle_migrations TO tau_api_runtime`;
  });
}

/**
 * Protected one-shot migration job: the only identity permitted to run DDL.
 *
 * Runs on its own `max: 1` connection under the migration identity, then reinstalls the
 * billing protections and refreshes the runtime role grants (`GRANT … ON ALL TABLES` is a
 * snapshot and the trigger list is explicit, so new tables need both after every migration)
 * and proves the result matches the build's journal head. This is the release command, so a
 * fresh database is never left without its financial triggers or runtime roles.
 * Re-running it applies nothing: the migrator's own bookkeeping table is the fence.
 */
export async function runMigrationJob(databaseUrl: string): Promise<{ applied: number; head: MigrationHead }> {
  const client = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    onnotice() {
      /* Expected idempotent GRANT/REVOKE notices are not diagnostics. */
    },
  });
  try {
    const before = await readAppliedMigrations(client);
    await migrate(drizzle(client), { migrationsFolder });
    await installBillingProtections(client);
    await installApiRuntimeRole(client);
    await assertSchemaCompatibility(client);
    const after = await readAppliedMigrations(client);
    return { applied: after.count - before.count, head: await readMigrationHead() };
  } finally {
    await client.end();
  }
}
