import type { BetterAuthOptions, Models } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { apiKey } from 'better-auth/plugins';
import type { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import type { DatabaseService } from '#database/database.service.js';
import type { AuthService } from '#auth/auth.service.js';
import type { Environment } from '#config/environment.config.js';
import { generatePrefixedId } from '#utils/id.utils.js';
import type { IdPrefix } from '#types/id.types.js';
import { idPrefix } from '#constants/id.constants.js';
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
};

type BetterAuthConfigOptions = {
  databaseService: DatabaseService;
  configService: ConfigService<Environment, true>;
  authService: AuthService;
};

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

    secret: configService.get('AUTH_SECRET', { infer: true }),
    // eslint-disable-next-line @typescript-eslint/naming-convention -- baseURL is a valid option
    baseURL: configService.get('AUTH_URL', { infer: true }),
    trustedOrigins: [configService.get('TAU_FRONTEND_URL', { infer: true })],

    // Override emailAndPassword with runtime-specific handlers
    emailAndPassword: {
      ...staticAuthConfig.emailAndPassword,
      async sendResetPassword({ user, url, token }) {
        logger.log(`Sending reset password email to ${user.email} with url ${url} and token ${token}`);
      },
      resetPasswordTokenExpiresIn: 3600,
    },

    socialProviders: {
      github: {
        clientId: configService.get('GITHUB_CLIENT_ID', { infer: true }),
        clientSecret: configService.get('GITHUB_CLIENT_SECRET', { infer: true }),
      },
      google: {
        clientId: configService.get('GOOGLE_CLIENT_ID', { infer: true }),
        clientSecret: configService.get('GOOGLE_CLIENT_SECRET', { infer: true }),
      },
    },

    // Advanced configuration
    advanced: {
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
      cookiePrefix: 'tau',
      // Only use secure cookies in production. Note: this requires SSL.
      useSecureCookies: import.meta.env.PROD,
      defaultCookieAttributes: {
        httpOnly: true,
        secure: import.meta.env.PROD, // Only secure cookies in production
        sameSite: 'lax',
      },
    },

    // eslint-disable-next-line @typescript-eslint/naming-convention -- onAPIError is a valid option
    onAPIError: {
      throw: false,
      onError(error, ctx) {
        logger.error('Auth error:', error, ctx);
      },
    },
  };
}
