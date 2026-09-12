import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { metaConfig } from '#constants/meta.constants.js';
import { purgeSavedUsage } from '#db/billing-snapshot-store.js';
import type { SavedUsageScope } from '#db/billing-snapshot-store.js';

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

/**
 * Other tabs and windows of the same origin learn about a logout, account
 * switch or closure here. Messages carry the surviving account namespace only —
 * never a token, cookie or balance.
 */
const purgeChannelName = `${metaConfig.databasePrefix}financial-session-purge`;
const purgeMessageSchema = z.object({
  keep: z.object({ environment: z.string(), ownerId: z.string() }).nullable(),
});

const removeBillingState = (queryClient: QueryClient): void => {
  void queryClient.cancelQueries({ queryKey: billingKey });
  queryClient.removeQueries({ queryKey: billingKey });
  for (const mutation of queryClient.getMutationCache().getAll()) {
    if (mutation.options.mutationKey?.[0] === 'billing') {
      queryClient.getMutationCache().remove(mutation);
    }
  }
};

/**
 * Owns financial request cancellation and generation within one rendered app
 * instance, and is the single place a logout, account switch or closure clears
 * billing query state, this device's saved usage snapshots and the local
 * profile — then tells the other tabs to do the same (B4 R5).
 *
 * ponytail: the channel opens in a passive effect, so the very first `bind` of
 * a mounting tree does not announce. That carries no information other tabs do
 * not already have — they were told when the switch itself happened. A
 * module-level channel with a subscriber set is the upgrade if a mount-time
 * announcement ever matters.
 */
export function FinancialSessionProvider({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  const queryClient = useQueryClient();
  const generation = useRef(0);
  const abort = useRef(new AbortController());
  const identity = useRef<FinancialSessionIdentity | undefined>(undefined);

  const channel = useRef<BroadcastChannel | undefined>(undefined);

  /** Drops this tab's financial state, keeping only `keep`'s saved usage. */
  const purgeHere = useCallback(
    (keep?: SavedUsageScope): void => {
      generation.current += 1;
      abort.current.abort();
      abort.current = new AbortController();
      removeBillingState(queryClient);
      void purgeSavedUsage(keep);
    },
    [queryClient],
  );
  const announce = useCallback((keep?: SavedUsageScope): void => {
    channel.current?.postMessage({ keep: keep ?? null });
  }, []);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') {
      return;
    }
    const open = new BroadcastChannel(purgeChannelName);
    // Node keeps the event loop alive for an open channel; browsers have no unref.
    (open as { unref?: () => void }).unref?.();
    channel.current = open;
    open.addEventListener('message', (event: MessageEvent) => {
      const message = purgeMessageSchema.safeParse(event.data);
      if (message.success) {
        // Never re-announce: the sender already reached every other tab.
        purgeHere(message.data.keep ?? undefined);
      }
    });
    return () => {
      channel.current = undefined;
      open.close();
    };
  }, [purgeHere]);

  const purge = useCallback(
    (_reason: FinancialSessionPurgeReason): void => {
      purgeHere();
      announce();
    },
    [announce, purgeHere],
  );
  const bind = useCallback(
    (next: FinancialSessionIdentity | undefined): void => {
      if (!sameIdentity(identity.current, next)) {
        // Binding an owner keeps that owner's saved usage: only the accounts
        // that are no longer selected lose theirs.
        const keep = next === undefined ? undefined : { environment: next.environment, ownerId: next.ownerId };
        purgeHere(keep);
        announce(keep);
        identity.current = next;
      }
    },
    [announce, purgeHere],
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
