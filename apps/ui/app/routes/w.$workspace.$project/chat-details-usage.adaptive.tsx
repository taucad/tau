import type { ComponentProps } from 'react';
import { CloudSurface } from '#cloud/cloud-surface.js';
import { useCloudFunded } from '#cloud/cloud-mode.js';
import { ChatDetailsUsage as SelfHostChatDetailsUsage } from '#routes/w.$workspace.$project/chat-details-usage.self-host.js';

/** The adaptive facade of the chat details usage (adaptive app deployment mode W2 skeleton): self-host until W5. */
export function ChatDetailsUsage(
  props: ComponentProps<typeof SelfHostChatDetailsUsage> = {},
): React.JSX.Element | undefined {
  const funded = useCloudFunded();
  return <CloudSurface enabled={funded} fallback={<SelfHostChatDetailsUsage {...props} />} render={() => undefined} />;
}
