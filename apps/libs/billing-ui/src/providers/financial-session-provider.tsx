import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { appMetaConfig } from '@taucad/ui-core/constants/meta.constants';
import { purgeSavedUsage } from '#db/billing-snapshot-database.js';
import { purgePendingPaymentActions } from '#lib/pending-payment-actions-purge.js';
import type { SavedUsageScope } from '#db/billing-snapshot-database.js';

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
  /** An owner's change (sign-in, sign-out, account switch): purge, keep the new owner's saved usage, tell other tabs. */
  readonly bind: (identity: FinancialSessionIdentity | undefined) => void;
  /**
   * The same owner's identity changed for another reason (the API stopped answering funded, or named another billing
   * environment): drop this tab's billing queries and abort requests in flight, keep every saved usage and tell no
   * other tab (adaptive app deployment mode D17 b).
   */
  readonly rebind: (identity: FinancialSessionIdentity | undefined) => void;
};

const FinancialSessionContext = createContext<FinancialSessionController | undefined>(undefined);
const billingKey = ['billing'] as const;

/**
 * Other tabs and windows of the same origin learn about a logout, account
 * switch or closure here. Messages carry the surviving account namespace only —
 * never a token, cookie or balance.
 */
const purgeChannelName = `${appMetaConfig.databasePrefix}financial-session-purge`;
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
      purgePendingPaymentActions(keep);
    },
    [queryClient],
  );
  /** Drops this tab's billing queries and requests in flight; saved usage stays (D17 b). */
  const dropHere = useCallback((): void => {
    generation.current += 1;
    abort.current.abort();
    abort.current = new AbortController();
    removeBillingState(queryClient);
  }, [queryClient]);
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
  const rebind = useCallback(
    (next: FinancialSessionIdentity | undefined): void => {
      if (!sameIdentity(identity.current, next)) {
        dropHere();
        identity.current = next;
      }
    },
    [dropHere],
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
  const value = useMemo(() => ({ bind, capture, purge, rebind }), [bind, capture, purge, rebind]);
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

/**
 * Scopes the billing consumers to one financial identity (adaptive app deployment mode charter D17). Three causes are
 * kept apart:
 *
 * - (a) The owner of a bound identity changes or signs out: today's rule. The previous owner's financial scope is
 *   purged (keeping the new owner's saved usage), the other tabs are told, and the children are withheld for one
 *   commit, which remounts them and resets the billing consumers' own React state.
 * - (b) The same owner's identity changes for another reason (the mode left `funded`, or the billing environment
 *   changed): this tab drops its billing queries and aborts requests in flight; saved usage is kept, no other tab is
 *   told and nothing remounts.
 * - (c) The owner changes while no identity is bound: nothing remounts and nothing is purged here, as in a self-host
 *   build (sign-out and account switch purge through their own path).
 *
 * A first identity after none binds without a remount: it purges billing query state and other accounts' saved usage
 * and tells the other tabs. In a pinned `cloud` build every identity names its owner, so only (a) occurs.
 *
 * @param props - The identity, the signed-in owner (the identity's owner by default) and the children.
 * @returns The children, or nothing for the one commit a cause (a) change withholds them.
 */
export function FinancialSessionScope({
  identity,
  ownerId = identity?.ownerId,
  children,
}: {
  readonly identity: FinancialSessionIdentity | undefined;
  /** The signed-in owner, bound or not; `undefined` when signed out. */
  readonly ownerId?: string | undefined;
  readonly children: React.ReactNode;
}): React.ReactNode {
  const controller = useFinancialSession();
  const [committed, setCommitted] = useState<{
    identity: FinancialSessionIdentity | undefined;
    ownerId: string | undefined;
  }>({ identity, ownerId });
  const identityChanged = !sameIdentity(committed.identity, identity);
  const ownerChanged = committed.ownerId !== ownerId;
  const changed = identityChanged || ownerChanged;
  /* (a): only a bound owner's change remounts. */
  const gated = changed && committed.identity !== undefined && ownerChanged;
  useLayoutEffect(() => {
    if (changed && committed.identity !== undefined && !ownerChanged) {
      controller.rebind(identity); // (b)
    } else {
      controller.bind(identity); // (a), a first identity, or no change (a no-op); (c) binds nothing to nothing
    }
    if (changed) {
      // oxlint-disable-next-line react/set-state-in-effect -- children stay gated until the old owner is synchronously purged
      setCommitted({ identity, ownerId });
    }
  }, [changed, committed.identity, controller, identity, ownerChanged, ownerId]);
  return gated ? undefined : children;
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
