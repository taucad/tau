/* The Cloud implementation's props (TypeScript resolves the unaliased specifier to it); types only. */
import type { ChatDetailsUsage as CloudChatDetailsUsage } from '#routes/w.$workspace.$project/chat-details-usage.js';
import type { ComponentProps } from 'react';
import { FundedSurface } from '#cloud/cloud-surface.js';
import { ChatDetailsUsage as SelfHostChatDetailsUsage } from '#routes/w.$workspace.$project/chat-details-usage.self-host.js';
import { ChatDetailsUsageTable } from '#routes/w.$workspace.$project/chat-details-usage-table.js';

/** The chat's usage: Core's table, with the credits line from the Cloud chunk while funded (gate G1). */
export function ChatDetailsUsage(
  props: ComponentProps<typeof CloudChatDetailsUsage> = {},
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
