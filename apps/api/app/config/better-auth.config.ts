import type { BillingAccountClosureService } from '#api/billing/billing-account-closure.service.js';
import type { BetterAuthOptions, LogLevel as BetterAuthLogLevel, ModelNames } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { apiKey } from '@better-auth/api-key';
import { bearer, magicLink, oneTimeToken } from 'better-auth/plugins';
import type { ConfigService } from '@nestjs/config';
import type { LogLevel } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import type { IdPrefix } from '@taucad/types';
import { idPrefix } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import type { DatabaseService } from '#database/database.service.js';
import { storageTombstone } from '#database/schema.js';
import type { Environment } from '#config/environment.config.js';
import { staticAuthConfig } from '#config/auth.js';
import type { EmailService } from '#email/email.service.js';
import {
  buildFrontendForgotPasswordUrl,
  buildFrontendMagicLinkVerifyUrl,
  buildFrontendResetPasswordUrl,
  buildFrontendVerificationUrl,
} from '#email/email-link-builder.js';
import { deviceFromRequest, tokenLifetimeSeconds } from '#email/email-copy.js';

/** D10: thirty days between a deletion and the purge that may follow it. Milliseconds. */
const storageTombstoneGrace = 30 * 24 * 60 * 60 * 1000;

// The recipient's timezone is not knowable from the reset request, so the row states UTC explicitly
// rather than implying a local time the reader would have to second-guess.
const formatChangedAt = (at: Date): string =>
  `${new Intl.DateTimeFormat('en-NZ', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(at)} UTC`;

/**
 * Mapping between BetterAuth models and ID prefixes.
 */
const prefixFromModel: Record<Exclude<ModelNames, ''>, IdPrefix> = {
  account: idPrefix.account,
  organization: idPrefix.organization,
  user: idPrefix.user,
  session: idPrefix.session,
  verification: idPrefix.verification,
  'rate-limit': idPrefix.rateLimit,
  'two-factor': idPrefix.twoFactor,
  member: idPrefix.member,
  invitation: idPrefix.invitation,
  jwks: idPrefix.jwks,
  passkey: idPrefix.passkey,
  apikey: idPrefix.secretKey,
};

/**
 * Mapping between BetterAuth log levels and NestJS log levels.
 */
const loggerFromLogLevel = {
  error: 'error',
  warn: 'warn',
  info: 'log',
  debug: 'debug',
  success: 'log',
} as const satisfies Record<BetterAuthLogLevel, LogLevel>;

type BetterAuthConfigOptions = {
  databaseService: DatabaseService;
  configService: ConfigService<Environment, true>;
  emailService: EmailService;
  closure?: Pick<BillingAccountClosureService, 'prepareForAuthDeletion'> | undefined;
};

/**
 * This config specifies the runtime configuration for BetterAuth.
 * It extends the static configuration with runtime-specific options
 * using NestJS dependency injection.
 */
export function getBetterAuthConfig(options: BetterAuthConfigOptions): BetterAuthOptions {
  const logger = new Logger('BetterAuth');
  const { databaseService, configService, emailService } = options;
  const baseURL = configService.get('AUTH_URL', { infer: true });
  const secureCookies = new URL(baseURL).protocol === 'https:';

  /**
   * Runtime plugin configuration with custom options.
   * IMPORTANT: This array must have the same number of plugins as staticAuthConfig.plugins
   * in auth.ts. Add/remove plugins in both places to maintain sync.
   */
  const runtimePlugins = [
    apiKey({
      requireName: true,
      customKeyGenerator() {
        return generatePrefixedId(idPrefix.secretKey);
      },
    }),
    magicLink({
      expiresIn: tokenLifetimeSeconds.magicLink,
      // `context` is optional on this callback, so the device row is best-effort and omits itself.
      async sendMagicLink({ email, url, token }, context) {
        await emailService.sendMagicLink({
          email,
          url: buildFrontendMagicLinkVerifyUrl({
            frontendURL: configService.get('TAU_FRONTEND_URL', { infer: true }),
            generatedUrl: url,
            token,
          }),
          device: deviceFromRequest(context?.request),
        });
      },
    }),
    // Desktop sign-in handoff (ruling D7) — must mirror auth.ts at this index.
    oneTimeToken({ storeToken: 'hashed' }),
    // `bearer()` stays LAST (see auth.ts).
    bearer(),
  ];

  // Validation: Ensure plugin arrays are in sync
  if (staticAuthConfig.plugins.length !== runtimePlugins.length) {
    throw new Error(
      `Plugin configuration mismatch! ` +
        `auth.ts has ${staticAuthConfig.plugins.length} plugin(s), ` +
        `but runtime config has ${runtimePlugins.length} plugin(s). ` +
        `Please ensure both files declare the same plugins.`,
    );
  }

  return {
    // Spread static configuration
    ...staticAuthConfig,

    user: {
      deleteUser: {
        enabled: true,
        /**
         * D10: one storage lifecycle, and it starts here.
         *
         * Deleting the account cascades away every row that references it —
         * projects, `project_git`, LFS reservations — but nothing in that
         * cascade touches a byte in the object store, and afterwards nobody can
         * say which prefixes were the account's. So the tombstone is written
         * inside the same hook, and carries no foreign key, so the cascade that
         * follows cannot take it with the rows. W6's purge job is its only
         * reader, and `purge_after` is when it may act: thirty days out for an
         * ordinary deletion, and moved to now when an erasure request is
         * verified.
         *
         * **After the closure, not before it.** `prepareForAuthDeletion` can
         * refuse the deletion outright, and the tombstone is idempotent by
         * `owner_id` — so a row written before a refusal would still be there
         * when the account was really deleted weeks later, and
         * `onConflictDoNothing` would keep the abandoned attempt's `purge_after`
         * rather than starting the window again. The closure deletes no bytes
         * of its own, so writing first bought nothing to pay for that.
         */
        beforeDelete: async (user, request) => {
          await options.closure?.prepareForAuthDeletion({ authUserId: user.id, request });
          await databaseService.database
            .insert(storageTombstone)
            .values({ ownerId: user.id, purgeAfter: new Date(Date.now() + storageTombstoneGrace) })
            .onConflictDoNothing();
        },
      },
    },

    // Override with runtime-configured plugins
    plugins: runtimePlugins,

    // Runtime-specific configuration
    database: drizzleAdapter(databaseService.database, {
      provider: 'pg',
    }),

    logger: {
      // Configured to use NestJS logger
      log(level, message, ...args: unknown[]) {
        logger[loggerFromLogLevel[level]](message, ...args);
      },
    },

    secret: configService.get('AUTH_SECRET', { infer: true }),
    baseURL,
    trustedOrigins: [configService.get('TAU_FRONTEND_URL', { infer: true })],

    emailAndPassword: {
      ...staticAuthConfig.emailAndPassword,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      async sendResetPassword({ user, token }, request) {
        await emailService.sendResetPassword({
          email: user.email,
          url: buildFrontendResetPasswordUrl({
            frontendURL: configService.get('TAU_FRONTEND_URL', { infer: true }),
            token,
          }),
          device: deviceFromRequest(request),
        });
      },
      // Fires immediately before `revokeSessionsOnPasswordReset` drops the other sessions, so the
      // email and the revocation describe the same moment.
      async onPasswordReset({ user }, request) {
        logger.log(`Password reset completed for ${user.email}`);
        await emailService.sendPasswordChanged({
          email: user.email,
          changedAt: formatChangedAt(new Date()),
          url: buildFrontendForgotPasswordUrl({
            frontendURL: configService.get('TAU_FRONTEND_URL', { infer: true }),
          }),
          device: deviceFromRequest(request),
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      async sendVerificationEmail({ user, url, token }) {
        await emailService.sendVerification({
          email: user.email,
          url: buildFrontendVerificationUrl({
            frontendURL: configService.get('TAU_FRONTEND_URL', { infer: true }),
            generatedUrl: url,
            token,
          }),
        });
      },
      async afterEmailVerification(user) {
        logger.log(`User ${user.email} has been verified`);
      },
    },

    socialProviders: {
      github: {
        clientId: configService.get('GITHUB_CLIENT_ID', { infer: true }),
        clientSecret: configService.get('GITHUB_CLIENT_SECRET', {
          infer: true,
        }),
        // Default scopes for initial sign-in (basic profile info)
        scope: ['read:user', 'user:email'],
      },
      google: {
        clientId: configService.get('GOOGLE_CLIENT_ID', { infer: true }),
        clientSecret: configService.get('GOOGLE_CLIENT_SECRET', {
          infer: true,
        }),
      },
    },

    // Advanced configuration
    advanced: {
      ...staticAuthConfig.advanced,
      useSecureCookies: secureCookies,
      defaultCookieAttributes: {
        ...staticAuthConfig.advanced.defaultCookieAttributes,
        secure: secureCookies,
      },
      crossSubDomainCookies: {
        enabled: true,
        domain: undefined, // Will be set based on request
      },
      database: {
        generateId(options) {
          const prefix = prefixFromModel[options.model];

          if (!prefix) {
            throw new Error(`Model ID not supported: ${options.model}`);
          }

          return generatePrefixedId(prefix);
        },
      },
    },

    // eslint-disable-next-line @typescript-eslint/naming-convention -- onAPIError is a valid option
    onAPIError: {
      throw: false,
      onError(error, _context) {
        logger.error(`Auth error: ${JSON.stringify(error)}.`);
      },
    },
  };
}
