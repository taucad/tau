import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { gpuAdapterIdentity, isSoftwareGpuAdapter } from '@taucad/viewer/graphics/graphics-backend';
import type { GpuAdapterIdentity } from '@taucad/viewer/graphics/graphics-backend';
import type { imageRuntime } from '#runtime/image-runtime.definition.js';
import type { HeadlessImageBackend } from '#services/headless-image.service.js';

type GpuAdapterProbe = { requestAdapter(): Promise<unknown> };

const automaticAdapterAvailable = async (): Promise<boolean> => {
  const gpu = (globalThis.navigator as (Navigator & { gpu?: GpuAdapterProbe }) | undefined)?.gpu;
  if (!gpu) {
    return false;
  }
  try {
    const adapter = ((await gpu.requestAdapter()) ?? undefined) as GpuAdapterIdentity | undefined;
    // An adapter that reports no identity cannot be shown to be hardware.
    return adapter !== undefined && !isSoftwareGpuAdapter(adapter) && gpuAdapterIdentity(adapter).length > 0;
  } catch {
    return false;
  }
};

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
  isAutomaticGpuAvailable: automaticAdapterAvailable,
  renderSvg: async (content, format, options) => {
    const { renderSvgPng, renderSvgWebp } = await import('@taucad/image/svg');
    return format === 'webp' ? renderSvgWebp(content, options) : renderSvgPng(content, options);
  },
  async createImageClient() {
    const [{ createRuntimeClient }, { webWorkerTransport }, { observeRuntimeClient }] = await Promise.all([
      import('@taucad/runtime/client'),
      import('@taucad/runtime/transport/web'),
      import('#telemetry/runtime-telemetry.js'),
    ]);
    const client = createRuntimeClient<typeof imageRuntime>({
      transport: webWorkerTransport({
        createWorker: () =>
          new Worker(new URL('../runtime/image-runtime.worker.ts', import.meta.url), {
            name: 'tau-headless-image-transcoder-worker',
            type: 'module',
          }),
        fileSystem: fromMemoryFs(),
      }),
    });
    /* Runtime observability (FR-14): capture attempts, attached before `connect()`. */
    const stopObserving = observeRuntimeClient(client, 'capture');
    const adapter: Awaited<ReturnType<HeadlessImageBackend['createImageClient']>> = {
      connect: async () => client.connect(),
      terminate: () => {
        client.terminate();
        stopObserving();
      },
      on: (event, handler) => client.on(event, handler),
      transcode: async (input) => {
        if (input.from !== 'glb') {
          throw new Error(`Image worker cannot transcode ${input.from}; SVG uses the direct renderer`);
        }
        return client.transcode(input);
      },
    };
    return adapter;
  },
};
