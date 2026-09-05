import { betterAuth } from 'better-auth';
import type { BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { apiKey } from '@better-auth/api-key';
import { stripe } from '@better-auth/stripe';
import { bearer, magicLink, oneTimeToken } from 'better-auth/plugins';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import Stripe from 'stripe';

const accountOptions: NonNullable<BetterAuthOptions['account']> = {
  accountLinking: {
    enabled: true,
    trustedProviders: ['github', 'google', 'email-password'],
    allowDifferentEmails: false,
  },
};
accountOptions.encryptOAuthTokens = true;

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
    stripe({
      // CLI only needs the config structure for schema generation — never called.
      stripeClient: new Stripe('sk_test_dummy_for_cli'),
      stripeWebhookSecret: 'whsec_dummy_for_cli',
      // Customers are created lazily at first billing action (checkout/top-up), so
      // signup never depends on Stripe availability and dev works without keys.
      createCustomerOnSignUp: false,
      subscription: {
        enabled: true,
        plans: [
          { name: 'pro', priceId: 'price_dummy_for_cli', limits: {} },
          // Enterprise archetype (AD18/E4): per-customer prices are attached
          // manually in the Stripe dashboard; limits come from subscription_extension.
          {
            name: 'enterprise',
            priceId: 'price_enterprise_manual',
            limits: {},
          },
        ],
      },
    }),
    // Desktop sign-in handoff (ruling D7): mints a short-lived, single-use token
    // the Electron main process exchanges for a bearer session over loopback.
    // Reuses the existing `verification` table — no schema change.
    oneTimeToken({ storeToken: 'hashed' }),
    // `bearer()` stays LAST: its after-hook reads the `set-cookie` every earlier
    // plugin may have written and re-emits it as `set-auth-token`.
    bearer(),
  ],
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    requireEmailVerification: true,
    resetPasswordTokenExpiresIn: 60 * 60, // 1 hour
    revokeSessionsOnPasswordReset: true,
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    async sendVerificationEmail() {
      // No-op for mock configuration
    },
  },
  basePath: '/v1/auth',
  appName: 'Tau',
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 24 hours
  },
  account: accountOptions,
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
