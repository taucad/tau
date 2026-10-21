import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { cliError, exitCodes } from '#output.js';

type Environment = Readonly<Record<string, string | undefined>>;

/**
 * The exact origin a CLI session belongs to; paths and embedded credentials are refused.
 * @param value - Selected API URL.
 * @returns The validated, normalized origin.
 */
export const authApiOrigin = (
  value = process.env['TAU_API_URL'] === ''
    ? 'https://api.tau.new'
    : (process.env['TAU_API_URL'] ?? 'https://api.tau.new'),
): string => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw cliError('INVALID_API_URL', 'TAU_API_URL must be an absolute HTTPS origin.', exitCodes.usage);
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw cliError(
      'INVALID_API_URL',
      'TAU_API_URL must be an HTTPS origin (HTTP is allowed only on loopback).',
      exitCodes.usage,
    );
  }
  return url.origin;
};

/** OS credentials are never written into the project or a plaintext config file. */
type CredentialEntry = {
  getPassword: () => Promise<string | undefined>;
  setPassword: (token: string) => Promise<void>;
  deleteCredential: () => Promise<boolean>;
};

export const credentialEntry = async (origin: string): Promise<CredentialEntry> => {
  try {
    const keyring = await import('@napi-rs/keyring');
    const entry = new keyring.AsyncEntry('Tau CLI', authApiOrigin(origin), { linux: { store: 'secret-service' } });
    const safely = async <T>(operation: () => Promise<T>): Promise<T> => {
      try {
        return await operation();
      } catch {
        throw cliError(
          'AUTH_STORE_UNAVAILABLE',
          'Cannot access the OS credential store. Unlock it and try again.',
          exitCodes.refused,
        );
      }
    };
    return {
      getPassword: async () => safely(async () => (await entry.getPassword()) ?? undefined),
      setPassword: async (token) => safely(async () => entry.setPassword(token)),
      deleteCredential: async () => safely(async () => entry.deleteCredential()),
    };
  } catch {
    throw cliError(
      'AUTH_STORE_UNAVAILABLE',
      'Unlock your OS credential store, or use TAU_AUTH_TOKEN for this process.',
      exitCodes.refused,
    );
  }
};

/**
 * Resolve the explicit environment override before the origin-specific saved session.
 * @param origin - Selected API origin.
 * @param environment - Process environment or explicit overrides.
 * @param requireStore - Refuse unavailable stores for explicit authentication commands.
 * @returns The session bearer, if available.
 */
export const resolveAuthToken = async (
  origin: string,
  environment: Environment = process.env,
  requireStore = false,
): Promise<string | undefined> => {
  const normalized = authApiOrigin(origin);
  if (environment['TAU_AUTH_TOKEN']) {
    return environment['TAU_AUTH_TOKEN'];
  }
  try {
    const entry = await credentialEntry(normalized);
    return (await entry.getPassword()) ?? undefined;
  } catch {
    if (requireStore) {
      throw cliError(
        'AUTH_STORE_UNAVAILABLE',
        'Cannot read the OS credential store. Unlock it or set TAU_AUTH_TOKEN.',
        exitCodes.refused,
      );
    }
    return undefined;
  }
};

/**
 * Credential-bearing requests never follow redirects or echo a provider response in errors.
 * @param origin - Selected API origin.
 * @param path - Relative authentication endpoint.
 * @param options - Credential, body, and cancellation signal.
 * @returns The authentication response.
 */
export const authRequest = async (
  origin: string,
  path: string,
  options: { token?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<Response> => {
  try {
    return await fetch(`${authApiOrigin(origin)}/v1/auth/${path}`, {
      method: options.body === undefined ? 'GET' : 'POST',
      headers: {
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      redirect: 'error',
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(15_000)])
        : AbortSignal.timeout(15_000),
    });
  } catch {
    throw cliError(
      'AUTH_UNREACHABLE',
      'Could not reach the selected Tau API. Check TAU_API_URL and your connection.',
      exitCodes.refused,
    );
  }
};

const authJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    throw cliError('AUTH_INVALID_RESPONSE', 'Tau returned an invalid authentication response.', exitCodes.refused);
  }
};

const sessionSchema = z.object({
  user: z.object({ id: z.string(), email: z.string() }),
  session: z.object({ expiresAt: z.string() }),
});

/**
 * Validate remotely, without returning or printing the session bearer.
 * @param origin - Selected API origin.
 * @param token - Session bearer.
 * @returns Account and expiry metadata, or undefined for an invalid session.
 */
export const inspectSession = async (
  origin: string,
  token: string,
): Promise<z.infer<typeof sessionSchema> | undefined> => {
  const response = await authRequest(origin, 'get-session', { token });
  if (response.status === 401 || response.status === 403) {
    return undefined;
  }
  if (!response.ok) {
    throw cliError('AUTH_UNAVAILABLE', `Session check failed (HTTP ${response.status}).`, exitCodes.refused);
  }
  const body = await authJson(response);
  if (body === null) {
    return undefined;
  }
  const parsed = sessionSchema.safeParse(body);
  if (!parsed.success) {
    throw cliError('AUTH_INVALID_RESPONSE', 'Tau returned an invalid session response.', exitCodes.refused);
  }
  return parsed.data;
};

/**
 * Revoke one session; keep the saved token if the API cannot confirm revocation.
 * @param origin - Selected API origin.
 * @param token - Session to revoke.
 */
export const revokeSession = async (origin: string, token: string): Promise<void> => {
  const response = await authRequest(origin, 'sign-out', { token, body: {} });
  if (!response.ok && response.status !== 401) {
    throw cliError(
      'AUTH_LOGOUT_FAILED',
      `Sign-out failed (HTTP ${response.status}); session revocation was not confirmed.`,
      exitCodes.refused,
    );
  }
};

/* eslint-disable @typescript-eslint/naming-convention -- RFC 8628 wire fields. */
const deviceSchema = z.object({
  device_code: z.string().min(1),
  user_code: z.string().regex(/^[A-Z0-9-]{4,32}$/u),
  verification_uri: z.url(),
  verification_uri_complete: z.url(),
  expires_in: z.number().int().positive().max(600),
  interval: z.number().int().positive().max(60),
});
const tokenSchema = z.object({ access_token: z.string().min(1), token_type: z.literal('Bearer') });
const pendingSchema = z.object({ error: z.string() });

/**
 * Start and poll a bounded device grant. Only the human-readable code leaves this function.
 * @param origin - Selected API origin.
 * @param present - Show the approval URL and human-readable code.
 * @param signal - Cancellation signal.
 * @returns The newly issued session bearer.
 */
export const deviceLogin = async (
  origin: string,
  present: (url: string, code: string) => Promise<void>,
  signal: AbortSignal,
): Promise<string> => {
  const response = await authRequest(origin, 'device/code', { body: { client_id: 'tau-cli' }, signal });
  if (!response.ok) {
    throw cliError('AUTH_LOGIN_FAILED', `Could not start sign-in (HTTP ${response.status}).`, exitCodes.refused);
  }
  const parsed = deviceSchema.safeParse(await authJson(response));
  if (!parsed.success) {
    throw cliError('AUTH_INVALID_RESPONSE', 'Tau returned an invalid sign-in response.', exitCodes.refused);
  }
  const device = parsed.data;
  const verification = new URL(device.verification_uri);
  authApiOrigin(verification.origin);
  if (
    verification.pathname !== '/auth/cli' ||
    verification.search ||
    verification.hash ||
    verification.username ||
    verification.password
  ) {
    throw cliError('AUTH_INVALID_RESPONSE', 'Tau returned an invalid approval URL.', exitCodes.refused);
  }
  verification.searchParams.set('user_code', device.user_code);
  if (verification.href !== device.verification_uri_complete) {
    throw cliError('AUTH_INVALID_RESPONSE', 'Tau returned inconsistent approval URLs.', exitCodes.refused);
  }
  const deadline = Date.now() + device.expires_in * 1000;
  await present(verification.href, device.user_code);
  /** Poll spacing in milliseconds. */
  let pollInterval = device.interval * 1000;
  while (!signal.aborted && Date.now() + pollInterval < deadline) {
    // oxlint-disable-next-line no-await-in-loop -- Device grants require sequential, rate-limited polling.
    await delay(pollInterval, undefined, { signal });
    // oxlint-disable-next-line no-await-in-loop -- Each result decides whether another poll is permitted.
    const poll = await authRequest(origin, 'device/token', {
      body: {
        client_id: 'tau-cli',
        device_code: device.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      },
      signal,
    });
    // oxlint-disable-next-line no-await-in-loop -- Parse this poll before deciding whether to continue.
    const body = await authJson(poll);
    if (poll.ok) {
      const token = tokenSchema.safeParse(body);
      if (!token.success) {
        throw cliError('AUTH_INVALID_RESPONSE', 'Tau returned an invalid sign-in result.', exitCodes.refused);
      }
      return token.data.access_token;
    }
    const error = pendingSchema.safeParse(body);
    if (error.success && error.data.error === 'authorization_pending') {
      continue;
    }
    if (error.success && error.data.error === 'slow_down') {
      pollInterval += 5000;
      continue;
    }
    throw cliError(
      'AUTH_LOGIN_REFUSED',
      'Sign-in was denied, expired, or could not be completed. Run tau auth login again.',
      exitCodes.refused,
    );
  }
  throw cliError('AUTH_LOGIN_EXPIRED', 'Sign-in expired. Run tau auth login again.', exitCodes.refused);
};
/* eslint-enable @typescript-eslint/naming-convention -- End RFC 8628 wire fields. */
