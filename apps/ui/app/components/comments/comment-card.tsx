import { useCallback, useLayoutEffect, useRef } from 'react';
import { annotationLimits } from '@taucad/chat/annotations';
import type { AnnotationComment } from '@taucad/chat/annotations';
import { Button } from '@taucad/ui/components/button';
import { partLabelOf } from '#components/comments/draft-comments.js';
import { DictationControl, DictationFeedback } from '#components/dictation/dictation-controls.js';
import { useDictation } from '#components/dictation/use-dictation.js';

/*
 * A comment's card, where its words are written: over a pin in the viewer, and over a pin on an image in mark up.
 */

const outdatedNote = 'The model has changed since this comment.';

/**
 * A sent or edited comment's card: its words, to read.
 *
 * @param props - The comment, and whether its model has changed since.
 * @returns The card.
 */
export function ReadOnlyCommentCard({
  comment,
  isOutdated,
}: {
  readonly comment: AnnotationComment;
  readonly isOutdated: boolean;
}): React.JSX.Element {
  return (
    <div className='flex flex-col gap-2' data-comment-ui=''>
      <div className='flex items-center gap-2'>
        <span className='flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-markup-ink text-xs font-semibold text-markup-ink'>
          {comment.number}
        </span>
        <span className='min-w-0 flex-1 truncate text-xs text-muted-foreground'>
          {partLabelOf(comment) ?? 'Comment'}
        </span>
      </div>
      <p className='text-sm break-words whitespace-pre-wrap'>{comment.text}</p>
      {isOutdated ? <p className='text-xs text-muted-foreground'>{outdatedNote}</p> : null}
    </div>
  );
}

/**
 * A draft comment's card: its words, with the composer's microphone (charter D15), Move and Remove.
 *
 * @param props - The comment, and what its controls do.
 * @returns The card.
 */
export function CommentCard({
  comment,
  onText,
  onRemove,
  onDone,
  onMove,
  isOutdated,
  hasDoneButton = false,
}: {
  readonly comment: AnnotationComment;
  readonly onText: (text: string) => void;
  readonly onRemove: () => void;
  readonly onDone: () => void;
  /** Starts a move without a drag; a pin that cannot move has none. */
  readonly onMove?: () => void;
  readonly isOutdated: boolean;
  /** A Done button beside the microphone, for a phone, whose keyboard's return key is not always Enter. */
  readonly hasDoneButton?: boolean;
}): React.JSX.Element {
  // The composer's microphone, here for the comment's words (charter D15). Final text joins what is typed.
  const latestText = useRef(comment.text);
  useLayoutEffect(() => {
    latestText.current = comment.text;
  }, [comment.text]);
  const insertTranscript = useCallback(
    (text: string): void => {
      const previous = latestText.current;
      const next = `${previous}${previous === '' || /\s$/u.test(previous) ? '' : ' '}${text}`.slice(
        0,
        annotationLimits.commentCharacters,
      );
      latestText.current = next;
      onText(next);
    },
    [onText],
  );
  const dictation = useDictation(insertTranscript, `comment-${comment.number}`);
  const finish = async (): Promise<void> => {
    if (dictation.phase !== 'idle' && !(await dictation.stop())) {
      return;
    }
    onDone();
  };
  return (
    <div className='flex flex-col gap-2' data-comment-ui=''>
      <div className='flex items-center gap-2'>
        <span className='flex size-5 shrink-0 items-center justify-center rounded-full bg-markup-ink text-xs font-semibold text-white'>
          {comment.number}
        </span>
        <span className='min-w-0 flex-1 truncate text-xs text-muted-foreground'>
          {partLabelOf(comment) ?? 'Comment'}
        </span>
        {onMove === undefined ? null : (
          <Button variant='ghost' size='sm' onClick={onMove}>
            Move
          </Button>
        )}
        <Button variant='ghost' size='sm' onClick={onRemove}>
          Remove
        </Button>
      </div>
      <textarea
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- the card opens from the person's own click, to be typed in.
        autoFocus
        rows={3}
        maxLength={annotationLimits.commentCharacters}
        value={comment.text}
        aria-label={`Comment ${comment.number}`}
        placeholder='What should change here?'
        className='w-full resize-none rounded-md border border-border bg-background p-2 text-sm outline-none focus-visible:focus-outline'
        onChange={(event) => {
          onText(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void finish();
          }
        }}
      />
      <DictationFeedback transcript={dictation.transcript} />
      <div className='flex items-center gap-2'>
        <p className='min-w-0 flex-1 text-xs text-muted-foreground'>
          {isOutdated ? `${outdatedNote} ` : ''}Sent with your next message. Enter to finish.
        </p>
        {dictation.available === true ? (
          <DictationControl
            phase={dictation.phase}
            waveform={dictation.waveform}
            onStart={dictation.start}
            onStop={dictation.stop}
            onCancel={dictation.cancel}
          />
        ) : null}
        {hasDoneButton ? (
          <Button
            variant='secondary'
            size='sm'
            onClick={() => {
              void finish();
            }}
          >
            Done
          </Button>
        ) : null}
      </div>
    </div>
  );
}
