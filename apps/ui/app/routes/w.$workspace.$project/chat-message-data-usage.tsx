import type { ReactNode } from 'react';
import type { UsageData } from '@taucad/chat';
import { useModels } from '#hooks/use-models.js';
import { externalAgentDisplayName } from '#lib/agent-host-placement.js';
import {
  formatReceiptTotal,
  sumReceiptCredits,
  usageOperationIds,
  useReceiptCredits,
} from '#routes/w.$workspace.$project/chat-receipt-credits.js';
import { ChatMessageUsage, sumUsageTokens } from '@taucad/billing-ui/components/usage/chat-message-usage';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '@taucad/ui-core/constants/cookie.constants';

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
      vendorReports={usageParts.flatMap((part) => (part.vendorReport === undefined ? [] : [part.vendorReport]))}
      agent={lastUsage.agent === undefined ? undefined : externalAgentDisplayName(lastUsage.agent)}
      totals={sumUsageTokens(usageParts)}
      turns={usageParts.length}
      credits={showCredits ? summary : undefined}
      reference={lastUsage.attemptId}
    />
  );
}

/**
 * The credits a set of operations was charged, as one short label (adaptive app deployment mode W5): the leaf the chat
 * details and the agents list mount, so no receipt hook crosses the Cloud boundary.
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
