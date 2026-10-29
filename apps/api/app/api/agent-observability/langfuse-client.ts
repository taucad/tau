import type { ObservationIdentity, OtlpSpan } from '#api/agent-observability/langfuse-observation.js';
import { otlpBody } from '#api/agent-observability/langfuse-observation.js';

/** Where and as whom the API writes to one Langfuse project. Server-side only. */
export type LangfuseTarget = Readonly<{ baseUrl: string; publicKey: string; secretKey: string }>;

/**
 * What one send attempt established about the observation (T02 attempts 1–6).
 *
 * - `accepted`: the vendor acknowledged the span; it becomes visible later.
 * - `rejected`: the vendor refused it for good; a resend cannot succeed.
 * - `not-sent`: the request provably never reached ingestion, so a resend is safe.
 * - `uncertain`: it may or may not have been stored; only a read can say.
 */
export type SendOutcome =
  | Readonly<{ kind: 'accepted' }>
  | Readonly<{ kind: 'rejected' | 'not-sent' | 'uncertain'; reason: string }>;

/** What one reconciliation read established; `unavailable` is never absence. */
export type FindOutcome = 'present' | 'absent' | 'unavailable';

/** Connection failures that precede any request byte reaching the vendor. */
const unsentCodes = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ERR_INVALID_URL', 'CERT_HAS_EXPIRED']);

/** One property of an untyped JSON value, or `undefined`. */
const field = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;

const causeCode = (error: unknown): string | undefined => {
  const code = field(error instanceof Error ? error.cause : undefined, 'code');
  return typeof code === 'string' ? code : undefined;
};

/**
 * Classify a send failure. Only a failure to connect proves nothing was sent;
 * a timeout, reset or abort after connecting may have been applied.
 *
 * @param error - What `fetch` threw.
 * @returns The outcome, with a bounded reason code.
 */
export const classifySendError = (error: unknown): SendOutcome => {
  const code = causeCode(error);
  if (code !== undefined && unsentCodes.has(code)) {
    return { kind: 'not-sent', reason: code.toLowerCase() };
  }
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return { kind: 'uncertain', reason: 'timeout' };
  }
  return { kind: 'uncertain', reason: 'transport' };
};

/**
 * Classify the vendor's answer to one single-span OTLP request.
 *
 * A 429 or 5xx can follow a partial write, so neither proves the span was not
 * stored (T02 attempt 4); both are uncertain. Authentication and authorisation
 * failures are refused before ingestion and are a configuration fault, so the
 * span may be sent again once the credentials are right.
 *
 * @param status - The HTTP status.
 * @param body - The response body, parsed when JSON.
 * @returns The outcome, with a bounded reason code.
 */
export const classifySendResponse = (status: number, body: unknown): SendOutcome => {
  if (status >= 200 && status < 300) {
    const rejected = field(field(body, 'partialSuccess'), 'rejectedSpans');
    return Number(rejected ?? 0) > 0 ? { kind: 'rejected', reason: 'partial' } : { kind: 'accepted' };
  }
  if (status === 401 || status === 403) {
    return { kind: 'not-sent', reason: `http-${status}` };
  }
  if (status === 400 || status === 404 || status === 413 || status === 415 || status === 422) {
    return { kind: 'rejected', reason: `http-${status}` };
  }
  return { kind: 'uncertain', reason: `http-${status}` };
};

const readJson = async (response: Response): Promise<unknown> => {
  try {
    return (await response.json()) as unknown;
  } catch {
    return undefined;
  }
};

const authorization = (target: LangfuseTarget): string =>
  `Basic ${Buffer.from(`${target.publicKey}:${target.secretKey}`).toString('base64')}`;

/**
 * Langfuse v4 ingestion and read-back for agent evidence. It never logs or
 * returns request or response bodies: the span carries customer content.
 */
export class LangfuseClient {
  public constructor(
    private readonly target: LangfuseTarget,
    private readonly timeoutMilliseconds: number,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  /**
   * Send one complete observation.
   *
   * @param span - The observation for one receipt.
   * @param signal - Aborts the request on shutdown; an abort is uncertain.
   * @returns What the attempt established.
   */
  public async send(span: OtlpSpan, signal?: AbortSignal): Promise<SendOutcome> {
    const deadline = AbortSignal.timeout(this.timeoutMilliseconds);
    try {
      const response = await this.fetcher(new URL('/api/public/otel/v1/traces', this.target.baseUrl), {
        method: 'POST',
        headers: {
          authorization: authorization(this.target),
          'content-type': 'application/json',
          'x-langfuse-ingestion-version': '4',
        },
        body: otlpBody(span),
        signal: signal === undefined ? deadline : AbortSignal.any([deadline, signal]),
        redirect: 'error',
      });
      return classifySendResponse(response.status, await readJson(response));
    } catch (error) {
      return classifySendError(error);
    }
  }

  /**
   * Whether an observation is readable, for reconciling an uncertain send.
   * Visibility lags acceptance by seconds (T02 attempt 1), so `absent` means
   * only "not yet visible"; the caller decides how long to wait before gapping.
   *
   * @param identity - The observation's ids.
   * @param from - A lower bound on its start time.
   * @param signal - Aborts the read.
   * @returns Present, absent or unavailable.
   */
  public async lookup(identity: ObservationIdentity, from: Date, signal?: AbortSignal): Promise<FindOutcome> {
    const url = new URL('/api/public/v2/observations', this.target.baseUrl);
    url.searchParams.set('traceId', identity.traceId);
    url.searchParams.set('fromStartTime', from.toISOString());
    url.searchParams.set('fields', 'core');
    url.searchParams.set('limit', '100');
    const deadline = AbortSignal.timeout(this.timeoutMilliseconds);
    try {
      for (let page = 0; page < 20; page++) {
        // oxlint-disable-next-line no-await-in-loop -- pages are cursor-ordered
        const response = await this.fetcher(url, {
          headers: { authorization: authorization(this.target) },
          signal: signal === undefined ? deadline : AbortSignal.any([deadline, signal]),
          redirect: 'error',
        });
        if (!response.ok) {
          return 'unavailable';
        }
        // oxlint-disable-next-line no-await-in-loop -- the body belongs to this page
        const body = await readJson(response);
        const data = field(body, 'data');
        if (!Array.isArray(data)) {
          return 'unavailable';
        }
        if (data.some((row: unknown) => field(row, 'id') === identity.spanId)) {
          return 'present';
        }
        const cursor = field(field(body, 'meta'), 'cursor');
        if (typeof cursor !== 'string' || cursor.length === 0) {
          return 'absent';
        }
        url.searchParams.set('cursor', cursor);
      }
      return 'unavailable';
    } catch {
      return 'unavailable';
    }
  }
}
