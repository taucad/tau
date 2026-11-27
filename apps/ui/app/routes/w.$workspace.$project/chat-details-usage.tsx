import type { ComponentProps } from 'react';
import { FundedSurface } from '#cloud/cloud-surface.js';
import { ChatDetailsUsage as SelfHostChatDetailsUsage } from '#routes/w.$workspace.$project/chat-details-usage.unfunded.js';
import { ChatDetailsUsageTable } from '#routes/w.$workspace.$project/chat-details-usage-table.js';

/** The chat's usage: Core's table, with the credits line from the Cloud chunk while funded (gate G1). */
export function ChatDetailsUsage(
  props: ComponentProps<typeof SelfHostChatDetailsUsage> = {},
): React.JSX.Element | undefined {
  return (
    <FundedSurface
      fallback={<SelfHostChatDetailsUsage {...props} />}
      render={(cloud) => (
        <ChatDetailsUsageTable
          isEnabled={props.enabled ?? true}
          credits={(operationIds) => <cloud.ProjectCreditsLine operationIds={operationIds} />}
        />
      )}
    />
  );
}
