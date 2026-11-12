import { useState } from 'react';
import type { CameraMappingId } from '@taucad/viewer/graphics/three/controls/camera-presets';
import { viewerStepCopy } from '#components/onboarding/setup-copy.js';
import { SetupPreviewFallback } from '#components/onboarding/setup-preview-fallback.js';
import { canCreateWebGl } from '#components/onboarding/webgl-support.js';
import type { PreviewFallbackReason } from '#telemetry/onboarding-telemetry.js';

/**
 * The preview area of step 3, at its final size so nothing shifts. Without WebGL it shows the animated diagram and
 * reports `no_webgl`. The live preview (T6.4: a lazily loaded viewer with a bundled sample model) takes this area's
 * place; until it lands the area shows the same diagram with no fallback reported.
 *
 * @param properties - The mapping in effect.
 * @returns The preview area.
 */
export function SetupViewerPreview({ mapping }: { readonly mapping: CameraMappingId }): React.JSX.Element {
  const [fallbackReason] = useState<PreviewFallbackReason | undefined>(() =>
    canCreateWebGl() ? undefined : 'no_webgl',
  );
  return (
    <section
      className='flex aspect-4/3 min-w-0 flex-col justify-center rounded-xl border bg-card p-4'
      aria-label={viewerStepCopy.previewLabel}
      data-testid='setup-viewer-preview'
    >
      <SetupPreviewFallback mapping={mapping} reason={fallbackReason} />
    </section>
  );
}
