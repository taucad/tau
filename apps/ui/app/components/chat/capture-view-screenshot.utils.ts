import { createActor } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import type { ScreenshotOverlay } from '@taucad/types';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import { screenshotRequestMachine } from '#machines/screenshot-request.machine.js';

type GraphicsActorRef = ActorRefFrom<typeof graphicsMachine>;

export type CaptureViewScreenshotOptions = {
  /** Per-view graphics actor that owns the THREE.js capture context. */
  readonly graphicsRef: GraphicsActorRef;
  /** Image quality used by the screenshot encoder (0–1). Mirrors the chat UI cookie. */
  readonly quality: number;
  /** Optional Set used by the host to track active actors for unmount cleanup. */
  readonly activeActors?: Set<{ stop: () => void }>;
  /**
   * Optional top-left chip overlay (file-extension icon + full file path).
   * Resolve via `resolveScreenshotOverlay(cadRef)` at the call site so the
   * graphics layer never depends on CAD state.
   */
  readonly overlay?: ScreenshotOverlay;
  /**
   * Called with the raw screenshot data URL once the screenshot succeeds.
   * Resizing for chat upload is owned by the `draftMachine` `imageProcessing`
   * chokepoint; pass this raw URL straight to `addDraftImage`/
   * `addEditDraftImage`.
   */
  readonly onImage: (dataUrl: string) => void;
  /** Called with a human-readable error if the screenshot fails or the capture pipeline reports nothing. */
  readonly onError?: (message: string) => void;
};

/**
 * Capture a single-view screenshot of the supplied per-view graphics actor.
 *
 * Owns the {@link screenshotRequestMachine} lifecycle for one request:
 * spawns an actor, sends `requestScreenshot` with the chat textarea's
 * canonical options block (16:9, 1200px, zoom 1.4, WebP), and forwards the
 * raw data URL to `onImage`. The `draftMachine` `imageProcessing` chokepoint
 * is responsible for resizing the URL before it lands in the draft surface.
 *
 * Used by:
 *  - the existing single-view branch in `chat-textarea.tsx`
 *  - the viewer-panel drag-drop handler in `chat-textarea.tsx`
 *  - the `CaptureViewControl` toolbar button in the viewer
 */
export function captureViewScreenshot(options: CaptureViewScreenshotOptions): void {
  const { graphicsRef, quality, activeActors, overlay, onImage, onError } = options;

  const actor = createActor(screenshotRequestMachine, {
    input: { graphicsRef },
  });
  activeActors?.add(actor);
  actor.start();

  const cleanup = (): void => {
    actor.stop();
    activeActors?.delete(actor);
  };

  actor.send({
    type: 'requestScreenshot',
    options: {
      output: {
        format: 'image/webp',
        quality,
      },
      aspectRatio: 16 / 9,
      maxResolution: 1200,
      zoomLevel: 1.4,
      overlay,
    },
    onSuccess(dataUrls) {
      const dataUrl = dataUrls[0];
      if (!dataUrl) {
        cleanup();
        onError?.('Failed to capture screenshot');
        return;
      }
      onImage(dataUrl);
      cleanup();
    },
    onError(error) {
      cleanup();
      onError?.(`Screenshot failed: ${error}`);
    },
  });
}
