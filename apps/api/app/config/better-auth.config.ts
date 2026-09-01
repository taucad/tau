import type { BetterAuthOptions, LogLevel as BetterAuthLogLevel, ModelNames } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { apiKey } from '@better-auth/api-key';
import { magicLink } from 'better-auth/plugins';
import type { ConfigService } from '@nestjs/config';
import type { LogLevel } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import type { IdPrefix } from '@taucad/types';
import { idPrefix } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import type { DatabaseService } from '#database/database.service.js';
import type { AuthService } from '#auth/auth.service.js';
import type { Environment } from '#config/environment.config.js';
import { staticAuthConfig } from '#config/auth.js';
import type { EmailService } from '#email/email.service.js';

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
  authService: AuthService;
  emailService: EmailService;
};

const sanitizeFrontendRedirectPath = ({
  callbackURL,
  frontendURL,
}: {
  readonly callbackURL?: string;
  readonly frontendURL: string;
}): string => {
  if (!callbackURL) {
    return '/';
  }

  if (callbackURL.startsWith('/') && !callbackURL.startsWith('//')) {
    return callbackURL;
  }

  try {
    const frontendOrigin = new URL(frontendURL).origin;
    const callback = new URL(callbackURL);

    if (callback.origin !== frontendOrigin) {
      return '/';
    }

    return `${callback.pathname}${callback.search}${callback.hash}` || '/';
  } catch {
    return '/';
  }
};

const buildFrontendVerificationUrl = ({
  frontendURL,
  generatedUrl,
  token,
}: {
  readonly frontendURL: string;
  readonly generatedUrl: string;
  readonly token: string;
}): string => {
  const verificationUrl = new URL('/auth/verify-email', frontendURL);
  const generatedVerificationUrl = new URL(generatedUrl);
  const redirectTo = sanitizeFrontendRedirectPath({
    callbackURL: generatedVerificationUrl.searchParams.get('callbackURL') ?? undefined,
    frontendURL,
  });

  verificationUrl.searchParams.set('token', token);
  verificationUrl.searchParams.set('redirectTo', redirectTo);

  return verificationUrl.toString();
};

/**
 * This config specifies the runtime configuration for BetterAuth.
 * It extends the static configuration with runtime-specific options
 * using NestJS dependency injection.
 */
export function getBetterAuthConfig(options: BetterAuthConfigOptions): BetterAuthOptions {
  const logger = new Logger('BetterAuth');
  const { databaseService, configService, emailService } = options;

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
      async sendMagicLink({ email, url }) {
        await emailService.sendMagicLink({ email, url });
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
    baseURL: configService.get('AUTH_URL', { infer: true }),
    trustedOrigins: [configService.get('TAU_FRONTEND_URL', { infer: true })],

    emailAndPassword: {
      ...staticAuthConfig.emailAndPassword,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      async sendResetPassword({ user, url }) {
        await emailService.sendResetPassword({ email: user.email, url });
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
