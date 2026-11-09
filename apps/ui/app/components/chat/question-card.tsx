import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleSlash,
  Clock,
  Command,
  CornerDownLeft,
  MessageCircleQuestionMark,
  Undo2,
} from 'lucide-react';
import { askStatus, resolveAnswers, questionValueText, isQuestionAnswerValid } from '@taucad/chat';
import type { Ask, AskAnswers, AskedQuestion, AskStatus, QuestionReply } from '@taucad/chat';
import { Badge } from '@taucad/ui/components/badge';
import { Loader } from '@taucad/ui/components/loader';
import { Button } from '@taucad/ui/components/button';
import { usePlatform } from '@taucad/ui/hooks/use-platform';
import { ariaKeyShortcuts } from '@taucad/ui/utils/keys';
import { cn } from '@taucad/ui/utils/cn';
import { TypedQuestionField } from '@taucad/chat-ui/components/typed-question-field';
import { QuestionTextAnswer } from '#components/chat/question-text-answer.js';

/** @public */
export type QuestionCardProperties = {
  readonly ask: Ask;
  readonly answers: AskAnswers | undefined;
  /** Epoch milliseconds, ticking while the ask counts down. */
  readonly now: number;
  /** Product name of the external agent that asked, when one did. */
  readonly agentName?: string;
  readonly onAnswer: (questionId: string, reply: QuestionReply) => void;
  /** The person started answering (chose an option or wrote): the agent keeps waiting. */
  readonly onHold: () => void;
  /** Decline a form that has no recommended option. */
  readonly onDecline: () => void;
  /** A flat row on the composer tray's surface instead of a bordered card. */
  readonly isFlat?: boolean;
  /** Disable submissions while the durable answer is being written. */
  readonly isPending?: boolean;
  readonly className?: string;
};

const sendKeyCombination = { key: 'Enter', modKey: true } as const;

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
  if (given === undefined || !isQuestionAnswerValid(question, given)) {
    return undefined;
  }
  return 'choice' in given
    ? given.choice
    : 'text' in given
      ? given.text
      : 'value' in given
        ? questionValueText(given.value)
        : 'Skipped';
};

/**
 * Whether the card's own rows can answer the question: plain questions, and provider fields that are a
 * choice of options (one, or several for a list). Other typed fields keep their dedicated controls.
 */
const isChoiceQuestion = (question: AskedQuestion): boolean =>
  question.field === undefined ||
  (question.options.length > 0 && (question.field.type === 'string' || question.field.type === 'array'));

const isMultiple = (question: AskedQuestion): boolean => question.field?.type === 'array';

const optionValue = (question: AskedQuestion, index: number): string => {
  const option = question.options[index];
  return option?.value ?? option?.label ?? '';
};

/** The record's reply for the chosen rows: a label, or the provider's own values. */
const choiceReply = (question: AskedQuestion, indices: readonly number[]): QuestionReply | undefined => {
  const [first] = indices;
  if (first === undefined) {
    return undefined;
  }
  if (question.field === undefined) {
    return { choice: question.options[first]?.label ?? '' };
  }
  return isMultiple(question)
    ? { value: [...indices].sort((a, b) => a - b).map((index) => optionValue(question, index)) }
    : { value: optionValue(question, first) };
};

/** Rows to show as chosen when a recorded answer is revisited. */
const recordedChoice = (
  question: AskedQuestion,
  answers: AskAnswers | undefined,
): { readonly indices: number[]; readonly text: string | undefined } => {
  const given = answers?.questions[question.id];
  if (given === undefined || !isQuestionAnswerValid(question, given)) {
    return { indices: [], text: undefined };
  }
  if ('text' in given) {
    return { indices: [], text: given.text };
  }
  const values = 'choice' in given ? [given.choice] : 'value' in given ? [given.value].flat() : [];
  const indices = question.options.flatMap((option, index) =>
    values.some((value) => value === option.label || value === (option.value ?? option.label)) ? [index] : [],
  );
  return { indices, text: undefined };
};

/** ⌘↵ or Ctrl ↵ as separate keycaps: the two glyphs sit on different baselines in every font. */
function SendKeys(): React.JSX.Element {
  const platform = usePlatform();
  const keycap = 'grid h-4 min-w-4 place-items-center rounded-[3px] border border-current/30 px-0.5';
  return (
    <span aria-hidden='true' className='hidden items-center gap-0.5 opacity-80 md:inline-flex pointer-coarse:hidden'>
      <span className={keycap}>
        {platform === 'mac' ? (
          <Command className='size-2.5' strokeWidth={2.25} />
        ) : (
          <span className='text-[10px]/none font-medium'>Ctrl</span>
        )}
      </span>
      <span className={keycap}>
        <CornerDownLeft className='size-2.5' strokeWidth={2.25} />
      </span>
    </span>
  );
}

const timerLabel = (status: AskStatus): string | undefined => {
  if (status.kind !== 'open') {
    return undefined;
  }
  if (status.remaining === undefined) {
    return 'Waiting for you';
  }
  return status.held ? `Waiting for you · ${clock(status.remaining)}` : `Recommended in ${clock(status.remaining)}`;
};

type FooterProperties = {
  readonly timer: string | undefined;
  /** Skip or Decline, when the question or form offers one. */
  readonly secondary?: ReactNode;
  /** Next or Submit, for questions the card's rows answer. */
  readonly primary?: ReactNode;
};

/** The countdown on the left; Skip/Decline and Next/Submit on the right. */
function QuestionFooter({ timer, secondary, primary }: FooterProperties): React.JSX.Element | undefined {
  if (timer === undefined && secondary === undefined && primary === undefined) {
    return undefined;
  }
  return (
    <div className='flex flex-wrap items-center justify-end gap-2 border-t px-3 py-2.5'>
      {timer === undefined ? null : (
        <span
          className='mr-auto flex min-w-0 items-center gap-1 text-xs text-muted-foreground tabular-nums'
          aria-hidden='true'
        >
          <Clock className='size-3 shrink-0' />
          <span className='truncate'>{timer}</span>
        </span>
      )}
      {secondary}
      {primary}
    </div>
  );
}

const rowClassName = (isChecked: boolean, isOpen: boolean): string =>
  cn(
    'flex items-start gap-3 px-3 py-2.5 transition-colors',
    // Hover and selection stay achromatic; the checked control carries the colour.
    isOpen && 'hover:bg-accent/50 has-focus-visible:bg-accent/50',
    isChecked && 'bg-accent/60',
    !isOpen && !isChecked && 'opacity-60',
  );

/** A native radio or checkbox, drawn with Tau tokens and aligned to the label's first line. */
function ChoiceControl({
  isMultiple: multiple,
  ...properties
}: React.ComponentProps<'input'> & { readonly isMultiple: boolean }): React.JSX.Element {
  return (
    <span className='relative grid h-5 shrink-0 place-items-center'>
      <input
        type={multiple ? 'checkbox' : 'radio'}
        {...properties}
        className={cn(
          'peer size-4 shrink-0 appearance-none border-2 border-muted-foreground/40 bg-background outline-none transition-[border-color,border-width,background-color] focus-visible:focus-outline',
          multiple
            ? 'rounded-[5px] checked:border-primary checked:bg-primary'
            : 'rounded-full checked:border-[5px] checked:border-primary',
        )}
      />
      {multiple ? (
        <Check
          aria-hidden='true'
          strokeWidth={3}
          className='pointer-events-none absolute size-3 text-primary-foreground opacity-0 peer-checked:opacity-100'
        />
      ) : null}
    </span>
  );
}

type ChoiceBodyProperties = {
  readonly question: AskedQuestion;
  readonly answers: AskAnswers | undefined;
  readonly isOpen: boolean;
  readonly isPending: boolean;
  readonly isLast: boolean;
  readonly timer: string | undefined;
  readonly secondary: ReactNode;
  readonly onAnswer: (reply: QuestionReply) => void;
  readonly onHold: () => void;
  /** Take focus on arrival: the person just answered or reopened from inside the card. */
  readonly shouldTakeFocus: boolean;
  readonly onFocusTaken: () => void;
};

/**
 * One question's rows: a radio per option for one answer, a checkbox per option for a list, and an
 * Other row that opens the own-words box. Choosing only selects; Next (or Submit on the last
 * question, or ⌘↵) records the reply. An empty Other never sends.
 */
function ChoiceBody({
  question,
  answers,
  isOpen,
  isPending,
  isLast,
  timer,
  secondary,
  onAnswer,
  onHold,
  shouldTakeFocus,
  onFocusTaken,
}: ChoiceBodyProperties): React.JSX.Element {
  const name = useId();
  const platform = usePlatform();
  const listRef = useRef<HTMLDivElement>(null);
  const multiple = isMultiple(question);
  const hasOptions = question.options.length > 0;
  const [recorded] = useState(() => recordedChoice(question, answers));
  const [indices, setIndices] = useState<number[]>(recorded.indices);
  const [isOther, setIsOther] = useState(!hasOptions || recorded.text !== undefined);
  const [draft, setDraft] = useState(recorded.text ?? '');
  const [isSending, setIsSending] = useState(false);
  const held = useRef(false);
  useEffect(() => {
    if (shouldTakeFocus) {
      const list = listRef.current;
      (
        list?.querySelector<HTMLElement>('input:checked:not(:disabled)') ??
        list?.querySelector<HTMLElement>('input:not(:disabled)')
      )?.focus();
      onFocusTaken();
    }
  }, [shouldTakeFocus, onFocusTaken]);

  const hold = (): void => {
    if (!held.current) {
      held.current = true;
      onHold();
    }
  };
  const reply: QuestionReply | undefined = isOther
    ? draft.trim() === ''
      ? undefined
      : { text: draft.trim() }
    : choiceReply(question, indices);
  const canSend = isOpen && reply !== undefined && isQuestionAnswerValid(question, reply);
  const send = (): void => {
    if (canSend) {
      setIsSending(true);
      onAnswer(reply);
    }
  };
  const choose = (index: number): void => {
    hold();
    setIsSending(false);
    // A reply is either chosen values or own words, so Other and the options exclude each other.
    setIsOther(false);
    setIndices((current) =>
      multiple ? (current.includes(index) ? current.filter((value) => value !== index) : [...current, index]) : [index],
    );
  };
  const chooseOther = (): void => {
    hold();
    setIsSending(false);
    if (multiple && isOther) {
      setIsOther(false);
      return;
    }
    setIndices([]);
    setIsOther(true);
  };

  return (
    <div
      className='flex min-w-0 flex-col'
      onKeyDown={(event) => {
        if (
          event.key === 'Enter' &&
          (platform === 'mac' ? event.metaKey : event.ctrlKey) &&
          !event.nativeEvent.isComposing
        ) {
          event.preventDefault();
          send();
        }
      }}
    >
      <div
        ref={listRef}
        role={multiple ? 'group' : 'radiogroup'}
        aria-label={multiple ? 'Choose any' : 'Choose one'}
        className='flex flex-col divide-y'
      >
        {question.options.map((option, index) => {
          const isChecked = !isOther && indices.includes(index);
          const isRecommended = question.recommended === index;
          return (
            <label key={`${String(index)}:${option.label}`} className={rowClassName(isChecked, isOpen)}>
              <ChoiceControl
                isMultiple={multiple}
                name={name}
                checked={isChecked}
                disabled={!isOpen}
                aria-label={`${option.label}${isRecommended ? ', recommended' : ''}${option.description ? `. ${option.description}` : ''}`}
                onChange={() => {
                  choose(index);
                }}
              />
              <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
                <span className='flex flex-wrap items-center gap-x-2 gap-y-1'>
                  <span className='text-sm/5 wrap-break-word text-foreground'>{option.label}</span>
                  {isRecommended ? (
                    <Badge variant='secondary' className='h-5 py-0 font-normal'>
                      Recommended
                    </Badge>
                  ) : null}
                </span>
                {option.description === undefined ? null : (
                  <span className='text-xs/5 wrap-break-word text-muted-foreground'>{option.description}</span>
                )}
              </span>
            </label>
          );
        })}
        {question.allowsText || !hasOptions ? (
          <div className={cn('flex flex-col', isOther && hasOptions && 'bg-accent/60')}>
            {hasOptions ? (
              <label className={cn(rowClassName(isOther, isOpen), isOther && 'pb-2')}>
                <ChoiceControl
                  isMultiple={multiple}
                  name={name}
                  checked={isOther}
                  disabled={!isOpen}
                  aria-label='Other: answer in your own words'
                  onChange={chooseOther}
                />
                <span className='text-sm/5 text-foreground'>Other</span>
              </label>
            ) : null}
            {isOther ? (
              <div className={cn('px-3 pb-2.5', hasOptions ? 'pl-10' : 'pt-2.5')}>
                <QuestionTextAnswer
                  draft={draft}
                  onDraftChange={setDraft}
                  isOpen={isOpen}
                  isPending={isPending && isSending && isOther}
                  shouldTakeFocus={hasOptions}
                  placeholder={hasOptions ? 'Type your own answer' : 'Type your answer'}
                  onHold={onHold}
                  onAnswer={(text) => {
                    setIsSending(true);
                    onAnswer({ text });
                  }}
                  onDismiss={() => {
                    if (hasOptions) {
                      setIsOther(false);
                      listRef.current?.querySelector<HTMLElement>('input:not(:disabled)')?.focus();
                    }
                  }}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <QuestionFooter
        timer={timer}
        secondary={secondary}
        primary={
          <Button
            type='button'
            size='sm'
            disabled={!canSend}
            aria-busy={isPending && isSending}
            aria-keyshortcuts={ariaKeyShortcuts(sendKeyCombination, platform)}
            onClick={send}
          >
            {isPending && isSending ? <Loader className='motion-reduce:animate-none' /> : null}
            {isLast ? 'Submit' : 'Next'}
            <SendKeys />
          </Button>
        }
      />
    </div>
  );
}

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

/** What a settled row says: the answer, or why there is none. */
const settledAnswerText = (
  kind: AskStatus['kind'],
  answer: ReturnType<typeof resolveAnswers>[number] | undefined,
  given: AskAnswers['questions'][string] | undefined,
): string => {
  if (kind === 'declined') {
    return 'Declined';
  }
  if (given !== undefined && 'skipped' in given) {
    return 'Skipped';
  }
  // A recommendation is only adopted when the wait runs out; a stopped ask adopted nothing.
  if (answer === undefined || (answer.source === 'recommended' && kind !== 'defaulted')) {
    return 'No answer';
  }
  return answer.source === 'recommended' ? `${answer.answer} · recommended, no reply in time` : answer.answer;
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

/** A settled ask: each question with what was answered beneath it, and a way to answer anyway once the agent moved on. */
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
  const resolved = resolveAnswers(ask, answers);
  return (
    <div
      ref={cardRef}
      role='group'
      aria-labelledby={titleId}
      data-ask-id={ask.id}
      data-ask-state='settled'
      tabIndex={-1}
      className={cn('flex flex-col overflow-hidden outline-none', cardClassName(isFlat), className)}
    >
      <div className='flex min-w-0 items-center gap-2 border-b px-3 py-2 text-xs text-muted-foreground'>
        {kind === 'answered' ? (
          <CircleCheck aria-hidden='true' className='size-3.5 shrink-0 text-success' />
        ) : kind === 'defaulted' ? (
          <Clock aria-hidden='true' className='size-3.5 shrink-0' />
        ) : (
          <CircleSlash aria-hidden='true' className='size-3.5 shrink-0' />
        )}
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
      {ask.message !== undefined && ask.questions.length > 1 ? (
        <p className='border-b px-3 py-2 text-xs/5 wrap-break-word text-muted-foreground'>{ask.message}</p>
      ) : null}
      <dl className='flex flex-col divide-y'>
        {ask.questions.map((question) => {
          const answer = resolved.find((entry) => entry.id === question.id);
          return (
            <div key={question.id} className='flex min-w-0 flex-col gap-0.5 px-3 py-2.5'>
              <dt className='text-sm/5 wrap-break-word text-foreground'>{question.question}</dt>
              <dd className='text-sm/5 wrap-break-word text-muted-foreground'>
                {settledAnswerText(kind, answer, answers?.questions[question.id])}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

/** Skip for an optional question; Decline for a form with nothing recommended. */
function SecondaryAction({
  kind,
  isPending,
  isBusy,
  onSkip,
  onDecline,
}: {
  readonly kind: 'skip' | 'decline';
  readonly isPending: boolean;
  readonly isBusy: boolean;
  readonly onSkip: () => void;
  readonly onDecline: () => void;
}): React.JSX.Element {
  return (
    <Button
      type='button'
      size='sm'
      variant='secondary'
      disabled={isPending}
      aria-busy={isBusy}
      onClick={kind === 'skip' ? onSkip : onDecline}
    >
      {kind === 'skip' ? 'Skip' : 'Decline'}
      {isBusy ? <Loader className='motion-reduce:animate-none' /> : null}
    </Button>
  );
}

const cardClassName = (isFlat: boolean): string => (isFlat ? '' : 'rounded-xl border bg-background');

/** The tinted strip: who asks and about what, the question, and a pager across the ask's questions. */
function QuestionHeader({
  titleId,
  kicker,
  question,
  message,
  position,
  total,
  isBackEnabled,
  isForwardEnabled,
  onBack,
  onForward,
}: {
  readonly titleId: string;
  readonly kicker: string;
  readonly question: string;
  readonly message: string | undefined;
  readonly position: number;
  readonly total: number;
  readonly isBackEnabled: boolean;
  readonly isForwardEnabled: boolean;
  readonly onBack: () => void;
  readonly onForward: () => void;
}): React.JSX.Element {
  return (
    <div className='flex min-w-0 items-start gap-2 border-b bg-muted/60 px-3 py-2.5'>
      <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
        <span className='flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground'>
          <MessageCircleQuestionMark aria-hidden='true' className='size-3.5 shrink-0' />
          <span className='truncate'>{kicker}</span>
        </span>
        <p id={titleId} className='text-sm/5 font-medium wrap-break-word text-foreground'>
          {question}
        </p>
        {message === undefined ? null : <p className='text-xs/5 wrap-break-word text-muted-foreground'>{message}</p>}
      </div>
      {total > 1 ? (
        <nav
          aria-label='Questions'
          className='-my-0.5 -mr-1.5 flex shrink-0 items-center text-xs text-muted-foreground tabular-nums'
        >
          <Button
            type='button'
            size='icon-xs'
            variant='ghost'
            aria-label='Previous question'
            disabled={!isBackEnabled}
            onClick={onBack}
          >
            <ChevronLeft aria-hidden='true' />
          </Button>
          <span className='px-0.5'>
            {position} of {total}
          </span>
          <Button
            type='button'
            size='icon-xs'
            variant='ghost'
            aria-label='Next question'
            disabled={!isForwardEnabled}
            onClick={onForward}
          >
            <ChevronRight aria-hidden='true' />
          </Button>
        </nav>
      ) : null}
    </div>
  );
}

/**
 * One agent question at a time: a tinted header with a pager, a radio (one answer) or checkbox (a
 * list) per option with the recommended one marked, an Other row for own words, and a footer with
 * the countdown, Skip or Decline, and Next/Submit (⌘↵).
 *
 * The same card serves Tau's `ask_questions`, Codex and Claude questions and the composer tray
 * (agent questions blueprint D7). It renders the record; Next writes the person's answer for the
 * current question and the card moves on once the record changes, so the transcript and the tray
 * never disagree.
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
  isPending = false,
  className,
}: QuestionCardProperties): React.JSX.Element {
  const status = askStatus(ask, answers, now);
  const [isReopened, setIsReopened] = useState(false);
  const titleId = useId();
  const isLate = status.kind === 'defaulted' || status.kind === 'cancelled';
  const isOpen = status.kind === 'open' || (isReopened && isLate);
  const [isDeclining, setIsDeclining] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [reviewQuestion, setReviewQuestion] = useState<string>();
  const firstUnanswered = ask.questions.findIndex((question) => answerOf(question, answers) === undefined);
  const reviewIndex = ask.questions.findIndex((question) => question.id === reviewQuestion);
  const currentIndex = reviewIndex === -1 ? firstUnanswered : reviewIndex;
  const current = ask.questions[currentIndex];
  const position = current === undefined ? ask.questions.length : currentIndex + 1;
  const frontier = firstUnanswered === -1 ? ask.questions.length - 1 : firstUnanswered;
  const isLast =
    current !== undefined &&
    ask.questions.every((question) => question.id === current.id || answerOf(question, answers) !== undefined);
  const kicker = [agentName === undefined ? 'Question' : `${agentName} asks`, current?.header]
    .filter(Boolean)
    .join(' · ');
  /* An action taken from inside the card hands focus to what replaces it: the next question or the
   * settled card. It names the question left behind, which keeps the focus until it is gone. */
  const [focusFrom, setFocusFrom] = useState<string | undefined>();
  const clearFocusFrom = useCallback(() => {
    setFocusFrom(undefined);
  }, []);
  const cardRef = useRef<HTMLDivElement>(null);
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
  const hasDefault = ask.questions.some((question) => question.recommended !== undefined);
  const timer = timerLabel(status);
  const answerCurrent = (reply: QuestionReply): void => {
    if (current === undefined) {
      return;
    }
    setIsDeclining(false);
    setIsSkipping('skipped' in reply);
    if (cardRef.current?.contains(document.activeElement)) {
      setFocusFrom(current.id);
    }
    setReviewQuestion(undefined);
    onAnswer(current.id, reply);
  };
  const secondaryKind =
    current?.field?.required === false && isChoiceQuestion(current)
      ? 'skip'
      : hasDefault || isLate
        ? undefined
        : 'decline';
  const secondary =
    secondaryKind === undefined ? undefined : (
      <SecondaryAction
        kind={secondaryKind}
        isPending={isPending}
        isBusy={isPending && (isSkipping || isDeclining)}
        onSkip={() => {
          answerCurrent({ skipped: true });
        }}
        onDecline={() => {
          if (!isPending) {
            setIsDeclining(true);
            setIsSkipping(false);
            onDecline();
          }
        }}
      />
    );
  const shouldTakeFocus =
    current !== undefined && focusFrom !== undefined && focusFrom !== current.id && focusFrom !== 'reopened';

  return (
    <div
      ref={cardRef}
      role='group'
      aria-labelledby={titleId}
      data-ask-id={ask.id}
      data-ask-state='open'
      className={cn('flex flex-col overflow-hidden', cardClassName(isFlat), className)}
    >
      {current === undefined ? null : (
        <>
          <QuestionHeader
            titleId={titleId}
            kicker={kicker}
            question={current.question}
            message={ask.questions.length === 1 ? ask.message : undefined}
            position={position}
            total={ask.questions.length}
            isBackEnabled={currentIndex > 0 && !isPending}
            isForwardEnabled={currentIndex < frontier && !isPending}
            onBack={() => {
              setReviewQuestion(ask.questions[currentIndex - 1]?.id);
            }}
            onForward={() => {
              const next = currentIndex + 1;
              setReviewQuestion(next >= frontier ? undefined : ask.questions[next]?.id);
            }}
          />
          {isLate ? (
            <div className='flex items-center gap-2 border-b px-3 py-2 text-xs text-muted-foreground'>
              <span className='min-w-0 flex-1'>The work already went ahead; your answer arrives as a message.</span>
              <Button
                type='button'
                variant='ghost'
                size='xs'
                className='-my-1 shrink-0 text-muted-foreground'
                onClick={() => {
                  reopen(false);
                }}
              >
                Cancel
              </Button>
            </div>
          ) : null}
          {isChoiceQuestion(current) ? (
            <ChoiceBody
              key={`${ask.id}:${current.id}`}
              question={current}
              answers={answers}
              isOpen={!isPending}
              isPending={isPending && !isDeclining && !isSkipping}
              isLast={isLast}
              timer={timer}
              secondary={secondary}
              shouldTakeFocus={shouldTakeFocus}
              onFocusTaken={clearFocusFrom}
              onHold={onHold}
              onAnswer={answerCurrent}
            />
          ) : (
            <>
              <div className='px-3 py-2.5'>
                <TypedQuestionField
                  key={`${ask.id}:${current.id}`}
                  question={current}
                  isOpen={!isPending}
                  isPending={isPending && !isDeclining}
                  onHold={onHold}
                  shouldTakeFocus={shouldTakeFocus}
                  onFocusTaken={clearFocusFrom}
                  onAnswer={answerCurrent}
                />
              </div>
              <QuestionFooter timer={timer} secondary={secondary} />
            </>
          )}
        </>
      )}
      <span role='status' className='sr-only'>
        {remaining === undefined
          ? ''
          : `If you do not answer, the recommended option is used in about ${minutes(remaining)}.`}
      </span>
    </div>
  );
}
