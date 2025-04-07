import { ToolInvocationUIPart } from '@ai-sdk/ui-utils';
import { ChatMessageToolWeb } from './chat-message-tool-web';

export function ChatMessageTool({ part }: { part: ToolInvocationUIPart }) {
  switch (part.toolInvocation.toolName) {
    case 'web': {
      return <ChatMessageToolWeb part={part} />;
    }
    default: {
      // @ts-expect-error -- TODO: fix module augmentation for ToolInvocation
      const exhaustiveCheck: never = part.toolInvocation.toolName;
      throw new Error(`Unknown tool: ${exhaustiveCheck}`);
    }
  }
}
