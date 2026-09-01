import { memo, useState } from 'react';
import type React from 'react';
import { CreditCard, Play } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { cn } from '@taucad/ui/utils/cn';
import { openSettingsDialog } from '#hooks/use-settings-dialog.js';
import { useChatActions } from '#hooks/use-chat.js';
import { useEntitlements } from '@taucad/billing/hooks/use-entitlements';
import { TopupModal } from '#components/billing/topup-modal.js';

type ChatErrorCreditsProps = {
  readonly className?: string;
  readonly description?: string;
};

const fallbackDescription = 'Your credit balance is too low. Add credits, then resume this chat.';

/** Contextual top-up default for mid-chat exhaustion (F7): $25. */
const chatErrorDefaultTopupCents = 2500;

export const ChatErrorCredits = memo(function ({ className, description }: ChatErrorCreditsProps): React.JSX.Element {
  const { continueChat } = useChatActions();
  const entitlements = useEntitlements();
  const [isTopupOpen, setIsTopupOpen] = useState(false);
  const resolvedDescription = description ?? fallbackDescription;

  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-md border border-warning/20 bg-warning/10 p-3 text-sm',
        className,
      )}
    >
      <div className='flex items-center gap-2'>
        <CreditCard className='size-4 shrink-0 text-warning' />
        <p className='font-medium text-foreground'>Credit Limit Reached</p>
      </div>
      <p className='min-w-0 text-xs break-words text-muted-foreground'>{resolvedDescription}</p>
      <div className='flex flex-wrap items-center justify-end gap-2'>
        {entitlements.hasPaymentMethod ? (
          // Flow A (U7): a card is on file — top up in place, no settings detour.
          <Button
            variant='ghost'
            size='sm'
            onClick={() => {
              setIsTopupOpen(true);
            }}
          >
            <CreditCard className='size-3.5' />
            Add credits
          </Button>
        ) : (
          // Flow B: no payment method yet — route through Plans & Billing.
          <Button
            variant='ghost'
            size='sm'
            onClick={() => {
              openSettingsDialog('billing');
            }}
          >
            <CreditCard className='size-3.5' />
            Plans & Billing
          </Button>
        )}
        <Button
          variant='outline'
          size='sm'
          onClick={() => {
            continueChat();
          }}
        >
          <Play className='size-3.5' />
          Resume
        </Button>
      </div>
      {entitlements.hasPaymentMethod ? (
        <TopupModal
          isOpen={isTopupOpen}
          onOpenChange={setIsTopupOpen}
          defaultAmountCents={chatErrorDefaultTopupCents}
        />
      ) : undefined}
    </div>
  );
});
