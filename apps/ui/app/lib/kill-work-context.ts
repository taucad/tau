/**
 * What the page is working on, written into the tab-kill marker before the work starts (crash capture blueprint,
 * marker v3). A browser that ends a tab runs no code, so every value is recorded ahead: the phase as each step
 * begins, each size as soon as it is known, triangles and geometry bytes before the GPU upload that may be what
 * kills the tab.
 *
 * Producers are the editor's runtime client (`operation-begin` and settled `operation` observations), the viewer's
 * closed events, the CAD machine's geometry receipt and the share route's open. Only closed names and numbers reach
 * the marker (`admitKillWork`). Nothing here is sent anywhere: the marker is reported on the next load, under the
 * telemetry consent (`#components/memory-kill-reporter`).
 *
 * @module
 */

import type { RuntimeOperationBegin, RuntimeOperationObservation } from '@taucad/runtime';
import { readRendererMemory } from '@taucad/viewer/lib/renderer-telemetry';
import { readKillWork, recordKillWork, recordMemoryBreadcrumb } from '#lib/memory-kill-signal.js';
import type { KillPhase } from '#lib/memory-kill-signal.js';
import { setKernelHeapReader, setRendererMemoryReader } from '@taucad/ui-core/lib/memory-sampler';

/** The phase each runtime operation begins; operations not listed leave the phase alone. */
const phaseOfOperation: Readonly<Partial<Record<string, KillPhase>>> = {
  initialize: 'kernel-init',
  evaluate: 'evaluate',
  render: 'mesh',
  export: 'export',
};

/** The trail name each runtime step adds to the dead page's breadcrumbs. */
const trailOfOperation: Readonly<Partial<Record<string, string>>> = {
  initialize: 'kernel.init',
  evaluate: 'evaluate',
  render: 'render',
};

/** The kernel heaps the editor's settled attempts last reported, by kernel id. */
const heapByKernel = new Map<string, number>();

/** The settle facts this module reads; a subset of the runtime's observation. */
type SettledAttempt = Pick<RuntimeOperationObservation, 'operation' | 'kernel' | 'outcome' | 'duration' | 'worker'>;

/** The client surface this module listens to. */
export type KillWorkClient = {
  on(event: 'operation-begin', handler: (begin: RuntimeOperationBegin) => void): () => void;
  on(event: 'operation', handler: (observation: RuntimeOperationObservation) => void): () => void;
};

/**
 * An attempt began: record its phase before any of its work runs.
 *
 * @param begin - The beginning.
 */
export const recordOperationBegin = (begin: Readonly<{ operation: string }>): void => {
  const phase = phaseOfOperation[begin.operation];
  if (phase === undefined) {
    return;
  }
  recordKillWork({
    phase,
    ...(begin.operation === 'render' ? { renderCount: (readKillWork()?.renderCount ?? 0) + 1 } : {}),
  });
  const trail = trailOfOperation[begin.operation];
  if (trail !== undefined) {
    recordMemoryBreadcrumb(trail);
  }
};

/**
 * An attempt settled: record its kernel, durations, triangles and heap. A failed attempt, or a finished export,
 * returns the page to `idle`; a successful render stays at `mesh` until its geometry arrives.
 *
 * @param settled - The observation.
 */
export const recordOperationSettled = (settled: SettledAttempt): void => {
  const { worker } = settled;
  const heap = worker?.heapBytes;
  if (settled.kernel !== undefined && heap !== undefined) {
    heapByKernel.set(settled.kernel, heap);
  }
  const peak = readKillWork()?.peakWasmBytes;
  const isFailed = settled.outcome.type !== 'succeeded';
  recordKillWork({
    ...(settled.kernel === undefined ? {} : { kernel: settled.kernel }),
    ...(settled.operation === 'evaluate' ? { lastEvaluate: worker?.execution ?? settled.duration } : {}),
    ...(settled.operation === 'render' ? { lastRender: worker?.execution ?? settled.duration } : {}),
    ...(settled.operation === 'render' && worker?.triangles !== undefined ? { triangles: worker.triangles } : {}),
    ...(heap !== undefined && (peak === undefined || heap > peak) ? { peakWasmBytes: heap } : {}),
    ...(isFailed || settled.operation === 'export' ? { phase: 'idle' } : {}),
  });
};

/**
 * Follow the editor's runtime client. Attach before `connect()` so `initialize` is seen.
 *
 * @param client - The client.
 * @returns The unsubscribe.
 */
export const observeKillWork = (client: KillWorkClient): (() => void) => {
  const offBegin = client.on('operation-begin', recordOperationBegin);
  const offSettle = client.on('operation', recordOperationSettled);
  return () => {
    offBegin();
    offSettle();
  };
};

/**
 * The runtime handed the viewer a geometry: record its size before the upload starts.
 *
 * @param bytes - The geometry's byte length.
 */
export const recordGeometryReceived = (bytes: number): void => {
  recordKillWork({ phase: 'geometry-receive', geometryBytes: bytes });
  recordMemoryBreadcrumb('geometry.receive');
};

/** One viewer event, as the viewer emits it (`@taucad/viewer/lib/renderer-telemetry`). */
type ViewerEvent = Readonly<{ event: string; backend: string; triangles?: number }>;

/**
 * Follow the viewer: `upload-start` begins `gpu-upload`, the first frame returns to `idle` with the renderer's
 * counts, and a context loss is noted.
 *
 * @param event - The viewer event.
 */
export const recordViewerWork = (event: ViewerEvent): void => {
  switch (event.event) {
    case 'upload-start': {
      recordKillWork({ phase: 'gpu-upload', backend: event.backend });
      return;
    }
    case 'first-frame': {
      const memory = readRendererMemory();
      recordKillWork({
        phase: 'idle',
        backend: event.backend,
        contextLost: false,
        ...(event.triangles === undefined ? {} : { triangles: event.triangles }),
        ...(memory === undefined ? {} : { gpuGeometries: memory.geometries, textures: memory.textures }),
      });
      recordMemoryBreadcrumb('first-frame');
      return;
    }
    case 'context-lost': {
      recordKillWork({ contextLost: true, backend: event.backend });
      return;
    }
    case 'context-restored': {
      recordKillWork({ contextLost: false });
      break;
    }
    default:
  }
};

/**
 * A person interacted; recorded as a closed name with its time, at most once per 10 s for the same name.
 *
 * @param interaction - The closed interaction name.
 */
export const recordInteraction = (
  interaction: 'open' | 'parameter' | 'camera' | 'section' | 'measure' | 'export' | 'chat' | 'edit',
): void => {
  const work = readKillWork();
  const now = Date.now();
  if (work?.lastInteraction === interaction && now - (work.interactionAt ?? 0) < 10_000) {
    return;
  }
  recordKillWork({
    lastInteraction: interaction,
    interactionAt: now,
    ...(interaction === 'parameter' ? { parameterChanges: (work?.parameterChanges ?? 0) + 1 } : {}),
  });
};

/**
 * Register the memory sampler's two readers (SB2, the wiring Finding 2 found missing): kernel heaps from the
 * editor's settled attempts, and the renderer's counts from the viewer.
 *
 * @returns The removal.
 */
export const installKillWorkReaders = (): (() => void) => {
  setKernelHeapReader(() => ({ bytesByKernelId: Object.fromEntries(heapByKernel), source: 'kernel' }));
  setRendererMemoryReader(() => {
    const memory = readRendererMemory();
    return memory === undefined ? {} : { textures: memory.textures };
  });
  return () => {
    setKernelHeapReader(undefined);
    setRendererMemoryReader(undefined);
  };
};
