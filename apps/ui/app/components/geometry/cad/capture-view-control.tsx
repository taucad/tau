import { useCallback } from 'react';
import { randomUuid } from '@taucad/utils/id';
import type { Rendering } from '@taucad/runtime';
import { useGraphics } from '@taucad/viewer/hooks/use-graphics';
import { CaptureViewControl as SharedCaptureViewControl } from '@taucad/workbench-panes/shell/capture-view-control';
import { useCad } from '#hooks/use-cad.js';
import { useProject } from '#hooks/use-project.js';
import { useChatActions } from '#hooks/use-chat.js';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import { toast } from '#components/ui/sonner.js';
import { useHeadlessImageService } from '#providers/headless-image-provider.js';
import { captureCadImages, captureFilesToDataUrls, omittedSectionCutsNotice } from '#services/headless-capture.js';
import { recordHeadlessImageTiming } from '#services/headless-image-debug.js';
import { attachmentModelForExecution } from '#utils/chat.utils.js';

const useCaptureCurrentViewToChat = (captureRendering?: () => Promise<Rendering>): (() => Promise<boolean>) => {
  const graphicsRef = useGraphics();
  const cadRef = useCad();
  const { projectRef } = useProject();
  const { addDraftAttachment } = useChatActions();
  const {
    model: { model: selectedModel },
    execution: { execution },
  } = useChatComposer();
  const imageService = useHeadlessImageService();

  return useCallback(async () => {
    const clickStartedAt = performance.now();
    if (!cadRef) {
      toast.error('No CAD view available for image capture');
      return false;
    }
    const { entryPath } = cadRef.getSnapshot().context;
    const claimId = entryPath ? randomUuid() : undefined;
    if (entryPath && claimId) {
      projectRef.send({ type: 'claimGeometryUnit', claimId, entryPath });
    }
    try {
      const { files, omittedSectionCutIds } = await captureCadImages({
        cadRef,
        graphicsRef,
        imageService,
        recipe: { purpose: 'chat', mode: 'current' },
        captureRendering,
      });
      const publishStartedAt = performance.now();
      addDraftAttachment(captureFilesToDataUrls(files)[0]!, {
        preserveOriginal: true,
        model: attachmentModelForExecution(execution, selectedModel),
      });
      recordHeadlessImageTiming('capture.publish-draft', publishStartedAt, { count: 1 });
      if (omittedSectionCutIds.length > 0) {
        toast.warning(omittedSectionCutsNotice);
      }
      recordHeadlessImageTiming('capture.click-to-draft', clickStartedAt);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to capture view');
      return false;
    } finally {
      if (claimId) {
        projectRef.send({ type: 'releaseGeometryUnit', claimId });
      }
    }
  }, [addDraftAttachment, cadRef, captureRendering, execution, graphicsRef, imageService, projectRef, selectedModel]);
};

/**
 * Capture-view control button for the viewer toolbar: the shared `CaptureViewControl` that headlessly renders the
 * current pane's settled geometry at its exact camera angles and adds the annotated image to the active chat draft.
 * It relies on the surrounding `<GraphicsProvider>` (per-view) and `<ActiveChatProvider>` (project route).
 */
export function CaptureViewControl({
  captureRendering,
}: {
  readonly captureRendering?: () => Promise<Rendering>;
}): React.JSX.Element {
  const capture = useCaptureCurrentViewToChat(captureRendering);
  return <SharedCaptureViewControl onCapture={capture} label='Capture view to chat' doneLabel='Added to chat' />;
}
