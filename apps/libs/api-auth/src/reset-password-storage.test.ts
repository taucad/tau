import { describe, expect, it } from 'vitest';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { staticAuthConfig } from '#config/auth-static.config.js';

describe('password-reset token storage', () => {
  it('stores only a hash of the reset token and still resets the password', async () => {
    const store: Record<string, Array<Record<string, unknown>>> = {
      user: [],
      session: [],
      account: [],
      verification: [],
    };
    let resetToken = '';
    const auth = betterAuth({
      baseURL: 'https://api.example.test',
      basePath: '/v1/auth',
      secret: 'reset-password-storage-test-secret-at-least-32',
      database: memoryAdapter(store),
      verification: staticAuthConfig.verification,
      rateLimit: { enabled: false },
      emailAndPassword: {
        enabled: true,
        async sendResetPassword({ token }) {
          resetToken = token;
        },
      },
    });
    const post = async (path: string, body: unknown): Promise<Response> =>
      auth.handler(
        new Request(`https://api.example.test/v1/auth/${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
      );
    await post('sign-up/email', { email: 'owner@example.test', password: 'first-password-strong-1', name: 'Owner' });

    expect((await post('request-password-reset', { email: 'owner@example.test' })).status).toBe(200);
    expect(resetToken).not.toBe('');
    const identifiers = store['verification']?.map((row) => String(row['identifier'])) ?? [];
    expect(identifiers.some((identifier) => identifier.includes(resetToken))).toBe(false);

    expect((await post('reset-password', { token: resetToken, newPassword: 'second-password-strong-2' })).status).toBe(
      200,
    );
    expect(
      (await post('sign-in/email', { email: 'owner@example.test', password: 'second-password-strong-2' })).status,
    ).toBe(200);
  });
});
