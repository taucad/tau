import postgres from 'postgres';

/**
 * Whether the PostgreSQL a suite needs is answering.
 *
 * Suites that talk to a real database gate on this with
 * `describe.skipIf(!(await databaseReachable(url)))`. Probe the configured URL
 * rather than the presence of an environment variable: `.env.test` always
 * supplies one, so a checkout without `pnpm infra:up` has to be told apart by
 * connecting.
 *
 * @param url - The `postgresql://` URL the suite goes on to use.
 * @returns True when `SELECT 1` answers, false on any connection or auth failure.
 * @internal
 */
export const databaseReachable = async (url: string): Promise<boolean> => {
  try {
    const probe = postgres(url, {
      max: 1,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- postgres.js option name
      connect_timeout: 5,
      onnotice() {
        /* Probe only; a notice is not a diagnostic. */
      },
    });
    try {
      await probe`SELECT 1`;
      return true;
    } finally {
      await probe.end();
    }
  } catch {
    return false;
  }
};
