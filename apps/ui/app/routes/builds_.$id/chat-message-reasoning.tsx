import type { ReasoningUIPart } from '@ai-sdk/ui-utils';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Button } from '#components/ui/button.js';
import { cn } from '#utils/ui.utils.js';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '#components/ui/collapsible.js';
import { useKeydown } from '#hooks/use-keydown.js';

type ChatMessageReasoningProperties = {
  readonly part: ReasoningUIPart;
  /**
   * Whether the message has content.
   *
   * This is used to determine if the reasoning content should be initially visible.
   */
  readonly hasContent: boolean;
};

export function ChatMessageReasoning({ part, hasContent }: ChatMessageReasoningProperties): React.JSX.Element {
  const [isOpen, setIsOpen] = useState<true | undefined>();

  // These combinations provide the most natural experience for the user.
  useKeydown(
    {
      key: 'ArrowRight',
    },
    () => {
      setIsOpen(true);
    },
  );
  useKeydown(
    {
      key: 'ArrowLeft',
    },
    () => {
      setIsOpen(undefined);
    },
  );

  return (
    <>
      {/* Show the collapsible section there is reasoning content */}
      {part.reasoning.trim() !== '' && (
        // Force open if content is empty, otherwise let state handle it.
        // This ensures the reasoning content is initially visible during generation,
        // then collapses when the content is generated.
        <Collapsible className="group/collapsible" open={hasContent ? isOpen : true}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="xs"
              className="-ml-2 font-medium text-foreground/60 hover:bg-transparent hover:text-foreground/80 dark:hover:bg-transparent"
            >
              <ChevronRight className="transition-transform duration-300 ease-in-out group-data-[state=open]/collapsible:rotate-90" />
              Thought Process
            </Button>
          </CollapsibleTrigger>

          <CollapsibleContent className="data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
            <div className="border-l border-foreground/20 pl-5 text-sm whitespace-pre-wrap text-foreground/60 italic">
              {part.reasoning.trim()}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Show "Thinking..." label when there is no reasoning content */}
      {part.reasoning.trim() === '' && (
        <div className={cn('mb-2 text-sm font-medium text-foreground/60')}>Thinking...</div>
      )}
    </>
  );
}
