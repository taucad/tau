import { TriangleAlert, ChevronRight } from 'lucide-react';
import type { ToolInvocationUIPart } from '@ai-sdk/ui-utils';
import type { JSX } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible.js';

export function ChatMessageToolUnknown({ part }: { readonly part: ToolInvocationUIPart }): JSX.Element {
  return (
    <Collapsible className="group/collapsible flex w-full flex-col justify-center rounded-md border border-destructive/20 bg-destructive/10 text-sm">
      <CollapsibleTrigger asChild>
        <div className="flex w-full cursor-pointer items-center justify-between gap-1 p-2">
          <ChevronRight className="size-4 transition-transform duration-300 ease-in-out group-data-[state=open]/collapsible:rotate-90" />
          <div className="flex w-full items-center justify-between gap-1 text-destructive">
            <TriangleAlert className="size-3" />
            <span>Unknown tool call:</span> <pre className="inline text-xs">{part.toolInvocation.toolName}</pre>
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="overflow-x-scroll border-t border-destructive/20 p-2 text-xs">
          {JSON.stringify(part.toolInvocation, null, 2)}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}
