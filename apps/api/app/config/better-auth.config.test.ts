import { describe, expect, it, vi } from 'vitest';
import { getBetterAuthConfig } from '#config/better-auth.config.js';
import type { Environment } from '#config/environment.config.js';
import type { AuthService } from '#auth/auth.service.js';
import type { ConfigService } from '@nestjs/config';
import type { DatabaseService } from '#database/database.service.js';
import type { EmailService } from '#email/email.service.js';

const createConfig = () => {
  const emailService = {
    sendMagicLink: vi.fn().mockResolvedValue(undefined),
    sendResetPassword: vi.fn().mockResolvedValue(undefined),
    sendVerification: vi.fn().mockResolvedValue(undefined),
  } satisfies Pick<EmailService, 'sendMagicLink' | 'sendResetPassword' | 'sendVerification'>;
  const databaseService = { database: {} } satisfies Pick<DatabaseService, 'database'>;
  const configService = {
    get: vi.fn((key: string) => {
      const values = new Map([
        ['AUTH_SECRET', 'test-secret'],
        ['AUTH_URL', 'http://localhost:4000'],
        ['TAU_FRONTEND_URL', 'http://localhost:3000'],
        ['GITHUB_CLIENT_ID', 'github-id'],
        ['GITHUB_CLIENT_SECRET', 'github-secret'],
        ['GOOGLE_CLIENT_ID', 'google-id'],
        ['GOOGLE_CLIENT_SECRET', 'google-secret'],
      ]);
      return values.get(key) ?? '';
    }),
  } satisfies Pick<ConfigService<Environment, true>, 'get'>;
  const authService = undefined as unknown as AuthService;

  const config = getBetterAuthConfig({
    databaseService: databaseService as DatabaseService,
    configService: configService as ConfigService<Environment, true>,
    authService,
    emailService: emailService as EmailService,
  });

  return { config, emailService };
};

type TestEmailCallbackArgs = {
  readonly user: { readonly email: string };
  readonly url: string;
  readonly token: string;
};

const sendResetPassword = async (
  config: ReturnType<typeof createConfig>['config'],
  args: TestEmailCallbackArgs,
): Promise<void> => {
  const callback = config.emailAndPassword?.sendResetPassword;

  if (!callback) {
    throw new Error('sendResetPassword callback is not configured');
  }

  await callback(args as Parameters<typeof callback>[0]);
};

const sendVerificationEmail = async (
  config: ReturnType<typeof createConfig>['config'],
  args: TestEmailCallbackArgs,
): Promise<void> => {
  const callback = config.emailVerification?.sendVerificationEmail;

  if (!callback) {
    throw new Error('sendVerificationEmail callback is not configured');
  }

  await callback(args as Parameters<typeof callback>[0]);
};

describe('getBetterAuthConfig email callbacks', () => {
  it('routes magic-link emails through EmailService without exposing tokens to logs', async () => {
    const { config, emailService } = createConfig();
    const magicPlugin = config.plugins?.[1] as { options: { sendMagicLink: (args: unknown) => Promise<void> } };

    await magicPlugin.options.sendMagicLink({
      email: 'user@example.com',
      url: 'https://tau.new/callback?token=secret',
      token: 'secret',
    });

    expect(emailService.sendMagicLink).toHaveBeenCalledWith({
      email: 'user@example.com',
      url: 'https://tau.new/callback?token=secret',
    });
  });

  it('routes reset-password emails through EmailService', async () => {
    const { config, emailService } = createConfig();

    await sendResetPassword(config, {
      user: { email: 'user@example.com' },
      url: 'https://tau.new/reset?token=secret',
      token: 'secret',
    });

    expect(emailService.sendResetPassword).toHaveBeenCalledWith({
      email: 'user@example.com',
      url: 'https://tau.new/reset?token=secret',
    });
  });

  it('routes verification emails through the frontend verify page', async () => {
    const { config, emailService } = createConfig();

    await sendVerificationEmail(config, {
      user: { email: 'user@example.com' },
      url: 'http://localhost:4000/v1/auth/verify-email?token=secret&callbackURL=%2Fv%2Fpub_123',
      token: 'secret',
    });

    expect(emailService.sendVerification).toHaveBeenCalledWith({
      email: 'user@example.com',
      url: 'http://localhost:3000/auth/verify-email?token=secret&redirectTo=%2Fv%2Fpub_123',
    });
  });

  it('normalizes frontend callback URLs and rejects external verification redirects', async () => {
    const { config, emailService } = createConfig();

    await sendVerificationEmail(config, {
      user: { email: 'user@example.com' },
      url: 'http://localhost:4000/v1/auth/verify-email?token=secret&callbackURL=http%3A%2F%2Flocalhost%3A3000%2Fprojects%2Fabc%3Ftab%3Dshare',
      token: 'secret',
    });
    await sendVerificationEmail(config, {
      user: { email: 'user@example.com' },
      url: 'http://localhost:4000/v1/auth/verify-email?token=secret&callbackURL=https%3A%2F%2Fevil.example%2Fsteal',
      token: 'secret',
    });

    expect(emailService.sendVerification).toHaveBeenCalledWith({
      email: 'user@example.com',
      url: 'http://localhost:3000/auth/verify-email?token=secret&redirectTo=%2Fprojects%2Fabc%3Ftab%3Dshare',
    });
    expect(emailService.sendVerification).toHaveBeenCalledWith({
      email: 'user@example.com',
      url: 'http://localhost:3000/auth/verify-email?token=secret&redirectTo=%2F',
    });
  });
});
