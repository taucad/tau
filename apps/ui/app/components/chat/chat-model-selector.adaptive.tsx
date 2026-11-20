import { memo } from 'react';
import type { ComponentProps } from 'react';
import { FundedSurface } from '#cloud/cloud-surface.js';
import { ChatModelSelector as SelfHostChatModelSelector } from '#components/chat/chat-model-selector.self-host.js';

/** The Cloud model selector while funded; the self-host selector otherwise (the surface table). */
export const ChatModelSelector = memo(function (props: ComponentProps<typeof SelfHostChatModelSelector>) {
  return (
    <FundedSurface
      fallback={<SelfHostChatModelSelector {...props} />}
      render={(cloud) => <cloud.ChatModelSelector {...props} />}
    />
  );
});
