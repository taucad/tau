/**
 * The browser `QueryClient` the app runtime creates (app state orchestration charter D9; plan § 4 A2).
 *
 * The runtime builds one per runtime: the client entry's held runtime gives the browser one client for the page's
 * life, above the billing fence, and each server request's runtime gives that request its own. `root-layout.tsx` hands
 * the runtime's instance to `QueryClientProvider`, and the project library writes the listing into the same cache.
 */
import { QueryClient } from '@tanstack/react-query';
import { authQueryKeys } from '@better-auth-ui/core';
import { toast } from 'sonner';
import { authErrorMessage, betterFetchErrorBodyMessage } from '@taucad/ui-core/utils/auth-error.utils';
import { installQueryRevalidation } from '#runtime/query-revalidation.js';

/**
 * Toast a query error, unless the query handles its errors itself.
 *
 * @param error - The query's error.
 * @param metadata - The query's `meta`.
 * @public
 */
export const handleQueryError = (error: unknown, metadata: Readonly<Record<string, unknown>> | undefined): void => {
  if (metadata?.['handlesErrorLocally'] === true) {
    return;
  }
  const message = betterFetchErrorBodyMessage(error);
  if (message !== undefined) {
    toast.error(message);
  }
};

const statusOf = (error: unknown): number | undefined =>
  error !== null && typeof error === 'object' && 'status' in error && typeof error.status === 'number'
    ? error.status
    : undefined;

const shouldRetrySessionQuery = (failureCount: number, error: unknown): boolean => {
  const status = statusOf(error);
  return failureCount < 2 && (status === undefined || status < 400 || status >= 500);
};

/**
 * How often a session check that failed for a network reason is asked again while the page is visible (W9 R2). A
 * machine can report itself online while Tau's API is unreachable (a VPN, a captive portal, the API down), so no
 * `online` event ever comes; this re-check is what brings the person and Billing back within A3's 10 s, with no
 * reload. A `401` is an answer, not a failure, and is never re-asked on a timer. Milliseconds.
 *
 * @public
 */
export const sessionRecheckMilliseconds = 5000;

/**
 * The session query's re-check while its last check failed for a network reason.
 *
 * @param query - The session query's state.
 * @returns The interval, or `false` while the last check answered.
 * @public
 */
export const sessionRecheckInterval = (
  query: Readonly<{ state: Readonly<{ status: string; error: unknown }> }>,
): number | false => {
  if (query.state.status !== 'error') {
    return false;
  }
  const status = statusOf(query.state.error);
  return status === undefined || status >= 500 ? sessionRecheckMilliseconds : false;
};

/**
 * Applies the one shared session query's freshness and failure policy.
 *
 * @param client - The app's root query client.
 * @public
 */
export function configureSessionQueryDefaults(client: QueryClient): void {
  client.setQueryDefaults(authQueryKeys.session, {
    retry: shouldRetrySessionQuery,
    retryOnMount: false,
    staleTime: 30_000,
    refetchInterval: sessionRecheckInterval,
  });
}

/**
 * Create the app's root query client, with the defaults `root-layout.tsx` gave it.
 *
 * @returns The client.
 * @public
 */
export const createRootQueryClient = (): QueryClient => {
  const client = new QueryClient({
    defaultOptions: {
      queries: { networkMode: 'offlineFirst' },
      mutations: { networkMode: 'offlineFirst' },
    },
  });

  // Surface unhandled better-auth-ui mutation/query errors as toasts. Inline
  // `onError` handlers on individual `useMutation` calls (e.g. sign-in) take
  // precedence and override this default, so we never double-toast.
  client.setMutationDefaults([], {
    onError: (error) => {
      toast.error(authErrorMessage(error));
    },
  });

  client.getQueryCache().config.onError = (error, query) => {
    handleQueryError(error, query.meta);
  };

  configureSessionQueryDefaults(client);
  /* W9 D1: reconnect and refocus revalidate every query, an offline launch included. The server has no window. */
  // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- globalThis.window is absent on the server.
  installQueryRevalidation(globalThis.window ?? undefined);

  return client;
};
