import type { ReactNode } from 'react';
import type { UsageData } from '@taucad/chat';
import { useModels } from '#hooks/use-models.js';
import { externalAgentDisplayName } from '#lib/agent-host-placement.js';
import { ChatMessageUsage, sumUsageTokens } from '@taucad/billing-ui/components/usage/chat-message-usage';

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
      vendorReports={usageParts.flatMap((part) => (part.vendorReport === undefined ? [] : [part.vendorReport]))}
      agent={lastUsage.agent === undefined ? undefined : externalAgentDisplayName(lastUsage.agent)}
      totals={sumUsageTokens(usageParts)}
      turns={usageParts.length}
      reference={lastUsage.attemptId}
    />
  );
}

/** A build with no credits shows what the caller passes instead (adaptive app deployment mode W5). */
export function ReceiptCreditsSummary({
  fallback,
}: {
  readonly operationIds: readonly string[];
  readonly className?: string;
  readonly fallback?: ReactNode;
}): ReactNode {
  return fallback;
}
