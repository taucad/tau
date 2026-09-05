import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type Stripe from 'stripe';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { getBetterAuthConfig } from '#config/better-auth.config.js';
import type { Environment } from '#config/environment.config.js';
import type { AuthService } from '#auth/auth.service.js';
import type { ConfigService } from '@nestjs/config';
import type { DatabaseService } from '#database/database.service.js';
import type { EmailService } from '#email/email.service.js';
import type { BillingService } from '#api/billing/billing.service.js';
import type { StripeEventRouter } from '#api/billing/stripe-event-router.service.js';

const createConfig = (authUrl = 'http://localhost:4000') => {
  const emailService = {
    sendMagicLink: vi.fn<EmailService['sendMagicLink']>().mockResolvedValue(undefined),
    sendResetPassword: vi.fn<EmailService['sendResetPassword']>().mockResolvedValue(undefined),
    sendVerification: vi.fn<EmailService['sendVerification']>().mockResolvedValue(undefined),
  } satisfies Pick<EmailService, 'sendMagicLink' | 'sendResetPassword' | 'sendVerification'>;
  const databaseService = { database: {} } as unknown as DatabaseService;
  const configService = {
    get: vi.fn((key: string) => {
      const values = new Map([
        ['AUTH_SECRET', 'test-secret'],
        ['AUTH_URL', authUrl],
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
    databaseService,
    configService: configService as unknown as ConfigService<Environment, true>,
    authService,
    emailService: emailService as unknown as EmailService,
    billingService: mock<BillingService>(),
    stripeEventRouter: mock<StripeEventRouter>(),
    stripeClient: mock<Stripe>(),
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

describe('getBetterAuthConfig abuse gates', () => {
  it.each([
    ['http://localhost:4000', false],
    ['https://api.tau.new', true],
  ] as const)('derives secure cookie transport from the runtime auth URL %s', (authUrl, secure) => {
    const { config } = createConfig(authUrl);

    expect(config.advanced?.useSecureCookies).toBe(secure);
    expect(config.advanced?.defaultCookieAttributes?.secure).toBe(secure);
  });

  it('requires a verified email before sign-in — unverified users never reach AI surfaces (Q38/S-abuse)', async () => {
    const { config } = createConfig();

    expect(config.emailAndPassword?.requireEmailVerification).toBe(true);
    // The static CLI config must stay in lockstep (dual-config count guard).
    const { auth } = await import('#config/auth.js');
    expect(auth.options.emailAndPassword.requireEmailVerification).toBe(true);
  });

  it('encrypts OAuth tokens before storing write-scoped provider credentials', async () => {
    const { config } = createConfig();
    const { auth } = await import('#config/auth.js');

    expect(config.account?.encryptOAuthTokens).toBe(true);
    expect(auth.options.account.encryptOAuthTokens).toBe(true);
  });

  it('keeps initial GitHub sign-in limited to identity scopes', () => {
    const { config } = createConfig();
    const github = config.socialProviders?.['github'];

    expect(typeof github).not.toBe('function');
    expect(typeof github === 'function' ? undefined : github?.scope).toEqual(['read:user', 'user:email']);
  });

  it('keeps bearer last in both lockstep plugin lists', async () => {
    const { config } = createConfig();
    const { staticAuthConfig } = await import('#config/auth.js');

    expect(config.plugins?.at(-1)?.id).toBe('bearer');
    expect(staticAuthConfig.plugins.at(-1)?.id).toBe('bearer');
  });

  // The two arrays are only guarded on length at runtime; pinning the order here
  // is what catches a plugin inserted into one file and not the other. Position 1
  // is load-bearing for the magic-link callback test below.
  it('pins the same plugin order in both lockstep plugin lists', async () => {
    const { config } = createConfig();
    const { staticAuthConfig } = await import('#config/auth.js');
    const expected = ['api-key', 'magic-link', 'stripe', 'one-time-token', 'bearer'];

    expect(config.plugins?.map((plugin) => plugin.id)).toEqual(expected);
    expect(staticAuthConfig.plugins.map((plugin) => plugin.id)).toEqual(expected);
  });

  it('stores desktop one-time tokens hashed so a leaked verification row cannot be replayed', async () => {
    const { config } = createConfig();
    const { staticAuthConfig } = await import('#config/auth.js');
    const runtimeOtt = config.plugins?.[3] as unknown as { options?: { storeToken?: string } };
    const staticOtt = staticAuthConfig.plugins[3] as unknown as { options?: { storeToken?: string } };

    expect(runtimeOtt.options?.storeToken).toBe('hashed');
    expect(staticOtt.options?.storeToken).toBe('hashed');
  });
});

describe('getBetterAuthConfig email callbacks', () => {
  it('routes magic-link emails through the frontend verifier without exposing backend auth URLs', async () => {
    const { config, emailService } = createConfig();
    const magicPlugin = config.plugins?.[1] as unknown as {
      options: { sendMagicLink: (args: unknown) => Promise<void> };
    };

    await magicPlugin.options.sendMagicLink({
      email: 'user@example.com',
      url: 'http://localhost:4000/v1/auth/magic-link/verify?token=secret&callbackURL=%2Fs%2Ftau%7Epub_123',
      token: 'secret',
    });

    expect(emailService.sendMagicLink).toHaveBeenCalledWith({
      email: 'user@example.com',
      url: 'http://localhost:3000/auth/magic-link/verify?token=secret&redirectTo=%2Fs%2Ftau%7Epub_123',
    });
    const sentUrl = vi.mocked(emailService.sendMagicLink).mock.calls[0]?.[0].url;
    expect(sentUrl).not.toContain('localhost:4000');
    expect(sentUrl).not.toContain('/v1/auth');
  });

  it('routes reset-password emails through the frontend reset page without exposing backend auth URLs', async () => {
    const { config, emailService } = createConfig();

    await sendResetPassword(config, {
      user: { email: 'user@example.com' },
      url: 'http://localhost:4000/v1/auth/reset-password/secret',
      token: 'secret',
    });

    expect(emailService.sendResetPassword).toHaveBeenCalledWith({
      email: 'user@example.com',
      url: 'http://localhost:3000/auth/reset-password?token=secret',
    });
    const sentUrl = vi.mocked(emailService.sendResetPassword).mock.calls[0]?.[0].url;
    expect(sentUrl).not.toContain('localhost:4000');
    expect(sentUrl).not.toContain('/v1/auth');
  });

  it('routes verification emails through the frontend verify page without exposing backend auth URLs', async () => {
    const { config, emailService } = createConfig();

    await sendVerificationEmail(config, {
      user: { email: 'user@example.com' },
      url: 'http://localhost:4000/v1/auth/verify-email?token=secret&callbackURL=%2Fs%2Ftau%7Epub_123',
      token: 'secret',
    });

    expect(emailService.sendVerification).toHaveBeenCalledWith({
      email: 'user@example.com',
      url: 'http://localhost:3000/auth/verify-email?token=secret&redirectTo=%2Fs%2Ftau%7Epub_123',
    });
    const sentUrl = vi.mocked(emailService.sendVerification).mock.calls[0]?.[0].url;
    expect(sentUrl).not.toContain('localhost:4000');
    expect(sentUrl).not.toContain('/v1/auth');
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

/**
 * Regression cover for defect B6 (desktop smoke lane, 2026-09-02): against a
 * running API, sign-in emitted no `set-auth-token` and a bearer token was
 * refused where the same session's cookie was accepted.
 *
 * The pre-existing bearer suite builds its instance from `staticAuthConfig`, so
 * it could not speak to the served composition. These cases run the **runtime**
 * config — `getBetterAuthConfig` with its runtime plugin options, `baseURL`,
 * `trustedOrigins`, `crossSubDomainCookies` and prefixed `generateId` — and swap
 * only the drizzle adapter for an in-memory one.
 *
 * B6's actual cause was a stale `apps/api/dist/main.js` predating the bearer
 * plugin, which no unit test can see; these cases pin the composition so a real
 * divergence between the two arrays cannot hide behind a build artefact again.
 */
describe('getBetterAuthConfig runtime bearer composition', () => {
  const email = 'runtime-bearer@example.test';
  const password = 'correct horse battery staple';

  const createRuntimeAuth = () => {
    const store: Record<string, Array<Record<string, unknown>>> = {
      user: [],
      session: [],
      account: [],
      verification: [],
      apikey: [],
      subscription: [],
    };
    const { config } = createConfig();
    return { store, auth: betterAuth({ ...config, database: memoryAdapter(store) }) };
  };

  // Structural, not `ReturnType<typeof betterAuth>`: Better Auth's concrete
  // plugin tuple narrows `Auth` invariantly, and `handler` is all we call.
  const request = async (
    auth: { handler: (input: Request) => Promise<Response> },
    path: string,
    init?: { body?: Record<string, string>; headers?: Record<string, string> },
  ) =>
    auth.handler(
      new Request(`http://localhost:4000/v1/auth/${path}`, {
        method: init?.body ? 'POST' : 'GET',
        headers: { 'content-type': 'application/json', ...init?.headers },
        body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      }),
    );

  /** Signs up, marks the address verified in place, and signs in. */
  const signIn = async () => {
    const { auth, store } = createRuntimeAuth();
    const signUp = await request(auth, 'sign-up/email', { body: { email, name: 'Runtime Bearer', password } });
    if (!signUp.ok) {
      throw new Error(`Runtime sign-up failed with ${signUp.status}: ${await signUp.text()}`);
    }
    // The runtime config hard-codes requireEmailVerification; verify in place
    // rather than weakening the composition under test.
    for (const user of store['user'] ?? []) {
      user['emailVerified'] = true;
    }
    const response = await request(auth, 'sign-in/email', { body: { email, password } });
    return { auth, response, store };
  };

  it('emits set-auth-token on sign-in through the runtime composition (B6)', async () => {
    const { response } = await signIn();

    expect(response.status).toBe(200);
    expect(response.headers.get('set-auth-token')).toEqual(expect.any(String));
    expect(response.headers.get('set-auth-token')).not.toBe('');
  });

  it('resolves a session from a bearer header alone, with no cookie (B6)', async () => {
    const { auth, response } = await signIn();
    const token = response.headers.get('set-auth-token') ?? '';
    const session = await request(auth, 'get-session', { headers: { authorization: `Bearer ${token}` } });

    expect(session.status).toBe(200);
    expect(await session.json()).toMatchObject({ user: { email } });
  });

  it('completes the desktop one-time-token handoff through the runtime composition', async () => {
    const { auth, response } = await signIn();
    const token = response.headers.get('set-auth-token') ?? '';

    const generated = await request(auth, 'one-time-token/generate', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(generated.status).toBe(200);
    const generatedBody: unknown = await generated.json();
    // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- endpoint contract asserted one line above.
    const { token: oneTimeToken } = generatedBody as { token: string };

    // Cookie-less and origin-less, exactly as Electron main's loopback handler calls it.
    const verified = await request(auth, 'one-time-token/verify', { body: { token: oneTimeToken } });

    expect(verified.status).toBe(200);
    expect(verified.headers.get('set-auth-token')).toEqual(expect.any(String));
  });
});
