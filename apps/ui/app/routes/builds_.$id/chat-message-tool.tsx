import type { ToolInvocationUIPart } from '@ai-sdk/ui-utils';
import type { JSX } from 'react';
import { ChevronRight, TriangleAlert } from 'lucide-react';
import { ChatMessageToolWebSearch } from './chat-message-tool-web-search.js';
import { ChatMessageToolTransfer, transferToStartingWith } from './chat-message-tool-transfer.js';
import { ChatMessageToolWebBrowser } from './chat-message-tool-web-browser.js';
import { ChatMessageToolFileEdit } from './chat-message-tool-file-edit.js';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible.js';

export function ChatMessageTool({ part }: { readonly part: ToolInvocationUIPart }): JSX.Element {
  switch (part.toolInvocation.toolName) {
    case 'web_search': {
      return <ChatMessageToolWebSearch part={part} />;
    }

    case 'web_browser': {
      return <ChatMessageToolWebBrowser part={part} />;
    }

    case 'file_edit': {
      return <ChatMessageToolFileEdit part={part} />;
    }

    default: {
      if (part.toolInvocation.toolName.startsWith(transferToStartingWith)) {
        return <ChatMessageToolTransfer part={part} />;
      }

      return (
        <Collapsible className="group/collapsible">
          <CollapsibleTrigger className="flex w-full flex-col gap-1 rounded-md border border-destructive/20 bg-destructive/10 p-1 pl-2 text-sm focus:outline-none">
            <div className="flex cursor-pointer items-center justify-between text-destructive">
              <div className="flex items-center gap-1">
                <TriangleAlert className="size-3" />
                <div>
                  <span>Unknown tool call:</span> <pre className="inline text-xs">{part.toolInvocation.toolName}</pre>
                </div>
              </div>
              <ChevronRight className="size-4 transition-transform duration-300 ease-in-out group-data-[state=open]/collapsible:rotate-90" />
            </div>
            <CollapsibleContent className="data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up self-start text-left">
              <pre className="text-xs">{JSON.stringify(part.toolInvocation, null, 2)}</pre>
            </CollapsibleContent>
          </CollapsibleTrigger>
        </Collapsible>
      );
      // // @ts-expect-error -- TODO: fix module augmentation for ToolInvocation
      // const exhaustiveCheck: never = part.toolInvocation.toolName;
      // throw new Error(`Unknown tool: ${String(exhaustiveCheck)}`);
    }
  }
}
