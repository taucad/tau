import { useRef } from 'react';
import { useSelector } from '@xstate/react';
import { ArButton } from '#components/cad/ar-button.js';
import { CadPreviewStatus, CadPreviewViewer } from '#components/cad-preview.js';
import { useCadPreview } from '#hooks/use-cad-preview.js';
import { useKeybinding } from '#hooks/use-keyboard.js';
import { PublicationFullscreenButton, usePublicationFullscreen } from '#routes/v.$id/publication-fullscreen-button.js';
import { cn } from '#utils/ui.utils.js';

type PublicationViewerPaneProps = {
  readonly className?: string;
};

/**
 * Viewer pane for the sharing route. Replaces the old `<PublicationStage>`
 * 16:9 framed card with a flush-fill viewer that owns its own bottom-right
 * overlay (AR + fullscreen) and a top-aligned status pill.
 *
 * `kernelClient` is read from `cadRef.context.kernelClient` so the AR button
 * can pipe the live kernel through to USDZ export — same pattern as
 * `chat-viewer.tsx` in the editor.
 */
export function PublicationViewerPane({ className }: PublicationViewerPaneProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, toggleFullscreen } = usePublicationFullscreen(containerRef);
  const { cadRef, geometry } = useCadPreview();
  const kernelClient = useSelector(cadRef, (snapshot) => snapshot.context.kernelClient);

  useKeybinding(
    { key: 'f' },
    () => {
      void toggleFullscreen();
    },
    { ignoreInputs: true },
  );

  return (
    <section
      ref={containerRef}
      role='region'
      aria-label='Model preview'
      data-slot='publication-viewer-pane'
      className={cn('relative size-full overflow-hidden bg-muted', className)}
    >
      <CadPreviewViewer
        className='size-full'
        enablePan
        enableZoom
        stageOptions={{ zoomLevel: 1.5 }}
        graphicsOptions={{ viewerClassName: 'bg-muted' }}
      />
      <div
        role='status'
        aria-live='polite'
        className='pointer-events-none absolute inset-x-0 top-3 flex justify-center'
      >
        <CadPreviewStatus />
      </div>
      <div className='absolute right-3 bottom-3 z-10 flex items-center gap-2'>
        <ArButton geometry={geometry} kernelClient={kernelClient} />
        <PublicationFullscreenButton isFullscreen={isFullscreen} toggleFullscreen={toggleFullscreen} />
      </div>
    </section>
  );
}
