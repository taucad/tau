import { useMemo } from 'react';
import type { AttachmentDirectories } from '@taucad/chat-ui/hooks/use-attachment-source';
import { attachmentUrl } from '@taucad/chat-ui/utils/attachment.utils';
import { ImageMarkupDialog } from '#components/comments/image-markup-dialog.js';
import type { MarkupRecord } from '#components/comments/image-markup-dialog.js';
import { useDraftActions, useDraftSelector } from '#hooks/use-chat.js';

/**
 * Mark up of a composer image: the dialog over the draft's record.
 *
 * @param props - Which draft, which of its attachments, and how to close.
 * @returns The dialog.
 */
export function DraftImageMarkup({
  mode,
  attachmentIndex,
  directory,
  finishLabel,
  onClose,
}: Readonly<{
  /** The new message's draft, or the open edit's. */
  mode: 'main' | 'edit';
  /** The image's index among the draft's attachments, or `undefined` while closed. */
  attachmentIndex: number | undefined;
  directory: AttachmentDirectories;
  /** The finishing button's words; "Done" unless the image was just copied in. */
  finishLabel?: string;
  onClose: () => void;
}>): React.JSX.Element {
  const isEdit = mode === 'edit';
  const annotations = useDraftSelector((state) => (isEdit ? state.editDraftAnnotations : state.draftAnnotations));
  const attachments = useDraftSelector((state) => (isEdit ? state.editDraftAttachments : state.draftAttachments));
  const actions = useDraftActions();
  const setAnnotations = isEdit ? actions.setEditDraftAnnotations : actions.setDraftAnnotations;
  const removeAttachment = isEdit ? actions.removeEditDraftAttachment : actions.removeDraftAttachment;
  const attachment = attachmentIndex === undefined ? undefined : attachments[attachmentIndex];
  const record = useMemo<MarkupRecord>(
    () => ({
      annotations,
      setAnnotations,
      dropAttachments(urls) {
        // The highest index first, so removing one moves no other.
        const indices = urls
          .map((url) => attachments.findIndex((candidate) => attachmentUrl(candidate) === url))
          .filter((index) => index !== -1)
          .toSorted((a, b) => b - a);
        for (const index of indices) {
          removeAttachment(index);
        }
      },
    }),
    [annotations, attachments, removeAttachment, setAnnotations],
  );
  return (
    <ImageMarkupDialog
      image={attachment === undefined ? undefined : { url: attachmentUrl(attachment), mediaType: attachment.mediaType }}
      directory={directory}
      record={record}
      {...(finishLabel === undefined ? {} : { finishLabel })}
      onClose={onClose}
    />
  );
}
