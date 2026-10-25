import { useThree } from '@react-three/fiber';
import { useLayoutEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { WebGPURenderer } from 'three/webgpu';
import { ACESFilmicToneMapping, LinearToneMapping, NeutralToneMapping, NoToneMapping } from 'three';
import { isSoftwareGpuAdapter } from '#graphics/graphics-backend.js';
import type { GpuAdapterIdentity } from '#graphics/graphics-backend.js';
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

/**
 * Whether a WebGPU renderer's device runs on a software adapter (the browser's fallback adapter, SwiftShader,
 * llvmpipe). Three requests the adapter itself and keeps only the device, whose `adapterInfo` describes it.
 *
 * @param renderer - The initialized node renderer.
 * @returns True on a software adapter; false on hardware or when the device reports nothing.
 */
const rendererUsesSoftwareGpuAdapter = (renderer: WebGPURenderer): boolean => {
  // Three owns `backend.device`; the published Backend declaration omits it, and the WebGL 2 backend has none.
  const backend = renderer.backend as
    | (WebGPURenderer['backend'] & { readonly device?: Readonly<{ adapterInfo?: GpuAdapterIdentity['info'] }> })
    | undefined;
  const info = backend?.device?.adapterInfo;
  return info !== undefined && isSoftwareGpuAdapter({ info });
};

/**
 * Always-on composition; explicit diagnostic settings can still isolate AO and output transforms. A software WebGPU
 * adapter rasterizes every pass on the CPU, where the AO graph (normal attachment, GTAO, denoise) and the speculative
 * alternate-camera render saturate the GPU process and starve the page's compositor. There the composition stays
 * beauty-only: the tone-mapped scene pass and its anti-aliased output, which also own the canvas's depth.
 */
export function PostProcessing({ settings }: { readonly settings?: Partial<PostProcessingSettings> }): ReactNode {
  const backend = useThreeGraphicsBackend();
  const { gl, invalidate } = useThree();
  const toneMapping = settings?.toneMapping ?? defaultPostProcessingSettings.toneMapping;
  const softwareAdapter = useMemo(
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- R3F types `gl` as the classic renderer; the WebGPU backend context guarantees the node renderer.
    () => backend === 'webgpu' && rendererUsesSoftwareGpuAdapter(gl as unknown as WebGPURenderer),
    [backend, gl],
  );

  useLayoutEffect(() => {
    // WebGPU tone-maps the scene inside its own pass, so the renderer's output pass only
    // encodes sRGB and the overlays drawn after it stay untone-mapped, as on WebGL.
    // oxlint-disable-next-line react/immutability -- This component owns the external renderer's display transform, including the direct-render fallback.
    gl.toneMapping = backend === 'webgpu' ? NoToneMapping : rendererToneMappingModes[toneMapping];
    invalidate();
  }, [backend, gl, invalidate, toneMapping]);

  if (backend === 'webgpu') {
    return (
      <PostProcessingWebGPU
        settings={settings}
        aoAllowed={!softwareAdapter}
        speculativePreparation={!softwareAdapter}
        toneMapping={rendererToneMappingModes[toneMapping]}
      />
    );
  }

  return <PostProcessingWebGL settings={settings} />;
}
