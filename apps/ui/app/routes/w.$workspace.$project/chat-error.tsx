import { memo, useState } from 'react';
import type React from 'react';
import { ChevronRight, RefreshCcw } from 'lucide-react';
import { errorCategory } from '@taucad/types/constants';
import type { ChatError as NormalizedChatError } from '@taucad/types';
import { Button } from '#components/ui/button.js';
import { useChatActions, useChatRetrySnapshot, useChatSelector } from '#hooks/use-chat.js';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '#components/ui/collapsible.js';
import { CodeViewer } from '#components/code/code-viewer.js';
import { MarkdownViewer } from '#components/markdown/markdown-viewer.js';
import { cn } from '#utils/ui.utils.js';
import { parseErrorForPersistence } from '#utils/error.utils.js';
import { ChatErrorUnauthorized } from '#routes/w.$workspace.$project/chat-error-unauthorized.js';
import { ChatErrorServiceUnavailable } from '#routes/w.$workspace.$project/chat-error-service-unavailable.js';
import { ChatErrorCredits } from '#routes/w.$workspace.$project/chat-error-credits.js';
import { ChatErrorRateLimit } from '#routes/w.$workspace.$project/chat-error-rate-limit.js';
import { ChatErrorTool } from '#routes/w.$workspace.$project/chat-error-tool.js';

/**
 * Attempts to format a string as pretty-printed JSON.
 */
function tryFormatJson(text: string): string {
  try {
    const parsed = JSON.parse(text) as unknown;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return text;
  }
}

export const ChatError = memo(function ({ className }: { readonly className?: string }): React.ReactNode {
  const [genericDetailsOpen, setGenericDetailsOpen] = useState(false);
  const { retryAttempt } = useChatRetrySnapshot();
  // Derive parsed error inside selector - prefer runtime error, fallback to persisted
  const parsedError = useChatSelector((state): NormalizedChatError | undefined => {
    if (state.error) {
      return parseErrorForPersistence(state.error);
    }

    return state.persistedError;
  });
  const { continueChat } = useChatActions();

  // R7: hide the banner during transparent auto-retry; the reconnecting affordance
  // is `ChatMessagePlanning`, not this component. The early return MUST sit below
  // every hook call -- crossing the hook list with a conditional return triggers
  // React error #300 ("Rendered fewer hooks than expected") on the
  // retryAttempt 0 -> N transition, which the FloatingPanel boundary then
  // surfaces as the "Chat Unavailable" screen.
  if (retryAttempt > 0) {
    return null;
  }

  if (!parsedError) {
    return null;
  }

  // Generic fallback recovery must preserve partial assistant parts the user
  // already saw. Specialized components own auth, credits, rate-limit, and
  // tool-error actions. Credits remain the account-state "Resume" exception.
  const handleTryAgain = (): void => {
    continueChat();
  };

  // Render the generic/server error view with collapsible details
  const renderGenericError = (): React.ReactNode => {
    const formattedError = parsedError.raw ? tryFormatJson(parsedError.raw) : parsedError.message;

    return (
      <div className={cn('min-w-0', className)}>
        <Collapsible
          open={genericDetailsOpen}
          className={cn(
            'group/collapsible flex flex-col justify-center rounded-md border border-destructive/20 bg-destructive/10 text-sm',
          )}
          onOpenChange={setGenericDetailsOpen}
        >
          <CollapsibleTrigger asChild>
            <div className='flex w-full cursor-pointer items-center justify-between gap-2 px-2 py-1.5'>
              <ChevronRight className='size-4 transition-transform duration-300 ease-in-out group-data-[state=open]/collapsible:rotate-90' />
              <div className='flex w-full items-center justify-between gap-2'>
                <MarkdownViewer
                  className={cn(
                    'inline w-auto! text-sm text-foreground',
                    // Inline-code styles for error messages
                    '[&_code]:text-destructive',
                    '[&_code]:border-destructive/30',
                    '[&_code]:bg-background/80',
                    'line-clamp-none',
                  )}
                >
                  {parsedError.message || parsedError.title || 'Unable to send the message.'}
                </MarkdownViewer>
                <Button
                  variant='outline'
                  className='h-7 shrink-0 hover:border-neutral/50'
                  size='sm'
                  onClick={() => {
                    handleTryAgain();
                  }}
                >
                  <RefreshCcw className='size-3.5' />
                  Try again
                </Button>
              </div>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent className='overflow-x-scroll px-2 pb-2'>
            <CodeViewer text={formattedError} language='json' className='text-xs whitespace-pre-wrap' />
          </CollapsibleContent>
        </Collapsible>
      </div>
    );
  };

  // Route to specialized error components based on category
  // All cases from ErrorCategory are handled explicitly for exhaustive matching
  const { category } = parsedError;
  switch (category) {
    case errorCategory.auth: {
      return <ChatErrorUnauthorized className={cn('min-w-0', className)} />;
    }

    case errorCategory.network: {
      return <ChatErrorServiceUnavailable className={cn('min-w-0', className)} />;
    }

    case errorCategory.credits: {
      return <ChatErrorCredits className={cn('min-w-0', className)} description={parsedError.message} />;
    }

    case errorCategory.rateLimit: {
      return <ChatErrorRateLimit className={cn('min-w-0', className)} />;
    }

    case errorCategory.overloaded: {
      return <ChatErrorServiceUnavailable className={cn('min-w-0', className)} />;
    }

    case errorCategory.toolError: {
      return (
        <ChatErrorTool
          className={cn('min-w-0', className)}
          description={parsedError.message}
          helpUrl={parsedError.helpUrl}
        />
      );
    }

    case errorCategory.server:
    case errorCategory.generic: {
      return renderGenericError();
    }

    default: {
      return renderGenericError();
    }
  }
});
