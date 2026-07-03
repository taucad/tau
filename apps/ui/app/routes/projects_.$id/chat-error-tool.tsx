import { memo } from 'react';
import type React from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { Button } from '#components/ui/button.js';
import { ExternalLink } from '#components/external-link.js';
import { MarkdownViewer } from '#components/markdown/markdown-viewer.js';
import { cn } from '#utils/ui.utils.js';
import { useChatActions } from '#hooks/use-chat.js';

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
    <div
      className={cn(
        'flex min-w-0 flex-col gap-2 overflow-hidden rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm',
        className,
      )}
    >
      <div className='flex items-center gap-2'>
        <AlertTriangle className='size-4 shrink-0 text-destructive' />
        <p className='font-medium text-foreground'>Processing Error</p>
      </div>
      <MarkdownViewer
        className={cn(
          'min-w-0 text-xs break-all text-muted-foreground',
          // Inline-code styles for error messages
          '[&_code]:text-destructive',
          '[&_code]:border-destructive/30',
          '[&_code]:bg-background/80',
        )}
      >
        {description ?? 'There was an error processing your message. Please try again.'}
      </MarkdownViewer>
      <div className='flex items-center justify-between gap-2'>
        {helpUrl ? (
          <ExternalLink
            href={helpUrl}
            className='text-xs text-muted-foreground decoration-muted-foreground hover:text-foreground'
            arrowSize='xs'
          >
            Learn more
          </ExternalLink>
        ) : (
          <div />
        )}
        <Button
          variant='outline'
          size='sm'
          className='shrink-0'
          onClick={() => {
            continueChat();
          }}
        >
          <RefreshCcw className='size-3.5' />
          Try again
        </Button>
      </div>
    </div>
  );
});
