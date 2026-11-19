import type { ComponentProps } from 'react';
import { CloudSurface } from '#cloud/cloud-surface.js';
import { useCloudFunded } from '#cloud/cloud-mode.js';
import { ChatMessageDataUsage as SelfHostChatMessageDataUsage } from '#routes/w.$workspace.$project/chat-message-data-usage.self-host.js';

// oxlint-disable-next-line no-barrel-files/no-barrel-files -- W5 stops exporting the receipt hooks across the boundary.
export {
  formatReceiptTotal,
  sumReceiptCredits,
  usageOperationIds,
  useReceiptCredits,
} from '#routes/w.$workspace.$project/chat-message-data-usage.self-host.js';
// oxlint-disable-next-line no-barrel-files/no-barrel-files -- as above.
export type { ReceiptCredit, ReceiptTotal } from '#routes/w.$workspace.$project/chat-message-data-usage.self-host.js';

/** The adaptive facade of per-message credits (adaptive app deployment mode W2 skeleton): self-host until W5. */
export function ChatMessageDataUsage(
  props: ComponentProps<typeof SelfHostChatMessageDataUsage>,
): React.JSX.Element | undefined {
  const funded = useCloudFunded();
  return (
    <CloudSurface enabled={funded} fallback={<SelfHostChatMessageDataUsage {...props} />} render={() => undefined} />
  );
}
