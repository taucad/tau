import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { ConfigService } from '@nestjs/config';
import type { Environment } from '#config/environment.config.js';
import { EmailService } from '#email/email.service.js';

const sendMock = vi.fn();
const resendConstructorMock = vi.fn();

vi.mock('resend', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the module's exported class name
  Resend: class {
    public readonly emails = { send: sendMock };

    public constructor(apiKey: string) {
      resendConstructorMock(apiKey);
    }
  },
}));

const createService = (resendApiKey: string): EmailService => {
  const values: Record<string, string> = {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variable name
    RESEND_API_KEY: resendApiKey,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variable name
    TAU_FRONTEND_URL: 'https://tau.new',
    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variable name
    TAU_EMAIL_FROM: 'Tau <identity@tau.new>',
    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variable name
    TAU_EMAIL_REPLY_TO: 'help@tau.new',
  };

  return new EmailService(mock<ConfigService<Environment, true>>({ get: vi.fn((key: string) => values[key] ?? '') }));
};

describe('EmailService delivery gate', () => {
  beforeEach(() => {
    sendMock.mockReset();
    resendConstructorMock.mockReset();
  });

  it('renders but does not send when RESEND_API_KEY is absent', async () => {
    const service = createService('   ');

    await service.sendMagicLink({
      email: 'user@example.com',
      url: 'https://tau.new/auth/magic-link/verify?token=secret&redirectTo=%2F',
    });

    expect(resendConstructorMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('sends through Resend when RESEND_API_KEY is present', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email_123' }, error: null });
    const service = createService('re_test_key');

    await service.sendMagicLink({
      email: 'user@example.com',
      url: 'https://tau.new/auth/magic-link/verify?token=secret&redirectTo=%2F',
    });

    expect(resendConstructorMock).toHaveBeenCalledWith('re_test_key');
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Tau <identity@tau.new>',
        to: 'user@example.com',
        replyTo: 'help@tau.new',
        // The subject comes from the template, not the call site.
        subject: 'Your sign-in link for Tau',
      }),
    );
  });

  it('rejects backend auth URLs before rendering or sending', async () => {
    const service = createService('re_test_key');

    await expect(
      service.sendResetPassword({
        email: 'user@example.com',
        url: 'https://api.tau.new/v1/auth/reset-password/token',
      }),
    ).rejects.toThrow(/origin/u);

    expect(sendMock).not.toHaveBeenCalled();
  });

  it('rejects frontend URLs on the wrong email template path before sending', async () => {
    const service = createService('re_test_key');

    await expect(
      service.sendVerification({
        email: 'user@example.com',
        url: 'https://tau.new/v1/auth/verify-email?token=secret',
      }),
    ).rejects.toThrow(/path/u);

    expect(sendMock).not.toHaveBeenCalled();
  });
});
