import { memo } from 'react';
import type React from 'react';
import { CircleAlert, RefreshCcw, Repeat } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { useChatActions } from '#hooks/use-chat.js';
import { ChatModelSelector } from '#components/chat/chat-model-selector.js';
import { ChatErrorCard } from '#routes/w.$workspace.$project/chat-error-card.js';
// The provider table lives with the self-host card, which is the flavour that
// needs its billing hosts; Cloud borrows only the display name from it.
import { providerEntryFrom } from '#routes/w.$workspace.$project/chat-error-provider-account.self-host.js';

/**
 * Tau Cloud: the supplier account behind Tau's key refused the turn.
 *
 * Copy only, no Cloud code, so it is Core in every ceiling: the pinned `cloud`
 * build's `chat-error-provider-account.tsx` and an adaptive build's facade
 * (while funded) both render it, and the Cloud chunk carries none of it (gate G1).
 *
 * The account is Tau's, so the person gets the consequence, a way around it and
 * nothing they cannot act on: no supplier sentence, no provider code, no link
 * to Tau's billing with a supplier.
 *
 * @param properties - Card class; the supplier's own message never reaches it.
 * @returns The notice.
 */
export const ChatErrorProviderAccountFunded = memo(function ({
  className,
  details,
}: {
  readonly className?: string;
  readonly description?: string;
  readonly details?: Record<string, unknown>;
}): React.JSX.Element {
  const { regenerate } = useChatActions();
  const { name } = providerEntryFrom(details);
  const title = `${name} models are unavailable right now`;

  return (
    <ChatErrorCard
      role='status'
      aria-label={title}
      tone='notice'
      icon={CircleAlert}
      className={className}
      title={title}
      description={
        <div className='space-y-1'>
          <p>Tau could not run this turn on {name}. You were not charged for it.</p>
          <p>Switch to another model to keep going, or try again in a few minutes. Tau&apos;s team has been alerted.</p>
        </div>
      }
      actions={
        <>
          {/* Other suppliers keep working, so switching comes before retrying. */}
          <ChatModelSelector popoverProperties={{ align: 'end' }}>
            {() => (
              <Button variant='outline' size='xs'>
                <Repeat className='size-3.5' />
                Switch model
              </Button>
            )}
          </ChatModelSelector>
          <Button
            variant='outline'
            size='xs'
            onClick={() => {
              regenerate();
            }}
          >
            <RefreshCcw className='size-3.5' />
            Try again
          </Button>
        </>
      }
    />
  );
});
