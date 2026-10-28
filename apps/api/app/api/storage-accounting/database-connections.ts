import { TauMetrics } from '@taucad/telemetry';
import { sql } from 'drizzle-orm';
import type { DatabaseType } from '#database/database.service.js';
import { databaseApplicationNames } from '#database/application-name.js';
import type { AccountingFigures, AccountingObservation } from '#api/storage-accounting/accounting-figures.js';

/**
 * PostgreSQL connections by Tau process and state, and the budget they share (W14 OB3, N48–N49): the
 * write path's stage 2 → 3 signal. One `pg_stat_activity` read per minute.
 *
 * A role without `pg_read_all_stats` sees other roles' sessions with no state, which reads as `other`;
 * the count per application stays exact.
 */

type ConnectionAttributes = AccountingObservation<'databaseConnections'>['attributes'];
type Application = ConnectionAttributes['tau.db.application'];
type State = ConnectionAttributes['state'];

const applications = TauMetrics.databaseConnections.attributes.shape['tau.db.application']
  .options as readonly Application[];
const states = TauMetrics.databaseConnections.attributes.shape.state.options as readonly State[];

const applicationByName = new Map<string, Application>(
  Object.entries(databaseApplicationNames).map(([application, name]) => [name, application as Application]),
);

const stateOf = (state: string): State =>
  state === 'active' || state === 'idle'
    ? state
    : state === 'idle in transaction' || state === 'idle in transaction (aborted)'
      ? 'idle_in_transaction'
      : 'other';

/** One `pg_stat_activity` group. */
export type ConnectionRow = {
  readonly applicationName: string;
  /** Empty for a session this role may not inspect. */
  readonly state: string;
  readonly connections: number;
};

/**
 * Maps the grouped sessions to the two gauges, every application and state present.
 *
 * @param rows - Client backends grouped by `application_name` and `state`.
 * @param budget - The connections the server admits to non-superusers.
 * @returns The connection gauges' figures.
 */
export const databaseConnectionFigures = (rows: readonly ConnectionRow[], budget: number): AccountingFigures => {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const key = `${applicationByName.get(row.applicationName) ?? 'other'}/${stateOf(row.state)}`;
    totals.set(key, (totals.get(key) ?? 0) + row.connections);
  }
  return {
    databaseConnections: applications.flatMap((application) =>
      states.map((state) => ({
        value: totals.get(`${application}/${state}`) ?? 0,
        attributes: { 'tau.db.application': application, state },
      })),
    ),
    databaseConnectionBudget: [{ value: budget, attributes: {} }],
  };
};

/**
 * Reads this database's client sessions and its connection budget: `max_connections` less the
 * superuser reserve and, from PostgreSQL 16, `reserved_connections`.
 *
 * @param database - The Drizzle database.
 * @returns The connection gauges' figures.
 */
export const readDatabaseConnections = async (database: DatabaseType): Promise<AccountingFigures> => {
  const [rows, budgetRows] = await Promise.all([
    database.execute<{
      application_name: string;
      state: string;
      connections: number;
    }>(sql`
      select coalesce(application_name, '') as application_name, coalesce(state, '') as state, count(*)::int as connections
      from pg_stat_activity
      where datname = current_database() and backend_type = 'client backend'
      group by 1, 2`),
    database.execute<{ budget: number }>(sql`
      select (current_setting('max_connections')::int
        - current_setting('superuser_reserved_connections')::int
        - coalesce(nullif(current_setting('reserved_connections', true), '')::int, 0)) as budget`),
  ]);
  return databaseConnectionFigures(
    [...rows].map((row) => ({
      applicationName: row.application_name,
      state: row.state,
      connections: Number(row.connections),
    })),
    Number([...budgetRows][0]?.budget ?? 0),
  );
};
