import { memo } from 'react';
import type { ReactNode } from 'react';
import type React from 'react';
import { ArrowUp, CircleCheck, CreditCard, Play, Repeat } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { useChatActions } from '#hooks/use-chat.js';
import { ChatModelSelector } from '#components/chat/chat-model-selector.js';
import { useModels } from '#hooks/use-models.js';
import { ChatErrorCard } from '#routes/w.$workspace.$project/chat-error-card.js';
import { useChatComposerSubmit } from '#hooks/chat-composer-submit.js';
import { formatWholeCredits, useCreditStanding } from '#hooks/use-credit-standing.js';

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

/** The price line a zero balance shows: what the $10 preset buys at the published rate. */
const priceLine = (creditsPerUsd: number | undefined): string | undefined =>
  creditsPerUsd === undefined ? undefined : `$10 adds ${(10 * creditsPerUsd).toLocaleString('en-US')} credits.`;

/**
 * The card once credits arrive for a send that was refused: the balance now covers the model, so the kept draft can go.
 *
 * @param properties - The balance to report.
 * @returns The card.
 */
function CreditsAddedCard({
  className,
  availableAtoms,
}: {
  readonly className?: string;
  readonly availableAtoms: bigint;
}): React.JSX.Element {
  const submit = useChatComposerSubmit();
  return (
    <ChatErrorCard
      tone='neutral'
      icon={CircleCheck}
      className={className}
      title='Credits added'
      description={`${formatWholeCredits(availableAtoms)} credits are in your balance. ${
        submit === undefined ? 'Send your message to start.' : 'Your message is ready to send.'
      }`}
      actions={
        submit === undefined ? undefined : (
          <Button
            size='xs'
            onClick={() => {
              void submit();
            }}
          >
            <ArrowUp className='size-3.5' />
            Send message
          </Button>
        )
      }
    />
  );
}

/**
 * A send refused before it ran: what adding credits buys, then the kept message. A zero balance gets the price, since no
 * purchase is as small as the shortfall; otherwise the shortfall on the model, or the refusal's own words.
 *
 * @param properties - Whether the balance is zero, the price line, the shortfall sentence and the actions.
 * @returns The card.
 */
function RefusedSendCard({
  className,
  isEmpty,
  price,
  needs,
  actions,
}: {
  readonly className?: string;
  readonly isEmpty: boolean;
  readonly price: string | undefined;
  readonly needs: string | undefined;
  readonly actions: ReactNode;
}): React.JSX.Element {
  return (
    <ChatErrorCard
      tone='notice'
      icon={CreditCard}
      className={className}
      title='Add credits to send this'
      description={
        isEmpty ? (
          <>
            <p>Your message is ready. Credits pay for each AI turn and never expire.</p>
            {price === undefined ? undefined : <p>{price}</p>}
          </>
        ) : (
          <>
            {needs === undefined ? undefined : <p>{needs}</p>}
            <p>Your message is ready. Add credits, then send it.</p>
          </>
        )
      }
      actions={actions}
    />
  );
}

/**
 * The credits card (Core in every ceiling). A turn that ran out partway is "You’re out of credits", with the shortfall,
 * Switch model and Resume. A send refused before it ran is "Add credits to send this": on a zero balance it gives the
 * price instead of a shortfall, and once credits arrive it becomes "Credits added" with Send message. The Add credits
 * action is the caller's, so the top-up stays in the Cloud chunk and the chunk shares no route module (gate G1).
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
  const standing = useCreditStanding();
  // The denial's `routeId` is the catalogue model id, so the reader sees the
  // model's own name rather than a route slug.
  const shortfall = shortfallCredits(details);
  const routeId = typeof details?.['routeId'] === 'string' ? details['routeId'] : undefined;
  const refusedAvailable = atoms(details?.['availableCreditAtoms']);

  // Credits arrived after the refusal and now cover its model: offer the kept draft.
  if (
    !resumable &&
    standing !== undefined &&
    refusedAvailable !== undefined &&
    standing.availableAtoms > refusedAvailable &&
    (routeId === undefined ? standing.coversAnyRoute : standing.covers(routeId) === true)
  ) {
    return <CreditsAddedCard className={className} availableAtoms={standing.availableAtoms} />;
  }

  // A cheaper model is a fix only when one fits the balance; unknown standing keeps the offer.
  const canSwitchModel = resumable || standing === undefined || standing.coversAnyRoute;
  const switchModel = canSwitchModel ? (
    /* A cheaper tier is the other fix for a shortfall (P4); the composer's
     * picker is the owner, opened here without claiming its shortcut. */
    <ChatModelSelector popoverProperties={{ align: 'end' }}>
      {() => (
        <Button variant='outline' size='xs'>
          <Repeat className='size-3.5' />
          Switch model
        </Button>
      )}
    </ChatModelSelector>
  ) : undefined;

  if (!resumable) {
    return (
      <RefusedSendCard
        className={className}
        isEmpty={refusedAvailable === 0n || (refusedAvailable === undefined && standing?.isEmpty === true)}
        price={priceLine(standing?.creditsPerUsd)}
        needs={
          shortfall === undefined || routeId === undefined
            ? description
            : `This message needs ${shortfall} more ${shortfall === 1n ? 'credit' : 'credits'} on ${resolveModel(routeId).name}.`
        }
        actions={
          <>
            {addCredits}
            {switchModel}
          </>
        }
      />
    );
  }

  const resolvedDescription =
    shortfall === undefined || routeId === undefined
      ? (description ?? 'You don’t have enough credits for this turn. Add credits, then resume.')
      : `This turn needs ${shortfall} more ${shortfall === 1n ? 'credit' : 'credits'} on ${resolveModel(routeId).name}. Add credits or switch to a cheaper model, then resume.`;

  return (
    <ChatErrorCard
      tone='warning'
      icon={CreditCard}
      className={className}
      title='You’re out of credits'
      description={<p>{resolvedDescription}</p>}
      actions={
        <>
          {addCredits}
          {switchModel}
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
        </>
      }
    />
  );
});
