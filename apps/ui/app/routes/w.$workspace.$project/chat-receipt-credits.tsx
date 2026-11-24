import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useLayoutEffect, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@taucad/ui/components/button';
import { formatCredits } from '@taucad/billing-ui/utils/credits.utils';
import type { UsageData } from '@taucad/chat';
import { formatCreditAtomsDisplay, wireOperationReceiptSchema } from '@taucad/billing';
import type { WireOperationReceipt } from '@taucad/billing';
import { useBillingSession } from '@taucad/billing/hooks/billing-session';
import { recordBillingRevisionMinimum } from '@taucad/billing-ui/db/billing-snapshot-store';
import { recordApiRequestId } from '@taucad/ui-core/lib/api-request-id';
import { createAskDeadlines } from '#lib/ask-deadline.js';

/*
 * The receipt reader, its helpers and the credit leaves the Cloud chunk carries (adaptive app deployment mode W5). A
 * Cloud-only module: unaliased, importing no facade and no route leaf, so in an adaptive build it is reached from the
 * Cloud chunk and never shares a module with a route chunk (gate G1, one-way dependency). The facades render their own
 * cards and tables in Core and take only these credit leaves from the chunk.
 */

/**
 * What the account's own authority says one funded operation cost (W9 D2, R4; charter I15).
 *
 * - `pending` and `settled`: the API's answer.
 * - `checking`: no answer yet, for at most one ask deadline.
 * - `unavailable`: "Can't check", with Retry: the API answered that it cannot read the receipt, or no answer came
 *   within the deadline (offline, signed out of billing, a failed or refused read). A late answer still resolves it.
 *
 * @public
 */
export type ReceiptCredit =
  | { readonly status: 'pending'; readonly authorizedMaxCreditAtoms: bigint }
  | { readonly status: 'settled'; readonly chargedCreditAtoms: bigint }
  | { readonly status: 'checking' }
  | { readonly status: 'unavailable' };

/** The receipts' person-visible waits, one deadline per operation (I15). @public */
export const receiptDeadlines = createAskDeadlines();

/** The receipts a surface reads, and its Retry. @public */
export type ReceiptCredits = Readonly<{
  credits: ReadonlyMap<string, ReceiptCredit>;
  /** Ask again for every receipt without an answer, starting its deadline again. */
  retry: () => void;
}>;

const creditOf = (receipt: WireOperationReceipt): ReceiptCredit => {
  switch (receipt.state) {
    case 'terminal': {
      return { status: 'settled', chargedCreditAtoms: BigInt(receipt.receipt.chargedCreditAtoms) };
    }
    case 'pending': {
      return { status: 'pending', authorizedMaxCreditAtoms: BigInt(receipt.authorizedMaxCreditAtoms) };
    }
    case 'unavailable': {
      return { status: 'unavailable' };
    }
  }
};

/** The funded operations one set of usage parts was charged through. @public */
export const usageOperationIds = (usageParts: readonly UsageData[]): string[] => {
  const ids = new Set<string>();
  for (const usage of usageParts) {
    if (usage.operationId !== undefined) {
      ids.add(usage.operationId);
    }
  }
  return [...ids].sort();
};

/**
 * Reads the authoritative receipt for every named operation.
 *
 * This is the single receipt reader for every chat surface — the per-message
 * badge, the chat footer, the project total and the agents pane all call it, so
 * one owner holds the owner/environment check and the immutability rule. A
 * settled receipt never changes, so it is fetched once and cached; only a
 * pending operation is polled. A read that fails, or that answers for another
 * account or environment, yields no answer: the operation reads `checking` for
 * one ask deadline and then `unavailable` ("Can't check", with Retry), never a
 * zero, never a locally multiplied figure (B4 R2) and never an open-ended
 * "Pending" (I15). Only the API's own pending answer reads "Pending".
 *
 * ponytail: one GET per distinct unsettled operation. A batch
 * receipt endpoint is the upgrade path if a project's operation count ever
 * makes the fan-out visible.
 *
 * @param operationIds - Operations to resolve; duplicates are collapsed.
 * @returns Credits by operation id, one for every operation, and the Retry.
 * @public
 */
export const useReceiptCredits = (operationIds: readonly string[]): ReceiptCredits => {
  const { apiBaseUrl, userId, environment } = useBillingSession();
  const queryClient = useQueryClient();
  const ids = [...new Set(operationIds)].sort();
  const signedIn = userId !== undefined && apiBaseUrl !== undefined && environment !== undefined;
  const readReceipt = async (operationId: string, signal: AbortSignal): Promise<WireOperationReceipt> => {
    const response = await fetch(`${apiBaseUrl}/v1/billing/operations/${encodeURIComponent(operationId)}`, {
      credentials: 'include',
      signal,
    });
    if (!response.ok) {
      throw recordApiRequestId(new Error(`Operation receipt request failed with ${response.status}`), response);
    }
    const receipt = wireOperationReceiptSchema.parse(await response.json());
    if (receipt.ownerId !== userId || receipt.environment !== environment) {
      throw new Error('Receipt belongs to a different billing session');
    }
    if (receipt.operationId !== operationId) {
      throw new Error('Receipt answers for a different operation');
    }
    await recordBillingRevisionMinimum({
      environment: receipt.environment,
      ownerId: receipt.ownerId,
      subjectId: receipt.subjectId,
      revision: receipt.snapshotRevision,
    });
    return receipt;
  };
  /* One query for the set, each receipt cached under its own key: a terminal receipt is immutable and read from the
   * cache, and only a pending or unread one is fetched again (`useQueries` is not used, so the Cloud chunk shares no
   * query module with a route chunk, gate G1). */
  const { data, refetch } = useQuery<ReadonlyMap<string, WireOperationReceipt>>({
    queryKey: ['billing', 'operations', apiBaseUrl, userId, environment, ids],
    enabled: signedIn && ids.length > 0,
    refetchInterval: ({ state }) =>
      state.data === undefined || ids.some((id) => state.data?.get(id)?.state !== 'terminal') ? 5000 : false,
    queryFn: async ({ signal }): Promise<ReadonlyMap<string, WireOperationReceipt>> => {
      const read = await Promise.all(
        ids.map(async (operationId) => {
          const key = ['billing', 'operation', apiBaseUrl, userId, environment, operationId];
          const cached = queryClient.getQueryData<WireOperationReceipt>(key);
          if (cached?.state === 'terminal') {
            return [operationId, cached] as const;
          }
          try {
            const receipt = await queryClient.query({
              queryKey: key,
              staleTime: 0,
              queryFn: async () => readReceipt(operationId, signal),
            });
            return [operationId, receipt] as const;
          } catch {
            return undefined;
          }
        }),
      );
      return new Map(read.filter((entry) => entry !== undefined));
    },
  });
  /* The operations with no answer wait one deadline each; the timers live in the module store, and the layout effect
   * only says which waits are on screen. */
  const unanswered = ids.filter((operationId) => data?.get(operationId) === undefined);
  const unansweredKey = JSON.stringify(unanswered);
  useLayoutEffect(() => {
    for (const operationId of JSON.parse(unansweredKey) as string[]) {
      receiptDeadlines.start(operationId);
    }
  }, [unansweredKey]);
  const readExpired = useCallback(
    () =>
      (JSON.parse(unansweredKey) as string[]).filter((operationId) => receiptDeadlines.expired(operationId)).join(' '),
    [unansweredKey],
  );
  const expired = new Set(
    useSyncExternalStore(receiptDeadlines.subscribe, readExpired, () => '')
      .split(' ')
      .filter(Boolean),
  );
  const retry = useCallback(() => {
    for (const operationId of ids) {
      const state = data?.get(operationId)?.state;
      if (state === undefined || state === 'unavailable') {
        receiptDeadlines.restart(operationId);
      }
    }
    void refetch();
  }, [data, ids, refetch]);
  const credits = new Map<string, ReceiptCredit>();
  for (const operationId of ids) {
    const receipt = data?.get(operationId);
    credits.set(
      operationId,
      receipt === undefined ? { status: expired.has(operationId) ? 'unavailable' : 'checking' } : creditOf(receipt),
    );
  }
  return { credits, retry };
};

/** Settled credits plus the operations still without one, by why. @public */
export type ReceiptTotal = {
  readonly creditAtoms: bigint;
  /** The API says these are still settling. */
  readonly pending: number;
  /** No answer yet, inside the deadline. */
  readonly checking: number;
  /** "Can't check" (I15). */
  readonly unavailable: number;
};

/**
 * Sums only the receipts that actually resolved, and counts the rest by why.
 *
 * @param operationIds - Operations the surface is totalling.
 * @param credits - Resolved receipts from {@link useReceiptCredits}.
 * @returns The settled total and the count still unresolved.
 * @public
 */
export const sumReceiptCredits = (
  operationIds: readonly string[],
  credits: ReadonlyMap<string, ReceiptCredit>,
): ReceiptTotal => {
  let creditAtoms = 0n;
  let pending = 0;
  let checking = 0;
  let unavailable = 0;
  for (const operationId of new Set(operationIds)) {
    const credit = credits.get(operationId);
    switch (credit?.status) {
      case 'settled': {
        creditAtoms += credit.chargedCreditAtoms;
        break;
      }
      case 'pending': {
        pending += 1;
        break;
      }
      case 'unavailable': {
        unavailable += 1;
        break;
      }
      case 'checking':
      case undefined: {
        checking += 1;
        break;
      }
    }
  }
  return { creditAtoms, pending, checking, unavailable };
};

/** The words a receipt with no figure reads as (I15). @public */
export const receiptWaitCopy = { pending: 'Pending', checking: 'Checking', unavailable: 'Can’t check' } as const;

/** Short credit summary used by every chat surface's badge or footer. @public */
export const formatReceiptTotal = ({ creditAtoms, pending, checking, unavailable }: ReceiptTotal): string => {
  /* The worst wait names the label: a stated "can't check" before a check in flight before the API's own pending. */
  const wait: keyof typeof receiptWaitCopy = unavailable > 0 ? 'unavailable' : checking > 0 ? 'checking' : 'pending';
  const count = { unavailable, checking, pending }[wait];
  if (count === 0) {
    return formatCreditAtomsDisplay(creditAtoms);
  }
  if (creditAtoms === 0n) {
    return receiptWaitCopy[wait];
  }
  return `${formatCreditAtomsDisplay(creditAtoms)} · ${String(count)} ${receiptWaitCopy[wait].toLowerCase()}`;
};

/** The Retry beside a "Can't check" receipt (I15). */
function ReceiptRetry({ onRetry }: { readonly onRetry: () => void }): React.JSX.Element {
  return (
    <Button variant='outline' size='xs' className='ml-2' onClick={onRetry}>
      Retry
    </Button>
  );
}

/**
 * The credits a set of operations was charged, as one short label (W5): the leaf the chat details and the agents list
 * mount, so no receipt hook crosses the Cloud boundary.
 *
 * @param props - The operations, a class for the label and what to show without a total.
 * @returns The label.
 */
export function ReceiptCreditsSummary({
  operationIds,
  className,
}: {
  readonly operationIds: readonly string[];
  readonly className?: string;
  /** What a build or mode without credits shows instead; unused here. */
  readonly fallback?: ReactNode;
}): React.JSX.Element {
  const { credits, retry } = useReceiptCredits(operationIds);
  const total = sumReceiptCredits(operationIds, credits);
  const summary = formatReceiptTotal(total);
  return (
    <>
      <span aria-label={`Tau credits: ${summary}`} className={className}>
        {summary}
      </span>
      {total.unavailable > 0 ? <ReceiptRetry onRetry={retry} /> : undefined}
    </>
  );
}

/**
 * The per-turn credits line as text, handed to the caller's own usage card: "Not billed" when no operation was funded.
 * A "Can't check" line comes with its Retry.
 *
 * @param props - The turn's funded operations, and the card that shows the text.
 * @returns The card.
 */
export function ReceiptCreditsText({
  operationIds,
  children,
}: {
  readonly operationIds: readonly string[];
  readonly children: (summary: string, retry: (() => void) | undefined) => ReactNode;
}): ReactNode {
  const { credits, retry } = useReceiptCredits(operationIds);
  if (operationIds.length === 0) {
    return children('Not billed', undefined);
  }
  const total = sumReceiptCredits(operationIds, credits);
  return children(formatReceiptTotal(total), total.unavailable > 0 ? retry : undefined);
}

/**
 * The project's charged total beneath the chat usage table.
 *
 * @param props - The project's funded operations.
 * @returns The line.
 */
export function ProjectCreditsLine({ operationIds }: { readonly operationIds: readonly string[] }): React.JSX.Element {
  const { credits, retry } = useReceiptCredits(operationIds);
  const total = sumReceiptCredits(operationIds, credits);
  const { checking, unavailable } = total;
  return (
    <p className='border-t px-3 py-2 text-xs text-muted-foreground'>
      {operationIds.length === 0 ? (
        'No Tau-funded turns in this project.'
      ) : (
        <>
          <span className='font-mono text-foreground'>{formatCredits(total.creditAtoms)}</span> charged
          {total.pending > 0 ? ` · ${String(total.pending)} pending` : ''}
          {checking > 0 ? ` · ${String(checking)} checking` : ''}
          {unavailable > 0 ? ` · ${String(unavailable)} can’t check` : ''}
          {unavailable > 0 ? <ReceiptRetry onRetry={retry} /> : undefined}
        </>
      )}
    </p>
  );
}
