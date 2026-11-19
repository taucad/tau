import { memo } from 'react';
import type { ComponentProps } from 'react';
import { CloudSurface } from '#cloud/cloud-surface.js';
import { useCloudFunded } from '#cloud/cloud-mode.js';
import { ChatModelSelector as SelfHostChatModelSelector } from '#components/chat/chat-model-selector.self-host.js';

/** The adaptive facade of the model selector (adaptive app deployment mode W2 skeleton): self-host until W5. */
export const ChatModelSelector = memo(function (props: ComponentProps<typeof SelfHostChatModelSelector>) {
  const funded = useCloudFunded();
  return <CloudSurface enabled={funded} fallback={<SelfHostChatModelSelector {...props} />} render={() => undefined} />;
});
