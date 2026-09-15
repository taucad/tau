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
import type { Environment } from '#config/environment.config.js';
import { staticAuthConfig } from '#config/auth.js';
import type { EmailService } from '#email/email.service.js';
import {
  buildFrontendMagicLinkVerifyUrl,
  buildFrontendResetPasswordUrl,
  buildFrontendVerificationUrl,
} from '#email/email-link-builder.js';

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
      async sendMagicLink({ email, url, token }) {
        await emailService.sendMagicLink({
          email,
          url: buildFrontendMagicLinkVerifyUrl({
            frontendURL: configService.get('TAU_FRONTEND_URL', { infer: true }),
            generatedUrl: url,
            token,
          }),
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
        ...(options.closure
          ? {
              beforeDelete: async (user, request) => {
                await options.closure?.prepareForAuthDeletion({ authUserId: user.id, request });
              },
            }
          : {}),
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
      async sendResetPassword({ user, token }) {
        await emailService.sendResetPassword({
          email: user.email,
          url: buildFrontendResetPasswordUrl({
            frontendURL: configService.get('TAU_FRONTEND_URL', { infer: true }),
            token,
          }),
        });
      },
      async onPasswordReset(data) {
        logger.log(`Password reset requested for ${data.user.email}`);
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
