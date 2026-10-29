import type { Evidence } from '#contract.js';
import { canonicalEvidence, evidenceKeys } from '#identity.js';

/*
 * Host evidence delivery (blueprint T09).
 *
 * The client side of the API's evidence ingress: a bounded pending queue bound
 * to one account, project and policy epoch, drained oldest first. Replay is
 * safe because the API deduplicates on immutable source identity and answers
 * a replay it will not dispatch with a durable `revoked` or `expired` receipt.
 * Nothing here retries forever, holds evidence past its expiry, or keeps it
 * once the grant it was captured under has gone.
 */

/** The media type the ingress route reads. @public */
export const evidenceContentType = 'application/vnd.tau.agent-evidence+json';

/** The API's durable answer for one envelope. @public */
export type EvidenceReceipt = Readonly<{
  receipt: string;
  disposition: 'accepted' | 'revoked' | 'expired';
  duplicate: boolean;
  receivedAt: string;
  expiresAt: string;
}>;

/** What one submission means for the envelope and its queue. @public */
export type SubmitOutcome =
  /** Held by the API; drop the local copy. */
  | Readonly<{ kind: 'receipt'; receipt: EvidenceReceipt }>
  /** Try again later; the envelope is unchanged. */
  | Readonly<{ kind: 'retry'; afterMilliseconds: number }>
  /** The grant this was captured under is no longer current: drop everything held under it. */
  | Readonly<{ kind: 'stale' }>
  /** The project is deleted from Tau Cloud: drop everything held for it. */
  | Readonly<{ kind: 'gone' }>
  /** The session is not signed in: stop until it is. */
  | Readonly<{ kind: 'unauthenticated' }>
  /** The API will never take this envelope: drop it and count why. */
  | Readonly<{ kind: 'refused'; code: string }>;

/** How a host reaches the API. `fetch` carries the session's credentials. @public */
export type EvidenceTransport = Readonly<{
  fetch: typeof fetch;
  /** The API origin, without a trailing slash. */
  baseUrl: string;
}>;

const defaultRetryMilliseconds = 30_000;

const codeOf = (body: unknown): string | undefined => {
  const code: unknown = typeof body === 'object' && body !== null ? Reflect.get(body, 'code') : undefined;
  return typeof code === 'string' && /^[A-Z_]{1,64}$/u.test(code) ? code : undefined;
};

const retryAfterOf = (response: Response, body: unknown): number => {
  const seconds: unknown =
    typeof body === 'object' && body !== null ? Reflect.get(body, 'retryAfterSeconds') : undefined;
  if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }
  const header = Number(response.headers.get('retry-after'));
  return Number.isFinite(header) && header >= 0 ? header * 1000 : defaultRetryMilliseconds;
};

const isReceipt = (body: unknown): body is EvidenceReceipt =>
  typeof body === 'object' &&
  body !== null &&
  typeof Reflect.get(body, 'receipt') === 'string' &&
  ['accepted', 'revoked', 'expired'].includes(Reflect.get(body, 'disposition') as string);

/**
 * Submit one envelope and say what its answer means. A transport failure, a
 * 5xx and a 429 are retries; an answer the API will repeat for these bytes is
 * final. Only the response's code is read, never echoed content.
 *
 * @param transport - How to reach the API.
 * @param evidence - The envelope, exactly as projected.
 * @param signal - Cancels the request; a cancelled send is a retry.
 * @returns The outcome.
 * @public
 */
export const submitEvidence = async (
  transport: EvidenceTransport,
  evidence: Evidence,
  signal?: AbortSignal,
): Promise<SubmitOutcome> => {
  let response: Response;
  try {
    response = await transport.fetch(`${transport.baseUrl}/v1/agent-observability/evidence`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': evidenceContentType },
      body: canonicalEvidence(evidence),
      ...(signal === undefined ? {} : { signal }),
    });
  } catch {
    return { kind: 'retry', afterMilliseconds: defaultRetryMilliseconds };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  const code = codeOf(body);
  if (response.ok) {
    return isReceipt(body)
      ? { kind: 'receipt', receipt: body }
      : { kind: 'retry', afterMilliseconds: defaultRetryMilliseconds };
  }
  if (response.status === 401) {
    return { kind: 'unauthenticated' };
  }
  if (response.status === 410) {
    return { kind: 'gone' };
  }
  if (code === 'EVIDENCE_POLICY_STALE' || code === 'EVIDENCE_PURPOSE') {
    return { kind: 'stale' };
  }
  if (response.status === 429 || response.status >= 500) {
    return { kind: 'retry', afterMilliseconds: retryAfterOf(response, body) };
  }
  return { kind: 'refused', code: code ?? `HTTP_${response.status}` };
};

/** The account, project and grant a queue is bound to. @public */
export type DeliveryScope = Readonly<{ principal: string; project: string; policyEpoch: string }>;

/** One envelope held for delivery, keyed by its immutable source identity. @public */
export type PendingEvidence = Readonly<{ key: string; evidence: Evidence; bytes: number }>;

/**
 * Where held envelopes live: memory, IndexedDB in a browser, a file on a Node
 * host. Each call is one atomic step; the outbox never assumes two are.
 *
 * @public
 */
export type PendingEvidenceStore = Readonly<{
  /** Hold one envelope unless its key is already held. */
  hold: (item: PendingEvidence) => Promise<'held' | 'duplicate'>;
  /** The oldest held envelopes, up to `limit`. */
  oldest: (limit: number) => Promise<readonly PendingEvidence[]>;
  /** Drop envelopes by key. */
  release: (keys: readonly string[]) => Promise<void>;
  /** Drop every envelope the predicate matches, and say how many. */
  purge: (match: (evidence: Evidence) => boolean) => Promise<number>;
  /** How many envelopes and bytes are held. */
  size: () => Promise<Readonly<{ items: number; bytes: number }>>;
}>;

/**
 * A pending store in memory, for tests and for hosts with nowhere durable to
 * write. It is lost on reload, which the gap counts then show.
 *
 * @returns The store.
 * @public
 */
export const memoryPendingStore = (): PendingEvidenceStore => {
  const items = new Map<string, PendingEvidence>();
  return {
    async hold(item) {
      if (items.has(item.key)) {
        return 'duplicate';
      }
      items.set(item.key, item);
      return 'held';
    },
    async oldest(limit) {
      return [...items.values()].slice(0, limit);
    },
    async release(keys) {
      for (const key of keys) {
        items.delete(key);
      }
    },
    async purge(match) {
      let purged = 0;
      for (const [key, item] of items) {
        if (match(item.evidence)) {
          items.delete(key);
          purged += 1;
        }
      }
      return purged;
    },
    async size() {
      let bytes = 0;
      for (const item of items.values()) {
        bytes += item.bytes;
      }
      return { items: items.size, bytes };
    },
  };
};

/** The bounds of one host's pending queue. @public */
export type OutboxLimits = Readonly<{ items: number; bytes: number; batch: number }>;

/** The default bounds: enough for a long offline session of summaries, never the device's disk. @public */
export const defaultOutboxLimits: OutboxLimits = Object.freeze({ items: 2000, bytes: 8 * 1024 * 1024, batch: 16 });

/** What the outbox did, counted by reason, for the host's own coverage report. @public */
export type OutboxCounts = Readonly<
  Record<
    'held' | 'duplicate' | 'outOfScope' | 'full' | 'accepted' | 'revoked' | 'expired' | 'stale' | 'gone' | 'refused',
    number
  >
>;

/** Where a drain stopped. @public */
export type DrainStop = 'empty' | 'unbound' | 'retry' | 'unauthenticated' | 'stale' | 'gone' | 'aborted';

/** Where a drain stopped, and when to try again after a retry. @public */
export type DrainResult = Readonly<{ stop: DrainStop; retryAfterMilliseconds?: number }>;

const zeroCounts = (): Record<keyof OutboxCounts, number> => ({
  held: 0,
  duplicate: 0,
  outOfScope: 0,
  full: 0,
  accepted: 0,
  revoked: 0,
  expired: 0,
  stale: 0,
  gone: 0,
  refused: 0,
});

const inScope = (scope: DeliveryScope, evidence: Evidence): boolean =>
  evidence.scope.principal === scope.principal &&
  evidence.scope.project === scope.project &&
  evidence.scope.policyEpoch === scope.policyEpoch;

/** What an outbox is built from. @public */
export type OutboxOptions = Readonly<{
  store: PendingEvidenceStore;
  submit: (evidence: Evidence, signal?: AbortSignal) => Promise<SubmitOutcome>;
  now: () => number;
  limits?: OutboxLimits;
}>;

/* Envelopes are held and sent one at a time, in order: each step's answer decides the next. */
/* eslint-disable no-await-in-loop -- sequential by design, see above. */

/**
 * A host's evidence outbox: one bounded queue bound to at most one scope.
 *
 * - Binding to another account, project or epoch purges everything held under
 *   the previous one first. A withdrawn grant leaves nothing to replay.
 * - Evidence for any other scope is refused, not queued.
 * - A full queue refuses new evidence and counts it: agent work never waits.
 * - A drain stops at the first retry, keeping order and the API's budget.
 *
 * @public
 */
export type EvidenceOutbox = Readonly<{
  /** Bind to the scope the server currently grants, or to none; answers how many held envelopes were purged. */
  bind: (scope: DeliveryScope | undefined) => Promise<number>;
  /** Queue envelopes for the bound scope; answers the counts so far. */
  enqueue: (evidence: readonly Evidence[]) => Promise<OutboxCounts>;
  /** Send held envelopes oldest first until empty or told to stop. A second call joins the running drain. */
  drain: (signal?: AbortSignal) => Promise<DrainResult>;
  /** The counts so far. */
  report: () => OutboxCounts;
}>;

/**
 * Create a host's evidence outbox.
 *
 * @param options - Its store, transport, clock and bounds.
 * @returns The outbox, bound to nothing until `bind` is called.
 * @public
 */
export const createEvidenceOutbox = (options: OutboxOptions): EvidenceOutbox => {
  const { store, submit, now } = options;
  const limits = options.limits ?? defaultOutboxLimits;
  const counts = zeroCounts();
  let bound: DeliveryScope | undefined;
  let draining: Promise<DrainResult> | undefined;

  const send = async (
    item: PendingEvidence,
    scope: DeliveryScope,
    signal?: AbortSignal,
  ): Promise<DrainResult | undefined> => {
    if (item.evidence.retention.expiresAt <= now()) {
      await store.release([item.key]);
      counts.expired += 1;
      return undefined;
    }
    const outcome = await submit(item.evidence, signal);
    switch (outcome.kind) {
      case 'receipt': {
        await store.release([item.key]);
        counts[outcome.receipt.disposition] += 1;
        return undefined;
      }
      case 'refused': {
        await store.release([item.key]);
        counts.refused += 1;
        return undefined;
      }
      case 'gone': {
        const { project } = item.evidence.scope;
        counts.gone += await store.purge((evidence) => evidence.scope.project === project);
        return { stop: 'gone' };
      }
      case 'stale': {
        /* Everything held under this epoch would get the same answer. */
        counts.stale += await store.purge((evidence) => evidence.scope.policyEpoch === scope.policyEpoch);
        return { stop: 'stale' };
      }
      case 'retry': {
        return { stop: 'retry', retryAfterMilliseconds: outcome.afterMilliseconds };
      }
      case 'unauthenticated': {
        return { stop: 'unauthenticated' };
      }
    }
  };

  const drainOnce = async (signal: AbortSignal | undefined): Promise<DrainResult> => {
    for (;;) {
      const scope = bound;
      if (scope === undefined) {
        return { stop: 'unbound' };
      }
      const batch = await store.oldest(limits.batch);
      if (batch.length === 0) {
        return { stop: 'empty' };
      }
      for (const item of batch) {
        if (signal?.aborted === true) {
          return { stop: 'aborted' };
        }
        if (bound !== scope) {
          break;
        }
        const stopped = await send(item, scope, signal);
        if (stopped !== undefined) {
          return stopped;
        }
      }
    }
  };

  const drainExclusively = async (signal: AbortSignal | undefined): Promise<DrainResult> => {
    try {
      return await drainOnce(signal);
    } finally {
      draining = undefined;
    }
  };

  return {
    async bind(scope) {
      bound = scope;
      return store.purge((evidence) => scope === undefined || !inScope(scope, evidence));
    },
    async enqueue(evidence) {
      for (const item of evidence) {
        if (bound === undefined || !inScope(bound, item)) {
          counts.outOfScope += 1;
          continue;
        }
        if (item.retention.expiresAt <= now()) {
          counts.expired += 1;
          continue;
        }
        const bytes = new TextEncoder().encode(canonicalEvidence(item)).byteLength;
        const size = await store.size();
        if (size.items + 1 > limits.items || size.bytes + bytes > limits.bytes) {
          counts.full += 1;
          continue;
        }
        const held = await store.hold({ key: evidenceKeys(item).source, evidence: item, bytes });
        counts[held] += 1;
      }
      return { ...counts };
    },
    async drain(signal) {
      draining ??= drainExclusively(signal);
      return draining;
    },
    report: () => ({ ...counts }),
  };
};
/* eslint-enable no-await-in-loop -- end of the sequential outbox. */
