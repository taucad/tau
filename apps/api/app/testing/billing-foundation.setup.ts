import { resolve } from 'node:path';
import postgres from 'postgres';
import { installBillingProtections } from '#database/billing-protections.js';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

export default async function setup(): Promise<void> {
  const url = process.env['BILLING_TEST_DATABASE_URL'];
  const ownership = process.env['BILLING_TEST_OWNED'];
  const dataDirectory = process.env['BILLING_TEST_DATA_DIRECTORY'];
  if (!url || !ownership?.startsWith('tau-billing-')) {
    throw new Error('Use the test-owned billing launcher');
  }
  const parsed = new URL(url);
  if (parsed.hostname !== '127.0.0.1' || parsed.pathname !== '/billing_test' || parsed.username !== 'billing_test') {
    throw new Error('Refusing a database outside the isolated billing fixture');
  }
  const client = postgres(url, {
    max: 1,
    onnotice() {
      /* Expected fixture DDL notices are not diagnostics. */
    },
  });
  try {
    const target =
      await client`SELECT current_database() AS database, current_user AS owner, inet_server_addr()::text AS address,
        current_setting('data_directory') AS data_directory, current_setting('cluster_name') AS cluster_name,
        current_setting('server_version_num') AS version`;
    if (
      target[0]?.['database'] !== 'billing_test' ||
      target[0]['owner'] !== 'billing_test' ||
      !String(target[0]['version']).startsWith('17') ||
      (dataDirectory &&
        (target[0]['data_directory'] !== dataDirectory ||
          target[0]['cluster_name'] !== ownership ||
          (target[0]['address'] !== '127.0.0.1/32' && target[0]['address'] !== '127.0.0.1')))
    ) {
      throw new Error('Fixture target proof failed');
    }
    console.log('Verified test-owned PostgreSQL target billing_test; applying migrations');
    await migrate(drizzle(client), { migrationsFolder: resolve(import.meta.dirname, '../database/migrations') });
    await installBillingProtections(client);
  } finally {
    await client.end();
  }
}
