import { memo } from 'react';
import type React from 'react';
import { CircleAlert, Mail } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { CodeViewer } from '#components/code/code-viewer.js';
import { ChatErrorCard } from '#routes/w.$workspace.$project/chat-error-card.js';
import { ChatErrorDetails } from '#routes/w.$workspace.$project/chat-error-details.js';

/**
 * Tau Cloud: admission refused spending on this account (`BILLING_ACCOUNT_RESTRICTED`, W11a).
 *
 * The restriction is the account's, not the route's or the turn's, so the card
 * offers neither Resume nor another model: support is the one recovery. The copy
 * is the page's own and names no case kind (OQ15); the gateway's sentence and
 * the refusal's fields stay in Tau Debug.
 *
 * The support address is the one the account-closure notices already use
 * (`account-closure-settings.tsx`).
 *
 * @param properties - Card class and the raw refusal for Tau Debug.
 * @returns The notice.
 */
export const ChatErrorAccountRestricted = memo(function ({
  className,
  raw,
}: {
  readonly className?: string;
  /** The raw refusal payload, available only through Tau Debug. */
  readonly raw?: string;
}): React.JSX.Element {
  return (
    <ChatErrorCard
      tone='warning'
      icon={CircleAlert}
      className={className}
      title='This account needs attention'
      description='Tau has paused spending on this account while we look at a billing issue. Contact support to continue.'
      actions={
        <Button asChild variant='outline' size='xs'>
          <a href='mailto:support@tau.new'>
            <Mail className='size-3.5' />
            Contact support
          </a>
        </Button>
      }
    >
      {raw === undefined ? null : (
        <ChatErrorDetails>
          <CodeViewer text={raw} language='json' className='mt-1 text-xs whitespace-pre-wrap' />
        </ChatErrorDetails>
      )}
    </ChatErrorCard>
  );
});
