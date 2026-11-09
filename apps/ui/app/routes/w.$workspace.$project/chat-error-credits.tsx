import { memo, useState } from 'react';
import type React from 'react';
import { CreditCard, Play, Plus, Repeat } from 'lucide-react';
// eslint-disable-next-line @nx/enforce-module-boundaries -- this first-party chat surface owns the direct billing client contract
import { creditAtomsPerCredit } from '@taucad/billing';
import { Button } from '@taucad/ui/components/button';
import { useChatActions } from '#hooks/use-chat.js';
import { TopupModal } from '#components/billing/topup-modal.js';
import { ChatModelSelector } from '#components/chat/chat-model-selector.js';
import { useModels } from '#hooks/use-models.js';
import { ChatErrorCard } from '#routes/w.$workspace.$project/chat-error-card.js';

type ChatErrorCreditsProps = {
  readonly className?: string;
  /** The host retains a failed run that it can continue after funding. */
  readonly resumable: boolean;
  readonly description?: string;
  /** Structured refusal fields the 402 carried; see `ChatError.details`. */
  readonly details?: Record<string, unknown>;
};

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
  resumable,
  description,
  details,
}: ChatErrorCreditsProps): React.JSX.Element {
  const { continueChat } = useChatActions();
  const { resolveModel } = useModels();
  const [isTopupOpen, setIsTopupOpen] = useState(false);
  // The denial's `routeId` is the catalogue model id, so the reader sees the
  // model's own name rather than a route slug.
  const shortfall = shortfallCredits(details);
  const routeId = typeof details?.['routeId'] === 'string' ? details['routeId'] : undefined;
  const fallbackDescription = resumable
    ? 'You don’t have enough credits for this turn. Add credits, then resume.'
    : 'You don’t have enough credits for this turn.';
  const resolvedDescription =
    shortfall === undefined || routeId === undefined
      ? (description ?? fallbackDescription)
      : `This turn needs ${shortfall} more ${shortfall === 1n ? 'credit' : 'credits'} on ${resolveModel(routeId).name}.${resumable ? ' Add credits or switch to a cheaper model, then resume.' : ''}`;

  return (
    <ChatErrorCard
      tone='warning'
      icon={CreditCard}
      className={className}
      title='You’re out of credits'
      description={
        <>
          <p>{resolvedDescription}</p>
          {resumable ? undefined : <p>Add credits, then send your message again.</p>}
        </>
      }
      actions={
        <>
          {/* The Add credits dialog takes a saved card or a new one, so the fix is one click with or without a card on file. */}
          <Button
            size='xs'
            onClick={() => {
              setIsTopupOpen(true);
            }}
          >
            <Plus className='size-3.5' />
            Add credits
          </Button>
          {/* A cheaper tier is the other fix for a shortfall (P4); the composer's
           * picker is the owner, opened here without claiming its shortcut. */}
          <ChatModelSelector popoverProperties={{ align: 'end' }}>
            {() => (
              <Button variant='outline' size='xs'>
                <Repeat className='size-3.5' />
                Switch model
              </Button>
            )}
          </ChatModelSelector>
          {resumable ? (
            <Button
              variant='outline'
              size='xs'
              onClick={() => {
                continueChat();
              }}
            >
              <Play className='size-3.5' />
              Resume
            </Button>
          ) : undefined}
        </>
      }
    >
      <TopupModal isOpen={isTopupOpen} onOpenChange={setIsTopupOpen} defaultAmountCents={chatErrorDefaultTopupCents} />
    </ChatErrorCard>
  );
});
