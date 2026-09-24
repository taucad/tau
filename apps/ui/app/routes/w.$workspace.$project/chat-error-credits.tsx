import { memo, useState } from 'react';
import type React from 'react';
import { CreditCard, Play, Repeat } from 'lucide-react';
// eslint-disable-next-line @nx/enforce-module-boundaries -- this first-party chat surface owns the direct billing client contract
import { creditAtomsPerCredit } from '@taucad/billing';
import { Button } from '@taucad/ui/components/button';
import { useSettingsDialog } from '#hooks/use-settings-dialog.js';
import { useChatActions } from '#hooks/use-chat.js';
import { useEntitlements } from '@taucad/billing/hooks/use-entitlements';
import { TopupModal } from '#components/billing/topup-modal.js';
import { ChatModelSelector } from '#components/chat/chat-model-selector.js';
import { useModels } from '#hooks/use-models.js';
import { ChatErrorCard } from '#routes/w.$workspace.$project/chat-error-card.js';

type ChatErrorCreditsProps = {
  readonly className?: string;
  readonly description?: string;
  /** Structured refusal fields the 402 carried; see `ChatError.details`. */
  readonly details?: Record<string, unknown>;
};

const fallbackDescription = 'Your credit balance is too low. Add credits, then resume this chat.';

/** Contextual top-up default for mid-chat exhaustion (F7): $25. */
const chatErrorDefaultTopupCents = 2500;

const atoms = (value: unknown): bigint | undefined => {
  if (typeof value !== 'string' || !/^\d+$/u.test(value)) {
    return undefined;
  }
  return BigInt(value);
};

/**
 * Whole credits the denied call still needed, from the shortfall the API
 * published on the 402 (`requiredCreditAtoms` − `availableCreditAtoms`, rounded
 * up to a credit so the number the reader adds is never short).
 */
const shortfallCredits = (details: Record<string, unknown> | undefined): bigint | undefined => {
  const required = atoms(details?.['requiredCreditAtoms']);
  const available = atoms(details?.['availableCreditAtoms']);
  if (required === undefined || available === undefined || required <= available) {
    return undefined;
  }
  return (required - available + creditAtomsPerCredit - 1n) / creditAtomsPerCredit;
};

export const ChatErrorCredits = memo(function ({
  className,
  description,
  details,
}: ChatErrorCreditsProps): React.JSX.Element {
  const { continueChat } = useChatActions();
  const entitlements = useEntitlements();
  const { resolveModel } = useModels();
  const [isTopupOpen, setIsTopupOpen] = useState(false);
  const { open: openSettings } = useSettingsDialog();
  // The denial's `routeId` is the catalogue model id, so the reader sees the
  // model's own name rather than a route slug.
  const shortfall = shortfallCredits(details);
  const routeId = typeof details?.['routeId'] === 'string' ? details['routeId'] : undefined;
  const resolvedDescription =
    shortfall === undefined || routeId === undefined
      ? (description ?? fallbackDescription)
      : `Tau paused this turn: ${shortfall} more ${shortfall === 1n ? 'credit' : 'credits'} needed for ${resolveModel(routeId).name}.`;

  return (
    <ChatErrorCard
      tone='warning'
      icon={CreditCard}
      className={className}
      title='Credit limit reached'
      description={resolvedDescription}
      actionsRowFrom='sm'
      actions={
        <>
          {entitlements.hasPaymentMethod ? (
            // Flow A (U7): a card is on file — top up in place, no settings detour.
            <Button
              variant='outline'
              size='sm'
              onClick={() => {
                setIsTopupOpen(true);
              }}
            >
              <CreditCard className='size-3.5' />
              Add credits
            </Button>
          ) : (
            // Flow B: no payment method yet — route through the Billing settings tab.
            <Button
              variant='outline'
              size='sm'
              onClick={() => {
                openSettings('billing');
              }}
            >
              <CreditCard className='size-3.5' />
              Billing
            </Button>
          )}
          {/* A cheaper tier is the other fix for a shortfall (P4); the composer's
           * picker is the owner, opened here without claiming its shortcut. */}
          <ChatModelSelector popoverProperties={{ align: 'end' }}>
            {() => (
              <Button variant='outline' size='sm'>
                <Repeat className='size-3.5' />
                Switch model
              </Button>
            )}
          </ChatModelSelector>
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
        </>
      }
    >
      {entitlements.hasPaymentMethod ? (
        <TopupModal
          isOpen={isTopupOpen}
          onOpenChange={setIsTopupOpen}
          defaultAmountCents={chatErrorDefaultTopupCents}
        />
      ) : undefined}
    </ChatErrorCard>
  );
});
