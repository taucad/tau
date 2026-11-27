/* eslint-disable @typescript-eslint/naming-convention -- OAuth wire parameters keep their spelling */
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import { createAuthService, desktopClientId, SignInEndedError } from '#main/auth-service.js';
import type { AuthService, AuthServiceOptions, SafeStorageLike } from '#main/auth-service.js';

/* A stand-in for the OS keychain: reversible, and distinguishable from plain text. */
const fakeSafeStorage = (): SafeStorageLike => ({
  isEncryptionAvailable: () => true,
  encryptString: (plainText) => Buffer.from(`enc:${plainText}`, 'utf8'),
  decryptString: (encrypted) => encrypted.toString('utf8').replace(/^enc:/u, ''),
});

const account = { id: 'usr_1', name: 'Person', email: 'person@example.test' };

type ApiCall = { readonly path: string; readonly form?: URLSearchParams; readonly authorization?: string };

/**
 * The API as the desktop sees it: the token endpoint (code and refresh grants), revocation and the account route.
 * Each issued token is numbered so a test can tell a rotation happened.
 */
const fakeApi = (behaviour: { refreshStatus?: number; exchangeStatus?: number } = {}) => {
  const calls: ApiCall[] = [];
  let issued = 0;
  const tokens = (): Response => {
    issued += 1;
    return Response.json({
      access_token: `access-${String(issued)}`,
      refresh_token: `refresh-${String(issued)}`,
      expires_in: 3600,
      token_type: 'Bearer',
    });
  };
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const headers = new Headers(init?.headers);
    const form = typeof init?.body === 'string' ? new URLSearchParams(init.body) : undefined;
    calls.push({ path: url.pathname, form, authorization: headers.get('authorization') ?? undefined });
    if (url.pathname === '/v1/auth/oauth2/token' && form?.get('grant_type') === 'authorization_code') {
      return behaviour.exchangeStatus === undefined
        ? tokens()
        : new Response('{}', { status: behaviour.exchangeStatus });
    }
    if (url.pathname === '/v1/auth/oauth2/token' && form?.get('grant_type') === 'refresh_token') {
      return behaviour.refreshStatus === undefined ? tokens() : new Response('{}', { status: behaviour.refreshStatus });
    }
    if (url.pathname === '/v1/auth/oauth2/revoke') {
      return new Response(null, { status: 200 });
    }
    if (url.pathname === '/v1/account/session' || url.pathname === '/v1/auth/get-session') {
      return Response.json({ session: { id: 'family-1', token: '' }, user: account });
    }
    return new Response('not found', { status: 404 });
  });
  return { fetch, calls };
};

const baseOptions = (overrides: Partial<AuthServiceOptions> = {}): AuthServiceOptions => ({
  apiUrl: 'http://api.tau.test',
  frontendUrl: 'https://tau.test',
  userDataPath: mkdtempSync(join(tmpdir(), 'tau-auth-')),
  safeStorage: fakeSafeStorage(),
  openExternal: async () => undefined,
  packaged: true,
  signInTimeout: 10_000,
  ...overrides,
});

/**
 * Marks a sign-in's promise as observed, so a test that ends it on purpose leaves no unhandled rejection.
 *
 * @param promise - The sign-in.
 * @returns The same promise.
 */
// oxlint-disable-next-line typescript/promise-function-async -- an async wrapper would be a second, unobserved promise
const quiet = (promise: Promise<void>): Promise<void> => {
  // oxlint-disable-next-line promise/prefer-await-to-then -- a handler attached now, awaited by the test later
  promise.catch(() => undefined);
  return promise;
};

/** Start a sign-in and capture the authorization URL the browser would be sent to. */
const startSignIn = async (
  service: AuthService,
  opened: string[],
): Promise<{ settled: Promise<void>; authorize: URL }> => {
  const settled = quiet(service.signIn());
  await vi.waitFor(() => {
    expect(opened).toHaveLength(1);
  });
  return { settled, authorize: new URL(opened[0]!) };
};

/** What the browser does after consent: follow the provider's redirect to the listener, without following on. */
const browserReturns = async (authorize: URL, query: Record<string, string>): Promise<Response> => {
  const back = new URL(authorize.searchParams.get('redirect_uri')!);
  for (const [name, value] of Object.entries(query)) {
    back.searchParams.set(name, value);
  }
  return globalThis.fetch(back, { redirect: 'manual' });
};

const signedInService = async (options: AuthServiceOptions): Promise<AuthService> => {
  const opened: string[] = [];
  const service = createAuthService({
    ...options,
    openExternal: async (url) => {
      opened.push(url);
    },
  });
  const { settled, authorize } = await startSignIn(service, opened);
  await browserReturns(authorize, { code: 'code-1', state: authorize.searchParams.get('state')! });
  await settled;
  return service;
};

describe('createAuthService — sign-in over loopback', () => {
  it('should ask for a PKCE S256 code with consent, for the desktop client, to a random 127.0.0.1 path', async () => {
    const api = fakeApi();
    const opened: string[] = [];
    const service = createAuthService(
      baseOptions({
        fetch: api.fetch,
        openExternal: async (url) => {
          opened.push(url);
        },
      }),
    );

    const { authorize } = await startSignIn(service, opened);

    expect(`${authorize.origin}${authorize.pathname}`).toBe('http://api.tau.test/v1/auth/oauth2/authorize');
    expect(authorize.searchParams.get('client_id')).toBe(desktopClientId);
    expect(authorize.searchParams.get('response_type')).toBe('code');
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorize.searchParams.get('prompt')).toBe('consent');
    expect(authorize.searchParams.get('scope')).toContain('offline_access');
    const redirect = new URL(authorize.searchParams.get('redirect_uri')!);
    expect(redirect.hostname).toBe('127.0.0.1');
    expect(redirect.pathname).toMatch(/^\/cb\/[\w-]{32}$/u);
    expect(service.signInAttempt()?.url).toBe(authorize.toString());
    service.dispose();
  });

  it('should exchange the code with the verifier, learn the account, and send the tab to the outcome page', async () => {
    const api = fakeApi();
    const opened: string[] = [];
    const service = createAuthService(
      baseOptions({
        fetch: api.fetch,
        openExternal: async (url) => {
          opened.push(url);
        },
      }),
    );
    const { settled, authorize } = await startSignIn(service, opened);

    const back = await browserReturns(authorize, { code: 'code-1', state: authorize.searchParams.get('state')! });
    await settled;

    expect(back.status).toBe(302);
    expect(back.headers.get('location')).toBe('https://tau.test/auth/desktop?result=signed-in');
    const exchange = api.calls.find((call) => call.form?.get('grant_type') === 'authorization_code')!;
    const verifier = exchange.form!.get('code_verifier')!;
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(
      authorize.searchParams.get('code_challenge'),
    );
    expect(exchange.form!.get('redirect_uri')).toBe(authorize.searchParams.get('redirect_uri'));
    expect(service.token()).toBe('access-1');
    expect(service.principal()).toBe('usr_1');
    expect(service.principalEmail()).toBe('person@example.test');
    expect(api.calls.some((call) => call.path.includes(verifier) || call.authorization?.includes(verifier))).toBe(
      false,
    );
    service.dispose();
  });

  it('should close the listener once the attempt ends, and open none outside an attempt', async () => {
    const api = fakeApi();
    const opened: string[] = [];
    const service = createAuthService(
      baseOptions({
        fetch: api.fetch,
        openExternal: async (url) => {
          opened.push(url);
        },
      }),
    );
    const { settled, authorize } = await startSignIn(service, opened);
    await browserReturns(authorize, { code: 'code-1', state: authorize.searchParams.get('state')! });
    await settled;

    await expect(browserReturns(authorize, { code: 'code-2', state: 'x' })).rejects.toThrow();
    expect(service.signInAttempt()?.url).toBeUndefined();
    service.dispose();
  });

  it('should refuse a redirect with the wrong state without ending the attempt or calling the API', async () => {
    const api = fakeApi();
    const opened: string[] = [];
    const service = createAuthService(
      baseOptions({
        fetch: api.fetch,
        openExternal: async (url) => {
          opened.push(url);
        },
      }),
    );
    const { settled, authorize } = await startSignIn(service, opened);

    const forged = await browserReturns(authorize, { code: 'stolen', state: 'not-the-state' });

    expect(forged.headers.get('location')).toBe('https://tau.test/auth/desktop?result=failed&reason=error');
    expect(api.calls).toEqual([]);
    expect(service.signInAttempt()?.url).toBeDefined();
    await browserReturns(authorize, { code: 'code-1', state: authorize.searchParams.get('state')! });
    await settled;
    expect(service.token()).toBe('access-1');
    service.dispose();
  });

  it('should answer only its own path', async () => {
    const opened: string[] = [];
    const service = createAuthService(
      baseOptions({
        fetch: fakeApi().fetch,
        openExternal: async (url) => {
          opened.push(url);
        },
      }),
    );
    const { authorize } = await startSignIn(service, opened);
    const other = new URL(authorize.searchParams.get('redirect_uri')!);
    other.pathname = '/cb/guessed';

    const response = await globalThis.fetch(other, { redirect: 'manual' });

    expect(response.status).toBe(404);
    service.dispose();
  });

  it('should end as canceled when the person cancels on the consent page', async () => {
    const opened: string[] = [];
    const service = createAuthService(
      baseOptions({
        fetch: fakeApi().fetch,
        openExternal: async (url) => {
          opened.push(url);
        },
      }),
    );
    const { settled, authorize } = await startSignIn(service, opened);

    const back = await browserReturns(authorize, {
      error: 'access_denied',
      state: authorize.searchParams.get('state')!,
    });

    expect(back.headers.get('location')).toBe('https://tau.test/auth/desktop?result=failed&reason=canceled');
    await expect(settled).rejects.toMatchObject({ reason: 'canceled' });
    expect(service.token()).toBeUndefined();
    service.dispose();
  });

  it('should end as an error, and hold nothing, when the code exchange fails', async () => {
    const opened: string[] = [];
    const service = createAuthService(
      baseOptions({
        fetch: fakeApi({ exchangeStatus: 400 }).fetch,
        openExternal: async (url) => {
          opened.push(url);
        },
      }),
    );
    const { settled, authorize } = await startSignIn(service, opened);

    const back = await browserReturns(authorize, { code: 'expired-code', state: authorize.searchParams.get('state')! });

    expect(back.headers.get('location')).toBe('https://tau.test/auth/desktop?result=failed&reason=error');
    await expect(settled).rejects.toBeInstanceOf(SignInEndedError);
    expect(service.principal()).toBeUndefined();
    service.dispose();
  });

  it('should replace the attempt in flight when Sign in is chosen again', async () => {
    const opened: string[] = [];
    const service = createAuthService(
      baseOptions({
        fetch: fakeApi().fetch,
        openExternal: async (url) => {
          opened.push(url);
        },
      }),
    );
    const first = quiet(service.signIn());
    await vi.waitFor(() => {
      expect(opened).toHaveLength(1);
    });

    void quiet(service.signIn('different-account'));

    await expect(first).rejects.toMatchObject({ reason: 'canceled' });
    await vi.waitFor(() => {
      expect(opened).toHaveLength(2);
    });
    expect(new URL(opened[1]!).searchParams.get('prompt')).toBe('login consent');
    service.dispose();
  });

  it('should say the browser failed to open and keep the attempt open for Copy link', async () => {
    const service = createAuthService(
      baseOptions({
        fetch: fakeApi().fetch,
        openExternal: async () => {
          throw new Error('no browser');
        },
      }),
    );
    const settled = quiet(service.signIn());

    await vi.waitFor(() => {
      expect(service.signInAttempt()).toMatchObject({ phase: 'waiting', browserFailed: true });
    });
    service.cancelSignIn();
    await expect(settled).rejects.toMatchObject({ reason: 'canceled' });
    service.dispose();
  });

  it('should be finishing while the code is exchanged', async () => {
    const api = fakeApi();
    const opened: string[] = [];
    const phases: Array<string | undefined> = [];
    const service = createAuthService(
      baseOptions({
        fetch: api.fetch,
        openExternal: async (url) => {
          opened.push(url);
        },
      }),
    );
    service.onChange(() => {
      phases.push(service.signInAttempt()?.phase);
    });
    const { settled, authorize } = await startSignIn(service, opened);

    await browserReturns(authorize, { code: 'code-1', state: authorize.searchParams.get('state')! });
    await settled;

    expect(phases).toContain('waiting');
    expect(phases).toContain('finishing');
    expect(phases.at(-1)).toBeUndefined();
    service.dispose();
  });

  it('should end as expired when the browser never comes back', async () => {
    const opened: string[] = [];
    const service = createAuthService(
      baseOptions({
        fetch: fakeApi().fetch,
        signInTimeout: 50,
        openExternal: async (url) => {
          opened.push(url);
        },
      }),
    );

    await expect(service.signIn()).rejects.toMatchObject({ reason: 'expired' });
    expect(service.signInAttempt()?.url).toBeUndefined();
    service.dispose();
  });
});

describe('createAuthService — custody, refresh and sign-out', () => {
  it('should store the refresh token and the account together as ciphertext, and never the access token', async () => {
    const options = baseOptions({ fetch: fakeApi().fetch });
    const service = await signedInService(options);
    const path = join(options.userDataPath, 'auth', 'sign-in.bin');

    const bytes = readFileSync(path, 'utf8');

    expect(bytes.startsWith('enc:')).toBe(true);
    const stored = JSON.parse(bytes.slice(4)) as Record<string, unknown>;
    expect(stored).toMatchObject({ v: 2, refreshToken: 'refresh-1', account });
    expect(bytes).not.toContain('access-1');
    /* Owner-only on macOS and Linux. Windows has no POSIX mode: Node reports 0o666 for any writable file
     * (measured on windows-2025, run 43999226627), and the file is fenced by the profile directory's ACL. */
    // oxlint-disable-next-line eslint/no-bitwise -- the POSIX mode is a bit field
    expect(statSync(path).mode & 0o777).toBe(process.platform === 'win32' ? 0o666 : 0o600);
    service.dispose();
  });

  it('should restore by refreshing on the next launch, rotating the stored refresh token', async () => {
    const api = fakeApi();
    const options = baseOptions({ fetch: api.fetch });
    const first = await signedInService(options);
    first.dispose();

    const relaunched = createAuthService(options);
    await relaunched.restore();

    expect(relaunched.token()).toBe('access-2');
    expect(relaunched.principal()).toBe('usr_1');
    const refreshCall = api.calls.find((call) => call.form?.get('grant_type') === 'refresh_token')!;
    expect(refreshCall.form!.get('refresh_token')).toBe('refresh-1');
    expect(readFileSync(join(options.userDataPath, 'auth', 'sign-in.bin'), 'utf8')).toContain('refresh-2');
    relaunched.dispose();
  });

  it('should share one refresh between concurrent callers, so a rotated token is never replayed', async () => {
    const api = fakeApi();
    const service = await signedInService(baseOptions({ fetch: api.fetch }));

    await Promise.all([service.refresh(), service.refresh(), service.refresh()]);

    expect(api.calls.filter((call) => call.form?.get('grant_type') === 'refresh_token')).toHaveLength(1);
    service.dispose();
  });

  it('should refresh at once when the API refuses the current access token, and ignore an older one', async () => {
    const api = fakeApi();
    const service = await signedInService(baseOptions({ fetch: api.fetch }));

    service.reportRejected('not-the-current-token');
    expect(api.calls.filter((call) => call.form?.get('grant_type') === 'refresh_token')).toHaveLength(0);
    service.reportRejected('access-1');

    expect(service.token()).toBeUndefined();
    await vi.waitFor(() => {
      expect(service.token()).toBe('access-2');
    });
    expect(api.calls.filter((call) => call.form?.get('grant_type') === 'refresh_token')).toHaveLength(1);
    service.dispose();
  });

  it('should end a sign-in revoked from the Security list after one refused refresh on its next 401, never looping', async () => {
    const api = fakeApi({ refreshStatus: 400 });
    const options = baseOptions({ fetch: api.fetch });
    const service = await signedInService(options);
    const changes = vi.fn();
    service.onChange(changes);
    const refreshes = (): number => api.calls.filter((call) => call.form?.get('grant_type') === 'refresh_token').length;

    // The family was revoked on the web: the next authenticated request answers 401 with the access token it carried.
    service.reportRejected('access-1');
    await vi.waitFor(() => {
      expect(service.notice()).toEqual({ kind: 'sign-in-ended', email: 'person@example.test' });
    });

    expect(refreshes()).toBe(1);
    expect(service.token()).toBeUndefined();
    expect(service.principal()).toBeUndefined();
    expect(() => statSync(join(options.userDataPath, 'auth', 'sign-in.bin'))).toThrow();
    // Later 401s for the same token, and reads of the token, start nothing more.
    service.reportRejected('access-1');
    expect(service.token()).toBeUndefined();
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    expect(refreshes()).toBe(1);
    expect(changes).toHaveBeenCalled();
    service.dispose();
  });

  it('should forget the sign-in and say so once when the API refuses the refresh', async () => {
    const api = fakeApi({ refreshStatus: 400 });
    const options = baseOptions({ fetch: api.fetch });
    const service = await signedInService(options);

    await service.refresh();

    expect(service.token()).toBeUndefined();
    expect(service.principal()).toBeUndefined();
    expect(service.notice()).toEqual({ kind: 'sign-in-ended', email: 'person@example.test' });
    expect(() => statSync(join(options.userDataPath, 'auth', 'sign-in.bin'))).toThrow();
    service.dispose();
  });

  it('should revoke the sign-in it replaces when the person signs in again', async () => {
    const api = fakeApi();
    const opened: string[] = [];
    const service = createAuthService(
      baseOptions({
        fetch: api.fetch,
        openExternal: async (url) => {
          opened.push(url);
        },
      }),
    );
    const first = await startSignIn(service, opened);
    await browserReturns(first.authorize, { code: 'code-1', state: first.authorize.searchParams.get('state')! });
    await first.settled;

    const second = quiet(service.signIn());
    await vi.waitFor(() => {
      expect(opened).toHaveLength(2);
    });
    const again = new URL(opened[1]!);
    await browserReturns(again, { code: 'code-2', state: again.searchParams.get('state')! });
    await second;

    expect(service.token()).toBe('access-2');
    await vi.waitFor(() => {
      const revocations = api.calls.filter((call) => call.path === '/v1/auth/oauth2/revoke');
      expect(revocations.map((call) => call.form?.get('token'))).toEqual(['access-1', 'refresh-1']);
    });
    service.dispose();
  });

  it('should delete the record first, then revoke the access token before the refresh token', async () => {
    const api = fakeApi();
    const options = baseOptions({ fetch: api.fetch });
    const service = await signedInService(options);

    await service.signOut();

    expect(service.token()).toBeUndefined();
    expect(() => statSync(join(options.userDataPath, 'auth', 'sign-in.bin'))).toThrow();
    const revocations = api.calls.filter((call) => call.path === '/v1/auth/oauth2/revoke');
    expect(revocations.map((call) => call.form?.get('token_type_hint'))).toEqual(['access_token', 'refresh_token']);
    expect(revocations.map((call) => call.form?.get('token'))).toEqual(['access-1', 'refresh-1']);
    expect(revocations.every((call) => call.form?.get('client_id') === desktopClientId)).toBe(true);
    service.dispose();
  });

  it('should keep the sign-in in memory rather than writing plaintext when no keychain exists', async () => {
    const options = baseOptions({
      fetch: fakeApi().fetch,
      safeStorage: { ...fakeSafeStorage(), isEncryptionAvailable: () => false },
    });
    const service = await signedInService(options);

    expect(service.token()).toBe('access-1');
    expect(() => statSync(join(options.userDataPath, 'auth', 'sign-in.bin'))).toThrow();
    service.dispose();
  });

  it('should retire a credential from before the OAuth sign-in once, naming its account, without revoking it', async () => {
    const api = fakeApi();
    const options = baseOptions({ fetch: api.fetch });
    mkdirSync(join(options.userDataPath, 'auth'), { recursive: true });
    writeFileSync(join(options.userDataPath, 'auth', 'session.bin'), 'enc:browser-session-token');
    const service = createAuthService(options);

    await service.restore();

    expect(service.token()).toBeUndefined();
    expect(service.notice()).toEqual({ kind: 'signed-out-by-update', email: 'person@example.test' });
    expect(() => statSync(join(options.userDataPath, 'auth', 'session.bin'))).toThrow();
    expect(api.calls.some((call) => call.path.includes('revoke') || call.path.includes('sign-out'))).toBe(false);
    service.dispose();

    const relaunched = createAuthService(options);
    await relaunched.restore();
    expect(relaunched.notice()).toBeUndefined();
    relaunched.dispose();
  });

  it('should retire a legacy credential even when its account cannot be read', async () => {
    const options = baseOptions({ fetch: vi.fn(async () => new Response('', { status: 401 })) });
    mkdirSync(join(options.userDataPath, 'auth'), { recursive: true });
    writeFileSync(join(options.userDataPath, 'auth', 'session.bin'), 'enc:browser-session-token');
    const service = createAuthService(options);

    await service.restore();

    expect(service.notice()).toEqual({ kind: 'signed-out-by-update' });
    expect(() => statSync(join(options.userDataPath, 'auth', 'session.bin'))).toThrow();
    service.dispose();
  });

  it('should honour a seeded token only in a development build, and never store it', async () => {
    const options = baseOptions({ packaged: false, seededToken: 'seed', fetch: fakeApi().fetch });
    const service = createAuthService(options);

    await service.restore();

    expect(service.token()).toBe('seed');
    expect(() => statSync(join(options.userDataPath, 'auth', 'sign-in.bin'))).toThrow();
    service.dispose();
    const packaged = createAuthService({ ...options, packaged: true });
    await packaged.restore();
    expect(packaged.token()).toBeUndefined();
    packaged.dispose();
  });
});
