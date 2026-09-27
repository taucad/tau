import { useCallback } from 'react';
import { Camera, Check } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { useGraphics } from '#hooks/use-graphics.js';
import { useCad } from '#hooks/use-cad.js';
import { useChatActions } from '#hooks/use-chat.js';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import { useTickAnimation } from '#hooks/use-tick-animation.js';
import { toast } from '#components/ui/sonner.js';
import { useHeadlessImageService } from '#providers/headless-image-provider.js';
import { captureCadImages, captureFilesToDataUrls } from '#services/headless-capture.js';
import { recordHeadlessImageTiming } from '#services/headless-image-debug.js';
import { attachmentModelForExecution } from '#utils/chat.utils.js';

const useCaptureCurrentViewToChat = (onSuccess?: () => void): (() => Promise<void>) => {
  const graphicsRef = useGraphics();
  const cadRef = useCad();
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
      return;
    }
    try {
      const files = await captureCadImages({
        cadRef,
        graphicsRef,
        imageService,
        recipe: { purpose: 'chat', mode: 'current' },
      });
      const publishStartedAt = performance.now();
      addDraftAttachment(captureFilesToDataUrls(files)[0]!, {
        preserveOriginal: true,
        model: attachmentModelForExecution(execution, selectedModel),
      });
      recordHeadlessImageTiming('capture.publish-draft', publishStartedAt, { count: 1 });
      onSuccess?.();
      recordHeadlessImageTiming('capture.click-to-draft', clickStartedAt);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to capture view');
    }
  }, [addDraftAttachment, cadRef, execution, graphicsRef, imageService, onSuccess, selectedModel]);
};

/**
 * Capture-view control button for the viewer toolbar.
 *
 * Headlessly renders the current pane's settled geometry at its exact camera
 * angles and adds the annotated image to the active chat draft.
 *
 * Mirrors {@link FitViewControl} for visual + interaction parity and
 * relies on the surrounding `<GraphicsProvider>` (per-view) and
 * `<ActiveChatProvider>` (project route) for context resolution.
 */
export function CaptureViewControl(): React.JSX.Element {
  const { ticked, trigger } = useTickAnimation();
  const handleCapture = useCaptureCurrentViewToChat(trigger);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant='ghost' size='icon-sm' aria-label='Capture view to chat' onClick={handleCapture}>
          {ticked ? <Check className='size-4 text-success' /> : <Camera className='size-4' />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{ticked ? 'Added to chat' : 'Capture view to chat'}</TooltipContent>
    </Tooltip>
  );
}
