import { useThree } from '@react-three/fiber';
import { useLayoutEffect } from 'react';
import type { ReactNode } from 'react';
import { ACESFilmicToneMapping, LinearToneMapping, NeutralToneMapping, NoToneMapping } from 'three';
import { useThreeGraphicsBackend } from '#graphics/three/three-graphics-backend-context.jsx';
import { PostProcessingWebGPU } from '#graphics/three/post-processing-webgpu.jsx';
import { PostProcessingWebGL } from '#graphics/three/post-processing-webgl.jsx';
import { defaultPostProcessingSettings } from '#graphics/three/post-processing-settings.js';
import type { PostProcessingSettings } from '#graphics/three/post-processing-settings.js';

const rendererToneMappingModes = {
  aces: ACESFilmicToneMapping,
  neutral: NeutralToneMapping,
  linear: LinearToneMapping,
  none: NoToneMapping,
} as const;

/** Always-on composition; explicit diagnostic settings can still isolate AO and output transforms. */
export function PostProcessing({ settings }: { readonly settings?: Partial<PostProcessingSettings> }): ReactNode {
  const backend = useThreeGraphicsBackend();
  const { gl, invalidate } = useThree();
  const toneMapping = settings?.toneMapping ?? defaultPostProcessingSettings.toneMapping;

  useLayoutEffect(() => {
    // WebGPU tone-maps the scene inside its own pass, so the renderer's output pass only
    // encodes sRGB and the overlays drawn after it stay untone-mapped, as on WebGL.
    // oxlint-disable-next-line react/immutability -- This component owns the external renderer's display transform, including the direct-render fallback.
    gl.toneMapping = backend === 'webgpu' ? NoToneMapping : rendererToneMappingModes[toneMapping];
    invalidate();
  }, [backend, gl, invalidate, toneMapping]);

  if (backend === 'webgpu') {
    return <PostProcessingWebGPU settings={settings} aoAllowed toneMapping={rendererToneMappingModes[toneMapping]} />;
  }

  return <PostProcessingWebGL settings={settings} />;
}
