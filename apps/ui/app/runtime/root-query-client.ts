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

const shouldRetrySessionQuery = (failureCount: number, error: unknown): boolean => {
  const status =
    error !== null && typeof error === 'object' && 'status' in error && typeof error.status === 'number'
      ? error.status
      : undefined;
  return failureCount < 2 && (status === undefined || status < 400 || status >= 500);
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

  return client;
};
