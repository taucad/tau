import { memo } from 'react';
import { ChevronRight, RefreshCcw } from 'lucide-react';
import { Button } from '#components/ui/button.js';
import { useChatActions, useChatSelector } from '#components/chat/ai-chat-provider.js';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '#components/ui/collapsible.js';
import { CodeViewer } from '#components/code/code-viewer.js';

export const ChatError = memo(() => {
  const error = useChatSelector((state) => state.context.error);
  const { reload } = useChatActions();

  if (!error) {
    return null;
  }

  let errorMessage: string;
  console.log(error);

  try {
    errorMessage = JSON.stringify(JSON.parse(error.message), null, 2);
  } catch {
    errorMessage = error.message;
  }

  return (
    <Collapsible className="group/collapsible flex w-full flex-col justify-center rounded-md border border-destructive/20 bg-destructive/10 text-sm">
      <CollapsibleTrigger asChild>
        <div className="flex w-full cursor-pointer items-center justify-between gap-1 p-2">
          <ChevronRight className="size-4 transition-transform duration-300 ease-in-out group-data-[state=open]/collapsible:rotate-90" />
          <div className="flex w-full items-center justify-between">
            <p>Unable to send the message.</p>
            <Button
              variant="outline"
              size="xs"
              onClick={async () => {
                reload();
              }}
            >
              <RefreshCcw className="size-3" />
              Retry
            </Button>
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <CodeViewer
          text={errorMessage}
          language="json"
          className="overflow-x-scroll pb-1 text-xs whitespace-pre-wrap"
        />
      </CollapsibleContent>
    </Collapsible>
  );
});
