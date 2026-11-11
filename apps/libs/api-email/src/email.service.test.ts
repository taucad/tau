import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { ConfigService } from '@nestjs/config';
import type { Environment } from '@taucad/api-core';
import type { EmailTemplate } from '#email.types.js';
import { EmailService } from '#email.service.js';

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

const createService = (resendApiKey: string, senders: Record<string, string> = {}): EmailService => {
  const values: Record<string, string> = {
    ...senders,
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

  it('gives every send its own entity reference so Gmail does not thread them', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email_123' }, error: null });
    const service = createService('re_test_key');
    const send = async (): Promise<void> =>
      service.sendVerification({
        email: 'user@example.com',
        url: 'https://tau.new/auth/verify-email?token=secret&redirectTo=%2F',
      });

    await send();
    await send();

    const references = sendMock.mock.calls.map(
      (call: unknown[]) => (call[0] as { headers: Record<string, string> }).headers['X-Entity-Ref-ID'],
    );
    expect(references).toHaveLength(2);
    expect(references[0]).toMatch(/^[\da-f-]{36}$/u);
    expect(references[0]).not.toBe(references[1]);
  });

  it('rejects an account-exists reset link off the frontend forgot-password page', async () => {
    const service = createService('re_test_key');

    await expect(
      service.sendAccountExists({
        email: 'user@example.com',
        url: 'https://tau.new/auth/sign-in',
        resetUrl: 'https://evil.example/auth/forgot-password',
      }),
    ).rejects.toThrow(/reset URL/u);

    expect(sendMock).not.toHaveBeenCalled();
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

const identity = 'Tau <identity@tau.new>';
const notifications = 'Tau <notifications@tau.new>';
const billing = 'Tau Billing <billing@tau.new>';

// One template per kind, with links the link guard accepts. The From each kind expects is the confirmed
// sender table (email readiness, Part C); Reply-To is help@ for every class.
const templatesByKind: ReadonlyArray<{ readonly template: EmailTemplate; readonly from: string }> = [
  {
    template: { kind: 'verify-email', email: 'user@example.com', url: 'https://tau.new/auth/verify-email?token=t' },
    from: identity,
  },
  {
    template: {
      kind: 'account-exists',
      email: 'user@example.com',
      url: 'https://tau.new/auth/sign-in',
      resetUrl: 'https://tau.new/auth/forgot-password',
    },
    from: identity,
  },
  {
    template: { kind: 'magic-link', email: 'user@example.com', url: 'https://tau.new/auth/magic-link/verify?token=t' },
    from: identity,
  },
  {
    template: { kind: 'reset-password', email: 'user@example.com', url: 'https://tau.new/auth/reset-password?token=t' },
    from: identity,
  },
  {
    template: {
      kind: 'password-changed',
      email: 'user@example.com',
      changedAt: '16 Sep 2026, 10:57 UTC',
      url: 'https://tau.new/auth/forgot-password',
    },
    from: identity,
  },
  {
    template: {
      kind: 'publication-invite',
      recipientEmail: 'user@example.com',
      ownerName: 'Ada',
      publicationTitle: 'Bracket',
      url: 'https://tau.new/s/tau~pub_123',
    },
    from: notifications,
  },
  {
    template: { kind: 'payment-failed', email: 'user@example.com', billingUrl: 'https://tau.new/?settings=billing' },
    from: billing,
  },
  {
    template: {
      kind: 'auto-reload-disabled',
      email: 'user@example.com',
      billingUrl: 'https://tau.new/?settings=billing',
    },
    from: billing,
  },
  {
    template: {
      kind: 'auto-reload-action-required',
      email: 'user@example.com',
      billingUrl: 'https://tau.new/?settings=billing',
    },
    from: billing,
  },
];

const sentEnvelope = (): { from: unknown; replyTo: unknown } => {
  expect(sendMock).toHaveBeenCalledTimes(1);
  const [payload] = sendMock.mock.lastCall as [{ from: unknown; replyTo: unknown }];
  return { from: payload.from, replyTo: payload.replyTo };
};

describe('EmailService sender per template kind', () => {
  beforeEach(() => {
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: 'email_123' }, error: null });
  });

  it('covers every template kind', () => {
    expect(new Set(templatesByKind.map(({ template }) => template.kind)).size).toBe(9);
  });

  it.each(templatesByKind)('sends $template.kind from its purpose sender', async ({ template, from }) => {
    const service = createService('re_test_key', {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variable name
      TAU_EMAIL_FROM_NOTIFICATIONS: notifications,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variable name
      TAU_EMAIL_FROM_BILLING: billing,
    });

    await service.send({ to: 'user@example.com', template });

    expect(sentEnvelope()).toEqual({ from, replyTo: 'help@tau.new' });
  });

  it.each(templatesByKind)(
    'sends $template.kind from TAU_EMAIL_FROM when the purpose senders are unset',
    async ({ template }) => {
      // The mock's `get` returns '' for a missing key, as the billing worker's raw-environment config does.
      const service = createService('re_test_key');

      await service.send({ to: 'user@example.com', template });

      expect(sentEnvelope()).toEqual({ from: identity, replyTo: 'help@tau.new' });
    },
  );

  it.each(templatesByKind)(
    'sends $template.kind from TAU_EMAIL_FROM when the purpose senders are empty',
    async ({ template }) => {
      const service = createService('re_test_key', {
        // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variable name
        TAU_EMAIL_FROM_NOTIFICATIONS: '  ',
        // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variable name
        TAU_EMAIL_FROM_BILLING: '',
      });

      await service.send({ to: 'user@example.com', template });

      expect(sentEnvelope()).toEqual({ from: identity, replyTo: 'help@tau.new' });
    },
  );

  it('falls back to TAU_EMAIL_FROM when the config returns undefined for an optional sender', async () => {
    // A Nest ConfigService returns undefined for an optional key the schema left unset.
    const values: Record<string, string | undefined> = {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variable name
      RESEND_API_KEY: 're_test_key',
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variable name
      TAU_FRONTEND_URL: 'https://tau.new',
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variable name
      TAU_EMAIL_FROM: identity,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variable name
      TAU_EMAIL_REPLY_TO: 'help@tau.new',
    };
    const service = new EmailService(
      mock<ConfigService<Environment, true>>({ get: vi.fn((key: string) => values[key]) }),
    );

    await service.sendAutoReloadDisabled({
      email: 'user@example.com',
      billingUrl: 'https://tau.new/?settings=billing',
    });

    expect(sentEnvelope()).toEqual({ from: identity, replyTo: 'help@tau.new' });
  });
});
