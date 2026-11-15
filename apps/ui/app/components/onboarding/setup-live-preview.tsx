/**
 * Step 3's live preview: the viewer with a bundled sample model, loaded as its own chunk
 * when step 3 opens so steps 1 and 2 never download three.js. It starts no kernel worker and reads no project: the
 * model is a 10 × 20 × 30 mm box (`setup-preview-sample.glb`, the `geospec-c2-box` e2e fixture) inlined in this
 * chunk, so the preview works offline. The camera input and gizmo are props, so a changed answer applies without
 * reloading the scene or moving the camera.
 */
import { useCallback } from 'react';
import { base64ToUint8Array } from 'uint8array-extras';
import type { Artifact } from '@taucad/runtime';
import { ModelViewer } from '@taucad/viewer/model-viewer';
import type { CameraInput } from '@taucad/viewer/graphics/three/controls/camera-wheel-router';
import type { GizmoStyleId } from '@taucad/viewer/graphics/three/controls/viewport-gizmo-styles';
import sampleModel from '#components/onboarding/setup-preview-sample.glb?base64';

/** What the live preview shows and how it moves. */
export type SetupLivePreviewProps = Readonly<{
  cameraInput: CameraInput;
  gizmoStyle: GizmoStyleId;
  /** False when the person chose None for the gizmo. */
  isGizmoShown: boolean;
  /** Called once when the browser takes the WebGL context away, so the step shows the diagram instead. */
  onContextLost: () => void;
}>;

const sampleArtifact: Artifact = { mimeType: 'model/gltf-binary', content: base64ToUint8Array(sampleModel) };
/** One identity for the one model, so the scene is loaded once however often the props change. */
const sampleArtifactHash = 'setup-preview-sample';

/**
 * The viewer over the sample model.
 *
 * @param properties - The camera input, gizmo and context-loss callback.
 * @returns The preview.
 */
export default function SetupLivePreview({
  cameraInput,
  gizmoStyle,
  isGizmoShown,
  onContextLost,
}: SetupLivePreviewProps): React.JSX.Element {
  /* `webglcontextlost` fires on the canvas the viewer creates and does not bubble, so the container listens in the
   * capture phase. A ref callback, not an effect: it runs when the container mounts and cleans up when it goes. */
  const watchContext: React.RefCallback<HTMLDivElement> = useCallback(
    (container) => {
      if (!container) {
        return undefined;
      }
      const handleLost = (): void => {
        onContextLost();
      };
      container.addEventListener('webglcontextlost', handleLost, { capture: true, once: true });
      return () => {
        container.removeEventListener('webglcontextlost', handleLost, { capture: true });
      };
    },
    [onContextLost],
  );
  return (
    <div ref={watchContext} className='size-full overflow-hidden rounded-lg' data-testid='setup-live-preview'>
      <ModelViewer
        artifact={sampleArtifact}
        artifactHash={sampleArtifactHash}
        viewerState='ready'
        className='size-full'
        enablePan
        enableZoom
        cameraInput={cameraInput}
        gizmoStyle={gizmoStyle}
        graphicsOptions={{
          enableGizmo: isGizmoShown,
          enableGrid: true,
          enableAxes: false,
          enableLines: true,
          enableSurfaces: true,
        }}
      />
    </div>
  );
}
