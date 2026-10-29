/* eslint-disable @typescript-eslint/naming-convention -- pg_stat_activity column names, as PostgreSQL returns them */
import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { DatabaseType } from '#database/database.service.js';
import {
  connectionsQuery,
  databaseConnectionFigures,
  readDatabaseConnections,
} from '#api/storage-accounting/database-connections.js';

describe('databaseConnectionFigures (W14 OB3, N48–N49)', () => {
  const figures = databaseConnectionFigures(
    [
      { applicationName: 'tau-api', state: 'active', connections: 3 },
      { applicationName: 'tau-api', state: 'idle', connections: 7 },
      {
        applicationName: 'tau-mirror',
        state: 'idle in transaction',
        connections: 1,
      },
      {
        applicationName: 'tau-mirror',
        state: 'idle in transaction (aborted)',
        connections: 1,
      },
      { applicationName: 'psql', state: 'active', connections: 2 },
      { applicationName: '', state: '', connections: 4 },
      {
        applicationName: 'tau-boundary-run-1',
        state: 'fastpath function call',
        connections: 1,
      },
    ],
    97,
  );
  const value = (application: string, state: string): number | undefined =>
    figures.databaseConnections?.find(
      (observation) =>
        observation.attributes['tau.db.application'] === application && observation.attributes.state === state,
    )?.value;

  it('should map each application_name Tau sets to its process, and any other to `other`', () => {
    expect(value('api', 'active')).toBe(3);
    expect(value('api', 'idle')).toBe(7);
    expect(value('other', 'active')).toBe(2);
    expect(JSON.stringify(figures)).not.toContain('psql');
    expect(JSON.stringify(figures)).not.toContain('tau-boundary');
  });

  it('should fold both idle-in-transaction states together and an unseen state into `other`', () => {
    expect(value('mirror', 'idle_in_transaction')).toBe(2);
    expect(value('other', 'other')).toBe(5);
  });

  it('should export every application and state, zero when absent', () => {
    expect(figures.databaseConnections).toHaveLength(24);
    expect(value('release', 'active')).toBe(0);
  });

  it('should export the connection budget as one series', () => {
    expect(figures.databaseConnectionBudget).toStrictEqual([{ value: 97, attributes: {} }]);
  });
});

/* The API's runtime role has no `pg_read_all_stats`: other roles' sessions come back with NULLs. */
describe('readDatabaseConnections without pg_read_all_stats (W14 OB3)', () => {
  it('should keep sessions whose backend_type PostgreSQL hides', () => {
    const { sql } = new PgDialect().sqlToQuery(connectionsQuery);
    expect(sql).toContain("(backend_type = 'client backend' or backend_type is null)");
  });

  it('should count NULL-state rows of other roles as `other`, under a statement timeout', async () => {
    const statements: string[] = [];
    const execute = vi.fn(async (query: Parameters<PgDialect['sqlToQuery']>[0]) => {
      const { sql } = new PgDialect().sqlToQuery(query);
      statements.push(sql);
      if (sql.includes('pg_stat_activity')) {
        return [
          { application_name: 'tau-api', state: 'active', connections: 2 },
          { application_name: null, state: null, connections: 5 },
          { application_name: 'tau-billing-operations', state: null, connections: 1 },
        ];
      }
      return sql.includes('max_connections') ? [{ budget: 97 }] : [];
    });
    const database = {
      transaction: async (body: (transaction: unknown) => Promise<unknown>) => body({ execute }),
    } as unknown as DatabaseType;

    const figures = await readDatabaseConnections(database);
    const value = (application: string, state: string): number | undefined =>
      figures.databaseConnections?.find(
        (observation) =>
          observation.attributes['tau.db.application'] === application && observation.attributes.state === state,
      )?.value;

    expect(statements[0]).toMatch(/^set local statement_timeout = \d+$/u);
    expect(value('api', 'active')).toBe(2);
    expect(value('other', 'other')).toBe(5);
    expect(value('billing-operations', 'other')).toBe(1);
    expect(figures.databaseConnectionBudget).toStrictEqual([{ value: 97, attributes: {} }]);
  });
});
