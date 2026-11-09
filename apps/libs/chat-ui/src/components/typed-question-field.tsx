import { useEffect, useId, useRef, useState } from 'react';
import { isQuestionAnswerValid } from '@taucad/chat';
import type { AskedQuestion, QuestionValue, QuestionReply } from '@taucad/chat';
import { Button } from '@taucad/ui/components/button';
import { Input } from '@taucad/ui/components/input';
import { Loader } from '@taucad/ui/components/loader';

type PendingAction = { kind: 'option'; value: string } | { kind: 'send' | 'confirm' | 'skip' };

/** Typed form controls preserve provider values and validate before recording. */
export function TypedQuestionField({
  question,
  isOpen,
  isPending = false,
  onHold,
  onAnswer,
  shouldTakeFocus = false,
  onFocusTaken,
}: {
  readonly question: AskedQuestion;
  readonly isOpen: boolean;
  readonly isPending?: boolean;
  readonly onHold: () => void;
  readonly onAnswer: (reply: QuestionReply) => void;
  readonly shouldTakeFocus?: boolean;
  readonly onFocusTaken?: () => void;
}): React.JSX.Element {
  const inputId = useId();
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (shouldTakeFocus) {
      element.current?.querySelector<HTMLElement>('button:not(:disabled),input:not(:disabled)')?.focus();
      onFocusTaken?.();
    }
  }, [shouldTakeFocus, onFocusTaken]);
  const [draft, setDraft] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [failure, setFailure] = useState<string>();
  const [pending, setPending] = useState<PendingAction>();
  const { field } = question;
  const submit = (reply: QuestionReply, action: PendingAction): void => {
    if (!isOpen) {
      return;
    }
    if (!isQuestionAnswerValid(question, reply)) {
      setFailure('Enter an answer that matches the requested limits.');
      return;
    }
    setFailure(undefined);
    setPending(action);
    onAnswer(reply);
  };
  const isBusy = (action: PendingAction): boolean =>
    isPending &&
    pending?.kind === action.kind &&
    (action.kind !== 'option' || (pending.kind === 'option' && pending.value === action.value));
  const progress = (action: PendingAction): React.JSX.Element | undefined =>
    isBusy(action) ? <Loader className='motion-reduce:animate-none' /> : undefined;
  const submitDraft = (): void => {
    let value: QuestionValue = draft;
    if (field?.type === 'number' || field?.type === 'integer') {
      if (draft.trim() === '') {
        setFailure('Enter a number.');
        return;
      }
      value = Number(draft);
    }
    submit(question.options.length > 0 && question.allowsText ? { text: draft } : { value }, { kind: 'send' });
  };
  return (
    <div ref={element} className='flex min-w-0 flex-col gap-2'>
      {field?.type === 'boolean' ? (
        <div className='flex gap-2'>
          {[true, false].map((value) => (
            <Button
              key={String(value)}
              size='xs'
              variant='outline'
              disabled={!isOpen}
              aria-busy={isBusy({ kind: 'option', value: String(value) })}
              onClick={() => {
                submit({ value }, { kind: 'option', value: String(value) });
              }}
            >
              {value ? 'Yes' : 'No'}
              {progress({ kind: 'option', value: String(value) })}
            </Button>
          ))}
        </div>
      ) : question.options.length > 0 ? (
        <div className='flex flex-col gap-1'>
          {question.options.map((option, index) => {
            const value = option.value ?? option.label;
            return (
              <Button
                key={`${String(index)}:${value}`}
                size='xs'
                variant={selected.includes(value) ? 'secondary' : 'ghost'}
                data-letter={'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[index]}
                disabled={!isOpen}
                aria-pressed={field?.type === 'array' ? selected.includes(value) : undefined}
                aria-busy={isBusy({ kind: 'option', value })}
                className='h-auto min-h-6 justify-start text-left whitespace-normal'
                onClick={() => {
                  if (field?.type === 'array') {
                    onHold();
                    setSelected((values) =>
                      values.includes(value) ? values.filter((item) => item !== value) : [...values, value],
                    );
                  } else {
                    submit({ value }, { kind: 'option', value });
                  }
                }}
              >
                <span>
                  {option.label}
                  {question.recommended === index ? (
                    <span className='ml-2 text-muted-foreground'>Recommended</span>
                  ) : null}
                  {option.description ? (
                    <span className='block text-xs font-normal text-muted-foreground'>{option.description}</span>
                  ) : null}
                </span>
                {progress({ kind: 'option', value })}
              </Button>
            );
          })}
          {field?.type === 'array' ? (
            <Button
              size='xs'
              disabled={!isOpen}
              aria-busy={isBusy({ kind: 'confirm' })}
              onClick={() => {
                submit({ value: selected }, { kind: 'confirm' });
              }}
            >
              Confirm selection{progress({ kind: 'confirm' })}
            </Button>
          ) : null}
        </div>
      ) : null}
      {(question.allowsText || question.options.length === 0) && field?.type !== 'boolean' ? (
        <div className='flex min-w-0 flex-col gap-1'>
          <label htmlFor={inputId} className='text-xs'>
            Your answer{field?.required === false ? ' (optional)' : ''}
          </label>
          <div className='flex gap-2'>
            <Input
              id={inputId}
              type={field?.type === 'number' || field?.type === 'integer' ? 'number' : 'text'}
              step={field?.type === 'integer' ? 1 : 'any'}
              min={field?.minimum}
              max={field?.maximum}
              minLength={field?.minLength}
              maxLength={field?.maxLength}
              value={draft}
              disabled={!isOpen}
              aria-invalid={failure !== undefined}
              onFocus={onHold}
              onChange={(event) => {
                setDraft(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  submitDraft();
                }
              }}
            />
            <Button size='xs' disabled={!isOpen} aria-busy={isBusy({ kind: 'send' })} onClick={submitDraft}>
              Send answer{progress({ kind: 'send' })}
            </Button>
          </div>
          {field?.minimum !== undefined || field?.maximum !== undefined ? (
            <p className='text-xs text-muted-foreground'>
              {field.type === 'integer' ? 'Whole number' : 'Number'}
              {field.minimum === undefined ? '' : ` · minimum ${String(field.minimum)}`}
              {field.maximum === undefined ? '' : ` · maximum ${String(field.maximum)}`}
            </p>
          ) : null}
        </div>
      ) : null}
      {field?.required === false ? (
        <Button
          size='xs'
          variant='ghost'
          disabled={!isOpen}
          aria-busy={isBusy({ kind: 'skip' })}
          onClick={() => {
            submit({ skipped: true }, { kind: 'skip' });
          }}
        >
          Skip{progress({ kind: 'skip' })}
        </Button>
      ) : null}
      {failure ? (
        <p role='alert' className='text-xs'>
          {failure}
        </p>
      ) : null}
    </div>
  );
}
