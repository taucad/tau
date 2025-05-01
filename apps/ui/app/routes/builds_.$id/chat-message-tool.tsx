import type { ToolInvocationUIPart } from '@ai-sdk/ui-utils';
import type { JSX } from 'react';
import { ChatMessageToolWebSearch } from './chat-message-tool-web-search.js';
import { ChatMessageToolTransfer, transferToStartingWith } from './chat-message-tool-transfer.js';
import { ChatMessageToolWebBrowser } from './chat-message-tool-web-browser.js';

export function ChatMessageTool({ part }: { readonly part: ToolInvocationUIPart }): JSX.Element {
  switch (part.toolInvocation.toolName) {
    case 'web_search': {
      return <ChatMessageToolWebSearch part={part} />;
    }

    case 'web_browser': {
      return <ChatMessageToolWebBrowser part={part} />;
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
