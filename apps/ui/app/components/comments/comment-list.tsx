import { annotationLimits } from '@taucad/chat/annotations';
import { X } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import type { AnnotationComment, MessageAnnotations } from '@taucad/chat/annotations';
import { attachmentUrl } from '@taucad/chat-ui/utils/attachment.utils';
import { removeComments, setCommentText } from '#components/comments/draft-comments.js';
import { useDraftActions, useDraftSelector } from '#hooks/use-chat.js';

const badgeClass =
  'flex size-5 shrink-0 items-center justify-center rounded-full bg-markup-ink text-xs font-semibold text-white';

/**
 * The part a comment is pinned on, when the model names it.
 *
 * @param comment - The comment.
 * @returns The part's label.
 */
export const partLabelOf = (comment: AnnotationComment): string | undefined => {
  const label = comment.model?.part?.label;
  return label === undefined || label === '' ? undefined : label;
};

const whereOf = partLabelOf;

/** The remove button of a comment row. */
function RemoveCommentButton({
  number,
  onRemove,
}: {
  readonly number: number;
  readonly onRemove: () => void;
}): React.JSX.Element {
  return (
    <Button
      variant='ghost'
      size='icon'
      className='size-6 shrink-0'
      aria-label={`Remove comment ${number}`}
      onClick={onRemove}
    >
      <X className='size-3.5' />
    </Button>
  );
}

/**
 * The new-message draft's comments, in the composer: each can be reworded or removed without the viewer.
 *
 * @returns The list, or nothing for a draft without comments.
 */
export function DraftCommentList(): React.JSX.Element | undefined {
  const annotations = useDraftSelector((state) => state.draftAnnotations);
  const attachments = useDraftSelector((state) => state.draftAttachments);
  const { setDraftAnnotations, removeDraftAttachment } = useDraftActions();
  if (!annotations || annotations.comments.length === 0) {
    return undefined;
  }
  const remove = (number: number): void => {
    const removed = removeComments(annotations, (comment) => comment.number === number);
    setDraftAnnotations(removed.annotations);
    for (const url of removed.orphanedAttachments) {
      const index = attachments.findIndex((attachment) => attachmentUrl(attachment) === url);
      if (index !== -1) {
        removeDraftAttachment(index);
      }
    }
  };
  return (
    <ul aria-label='Comments' className='flex flex-col gap-1 px-2 pt-2' data-testid='draft-comments'>
      {annotations.comments.map((comment) => (
        <li key={comment.number} className='flex items-center gap-2'>
          <span className={badgeClass}>{comment.number}</span>
          <input
            type='text'
            value={comment.text}
            maxLength={annotationLimits.commentCharacters}
            aria-label={`Comment ${comment.number}`}
            placeholder={whereOf(comment) ? `Comment on ${whereOf(comment)}` : 'Comment'}
            className='min-w-0 flex-1 rounded-sm bg-transparent px-1 py-0.5 text-sm outline-none focus-visible:focus-outline'
            onChange={(event) => {
              setDraftAnnotations(setCommentText(annotations, comment.number, event.target.value));
            }}
          />
          <RemoveCommentButton
            number={comment.number}
            onRemove={() => {
              remove(comment.number);
            }}
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * A sent message's comments, under its pictures.
 *
 * @param props - The message's annotations.
 * @returns The list, or nothing for a message without comments.
 */
export function MessageCommentList({
  annotations,
}: {
  readonly annotations: MessageAnnotations | undefined;
}): React.JSX.Element | undefined {
  if (!annotations || annotations.comments.length === 0) {
    return undefined;
  }
  return (
    <ol aria-label='Comments' className='flex flex-col gap-1 text-sm' data-testid='message-comments'>
      {annotations.comments.map((comment) => (
        <li key={comment.number} className='flex items-start gap-2'>
          <span className={badgeClass}>{comment.number}</span>
          <span className='min-w-0 flex-1 break-words whitespace-pre-wrap'>
            {whereOf(comment) ? <span className='text-muted-foreground'>{whereOf(comment)}: </span> : null}
            {comment.text}
          </span>
        </li>
      ))}
    </ol>
  );
}
