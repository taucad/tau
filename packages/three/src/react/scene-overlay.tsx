import type { ReactNode } from 'react';
import { useMemo } from 'react';
import * as THREE from 'three';
import { createPortal, useFrame } from '@react-three/fiber';

type SceneOverlayProperties = {
  readonly children: ReactNode;
};

/**
 * Renders children in a separate THREE.Scene that composites on top of the
 * post-processed output.  This keeps overlay elements (Grid, AxesHelper)
 * outside the EffectComposer pipeline so they are not affected by N8AO
 * ambient-occlusion darkening.
 *
 * Runs at `renderPriority = 2` (after EffectComposer at priority 1).
 *
 * ### Automatic adaptation
 *
 * The component auto-detects whether an EffectComposer (or any other
 * positive-priority render owner) is active by reading R3F's internal
 * subscriber count (`state.internal.priority`).
 *
 * - **Post-processing active** (`priority > 1`): the EffectComposer already
 *   wrote colour to the screen but clobbered the depth buffer with its
 *   fullscreen-quad output.  We restore scene depth via a depth-only
 *   re-render (`colorMask(false …)`) before compositing the overlay.
 *
 * - **No post-processing** (`priority === 1`, i.e. we are the sole render
 *   owner): we render the full scene ourselves (colour + depth), then
 *   composite the overlay on top.  This means the EffectComposer can be
 *   freely added or removed without any prop changes to SceneOverlay.
 */
export function SceneOverlay({ children }: SceneOverlayProperties): React.JSX.Element {
  const overlayScene = useMemo(() => new THREE.Scene(), []);

  // Lightweight material for the depth-only pass. MeshBasicMaterial has built-in
  // logarithmic depth support and skips all PBR/matcap/environment shader work.
  const depthOnlyMaterial = useMemo(() => {
    const mat = new THREE.MeshBasicMaterial();
    mat.colorWrite = false;
    return mat;
  }, []);

  useFrame((state) => {
    // Skip entirely when the overlay scene has no children to render
    if (overlayScene.children.length === 0) {
      return;
    }

    const { gl, scene, camera } = state;
    const previousAutoClear = gl.autoClear;
    gl.autoClear = false;

    if (state.internal.priority > 1) {
      // Another render-owner (EffectComposer) already wrote colour.
      // Restore scene depth only with a lightweight override material,
      // preserving the post-processed image while avoiding full material shaders.
      const previousOverrideMaterial = scene.overrideMaterial;
      scene.overrideMaterial = depthOnlyMaterial;
      gl.render(scene, camera);
      scene.overrideMaterial = previousOverrideMaterial;
    } else {
      // We are the sole render-owner. Render the full scene ourselves.
      gl.autoClear = true;
      gl.render(scene, camera);
      gl.autoClear = false;
    }

    // Overlay pass: grid / axes depth-test correctly against the model.
    gl.render(overlayScene, camera);

    gl.autoClear = previousAutoClear;
  }, 2); // Priority 2: runs after EffectComposer (priority 1)

  return <>{createPortal(children, overlayScene)}</>;
}
