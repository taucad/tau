import { memo } from 'react';
import type React from 'react';
import { ChevronRight, RefreshCcw } from 'lucide-react';
import { Button } from '#components/ui/button.js';
import { useChatActions, useChatSelector } from '#hooks/use-chat.js';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '#components/ui/collapsible.js';
import { CodeViewer } from '#components/code/code-viewer.js';
import { cn } from '#utils/ui.utils.js';

export const ChatError = memo(function ({
  isOpen = false,
  onOpenChange,
  className,
}: {
  readonly isOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly className?: string;
}): React.ReactNode {
  const error = useChatSelector((state) => state.context.error);
  const { regenerate } = useChatActions();

  if (!error) {
    return null;
  }

  let errorMessage: string;

  try {
    errorMessage = JSON.stringify(JSON.parse(error.message), null, 2);
  } catch {
    errorMessage = error.message;
  }

  return (
    <Collapsible
      open={isOpen}
      className={cn(
        'group/collapsible flex flex-col justify-center rounded-md border border-destructive/20 bg-destructive/10 text-sm select-none',
        className,
      )}
      onOpenChange={onOpenChange}
    >
      <CollapsibleTrigger asChild>
        <div className="flex w-full cursor-pointer items-center justify-between gap-1 p-2">
          <ChevronRight className="size-4 transition-transform duration-300 ease-in-out group-data-[state=open]/collapsible:rotate-90" />
          <div className="flex w-full items-center justify-between">
            <p>Unable to send the message.</p>
            <Button
              variant="outline"
              size="xs"
              onClick={async () => {
                regenerate();
              }}
            >
              <RefreshCcw className="size-3" />
              Retry
            </Button>
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-2">
        <CodeViewer text={errorMessage} language="json" className="overflow-x-scroll text-xs whitespace-pre-wrap" />
      </CollapsibleContent>
    </Collapsible>
  );
});
