/**
 * Native sign-in, credential custody, and refresh (work items A3 and A7).
 *
 * The whole exchange happens in main. better-auth's OAuth callback carries no
 * credential, so a token-minting hop is mandatory: the system browser lands on
 * the web app's `/auth/desktop` route, which mints a one-time token from the
 * *browser's* session and hands it to a loopback listener here. Main then
 * redeems it cookie-lessly — better-auth short-circuits its origin check for
 * requests with no cookie, and Tau's CORS validator allows a missing `Origin`,
 * so no `trustedOrigins` change is needed and the renderer never sees a token.
 *
 * Nothing in this module imports `electron`: `safeStorage`, the external-URL
 * opener, and `fetch` all arrive as options, which is what makes the state
 * machine testable without a running app.
 */

import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Path the web handoff page navigates to on the loopback listener. */
export const loopbackCallbackPath = '/callback';
/** Query parameter names the handoff page sends. */
export const handoffParameterNames = { token: 'ott', state: 'state' } as const;
/** Response header better-auth's bearer plugin emits with a fresh session token. */
export const setAuthTokenHeader = 'set-auth-token';

/** `safeStorage`, narrowed to what custody needs. */
export type SafeStorageLike = {
  isEncryptionAvailable(): boolean;
  /* Buffer, not Uint8Array: this mirrors Electron's own `safeStorage`
   * signatures, and narrowing them would make the real module unassignable. */
  // oxlint-disable-next-line typescript/no-restricted-types -- Electron's API is Buffer-typed
  encryptString(plainText: string): Buffer;
  // oxlint-disable-next-line typescript/no-restricted-types -- Electron's API is Buffer-typed
  decryptString(encrypted: Buffer): string;
};

/** Options for {@link createAuthService}. */
export type AuthServiceOptions = {
  /** `TAU_API_URL`, without a trailing slash. */
  readonly apiUrl: string;
  /** `TAU_FRONTEND_URL`, without a trailing slash. */
  readonly frontendUrl: string;
  /** `app.getPath('userData')`. */
  readonly userDataPath: string;
  /** Electron's `safeStorage`. */
  readonly safeStorage: SafeStorageLike;
  /** Opens a URL in the system browser (`shell.openExternal`). */
  readonly openExternal: (url: string) => Promise<void>;
  /** `app.isPackaged` — gates the A7 seeded-token path. */
  readonly packaged: boolean;
  /** Test-only seed honoured in non-packaged builds (A7). */
  readonly seededToken?: string | undefined;
  /** Injected for tests. */
  readonly fetch?: typeof globalThis.fetch;
  /** Diagnostics sink. */
  readonly log?: (level: 'info' | 'warn' | 'error', event: string, detail?: unknown) => void;
  /** Interactive sign-in deadline. Milliseconds. Defaults to five minutes. */
  readonly signInTimeout?: number;
};

/** The credential surface main hands to header injection and the services utility. */
export type AuthService = {
  /** Current bearer token, or `undefined` while signed out. */
  token(): string | undefined;
  /** Load any persisted credential. Call once at startup. */
  restore(): Promise<void>;
  /** Open the system browser and settle when a session arrives (or the attempt fails). */
  signIn(): Promise<void>;
  /** Drop the stored credential. */
  signOut(): Promise<void>;
  /** Re-validate the session, re-persisting a refreshed token and dropping on 401. */
  refresh(): Promise<void>;
  /** Subscribe to sign-in, sign-out, and refresh. Returns an unsubscribe function. */
  onChange(listener: () => void): () => void;
  /** Stop the refresh timer and any in-flight loopback listener. */
  dispose(): void;
};

const nonce = (): string => randomBytes(24).toString('base64url');

const constantTimeEquals = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

const callbackBody = (message: string): string =>
  `<!doctype html><meta charset="utf-8"><title>Tau</title><body style="font:16px system-ui;padding:3rem">${message}</body>`;

/* Sessions idle out after seven days and the bearer plugin re-issues on a 24 h
 * `updateAge`, so an hourly probe is the cheapest cadence that still notices a
 * revocation the same working day. */
/** Milliseconds. */
const refreshInterval = 60 * 60 * 1000;

/**
 * Open the desktop credential store and sign-in flow.
 *
 * @param options - API/frontend URLs, custody dependencies, and injected seams.
 * @returns The credential surface.
 */
export const createAuthService = (options: AuthServiceOptions): AuthService => {
  const doFetch = options.fetch ?? globalThis.fetch;
  const log = options.log ?? ((): void => undefined);
  const directory = join(options.userDataPath, 'auth');
  const credentialPath = join(directory, 'session.bin');
  const listeners = new Set<() => void>();
  /* A7: the seed is honoured only in a development build, and is never written
   * to disk — an e2e run must not leave a credential behind in userData. */
  const seeded = options.packaged ? undefined : options.seededToken;
  let token: string | undefined = seeded;
  let server: Server | undefined;
  let timer: NodeJS.Timeout | undefined;

  const notify = (): void => {
    for (const listener of listeners) {
      try {
        listener();
      } catch (error) {
        log('error', 'auth.listener-failed', error);
      }
    }
  };

  const persist = async (next: string): Promise<void> => {
    token = next;
    if (seeded !== undefined) {
      return;
    }
    if (!options.safeStorage.isEncryptionAvailable()) {
      /* No OS keychain (a headless Linux session, say). Keep the credential in
       * memory for this run rather than writing a plaintext token to disk. */
      log('warn', 'auth.safe-storage-unavailable');
      return;
    }
    const temporary = join(directory, `.session-${randomUUID()}.tmp`);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(temporary, options.safeStorage.encryptString(next), { mode: 0o600, flag: 'wx' });
    await chmod(temporary, 0o600);
    await rename(temporary, credentialPath);
    await chmod(credentialPath, 0o600);
  };

  const drop = async (): Promise<void> => {
    token = undefined;
    try {
      await unlink(credentialPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        log('error', 'auth.drop-failed', error);
      }
    }
  };

  /* Reads whatever `set-auth-token` a response carries: the bearer plugin emits
   * it on the one-time-token verify *and* on any refreshed `get-session`, so one
   * helper covers both hops. */
  const adoptRefreshedToken = async (response: Response): Promise<boolean> => {
    const refreshed = response.headers.get(setAuthTokenHeader);
    if (!refreshed) {
      return false;
    }
    await persist(refreshed);
    return true;
  };

  const exchange = async (oneTimeToken: string): Promise<void> => {
    const response = await doFetch(`${options.apiUrl}/v1/auth/one-time-token/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: oneTimeToken }),
    });
    if (!response.ok) {
      throw new Error(`One-time-token verification failed with HTTP ${String(response.status)}.`);
    }
    if (!(await adoptRefreshedToken(response))) {
      throw new Error(`One-time-token verification returned no ${setAuthTokenHeader} header.`);
    }
  };

  const closeServer = (): void => {
    server?.close();
    server = undefined;
  };

  const refresh = async (): Promise<void> => {
    if (token === undefined) {
      return;
    }
    const response = await doFetch(`${options.apiUrl}/v1/auth/get-session`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (response.status === 401) {
      log('info', 'auth.session-expired');
      await drop();
      notify();
      return;
    }
    if (await adoptRefreshedToken(response)) {
      log('info', 'auth.token-refreshed');
      notify();
    }
  };

  const startRefreshTimer = (): void => {
    if (timer !== undefined) {
      return;
    }
    timer = setInterval(() => {
      // async-iife: bootstrap — an interval cannot await, and a failed probe is a
      // logged warning rather than something a caller could act on.
      void (async () => {
        try {
          await refresh();
        } catch (error) {
          log('warn', 'auth.refresh-failed', error);
        }
      })();
    }, refreshInterval);
    timer.unref();
  };

  return {
    token: () => token,
    refresh,

    async restore() {
      startRefreshTimer();
      if (token !== undefined) {
        log('info', 'auth.seeded-token-accepted');
        notify();
        return;
      }
      try {
        const encrypted = await readFile(credentialPath);
        token = options.safeStorage.decryptString(encrypted);
        log('info', 'auth.restored');
        notify();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          /* A credential that will not decrypt (new OS user, rotated keychain)
           * is unusable; remove it rather than failing every launch. */
          log('warn', 'auth.restore-failed', error);
          await drop();
        }
      }
    },

    async signIn() {
      if (server) {
        throw new Error('A desktop sign-in is already in progress.');
      }
      const state = nonce();
      const settled = Promise.withResolvers<void>();
      /* An async request handler: Node ignores the returned promise, so every
       * path settles the deferred itself and nothing escapes as an unhandled
       * rejection. */
      const listener = createServer(async (request, response) => {
        const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
        if (requestUrl.pathname !== loopbackCallbackPath) {
          response.writeHead(404).end();
          return;
        }
        const received = requestUrl.searchParams.get(handoffParameterNames.state) ?? '';
        const oneTimeToken = requestUrl.searchParams.get(handoffParameterNames.token) ?? '';
        if (!constantTimeEquals(received, state)) {
          /* A mismatched state is a cross-site login attempt, not a user error:
           * refuse without ever presenting the token to the API. */
          log('error', 'auth.state-mismatch');
          response.writeHead(400, { 'content-type': 'text/html' }).end(callbackBody('Sign-in could not be verified.'));
          settled.reject(new Error('Desktop sign-in state did not match.'));
          return;
        }
        try {
          await exchange(oneTimeToken);
          response
            .writeHead(200, { 'content-type': 'text/html' })
            .end(callbackBody('Signed in. You can close this tab and return to Tau.'));
          log('info', 'auth.signed-in');
          notify();
          settled.resolve();
        } catch (error) {
          response.writeHead(500, { 'content-type': 'text/html' }).end(callbackBody('Sign-in failed.'));
          settled.reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
      server = listener;

      const signInDeadline = setTimeout(
        () => {
          settled.reject(new Error('Desktop sign-in timed out.'));
        },
        options.signInTimeout ?? 5 * 60 * 1000,
      );

      try {
        await new Promise<void>((resolve, reject) => {
          listener.once('error', reject);
          listener.listen(0, '127.0.0.1', resolve);
        });
        const address = listener.address();
        if (address === null || typeof address === 'string') {
          throw new Error('Loopback sign-in listener did not bind a port.');
        }
        /* The redirect target is nested inside `redirectTo`, so it is encoded
         * once as a whole — the sign-in page hands it back verbatim after auth. */
        const handoff = `/auth/desktop?port=${String(address.port)}&state=${state}`;
        await options.openExternal(`${options.frontendUrl}/auth/sign-in?redirectTo=${encodeURIComponent(handoff)}`);
        await settled.promise;
      } finally {
        clearTimeout(signInDeadline);
        closeServer();
      }
    },

    async signOut() {
      await drop();
      log('info', 'auth.signed-out');
      notify();
    },

    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    dispose() {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
      listeners.clear();
      closeServer();
    },
  };
};
