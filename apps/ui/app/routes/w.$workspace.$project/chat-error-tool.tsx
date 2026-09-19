import { memo } from 'react';
import type React from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { ExternalLink } from '#components/external-link.js';
import { MarkdownViewer } from '#components/markdown/markdown-viewer.js';
import { cn } from '@taucad/ui/utils/cn';
import { useChatActions } from '#hooks/use-chat.js';
import { ChatErrorCard } from '#routes/w.$workspace.$project/chat-error-card.js';

type ChatErrorToolProps = {
  readonly className?: string;
  readonly description?: string;
  readonly helpUrl?: string;
};

export const ChatErrorTool = memo(function ({
  className,
  description,
  helpUrl,
}: ChatErrorToolProps): React.JSX.Element {
  const { continueChat } = useChatActions();

  return (
    <ChatErrorCard
      tone='destructive'
      icon={AlertTriangle}
      className={cn('overflow-hidden', className)}
      title='Processing error'
      description={
        <>
          <MarkdownViewer
            className={cn(
              'min-w-0 text-xs break-words text-muted-foreground',
              // Inline-code styles for error messages
              '[&_code]:text-destructive',
              '[&_code]:border-destructive/30',
              '[&_code]:bg-background/80',
            )}
          >
            {description ?? 'There was an error processing your message. Please try again.'}
          </MarkdownViewer>
          {helpUrl ? (
            <ExternalLink href={helpUrl} className='text-xs text-foreground decoration-muted-foreground' arrowSize='xs'>
              Learn more
            </ExternalLink>
          ) : null}
        </>
      }
      actions={
        <Button
          variant='outline'
          size='sm'
          onClick={() => {
            continueChat();
          }}
        >
          <RefreshCcw className='size-3.5' />
          Try again
        </Button>
      }
    />
  );
});
