import { setup, types } from 'xstate';

import { eventSchemas } from '#machines/machine-schemas.js';

/**
 * Conservative limit that leaves headroom for gizmo renderers, screenshot
 * off-screen canvases, and other incidental WebGL contexts.  Browsers
 * typically allow 8-16 active contexts per origin; the oldest context is
 * silently lost when the limit is exceeded.
 */
const maxWebglContexts = 8;

/**
 * Phones and low-memory devices run out of memory long before the browser's context cap: each viewer holds
 * its drawing buffers, render targets and geometry (about 230 MiB with AO), so two is the budget there.
 */
const constrainedWebglContexts = 2;

/** Devices at or below this `navigator.deviceMemory` (GB, rounded down by the browser) are constrained. */
const constrainedDeviceMemoryGigabytes = 4;

/**
 * What a viewer host knows about the device when it sizes the context budget.
 * @public
 */
export type WebglContextDevice = Readonly<{
  /** The primary pointer is coarse, as on phones and tablets. */
  coarsePointer: boolean;
  /** `navigator.deviceMemory`, where the browser reports it. */
  deviceMemoryGigabytes?: number;
}>;

/**
 * The number of viewer WebGL contexts to admit on a device.
 * @param device - The device's pointer and memory class.
 * @returns Two on touch-first or low-memory devices, otherwise eight.
 * @public
 */
export const resolveWebglContextLimit = (device: WebglContextDevice): number =>
  device.coarsePointer ||
  (device.deviceMemoryGigabytes !== undefined && device.deviceMemoryGigabytes <= constrainedDeviceMemoryGigabytes)
    ? constrainedWebglContexts
    : maxWebglContexts;

/**
 * Estimated bytes of render surface per device pixel for one viewer: the multisampled drawing buffer with depth and
 * stencil (about 38 B, measured at 51 MiB for a 1.34 Mpx iPhone canvas at DPR 2) plus the resolved and
 * post-processing targets. Geometry and environment lighting are not per-pixel and are left out.
 */
const viewerSurfaceBytesPerDevicePixel = 64;

/** Without `navigator.deviceMemory` (Safari, Firefox) the budget assumes an 8 GB device. */
const assumedDeviceMemoryGigabytes = 8;

const gibibyte = 1024 ** 3;

/**
 * Estimated render-surface bytes of a viewer canvas.
 * @param cssPixels - The canvas's CSS width times height.
 * @param pixelRatio - The drawing-buffer pixel ratio.
 * @returns The estimated bytes.
 * @public
 */
export const estimateViewerSurfaceBytes = (cssPixels: number, pixelRatio: number): number =>
  Math.max(0, cssPixels) * pixelRatio * pixelRatio * viewerSurfaceBytesPerDevicePixel;

/**
 * The render-surface bytes all viewers on a device may hold together: half the device memory the browser reports.
 * @param device - The device's pointer and memory class.
 * @returns The byte budget.
 * @public
 */
export const resolveViewerSurfaceByteBudget = (device: WebglContextDevice): number =>
  ((device.deviceMemoryGigabytes ?? assumedDeviceMemoryGigabytes) * gibibyte) / 2;

// Type definitions
type WebglContextMachineContext = {
  /** Live viewer contexts, WebGL and WebGPU alike. */
  count: number;
  limit: number;
  /** Estimated render-surface bytes of the viewers that reported a size. */
  bytes: number;
  byteBudget: number;
  /** Each identified holder's current surface estimate. */
  holders: Readonly<Record<string, number>>;
};

type WebglContextMachineInput = Readonly<{ limit?: number; byteBudget?: number }> | undefined;

type WebglContextMachineEvents =
  | { type: 'acquire'; id?: string; bytes?: number }
  | { type: 'resize'; id: string; bytes: number }
  | { type: 'release'; id?: string };

const sumHolderBytes = (holders: Readonly<Record<string, number>>): number =>
  Object.values(holders).reduce((total, bytes) => total + bytes, 0);

/**
 * Whether a tracker admits one more viewer of an estimated size. The first viewer is always admitted, so a page
 * with one oversized canvas still renders; after that both the context limit and the byte budget hold.
 * @param context - The tracker's current context.
 * @param bytes - The new viewer's estimated surface bytes.
 * @returns Whether the viewer may create its context.
 * @public
 */
export const admitsViewerContext = (
  context: Pick<WebglContextMachineContext, 'count' | 'limit' | 'bytes' | 'byteBudget'>,
  bytes: number,
): boolean => context.count === 0 || (context.count < context.limit && context.bytes + bytes <= context.byteBudget);

/**
 * Tracks the active viewer rendering contexts (WebGL and WebGPU) across all viewer
 * panels and their estimated render-surface bytes.  Components send `acquire` when a Canvas mounts,
 * `resize` when its surface changes size and `release` when it unmounts.  Consumers read the context via
 * `actorRef.getSnapshot()` (imperative, non-reactive) and {@link admitsViewerContext} to decide whether
 * to create a new context or show a fallback.
 *
 * **Important**: Do NOT use `useSelector` on this actor in any component
 * that controls mounting/unmounting of a WebGL Canvas based on the count.
 * Both `useSelector` and `useSyncExternalStore` notify subscribers
 * synchronously, which creates an infinite re-render loop when the
 * subscribing component's render output controls the child that triggers
 * acquire/release events.
 */
export const webglContextMachine = setup({
  schemas: {
    context: types<WebglContextMachineContext>(),
    events: eventSchemas<WebglContextMachineEvents>(),
    input: types<WebglContextMachineInput>(),
  },
}).createMachine({
  id: 'webglContext',
  context: ({ input }) => ({
    count: 0,
    limit: input?.limit ?? maxWebglContexts,
    bytes: 0,
    byteBudget: input?.byteBudget ?? Number.POSITIVE_INFINITY,
    holders: {},
  }),
  on: {
    acquire: {
      context({ context, event }) {
        if (event.id === undefined) {
          return { count: context.count + 1 };
        }
        const holders = { ...context.holders, [event.id]: Math.max(0, event.bytes ?? 0) };
        return { count: context.count + 1, holders, bytes: sumHolderBytes(holders) };
      },
    },
    resize({ context, event }) {
      if (!(event.id in context.holders)) {
        return undefined;
      }
      const holders = { ...context.holders, [event.id]: Math.max(0, event.bytes) };
      return { context: { holders, bytes: sumHolderBytes(holders) } };
    },
    release({ context, event }) {
      if (context.count === 0) {
        return undefined;
      }
      if (event.id === undefined || !(event.id in context.holders)) {
        return { context: { count: context.count - 1 } };
      }
      const holders = Object.fromEntries(Object.entries(context.holders).filter(([id]) => id !== event.id));
      return { context: { count: context.count - 1, holders, bytes: sumHolderBytes(holders) } };
    },
  },
});
