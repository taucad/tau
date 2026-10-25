/**
 * Operation observations: one bounded record per client attempt, built where the client settles it.
 *
 * Spans never leave the device; an observation is the bounded summary of one attempt that a host may choose to
 * report. Everything here is local data: the runtime itself sends nothing anywhere.
 */

import type { KernelIssueCode } from '#types/kernel-issue-codes.js';
import type { ResourceLimitDetails } from '#types/runtime.types.js';

/** The client operation an observation describes. @public */
export type RuntimeOperation = 'initialize' | 'describe' | 'evaluate' | 'render' | 'export' | 'transcode';

/**
 * How the client reached the worker, read from the transport the client was composed with: `in-process` (same
 * realm), `web-worker` (browser), `node-worker` (`worker_threads`), `utility` (an Electron utility process or another
 * separate process), `websocket` (a remote host or a daemon). @public
 */
export type RuntimeTransport = 'in-process' | 'web-worker' | 'node-worker' | 'utility' | 'websocket';

/**
 * The realm the worker itself runs in, set by the worker host that started it, never inferred from the client's
 * transport. It decides whether a resident-memory read describes the kernel (`utility`, `process`: one kernel realm
 * per OS process) or someone else's process (`web-worker`, `node-worker`, `in-process`: never reported). @public
 */
export type RuntimeRealm = 'web-worker' | 'node-worker' | 'utility' | 'process' | 'in-process';

/**
 * Whether the worker computes the worker facts. `off` (the default): nothing is marked, sliced, read or walked.
 * `facts`: computed after each terminal reply has been posted and sent as one trailing `operationFacts` notify. A
 * typed mode rather than a boolean, so a further mode needs no wire change. @public
 */
export type RuntimeObservationMode = 'off' | 'facts';

/**
 * What a worker's `initialize` result advertises: the observation modes it supports. A worker that predates
 * observation advertises none, and a client then asks it for nothing. @public
 */
export type RuntimeObservationSupport = Readonly<{ observation: readonly RuntimeObservationMode[] }>;

/**
 * Whether an observation carries the worker facts. `joined`: they arrived and were joined. `none`: the attempt did not
 * settle on a worker reply, so none were due. `not-observed`: the worker's mode was `off`, or the worker predates
 * observation support. `missing-timeout`: a worker that advertised support replied but sent no facts within the join
 * window. `missing-worker-gone`: the transport closed before they arrived. @public
 */
export type RuntimeFactsStatus = 'joined' | 'none' | 'not-observed' | 'missing-timeout' | 'missing-worker-gone';

/**
 * Closed phase names of an operation's spans. A span the framework's phase map names gives its phase to its subtree;
 * a span it does not name inherits the phase of its nearest named ancestor, and is `other` only when it has none.
 * Middleware self-time is reported separately and never lands in a phase. @public
 */
export type RuntimePhase = 'prepare' | 'resolve' | 'compute' | 'mesh' | 'export' | 'reuse' | 'other';

/** Host exit facts an observation keeps for a `terminated` outcome. @public */
export type RuntimeObservedTermination = Readonly<{
  phase: 'boot' | 'session';
  exitCode?: number;
  released?: boolean;
  exceeded?: ResourceLimitDetails;
}>;

/**
 * How an attempt ended, from the caller's side: exactly one per attempt, built from the client's internal settle
 * reason, never from the public settle value. Telemetry never changes the public outcome. @public
 */
export type RuntimeOperationOutcome =
  | Readonly<{ type: 'succeeded' }>
  /** The operation ran and returned `success: false`; `code` is the first error issue's code. */
  | Readonly<{ type: 'issue'; code: KernelIssueCode }>
  /** The caller's signal aborted it, or the worker answered with an abort notice that was not a timeout. */
  | Readonly<{ type: 'cancelled' }>
  /** A newer intent for the same document or view replaced it. Never a deadline. */
  | Readonly<{ type: 'superseded' }>
  /** The client deadline fired, or the worker reported `OPERATION_TIMEOUT`, whether or not anyone awaited the result. */
  | Readonly<{ type: 'timed-out'; phase: string }>
  /** The host or the channel failed under the attempt: the transport's own close cause. */
  | Readonly<{
      type: 'terminated';
      close: 'operation-timeout' | 'host-exit' | 'wire-failure';
      detail: RuntimeObservedTermination | undefined;
    }>
  /** The caller ended the attempt before it settled: the document or view was closed, or the client terminated. */
  | Readonly<{ type: 'abandoned'; reason: 'closed' | 'terminated' }>
  /** The worker finished, but the client could not materialise the result for the caller. */
  | Readonly<{ type: 'discarded'; code: string }>
  /** Any other rejection; `code` is the error's stable code, else `UNKNOWN`. */
  | Readonly<{ type: 'failed'; code: string }>;

/** Which parameter features a model's manifest uses. Names and values never leave. @public */
export type RuntimeParameterFeature = 'units' | 'array' | 'decimal' | 'structured';

/**
 * What the worker reported about one operation, after its terminal reply, while the client observes. Counts and
 * durations only; no names, paths, values or source. @public
 */
export type WorkerOperationFacts = Readonly<{
  /** Waiting behind earlier operations on this worker. Milliseconds. */
  queue: number;
  /** From dequeue to settlement. Milliseconds. */
  execution: number;
  /** The first operation on this worker, so it includes kernel selection and initialization. */
  cold: boolean;
  /** What the framework's compute reuse did: a cache hit, a computation, reuse off, or no lookup. */
  reuse: 'cache' | 'computed' | 'off' | 'none';
  /**
   * Memory at settle, on every outcome: the kernel's own observation hook, a native kernel's child-process tree, or
   * the worker process's resident set where the worker owns its process. Bytes. Never fed into recycling.
   */
  heapBytes?: number;
  heapSource?: 'kernel' | 'child' | 'resident' | 'none';
  /** The worker's own realm, set by its host. */
  realm?: RuntimeRealm;
  /** The transcoder the worker selected for a transcode. */
  plugin?: string;
  /** Delivered triangles of a succeeded render, from its tessellation report. */
  triangles?: number;
  /**
   * Evaluate: concrete parameter leaves the manifest binds (`declared`) and how many differ from their default after
   * resolution (`modified`). `unknown` leaves were too large to compare; `truncated` says the bounded walk stopped.
   */
  parameters?: Readonly<{
    declared: number;
    modified: number;
    unknown?: number;
    truncated?: true;
    features?: readonly RuntimeParameterFeature[];
  }>;
  /** Milliseconds per phase over every span of the operation. Absent phases did not run. */
  phases?: Readonly<Partial<Record<RuntimePhase, number>>>;
  /**
   * Middleware self-time in milliseconds: the sum, the slowest middleware's name and self-time, and the distinct
   * middleware that ran, in first-seen order, at most eight.
   */
  middleware?: Readonly<{ total: number; slowestId: string; slowest: number; ran?: readonly string[] }>;
  /** The bundler that bundled this operation's entry, when one ran. */
  bundler?: string;
}>;

/** One settled attempt, as the client saw it. Local data: a host decides what, if anything, leaves the device. @public */
export type RuntimeOperationObservation = Readonly<{
  /** The id the client uses for this attempt; root spans carry it as `operation.id`. */
  operationId: string;
  operation: RuntimeOperation;
  /** The selected kernel's id, once one was selected. */
  kernel: string | undefined;
  outcome: RuntimeOperationOutcome;
  /** How the client reached the worker. */
  transport: RuntimeTransport;
  /** Codes of the result's issues, in order, without repeats. */
  issues: readonly KernelIssueCode[];
  /** Warning-severity issue codes, in order, without repeats, at most eight; the rest are counted. */
  adaptations: readonly KernelIssueCode[];
  adaptationsDropped: number;
  /** The first `RESOURCE_LIMIT` issue's details, or the supervisor's `exceeded`, when they have the shared shape. */
  limit: ResourceLimitDetails | undefined;
  /** Export and transcode: the requested target format, as the caller gave it. */
  format: string | undefined;
  /** Transcode, and a transcoder-routed export: the transcoder id. The worker's own answer wins when it differs. */
  plugin: string | undefined;
  /** Transcode: the input format; a transcoder-routed export: the route's kernel-native source format. */
  sourceFormat?: string;
  /** Evaluate: the entry file's format, as the longest registered kernel extension it ends with. */
  entryFormat?: string;
  /** Submission to settlement on the client's clock. Milliseconds. */
  duration: number;
  /** The worker facts, when `facts` is `joined`. */
  worker: WorkerOperationFacts | undefined;
  facts: RuntimeFactsStatus;
}>;

/**
 * The worker's terminal reply arrived after the attempt had already settled as `timed-out`, `cancelled` or
 * `abandoned`. Not a second outcome: it says the worker kept running past the caller. Emitted only within ten minutes
 * of the settlement. @public
 */
export type RuntimeLateTerminal = Readonly<{
  operationId: string;
  operation: RuntimeOperation;
  settledAs: 'timed-out' | 'cancelled' | 'abandoned';
  /** From the attempt's settlement to the late reply. Milliseconds. */
  after: number;
}>;
