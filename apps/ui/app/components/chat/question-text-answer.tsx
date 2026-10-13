import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { ArrowUp } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { cn } from '@taucad/ui/utils/cn';
import { InputGroup, InputGroupTextarea } from '@taucad/ui/components/input-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { DictationButton, DictationFeedback, DictationRecording } from '#components/dictation/dictation-controls.js';
import { useDictation } from '#components/dictation/use-dictation.js';
import { chatComposerActionButtonClassName } from '#components/chat/chat-textarea-submit-button.js';

/** Own-words reply. Stop reviews the transcript; Send finishes dictation and submits the final answer. */
export function QuestionTextAnswer({
  draft,
  onDraftChange,
  isOpen,
  shouldTakeFocus,
  placeholder,
  onHold,
  onAnswer,
  onDismiss,
}: {
  readonly draft: string;
  readonly onDraftChange: Dispatch<SetStateAction<string>>;
  readonly isOpen: boolean;
  readonly shouldTakeFocus: boolean;
  readonly placeholder: string;
  readonly onHold: () => void;
  readonly onAnswer: (text: string) => void;
  readonly onDismiss: () => void;
}): React.JSX.Element {
  const textId = useId();
  const inputRef = useRef<HTMLDivElement>(null);
  const [recordingHeight, setRecordingHeight] = useState<number>();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const latestDraft = useRef(draft);
  useLayoutEffect(() => {
    latestDraft.current = draft;
  }, [draft]);
  const insertTranscript = useCallback(
    (text: string): void => {
      const previous = latestDraft.current;
      const next = `${previous}${previous === '' || /\s$/u.test(previous) ? '' : ' '}${text}`;
      // Send resumes before React necessarily commits the updated draft.
      latestDraft.current = next;
      onDraftChange(next);
    },
    [onDraftChange],
  );
  const dictation = useDictation(insertTranscript, textId);
  const isDictating = dictation.phase !== 'idle';
  const start = useCallback(async (): Promise<void> => {
    setRecordingHeight(inputRef.current?.getBoundingClientRect().height);
    onHold();
    await dictation.start();
  }, [dictation.start, onHold]);
  const sending = useRef(false);
  const canSend = isOpen && (isDictating ? dictation.phase === 'recording' : draft.trim() !== '');
  const send = async (): Promise<void> => {
    if (!canSend || sending.current) {
      return;
    }
    sending.current = true;
    try {
      if (isDictating && !(await dictation.stop())) {
        return;
      }
      const text = latestDraft.current.trim();
      if (text !== '') {
        onAnswer(text);
      }
    } finally {
      sending.current = false;
    }
  };
  const wasDictating = useRef(false);
  useEffect(() => {
    if (!isDictating && (shouldTakeFocus || wasDictating.current)) {
      textRef.current?.focus();
    }
    wasDictating.current = isDictating;
  }, [isDictating, shouldTakeFocus]);

  return (
    <div
      className='flex min-w-0 flex-1 flex-col gap-1'
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          if (isDictating) {
            dictation.cancel();
          } else {
            onDismiss();
          }
        }
      }}
    >
      <label htmlFor={textId} className='sr-only'>
        Your answer
      </label>
      <InputGroup
        ref={inputRef}
        aria-label='Answer input'
        className={cn('h-auto min-h-10 gap-1 rounded-xl p-1 shadow-none', !isDictating && 'items-end')}
        style={{ minHeight: isDictating ? recordingHeight : undefined }}
      >
        {isDictating ? (
          <DictationRecording phase={dictation.phase} levels={dictation.levels} onCancel={dictation.cancel} />
        ) : (
          <InputGroupTextarea
            ref={textRef}
            id={textId}
            rows={1}
            value={draft}
            disabled={!isOpen}
            placeholder={placeholder}
            className='max-h-40 min-h-8 px-2 py-1 leading-6 md:leading-6'
            onFocus={onHold}
            onChange={(event) => {
              onDraftChange(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void send();
              }
            }}
          />
        )}
        <div className='flex min-h-8 shrink-0 items-center gap-1'>
          {dictation.available === true && isOpen ? (
            <DictationButton phase={dictation.phase} onStart={start} onStop={dictation.stop} />
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type='button'
                variant='ghost'
                size='icon-sm'
                aria-label='Send answer'
                className={cn(
                  chatComposerActionButtonClassName,
                  'shrink-0 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-foreground',
                )}
                aria-disabled={!canSend}
                onClick={() => {
                  void send();
                }}
              >
                <ArrowUp aria-hidden='true' />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {dictation.phase === 'recording'
                ? 'Stop dictation and send answer'
                : isDictating
                  ? 'Wait for dictation to finish'
                  : 'Send answer'}
            </TooltipContent>
          </Tooltip>
        </div>
      </InputGroup>
      <DictationFeedback transcript={dictation.transcript} error={dictation.error} />
    </div>
  );
}
