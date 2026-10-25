import type { WebGPURenderer } from 'three/webgpu';
import { isSoftwareGpuAdapter } from '#graphics/graphics-backend.js';
import type { GpuAdapterIdentity } from '#graphics/graphics-backend.js';

/** The part of a WebGL 2 context that names its rasterizer. */
type RendererIdentityContext = Readonly<{
  /** The extension, or nothing (`null` from the browser) when it does not name the rasterizer. */
  getExtension: (name: 'WEBGL_debug_renderer_info') =>
    | Readonly<{
        UNMASKED_VENDOR_WEBGL: number;
        UNMASKED_RENDERER_WEBGL: number;
      }>
    | undefined;
  getParameter: (parameter: number) => unknown;
}>;

/**
 * What the node renderer's WebGL 2 context says about its rasterizer, or nothing when the browser does not tell.
 *
 * @param context - The WebGL 2 context of Three's WebGL 2 backend.
 * @returns The vendor and renderer strings as an adapter identity, or `undefined`.
 */
const webGlRendererIdentity = (context: RendererIdentityContext): GpuAdapterIdentity['info'] => {
  const debugInfo = context.getExtension('WEBGL_debug_renderer_info');
  if (!debugInfo) {
    return undefined;
  }
  const vendor = context.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
  const renderer = context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
  return {
    vendor: typeof vendor === 'string' ? vendor : undefined,
    description: typeof renderer === 'string' ? renderer : undefined,
  };
};

/**
 * Whether the node renderer rasterizes on the CPU: a WebGPU device on a software adapter (the browser's fallback
 * adapter, SwiftShader, llvmpipe), or a WebGL 2 context that names one (Chromium's SwiftShader WebGL, Mesa llvmpipe).
 * Three requests the WebGPU adapter itself and keeps only the device, whose `adapterInfo` describes it; its WebGL 2
 * backend keeps the context, whose debug renderer info names the rasterizer.
 *
 * @param renderer - The initialized node renderer.
 * @returns True on a software rasterizer; false on hardware or when nothing is reported.
 * @internal
 */
export const rendererUsesSoftwareRasterizer = (renderer: unknown): boolean => {
  // Three owns `backend.device` and `backend.gl`; the published Backend declaration omits both. R3F types its `gl` as a
  // WebGL renderer whatever it created, so any renderer is accepted and only a WebGPU renderer's backend is read.
  const backend = (
    typeof renderer === 'object' && renderer !== null && 'backend' in renderer ? renderer.backend : undefined
  ) as
    | (WebGPURenderer['backend'] & {
        readonly device?: Readonly<{ adapterInfo?: GpuAdapterIdentity['info'] }>;
        readonly gl?: RendererIdentityContext;
      })
    | undefined;
  const info = backend?.device?.adapterInfo ?? (backend?.gl ? webGlRendererIdentity(backend.gl) : undefined);
  return info !== undefined && isSoftwareGpuAdapter({ info });
};
