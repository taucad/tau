import { randomUUID } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assertSchemaCompatibility,
  installApiRuntimeRole,
  readAppliedMigrations,
  readMigrationHead,
  runMigrationJob,
} from '#database/database-migration.js';

/**
 * Native evidence for the T3 runtime boundary on the disposable PostgreSQL 17 cluster.
 *
 * Every connection here is labelled with a run-unique `application_name` and the
 * schema-behind case owns a freshly created database, so nothing in this file depends on
 * the order the shared foundation suite runs its files in.
 */
const databaseUrl = process.env['BILLING_TEST_DATABASE_URL'];
if (!databaseUrl || !process.env['BILLING_TEST_OWNED']) {
  throw new Error('Use the isolated billing launcher');
}

const run = randomUUID().slice(0, 8);
const owner = postgres(databaseUrl, {
  max: 2,
  onnotice() {
    /* Expected idempotent GRANT/REVOKE notices are not diagnostics. */
  },
});

/** Opens a client under the de-privileged runtime role exactly as `DatabaseService` does. */
const openRuntimeClient = (options: {
  label: string;
  max?: number;
  /** Milliseconds. */
  statementTimeout?: number;
  /** Milliseconds. */
  lockTimeout?: number;
}): postgres.Sql =>
  postgres(databaseUrl, {
    max: options.max ?? 1,
    prepare: false,
    connection: {
      /* eslint-disable @typescript-eslint/naming-convention -- PostgreSQL startup parameter names */
      application_name: `tau-boundary-${run}-${options.label}`,
      statement_timeout: options.statementTimeout ?? 15_000,
      lock_timeout: options.lockTimeout ?? 5000,
      idle_in_transaction_session_timeout: 15_000,
      role: 'tau_api_runtime',
      /* eslint-enable @typescript-eslint/naming-convention -- PostgreSQL startup parameter names */
    },
    onnotice() {
      /* Notices are not diagnostics here. */
    },
  });

const backendCount = async (label: string): Promise<number> => {
  const [row] = await owner<Array<{ backends: number }>>`
    SELECT count(*)::int AS backends FROM pg_stat_activity
    WHERE application_name = ${`tau-boundary-${run}-${label}`}`;
  return row?.backends ?? 0;
};

beforeAll(async () => {
  await installApiRuntimeRole(owner);
});

afterAll(async () => {
  await owner.end();
});

describe('database runtime boundary', () => {
  it('should queue work beyond the pool ceiling instead of opening extra backends', async () => {
    const client = openRuntimeClient({ max: 2, label: 'pool' });
    try {
      // `.execute()` starts each query now; postgres.js otherwise defers until the promise is awaited.
      const queries = Array.from({ length: 6 }, () => client`SELECT pg_sleep(0.4)`.execute());
      await wait(300);
      const opened = await backendCount('pool');
      await wait(300);
      const stillOpen = await backendCount('pool');
      await Promise.all(queries);

      // Six concurrent queries against a ceiling of two: the extra four queue on the client.
      expect(opened).toBe(2);
      expect(stillOpen).toBe(2);
    } finally {
      await client.end();
    }
  });

  it('should apply the configured statement, lock and idle-in-transaction deadlines to every connection', async () => {
    const client = openRuntimeClient({ statementTimeout: 250, lockTimeout: 150, label: 'deadlines' });
    try {
      const [settings] = await client<Array<{ statement: string; lock: string; idle: string }>>`
        SELECT current_setting('statement_timeout') AS statement, current_setting('lock_timeout') AS lock,
          current_setting('idle_in_transaction_session_timeout') AS idle`;

      expect(settings).toEqual({ statement: '250ms', lock: '150ms', idle: '15s' });

      // 57014 = query_canceled; the deadline is enforced by PostgreSQL, not by client code.
      await expect(client`SELECT pg_sleep(5)`).rejects.toMatchObject({ code: '57014' });
    } finally {
      await client.end();
    }
  });

  it('should abandon a statement that waits longer than the lock deadline', async () => {
    const client = openRuntimeClient({ statementTimeout: 10_000, lockTimeout: 150, label: 'lock' });
    let release = (): void => {
      /* Replaced once the blocking transaction holds its lock. */
    };
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const blocker = owner.begin(async (transaction) => {
      await transaction`LOCK TABLE billing.credit_transaction IN ACCESS EXCLUSIVE MODE`;
      await held;
    });
    try {
      // 55P03 = lock_not_available.
      await expect(client`SELECT count(*) FROM billing.credit_transaction`).rejects.toMatchObject({ code: '55P03' });
    } finally {
      release();
      await blocker;
      await client.end();
    }
  });

  it('should refuse DDL, immutable-evidence mutation and financial deletion to the runtime role', async () => {
    const client = openRuntimeClient({ label: 'privileges' });
    try {
      const [identity] = await client<Array<{ current: string; session: string }>>`
        SELECT current_user AS current, session_user AS session`;

      expect(identity?.current).toBe('tau_api_runtime');
      expect(identity?.session).not.toBe('tau_api_runtime');

      // 42501 = insufficient_privilege. The grants in billing-protections.ts make each exact.
      await expect(client`CREATE TABLE public.runtime_boundary_probe (id integer)`).rejects.toMatchObject({
        code: '42501',
      });
      await expect(client`CREATE TABLE billing.runtime_boundary_probe (id integer)`).rejects.toMatchObject({
        code: '42501',
      });
      await expect(
        client`UPDATE billing.credit_transaction SET balance_after_atoms = 0 WHERE false`,
      ).rejects.toMatchObject({ code: '42501' });
      await expect(client`DELETE FROM billing.credit_transaction WHERE false`).rejects.toMatchObject({ code: '42501' });
      await expect(client`DELETE FROM billing.credit_account WHERE false`).rejects.toMatchObject({ code: '42501' });

      // `RESET ROLE` returns to the startup value, not to the login identity.
      await client`RESET ROLE`;
      const [afterReset] = await client<Array<{ current: string }>>`SELECT current_user AS current`;

      expect(afterReset?.current).toBe('tau_api_runtime');

      // The role is still usable: reads the runtime needs remain granted.
      const [readable] = await client<Array<{ rows: number }>>`
        SELECT count(*)::int AS rows FROM billing.credit_transaction`;

      expect(readable?.rows).toBeGreaterThanOrEqual(0);
    } finally {
      await client.end();
    }
  });

  it('should keep billing objects unreachable from any Data-API-shaped role present on the cluster', async () => {
    const exposed = await owner<Array<{ rolname: string }>>`
      SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')`;

    if (exposed.length === 0) {
      // Recorded fact, not a skipped assertion: billing-protections.ts declares no Data-API role,
      // so this cluster has none. On an adopted Supabase database the loop below runs for real.
      expect(exposed.map((role) => role.rolname)).toEqual([]);
      return;
    }
    for (const { rolname } of exposed) {
      // oxlint-disable-next-line no-await-in-loop -- one cheap privilege probe per discovered role
      const [privileges] = await owner<Array<{ schema: boolean; tables: number }>>`
        SELECT has_schema_privilege(${rolname}, 'billing', 'USAGE') AS schema,
          count(*) FILTER (WHERE has_table_privilege(${rolname}, c.oid, 'SELECT'))::int AS tables
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'billing' AND c.relkind = 'r'`;

      expect(privileges).toEqual({ schema: false, tables: 0 });
    }
  });

  it('should reject a schema-behind database and bring it current exactly once', async () => {
    const name = `boundary_migration_${run}`;
    await owner.unsafe(`CREATE DATABASE "${name}"`);
    const target = new URL(databaseUrl);
    target.pathname = `/${name}`;
    const scratch = postgres(target.toString(), {
      max: 1,
      onnotice() {
        /* Expected fixture DDL notices are not diagnostics. */
      },
    });
    try {
      const head = await readMigrationHead();

      await expect(assertSchemaCompatibility(scratch)).rejects.toThrow(/schema is behind this build/u);

      const first = await runMigrationJob(target.toString());

      expect(first.applied).toBe(head.count);
      await expect(assertSchemaCompatibility(scratch)).resolves.toBeUndefined();

      const second = await runMigrationJob(target.toString());
      const applied = await readAppliedMigrations(scratch);

      expect(second.applied).toBe(0);
      expect(applied).toEqual({ count: head.count, when: head.when });

      // An image generated against a newer journal must refuse the same database.
      await scratch`INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
        VALUES (${'boundary-ahead'}, ${head.when + 1})`;

      await expect(assertSchemaCompatibility(scratch)).rejects.toThrow(/schema is ahead of this build/u);
    } finally {
      await scratch.end();
      await owner.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    }
  }, 120_000);
});
