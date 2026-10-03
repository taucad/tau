import { useEffect, useMemo, useRef, useState } from 'react';
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
  const [element, setElement] = useState<HTMLDivElement | undefined>();
  useReportAskOnScreen(shouldReportOnScreen ? ask.id : undefined, element);
  if (questions === undefined) {
    return undefined;
  }
  const record = (label: string, write: () => Promise<void>): void => {
    // async-iife: bootstrap — the record change re-renders the card; a failed write is logged.
    void (async () => {
      try {
        await write();
      } catch (error) {
        console.error(`[questions] ${label} failed`, error);
      }
    })();
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
        {...(ask.agentId === undefined ? {} : { agentName: externalAgentDisplayName(ask.agentId) })}
        onAnswer={(questionId, reply) => {
          record('answer', async () => questions.answer(ask.id, questionId, reply));
        }}
        onHold={() => {
          record('hold', async () => questions.hold(ask.id));
        }}
        onDecline={() => {
          record('decline', async () => questions.decline(ask.id));
        }}
      />
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
  settledCount,
  answers,
  now,
}: {
  readonly waiting: readonly Ask[];
  readonly settledCount: number;
  readonly answers: Readonly<Record<string, AskAnswers>>;
  readonly now: number;
}): { readonly text: string; readonly remaining: number | undefined } => {
  const [first] = waiting;
  if (first === undefined) {
    return { text: `${plural(settledCount, 'question')} answered`, remaining: undefined };
  }
  const status = askStatus(first, answers[first.id], now);
  const next = first.questions.find((question) => answers[first.id]?.questions[question.id] === undefined);
  return {
    text: `${plural(waiting.length, 'question')} waiting · ${next?.header ?? next?.question ?? ''}`,
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
 * The composer tray's question section: every question this chat's agents asked, reachable after it scrolled away.
 *
 * Shows while some ask's card is off screen (agent questions blueprint D8).
 * Waiting questions come first, most urgent on top, answerable in place;
 * answered ones, newest first, sit behind "Show answered" while anything
 * waits. It opens by itself when a new question is waiting off screen and
 * closes again once nothing waits.
 *
 * @returns The section, or nothing.
 * @public
 */
export function ChatQuestionQueue(): React.JSX.Element | undefined {
  const questions = useOptionalChatQuestions();
  const onScreen = useOnScreenAskIds();
  const [isOpen, setIsOpen] = useState(false);
  const [isShowingAnswered, setIsShowingAnswered] = useState(false);
  const isSettled = useSettled();
  const announced = useRef(new Set<string>());
  /* Opened by a new question rather than by the person: closes again once nothing waits. */
  const isAutoOpened = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const asks = questions?.asks ?? [];
  const now = questions?.now ?? 0;
  const waiting = useMemo(() => waitingByUrgency(asks, questions?.answers, now), [asks, now, questions?.answers]);
  const settled = useMemo(() => asks.filter((ask) => !waiting.includes(ask)).toReversed(), [asks, waiting]);
  const offScreenWaiting = waiting.filter((ask) => !onScreen.has(ask.id));

  useEffect(() => {
    if (!isSettled) {
      return;
    }
    const fresh = offScreenWaiting.filter((ask) => !announced.current.has(ask.id));
    for (const ask of waiting) {
      announced.current.add(ask.id);
    }
    if (fresh.length > 0) {
      isAutoOpened.current = true;
      setIsOpen(true);
    } else if (waiting.length === 0 && isAutoOpened.current) {
      isAutoOpened.current = false;
      if (listRef.current?.contains(document.activeElement)) {
        triggerRef.current?.focus();
      }
      setIsOpen(false);
    }
  }, [isSettled, offScreenWaiting, waiting]);

  if (!isSettled || questions === undefined || asks.every((ask) => onScreen.has(ask.id))) {
    return undefined;
  }

  const isWaiting = waiting.length > 0;
  const { text: summary, remaining } = traySummary({
    waiting,
    settledCount: settled.length,
    answers: questions.answers,
    now,
  });

  return (
    <Collapsible
      open={isOpen}
      className='group/tray-section not-first:border-t'
      onOpenChange={(open) => {
        isAutoOpened.current = false;
        setIsOpen(open);
      }}
    >
      <CollapsibleTrigger asChild>
        <Button
          ref={triggerRef}
          variant='ghost'
          size='xs'
          className={cn(
            'relative flex h-auto min-h-8 w-full min-w-0 items-center justify-start gap-1.5 rounded-none px-2 py-1.5 text-left font-normal hover:bg-accent/50 hover:text-foreground focus-visible:z-10 group-first/tray-section:rounded-t-lg',
            isWaiting ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          <MessageCircleQuestionMark
            aria-hidden='true'
            className={cn('size-3.5 shrink-0', isWaiting ? 'text-primary' : undefined)}
          />
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
          ref={listRef}
          aria-label='Questions'
          // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable list must be keyboard reachable (WCAG 2.1.1)
          tabIndex={0}
          className='flex max-h-[min(22rem,45cqh)] scroll-shadows-y flex-col divide-y overflow-y-auto overscroll-contain border-t bg-background px-2 pb-3 focus-visible:focus-outline'
        >
          {waiting.map((ask) => (
            <li key={ask.id}>
              <ChatQuestionCard isFlat ask={ask} />
            </li>
          ))}
          {/* Answered questions pile up; with something waiting they stay behind a toggle. */}
          {waiting.length > 0 && settled.length > 0 ? (
            <li className='py-1'>
              <Button
                variant='ghost'
                size='xs'
                aria-expanded={isShowingAnswered}
                className='w-full justify-start text-muted-foreground'
                onClick={() => {
                  setIsShowingAnswered((value) => !value);
                }}
              >
                <ChevronRight
                  aria-hidden='true'
                  className={cn(
                    'transition-transform duration-200 motion-reduce:transition-none',
                    isShowingAnswered && 'rotate-90',
                  )}
                />
                {isShowingAnswered ? 'Hide answered' : `Show answered (${String(settled.length)})`}
              </Button>
            </li>
          ) : null}
          {waiting.length === 0 || isShowingAnswered
            ? settled.map((ask) => (
                <li key={ask.id}>
                  <ChatQuestionCard isFlat ask={ask} />
                </li>
              ))
            : null}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
