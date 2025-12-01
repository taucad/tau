import type { BetterAuthOptions, Models, LogLevel as BetterAuthLogLevel } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { apiKey, magicLink } from 'better-auth/plugins';
import type { ConfigService } from '@nestjs/config';
import type { LogLevel } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import type { IdPrefix } from '@taucad/types';
import { idPrefix } from '@taucad/types/constants';
import type { DatabaseService } from '#database/database.service.js';
import type { AuthService } from '#auth/auth.service.js';
import type { Environment } from '#config/environment.config.js';
import { generatePrefixedId } from '@taucad/utils/id';
import { staticAuthConfig } from '#config/auth.js';

/**
 * Mapping between BetterAuth models and ID prefixes.
 */
const prefixFromModel: Record<Models, IdPrefix> = {
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
  // @ts-expect-error - apikey is a valid model
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
  authService: AuthService;
};

/**
 * This config specifies the runtime configuration for BetterAuth.
 * It extends the static configuration with runtime-specific options
 * using NestJS dependency injection.
 */
export function getBetterAuthConfig(options: BetterAuthConfigOptions): BetterAuthOptions {
  const logger = new Logger('BetterAuth');
  const { databaseService, configService } = options;

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
      sendMagicLink({ email, url, token }) {
        logger.log(`Sending magic link to ${email} with url ${url} and token ${token}`);
      },
    }),
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
    // eslint-disable-next-line @typescript-eslint/naming-convention -- baseURL is a valid option
    baseURL: configService.get('AUTH_URL', { infer: true }),
    trustedOrigins: [configService.get('TAU_FRONTEND_URL', { infer: true })],

    emailAndPassword: {
      ...staticAuthConfig.emailAndPassword,
      async sendResetPassword({ user, url, token }) {
        logger.log(`Sending reset password email to ${user.email} with url ${url} and token ${token}`);
      },
      async onPasswordReset(data) {
        logger.log(`Password reset requested for ${data.user.email}`);
      },
    },
    emailVerification: {
      async sendVerificationEmail({ user, url, token }) {
        logger.log(`Sending verification email to ${user.email} with url ${url} and token ${token}`);
      },
      async afterEmailVerification(user) {
        logger.log(`User ${user.email} has been verified`);
      },
      async onEmailVerification(user) {
        logger.log(`Email verification requested for ${user.email}`);
      },
    },

    socialProviders: {
      github: {
        clientId: configService.get('GITHUB_CLIENT_ID', { infer: true }),
        clientSecret: configService.get('GITHUB_CLIENT_SECRET', { infer: true }),
        // Default scopes for initial sign-in (basic profile info)
        scope: ['read:user', 'user:email'],
      },
      google: {
        clientId: configService.get('GOOGLE_CLIENT_ID', { infer: true }),
        clientSecret: configService.get('GOOGLE_CLIENT_SECRET', { infer: true }),
      },
    },

    // Advanced configuration
    advanced: {
      ...staticAuthConfig.advanced,
      crossSubDomainCookies: {
        enabled: true,
        domain: undefined, // Will be set based on request
      },
      database: {
        generateId(options) {
          const prefix = prefixFromModel[options.model as Models];

          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- exhaustive check
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
      onError(error, ctx) {
        logger.error(`Auth error: ${JSON.stringify(error)}. Context: ${JSON.stringify(ctx)}.`);
      },
    },
  };
}
