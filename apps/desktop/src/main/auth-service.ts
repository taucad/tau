/* eslint-disable @typescript-eslint/naming-convention -- OAuth wire parameters (RFC 6749, 7009, 7636) keep their spelling */
/**
 * Native sign-in, credential custody and refresh: Tau Desktop as a public native OAuth client (RFC 8252) of the API's
 * `@better-auth/oauth-provider` (desktop sign-in execution plan DSI-4; operator ruling R1 of 2026-11-27).
 *
 * Sign-in opens the system browser at the provider's authorization endpoint with PKCE S256 and `prompt=consent`. The
 * redirect comes back to a loopback listener this module opens on `127.0.0.1` for that one attempt, on an ephemeral
 * port and a random path, and closes when the attempt ends (RFC 8252 §7.3, §8.3; OAuth 2.1 §8.5.4). The listener
 * exchanges the code with the verifier only this process holds, then sends the tab to the web app's outcome page, so
 * neither side waits on the other. No listener exists outside an attempt.
 *
 * Custody: the access token (one hour) lives in memory only; the rotating refresh token and the account it belongs
 * to are stored together, encrypted with `safeStorage`, and never reach the renderer. Sign-out deletes the record
 * first, then revokes the access and refresh tokens (RFC 7009).
 *
 * Nothing in this module imports `electron`: `safeStorage`, the external-URL opener and `fetch` arrive as options,
 * which is what makes it testable without a running app.
 */

import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';

/** The public client the API seeds for Tau Desktop, one row per environment. */
export const desktopClientId = 'tau-desktop';

/** What the desktop asks for: identity, and `offline_access` for a refresh token. */
const desktopScope = 'openid profile email offline_access';

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

/** The account a sign-in holds, as `GET /v1/account/session` names it. */
export type DesktopAccount = {
  readonly id: string;
  readonly name?: string;
  readonly email?: string;
};

/** Something the person should be told without having asked: the update signed them out, or the sign-in ended. */
export type AuthNotice =
  | { readonly kind: 'signed-out-by-update'; readonly email?: string }
  | { readonly kind: 'sign-in-ended'; readonly email?: string };

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
  /** `app.isPackaged` — gates the seeded-token path. */
  readonly packaged: boolean;
  /** Test-only access token honoured in non-packaged builds (A7). */
  readonly seededToken?: string | undefined;
  /** Injected for tests. */
  readonly fetch?: typeof globalThis.fetch;
  /** Diagnostics sink. Never given a token, a code or a verifier. */
  readonly log?: (level: 'info' | 'warn' | 'error', event: string, detail?: unknown) => void;
  /** How long one sign-in attempt waits for the browser. Milliseconds. Defaults to ten minutes. */
  readonly signInTimeout?: number;
};

/** What the window shows while an attempt is open. Never a token, a code or a verifier. */
export type SignInAttempt = {
  /** The authorization URL, for Copy link. */
  readonly url: string;
  /** `waiting` for the browser, or `finishing` once it came back with a code. */
  readonly phase: 'waiting' | 'finishing';
  /** The system browser would not open. */
  readonly browserFailed: boolean;
};

/** How a sign-in is asked for: the usual consent, or a sign-in as another account first. */
export type SignInMode = 'consent' | 'different-account';

/** The credential surface main hands to header injection and the services utility. */
export type AuthService = {
  /** The current access token, or `undefined` while signed out or between refreshes. */
  token(): string | undefined;
  /** The signed-in account's user id; `undefined` while signed out. */
  principal(): string | undefined;
  /** The signed-in account's display name; `undefined` when it has none. */
  principalName(): string | undefined;
  /** The signed-in account's email address; `undefined` while signed out. */
  principalEmail(): string | undefined;
  /** When the sign-in ends however often it refreshes (90 days after it began); `undefined` while signed out. */
  signInEndsAt(): Date | undefined;
  /** The attempt in flight, for the waiting window and its Copy link; `undefined` when none is. */
  signInAttempt(): SignInAttempt | undefined;
  /** A notice the renderer should show once, then {@link AuthService.clearNotice}. */
  notice(): AuthNotice | undefined;
  /** Forget the notice once shown. */
  clearNotice(): void;
  /** Load any stored sign-in, or retire a credential from before the OAuth sign-in. Call once at startup. */
  restore(): Promise<void>;
  /** Open the system browser and settle when the sign-in arrives, is refused, or the attempt ends. */
  signIn(mode?: SignInMode): Promise<void>;
  /** End the attempt in flight, if any. */
  cancelSignIn(): void;
  /** Sign out: forget the sign-in here, then revoke it at the API. */
  signOut(): Promise<void>;
  /** Exchange the refresh token for a new pair now. */
  refresh(): Promise<void>;
  /**
   * The API refused a request that carried `token` (401). When it is the current access token, refresh now: a browser
   * sign-out revokes the access tokens its session approved while the refresh token lives on (E12).
   */
  reportRejected(token: string): void;
  /** Subscribe to sign-in, sign-out, refresh and notices. Returns an unsubscribe function. */
  onChange(listener: () => void): () => void;
  /** Stop timers and abandon any sign-in in flight. */
  dispose(): void;
};

/** Why an attempt ended without a sign-in. */
export class SignInEndedError extends Error {
  public readonly reason: 'canceled' | 'expired' | 'error';

  public constructor(reason: 'canceled' | 'expired' | 'error') {
    super(`Desktop sign-in ended: ${reason}.`);
    this.reason = reason;
    this.name = 'SignInEndedError';
  }
}

/** The stored sign-in. Version 2: version 1 was the browser's own session token as bare ciphertext. */
type StoredSignIn = {
  readonly v: 2;
  readonly refreshToken: string;
  readonly account: DesktopAccount;
  /** Milliseconds since the epoch. */
  readonly startedAt: number;
};

type TokenResponse = {
  readonly access_token?: unknown;
  readonly refresh_token?: unknown;
  readonly expires_in?: unknown;
};

/** One attempt waiting for the browser. */
type PendingSignIn = {
  readonly state: string;
  readonly settled: PromiseWithResolvers<void>;
  readonly deadline: NodeJS.Timeout;
  readonly server: Server;
  readonly url: string;
  /** The browser came back with a code and main is exchanging it. */
  finishing: boolean;
  /** The system browser would not open; Copy link can still finish the attempt. */
  browserFailed: boolean;
};

/** Milliseconds. The sign-in's absolute cap, matching the API's (ruling D3=B, Principal P1). */
const signInLifetime = 90 * 24 * 60 * 60 * 1000;

/** Milliseconds before an access token's expiry at which it is refreshed. */
const refreshLead = 5 * 60 * 1000;

/** Milliseconds a failed refresh waits before it is tried again (network trouble, not a refusal). */
const refreshRetry = 60 * 1000;

const randomToken = (bytes: number): string => randomBytes(bytes).toString('base64url');

const constantTimeEquals = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

const isStoredSignIn = (value: unknown): value is StoredSignIn => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const account: unknown = Reflect.get(value, 'account');
  return (
    Reflect.get(value, 'v') === 2 &&
    typeof Reflect.get(value, 'refreshToken') === 'string' &&
    typeof Reflect.get(value, 'startedAt') === 'number' &&
    typeof account === 'object' &&
    account !== null &&
    typeof Reflect.get(account, 'id') === 'string'
  );
};

/** The account `GET /v1/account/session` (or a legacy `get-session`) names. */
const accountOf = async (response: Response): Promise<DesktopAccount | undefined> => {
  try {
    const body: unknown = await response.json();
    const user: unknown = typeof body === 'object' && body !== null ? Reflect.get(body, 'user') : undefined;
    if (typeof user !== 'object' || user === null) {
      return undefined;
    }
    const id: unknown = Reflect.get(user, 'id');
    const name: unknown = Reflect.get(user, 'name');
    const email: unknown = Reflect.get(user, 'email');
    if (typeof id !== 'string') {
      return undefined;
    }
    return {
      id,
      ...(typeof name === 'string' && name !== '' ? { name } : {}),
      ...(typeof email === 'string' && email !== '' ? { email } : {}),
    };
  } catch {
    return undefined;
  }
};

/**
 * Open the desktop credential store and sign-in flow.
 *
 * @param options - API and frontend URLs, custody dependencies and injected seams.
 * @returns The credential surface.
 */
export const createAuthService = (options: AuthServiceOptions): AuthService => {
  const doFetch = options.fetch ?? globalThis.fetch;
  const log = options.log ?? ((): void => undefined);
  const directory = join(options.userDataPath, 'auth');
  const credentialPath = join(directory, 'sign-in.bin');
  /** The browser-session token the one-time-token sign-in stored, retired on the first launch after the update. */
  const legacyCredentialPath = join(directory, 'session.bin');
  const listeners = new Set<() => void>();
  /* A7: the seed is honoured only in a development build, and is never written to disk. */
  const seeded = options.packaged ? undefined : options.seededToken;
  let accessToken: string | undefined = seeded;
  let accessExpiresAt = Number.POSITIVE_INFINITY;
  let stored: StoredSignIn | undefined;
  let pending: PendingSignIn | undefined;
  let refreshTimer: NodeJS.Timeout | undefined;
  let refreshing: Promise<void> | undefined;
  let currentNotice: AuthNotice | undefined;
  let disposed = false;

  const notify = (): void => {
    for (const listener of listeners) {
      try {
        listener();
      } catch (error) {
        log('error', 'auth.listener-failed', error);
      }
    }
  };

  const persist = async (next: StoredSignIn): Promise<void> => {
    stored = next;
    if (seeded !== undefined) {
      return;
    }
    if (!options.safeStorage.isEncryptionAvailable()) {
      /* No OS keychain (a headless Linux session, say): keep the sign-in for this run rather than writing a
       * plaintext token to disk. */
      log('warn', 'auth.safe-storage-unavailable');
      return;
    }
    const temporary = join(directory, `.sign-in-${randomUUID()}.tmp`);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(temporary, options.safeStorage.encryptString(JSON.stringify(next)), { mode: 0o600, flag: 'wx' });
    await chmod(temporary, 0o600);
    await rename(temporary, credentialPath);
    await chmod(credentialPath, 0o600);
  };

  const removeFile = async (path: string): Promise<void> => {
    try {
      await unlink(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        log('error', 'auth.remove-failed', error);
      }
    }
  };

  const clearRefreshTimer = (): void => {
    if (refreshTimer !== undefined) {
      clearTimeout(refreshTimer);
      refreshTimer = undefined;
    }
  };

  /** Forget the sign-in here. Answers what was held, for a revocation the caller may send. */
  const forget = async (): Promise<{ access?: string; refresh?: string }> => {
    const held = { access: accessToken, refresh: stored?.refreshToken };
    accessToken = undefined;
    accessExpiresAt = Number.POSITIVE_INFINITY;
    stored = undefined;
    clearRefreshTimer();
    await removeFile(credentialPath);
    return held;
  };

  const scheduleRefresh = (refreshDelay: number): void => {
    clearRefreshTimer();
    if (disposed) {
      return;
    }
    refreshTimer = setTimeout(
      () => {
        // async-iife: timer callback — a refresh failure is logged and retried, nothing awaits it.
        void runRefresh();
      },
      Math.max(0, refreshDelay),
    );
    refreshTimer.unref();
  };

  const postForm = async (path: string, form: Record<string, string>): Promise<Response> =>
    doFetch(`${options.apiUrl}/v1/auth${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams(form).toString(),
    });

  const adoptTokens = async (body: TokenResponse, base: Omit<StoredSignIn, 'refreshToken' | 'v'>): Promise<void> => {
    if (typeof body.access_token !== 'string' || typeof body.refresh_token !== 'string') {
      throw new TypeError('The token endpoint answered without an access and a refresh token.');
    }
    const lifetimeSeconds = typeof body.expires_in === 'number' ? body.expires_in : 3600;
    accessToken = body.access_token;
    accessExpiresAt = Date.now() + lifetimeSeconds * 1000;
    await persist({ v: 2, refreshToken: body.refresh_token, account: base.account, startedAt: base.startedAt });
    scheduleRefresh(lifetimeSeconds * 1000 - refreshLead);
  };

  /** The sign-in ended at the API (revoked, idle 30 days, or past 90 days): forget it and say so once. */
  const signInEnded = async (): Promise<void> => {
    const email = stored?.account.email;
    await forget();
    currentNotice = { kind: 'sign-in-ended', ...(email === undefined ? {} : { email }) };
    log('info', 'auth.sign-in-ended');
    notify();
  };

  const doRefresh = async (): Promise<void> => {
    const current = stored;
    if (current === undefined) {
      return;
    }
    if (Date.now() - current.startedAt >= signInLifetime) {
      await signInEnded();
      return;
    }
    const response = await postForm('/oauth2/token', {
      grant_type: 'refresh_token',
      refresh_token: current.refreshToken,
      client_id: desktopClientId,
    });
    if (response.status === 400 || response.status === 401) {
      await signInEnded();
      return;
    }
    if (!response.ok) {
      throw new Error(`Refresh failed with HTTP ${String(response.status)}.`);
    }
    const body = (await response.json()) as TokenResponse;
    await adoptTokens(body, current);
    log('info', 'auth.token-refreshed');
    notify();
  };

  /** One refresh at a time: concurrent callers share the one in flight, so a rotated token is never replayed. */
  const runRefresh = async (): Promise<void> => {
    refreshing ??= (async () => {
      try {
        await doRefresh();
      } catch (error) {
        log('warn', 'auth.refresh-failed', error);
        if (stored !== undefined) {
          scheduleRefresh(refreshRetry);
        }
      } finally {
        refreshing = undefined;
      }
    })();
    return refreshing;
  };

  const lookUpAccount = async (token: string): Promise<DesktopAccount | undefined> => {
    const response = await doFetch(`${options.apiUrl}/v1/account/session`, {
      headers: { authorization: `Bearer ${token}` },
    });
    return response.ok ? accountOf(response) : undefined;
  };

  /** A credential from before the OAuth sign-in: learn whose it was, delete it, and ask for a new sign-in (A9). */
  const retireLegacyCredential = async (): Promise<boolean> => {
    let encrypted: Awaited<ReturnType<typeof readFile>>;
    try {
      encrypted = await readFile(legacyCredentialPath);
    } catch {
      return false;
    }
    let email: string | undefined;
    try {
      const legacyToken = options.safeStorage.decryptString(encrypted);
      const response = await doFetch(`${options.apiUrl}/v1/auth/get-session`, {
        headers: { authorization: `Bearer ${legacyToken}` },
      });
      const legacyAccount = response.ok ? await accountOf(response) : undefined;
      email = legacyAccount?.email;
    } catch (error) {
      log('warn', 'auth.legacy-read-failed', error);
    }
    // Deleted without revoking: it was the browser's own session, which the browser still uses.
    await removeFile(legacyCredentialPath);
    currentNotice = { kind: 'signed-out-by-update', ...(email === undefined ? {} : { email }) };
    log('info', 'auth.legacy-credential-retired');
    return true;
  };

  /* One attempt, one outcome: whatever settles it also closes the listener and stops the clock. */
  const settlePending = (error?: Error): void => {
    const current = pending;
    if (current === undefined) {
      return;
    }
    pending = undefined;
    clearTimeout(current.deadline);
    current.server.close();
    current.server.closeAllConnections();
    if (error === undefined) {
      current.settled.resolve();
    } else {
      current.settled.reject(error);
    }
  };

  const resultUrl = (result: 'signed-in' | 'canceled' | 'expired' | 'error'): string =>
    result === 'signed-in'
      ? `${options.frontendUrl}/auth/desktop?result=signed-in`
      : `${options.frontendUrl}/auth/desktop?result=failed&reason=${result}`;

  const redirect = (response: ServerResponse, location: string): void => {
    response.writeHead(302, { location, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
    response.end();
  };

  /** The code exchange and the account lookup, as one step: token and identity change together. */
  /** Revoke a sign-in this desktop no longer holds. Best effort: the API ends it anyway at its cap. */
  const revoke = async (held: { access?: string; refresh?: string }): Promise<void> => {
    // Access first: revoking the refresh token leaves its access token live (spike S10).
    for (const [token, hint] of [
      [held.access, 'access_token'],
      [held.refresh, 'refresh_token'],
    ] as const) {
      if (token === undefined || token === seeded) {
        continue;
      }
      try {
        // oxlint-disable-next-line no-await-in-loop -- the order matters, one after the other
        await postForm('/oauth2/revoke', { token, token_type_hint: hint, client_id: desktopClientId });
      } catch (error) {
        log('warn', 'auth.revoke-failed', { hint, error: error instanceof Error ? error.message : 'unknown' });
      }
    }
  };

  const completeSignIn = async (code: string, verifier: string, redirectUri: string): Promise<void> => {
    const response = await postForm('/oauth2/token', {
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
      client_id: desktopClientId,
    });
    if (!response.ok) {
      throw new Error(`The code exchange failed with HTTP ${String(response.status)}.`);
    }
    const body = (await response.json()) as TokenResponse;
    if (typeof body.access_token !== 'string') {
      throw new TypeError('The token endpoint answered without an access token.');
    }
    const account = await lookUpAccount(body.access_token);
    if (account === undefined) {
      throw new Error('The new sign-in names no account.');
    }
    /* Renewing, or signing in as another account, replaces the sign-in held: the old one is revoked, not left to
     * expire on the server. */
    const replaced = { access: accessToken, refresh: stored?.refreshToken };
    await adoptTokens(body, { account, startedAt: Date.now() });
    if (replaced.refresh !== undefined) {
      // async-iife: the new sign-in does not wait on the old one's revocation.
      void revoke(replaced);
    }
  };

  const handleRedirect = async (
    request: IncomingMessage,
    response: ServerResponse,
    attempt: { readonly path: string; readonly state: string; readonly verifier: string; readonly redirectUri: string },
  ): Promise<void> => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (request.method !== 'GET' || url.pathname !== attempt.path) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    const state = url.searchParams.get('state') ?? '';
    if (pending === undefined || !constantTimeEquals(state, attempt.state)) {
      /* Not this attempt's answer: refuse it without touching the attempt, which only its own redirect may end. */
      log('warn', 'auth.redirect-state-mismatch');
      redirect(response, resultUrl('error'));
      return;
    }
    const error = url.searchParams.get('error');
    if (error !== null) {
      const reason = error === 'access_denied' ? 'canceled' : 'error';
      log('info', 'auth.sign-in-refused', { reason });
      redirect(response, resultUrl(reason));
      settlePending(new SignInEndedError(reason));
      return;
    }
    const code = url.searchParams.get('code');
    if (code === null || code === '') {
      redirect(response, resultUrl('error'));
      settlePending(new SignInEndedError('error'));
      return;
    }
    pending.finishing = true;
    notify();
    try {
      await completeSignIn(code, attempt.verifier, attempt.redirectUri);
      currentNotice = undefined;
      log('info', 'auth.signed-in');
      redirect(response, resultUrl('signed-in'));
      notify();
      settlePending();
    } catch (exchangeError) {
      log('error', 'auth.exchange-failed', exchangeError instanceof Error ? exchangeError.message : 'unknown');
      redirect(response, resultUrl('error'));
      settlePending(new SignInEndedError('error'));
    }
  };

  const listen = async (server: Server): Promise<number> =>
    new Promise((resolve, reject) => {
      server.once('error', reject);
      // `exclusive`: no other process or worker may share this port (RFC 8252 B.5: no SO_REUSEPORT).
      server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
        server.off('error', reject);
        resolve((server.address() as AddressInfo).port);
      });
    });

  return {
    token: () => {
      if (accessToken !== undefined && seeded === undefined && Date.now() >= accessExpiresAt - refreshLead) {
        // async-iife: a token read is synchronous; a late refresh (after sleep) starts here and notifies when done.
        void runRefresh();
      }
      return accessToken !== undefined && Date.now() < accessExpiresAt ? accessToken : undefined;
    },
    principal: () => stored?.account.id,
    principalName: () => stored?.account.name,
    principalEmail: () => stored?.account.email,
    signInEndsAt: () => (stored === undefined ? undefined : new Date(stored.startedAt + signInLifetime)),
    signInAttempt: () =>
      pending === undefined
        ? undefined
        : {
            url: pending.url,
            phase: pending.finishing ? 'finishing' : 'waiting',
            browserFailed: pending.browserFailed,
          },
    notice: () => currentNotice,
    clearNotice() {
      currentNotice = undefined;
    },
    refresh: runRefresh,
    reportRejected(token) {
      if (token !== accessToken || seeded !== undefined || stored === undefined) {
        return;
      }
      log('info', 'auth.access-token-rejected');
      // A rejected token is never sent again: requests wait for the refreshed one instead of repeating the 401.
      accessExpiresAt = 0;
      // async-iife: a refresh failure is logged and retried; nothing awaits it.
      void runRefresh();
    },

    async restore() {
      if (seeded !== undefined) {
        log('info', 'auth.seeded-token-accepted');
        notify();
        return;
      }
      const retired = await retireLegacyCredential();
      try {
        const decoded: unknown = JSON.parse(options.safeStorage.decryptString(await readFile(credentialPath)));
        if (!isStoredSignIn(decoded)) {
          throw new Error('The stored sign-in is not in the expected shape.');
        }
        stored = decoded;
        log('info', 'auth.restored');
        await runRefresh();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          /* A record that will not decrypt (new OS user, rotated keychain) is unusable: remove it. */
          log('warn', 'auth.restore-failed', error instanceof Error ? error.message : 'unknown');
          await forget();
        }
      }
      if (retired || stored !== undefined) {
        notify();
      }
    },

    async signIn(mode = 'consent') {
      // A new attempt replaces the one in flight: closing a tab or the browser must never strand Sign in.
      settlePending(new SignInEndedError('canceled'));
      const state = randomToken(24);
      const verifier = randomToken(32);
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      const path = `/cb/${randomToken(24)}`;
      /* Filled once the port is known; the listener answers nothing before then. */
      const attemptRef: {
        current?: { path: string; state: string; verifier: string; redirectUri: string };
      } = {};
      const server = createServer((request, response) => {
        const attempt = attemptRef.current;
        if (attempt === undefined) {
          response.writeHead(503);
          response.end();
          return;
        }
        // async-iife: the http server's request callback cannot await; every branch answers the response.
        void handleRedirect(request, response, attempt);
      });
      const port = await listen(server);
      const redirectUri = `http://127.0.0.1:${String(port)}${path}`;
      attemptRef.current = { path, state, verifier, redirectUri };
      const authorize = new URL(`${options.apiUrl}/v1/auth/oauth2/authorize`);
      for (const [name, value] of Object.entries({
        response_type: 'code',
        client_id: desktopClientId,
        redirect_uri: redirectUri,
        scope: desktopScope,
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        // Consent on every sign-in (RFC 8252 §8.6); "Use a different account" asks for a fresh sign-in first.
        prompt: mode === 'different-account' ? 'login consent' : 'consent',
      })) {
        authorize.searchParams.set(name, value);
      }
      const deadline = setTimeout(
        () => {
          settlePending(new SignInEndedError('expired'));
        },
        options.signInTimeout ?? 10 * 60 * 1000,
      );
      deadline.unref();
      const settled = Promise.withResolvers<void>();
      const attempt: PendingSignIn = {
        state,
        settled,
        deadline,
        server,
        url: authorize.toString(),
        finishing: false,
        browserFailed: false,
      };
      pending = attempt;
      notify();
      try {
        await options.openExternal(authorize.toString());
      } catch (error) {
        /* The attempt stays open: Copy link can still finish it in a browser the person opens themselves. */
        log('warn', 'auth.open-browser-failed', error instanceof Error ? error.message : 'unknown');
        if (pending === attempt) {
          attempt.browserFailed = true;
          notify();
        }
      }
      try {
        await settled.promise;
      } finally {
        notify();
      }
    },

    cancelSignIn() {
      settlePending(new SignInEndedError('canceled'));
    },

    async signOut() {
      const held = await forget();
      currentNotice = undefined;
      log('info', 'auth.signed-out');
      notify();
      await revoke(held);
    },

    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    dispose() {
      disposed = true;
      clearRefreshTimer();
      listeners.clear();
      settlePending(new SignInEndedError('canceled'));
    },
  };
};
