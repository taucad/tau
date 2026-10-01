import { WebGLRenderer } from 'three';
import { InspectorBase } from 'three/webgpu';
import type { RendererInstance } from '#components/geometry/graphics/three/renderer.js';

// Three's declarations omit native WebGPU types. This debug-only boundary lists exactly
// the device operations used by the timer; no application renderer is replaced or patched.
type QuerySet = { destroy(): void };
type QueryBuffer = {
  mapAsync(mode: number): Promise<void>;
  getMappedRange(): ArrayBuffer;
  unmap(): void;
  destroy(): void;
};
type QueryTexture = { createView(): Record<string, unknown>; destroy(): void };
type QueryEncoder = {
  beginRenderPass(options: {
    colorAttachments: Array<{
      view: Record<string, unknown>;
      loadOp: 'clear';
      storeOp: 'store';
      clearValue: { r: number; g: number; b: number; a: number };
    }>;
    timestampWrites: {
      querySet: QuerySet;
      beginningOfPassWriteIndex: number;
      endOfPassWriteIndex: number;
    };
  }): { end(): void };
  resolveQuerySet(querySet: QuerySet, first: number, count: number, destination: QueryBuffer, offset: number): void;
  copyBufferToBuffer(
    source: QueryBuffer,
    sourceOffset: number,
    destination: QueryBuffer,
    destinationOffset: number,
    size: number,
  ): void;
  finish(): Record<string, unknown>;
};
type QueryDevice = {
  queue: { submit(commands: Array<Record<string, unknown>>): void };
  createTexture(options: { size: [number, number]; format: 'rgba8unorm'; usage: number }): QueryTexture;
  createQuerySet(options: { type: 'timestamp'; count: number }): QuerySet;
  createBuffer(options: { size: number; usage: number }): QueryBuffer;
  createCommandEncoder(): QueryEncoder;
};

type RenderFrameTimer = {
  method: string;
  begin(): void;
  end(): void;
  resolve(): Promise<number | undefined>;
  dispose(): void;
};
type TimerExtension = { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number };

/** Debug-only GPU timeline owner. CPU measurements run separately with queries disabled. */
export const createRenderFrameTimer = (renderer: RendererInstance, enabled: boolean): RenderFrameTimer => {
  const gpuRenderer = renderer instanceof WebGLRenderer ? undefined : renderer;
  const candidate = renderer instanceof WebGLRenderer ? renderer.getContext() : undefined;
  const context = candidate && 'createQuery' in candidate ? candidate : undefined;
  const extension = enabled
    ? ((context?.getExtension('EXT_disjoint_timer_query_webgl2') ?? undefined) as TimerExtension | undefined)
    : undefined;
  const supported = enabled && (gpuRenderer?.hasFeature('timestamp-query') ?? Boolean(extension));
  const previousInspector = gpuRenderer?.inspector;
  const previousTracking = gpuRenderer
    ? (Reflect.get(gpuRenderer.backend, 'trackTimestamp') as boolean | undefined)
    : undefined;
  const device = gpuRenderer && supported ? (Reflect.get(gpuRenderer.backend, 'device') as QueryDevice) : undefined;
  let markerTexture: QueryTexture | undefined;
  let querySet: QuerySet | undefined;
  let resolveBuffer: QueryBuffer | undefined;
  let readBuffer: QueryBuffer | undefined;
  try {
    markerTexture = device?.createTexture({ size: [1, 1], format: 'rgba8unorm', usage: 16 });
    querySet = device?.createQuerySet({ type: 'timestamp', count: 4 });
    // Standard GPUBufferUsage values: QUERY_RESOLVE + COPY_SRC; MAP_READ + COPY_DST.
    resolveBuffer = device?.createBuffer({ size: 32, usage: 516 });
    readBuffer = device?.createBuffer({ size: 32, usage: 9 });
  } catch (error) {
    markerTexture?.destroy();
    querySet?.destroy();
    resolveBuffer?.destroy();
    readBuffer?.destroy();
    throw error;
  }
  if (gpuRenderer) {
    gpuRenderer.inspector = new InspectorBase();
    Reflect.set(gpuRenderer.backend, 'trackTimestamp', false);
  }
  let query: WebGLQuery | undefined;
  let queryActive = false;
  return {
    method: enabled
      ? supported
        ? gpuRenderer
          ? 'webgpu-queue-envelope-including-markers'
          : 'webgl-time-elapsed'
        : 'unsupported'
      : 'disabled',
    begin(): void {
      if (device && querySet && markerTexture) {
        const encoder = device.createCommandEncoder();
        encoder
          .beginRenderPass({
            colorAttachments: [
              {
                view: markerTexture.createView(),
                loadOp: 'clear',
                storeOp: 'store',
                clearValue: { r: 0, g: 0, b: 0, a: 0 },
              },
            ],
            timestampWrites: {
              querySet,
              beginningOfPassWriteIndex: 0,
              endOfPassWriteIndex: 1,
            },
          })
          .end();
        device.queue.submit([encoder.finish()]);
      }
      if (context && extension) {
        context.getParameter(extension.GPU_DISJOINT_EXT);
        query = context.createQuery();
        context.beginQuery(extension.TIME_ELAPSED_EXT, query);
        queryActive = true;
      }
    },
    end(): void {
      if (device && querySet && markerTexture && resolveBuffer && readBuffer) {
        const encoder = device.createCommandEncoder();
        encoder
          .beginRenderPass({
            colorAttachments: [
              {
                view: markerTexture.createView(),
                loadOp: 'clear',
                storeOp: 'store',
                clearValue: { r: 0, g: 0, b: 0, a: 0 },
              },
            ],
            timestampWrites: {
              querySet,
              beginningOfPassWriteIndex: 2,
              endOfPassWriteIndex: 3,
            },
          })
          .end();
        encoder.resolveQuerySet(querySet, 0, 4, resolveBuffer, 0);
        encoder.copyBufferToBuffer(resolveBuffer, 0, readBuffer, 0, 32);
        device.queue.submit([encoder.finish()]);
      }
      if (context && extension && queryActive) {
        context.endQuery(extension.TIME_ELAPSED_EXT);
        queryActive = false;
      }
    },
    async resolve(): Promise<number | undefined> {
      if (readBuffer) {
        await readBuffer.mapAsync(1); // GPUMapMode.READ
        try {
          const timestamps = new BigUint64Array(readBuffer.getMappedRange());
          // Beginning of the leading marker to end of the trailing marker includes every
          // scene/post/overlay pass and copy, queue gaps and both 1px marker passes.
          // Adjacent render passes can overlap on tile GPUs: subtracting the inner
          // endpoints produced negative durations on Metal, even without a clock reset.
          // WebGPU timestamps are implementation-defined and may reset or coarsen to equal values.
          // Discard invalid samples; do not abort the frame benchmark or invent a positive duration.
          if (timestamps[3]! <= timestamps[0]!) {
            return undefined;
          }
          return Number(timestamps[3]! - timestamps[0]!) / 1e6;
        } finally {
          readBuffer.unmap();
        }
      }
      if (context && extension && query) {
        try {
          const deadline = performance.now() + 5000;
          while (!context.getQueryParameter(query, context.QUERY_RESULT_AVAILABLE)) {
            if (performance.now() >= deadline || context.isContextLost()) {
              throw new Error('WebGL timer query did not resolve');
            }
            // Query availability advances only after returning control to the browser.
            // oxlint-disable-next-line no-await-in-loop -- resolve this query before reusing its owner.
            await new Promise<void>((resolve) => {
              requestAnimationFrame(() => {
                resolve();
              });
            });
          }
          return context.getParameter(extension.GPU_DISJOINT_EXT)
            ? undefined
            : Number(context.getQueryParameter(query, context.QUERY_RESULT)) / 1e6;
        } finally {
          context.deleteQuery(query);
          query = undefined;
        }
      }
      return undefined;
    },
    dispose(): void {
      if (context && extension && queryActive) {
        context.endQuery(extension.TIME_ELAPSED_EXT);
      }
      if (query) {
        context?.deleteQuery(query);
      }
      markerTexture?.destroy();
      querySet?.destroy();
      resolveBuffer?.destroy();
      readBuffer?.destroy();
      if (gpuRenderer && previousInspector) {
        gpuRenderer.inspector = previousInspector;
        Reflect.set(gpuRenderer.backend, 'trackTimestamp', previousTracking);
      }
    },
  };
};
