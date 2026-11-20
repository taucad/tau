import { Suspense, useCallback, useState } from 'react';
import type { ComponentType } from 'react';
import type { CameraPresetId } from '@taucad/viewer/graphics/three/controls/camera-presets';
import { Loader } from '@taucad/ui/components/loader';
import { viewerStepCopy } from '#components/onboarding/setup-copy.js';
import { SetupPreviewFallback } from '#components/onboarding/setup-preview-fallback.js';
import type { SetupLivePreviewProps } from '#components/onboarding/setup-live-preview.js';
import { canCreateWebGl } from '#components/onboarding/webgl-support.js';
import type { PreviewFallbackReason } from '#telemetry/onboarding-telemetry.js';
import { lazyCode } from '@taucad/ui-core/lib/lazy-code';

/** What the preview area shows and how its viewer moves. */
export type SetupViewerPreviewProps = Omit<SetupLivePreviewProps, 'onContextLost'> &
  Readonly<{
    /** The mapping in effect, for the diagram the area falls back to. */
    mapping: CameraPresetId;
  }>;

/** What the lazily loaded part receives: the preview's props, and the diagram's when its chunk failed. */
type LoadedPreviewProps = SetupLivePreviewProps & Readonly<{ mapping: CameraPresetId; onRetry: () => void }>;

/**
 * The diagram in place of a preview whose chunk did not load. It offers no Try again: this page keeps a module that
 * failed to load failed, so importing it afresh would fail the same way (FP9); the next page load tries again.
 *
 * @param properties - The mapping.
 * @returns The diagram.
 */
function ChunkFailedPreview({ mapping }: LoadedPreviewProps): React.JSX.Element {
  return <SetupPreviewFallback mapping={mapping} reason='chunk_failed' />;
}

/**
 * Load the live preview's chunk, as optional code: a failed load degrades to the diagram rather than throwing, so the
 * area needs no error boundary. A retry after a lost WebGL context makes a new lazy component over the same module.
 *
 * @returns The component to render.
 */
const createLivePreview = (): ComponentType<LoadedPreviewProps> =>
  lazyCode<ComponentType<LoadedPreviewProps>>(async () => import('#components/onboarding/setup-live-preview.js'), {
    fallback: ChunkFailedPreview,
  });

/**
 * The placeholder, at the preview's final size, while the chunk loads.
 *
 * @returns The placeholder.
 */
function PreviewPlaceholder(): React.JSX.Element {
  return (
    <div
      role='status'
      aria-label={viewerStepCopy.previewLoading}
      className='flex size-full items-center justify-center'
      data-testid='setup-preview-placeholder'
    >
      <Loader className='size-8' />
    </div>
  );
}

/**
 * The preview area of step 3, at its final size so nothing shifts. With WebGL it loads the live preview as its
 * own chunk, showing a placeholder until it renders. Without WebGL, when the context is lost, or when the chunk does
 * not load, it shows the animated diagram for the current choice and reports the reason. Leaving step 3
 * unmounts the viewer, which releases its WebGL context.
 *
 * @param properties - The mapping, camera input and gizmo in effect.
 * @returns The preview area.
 */
export function SetupViewerPreview({
  mapping,
  cameraInput,
  gizmoStyle,
  isGizmoShown,
}: SetupViewerPreviewProps): React.JSX.Element {
  const [fallbackReason, setFallbackReason] = useState<PreviewFallbackReason | undefined>(() =>
    canCreateWebGl() ? undefined : 'no_webgl',
  );
  const [LivePreview, setLivePreview] = useState(createLivePreview);
  const handleContextLost = useCallback(() => {
    setFallbackReason('context_lost');
  }, []);
  const retry = useCallback(() => {
    setFallbackReason(canCreateWebGl() ? undefined : 'no_webgl');
    setLivePreview(createLivePreview);
  }, []);
  return (
    <section
      className='flex aspect-4/3 min-w-0 flex-col justify-center rounded-xl border bg-card p-4'
      aria-label={viewerStepCopy.previewLabel}
      data-testid='setup-viewer-preview'
    >
      {fallbackReason === undefined ? (
        <Suspense fallback={<PreviewPlaceholder />}>
          <LivePreview
            mapping={mapping}
            cameraInput={cameraInput}
            gizmoStyle={gizmoStyle}
            isGizmoShown={isGizmoShown}
            onContextLost={handleContextLost}
            onRetry={retry}
          />
        </Suspense>
      ) : (
        <SetupPreviewFallback
          mapping={mapping}
          reason={fallbackReason}
          onRetry={fallbackReason === 'no_webgl' ? undefined : retry}
        />
      )}
    </section>
  );
}
