import { useFrame, useThree } from '@react-three/fiber';
import { useLayoutEffect } from 'react';
import type { ReactNode } from 'react';
import { ACESFilmicToneMapping, LinearToneMapping, NeutralToneMapping, NoToneMapping } from 'three';
import { useGraphicsSelector } from '#hooks/use-graphics.js';
import { useThreeGraphicsBackend } from '#components/geometry/graphics/three/three-graphics-backend-context.js';
import { PostProcessingWebGPU } from '#components/geometry/graphics/three/post-processing-webgpu.js';
import { PostProcessingWebGL } from '#components/geometry/graphics/three/post-processing-webgl.js';
import { defaultPostProcessingSettings } from '#components/geometry/graphics/three/post-processing-settings.js';
import type { PostProcessingSettings } from '#components/geometry/graphics/three/post-processing-settings.js';

const rendererToneMappingModes = {
  aces: ACESFilmicToneMapping,
  neutral: NeutralToneMapping,
  linear: LinearToneMapping,
  none: NoToneMapping,
} as const;

/**
 * When ambient occlusion / GTAO post-processing is off, R3F still needs a terminal
 * positive-priority `useFrame` that calls `gl.render(scene, camera)` once any other
 * `priority > 0` subscriber exists (gizmo at priority **3**, `SceneOverlay` at **2**, …).
 * This component owns that priority-**1** main-scene colour pass whenever PP is disabled.
 */
function MainSceneFallback(): undefined {
  const { invalidate } = useThree();
  useLayoutEffect(() => {
    invalidate();
  }, [invalidate]);
  useFrame((state) => {
    state.gl.render(state.scene, state.camera);
  }, 1);
  return undefined;
}

/**
 * Conditionally mounts the post-processing subtree for the active graphics backend.
 *
 * **Disabling** `enablePostProcessing` **unmounts** the AO stack on **both** backends but
 * **mounts** `MainSceneFallback` priority-**1** so the main scene is still shaded
 * every frame when other positive-priority owners exist (`SceneOverlay`, gizmo).
 *
 * WebGL `N8AO` path (when mounted) is configured with `screenSpaceRadius={true}`, which means `aoRadius`
 * is measured in **CSS pixels**, converted to the drawing-buffer pixels used by N8AO. This makes ambient occlusion
 * effect scale-independent -- models of any size receive visually consistent AO
 * without needing access to `sceneRadius`. If `screenSpaceRadius` were `false`,
 * `aoRadius` would need to be proportional to the scene bounding sphere radius
 * (typically 1-2 orders of magnitude smaller than the scene scale).
 *
 * N8AO's screen-space `distanceFalloff` is a fraction of the AO radius. Its recommended
 * `0.2` retains contact shading; zero suppresses the sample contribution entirely.
 */
export function PostProcessing({ settings }: { readonly settings?: Partial<PostProcessingSettings> }): ReactNode {
  const enablePostProcessing = useGraphicsSelector((state) => state.context.enablePostProcessing);
  const backend = useThreeGraphicsBackend();
  const { gl, invalidate } = useThree();
  const toneMapping = settings?.toneMapping ?? defaultPostProcessingSettings.toneMapping;

  useLayoutEffect(() => {
    // oxlint-disable-next-line react/immutability -- This component owns the external renderer's display transform, including the direct-render fallback.
    gl.toneMapping = rendererToneMappingModes[toneMapping];
    invalidate();
  }, [gl, invalidate, toneMapping]);

  if (!enablePostProcessing) {
    return <MainSceneFallback />;
  }

  if (backend === 'webgpu') {
    return <PostProcessingWebGPU settings={settings} />;
  }

  return <PostProcessingWebGL settings={settings} />;
}
