import { dehydrate, QueryClient } from '@tanstack/react-query';
import type { DehydratedState } from '@tanstack/react-query';
import { getEnvironment } from '#environment.config.js';
import { catalogFreshness, modelsQueryKey, readModelCatalog } from '#lib/model-catalog.js';
import type { Model } from '#lib/model-catalog.js';

/** Longest a document waits for a cold catalog fetch before rendering without it. Milliseconds. */
const prefetchTimeout = 1500;

/** How long a failed fetch keeps documents from waiting on the API again. Milliseconds. */
const failureBackoff = 30_000;

/** A catalog the server fetched, and when: the client measures its freshness from the same instant. */
export type ServerModelCatalog = {
  readonly models: readonly Model[];
  readonly fetchedAt: number;
};

/**
 * A per-process cache of the public model catalog. It is fresh for the same {@link catalogFreshness} as the browser
 * query; a stale copy is served while one refresh runs, and a failure backs off instead of making every document wait.
 *
 * @param options - The catalog fetcher and clock; tests inject both.
 * @returns A reader that resolves to the catalog, or `undefined` when none could be had in time.
 */
export const createModelCatalogCache = ({
  fetchCatalog,
  now = Date.now,
}: {
  readonly fetchCatalog: () => Promise<readonly Model[]>;
  readonly now?: () => number;
}): (() => Promise<ServerModelCatalog | undefined>) => {
  let cached: ServerModelCatalog | undefined;
  let failedAt: number | undefined;
  let inFlight: Promise<ServerModelCatalog | undefined> | undefined;

  const refresh = async (): Promise<ServerModelCatalog | undefined> => {
    inFlight ??= (async () => {
      try {
        const models = await fetchCatalog();
        cached = { models, fetchedAt: now() };
        failedAt = undefined;
        return cached;
      } catch (error) {
        failedAt = now();
        // The message names a status or a network failure, never a request header or a body.
        console.warn(`The model catalog prefetch failed: ${error instanceof Error ? error.message : 'unknown error'}`);
        return undefined;
      } finally {
        inFlight = undefined;
      }
    })();
    return inFlight;
  };

  return async () => {
    const time = now();
    const isBackingOff = failedAt !== undefined && time - failedAt < failureBackoff;
    if (cached !== undefined) {
      if (time - cached.fetchedAt >= catalogFreshness && !isBackingOff) {
        void refresh();
      }
      return cached;
    }
    return isBackingOff ? undefined : refresh();
  };
};

/**
 * Fetch `/v1/models` from the server. The catalog is public and the same for every visitor, so the request carries no
 * cookies or credentials: the document render stays session-neutral and nothing of the visitor's leaves the server.
 *
 * @returns The catalog rows.
 */
const fetchServerCatalog = async (): Promise<readonly Model[]> => {
  const { TAU_API_URL: apiUrl } = await getEnvironment();
  return readModelCatalog(
    await fetch(`${apiUrl.replace(/\/$/, '')}/v1/models`, {
      credentials: 'omit',
      // eslint-disable-next-line @typescript-eslint/naming-convention -- HTTP header name retains TitleCase on the wire
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(prefetchTimeout),
    }),
  );
};

/** The process's model catalog, for the root loader. */
export const getServerModelCatalog = createModelCatalogCache({
  fetchCatalog: fetchServerCatalog,
});

/**
 * The catalog as React Query state the root `QueryClient` hydrates, stamped with the server's fetch time so the
 * browser neither refetches a fresh copy nor keeps a stale one.
 *
 * @param catalog - The server's catalog.
 * @returns The dehydrated query state.
 */
export const dehydrateModelCatalog = (catalog: ServerModelCatalog): DehydratedState => {
  const client = new QueryClient();
  client.setQueryData(modelsQueryKey, catalog.models, {
    updatedAt: catalog.fetchedAt,
  });
  return dehydrate(client);
};

/**
 * The root loader's query state: the model catalog when the server has one, so the composer's model label renders
 * with its display name on the server and on hydration.
 *
 * @returns The dehydrated state, or `undefined` when the catalog is unavailable.
 */
export const prefetchModelCatalog = async (): Promise<DehydratedState | undefined> => {
  const catalog = await getServerModelCatalog();
  return catalog === undefined ? undefined : dehydrateModelCatalog(catalog);
};
