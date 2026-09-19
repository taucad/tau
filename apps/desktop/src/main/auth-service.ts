/**
 * Native sign-in, credential custody, and refresh (work items A3 and A7).
 *
 * The whole exchange happens in main. better-auth's OAuth callback carries no
 * credential, so a token-minting hop is mandatory: the system browser lands on
 * the web app's `/auth/desktop` route, which mints a one-time token from the
 * *browser's* session and hands it back through a `tau://auth/callback` deep
 * link (R4, ruling D4). Main then redeems it cookie-lessly — better-auth
 * short-circuits its origin check for requests with no cookie, and Tau's CORS
 * validator allows a missing `Origin` — so no `trustedOrigins` change is needed
 * and the renderer never sees a token.
 *
 * The deep link replaces an ephemeral loopback listener, which meant every
 * sign-in opened a port on the machine that any local process could reach, and
 * handed the browser an `http://127.0.0.1` navigation to make.
 *
 * Nothing in this module imports `electron`: `safeStorage`, the external-URL
 * opener, and `fetch` all arrive as options, which is what makes the state
 * machine testable without a running app.
 */

import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Response header better-auth's bearer plugin emits with a fresh session token. */
export const setAuthTokenHeader = 'set-auth-token';

/** The parsed `tau://auth/callback` payload main hands back. */
export type AuthCallback = {
  /** Single-use token the browser minted from its own session. */
  readonly oneTimeToken: string;
  /** Nonce this service generated for the attempt in flight. */
  readonly state: string;
};

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
  /** Redeem a `tau://auth/callback` link against the sign-in in flight, if any. */
  handleCallback(callback: AuthCallback): Promise<void>;
  /** Drop the stored credential. */
  signOut(): Promise<void>;
  /** Re-validate the session, re-persisting a refreshed token and dropping on 401. */
  refresh(): Promise<void>;
  /** Subscribe to sign-in, sign-out, and refresh. Returns an unsubscribe function. */
  onChange(listener: () => void): () => void;
  /** Stop the refresh timer and abandon any sign-in in flight. */
  dispose(): void;
};

/** One interactive sign-in waiting for its callback. */
type PendingSignIn = {
  readonly state: string;
  readonly settled: PromiseWithResolvers<void>;
  readonly deadline: NodeJS.Timeout;
};

const nonce = (): string => randomBytes(24).toString('base64url');

const constantTimeEquals = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

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
  let pending: PendingSignIn | undefined;
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

  /* One attempt, one outcome: whatever settles it also stops the clock and
   * clears the nonce, which is what makes the callback single-use. */
  const settlePending = (error?: Error): void => {
    const current = pending;
    if (current === undefined) {
      return;
    }
    pending = undefined;
    clearTimeout(current.deadline);
    if (error === undefined) {
      current.settled.resolve();
    } else {
      current.settled.reject(error);
    }
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
      if (pending !== undefined) {
        throw new Error('A desktop sign-in is already in progress.');
      }
      const state = nonce();
      const deadline = setTimeout(
        () => {
          settlePending(new Error('Desktop sign-in timed out.'));
        },
        options.signInTimeout ?? 5 * 60 * 1000,
      );
      deadline.unref();
      const settled = Promise.withResolvers<void>();
      pending = { state, settled, deadline };
      try {
        /* The redirect target is nested inside `redirectTo`, so it is encoded
         * once as a whole — the sign-in page hands it back verbatim after auth. */
        const handoff = `/auth/desktop?state=${state}`;
        await options.openExternal(`${options.frontendUrl}/auth/sign-in?redirectTo=${encodeURIComponent(handoff)}`);
      } catch (error) {
        settlePending(error instanceof Error ? error : new Error(String(error)));
      }
      await settled.promise;
    },

    async handleCallback({ oneTimeToken, state }) {
      const current = pending;
      if (current === undefined) {
        /* Nobody asked for this: a replay of a link already redeemed, one that
         * arrived after the attempt expired, or one another application on the
         * machine emitted. The scheme proves nothing, so silence is the answer. */
        log('warn', 'auth.callback-unexpected');
        return;
      }
      if (!constantTimeEquals(state, current.state)) {
        /* A mismatched state is a cross-site login attempt, not a user error:
         * refuse without ever presenting the token to the API. The attempt in
         * flight is left alone — anything on the machine can emit this link, and
         * settling here would let it cancel the person's real sign-in. The
         * deadline already bounds the attempt. */
        log('error', 'auth.state-mismatch');
        return;
      }
      try {
        await exchange(oneTimeToken);
        log('info', 'auth.signed-in');
        notify();
        settlePending();
      } catch (error) {
        settlePending(error instanceof Error ? error : new Error(String(error)));
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
      settlePending(new Error('The desktop sign-in was abandoned.'));
    },
  };
};
