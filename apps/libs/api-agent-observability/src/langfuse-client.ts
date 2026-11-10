import type { LangfuseScoreName } from '@taucad/api-core';
import type { LangfuseScore, ObservationIdentity, OtlpSpan } from '#langfuse-observation.js';
import type { LangfuseObservationRow } from '#langfuse-scorecard.js';
import { otlpBody, settlementObservationName } from '#langfuse-observation.js';

/**
 * Where and as whom the API writes to one Langfuse project. Server-side only. `scoreConfigs` names the project's score
 * config for each score (`TAU_OBSERVABILITY_SCORE_CONFIG_IDS`); config ids differ per project and are never read from
 * Langfuse (charter D6, ruling 9).
 */
export type LangfuseTarget = Readonly<{
  baseUrl: string;
  publicKey: string;
  secretKey: string;
  scoreConfigs?: Readonly<Partial<Record<LangfuseScoreName, string>>> | undefined;
}>;

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

/**
 * What one score write established (LW7). Nothing reads a score back (ruling 9), so its answer settles it: `accepted`
 * and `rejected` are final, `not-sent` provably never reached Langfuse, `uncertain` may have been stored after its
 * bounded repeats, and `held` was not sent because its score config id is not set.
 */
export type ScoreOutcome = SendOutcome | Readonly<{ kind: 'held'; reason: 'config-unset' }>;

/**
 * How many times one score write sends its identical body while the answer is uncertain. A repeat is safe: Langfuse
 * replaces a score with the same id, name and timestamp date (LD5).
 */
export const scoreAttempts = 3;

/** What one reconciliation read established; `unavailable` is never absence. */
export type FindOutcome = 'present' | 'absent' | 'unavailable';

/**
 * What one bulk trace deletion request established. Langfuse queues the
 * deletion; an `accepted` delete is the erasure (charter I6 as amended by
 * ruling 9), and nothing reads it back.
 */
export type DeleteOutcome = Readonly<{ kind: 'accepted' }> | Readonly<{ kind: 'retry'; reason: string }>;

/**
 * One environment's observations in a time window. `partial` is a read cut
 * short by the page bound or a failed page: its rows are a lower bound, never
 * the whole window.
 */
export type ObservationsRead = Readonly<{ kind: 'complete' | 'partial'; rows: readonly LangfuseObservationRow[] }>;

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

/**
 * Classify the vendor's answer to one score write, always an array of one score. A 207 on that array means its one
 * score was refused, and the OpenAPI says not to retry it; any other answer reads as for a span.
 *
 * @param status - The HTTP status.
 * @returns The outcome, with a bounded reason code.
 */
export const classifyScoreResponse = (status: number): SendOutcome =>
  status === 207 ? { kind: 'rejected', reason: 'partial' } : classifySendResponse(status, undefined);

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
 * A read of the v2 observations list, the only Langfuse read Tau makes: every
 * v3 read (trace detail, sessions, scores) answers 410 for new organisations
 * and is sunset on 2026-11-16.
 *
 * @param target - The project.
 * @param query - The filters and paging parameters.
 * @returns The request URL.
 */
const observationsUrl = (target: LangfuseTarget, query: Readonly<Record<string, string>>): URL => {
  const url = new URL('/api/public/v2/observations', target.baseUrl);
  for (const [name, value] of Object.entries(query)) {
    url.searchParams.set(name, value);
  }
  return url;
};

/**
 * Langfuse v4 ingestion and read-back for agent evidence. It never logs or
 * returns request or response bodies: the span carries customer content.
 */
/*
 * Only Tau's settlements, by the one name v4.3 and v5 share; every other observation is left unread, since the Langfuse
 * dashboards score runs (LQ10) and no interval list is ever read back (LF-31).
 */
const observationRow = (item: unknown): LangfuseObservationRow[] => {
  const id = field(item, 'id');
  const startTime = field(item, 'startTime');
  const metadata = field(item, 'metadata');
  return typeof id === 'string' &&
    field(item, 'name') === settlementObservationName &&
    typeof startTime === 'string' &&
    typeof metadata === 'object' &&
    metadata !== null
    ? [{ id, startTime, metadata: metadata as Record<string, unknown> }]
    : [];
};

export class LangfuseClient {
  public constructor(
    private readonly target: LangfuseTarget,
    private readonly timeoutMilliseconds: number,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  /**
   * Send one receipt's complete observation, in one request.
   *
   * @param spans - The spans one receipt writes, its object first.
   * @param signal - Aborts the request on shutdown; an abort is uncertain.
   * @returns What the attempt established.
   */
  public async send(spans: readonly OtlpSpan[], signal?: AbortSignal): Promise<SendOutcome> {
    const deadline = AbortSignal.timeout(this.timeoutMilliseconds);
    try {
      const response = await this.fetcher(new URL('/api/public/otel/v1/traces', this.target.baseUrl), {
        method: 'POST',
        headers: {
          authorization: authorization(this.target),
          'content-type': 'application/json',
          'x-langfuse-ingestion-version': '4',
        },
        body: otlpBody(spans),
        signal: signal === undefined ? deadline : AbortSignal.any([deadline, signal]),
        redirect: 'error',
      });
      return classifySendResponse(response.status, await readJson(response));
    } catch (error) {
      return classifySendError(error);
    }
  }

  /**
   * Write one score with `POST /api/public/scores`, as an array of one that names the project's score config. A score
   * whose config id is not set is held and never sent without it. An uncertain answer repeats the identical body, at
   * most {@link scoreAttempts} sends in all; nothing is ever read back.
   *
   * @param score - The score, with its fixed id and timestamp.
   * @param signal - Aborts the request on shutdown; an abort is uncertain.
   * @returns What the write established.
   */
  public async score(score: LangfuseScore, signal?: AbortSignal): Promise<ScoreOutcome> {
    const configId = this.target.scoreConfigs?.[score.name];
    if (configId === undefined) {
      return { kind: 'held', reason: 'config-unset' };
    }
    const { id, traceId, observationId, name, value, dataType, timestamp, environment } = score;
    const body = JSON.stringify([
      { id, traceId, observationId, name, value, dataType, configId, timestamp, environment },
    ]);
    let outcome: SendOutcome = { kind: 'uncertain', reason: 'unsent' };
    for (let attempt = 0; attempt < scoreAttempts && outcome.kind === 'uncertain'; attempt++) {
      const deadline = AbortSignal.timeout(this.timeoutMilliseconds);
      try {
        // oxlint-disable-next-line no-await-in-loop -- a repeat follows only an uncertain answer
        const response = await this.fetcher(new URL('/api/public/scores', this.target.baseUrl), {
          method: 'POST',
          headers: { authorization: authorization(this.target), 'content-type': 'application/json' },
          body,
          signal: signal === undefined ? deadline : AbortSignal.any([deadline, signal]),
          redirect: 'error',
        });
        outcome = classifyScoreResponse(response.status);
      } catch (error) {
        outcome = classifySendError(error);
      }
      if (signal?.aborted === true) {
        break;
      }
    }
    return outcome;
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
    const url = observationsUrl(this.target, {
      traceId: identity.traceId,
      fromStartTime: from.toISOString(),
      fields: 'core',
      limit: '100',
    });
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

  /**
   * Read Tau's observations in one environment and window, for the Langfuse
   * scorecard. Only the `core`, `basic` and `metadata` fields are requested, so no
   * input or output is ever read back.
   *
   * @param window - The environment, and the start-time bounds.
   * @param window.environment - The deployment the observations were written in.
   * @param window.from - Inclusive lower bound on start time.
   * @param window.to - Exclusive upper bound on start time.
   * @param pages - At most this many pages of 100.
   * @param signal - Aborts the read.
   * @returns The rows read, and whether that was the whole window.
   */
  public async observations(
    window: Readonly<{ environment: string; from: Date; to: Date }>,
    pages: number,
    signal?: AbortSignal,
  ): Promise<ObservationsRead> {
    const url = observationsUrl(this.target, {
      environment: window.environment,
      fromStartTime: window.from.toISOString(),
      toStartTime: window.to.toISOString(),
      fields: 'core,basic,metadata',
      limit: '100',
    });
    const rows: LangfuseObservationRow[] = [];
    try {
      for (let page = 0; page < pages; page++) {
        // oxlint-disable-next-line no-await-in-loop -- pages are cursor-ordered
        const response = await this.fetcher(url, {
          headers: { authorization: authorization(this.target) },
          signal:
            signal === undefined
              ? AbortSignal.timeout(this.timeoutMilliseconds)
              : AbortSignal.any([AbortSignal.timeout(this.timeoutMilliseconds), signal]),
          redirect: 'error',
        });
        if (!response.ok) {
          return { kind: 'partial', rows };
        }
        // oxlint-disable-next-line no-await-in-loop -- the body belongs to this page
        const body = await readJson(response);
        const data = field(body, 'data');
        if (!Array.isArray(data)) {
          return { kind: 'partial', rows };
        }
        rows.push(...data.flatMap((item: unknown) => observationRow(item)));
        const cursor = field(field(body, 'meta'), 'cursor');
        if (typeof cursor !== 'string' || cursor.length === 0) {
          return { kind: 'complete', rows };
        }
        url.searchParams.set('cursor', cursor);
      }
      return { kind: 'partial', rows };
    } catch {
      return { kind: 'partial', rows };
    }
  }

  /**
   * Ask Langfuse to delete whole traces, with every observation and score on
   * them. Deletion is idempotent, so any failure is retried later.
   *
   * @param traceIds - The traces to delete, at most a bounded batch.
   * @param signal - Aborts the request.
   * @returns Accepted, or retry with a bounded reason.
   */
  public async deleteTraces(traceIds: readonly string[], signal?: AbortSignal): Promise<DeleteOutcome> {
    const deadline = AbortSignal.timeout(this.timeoutMilliseconds);
    try {
      const response = await this.fetcher(new URL('/api/public/traces', this.target.baseUrl), {
        method: 'DELETE',
        headers: { authorization: authorization(this.target), 'content-type': 'application/json' },
        body: JSON.stringify({ traceIds }),
        signal: signal === undefined ? deadline : AbortSignal.any([deadline, signal]),
        redirect: 'error',
      });
      return response.ok ? { kind: 'accepted' } : { kind: 'retry', reason: `http-${response.status}` };
    } catch (error) {
      return { kind: 'retry', reason: classifySendError(error).kind === 'not-sent' ? 'unreachable' : 'transport' };
    }
  }
}
