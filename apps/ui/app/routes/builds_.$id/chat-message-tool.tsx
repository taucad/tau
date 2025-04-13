import type { ToolInvocationUIPart } from '@ai-sdk/ui-utils';
import { ChatMessageToolWeb } from './chat-message-tool-web.js';
import { ChatMessageToolTransfer, transferToStartingWith } from './chat-message-tool-transfer.js';

export function ChatMessageTool({ part }: { readonly part: ToolInvocationUIPart }) {
  switch (part.toolInvocation.toolName) {
    case 'web': {
      return <ChatMessageToolWeb part={part} />;
    }

    default: {
      if (part.toolInvocation.toolName.startsWith(transferToStartingWith)) {
        return <ChatMessageToolTransfer part={part} />;
      }

      return (
        <div>
          <p>Unknown tool: {part.toolInvocation.toolName}</p>
          <pre className="text-xs">{JSON.stringify(part.toolInvocation, null, 2)}</pre>
        </div>
      );
      // // @ts-expect-error -- TODO: fix module augmentation for ToolInvocation
      // const exhaustiveCheck: never = part.toolInvocation.toolName;
      // throw new Error(`Unknown tool: ${String(exhaustiveCheck)}`);
    }
  }
}
