import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailService } from '#email/email.service.js';

const sendMock = vi.fn();
const resendConstructorMock = vi.fn();

vi.mock('resend', () => ({
  Resend: class {
    public readonly emails = { send: sendMock };

    public constructor(apiKey: string) {
      resendConstructorMock(apiKey);
    }
  },
}));

const createService = (resendApiKey: string): EmailService => {
  const values: Record<string, string> = {
    RESEND_API_KEY: resendApiKey,
    TAU_EMAIL_FROM: 'Tau <identity@tau.new>',
    TAU_EMAIL_REPLY_TO: 'identity@tau.new',
  };

  return new EmailService({
    get: vi.fn((key: string) => values[key] ?? ''),
  } as never);
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
      url: 'https://tau.new/auth/callback?token=secret',
    });

    expect(resendConstructorMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('sends through Resend when RESEND_API_KEY is present', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email_123' }, error: null });
    const service = createService('re_test_key');

    await service.sendMagicLink({
      email: 'user@example.com',
      url: 'https://tau.new/auth/callback?token=secret',
    });

    expect(resendConstructorMock).toHaveBeenCalledWith('re_test_key');
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Tau <identity@tau.new>',
        to: 'user@example.com',
        replyTo: 'identity@tau.new',
        subject: 'Sign in to Tau',
      }),
    );
  });
});
