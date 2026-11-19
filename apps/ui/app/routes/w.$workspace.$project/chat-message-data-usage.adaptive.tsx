/* The Cloud implementation's props (TypeScript resolves the unaliased specifier to it); types only. */
import type { ChatMessageDataUsage as CloudChatMessageDataUsage } from '#routes/w.$workspace.$project/chat-message-data-usage.js';
import type { ComponentProps } from 'react';
import { FundedSurface } from '#cloud/cloud-surface.js';
import {
  ChatMessageDataUsage as SelfHostChatMessageDataUsage,
  ReceiptCreditsSummary as SelfHostReceiptCreditsSummary,
} from '#routes/w.$workspace.$project/chat-message-data-usage.self-host.js';

/** Per-message credits, from the Cloud chunk while funded; the receipt hooks stay inside the chunk. */
export function ChatMessageDataUsage(
  props: ComponentProps<typeof CloudChatMessageDataUsage>,
): React.JSX.Element | undefined {
  return (
    <FundedSurface
      fallback={<SelfHostChatMessageDataUsage {...props} />}
      render={(cloud) => <cloud.ChatMessageDataUsage {...props} />}
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
