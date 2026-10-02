import { useCallback, useEffect, useRef } from 'react';
import { Camera, Check } from 'lucide-react';
import { Button } from '#components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { DropdownMenuItem } from '#components/ui/dropdown-menu.js';
import { useGraphics } from '#hooks/use-graphics.js';
import { useCad } from '#hooks/use-cad.js';
import { useChatActions } from '#hooks/use-chat.js';
import { useImageQuality } from '#hooks/use-image-quality.js';
import { useTickAnimation } from '#hooks/use-tick-animation.js';
import { toast } from '#components/ui/sonner.js';
import { captureViewScreenshot } from '#components/chat/capture-view-screenshot.utils.js';
import { resolveScreenshotOverlay } from '#machines/resolve-screenshot-overlay.js';

/**
 * Capture-view control button for the viewer toolbar.
 *
 * Captures the current pane's view (16:9, 1200px, zoom 1.4, WebP) and adds
 * the resized data URL to the active chat's draft images via
 * {@link useChatActions}.
 *
 * Mirrors {@link ResetCameraControl} for visual + interaction parity and
 * relies on the surrounding `<GraphicsProvider>` (per-view) and
 * `<ActiveChatProvider>` (project route) for context resolution.
 */
export function CaptureViewControl(): React.JSX.Element {
  const graphicsRef = useGraphics();
  const cadRef = useCad();
  const { addDraftImage } = useChatActions();
  const { quality } = useImageQuality();
  const { ticked, trigger } = useTickAnimation();

  // Track active screenshot actors so we can stop them on unmount even if a
  // capture is still in flight (mirrors the pattern in chat-textarea.tsx).
  const activeActorsRef = useRef(new Set<{ stop: () => void }>());
  useEffect(() => {
    const actors = activeActorsRef;
    return () => {
      for (const actor of actors.current) {
        actor.stop();
      }
      actors.current.clear();
    };
  }, []);

  const qualityRef = useRef(quality);
  qualityRef.current = quality;
  const addDraftImageRef = useRef(addDraftImage);
  addDraftImageRef.current = addDraftImage;
  const cadRefRef = useRef(cadRef);
  cadRefRef.current = cadRef;

  const handleCapture = useCallback((): void => {
    captureViewScreenshot({
      graphicsRef,
      quality: qualityRef.current,
      activeActors: activeActorsRef.current,
      overlay: resolveScreenshotOverlay(cadRefRef.current),
      onImage: (dataUrl) => {
        addDraftImageRef.current(dataUrl);
        trigger();
      },
      onError: (message) => {
        toast.error(message);
      },
    });
  }, [graphicsRef, trigger]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant='overlay' size='icon' onClick={handleCapture}>
          {ticked ? <Check className='size-4 text-success' /> : <Camera className='size-4' />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{ticked ? 'Added to chat' : 'Capture view to chat'}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Overflow (dropdown) variant of {@link CaptureViewControl}.
 * Rendered inside the ViewerSettings dropdown when the toolbar is too narrow.
 */
export function CaptureViewOverflowControl(): React.JSX.Element {
  const graphicsRef = useGraphics();
  const cadRef = useCad();
  const { addDraftImage } = useChatActions();
  const { quality } = useImageQuality();

  const activeActorsRef = useRef(new Set<{ stop: () => void }>());
  useEffect(() => {
    const actors = activeActorsRef;
    return () => {
      for (const actor of actors.current) {
        actor.stop();
      }
      actors.current.clear();
    };
  }, []);

  const qualityRef = useRef(quality);
  qualityRef.current = quality;
  const addDraftImageRef = useRef(addDraftImage);
  addDraftImageRef.current = addDraftImage;
  const cadRefRef = useRef(cadRef);
  cadRefRef.current = cadRef;

  const handleCapture = useCallback((): void => {
    captureViewScreenshot({
      graphicsRef,
      quality: qualityRef.current,
      activeActors: activeActorsRef.current,
      overlay: resolveScreenshotOverlay(cadRefRef.current),
      onImage: (dataUrl) => {
        addDraftImageRef.current(dataUrl);
        toast.success('Added screenshot to chat');
      },
      onError: (message) => {
        toast.error(message);
      },
    });
  }, [graphicsRef]);

  return (
    <DropdownMenuItem onSelect={handleCapture}>
      <Camera />
      Capture view to chat
    </DropdownMenuItem>
  );
}
