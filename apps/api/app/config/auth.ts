import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { staticAuthConfig } from '#config/auth-static.config.js';

/**
 * Better Auth instance for CLI schema generation (`nx run api:auth-schema-generate`).
 *
 * Creating it logs Better Auth's warnings for the missing secret and base URL, so only the
 * CLI may import this module. The runtime and tests import `#config/auth-static.config.js`.
 * Mock database connection - the CLI only needs the config structure, not a real connection.
 * @see https://www.better-auth.com/docs/concepts/cli#generate
 */
const client = postgres('');
const db = drizzle(client);

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  ...staticAuthConfig,
});

/** Kept for integration tests that still import it from here; the runtime must not (see the module note). */
export { staticAuthConfig };
