import type { MyMetadata } from '@taucad/chat';
import { ChatMessageMetadataUsage } from '#routes/builds_.$id/chat-message-metadata-usage.js';

// Controller component for rendering message metadata
export function ChatMessageMetadata({ metadata }: { readonly metadata: MyMetadata }): React.JSX.Element | undefined {
  // Only render if we have usage cost data
  if (!metadata.usageCost) {
    return undefined;
  }

  return <ChatMessageMetadataUsage metadata={metadata} />;
}
