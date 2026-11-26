import { Suspense, useCallback, useState } from 'react';
import { useSelector } from '@xstate/react';
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
  const count = useSelector(draftRef, (state) => state?.context.draftAttachments.length ?? 0);
  // Where the copy will land: the end of the draft's attachments when it was asked for.
  const [index, setIndex] = useState<number>();
  const close = useCallback((): void => {
    setIndex(undefined);
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
        draftRef.send({
          type: 'addDraftAttachment',
          dataUrl,
          model: attachmentModelForExecution(execution, selectedModel),
        });
        setIndex(count);
      } catch {
        toast.error("Couldn't copy the image into your message");
      }
    },
    [count, draftRef, execution, selectedModel],
  );
  const isOffered = isOn && draftRef !== undefined && directories !== undefined;
  return {
    markUp: isOffered ? markUp : undefined,
    dialog:
      index === undefined || directories === undefined ? null : (
        <Suspense fallback={null}>
          <DraftImageMarkup
            mode='main'
            attachmentIndex={index}
            directory={[directories.composer, directories.transcript]}
            finishLabel='Add to chat'
            onClose={close}
          />
        </Suspense>
      ),
  };
}
