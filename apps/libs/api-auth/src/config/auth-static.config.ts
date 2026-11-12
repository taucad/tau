import type { BetterAuthOptions } from 'better-auth';
import { apiKey } from '@better-auth/api-key';
import { bearer, magicLink, oneTimeToken } from 'better-auth/plugins';
import { cliDeviceAuthorization } from '#config/cli-device-authorization.js';
import { tokenLifetimeSeconds } from '@taucad/api-email';

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
 * This config is used by both the CLI for schema generation (`auth.ts`) and the runtime config.
 *
 * This module only declares options: it creates no Better Auth instance and opens no database
 * client, so the runtime can import it without Better Auth's boot-time warnings.
 *
 * IMPORTANT: When adding/removing plugins here, you must also update the plugin
 * array in better-auth.config.ts to maintain sync. Runtime validation will throw
 * an error if the counts don't match.
 */
export const staticAuthConfig = {
  plugins: [
    apiKey(),
    magicLink({
      expiresIn: tokenLifetimeSeconds.magicLink,
      // The `verification` row holds a hash, so a database read never yields a usable sign-in link.
      storeToken: 'hashed',
      sendMagicLink() {
        // No-op for mock configuration
      },
    }),
    // Desktop sign-in handoff (ruling D7): mints a short-lived, single-use token
    // the Electron main process exchanges for a bearer session over loopback.
    // Reuses the existing `verification` table — no schema change.
    oneTimeToken({ storeToken: 'hashed' }),
    cliDeviceAuthorization('https://tau.new'),
    // `bearer()` stays LAST: its after-hook reads the `set-cookie` every earlier
    // plugin may have written and re-emits it as `set-auth-token`.
    // Only signed session tokens (`token.signature`): a session row alone never authenticates.
    bearer({ requireSignature: true }),
  ],
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    requireEmailVerification: true,
    // Shared with the email copy so the sentence and the deadline cannot drift.
    resetPasswordTokenExpiresIn: tokenLifetimeSeconds.resetPassword,
    revokeSessionsOnPasswordReset: true,
  },
  emailVerification: {
    expiresIn: tokenLifetimeSeconds.verifyEmail,
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    async sendVerificationEmail() {
      // No-op for mock configuration
    },
  },
  // Provider tokens are consumed by server-owned capability endpoints only.
  disabledPaths: ['/get-access-token', '/refresh-token'],
  basePath: '/v1/auth',
  appName: 'Tau',
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 24 hours
  },
  account: accountOptions,
  // Password-reset tokens live in the `verification` identifier; hashing it means a database read
  // never yields a working reset link. Other identifiers keep their plugins' own storage.
  verification: {
    storeIdentifier: { default: 'plain', overrides: { 'reset-password:': 'hashed' } },
  },
  rateLimit: {
    enabled: true,
    window: 10,
    max: 100,
    storage: 'memory',
    customRules: {
      '/get-session': { window: 10, max: 20 },
    },
  },
  advanced: {
    // Fly sends `X-Forwarded-For: <client>, <Fly edge>` on every request, and Better Auth trusts only a single-value
    // header, so without this every caller fell into one shared rate-limit bucket. Fly sets `Fly-Client-IP` to the
    // connecting address itself; a lone `X-Forwarded-For` still serves a self-hosted proxy.
    ipAddress: {
      ipAddressHeaders: ['fly-client-ip', 'x-forwarded-for'],
    },
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
