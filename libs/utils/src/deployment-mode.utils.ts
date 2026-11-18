/**
 * `@taucad/utils/deployment-mode`: the hosts' deployment port (D1). It reads an API origin's `GET /v1/deployment`
 * answer through the per-origin answer cache and maps it to the mode a run starts under: `funded` or `unfunded` for an
 * explicit answer, `unknown` for anything else, which the agent host refuses as `DEPLOYMENT_UNKNOWN` (I1). Browser-safe:
 * no Node import, so the web worker, the desktop services host and the Tau Host daemon share it.
 */
import { deploymentAnswerPath, parseDeploymentAnswer } from '@taucad/types/deployment';
import type { DeploymentAnswer } from '@taucad/types/deployment';
import { createMemoryAnswerStore, createOriginAnswerResolver, createStorageAnswerStore } from '#origin-answer.utils.js';
import type { AnswerStorage, AnswerStore, CachedAnswer, MaxAgeBounds, OriginAnswer } from '#origin-answer.utils.js';

/** The mode a run starts under, as the agent host's deployment port answers it. @public */
export type DeploymentMode = 'funded' | 'unfunded' | 'unknown';

/** Input to {@link createDeploymentModeResolver}. @public */
export type DeploymentModeResolverInput = Readonly<{
  /**
   * Durable storage for the cached answer, such as the page's `localStorage`. Omitted, or answering `undefined` (a
   * worker, a blocked store), the answer is kept in memory only. Never shared across origins: one key per origin.
   */
  storage?: (() => AnswerStorage | undefined) | undefined;
  fetch?: typeof globalThis.fetch | undefined;
  /** The clock, epoch milliseconds; defaults to `Date.now`. */
  now?: (() => number) | undefined;
  /**
   * Milliseconds before a request is abandoned (then a stale answer within the grace window, else `unknown`); defaults
   * to {@link deploymentModeDefaults.requestTimeout}.
   */
  requestTimeout?: number | undefined;
}>;

/** Reads the mode for an API origin. @public */
export type DeploymentModeResolver = Readonly<{
  /**
   * The mode for the origin of `url`. Never rejects: a URL with no origin, like any failure, is `unknown`. Only the
   * origin of `url` is used, so the question is always `GET <origin>/v1/deployment`; an API served under a path prefix
   * is not supported (I5).
   *
   * @param url - The API origin, or any URL on it (the gateway base URL); only its origin is used.
   */
  mode(url: string): Promise<DeploymentMode>;
  /** The full resolution for the origin of `url`, for a caller that wants the answer itself or the failure reason. */
  resolve(url: string): Promise<OriginAnswer<DeploymentAnswer>>;
}>;

/**
 * The cache bounds every host uses.
 *
 * - `maxAgeBounds`: the API sends 300 s. At least 60 s, so an API that sends 0 does not cost a request per run; at most
 *   an hour, so a host notices an API that changed edition within the hour.
 * - `staleGraceSeconds`: a day. A stale answer stands in only when this route fails, and a model call needs the same
 *   API, so it covers a route-only outage (a `5xx` on `/v1/deployment` while the gateway answers) without turning an
 *   API that was never answered into `unfunded`.
 * - `requestTimeout`: 5 s, well inside the agent host's 10 s bound on the deployment ask, so a hanging route gives up
 *   while a stale answer can still stand in; at 10 s the agent host would refuse the run `unknown` first.
 *
 * @public
 */
export const deploymentModeDefaults = {
  maxAgeBounds: { minimum: 60, maximum: 3600 } satisfies MaxAgeBounds,
  staleGraceSeconds: 86_400,
  requestTimeout: 5000,
} as const;

/** The storage key prefix; the origin follows it. @public */
export const deploymentAnswerKeyPrefix = 'tau-deployment-answer:';

/**
 * What an API without the route (HTTP `404`) reads as: not funded, as a self-host API that predates it (I2, I7). Only a
 * `404` maps here; a timeout, another status, a malformed body or a refused connection is `unknown`.
 */
const absentAnswer: DeploymentAnswer = {
  version: 1,
  edition: 'self-host',
  billing: { funded: false },
  maxAgeSeconds: 0,
};

const parseBody = (body: unknown): Readonly<{ answer: DeploymentAnswer; maxAgeSeconds: number }> | undefined => {
  const parsed = parseDeploymentAnswer(body);
  return parsed.status === 'valid' ? { answer: parsed.answer, maxAgeSeconds: parsed.answer.maxAgeSeconds } : undefined;
};

/** A cached answer; `absent` marks the reading of a `404`, which never stands in for a later failure (I2). */
type DeploymentEntry = CachedAnswer<DeploymentAnswer> & Readonly<{ absent?: true }>;

const parseCached = (value: unknown): DeploymentEntry | undefined => {
  if (typeof value !== 'object' || value === null || !('answer' in value) || !('expiresAt' in value)) {
    return undefined;
  }
  const { expiresAt } = value;
  const parsed = parseDeploymentAnswer(value.answer);
  if (parsed.status !== 'valid' || typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) {
    return undefined;
  }
  return 'absent' in value && value.absent === true
    ? { answer: parsed.answer, expiresAt, absent: true }
    : { answer: parsed.answer, expiresAt };
};

/**
 * One origin's store: memory first, mirrored into `storage` when there is one, so a worker with no `localStorage`
 * still caches, and a page reload reuses a stored answer. A corrupt stored entry reads as empty. A `404`'s reading is
 * kept only while fresh: expired, it reads as empty, so a failure after it is `unknown`, never a stale `unfunded`
 * (I2). A valid answer may still stand in within the grace window.
 */
const originStore = (
  origin: string,
  storage: DeploymentModeResolverInput['storage'],
  now: () => number,
): AnswerStore<CachedAnswer<DeploymentAnswer>> => {
  const memory = createMemoryAnswerStore<DeploymentEntry>();
  const stored =
    storage === undefined
      ? undefined
      : createStorageAnswerStore({ storage, key: `${deploymentAnswerKeyPrefix}${origin}`, parse: parseCached });
  return {
    read: () => {
      const entry = memory.read() ?? stored?.read();
      return entry?.absent === true && now() >= entry.expiresAt ? undefined : entry;
    },
    write: (value) => {
      const entry: DeploymentEntry = value.answer === absentAnswer ? { ...value, absent: true } : value;
      memory.write(entry);
      stored?.write(entry);
    },
  };
};

/**
 * Map a resolution to a run's mode: `funded` only for a valid answer that says so, `unfunded` for one that says not or
 * for an API without the route, `unknown` otherwise.
 *
 * @param resolution - The answer cache's resolution.
 * @returns The mode.
 * @public
 */
export const deploymentModeOf = (resolution: OriginAnswer<DeploymentAnswer>): DeploymentMode => {
  if (resolution.state === 'unknown') {
    return 'unknown';
  }
  return resolution.answer.billing.funded ? 'funded' : 'unfunded';
};

/**
 * Create the deployment port a host passes as `billing.deployment` to `createGatewayModelTransport`. Answers are cached
 * per exact origin with the answer's `maxAge` inside {@link deploymentModeDefaults}, and a stale answer stands in within
 * the grace window only when the request fails.
 *
 * @example <caption>A host's deployment port</caption>
 * ```typescript
 * import { createGatewayModelTransport } from '@taucad/agent-host';
 * import { createDeploymentModeResolver } from '@taucad/utils/deployment-mode';
 *
 * const baseUrl = 'https://api.tau.new/';
 * const deployment = createDeploymentModeResolver({ storage: () => globalThis.localStorage });
 * const transport = createGatewayModelTransport({
 *   baseUrl,
 *   billing: { deployment: async () => deployment.mode(baseUrl) },
 * });
 * ```
 * @param input - Optional storage, fetch, clock and request timeout.
 * @returns The resolver.
 * @public
 */
export const createDeploymentModeResolver = (input: DeploymentModeResolverInput = {}): DeploymentModeResolver => {
  const stores = new Map<string, AnswerStore<CachedAnswer<DeploymentAnswer>>>();
  const now = input.now ?? Date.now;
  const resolver = createOriginAnswerResolver<DeploymentAnswer>({
    path: deploymentAnswerPath,
    parse: parseBody,
    maxAgeBounds: deploymentModeDefaults.maxAgeBounds,
    staleGraceSeconds: deploymentModeDefaults.staleGraceSeconds,
    absent: absentAnswer,
    store: (origin) => {
      const existing = stores.get(origin) ?? originStore(origin, input.storage, now);
      stores.set(origin, existing);
      return existing;
    },
    /* Read per request, not bound at creation, so a host's later fetch instrumentation is used. */
    fetch: input.fetch ?? (async (request, init) => globalThis.fetch(request, init)),
    now,
    requestTimeout: input.requestTimeout ?? deploymentModeDefaults.requestTimeout,
  });
  const resolve = async (url: string): Promise<OriginAnswer<DeploymentAnswer>> => {
    try {
      return await resolver.resolve(url);
    } catch {
      return { state: 'unknown', reason: 'network' };
    }
  };
  return {
    resolve,
    mode: async (url) => deploymentModeOf(await resolve(url)),
  };
};
