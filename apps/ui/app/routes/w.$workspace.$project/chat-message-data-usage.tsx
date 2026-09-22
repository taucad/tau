import { useQueries } from '@tanstack/react-query';
import type { UsageData } from '@taucad/chat';
import { formatCreditAtomsDisplay, wireOperationReceiptSchema } from '@taucad/billing';
import type { WireOperationReceipt } from '@taucad/billing';
import { useBillingSession } from '@taucad/billing/hooks/billing-session';
import { useModels } from '#hooks/use-models.js';
import { externalAgentDisplayName } from '#lib/agent-host-placement.js';
import { ChatMessageUsage, sumUsageTokens } from '#routes/w.$workspace.$project/chat-message-usage.js';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';
import { recordBillingRevisionMinimum } from '#db/billing-snapshot-store.js';

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
 * ponytail: one GET per distinct operation, deduped by React Query. A batch
 * receipt endpoint is the upgrade path if a project's operation count ever
 * makes the fan-out visible.
 *
 * @param operationIds - Operations to resolve; duplicates are collapsed.
 * @returns Resolved credits by operation id.
 * @public
 */
export const useReceiptCredits = (operationIds: readonly string[]): ReadonlyMap<string, ReceiptCredit> => {
  const { apiBaseUrl, userId, environment } = useBillingSession();
  const ids = [...new Set(operationIds)].sort();
  const results = useQueries({
    queries: ids.map((operationId) => ({
      queryKey: ['billing', 'operation', apiBaseUrl, userId, environment, operationId],
      enabled: userId !== undefined && apiBaseUrl !== undefined && environment !== undefined,
      // Terminal receipts are immutable; only an unresolved operation is polled.
      staleTime: Number.POSITIVE_INFINITY,
      refetchInterval: ({ state }: { state: { data?: WireOperationReceipt } }) =>
        state.data === undefined || state.data.state === 'pending' ? 5000 : false,
      queryFn: async ({ signal }: { signal: AbortSignal }): Promise<WireOperationReceipt> => {
        const response = await fetch(`${apiBaseUrl}/v1/billing/operations/${encodeURIComponent(operationId)}`, {
          credentials: 'include',
          signal,
        });
        if (!response.ok) {
          throw new Error(`Operation receipt request failed with ${response.status}`);
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
      },
    })),
  });
  const credits = new Map<string, ReceiptCredit>();
  for (const [index, operationId] of ids.entries()) {
    const receipt = results[index]?.data;
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
 * Per-turn usage beside a chat message: Tau credits from the operation's own
 * receipt, with the provider's token counts as the explanation.
 *
 * @param props - The turn's usage parts, in order.
 * @returns The usage button and its hover card, or nothing when there is no usage.
 */
export function ChatMessageDataUsage({
  usageParts,
}: {
  readonly usageParts: UsageData[];
}): React.JSX.Element | undefined {
  const { resolveModel } = useModels();
  const [showCredits] = useCookie(cookieName.chatModelCost, true);
  const operationIds = usageOperationIds(usageParts);
  const credits = useReceiptCredits(operationIds);

  const lastUsage = usageParts.at(-1);
  if (lastUsage === undefined) {
    return undefined;
  }

  const tauBilled = operationIds.length > 0;
  const summary = tauBilled ? formatReceiptTotal(sumReceiptCredits(operationIds, credits)) : 'Not billed';
  return (
    <ChatMessageUsage
      model={resolveModel(lastUsage.model)}
      agent={lastUsage.agent === undefined ? undefined : externalAgentDisplayName(lastUsage.agent)}
      totals={sumUsageTokens(usageParts)}
      turns={usageParts.length}
      credits={showCredits ? summary : undefined}
      reference={lastUsage.attemptId}
    />
  );
}
