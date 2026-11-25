/**
 * The browser's system skill bundles, as the overlay a composed view merges.
 *
 * Two workers compose a view over the same checkout — the file-manager worker
 * for the user and the agent host worker for the agent — and both need the same
 * overlay data. Building it here keeps one producer for one set of bundles; the
 * merge itself is `composeView`'s and exists once (charter D1).
 *
 * Each realm that imports this module holds one content-addressed resource
 * cache, so a generated resource is fetched at most once per realm while it
 * stays within the cache budget, and every view the realm composes shares it.
 *
 * @module
 */

import {
  createCachedSkillResourceReader,
  createSkillBundleOverlay,
  createSkillBundleRegistry,
} from '@taucad/agent-tools/registry';
import type { ReadSkillResource, SkillResourceCacheStats } from '@taucad/agent-tools/registry';
import { workerTimings } from '@taucad/filesystem';
import type { ComposedViewOverlay } from '@taucad/filesystem/composed-view';
import { systemSkillBundles } from '@taucad/skills/resources';

const registry = createSkillBundleRegistry(systemSkillBundles);

/* How long one request may go without answering, how long its body may take after that, and how many requests one
 * read makes. A resource is an immutable, content-addressed file on the app's own static host, normally answered in
 * tens of milliseconds, so a request that has not answered in ten seconds is stalled, not slow. */
const answerMilliseconds = 10_000;
const bodyMilliseconds = 60_000;
const attempts = 3;
const retryDelayMilliseconds = 500;

const ioError = (message: string): Error => Object.assign(new Error(message), { code: 'EIO' });

/** A stalled or overloaded host may answer the next request; a missing or forbidden resource will not. */
const isTransientStatus = (status: number): boolean => status === 408 || status === 429 || status >= 500;

type Attempt = Readonly<{ bytes: Uint8Array<ArrayBuffer> } | { failure: Error; retry: boolean }>;

/** One bounded request: the answer within `answerMilliseconds`, then its body within `bodyMilliseconds`. */
const attemptFetch = async (url: string): Promise<Attempt> => {
  const stop = new AbortController();
  let phase: 'answer' | 'body' = 'answer';
  let timer = setTimeout(() => {
    stop.abort();
  }, answerMilliseconds);
  try {
    const response = await fetch(url, { signal: stop.signal });
    if (!response.ok) {
      /* Nothing reads a refused answer's body: release it rather than hold the connection open for it. */
      stop.abort();
      return {
        failure: ioError(`Resource request failed with HTTP ${String(response.status)}.`),
        retry: isTransientStatus(response.status),
      };
    }
    clearTimeout(timer);
    phase = 'body';
    timer = setTimeout(() => {
      stop.abort();
    }, bodyMilliseconds);
    return { bytes: new Uint8Array(await response.arrayBuffer()) };
  } catch (error) {
    return {
      failure: stop.signal.aborted
        ? ioError(
            phase === 'answer'
              ? `Resource request was not answered within ${String(answerMilliseconds / 1000)} s.`
              : `Resource body did not arrive within ${String(bodyMilliseconds / 1000)} s.`,
          )
        : ioError(`Resource request failed: ${error instanceof Error ? error.message : String(error)}`),
      retry: true,
    };
  } finally {
    clearTimeout(timer);
  }
};

/* The cache owns the request, so no caller's signal reaches it: one caller
 * giving up must not abort the bytes another is waiting for. That leaves this
 * reader as the only bound on the request: an unbounded one held a turn for
 * five minutes on a single stalled response (launch audit PERF-2), so each
 * request has a deadline and a failure the host may recover from is asked
 * again before the read fails. */
const fetchResource: ReadSkillResource = async (resource) => {
  let failure: Error | undefined;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) {
      // oxlint-disable-next-line no-await-in-loop -- attempts are sequential by design: each follows the last one's failure.
      await new Promise((resolve) => {
        setTimeout(resolve, retryDelayMilliseconds * attempt);
      });
    }
    // oxlint-disable-next-line no-await-in-loop -- attempts are sequential by design: each follows the last one's failure.
    const result = await attemptFetch(resource.url);
    if ('bytes' in result) {
      return result.bytes;
    }
    ({ failure } = result);
    if (!result.retry) {
      break;
    }
  }
  throw failure ?? ioError('Resource request failed.');
};

/* Each caller gets its own copy: a bridge reply may transfer the buffer it is
 * handed, which would detach the cached bytes for every later read. */
const resources = createCachedSkillResourceReader(fetchResource, {
  copy: true,
  onEvent: (event) => {
    if (event === 'read') {
      workerTimings.count('overlay.read');
    } else if (event === 'fetch') {
      workerTimings.count('overlay.fetch');
    }
  },
});

/**
 * The system skill overlay for this build.
 *
 * @returns The overlay `composeView` composes at `.agents/skills`.
 * @public
 */
export const systemSkillsOverlay = (): ComposedViewOverlay => createSkillBundleOverlay(registry, resources.read);

/**
 * This realm's system skill resource cache counters.
 *
 * @returns Fetches, cache hits, retained bytes and evictions since the realm started.
 * @public
 */
export const systemSkillResourceStats = (): SkillResourceCacheStats => resources.stats();
