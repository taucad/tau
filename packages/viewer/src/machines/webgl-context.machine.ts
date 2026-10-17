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

// Type definitions
type WebglContextMachineContext = {
  count: number;
  limit: number;
};

type WebglContextMachineInput = Readonly<{ limit?: number }> | undefined;

type WebglContextMachineEvents = { type: 'acquire' } | { type: 'release' };

/**
 * Tracks the number of active WebGL rendering contexts across all viewer
 * panels.  Components send `acquire` when a Canvas mounts and `release`
 * when it unmounts.  Consumers read `count` / `limit` via
 * `actorRef.getSnapshot()` (imperative, non-reactive) to decide whether
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
  }),
  on: {
    acquire: {
      context: ({ context }) => ({ count: context.count + 1 }),
    },
    release: ({ context }) => (context.count > 0 ? { context: { count: context.count - 1 } } : undefined),
  },
});
