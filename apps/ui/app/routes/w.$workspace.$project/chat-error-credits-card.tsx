import { memo } from 'react';
import type { ReactNode } from 'react';
import type React from 'react';
import { CreditCard, Play, Repeat } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { useChatActions } from '#hooks/use-chat.js';
import { ChatModelSelector } from '#components/chat/chat-model-selector.js';
import { useModels } from '#hooks/use-models.js';
import { ChatErrorCard } from '#routes/w.$workspace.$project/chat-error-card.js';

type ChatErrorCreditsCardProps = {
  readonly className?: string;
  /** The host retains a failed run that it can continue after funding. */
  readonly resumable: boolean;
  readonly description?: string;
  /** Structured refusal fields the 402 carried; see `ChatError.details`. */
  readonly details?: Record<string, unknown>;
  /** The Add credits action: the Cloud chunk's top-up, first among the fixes. */
  readonly addCredits: ReactNode;
};

/**
 * Credit atoms per whole credit (`@taucad/billing` `creditAtomsPerCredit`), repeated so this Core card shares no module
 * with the Cloud chunk's billing barrel (gate G1); `chat-error-credits-card.test.ts` holds the two equal.
 */
export const cardCreditAtomsPerCredit = 10_000n;

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
  return (required - available + cardCreditAtomsPerCredit - 1n) / cardCreditAtomsPerCredit;
};

/**
 * The out-of-credits card (Core in every ceiling): the shortfall, Switch model and Resume. The Add credits action is
 * the caller's, so the top-up stays in the Cloud chunk and the chunk shares no route module (gate G1).
 */
export const ChatErrorCreditsCard = memo(function ({
  className,
  resumable,
  description,
  details,
  addCredits,
}: ChatErrorCreditsCardProps): React.JSX.Element {
  const { continueChat } = useChatActions();
  const { resolveModel } = useModels();
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
          {addCredits}
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
    />
  );
});
