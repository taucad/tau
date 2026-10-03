import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowUp, CircleCheck, CircleSlash, Clock, MessageCircleQuestionMark, Undo2 } from 'lucide-react';
import { askStatus, resolveAnswers } from '@taucad/chat';
import type { Ask, AskAnswers, AskedQuestion, AskStatus } from '@taucad/chat';
import { Badge } from '@taucad/ui/components/badge';
import { Button } from '@taucad/ui/components/button';
import { Textarea } from '@taucad/ui/components/textarea';
import { cn } from '@taucad/ui/utils/cn';

/** What the person gives one question. @public */
export type QuestionReply = { readonly choice: string } | { readonly text: string };

/** @public */
export type QuestionCardProperties = {
  readonly ask: Ask;
  readonly answers: AskAnswers | undefined;
  /** Epoch milliseconds, ticking while the ask counts down. */
  readonly now: number;
  /** Product name of the external agent that asked, when one did. */
  readonly agentName?: string;
  readonly onAnswer: (questionId: string, reply: QuestionReply) => void;
  /** The person started answering in their own words: the agent keeps waiting. */
  readonly onHold: () => void;
  /** Decline a form that has no recommended option. */
  readonly onDecline: () => void;
  /** A flat row on the composer tray's surface instead of a bordered card. */
  readonly isFlat?: boolean;
  readonly className?: string;
};

const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const clock = (milliseconds: number): string => {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, '0')}`;
};

const minutes = (milliseconds: number): string => {
  const count = Math.max(1, Math.ceil(milliseconds / 60_000));
  return count === 1 ? '1 minute' : `${String(count)} minutes`;
};

const answerOf = (question: AskedQuestion, answers: AskAnswers | undefined): string | undefined => {
  const given = answers?.questions[question.id];
  if (given === undefined) {
    return undefined;
  }
  return 'choice' in given ? given.choice : given.text;
};

function LetterKey({ letter }: { readonly letter: string }): React.JSX.Element {
  return (
    <span
      aria-hidden='true'
      className='mt-px inline-flex size-5 shrink-0 items-center justify-center rounded-sm border bg-background text-xs font-medium text-muted-foreground tabular-nums group-hover:text-foreground'
    >
      {letter}
    </span>
  );
}

type QuestionBodyProperties = {
  readonly question: AskedQuestion;
  readonly isOpen: boolean;
  readonly onAnswer: (reply: QuestionReply) => void;
  readonly onHold: () => void;
  readonly isFlat: boolean;
  /** Take focus on arrival: the person just answered or reopened from inside the card. */
  readonly shouldTakeFocus: boolean;
  readonly onFocusTaken: () => void;
};

/** One question's lettered options and its own-words row. */
function QuestionOptions({
  question,
  isOpen,
  onAnswer,
  onHold,
  isFlat,
  shouldTakeFocus,
  onFocusTaken,
}: QuestionBodyProperties): React.JSX.Element {
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (shouldTakeFocus) {
      listRef.current?.querySelector<HTMLElement>('button[data-letter]:not(:disabled)')?.focus();
      onFocusTaken();
    }
  }, [shouldTakeFocus, onFocusTaken]);
  const [isWriting, setIsWriting] = useState(false);
  const [draft, setDraft] = useState('');
  const textId = useId();
  const textRef = useRef<HTMLTextAreaElement>(null);
  /* Choosing "Something else" moves focus into the box it opens. */
  useEffect(() => {
    if (isWriting) {
      textRef.current?.focus();
    }
  }, [isWriting]);
  const otherLetter = letters[question.options.length] ?? '…';
  const send = (): void => {
    const text = draft.trim();
    if (text !== '') {
      onAnswer({ text });
      setDraft('');
      setIsWriting(false);
    }
  };

  return (
    <ul ref={listRef} className='flex flex-col gap-1'>
      {question.options.map((option, index) => {
        const isRecommended = question.recommended === index;
        const letter = letters[index] ?? '…';
        return (
          <li key={option.label}>
            <button
              type='button'
              disabled={!isOpen}
              data-letter={letter}
              aria-label={`${letter}, ${option.label}${isRecommended ? ', recommended' : ''}${option.description ? `. ${option.description}` : ''}`}
              className={cn(
                'group flex w-full cursor-action items-start gap-2.5 rounded-md px-2 text-left transition-colors duration-100 hover:bg-accent/60 focus-visible:focus-outline disabled:cursor-default disabled:hover:bg-transparent',
                isFlat ? 'py-1.5' : 'py-2',
              )}
              onClick={() => {
                onAnswer({ choice: option.label });
              }}
            >
              <LetterKey letter={letter} />
              <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
                <span className='flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-foreground'>
                  <span className='wrap-break-word'>{option.label}</span>
                  {isRecommended ? (
                    <Badge variant='secondary' className='px-1.5 font-normal'>
                      Recommended
                    </Badge>
                  ) : null}
                </span>
                {option.description === undefined ? null : (
                  <span className='text-xs wrap-break-word text-muted-foreground'>{option.description}</span>
                )}
              </span>
            </button>
          </li>
        );
      })}
      {question.allowsText ? (
        <li>
          {isWriting || question.options.length === 0 ? (
            <div className={cn('flex items-start gap-2.5 rounded-md px-2', isFlat ? 'py-1.5' : 'py-2')}>
              {question.options.length === 0 ? null : <LetterKey letter={otherLetter} />}
              <div className='flex min-w-0 flex-1 items-end gap-1.5'>
                <label htmlFor={textId} className='sr-only'>
                  Your answer
                </label>
                <Textarea
                  ref={textRef}
                  id={textId}
                  rows={1}
                  value={draft}
                  disabled={!isOpen}
                  placeholder={question.options.length === 0 ? 'Type your answer' : 'Type your own answer'}
                  className='min-h-8 resize-none py-1.5'
                  onFocus={onHold}
                  onChange={(event) => {
                    setDraft(event.target.value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      send();
                    } else if (event.key === 'Escape' && question.options.length > 0) {
                      event.preventDefault();
                      event.stopPropagation();
                      setIsWriting(false);
                    }
                  }}
                />
                <Button
                  type='button'
                  size='icon-sm'
                  variant='outline'
                  aria-label='Send answer'
                  disabled={!isOpen || draft.trim() === ''}
                  onClick={send}
                >
                  <ArrowUp aria-hidden='true' />
                </Button>
              </div>
            </div>
          ) : (
            <button
              type='button'
              disabled={!isOpen}
              data-letter={otherLetter}
              aria-label={`${otherLetter}, Something else: answer in your own words`}
              className={cn(
                'group flex w-full cursor-action items-start gap-2.5 rounded-md px-2 text-left transition-colors duration-100 hover:bg-accent/60 focus-visible:focus-outline disabled:cursor-default disabled:hover:bg-transparent',
                isFlat ? 'py-1.5' : 'py-2',
              )}
              onClick={() => {
                setIsWriting(true);
                onHold();
              }}
            >
              <LetterKey letter={otherLetter} />
              <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
                <span className='text-sm font-medium text-foreground'>Something else</span>
                <span className='text-xs text-muted-foreground'>Answer in your own words.</span>
              </span>
            </button>
          )}
        </li>
      ) : null}
    </ul>
  );
}

/** "Seeds — Drop seeds", one line per settled question. */
function SettledRows({
  ask,
  answers,
  isDefaulted,
  isLone,
}: {
  readonly ask: Ask;
  readonly answers: AskAnswers | undefined;
  readonly isDefaulted: boolean;
  /** The ask's only question, already shown above its row. */
  readonly isLone: boolean;
}): React.JSX.Element {
  const resolved = resolveAnswers(ask, answers);
  return (
    <ul className='flex flex-col gap-1 px-2'>
      {ask.questions.map((question) => {
        const answer = resolved.find((entry) => entry.id === question.id);
        const isRecommended = answer?.source === 'recommended';
        return (
          <li key={question.id} className='flex min-w-0 items-start gap-2 text-xs'>
            {answer === undefined ? (
              <CircleSlash aria-hidden='true' className='mt-0.5 size-3 shrink-0 text-muted-foreground' />
            ) : (
              <CircleCheck
                aria-hidden='true'
                className={cn('mt-0.5 size-3 shrink-0', isRecommended ? 'text-muted-foreground' : 'text-success')}
              />
            )}
            <span className='min-w-0 flex-1 wrap-break-word text-muted-foreground'>
              {/* A lone question already stands above its row; only a header adds anything. */}
              {question.header === undefined && isLone ? null : (
                <>
                  <span className='text-foreground'>{question.header ?? question.question}</span>
                  {' — '}
                </>
              )}
              {answer === undefined ? (
                'no answer'
              ) : (
                <>
                  <span className='text-foreground'>{answer.answer}</span>
                  {isRecommended && isDefaulted ? ' (no reply in time)' : null}
                </>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const cardClassName = (isFlat: boolean): string => (isFlat ? 'px-1 py-2.5' : 'rounded-lg border bg-background p-3');

const settledTitle = (kind: AskStatus['kind'], agentName: string | undefined): string => {
  switch (kind) {
    case 'answered':
    case 'declined': {
      return `You ${kind}${agentName === undefined ? '' : ` ${agentName}`}`;
    }
    case 'defaulted': {
      return 'Recommendation used';
    }
    case 'cancelled':
    case 'open': {
      return 'Stopped before an answer';
    }
  }
};

const timerLabel = (status: AskStatus): string | undefined => {
  if (status.kind !== 'open') {
    return undefined;
  }
  if (status.remaining === undefined) {
    return 'Waiting for you';
  }
  return status.held ? `Waiting for you · ${clock(status.remaining)}` : `Recommended in ${clock(status.remaining)}`;
};

type SettledCardProperties = {
  readonly ask: Ask;
  readonly answers: AskAnswers | undefined;
  readonly kind: AskStatus['kind'];
  readonly agentName: string | undefined;
  readonly isFlat: boolean;
  readonly className: string | undefined;
  readonly shouldTakeFocus: boolean;
  readonly onFocusTaken: () => void;
  readonly onReopen: () => void;
};

/** A settled ask: what was answered, and a way to answer anyway once the agent moved on. */
function SettledCard({
  ask,
  answers,
  kind,
  agentName,
  isFlat,
  className,
  shouldTakeFocus,
  onFocusTaken,
  onReopen,
}: SettledCardProperties): React.JSX.Element {
  const titleId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (shouldTakeFocus) {
      cardRef.current?.focus();
      onFocusTaken();
    }
  }, [shouldTakeFocus, onFocusTaken]);
  const isDefaulted = kind === 'defaulted';
  return (
    <div
      ref={cardRef}
      role='group'
      aria-labelledby={titleId}
      data-ask-id={ask.id}
      tabIndex={-1}
      className={cn('flex flex-col gap-2 outline-none', cardClassName(isFlat), className)}
    >
      <div className='flex min-w-0 items-center gap-1.5 px-2 text-xs text-muted-foreground'>
        <MessageCircleQuestionMark aria-hidden='true' className='size-3.5 shrink-0' />
        <span id={titleId} className='min-w-0 flex-1 wrap-break-word'>
          {settledTitle(kind, agentName)}
        </span>
        {isDefaulted || kind === 'cancelled' ? (
          <Button
            type='button'
            variant='ghost'
            size='xs'
            className='-my-1 shrink-0 text-muted-foreground hover:text-foreground'
            onClick={onReopen}
          >
            <Undo2 aria-hidden='true' />
            Answer anyway
          </Button>
        ) : null}
      </div>
      <p className='px-2 text-sm wrap-break-word text-foreground'>
        {ask.questions.length === 1 ? ask.questions[0]?.question : (ask.message ?? 'Questions')}
      </p>
      {kind === 'declined' ? null : (
        <SettledRows ask={ask} answers={answers} isDefaulted={isDefaulted} isLone={ask.questions.length === 1} />
      )}
    </div>
  );
}

/** A letter key chooses that option while focus is inside the card, outside a text box. */
const pressLetter = (event: React.KeyboardEvent<HTMLDivElement>): void => {
  const target = event.target as HTMLElement;
  const letter = event.key.toUpperCase();
  if (event.metaKey || event.ctrlKey || event.altKey || letter.length !== 1 || target.closest('textarea, input')) {
    return;
  }
  const option = event.currentTarget.querySelector<HTMLButtonElement>(`button[data-letter="${letter}"]:not(:disabled)`);
  if (option) {
    event.preventDefault();
    option.click();
  }
};

/** Who asks and what about, with the countdown to the recommendation. */
function QuestionHeader({
  agentName,
  kicker,
  timer,
}: {
  readonly agentName: string | undefined;
  readonly kicker: string;
  readonly timer: string | undefined;
}): React.JSX.Element {
  return (
    <div className='flex min-w-0 items-center gap-1.5 px-2 text-xs text-muted-foreground'>
      <MessageCircleQuestionMark aria-hidden='true' className='size-3.5 shrink-0' />
      <span className='min-w-0 truncate'>
        {agentName === undefined ? 'Question' : `${agentName} asks`}
        {kicker === '' ? '' : ` · ${kicker}`}
      </span>
      {timer === undefined ? null : (
        <span className='ml-auto flex shrink-0 items-center gap-1 tabular-nums' aria-hidden='true'>
          <Clock className='size-3' />
          {timer}
        </span>
      )}
    </div>
  );
}

/**
 * Below the options: while answering an ask the agent already settled, a note that the answer
 * travels as a message; for a form with nothing recommended, Decline.
 */
function QuestionFooter({
  isLate,
  hasDefault,
  onCancel,
  onDecline,
}: {
  readonly isLate: boolean;
  readonly hasDefault: boolean;
  readonly onCancel: () => void;
  readonly onDecline: () => void;
}): React.JSX.Element | undefined {
  if (isLate) {
    return (
      <div className='flex items-center gap-2 px-2 text-xs text-muted-foreground'>
        <span className='min-w-0 flex-1'>The work already went ahead; your answer arrives as a message.</span>
        <Button type='button' variant='ghost' size='xs' className='shrink-0 text-muted-foreground' onClick={onCancel}>
          Cancel
        </Button>
      </div>
    );
  }
  return hasDefault ? undefined : (
    <div className='flex justify-end px-2'>
      <Button type='button' variant='ghost' size='xs' className='text-muted-foreground' onClick={onDecline}>
        Decline
      </Button>
    </div>
  );
}

/**
 * One agent question: lettered options with the recommended one marked, an
 * own-words row, and a quiet countdown to the recommendation.
 *
 * The same card serves Tau's `ask_questions`, Codex and Claude questions and
 * the composer tray (agent questions blueprint D7). It renders the record;
 * every action writes the person's answer and waits for the record to
 * change, so the transcript and the tray never disagree.
 *
 * @param properties - The ask, the person's answers so far and the actions.
 * @returns The card.
 * @public
 */
export function QuestionCard({
  ask,
  answers,
  now,
  agentName,
  onAnswer,
  onHold,
  onDecline,
  isFlat = false,
  className,
}: QuestionCardProperties): React.JSX.Element {
  const status = askStatus(ask, answers, now);
  const [isReopened, setIsReopened] = useState(false);
  const titleId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const isLate = status.kind === 'defaulted' || status.kind === 'cancelled';
  const isOpen = status.kind === 'open' || (isReopened && isLate);
  const current = ask.questions.find((question) => answerOf(question, answers) === undefined);
  const position = current === undefined ? ask.questions.length : ask.questions.indexOf(current) + 1;
  const isMulti = ask.questions.length > 1;
  const kicker = [current?.header, isMulti ? `${String(position)} of ${String(ask.questions.length)}` : undefined]
    .filter(Boolean)
    .join(' · ');
  /* An action taken from inside the card hands focus to what replaces it: the next question or the
   * settled card. It names the question left behind, which keeps the focus until it is gone. */
  const [focusFrom, setFocusFrom] = useState<string | undefined>();
  const clearFocusFrom = useCallback(() => {
    setFocusFrom(undefined);
  }, []);
  const reopen = (isReopening: boolean): void => {
    setFocusFrom(isReopening ? 'settled' : 'reopened');
    setIsReopened(isReopening);
  };

  if (!isOpen) {
    return (
      <SettledCard
        ask={ask}
        answers={answers}
        kind={status.kind}
        agentName={agentName}
        isFlat={isFlat}
        className={className}
        shouldTakeFocus={focusFrom !== undefined && focusFrom !== 'settled'}
        onFocusTaken={clearFocusFrom}
        onReopen={() => {
          reopen(true);
        }}
      />
    );
  }

  const remaining = status.kind === 'open' ? status.remaining : undefined;

  return (
    <div
      ref={cardRef}
      role='group'
      aria-labelledby={titleId}
      data-ask-id={ask.id}
      className={cn('flex flex-col gap-2', cardClassName(isFlat), className)}
      onKeyDown={pressLetter}
    >
      <QuestionHeader agentName={agentName} kicker={kicker} timer={timerLabel(status)} />
      {isMulti ? (
        <SettledRows
          ask={{ ...ask, questions: ask.questions.slice(0, position - 1) }}
          answers={answers}
          isDefaulted={false}
          isLone={false}
        />
      ) : null}
      {current === undefined ? null : (
        <>
          <p
            id={titleId}
            className={cn('px-2 font-medium text-foreground wrap-break-word', isFlat ? 'text-sm' : 'text-sm/6')}
          >
            {current.question}
          </p>
          {ask.message !== undefined && !isMulti ? (
            <p className='px-2 text-xs wrap-break-word text-muted-foreground'>{ask.message}</p>
          ) : null}
          <QuestionOptions
            key={current.id}
            question={current}
            isOpen={isOpen}
            isFlat={isFlat}
            shouldTakeFocus={focusFrom !== undefined && focusFrom !== current.id && focusFrom !== 'reopened'}
            onFocusTaken={clearFocusFrom}
            onHold={onHold}
            onAnswer={(reply) => {
              if (cardRef.current?.contains(document.activeElement)) {
                setFocusFrom(current.id);
              }
              onAnswer(current.id, reply);
            }}
          />
        </>
      )}
      <QuestionFooter
        isLate={isLate}
        hasDefault={ask.questions.some((question) => question.recommended !== undefined)}
        onDecline={onDecline}
        onCancel={() => {
          reopen(false);
        }}
      />
      <span role='status' className='sr-only'>
        {remaining === undefined
          ? ''
          : `If you do not answer, the recommended option is used in about ${minutes(remaining)}.`}
      </span>
    </div>
  );
}
