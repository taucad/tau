import { TriangleAlert, ChevronRight } from 'lucide-react';
import type { UIMessagePart } from 'ai';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '#components/ui/collapsible.js';
import { CodeBlockContent, Pre } from '#components/code/code-block.js';
import { ChatToolLabel } from '#components/chat/chat-tool-label.js';
import { ChatToolDescription } from '#components/chat/chat-tool-text.js';

export function ChatMessagePartUnknown({ part }: { readonly part: UIMessagePart<never, never> }): React.JSX.Element {
  return (
    <Collapsible className='group/collapsible flex w-full flex-col justify-center rounded-md border border-destructive/20 bg-destructive/10 text-sm'>
      <CollapsibleTrigger asChild>
        <div className='group/chat-tool-trigger flex w-full min-w-0 cursor-pointer items-center justify-between gap-1 p-2 pl-3 text-muted-foreground'>
          <div className='flex w-full min-w-0 items-center gap-1.5'>
            <TriangleAlert className='size-3 shrink-0 text-destructive' />
            <ChatToolLabel verb='Received unknown part'>
              <ChatToolDescription className='font-mono'>{part.type}</ChatToolDescription>
            </ChatToolLabel>
          </div>
          <ChevronRight className='size-3 shrink-0 text-foreground/60 transition duration-200 group-hover/chat-tool-trigger:text-foreground group-data-[state=open]/collapsible:rotate-90' />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <CodeBlockContent>
          <Pre
            language='json'
            // ClassName="overflow-x-scroll border-t border-destructive/20 p-2 text-xs whitespace-pre-wrap"
          >
            {JSON.stringify(part, null, 2)}
          </Pre>
        </CodeBlockContent>
      </CollapsibleContent>
    </Collapsible>
  );
}
