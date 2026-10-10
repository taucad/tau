import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { wirePaymentActionSchema } from '@taucad/billing';

/**
 * The origin of a stack the harness may drive, or a throw. It creates and deletes accounts and pays Checkout, so the
 * guard is an allowlist: production accounts and money live under tau.new, which no setting can admit, and a hostname
 * production gains later must not pass by default. `extraHost` (TAU_E2E_ALLOW_HOST) names one other stack.
 *
 * @param value - The configured app or API URL.
 * @param extraHost - One more hostname to admit, never tau.new or one of its subdomains.
 * @returns The URL's origin.
 * @throws When the host is production or outside the allowlist.
 */
export const harnessOrigin = (value: string, extraHost?: string): string => {
  const url = new URL(value);
  const { hostname } = url;
  if (hostname === 'tau.new' || hostname.endsWith('.tau.new')) {
    throw new Error(`Refusing ${url.origin}: tau.new is production, and the billing harness never drives it`);
  }
  const allowed = hostname === 'taucad.dev' || hostname.endsWith('.taucad.dev') || hostname === extraHost;
  if (!allowed && hostname !== 'localhost' && hostname !== '127.0.0.1') {
    throw new Error(
      `Refusing ${url.origin}: the billing harness drives taucad.dev stacks or localhost; TAU_E2E_ALLOW_HOST names one other`,
    );
  }
  return url.origin;
};

/**
 * Seconds a 429 asks us to wait: a numeric `x-retry-after` or `Retry-After`, else 10; never more than 30. The clamp
 * is a retry budget that covers better-auth's built-in sign-in rule (3 per 10 s); its mail endpoints use a 60 s
 * window, which the harness only reaches through the browser.
 */
export const retryAfterSeconds = (headers: Headers): number => {
  const raw = (headers.get('x-retry-after') ?? headers.get('retry-after') ?? '').trim();
  const seconds = raw === '' ? Number.NaN : Number(raw);
  return Number.isFinite(seconds) ? Math.min(Math.max(seconds, 0), 30) : 10;
};

/** A `Set-Cookie` that deletes: a non-positive `Max-Age` (so not `Max-Age=01`) or an `Expires` already past. */
const cookieExpired = (cookie: string): boolean =>
  cookie
    .split(';')
    .slice(1)
    .map((attribute) => attribute.trim().toLowerCase())
    .some((attribute) => {
      if (attribute.startsWith('max-age=')) {
        return Number(attribute.slice('max-age='.length)) <= 0;
      }
      if (attribute.startsWith('expires=')) {
        const cookieExpiresAt = Date.parse(attribute.slice('expires='.length));
        return Number.isFinite(cookieExpiresAt) && cookieExpiresAt <= Date.now();
      }
      return false;
    });

/** The app and API under test: staging unless the environment names another stack. */
export const baseUrl = harnessOrigin(
  process.env['TAU_E2E_BASE_URL'] ?? 'https://taucad.dev',
  process.env['TAU_E2E_ALLOW_HOST'],
);
export const apiUrl = harnessOrigin(
  process.env['TAU_E2E_API_URL'] ?? 'https://api.taucad.dev',
  process.env['TAU_E2E_ALLOW_HOST'],
);

export type ApiCall = {
  readonly at: string;
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly requestId?: string;
};

/** Every API call this process made, in order; each matrix row keeps the slice it caused as evidence. */
export const apiCalls: ApiCall[] = [];

export type ApiResponse = ApiCall & { readonly body: unknown; readonly headers: Headers };

type RequestOptions = {
  readonly body?: unknown;
  /** Mutations send the app origin unless a row probes the guard with another value, or `false` for none. */
  readonly origin?: string | false;
  readonly headers?: Readonly<Record<string, string>>;
  /** Auth answers 429 for the rest of its window; only the rate-limit row wants to see that. */
  readonly retryRateLimit?: boolean;
};

export type Api = {
  /** Session cookies by name, as a browser holds them for the API host. */
  readonly jar: Map<string, string>;
  readonly request: (method: string, path: string, options?: RequestOptions) => Promise<ApiResponse>;
};

const parseBody = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

/** A cookie-jar client for one account; it never logs cookies or verification tokens. */
export const createApi = (): Api => {
  const jar = new Map<string, string>();
  const request = async (
    method: string,
    path: string,
    options: RequestOptions & { readonly attempt?: number } = {},
  ): Promise<ApiResponse> => {
    const origin = options.origin ?? (method === 'GET' ? false : baseUrl);
    const response = await fetch(`${apiUrl}${path}`, {
      method,
      redirect: 'manual',
      headers: {
        ...(origin === false ? {} : { origin }),
        ...(jar.size === 0 ? {} : { cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; ') }),
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...options.headers,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair = ''] = cookie.split(';');
      const separator = pair.indexOf('=');
      if (separator !== -1) {
        const name = pair.slice(0, separator).trim();
        const value = pair.slice(separator + 1).trim();
        if (value === '' || cookieExpired(cookie)) {
          jar.delete(name);
        } else {
          jar.set(name, value);
        }
      }
    }
    const call: ApiCall = {
      at: new Date().toISOString(),
      method,
      path: path.replace(/token=[^&]+/u, 'token=…'),
      status: response.status,
      requestId: response.headers.get('request-id') ?? undefined,
    };
    apiCalls.push(call);
    const body = parseBody(await response.text());
    // Bounded like the mail.tm client: five waits, each as long as the server asks (capped so all five fit the
    // 180 s row budget and a rate-limited row still reaches the matrix), then the 429 is the answer.
    const attempt = options.attempt ?? 0;
    if (response.status === 429 && options.retryRateLimit !== false && attempt < 5) {
      await delay((retryAfterSeconds(response.headers) + 1) * 1000);
      return request(method, path, { ...options, attempt: attempt + 1 });
    }
    return { ...call, body, headers: response.headers };
  };
  return { jar, request };
};

/** The API's error envelope; a 409 may carry the pending action the client can resume. */
export const apiErrorSchema = z.object({
  error: z.string(),
  code: z.string(),
  statusCode: z.number(),
  requestId: z.string().optional(),
  message: z.array(z.string()).optional(),
  action: wirePaymentActionSchema.optional(),
});

/** Parses a 2xx body with its `@taucad/billing` wire schema, so drift fails the row with the drift. */
export const ok = <Schema extends z.ZodType>(response: ApiResponse, schema: Schema): z.output<Schema> => {
  if (response.status < 200 || response.status > 299) {
    throw new Error(
      `${response.method} ${response.path} answered ${response.status}: ${JSON.stringify(response.body)}`,
    );
  }
  return schema.parse(response.body);
};

/**
 * The refusal code of any error body: the envelope's `code`, else its `error`, else the gateway envelope's
 * `error.type`; `none` when the body carries none of them.
 */
export const refusalCode = (response: ApiResponse): string => {
  const body = z
    .object({
      code: z.string().optional(),
      error: z.union([z.string(), z.object({ type: z.string() }).loose()]).optional(),
    })
    .loose()
    .safeParse(response.body);
  if (!body.success) {
    return 'none';
  }
  const { code, error } = body.data;
  return code ?? (typeof error === 'string' ? error : error?.type) ?? 'none';
};

/** Parses an error body; rows compare its `error` (message codes) or `code` (conflict codes). */
export const failure = (response: ApiResponse): z.output<typeof apiErrorSchema> => apiErrorSchema.parse(response.body);
