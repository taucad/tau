import { annotationLimits } from '@taucad/chat/annotations';
import { X } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import type { MessageAnnotations } from '@taucad/chat/annotations';
import { attachmentUrl } from '@taucad/chat-ui/utils/attachment.utils';
import { partLabelOf, removeComments, setCommentText } from '#components/comments/draft-comments.js';
import { useShownComments } from '#components/comments/shown-comments.js';
import { useDraftActions, useDraftSelector } from '#hooks/use-chat.js';

const badgeClass =
  'flex size-5 shrink-0 items-center justify-center rounded-full bg-markup-ink text-xs font-semibold text-white';

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
 * A draft's comments, in its composer: each can be reworded or removed without the viewer.
 *
 * @param props - Which draft: the new message's, or the open edit's.
 * @returns The list, or nothing for a draft without comments.
 */
export function DraftCommentList({ mode }: { readonly mode: 'main' | 'edit' }): React.JSX.Element | undefined {
  const isEdit = mode === 'edit';
  const annotations = useDraftSelector((state) => (isEdit ? state.editDraftAnnotations : state.draftAnnotations));
  const attachments = useDraftSelector((state) => (isEdit ? state.editDraftAttachments : state.draftAttachments));
  const actions = useDraftActions();
  const setDraftAnnotations = isEdit ? actions.setEditDraftAnnotations : actions.setDraftAnnotations;
  const removeDraftAttachment = isEdit ? actions.removeEditDraftAttachment : actions.removeDraftAttachment;
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

/** The last row of a sent message's comments: shows its pins on the model, in place of the draft's, or hides them. */
function ShowInViewerRow({
  messageId,
  annotations,
}: {
  readonly messageId: string;
  readonly annotations: MessageAnnotations;
}): React.JSX.Element | undefined {
  const shownComments = useShownComments();
  if (!shownComments || !annotations.comments.some((comment) => comment.model !== undefined)) {
    return undefined;
  }
  const isShown = shownComments.shown?.messageId === messageId;
  return (
    <li className='flex'>
      <Button
        variant='ghost'
        size='sm'
        aria-pressed={isShown}
        onClick={(event) => {
          // The bubble under it opens the edit; this only shows the pins.
          event.stopPropagation();
          if (isShown) {
            shownComments.hide();
          } else {
            shownComments.show({ messageId, annotations });
          }
        }}
      >
        {isShown ? 'Hide from viewer' : 'Show in viewer'}
      </Button>
    </li>
  );
}

/**
 * A sent message's comments, under its pictures, with a last row that shows them on the model.
 *
 * @param props - The message and its annotations.
 * @returns The list, or nothing for a message without comments.
 */
export function MessageCommentList({
  messageId,
  annotations,
}: {
  readonly messageId: string;
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
      <ShowInViewerRow messageId={messageId} annotations={annotations} />
    </ol>
  );
}
