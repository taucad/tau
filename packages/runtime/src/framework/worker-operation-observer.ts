/**
 * The worker side of operation observation.
 *
 * A worker computes the facts of an operation only while a client has asked it to (`observation: 'facts'`), and
 * only after the operation's terminal reply has been posted. With observation `off` nothing here runs past its
 * first check: no mark, no slice, no walk, no heap read and no parameter count.
 */

import type { ParameterManifest } from '@taucad/parameters';
import {
  heapFacts,
  parameterFacts,
  ResidentSampler,
  settleWithin,
  workerFactsFromEntries,
} from '#framework/operation-facts.js';
import type { OperationMark, WorkerTelemetryCollector } from '#framework/worker-telemetry.js';
import type {
  RuntimeObservationMode,
  RuntimeOperation,
  RuntimeRealm,
  WorkerOperationFacts,
} from '#types/runtime-observation.types.js';
import type { TelemetryEntry } from '#types/runtime-wire.types.js';

/** The heap sources of the kernel an operation ran on, read only for observation. @internal */
export type ObservedKernelHeap = Readonly<{
  observedHeapBytes?: () => number | undefined;
  heapBytes?: () => number | undefined;
  /** A native kernel's child-process tree sample; asynchronous and bounded by the caller. */
  childResident?: () => Promise<number | undefined>;
}>;

/** What an observed operation stamps while it runs; read once, after its reply. @internal */
export type ObservedOperation = {
  readonly operation: RuntimeOperation;
  readonly operationId: string;
  readonly mark: OperationMark;
  readonly admitted: number;
  readonly dequeued: number;
  readonly cold: boolean;
  /** `none` until the operation's compute reuse runs a lookup. */
  reuse: WorkerOperationFacts['reuse'];
  triangles?: number;
  plugin?: string;
  /** Retained only while observing, so an unobserved worker keeps no reference past the reply. */
  parameters?: Readonly<{ manifest: ParameterManifest; resolved: Readonly<Record<string, unknown>> }>;
};

/** One `operationFacts` notify. @internal */
export type OperationFactsNotify = Readonly<{ operationId: string; facts: WorkerOperationFacts }>;

type SettledFacts = Readonly<{
  operationId: string;
  mark: OperationMark;
  /** Collector position when the operation settled: its slice ends here and the flush stops here. */
  end: number;
  stamped: () => Omit<WorkerOperationFacts, 'phases' | 'middleware' | 'bundler'>;
  childResident: (() => Promise<number | undefined>) | undefined;
}>;

/** Settled operations awaiting their reply; the number in flight, so a small bound is enough. */
const settledLimit = 64;
/** Milliseconds a native child sample may take before the facts leave without it. */
const childSampleBound = 50;

const rootNames: ReadonlySet<string> = new Set([
  'kernel.bootstrap',
  'kernel.describe',
  'kernel.evaluate',
  'kernel.render',
  'kernel.export',
  'kernel.transcode',
]);

/**
 * The span id of an operation's root in its slice.
 *
 * @param entries - The slice.
 * @param operationId - The operation.
 * @returns The root's span id, or `undefined` when the slice does not hold it.
 */
const rootSpanIdOf = (entries: readonly TelemetryEntry[], operationId: string): string | undefined => {
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index]!;
    if (rootNames.has(entry.name) && entry.detail?.['operation.id'] === operationId) {
      const id = entry.detail['spanId'];
      return typeof id === 'string' ? id : undefined;
    }
  }
  return undefined;
};

/**
 * Post an operation's facts once its native child sample lands, or without it after the bound.
 *
 * @param notify - The operation and its facts without the child sample.
 * @param sample - The kernel's child-tree sample.
 * @param post - Posts the notify.
 */
const postWithChildSample = async (
  notify: OperationFactsNotify,
  sample: () => Promise<number | undefined>,
  post: (notify: OperationFactsNotify) => void,
): Promise<void> => {
  const { operationId, facts } = notify;
  let bytes: number | undefined;
  try {
    bytes = await settleWithin(sample(), childSampleBound);
  } catch {
    bytes = undefined;
  }
  post({
    operationId,
    facts:
      bytes === undefined || !Number.isFinite(bytes) || bytes < 0
        ? facts
        : { ...facts, heapBytes: bytes, heapSource: 'child' },
  });
};

/** The worker's observation state: its mode, its realm and the facts of settled operations. @internal */
export class WorkerOperationObserver {
  private mode: RuntimeObservationMode = 'off';
  private realm: RuntimeRealm = 'in-process';
  private served = 0;
  private sampler: ResidentSampler | undefined;
  private readonly settled = new Map<string, SettledFacts>();
  // oxlint-disable-next-line @typescript-eslint/parameter-properties -- erasableSyntaxOnly forbids parameter properties
  private readonly collector: () => WorkerTelemetryCollector | undefined;
  // oxlint-disable-next-line @typescript-eslint/parameter-properties -- erasableSyntaxOnly forbids parameter properties
  private readonly kernelHeap: () => ObservedKernelHeap | undefined;

  /**
   * @param collector - The worker's span collector, when telemetry is wired.
   * @param kernelHeap - The heap sources of the kernel the last operation ran on.
   */
  public constructor(
    collector: () => WorkerTelemetryCollector | undefined,
    kernelHeap: () => ObservedKernelHeap | undefined,
  ) {
    this.collector = collector;
    this.kernelHeap = kernelHeap;
  }

  /** Whether operation facts are computed. */
  public get observing(): boolean {
    return this.mode === 'facts';
  }

  /** @param mode - The mode a client asked for; `off` stops facts from the next operation. */
  public setMode(mode: RuntimeObservationMode): void {
    this.mode = mode;
    if (mode === 'off') {
      this.settled.clear();
      this.sampler?.stop();
    }
  }

  /** @param realm - The realm the worker host started this worker in. */
  public setRealm(realm: RuntimeRealm): void {
    this.realm = realm;
  }

  /**
   * Start observing one operation at its dequeue. Counts the operation for `cold` whether or not it is observed.
   *
   * @param input - The operation, when it was admitted, and whether it was admitted while observing.
   * @returns The record the operation stamps, or `undefined` when it is not observed.
   */
  public begin(
    input: Readonly<{ operation: RuntimeOperation; operationId: string; admitted: number; observed: boolean }>,
  ): ObservedOperation | undefined {
    // Initialization is cold by definition and does not make the first operation warm: that one still selects a kernel.
    const cold = input.operation === 'initialize' || this.served === 0;
    if (input.operation !== 'initialize') {
      this.served++;
    }
    const collector = this.collector();
    if (!input.observed || !this.observing || collector === undefined) {
      return undefined;
    }
    if (this.realm === 'utility' || this.realm === 'process') {
      this.sampler ??= new ResidentSampler();
      this.sampler.start();
    }
    return {
      operation: input.operation,
      operationId: input.operationId,
      mark: collector.beginOperation(),
      admitted: input.admitted,
      dequeued: performance.now(),
      cold,
      reuse: 'none',
    };
  }

  /**
   * Record a settled operation's facts, to be computed after its reply. Nothing is computed here: the stamped facts
   * are a thunk over what the operation already holds.
   *
   * @param observed - The operation's record.
   */
  public settle(observed: ObservedOperation): void {
    const collector = this.collector();
    if (!this.observing || collector === undefined) {
      return;
    }
    const settledAt = performance.now();
    const heap = this.kernelHeap();
    const { realm, sampler } = this;
    const stamped = (): Omit<WorkerOperationFacts, 'phases' | 'middleware' | 'bundler'> => ({
      queue: Math.max(0, observed.dequeued - observed.admitted),
      execution: Math.max(0, settledAt - observed.dequeued),
      cold: observed.cold,
      reuse: observed.reuse,
      ...heapFacts({
        observedHeapBytes: heap?.observedHeapBytes,
        heapBytes: heap?.heapBytes,
        observesChild: heap?.childResident !== undefined,
        realm,
        resident: () => sampler?.latest(),
      }),
      ...(observed.triangles === undefined ? {} : { triangles: observed.triangles }),
      ...(observed.plugin === undefined ? {} : { plugin: observed.plugin }),
      ...(observed.parameters === undefined
        ? {}
        : { parameters: parameterFacts(observed.parameters.manifest, observed.parameters.resolved) }),
    });
    this.settled.set(observed.operationId, {
      operationId: observed.operationId,
      mark: observed.mark,
      end: collector.position(),
      stamped,
      childResident: heap?.childResident,
    });
    if (this.settled.size > settledLimit) {
      this.settled.delete(this.settled.keys().next().value!);
    }
  }

  /** The worker went idle: let the resident sampler linger, then stop. */
  public idle(): void {
    this.sampler?.idle();
  }

  /**
   * After an operation's terminal reply was posted: compute its facts and post them, once.
   *
   * @param operationId - The operation whose reply was posted.
   * @param post - Posts the `operationFacts` notify.
   * @returns The collector position the after-reply flush may stop at, or `undefined` to flush everything.
   */
  public afterTerminalReply(
    operationId: string | undefined,
    post: (notify: OperationFactsNotify) => void,
  ): number | undefined {
    if (operationId === undefined || !this.observing) {
      return undefined;
    }
    const settled = this.settled.get(operationId);
    if (settled === undefined) {
      return undefined;
    }
    this.settled.delete(operationId);
    const entries = this.collector()?.operationEntries(settled.mark, settled.end);
    const rootSpanId = entries === undefined ? undefined : rootSpanIdOf(entries, operationId);
    const walked = entries === undefined || rootSpanId === undefined ? {} : workerFactsFromEntries(entries, rootSpanId);
    const facts: WorkerOperationFacts = { ...settled.stamped(), ...walked };
    if (settled.childResident === undefined || facts.heapSource === 'kernel') {
      post({ operationId, facts });
      return settled.end;
    }
    void postWithChildSample({ operationId, facts }, settled.childResident, post);
    return settled.end;
  }
}
