import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { wirePaymentActionSchema } from '@taucad/billing';

const refuseProduction = (value: string): string => {
  const url = new URL(value);
  // Staging and local stacks only: production accounts and money live under tau.new.
  if (url.hostname.includes('tau.new')) {
    throw new Error(`Refusing ${url.origin}: the billing harness never runs against tau.new`);
  }
  return url.origin;
};

/** The app and API under test: staging unless the environment names another stack. */
export const baseUrl = refuseProduction(process.env['TAU_E2E_BASE_URL'] ?? 'https://taucad.dev');
export const apiUrl = refuseProduction(process.env['TAU_E2E_API_URL'] ?? 'https://api.taucad.dev');

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
  const request = async (method: string, path: string, options: RequestOptions = {}): Promise<ApiResponse> => {
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
      const name = pair.slice(0, pair.indexOf('=')).trim();
      const value = pair.slice(pair.indexOf('=') + 1).trim();
      if (value === '' || /max-age=0/iu.test(cookie)) {
        jar.delete(name);
      } else {
        jar.set(name, value);
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
    // ponytail: waits out every 429 until the row's own timeout; a bounded retry count if a limit ever sticks.
    if (response.status === 429 && options.retryRateLimit !== false) {
      await delay((Number(response.headers.get('x-retry-after') ?? '10') + 1) * 1000);
      return request(method, path, options);
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

/** Parses an error body; rows compare its `error` (message codes) or `code` (conflict codes). */
export const failure = (response: ApiResponse): z.output<typeof apiErrorSchema> => apiErrorSchema.parse(response.body);
