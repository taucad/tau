import { TriangleAlert, ChevronRight } from 'lucide-react';
import type { UIMessagePart } from 'ai';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '#components/ui/collapsible.js';
import { CodeBlockContent, Pre } from '#components/code/code-block.js';

export function ChatMessagePartUnknown({ part }: { readonly part: UIMessagePart<never, never> }): React.JSX.Element {
  return (
    <Collapsible className="group/collapsible flex w-full flex-col justify-center rounded-md border border-destructive/20 bg-destructive/10 text-sm">
      <CollapsibleTrigger asChild>
        <div className="flex w-full cursor-pointer items-center justify-between gap-1 p-2 pl-3">
          <div className="flex w-full items-center justify-start gap-1 text-destructive">
            <TriangleAlert className="size-3" />
            <span>Unknown part:</span> <pre className="inline text-xs">{part.type}</pre>
          </div>
          <ChevronRight className="size-4 transition-transform duration-300 ease-in-out group-data-[state=open]/collapsible:rotate-90" />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <CodeBlockContent>
          <Pre
            language="json"
            // ClassName="overflow-x-scroll border-t border-destructive/20 p-2 text-xs whitespace-pre-wrap"
          >
            {JSON.stringify(part, null, 2)}
          </Pre>
        </CodeBlockContent>
      </CollapsibleContent>
    </Collapsible>
  );
}
