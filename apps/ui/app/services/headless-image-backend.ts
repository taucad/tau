import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { renderSvgPng, renderSvgWebp } from '@taucad/image/svg';
import type { imageRuntime } from '#runtime/image-runtime.definition.js';
import type { HeadlessImageBackend } from '#services/headless-image.service.js';

type GpuAdapterProbe = { requestAdapter(): Promise<unknown> };

/** WebGL capability says nothing about the WebGPU adapter used by headless GLB capture. */
const hasGpuAdapter = async (): Promise<boolean> => {
  const gpu = (globalThis.navigator as (Navigator & { gpu?: GpuAdapterProbe }) | undefined)?.gpu;
  if (!gpu) {
    return false;
  }
  try {
    return (await gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
};

/** Browser-only implementations; replaced at module resolution in desktop builds. */
export const headlessImageBackend: HeadlessImageBackend = {
  isGpuAvailable: hasGpuAdapter,
  renderSvg: async (content, format, options) =>
    format === 'webp' ? renderSvgWebp(content, options) : renderSvgPng(content, options),
  async createImageClient() {
    const [{ createRuntimeClient }, { webWorkerTransport }] = await Promise.all([
      import('@taucad/runtime/client'),
      import('@taucad/runtime/transport/web'),
    ]);
    return createRuntimeClient<typeof imageRuntime>({
      transport: webWorkerTransport({
        createWorker: () =>
          new Worker(new URL('../runtime/image-runtime.worker.ts', import.meta.url), {
            name: 'tau-headless-image-transcoder-worker',
            type: 'module',
          }),
        fileSystem: fromMemoryFs(),
      }),
    });
  },
};
