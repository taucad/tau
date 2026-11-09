/**
 * The viewer's closed events (runtime observability FR-17): context loss and restore, the first frame of a presented
 * model, a burst of long animation frames, and a geometry download into the renderer. Nothing about the scene leaves:
 * an event carries its kind, the graphics backend, and at most a duration, a triangle count and a format.
 *
 * The viewer emits; it never reports. A host subscribes through `onViewerEvent` (`#lib/renderer-telemetry.js`) and
 * decides whether anything is sent, so the package has no telemetry dependency and a standalone viewer sends nothing.
 *
 * @module
 */

import { Topic } from '@taucad/events';
import type { ResolvedGraphicsBackend } from '#graphics/graphics-settings.js';

/**
 * One viewer event, as a host receives it.
 *
 * @public
 */
export type ViewerTelemetryEvent = Readonly<{
  event: 'context-lost' | 'context-restored' | 'first-frame' | 'long-frame-burst' | 'download';
  backend: ResolvedGraphicsBackend;
  /** Milliseconds: receipt to first frame, or the burst's total frame time. */
  duration?: number;
  /** Delivered triangles of the presented model. */
  triangles?: number;
  /** The downloaded geometry's format. */
  format?: string;
}>;

/* A host handler that throws never reaches the frame path. */
const topic = new Topic<ViewerTelemetryEvent>({ name: 'viewer-telemetry', onError: () => undefined });
let lastBackend: ResolvedGraphicsBackend | undefined;
let contextLostPending = false;

/**
 * Long frames are summed over this window and leave as one event. The platform delivers a batch whenever frames
 * block, which on software rendering is nearly every frame, so one event per batch was one event per frame.
 * Milliseconds.
 */
export const longFrameWindow = 30_000;
let pendingLongFrames: { backend: ResolvedGraphicsBackend; duration: number } | undefined;
let longFrameTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Subscribe to viewer events.
 *
 * @param handler - Called once per event.
 * @returns The unsubscribe.
 */
export const subscribeViewerEvents = (handler: (event: ViewerTelemetryEvent) => void): (() => void) =>
  topic.subscribe(handler);

/**
 * Emit one event, without building anything when no host listens.
 *
 * @param build - The event, built only for a listener.
 */
const emit = (build: () => ViewerTelemetryEvent | undefined): void => {
  if (topic.size === 0) {
    return;
  }
  const event = build();
  if (event !== undefined) {
    topic.emit(event);
  }
};

/**
 * A canvas initialised its renderer. After a context loss on this page, this is the restore.
 *
 * @param backend - The backend the renderer resolved.
 */
export const viewerRendererCreated = (backend: ResolvedGraphicsBackend): void => {
  lastBackend = backend;
  if (contextLostPending) {
    contextLostPending = false;
    emit(() => ({ event: 'context-restored', backend }));
  }
};

/**
 * The renderer lost its GPU device or WebGL context.
 *
 * @param backend - The backend that lost it.
 */
export const viewerContextLost = (backend: ResolvedGraphicsBackend): void => {
  contextLostPending = true;
  emit(() => ({ event: 'context-lost', backend }));
};

/**
 * A model reached its first presented frame.
 *
 * @param input - The backend, receipt-to-frame milliseconds and delivered triangles.
 */
export const viewerFirstFrame = (
  input: Readonly<{ backend: ResolvedGraphicsBackend; duration: number; triangles: number }>,
): void => {
  emit(() => ({ event: 'first-frame', ...input }));
};

/**
 * Send the long frames summed so far as one event, if there are any.
 */
export const flushViewerLongFrames = (): void => {
  if (longFrameTimer !== undefined) {
    clearTimeout(longFrameTimer);
    longFrameTimer = undefined;
  }
  const pending = pendingLongFrames;
  pendingLongFrames = undefined;
  if (pending !== undefined) {
    emit(() => ({ event: 'long-frame-burst', ...pending }));
  }
};

/**
 * One batch of long animation frames, as the platform delivered it. Batches are summed and leave as at most one
 * event per backend per `longFrameWindow`, never one per batch or per frame. Dropped until a renderer exists,
 * since the event is about the viewer's backend, and when no host listens.
 *
 * @param duration - The batch's total frame milliseconds.
 */
export const viewerLongFrameBurst = (duration: number): void => {
  const backend = lastBackend;
  if (backend === undefined || topic.size === 0) {
    return;
  }
  if (pendingLongFrames !== undefined && pendingLongFrames.backend !== backend) {
    flushViewerLongFrames();
  }
  pendingLongFrames = { backend, duration: (pendingLongFrames?.duration ?? 0) + duration };
  longFrameTimer ??= setTimeout(flushViewerLongFrames, longFrameWindow);
};

/**
 * A runtime result's geometry reached the renderer.
 *
 * @param format - The geometry's format.
 */
export const viewerGeometryDownloaded = (format: string): void => {
  emit(() => (lastBackend === undefined ? undefined : { event: 'download', backend: lastBackend, format }));
};

/** Test seam: forget the remembered backend, any pending context loss and any unsent long frames. */
export const resetViewerEvents = (): void => {
  if (longFrameTimer !== undefined) {
    clearTimeout(longFrameTimer);
    longFrameTimer = undefined;
  }
  pendingLongFrames = undefined;
  lastBackend = undefined;
  contextLostPending = false;
};
