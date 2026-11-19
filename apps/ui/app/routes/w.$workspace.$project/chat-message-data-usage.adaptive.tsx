/* The Cloud implementation's props (TypeScript resolves the unaliased specifier to it); types only. */
import type { ChatMessageDataUsage as CloudChatMessageDataUsage } from '#routes/w.$workspace.$project/chat-message-data-usage.js';
import type { ComponentProps } from 'react';
import { cookieName } from '@taucad/ui-core/constants/cookie.constants';
import { FundedSurface } from '#cloud/cloud-surface.js';
import { useCookie } from '#hooks/use-cookie.js';
import {
  ChatMessageDataUsage as SelfHostChatMessageDataUsage,
  ReceiptCreditsSummary as SelfHostReceiptCreditsSummary,
} from '#routes/w.$workspace.$project/chat-message-data-usage.self-host.js';

/**
 * Per-message usage: the card is Core's, and while funded the Cloud chunk supplies only the credits text from the
 * turn's receipts (gate G1, one-way dependency: the chunk shares no route module).
 */
export function ChatMessageDataUsage(
  props: ComponentProps<typeof CloudChatMessageDataUsage>,
): React.JSX.Element | undefined {
  const [showCredits] = useCookie(cookieName.chatModelCost, true);
  const operationIds = [
    ...new Set(props.usageParts.flatMap((part) => (part.operationId === undefined ? [] : [part.operationId]))),
  ].sort();
  return (
    <FundedSurface
      fallback={<SelfHostChatMessageDataUsage {...props} />}
      render={(cloud) => (
        <cloud.ReceiptCreditsText operationIds={operationIds}>
          {(summary) => <SelfHostChatMessageDataUsage {...props} credits={showCredits ? summary : undefined} />}
        </cloud.ReceiptCreditsText>
      )}
    />
  );
}

/** The credits label from the Cloud chunk while funded; the caller's fallback otherwise. */
export function ReceiptCreditsSummary(props: ComponentProps<typeof SelfHostReceiptCreditsSummary>): React.JSX.Element {
  return (
    <FundedSurface
      fallback={<SelfHostReceiptCreditsSummary {...props} />}
      render={(cloud) => <cloud.ReceiptCreditsSummary {...props} />}
    />
  );
}
