import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { readFileAsDataUrl } from '@taucad/chat-ui/utils/attachment-intake';
import { toast } from '@taucad/ui/components/sonner';
import { lazyCode } from '@taucad/ui-core/lib/lazy-code';
import { useChatAttachmentDirectories } from '#components/chat/attachment-preview.js';
import { useFeatureState } from '#flags/use-feature.js';
import { useOptionalChatComposer } from '#hooks/active-chat-provider.js';
import { attachmentModelForExecution } from '#utils/chat.utils.js';

/* Loaded when mark up first opens: most images are never marked up. */
const DraftImageMarkup = lazyCode(async () => {
  const module = await import('#components/comments/draft-image-markup.js');
  return { default: module.DraftImageMarkup };
});

/** An image shown somewhere other than the composer, by a URL the page can read now. */
export type MarkUpSource = Readonly<{ src: string; mediaType: string }>;

/**
 * Mark up of an image from the transcript or a file pane (charter I1): it is copied into the new message's draft
 * first, then marked up there, and finishing says "Add to chat".
 *
 * @returns `markUp`, or `undefined` while mark up is not offered here, and the dialog to render beside the host.
 */
export function useMarkUpCopy(): Readonly<{
  markUp: ((source: MarkUpSource) => Promise<void>) | undefined;
  dialog: React.ReactNode;
}> {
  const isOn = useFeatureState('commentPins') === 'on';
  const composer = useOptionalChatComposer();
  const draftRef = composer?.draftActorRef;
  const directories = useChatAttachmentDirectories();
  // The draft the composer holds now: a copy that finishes after the composer moved to another chat is dropped.
  const currentDraft = useRef(draftRef);
  useEffect(() => {
    currentDraft.current = draftRef;
  }, [draftRef]);
  // Where the copy lands, in the draft it was added to.
  const [opened, setOpened] = useState<{ index: number; draft: typeof draftRef }>();
  const close = useCallback((): void => {
    setOpened(undefined);
  }, []);
  const execution = composer?.execution.execution;
  const selectedModel = composer?.model.model;
  const markUp = useCallback(
    async ({ src, mediaType }: MarkUpSource): Promise<void> => {
      if (!draftRef || !execution || !selectedModel) {
        return;
      }
      try {
        const response = await fetch(src);
        const blob = await response.blob();
        const dataUrl = await readFileAsDataUrl(blob.type === '' ? new Blob([blob], { type: mediaType }) : blob);
        if (currentDraft.current !== draftRef) {
          toast.error('The image was not copied: the chat changed before it was ready. Mark it up again here.');
          return;
        }
        // It lands after the draft's attachments and every image still queued for it.
        const { draftAttachments, attachmentQueue } = draftRef.getSnapshot().context;
        const index = draftAttachments.length + attachmentQueue.filter((entry) => entry.target === 'main').length;
        draftRef.send({
          type: 'addDraftAttachment',
          dataUrl,
          model: attachmentModelForExecution(execution, selectedModel),
        });
        setOpened({ index, draft: draftRef });
      } catch {
        toast.error("Couldn't copy the image into your message");
      }
    },
    [draftRef, execution, selectedModel],
  );
  const isOffered = isOn && draftRef !== undefined && directories !== undefined;
  return {
    markUp: isOffered ? markUp : undefined,
    dialog:
      opened?.draft !== draftRef || directories === undefined ? null : (
        <Suspense fallback={null}>
          <DraftImageMarkup
            mode='main'
            attachmentIndex={opened.index}
            directory={[directories.composer, directories.transcript]}
            finishLabel='Add to chat'
            onClose={close}
          />
        </Suspense>
      ),
  };
}
