import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';

export type FinancialSessionIdentity = {
  readonly apiBaseUrl: string;
  readonly environment: string;
  readonly ownerId: string;
};

export type FinancialSessionRequest = {
  readonly generation: number;
  readonly signal: AbortSignal;
  readonly isCurrent: () => boolean;
};

export type FinancialSessionPurgeReason = 'closure' | 'logout' | 'owner_changed';

type FinancialSessionController = {
  readonly capture: () => FinancialSessionRequest;
  readonly purge: (reason: FinancialSessionPurgeReason) => void;
  readonly bind: (identity: FinancialSessionIdentity | undefined) => void;
};

const FinancialSessionContext = createContext<FinancialSessionController | undefined>(undefined);
const billingKey = ['billing'] as const;

const removeBillingState = (queryClient: QueryClient): void => {
  void queryClient.cancelQueries({ queryKey: billingKey });
  queryClient.removeQueries({ queryKey: billingKey });
  for (const mutation of queryClient.getMutationCache().getAll()) {
    if (mutation.options.mutationKey?.[0] === 'billing') {
      queryClient.getMutationCache().remove(mutation);
    }
  }
};

/** Owns financial request cancellation and generation within one rendered app instance. */
export function FinancialSessionProvider({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  const queryClient = useQueryClient();
  const generation = useRef(0);
  const abort = useRef(new AbortController());
  const identity = useRef<FinancialSessionIdentity | undefined>(undefined);

  const purge = useCallback(
    (_reason: FinancialSessionPurgeReason): void => {
      generation.current += 1;
      abort.current.abort();
      abort.current = new AbortController();
      removeBillingState(queryClient);
    },
    [queryClient],
  );
  const bind = useCallback(
    (next: FinancialSessionIdentity | undefined): void => {
      if (!sameIdentity(identity.current, next)) {
        purge('owner_changed');
        identity.current = next;
      }
    },
    [purge],
  );
  const capture = useCallback((): FinancialSessionRequest => {
    const capturedGeneration = generation.current;
    const { signal } = abort.current;
    return {
      generation: capturedGeneration,
      signal,
      isCurrent: () => !signal.aborted && generation.current === capturedGeneration,
    };
  }, []);
  const value = useMemo(() => ({ bind, capture, purge }), [bind, capture, purge]);
  return <FinancialSessionContext.Provider value={value}>{children}</FinancialSessionContext.Provider>;
}

export const useFinancialSession = (): FinancialSessionController => {
  const value = useContext(FinancialSessionContext);
  if (value === undefined) {
    throw new Error('FinancialSessionProvider is missing');
  }
  return value;
};

export const useOptionalFinancialSession = (): FinancialSessionController | undefined =>
  useContext(FinancialSessionContext);

/** Prevents a newly observed owner scope from rendering until the previous financial scope is purged. */
export function FinancialSessionScope({
  identity,
  children,
}: {
  readonly identity: FinancialSessionIdentity | undefined;
  readonly children: React.ReactNode;
}): React.ReactNode {
  const controller = useFinancialSession();
  const [committed, setCommitted] = useState(identity);
  const changed = !sameIdentity(committed, identity);
  useLayoutEffect(() => {
    controller.bind(identity);
    if (changed) {
      // oxlint-disable-next-line react/set-state-in-effect -- children stay gated until the old owner is synchronously purged
      setCommitted(identity);
    }
  }, [changed, controller, identity]);
  return changed ? undefined : children;
}

function sameIdentity(
  left: FinancialSessionIdentity | undefined,
  right: FinancialSessionIdentity | undefined,
): boolean {
  return (
    left?.apiBaseUrl === right?.apiBaseUrl &&
    left?.environment === right?.environment &&
    left?.ownerId === right?.ownerId
  );
}
