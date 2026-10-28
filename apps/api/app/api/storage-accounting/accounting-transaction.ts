import { sql } from 'drizzle-orm';
import type { DatabaseType } from '#database/database.service.js';

export type AccountingTransaction = Parameters<Parameters<DatabaseType['transaction']>[0]>[0];

/**
 * Runs an accounting task's reads in one read-only transaction whose statements PostgreSQL cancels after
 * `milliseconds` (`SET LOCAL`, so the pooled connection keeps the API's own timeout afterwards).
 *
 * @param database - The Drizzle database.
 * @param milliseconds - The statement timeout for this transaction only.
 * @param body - The reads.
 * @returns What `body` returns.
 */
export const withAccountingTimeout = async <Result>(
  database: Pick<DatabaseType, 'transaction'>,
  milliseconds: number,
  body: (transaction: AccountingTransaction) => Promise<Result>,
): Promise<Result> =>
  database.transaction(
    async (transaction) => {
      await transaction.execute(sql.raw(`set local statement_timeout = ${String(Math.trunc(milliseconds))}`));
      return body(transaction);
    },
    { accessMode: 'read only' },
  );
