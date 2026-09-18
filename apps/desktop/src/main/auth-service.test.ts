import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { createAuthService, setAuthTokenHeader } from '#main/auth-service.js';
import type { AuthServiceOptions, SafeStorageLike } from '#main/auth-service.js';

/* A stand-in for the OS keychain: reversible, and distinguishable from plain
 * text so a test can prove the file on disk is not the token. */
const fakeSafeStorage = (): SafeStorageLike => ({
  isEncryptionAvailable: () => true,
  encryptString: (plainText) => Buffer.from(`enc:${plainText}`, 'utf8'),
  decryptString: (encrypted) => encrypted.toString('utf8').replace(/^enc:/u, ''),
});

const baseOptions = (overrides: Partial<AuthServiceOptions> = {}): AuthServiceOptions => ({
  apiUrl: 'http://localhost:4000',
  frontendUrl: 'http://localhost:3000',
  userDataPath: mkdtempSync(join(tmpdir(), 'tau-auth-')),
  safeStorage: fakeSafeStorage(),
  openExternal: async () => undefined,
  packaged: false,
  signInTimeout: 10_000,
  ...overrides,
});

describe('createAuthService — custody', () => {
  it('writes ciphertext, never the token, and restores it on the next launch', async () => {
    const options = baseOptions();
    const first = createAuthService(options);
    await first.restore();
    expect(first.token()).toBeUndefined();
    first.dispose();

    const service = await signedInService(options);
    const credentialPath = join(options.userDataPath, 'auth', 'session.bin');
    const bytes = readFileSync(credentialPath);
    expect(bytes.toString('utf8')).toBe('enc:bearer-from-verify');
    expect(bytes.toString('utf8')).not.toBe('bearer-from-verify');
    // oxlint-disable-next-line eslint/no-bitwise -- the POSIX mode is a bit field
    expect(statSync(credentialPath).mode & 0o777).toBe(0o600);
    service.dispose();

    const relaunched = createAuthService(options);
    await relaunched.restore();
    expect(relaunched.token()).toBe('bearer-from-verify');
    relaunched.dispose();
  });

  it('keeps the credential in memory rather than writing plaintext when no keychain exists', async () => {
    const options = baseOptions({
      safeStorage: { ...fakeSafeStorage(), isEncryptionAvailable: () => false },
    });
    const service = await signedInService(options);
    expect(service.token()).toBe('bearer-from-verify');
    expect(() => statSync(join(options.userDataPath, 'auth', 'session.bin'))).toThrow();
    service.dispose();
  });
});

describe('createAuthService — the tau://auth/callback handoff', () => {
  it('opens the system browser at the documented sign-in URL, naming no port', async () => {
    const openExternal = vi.fn(async () => undefined);
    const options = baseOptions({ openExternal });
    const service = await signedInService(options);

    const [openedUrl] = openExternal.mock.calls[0] as unknown as [string];
    const opened = new URL(openedUrl);
    expect(opened.origin + opened.pathname).toBe('http://localhost:3000/auth/sign-in');
    const handoff = new URL(opened.searchParams.get('redirectTo') ?? '', 'http://x');
    expect(handoff.pathname).toBe('/auth/desktop');
    /* The deep link replaces the loopback listener, so there is no port to name
     * and no listener for anything on this machine to reach. */
    expect(handoff.searchParams.get('port')).toBeNull();
    /* The web route refuses anything outside this shape before minting. */
    expect(handoff.searchParams.get('state')).toMatch(/^[\w-]{8,128}$/u);
    service.dispose();
  });

  it('refuses a mismatched state without ever presenting the token to the API', async () => {
    const exchange = vi.fn(async () => new Response(undefined, { status: 200 }));
    const service = createAuthService(baseOptions({ fetch: exchange as unknown as typeof globalThis.fetch }));
    /* The failure is captured the moment `signIn` is called: the callback below
     * takes several ticks, and an unobserved rejection in that window is
     * reported as an unhandled error even though the test awaits it. */
    const attempt = capture(service.signIn());
    await service.handleCallback({ oneTimeToken: 'stolen', state: 'not-the-nonce' });

    expect(await attempt).toBeInstanceOf(Error);
    expect(String(await attempt)).toMatch(/state did not match/u);
    expect(exchange).not.toHaveBeenCalled();
    expect(service.token()).toBeUndefined();
    service.dispose();
  });

  it('refuses a callback that arrives with no sign-in pending', async () => {
    const exchange = vi.fn(async () => new Response(undefined, { status: 200 }));
    const service = createAuthService(baseOptions({ fetch: exchange as unknown as typeof globalThis.fetch }));

    await service.handleCallback({ oneTimeToken: 'unsolicited', state: 'aaaaaaaaaa' });

    expect(exchange).not.toHaveBeenCalled();
    expect(service.token()).toBeUndefined();
    service.dispose();
  });

  it('refuses a replay of a callback that already signed in', async () => {
    const opened: string[] = [];
    const service = createAuthService(
      baseOptions({
        openExternal: async (url) => {
          opened.push(url);
        },
        fetch: (async () =>
          new Response(undefined, {
            status: 200,
            headers: { [setAuthTokenHeader]: 'bearer-from-verify' },
          })) as unknown as typeof globalThis.fetch,
      }),
    );
    const attempt = service.signIn();
    const state = pendingState(await waitForUrl(opened));
    await service.handleCallback({ oneTimeToken: 'one-time', state });
    await attempt;
    await service.signOut();

    await service.handleCallback({ oneTimeToken: 'one-time', state });

    expect(service.token()).toBeUndefined();
    service.dispose();
  });

  it('refuses a callback that arrives after the attempt expired', async () => {
    const exchange = vi.fn(async () => new Response(undefined, { status: 200 }));
    const opened: string[] = [];
    const service = createAuthService(
      baseOptions({
        signInTimeout: 10,
        openExternal: async (url) => {
          opened.push(url);
        },
        fetch: exchange as unknown as typeof globalThis.fetch,
      }),
    );
    const attempt = capture(service.signIn());
    const state = pendingState(await waitForUrl(opened));

    expect(String(await attempt)).toMatch(/timed out/u);
    await service.handleCallback({ oneTimeToken: 'late', state });

    expect(exchange).not.toHaveBeenCalled();
    expect(service.token()).toBeUndefined();
    service.dispose();
  });

  it('fails when the verify response carries no set-auth-token header', async () => {
    const opened: string[] = [];
    const service = createAuthService(
      baseOptions({
        openExternal: async (url) => {
          opened.push(url);
        },
        fetch: (async () => new Response(undefined, { status: 200 })) as unknown as typeof globalThis.fetch,
      }),
    );
    const attempt = capture(service.signIn());
    await service.handleCallback({ oneTimeToken: 't', state: pendingState(await waitForUrl(opened)) });

    expect(await attempt).toBeInstanceOf(Error);
    expect(String(await attempt)).toContain(setAuthTokenHeader);
    service.dispose();
  });
});

describe('createAuthService — refresh and sign-out', () => {
  it('re-persists and notifies whenever a response carries a refreshed token', async () => {
    const options = baseOptions();
    const service = await signedInService(options);
    const changed = vi.fn();
    service.onChange(changed);

    const refreshed = createAuthService({
      ...options,
      fetch: (async () =>
        new Response(undefined, {
          status: 200,
          headers: { [setAuthTokenHeader]: 'rotated-token' },
        })) as unknown as typeof globalThis.fetch,
    });
    await refreshed.restore();
    const notified = vi.fn();
    refreshed.onChange(notified);
    await refreshed.refresh();

    expect(refreshed.token()).toBe('rotated-token');
    expect(notified).toHaveBeenCalled();
    expect(readFileSync(join(options.userDataPath, 'auth', 'session.bin'), 'utf8')).toBe('enc:rotated-token');
    service.dispose();
    refreshed.dispose();
  });

  it('drops the credential on 401 and surfaces signed-out', async () => {
    const options = baseOptions();
    const service = await signedInService(options);
    service.dispose();

    const expired = createAuthService({
      ...options,
      fetch: (async () => new Response(undefined, { status: 401 })) as unknown as typeof globalThis.fetch,
    });
    await expired.restore();
    const notified = vi.fn();
    expired.onChange(notified);
    await expired.refresh();

    expect(expired.token()).toBeUndefined();
    expect(notified).toHaveBeenCalled();
    expect(() => statSync(join(options.userDataPath, 'auth', 'session.bin'))).toThrow();
    expired.dispose();
  });

  it('signOut removes the stored credential', async () => {
    const options = baseOptions();
    const service = await signedInService(options);
    await service.signOut();
    expect(service.token()).toBeUndefined();
    expect(() => statSync(join(options.userDataPath, 'auth', 'session.bin'))).toThrow();
    service.dispose();
  });
});

describe('createAuthService — A7 seeded token', () => {
  it('is honoured in a development build and never reaches disk', async () => {
    const options = baseOptions({ seededToken: 'e2e-token' });
    const service = createAuthService(options);
    await service.restore();
    expect(service.token()).toBe('e2e-token');
    expect(() => statSync(join(options.userDataPath, 'auth', 'session.bin'))).toThrow();
    service.dispose();
  });

  it('is ignored in a packaged build', async () => {
    const service = createAuthService(baseOptions({ seededToken: 'e2e-token', packaged: true }));
    await service.restore();
    expect(service.token()).toBeUndefined();
    service.dispose();
  });
});

/* --- helpers ------------------------------------------------------------ */

/**
 * Observe a rejection immediately.
 *
 * The browser round trip a test drives afterwards takes several ticks, and an
 * unobserved rejection in that window is reported as an unhandled error even
 * though the test does await it.
 *
 * @param attempt - The in-flight sign-in.
 * @returns The rejection reason, or `undefined` on success.
 */
const capture = async (attempt: Promise<void>): Promise<unknown> => {
  try {
    await attempt;
    return undefined;
  } catch (error) {
    return error;
  }
};

/** Poll until `signIn` has opened the system browser. */
const waitForUrl = async (opened: readonly string[]): Promise<string> => {
  for (let attempt = 0; attempt < 200; attempt++) {
    const url = opened[0];
    if (url !== undefined) {
      return url;
    }
    // oxlint-disable-next-line eslint/no-await-in-loop -- deliberate poll
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 5);
    });
  }
  throw new Error('The sign-in attempt never opened a browser URL.');
};

/** The nonce main is waiting for, read back out of the URL it opened. */
const pendingState = (openedUrl: string): string => {
  const handoff = new URL(new URL(openedUrl).searchParams.get('redirectTo') ?? '', 'http://x');
  return handoff.searchParams.get('state') ?? '';
};

/** Run one complete sign-in against a stubbed verify endpoint. */
const signedInService = async (options: AuthServiceOptions) => {
  const opened: string[] = [];
  const service = createAuthService({
    ...options,
    openExternal: async (url) => {
      opened.push(url);
      await options.openExternal(url);
    },
    fetch: (async (input: string) => {
      expect(input).toBe('http://localhost:4000/v1/auth/one-time-token/verify');
      return new Response(undefined, { status: 200, headers: { [setAuthTokenHeader]: 'bearer-from-verify' } });
    }) as unknown as typeof globalThis.fetch,
  });
  const attempt = service.signIn();
  await service.handleCallback({ oneTimeToken: 'one-time', state: pendingState(await waitForUrl(opened)) });
  await attempt;
  return service;
};
