import { deploymentAnswerPath, parseDeploymentAnswer } from '@taucad/types/deployment';
import { requestAnswer } from '@taucad/utils/origin-answer';
import { deploymentCeiling } from '#cloud/deployment-ceiling.js';
import type { DeploymentCeiling, DeploymentModeSnapshot } from '#cloud/deployment-mode.types.js';
import { classifyDeploymentAnswer } from '#runtime/deployment.js';
import type { DeploymentAskOutcome } from '#runtime/deployment.machine.js';

/**
 * The server's ask for the first snapshot (adaptive app deployment mode charter W11): the root loader asks the API's
 * `GET /v1/deployment` for the page's API origin with a 1 s deadline, through a per-process, per-origin cache, and
 * the document is rendered with the answer. A failure, a timeout or a `404` is no seed and never blocks the render; the
 * client then resolves as before (I2, I15). An adaptive build only: a pinned build asks nothing.
 */

/** How long the server's ask may run before the render goes on without a seed (I15). Milliseconds. @public */
export const deploymentSeedDeadlineMilliseconds = 1000;

/** How long an answer is kept per origin. Milliseconds. @public */
export const deploymentSeedAnswerLifetimeMilliseconds = 10 * 60 * 1000;

/** How long a failed ask is kept per origin, so a down route costs one ask per 30 s, not one per request. @public */
export const deploymentSeedFailureLifetimeMilliseconds = 30 * 1000;

/** Read the seed for a page's API URL. Never rejects. @public */
export type DeploymentSeedReader = (apiUrl: string | undefined) => Promise<DeploymentModeSnapshot | undefined>;

/** What a reader is built with. @public */
export type DeploymentSeedReaderOptions = Readonly<{
  ceiling?: DeploymentCeiling;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  deadlineMilliseconds?: number;
}>;

/**
 * The seed an ask's outcome gives: only an explicit answer. A `404` is none, because a trusted funded record on the
 * client outweighs it (D5) and the server cannot see the record.
 *
 * @param outcome - The classified outcome.
 * @returns The seed, or `undefined`.
 * @public
 */
export const deploymentSeedOfOutcome = (outcome: DeploymentAskOutcome): DeploymentModeSnapshot | undefined => {
  switch (outcome.kind) {
    case 'funded': {
      return { state: 'funded', basis: 'confirmed', environment: outcome.environment };
    }
    case 'unfunded': {
      return { state: 'unfunded', basis: 'confirmed' };
    }
    case 'unsupported':
    case 'misconfigured': {
      return { state: 'unknown', problem: outcome.kind };
    }
    case 'absent':
    case 'failed': {
      return undefined;
    }
  }
};

const originOf = (url: string | undefined): string | undefined => {
  if (url === undefined || url === '') {
    return undefined;
  }
  try {
    const { origin } = new URL(url);
    return origin === 'null' ? undefined : origin;
  } catch {
    return undefined;
  }
};

type CacheEntry = Readonly<{ seed: DeploymentModeSnapshot | undefined; expiresAt: number }>;

/**
 * Build a reader with its own cache.
 *
 * @param options - The ceiling, fetch, clock and deadline.
 * @returns The reader.
 * @public
 */
export const createDeploymentSeedReader = ({
  ceiling = deploymentCeiling,
  fetch = globalThis.fetch.bind(globalThis),
  now = Date.now,
  deadlineMilliseconds = deploymentSeedDeadlineMilliseconds,
}: DeploymentSeedReaderOptions = {}): DeploymentSeedReader => {
  const cache = new Map<string, CacheEntry>();
  /* Concurrent requests for one origin share one ask. */
  const inFlight = new Map<string, Promise<DeploymentModeSnapshot | undefined>>();
  const ask = async (origin: string): Promise<DeploymentModeSnapshot | undefined> => {
    const response = await requestAnswer({
      fetch,
      url: new URL(deploymentAnswerPath, origin).href,
      parse: (body) => {
        const parsed = parseDeploymentAnswer(body);
        return parsed.status === 'valid' ? parsed.answer : undefined;
      },
      requestTimeout: deadlineMilliseconds,
    });
    const at = now();
    const outcome: DeploymentAskOutcome =
      response.kind === 'answer'
        ? classifyDeploymentAnswer(response.body, at)
        : response.kind === 'absent'
          ? { kind: 'absent', revalidateMilliseconds: 0, at }
          : { kind: 'failed', reason: response.reason, at };
    const cacheLifetime =
      outcome.kind === 'failed' ? deploymentSeedFailureLifetimeMilliseconds : deploymentSeedAnswerLifetimeMilliseconds;
    const seed = deploymentSeedOfOutcome(outcome);
    cache.set(origin, { seed, expiresAt: at + cacheLifetime });
    return seed;
  };
  return async (apiUrl) => {
    const origin = ceiling === 'adaptive' ? originOf(apiUrl) : undefined;
    if (origin === undefined) {
      return undefined;
    }
    const cached = cache.get(origin);
    if (cached !== undefined && cached.expiresAt > now()) {
      return cached.seed;
    }
    const pending = inFlight.get(origin);
    if (pending !== undefined) {
      return pending;
    }
    const next = (async (): Promise<DeploymentModeSnapshot | undefined> => {
      try {
        return await ask(origin);
      } catch {
        return undefined; // `requestAnswer` never rejects; a defect renders without a seed and asks again next time.
      } finally {
        inFlight.delete(origin);
      }
    })();
    inFlight.set(origin, next);
    return next;
  };
};

/** The process's reader, for the root loader. @public */
export const readDeploymentSeed: DeploymentSeedReader = createDeploymentSeedReader();
