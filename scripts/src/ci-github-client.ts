/**
 * The GitHub REST client the CI health CLIs share (`ci-queue-health-cli.ts`, `ci-flake-ledger-ingest-cli.ts`): a
 * bearer token, a request budget that keeps a reserve of the rate limit, and retries of a 5xx, a rate-limit refusal
 * or a network reset with a backoff that reaches a minute.
 *
 * Only `node:` modules, so a workflow can run it from a sparse checkout without installing the workspace.
 */
import { setTimeout as sleep } from 'node:timers/promises';

/** Requests left untouched when the rate limit runs low, so a rerun in the same hour can still start. */
const rateReserve = 50;
/** Retries of a 5xx, a rate-limit refusal or a network reset: 2 s doubling to 64 s, about two minutes in all. */
export const retries = 6;
/** The longest wait a `retry-after` header may ask for before the request is given up. */
const maximumRetryAfterSeconds = 120;

/** A GitHub API error with its status, so a caller can tell a missing ref (404) or a conflict (409, 422) apart. */
export class GitHubError extends Error {
  public readonly status: number;

  public constructor(method: string, path: string, status: number, detail = '') {
    super(`${method} ${path}: GitHub API ${status}${detail ? ` ${detail}` : ''}`);
    this.name = 'GitHubError';
    this.status = status;
  }
}

export type Client = {
  /** `owner/name`, the prefix of every path below `/repos`. */
  readonly repository: string;
  readonly get: <T>(path: string) => Promise<T>;
  /**
   * A text body: a job log, or a file through `accept: application/vnd.github.raw+json`. The API redirects a log to
   * a signed URL, which `fetch` follows without the token.
   */
  readonly getText: (path: string, accept?: string) => Promise<string>;
  /** A binary body: an artifact's zip, which the API redirects to a signed URL. */
  readonly getBytes: (path: string) => Promise<Uint8Array>;
  /** A `POST`, `PATCH` or `PUT` with a JSON body; no retry, since a write may have landed before the error. */
  readonly send: <T>(method: 'POST' | 'PATCH' | 'PUT', path: string, body: unknown) => Promise<T>;
  /** Requests this run may still make. */
  readonly budget: () => number;
};

export const client = (options: {
  readonly api: string;
  readonly token: string;
  readonly repository: string;
  readonly maxRequests: number;
}): Client => {
  const { api, token, repository, maxRequests } = options;
  let made = 0;
  let remaining = Number.POSITIVE_INFINITY;
  const headers = (accept: string): Record<string, string> => ({
    authorization: `Bearer ${token}`,
    accept,
    'x-github-api-version': '2022-11-28',
  });
  const request = async (path: string, accept = 'application/vnd.github+json'): Promise<Response> => {
    // The API answers 502/503 now and then on job listings, sometimes several times running (run 45247664173
    // lost the week's report to one listing after three quick retries); retry those, rate-limit refusals and
    // network resets with a backoff that reaches a minute.
    for (let attempt = 1; ; attempt += 1) {
      made += 1;
      let response: Response | undefined;
      try {
        // oxlint-disable-next-line no-await-in-loop -- a retry waits for the attempt before it
        response = await fetch(`${api}${path}`, { headers: headers(accept), signal: AbortSignal.timeout(60_000) });
      } catch (error) {
        if (attempt > retries) {
          throw error;
        }
      }
      const header = response?.headers.get('x-ratelimit-remaining');
      if (header !== null && header !== undefined) {
        remaining = Number(header);
      }
      if (response?.ok) {
        return response;
      }
      const retryAfter = Number(response?.headers.get('retry-after') ?? Number.NaN);
      const limited =
        response?.status === 429 || (response?.status === 403 && (Number.isFinite(retryAfter) || header === '0'));
      if (response && ((response.status < 500 && !limited) || attempt > retries)) {
        throw new GitHubError('GET', path, response.status);
      }
      const backoff = 2000 * 2 ** (attempt - 1);
      // oxlint-disable-next-line no-await-in-loop -- the backoff is sequential by design
      await sleep(
        Number.isFinite(retryAfter) ? Math.min(retryAfter, maximumRetryAfterSeconds) * 1000 + backoff : backoff,
      );
    }
  };
  return {
    repository,
    budget: () => Math.min(maxRequests - made, remaining - rateReserve),
    async get<T>(path: string): Promise<T> {
      const response = await request(path);
      return (await response.json()) as T;
    },
    async getText(path: string, accept?: string): Promise<string> {
      const response = await request(path, accept);
      return response.text();
    },
    async getBytes(path: string): Promise<Uint8Array> {
      const response = await request(path);
      return new Uint8Array(await response.arrayBuffer());
    },
    async send<T>(method: 'POST' | 'PATCH' | 'PUT', path: string, body: unknown): Promise<T> {
      made += 1;
      const response = await fetch(`${api}${path}`, {
        method,
        headers: { ...headers('application/vnd.github+json'), 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new GitHubError(method, path, response.status, detail.slice(0, 200));
      }
      return (await response.json()) as T;
    },
  };
};
