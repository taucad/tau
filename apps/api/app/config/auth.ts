import { betterAuth } from 'better-auth';
import type { BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { apiKey, magicLink } from 'better-auth/plugins';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

/**
 * Static Better Auth configuration.
 * Defines plugins and settings that determine the database schema.
 * This config is used by both the CLI for schema generation and the runtime config.
 *
 * IMPORTANT: When adding/removing plugins here, you must also update the plugin
 * array in better-auth.config.ts to maintain sync. Runtime validation will throw
 * an error if the counts don't match.
 */
export const staticAuthConfig = {
  plugins: [
    apiKey(),
    magicLink({
      sendMagicLink() {
        // No-op for mock configuration
      },
    }),
  ],
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    resetPasswordTokenExpiresIn: 60 * 60, // 1 hour
  },
  basePath: '/v1/auth',
  appName: 'Tau',
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 24 hours
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ['github', 'google', 'email-password'],
      allowDifferentEmails: false,
    },
  },
  rateLimit: {
    enabled: true,
    window: 10,
    max: 100,
    storage: 'memory',
  },
  advanced: {
    cookiePrefix: 'tau',
    // Only use secure cookies in production. Note: this requires SSL.
    useSecureCookies: import.meta.env.PROD,
    defaultCookieAttributes: {
      httpOnly: true,
      secure: import.meta.env.PROD, // Only secure cookies in production
      sameSite: 'lax',
    },
  },
} as const satisfies BetterAuthOptions;

/**
 * Better Auth instance for CLI schema generation.
 * Mock database connection - the CLI only needs the config structure, not a real connection.
 * @see https://www.better-auth.com/docs/concepts/cli#generate
 */
const client = postgres('');
const db = drizzle(client);

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  ...staticAuthConfig,
});
