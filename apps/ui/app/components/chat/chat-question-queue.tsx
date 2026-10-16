import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, MessageCircleQuestionMark } from 'lucide-react';
import { askStatus } from '@taucad/chat';
import type { Ask, AskAnswers } from '@taucad/chat';
import { Button } from '@taucad/ui/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import { cn } from '@taucad/ui/utils/cn';
import { QuestionCard } from '#components/chat/question-card.js';
import {
  useOnScreenAskIds,
  useOptionalChatQuestions,
  useReportAskOnScreen,
} from '#components/chat/chat-questions-context.js';
import { externalAgentDisplayName } from '#lib/agent-host-placement.js';

/**
 * One ask on the shared card, answered through the chat's record.
 *
 * @param props - The ask, and whether it counts as on screen for the tray.
 * @param props.ask - The recorded ask.
 * @param props.isFlat - A flat tray row instead of a card.
 * @param props.shouldReportOnScreen - A transcript card hides the ask from the tray while visible.
 * @param props.className - Extra classes.
 * @returns The card, or nothing without a chat view.
 * @public
 */
export function ChatQuestionCard({
  ask,
  isFlat = false,
  shouldReportOnScreen = false,
  className,
}: {
  readonly ask: Ask;
  readonly isFlat?: boolean;
  readonly shouldReportOnScreen?: boolean;
  readonly className?: string;
}): React.JSX.Element | undefined {
  const questions = useOptionalChatQuestions();
  const [failure, setFailure] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const writing = useRef(false);
  const [element, setElement] = useState<HTMLDivElement | undefined>();
  useReportAskOnScreen(shouldReportOnScreen ? ask.id : undefined, element);
  if (questions === undefined) {
    return undefined;
  }
  const unavailableReason =
    ask.answerVersion !== 2 && ask.resolution === undefined
      ? 'This question needs an updated host. Resume the chat to request it again.'
      : undefined;
  const record = async (label: string, write: () => Promise<void>): Promise<void> => {
    const isDecision = label !== 'hold';
    if (isDecision && writing.current) {
      return;
    }
    if (isDecision) {
      writing.current = true;
      setIsPending(true);
    }
    setFailure(false);
    try {
      await write();
    } catch (error) {
      console.error(`[questions] ${label} failed`, error);
      setFailure(true);
    } finally {
      if (isDecision) {
        writing.current = false;
        setIsPending(false);
      }
    }
  };
  return (
    <div
      ref={(node) => {
        setElement(node ?? undefined);
      }}
      className={className}
    >
      <QuestionCard
        ask={ask}
        answers={questions.answers[ask.id]}
        now={questions.now}
        isFlat={isFlat}
        isPending={isPending || unavailableReason !== undefined}
        {...(ask.agentId === undefined ? {} : { agentName: externalAgentDisplayName(ask.agentId) })}
        onAnswer={(questionId, reply) => {
          void record('answer', async () => questions.answer(ask.id, questionId, reply));
        }}
        onHold={() => {
          void record('hold', async () => questions.hold(ask.id));
        }}
        onDecline={() => {
          void record('decline', async () => questions.decline(ask.id));
        }}
      />
      {unavailableReason === undefined ? null : (
        <p role='status' className='px-2 text-xs/5'>
          {unavailableReason}
        </p>
      )}
      {isPending ? (
        <p role='status' className='px-2 text-xs/5 text-muted-foreground'>
          Saving response…
        </p>
      ) : null}
      {failure ? (
        <p role='alert' className='px-2 text-xs/5'>
          Your response was not saved. Try again.
        </p>
      ) : null}
    </div>
  );
}

const clock = (milliseconds: number): string => {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, '0')}`;
};

const plural = (count: number, noun: string): string => `${String(count)} ${noun}${count === 1 ? '' : 's'}`;

/**
 * The asks still waiting, most urgent first: a form with no default blocks its
 * agent, then the soonest recommendation.
 *
 * @param asks - The chat's asks.
 * @param answers - The person's answers by ask id.
 * @param now - Epoch milliseconds.
 * @returns The waiting asks in tray order.
 * @public
 */
export const waitingByUrgency = (
  asks: readonly Ask[],
  answers: Readonly<Record<string, AskAnswers>> | undefined,
  now: number,
): Ask[] =>
  asks
    .map((ask) => ({ ask, status: askStatus(ask, answers?.[ask.id], now) }))
    .filter((entry) => entry.status.kind === 'open')
    .map(({ ask, status }) => ({ ask, remaining: status.kind === 'open' ? (status.remaining ?? -1) : 0 }))
    .toSorted((left, right) => left.remaining - right.remaining)
    .map(({ ask }) => ask);

/** The collapsed tray line: what waits and, for the most urgent ask, how long until its recommendation. */
const traySummary = ({
  waiting,
  answers,
  now,
}: {
  readonly waiting: readonly Ask[];
  readonly answers: Readonly<Record<string, AskAnswers>>;
  readonly now: number;
}): { readonly text: string; readonly remaining: number | undefined } => {
  const [first] = waiting;
  if (first === undefined) {
    return { text: '', remaining: undefined };
  }
  const status = askStatus(first, answers[first.id], now);
  const next = first.questions.find((question) => answers[first.id]?.questions[question.id] === undefined);
  return {
    text: `${plural(
      waiting.reduce((count, ask) => count + ask.questions.length, 0),
      'question',
    )} waiting · ${next?.header ?? next?.question ?? ''}`,
    remaining: status.kind === 'open' ? status.remaining : undefined,
  };
};

/**
 * Whether the chat view had time to mount its transcript rows.
 *
 * @returns `true` once settled.
 */
const useSettled = (): boolean => {
  // ponytail: the transcript list mounts its rows a frame or two after the tray; a fixed
  // settle time keeps the tray from flashing in for asks whose cards are about to appear.
  const [isSettled, setIsSettled] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsSettled(true);
    }, 400);
    return () => {
      clearTimeout(timer);
    };
  }, []);
  return isSettled;
};

/**
 * Unanswered questions, reachable in the composer after their transcript cards scroll away.
 * Opens for a new waiting ask and disappears once no off-screen ask needs an answer.
 *
 * @param props - Focus recovery when the tray disappears.
 * @param props.onDismissFocus - Return focus to the composer if focus was inside the removed tray.
 * @returns The section, or nothing.
 * @public
 */
export function ChatQuestionQueue({
  onDismissFocus,
}: {
  readonly onDismissFocus?: () => void;
}): React.JSX.Element | undefined {
  const questions = useOptionalChatQuestions();
  const onScreen = useOnScreenAskIds();
  const [isOpen, setIsOpen] = useState(false);
  const isSettled = useSettled();
  const announced = useRef(new Set<string>());
  const trayRef = useCallback<React.RefCallback<HTMLDivElement>>(
    (node) => {
      if (node === null) {
        return undefined;
      }
      return () => {
        if (node.contains(document.activeElement)) {
          onDismissFocus?.();
        }
      };
    },
    [onDismissFocus],
  );
  const asks = questions?.asks ?? [];
  const now = questions?.now ?? 0;
  const waiting = useMemo(
    () =>
      waitingByUrgency(asks, questions?.answers, now).map((ask) => ({
        ...ask,
        questions: ask.questions.filter((question) => questions?.answers[ask.id]?.questions[question.id] === undefined),
      })),
    [asks, now, questions?.answers],
  );
  const offScreenWaiting = useMemo(() => waiting.filter((ask) => !onScreen.has(ask.id)), [onScreen, waiting]);

  useEffect(() => {
    if (!isSettled) {
      return;
    }
    const fresh = offScreenWaiting.filter((ask) => !announced.current.has(ask.id));
    for (const ask of waiting) {
      announced.current.add(ask.id);
    }
    if (fresh.length > 0) {
      setIsOpen(true);
    }
  }, [isSettled, offScreenWaiting, waiting]);

  if (questions?.recordFailure !== undefined) {
    return (
      <p role='alert' className='px-2 text-xs/5'>
        {questions.recordFailure}
      </p>
    );
  }
  if (!isSettled || questions === undefined || offScreenWaiting.length === 0) {
    return undefined;
  }

  const { text: summary, remaining } = traySummary({
    waiting: offScreenWaiting,
    answers: questions.answers,
    now,
  });

  return (
    <Collapsible
      ref={trayRef}
      open={isOpen}
      className='group/tray-section not-first:border-t'
      onOpenChange={(open) => {
        setIsOpen(open);
      }}
    >
      <CollapsibleTrigger asChild>
        <Button
          variant='ghost'
          size='xs'
          className='relative flex h-auto min-h-8 w-full min-w-0 items-center justify-start gap-1.5 rounded-none px-2 py-1.5 text-left font-normal text-foreground group-first/tray-section:rounded-t-lg hover:bg-accent/50 hover:text-foreground focus-visible:z-10'
        >
          <MessageCircleQuestionMark aria-hidden='true' className='size-3.5 shrink-0 text-primary' />
          <span className='min-w-0 flex-1 truncate text-xs' title={summary}>
            {summary}
          </span>
          {remaining === undefined || isOpen ? null : (
            <span className='shrink-0 text-xs text-muted-foreground tabular-nums' aria-hidden='true'>
              {clock(remaining)}
            </span>
          )}
          <ChevronRight
            aria-hidden='true'
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none',
              isOpen && 'rotate-90',
            )}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul
          aria-label='Questions'
          // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable list must be keyboard reachable (WCAG 2.1.1)
          tabIndex={0}
          className='flex max-h-[min(22rem,45cqh)] scroll-shadows-y flex-col divide-y overflow-y-auto overscroll-contain border-t bg-background px-2 pb-2 focus-visible:focus-outline'
        >
          {offScreenWaiting.map((ask) => (
            <li key={ask.id}>
              <ChatQuestionCard isFlat ask={ask} />
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
