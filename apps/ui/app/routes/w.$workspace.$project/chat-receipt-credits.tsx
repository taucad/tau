import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { formatCredits } from '@taucad/ui-core/utils/credits.utils';
import type { UsageData } from '@taucad/chat';
import { formatCreditAtomsDisplay, wireOperationReceiptSchema } from '@taucad/billing';
import type { WireOperationReceipt } from '@taucad/billing';
import { useBillingSession } from '@taucad/billing/hooks/billing-session';
import { recordBillingRevisionMinimum } from '@taucad/billing-ui/db/billing-snapshot-store';
import { recordApiRequestId } from '@taucad/ui-core/lib/api-request-id';

/*
 * The receipt reader, its helpers and the credit leaves the Cloud chunk carries (adaptive app deployment mode W5). A
 * Cloud-only module: unaliased, importing no facade and no route leaf, so in an adaptive build it is reached from the
 * Cloud chunk and never shares a module with a route chunk (gate G1, one-way dependency). The facades render their own
 * cards and tables in Core and take only these credit leaves from the chunk.
 */

/** What the account's own authority says one funded operation cost. @public */
export type ReceiptCredit =
  | { readonly status: 'pending'; readonly authorizedMaxCreditAtoms: bigint }
  | { readonly status: 'settled'; readonly chargedCreditAtoms: bigint }
  | { readonly status: 'unavailable' };

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
 * account or environment, yields no entry at all: the caller then shows
 * "Pending", never a zero and never a locally multiplied figure (B4 R2).
 *
 * ponytail: one GET per distinct unsettled operation. A batch
 * receipt endpoint is the upgrade path if a project's operation count ever
 * makes the fan-out visible.
 *
 * @param operationIds - Operations to resolve; duplicates are collapsed.
 * @returns Resolved credits by operation id.
 * @public
 */
export const useReceiptCredits = (operationIds: readonly string[]): ReadonlyMap<string, ReceiptCredit> => {
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
  const { data } = useQuery<ReadonlyMap<string, WireOperationReceipt>>({
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
  const credits = new Map<string, ReceiptCredit>();
  for (const operationId of ids) {
    const receipt = data?.get(operationId);
    if (receipt) {
      credits.set(operationId, creditOf(receipt));
    }
  }
  return credits;
};

/** Settled credits plus the operations still without one. @public */
export type ReceiptTotal = { readonly creditAtoms: bigint; readonly pending: number };

/**
 * Sums only the receipts that actually resolved.
 *
 * ponytail: an `unavailable` receipt counts as pending. Separating the two in
 * an aggregate label is the upgrade path if authority reads start failing
 * often; the per-message detail already names the difference.
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
  for (const operationId of new Set(operationIds)) {
    const credit = credits.get(operationId);
    if (credit?.status === 'settled') {
      creditAtoms += credit.chargedCreditAtoms;
      continue;
    }
    pending += 1;
  }
  return { creditAtoms, pending };
};

/** Short credit summary used by every chat surface's badge or footer. @public */
export const formatReceiptTotal = ({ creditAtoms, pending }: ReceiptTotal): string => {
  if (pending === 0) {
    return formatCreditAtomsDisplay(creditAtoms);
  }
  if (creditAtoms === 0n) {
    return 'Pending';
  }
  return `${formatCreditAtomsDisplay(creditAtoms)} · ${String(pending)} pending`;
};

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
  const credits = useReceiptCredits(operationIds);
  const summary = formatReceiptTotal(sumReceiptCredits(operationIds, credits));
  return (
    <span aria-label={`Tau credits: ${summary}`} className={className}>
      {summary}
    </span>
  );
}

/**
 * The per-turn credits line as text, handed to the caller's own usage card: "Not billed" when no operation was funded.
 *
 * @param props - The turn's funded operations, and the card that shows the text.
 * @returns The card.
 */
export function ReceiptCreditsText({
  operationIds,
  children,
}: {
  readonly operationIds: readonly string[];
  readonly children: (summary: string) => ReactNode;
}): ReactNode {
  const credits = useReceiptCredits(operationIds);
  return children(
    operationIds.length === 0 ? 'Not billed' : formatReceiptTotal(sumReceiptCredits(operationIds, credits)),
  );
}

/**
 * The project's charged total beneath the chat usage table.
 *
 * @param props - The project's funded operations.
 * @returns The line.
 */
export function ProjectCreditsLine({ operationIds }: { readonly operationIds: readonly string[] }): React.JSX.Element {
  const credits = useReceiptCredits(operationIds);
  const total = sumReceiptCredits(operationIds, credits);
  return (
    <p className='border-t px-3 py-2 text-xs text-muted-foreground'>
      {operationIds.length === 0 ? (
        'No Tau-funded turns in this project.'
      ) : (
        <>
          <span className='font-mono text-foreground'>{formatCredits(total.creditAtoms)}</span> charged
          {total.pending > 0 ? ` · ${String(total.pending)} pending` : ''}
        </>
      )}
    </p>
  );
}
