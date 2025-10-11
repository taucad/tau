import type { ToolInvocationUIPart } from '@ai-sdk/ui-utils';
import { ChatMessageToolUnknown } from '#routes/builds_.$id/chat-message-tool-unknown.js';
import { ChatMessageToolWebSearch } from '#routes/builds_.$id/chat-message-tool-web-search.js';
import { ChatMessageToolTransfer, transferToStartingWith } from '#routes/builds_.$id/chat-message-tool-transfer.js';
import { ChatMessageToolWebBrowser } from '#routes/builds_.$id/chat-message-tool-web-browser.js';
import { ChatMessageToolFileEdit } from '#routes/builds_.$id/chat-message-tool-file-edit.js';
import { ChatMessageToolImageAnalysis } from '#routes/builds_.$id/chat-message-tool-image-analysis.js';

export function ChatMessageTool({ part }: { readonly part: ToolInvocationUIPart }): React.JSX.Element {
  switch (part.toolInvocation.toolName) {
    case 'web_search': {
      return <ChatMessageToolWebSearch part={part} />;
    }

    case 'web_browser': {
      return <ChatMessageToolWebBrowser part={part} />;
    }

    case 'edit_file': {
      return <ChatMessageToolFileEdit part={part} />;
    }

    case 'analyze_image': {
      return <ChatMessageToolImageAnalysis part={part} />;
    }

    default: {
      if (part.toolInvocation.toolName.startsWith(transferToStartingWith)) {
        return <ChatMessageToolTransfer part={part} />;
      }

      return <ChatMessageToolUnknown part={part} />;
      // // @ts-expect-error -- TODO: fix module augmentation for ToolInvocation
      // const exhaustiveCheck: never = part.toolInvocation.toolName;
      // throw new Error(`Unknown tool: ${String(exhaustiveCheck)}`);
    }
  }
}
