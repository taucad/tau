import type { BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { ConfigService } from '@nestjs/config';
import type { DatabaseService } from '~/database/database.service.js';
import type { AuthService } from '~/auth/auth.service.js';
import type { Environment } from '~/config/environment.config.js';

type BetterAuthConfigOptions = {
  databaseService: DatabaseService;
  configService: ConfigService<Environment, true>;
  authService: AuthService;
};

export function getBetterAuthConfig(options: BetterAuthConfigOptions): BetterAuthOptions {
  const { databaseService, configService } = options;

  return {
    database: drizzleAdapter(databaseService.database, {
      provider: 'pg',
    }),

    secret: configService.get('AUTH_SECRET', { infer: true }),
    // eslint-disable-next-line @typescript-eslint/naming-convention -- baseURL is a valid option
    baseURL: configService.get('AUTH_URL', { infer: true }),
    basePath: '/v1/auth',
    appName: 'Tau',
    trustedOrigins: [configService.get('TAU_FRONTEND_URL', { infer: true })],

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
    },

    socialProviders: {
      github: {
        clientId: configService.get('GITHUB_CLIENT_ID', { infer: true }),
        clientSecret: configService.get('GITHUB_CLIENT_SECRET', { infer: true }),
      },
    },

    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // 24 hours
    },

    // Advanced configuration
    advanced: {
      crossSubDomainCookies: {
        enabled: true,
        domain: undefined, // Will be set based on request
      },
    },
  };
}
