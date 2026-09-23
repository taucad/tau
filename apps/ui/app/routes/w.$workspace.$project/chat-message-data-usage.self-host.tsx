import type { UsageData } from '@taucad/chat';
import { useModels } from '#hooks/use-models.js';
import { externalAgentDisplayName } from '#lib/agent-host-placement.js';
import { ChatMessageUsage, sumUsageTokens } from '#routes/w.$workspace.$project/chat-message-usage.js';

export const usageOperationIds = (): string[] => [];
export type ReceiptCredit = { readonly status: 'unavailable' };
export type ReceiptTotal = { readonly creditAtoms: bigint; readonly pending: number };
export const useReceiptCredits = (): ReadonlyMap<string, ReceiptCredit> => new Map();
export const sumReceiptCredits = (): ReceiptTotal => ({ creditAtoms: 0n, pending: 0 });
export const formatReceiptTotal = (): string => '';

/** Self-host has no receipts: the same button and card, without a credits line. */
export function ChatMessageDataUsage({
  usageParts,
}: {
  readonly usageParts: readonly UsageData[];
}): React.JSX.Element | undefined {
  const { resolveModel } = useModels();
  const lastUsage = usageParts.at(-1);
  if (lastUsage === undefined) {
    return undefined;
  }
  return (
    <ChatMessageUsage
      model={resolveModel(lastUsage.model)}
      agent={lastUsage.agent === undefined ? undefined : externalAgentDisplayName(lastUsage.agent)}
      totals={sumUsageTokens(usageParts)}
      turns={usageParts.length}
      reference={lastUsage.attemptId}
    />
  );
}
