/**
 * The client side of operation observation: one observation per attempt, built at the session's settle sites from
 * the reason each attempt settled, and the join with the worker's trailing facts.
 *
 * Nothing here changes what a caller sees. With no subscriber a settle site builds nothing.
 */

import { Topic } from '@taucad/events';
import { isOperationAbortedError, isOperationTimeoutError } from '#framework/runtime-operation-errors.js';
import { isRuntimeTerminatedError } from '#client/runtime-terminated-error.js';
import type { RuntimeTransportCloseResult } from '#transport/runtime-transport.types.js';
import { readResourceLimit } from '#types/resource-limit.js';
import type { KernelIssueCode } from '#types/kernel-issue-codes.js';
import type { KernelIssue, ResourceLimitDetails } from '#types/runtime.types.js';
import type {
  RuntimeFactsStatus,
  RuntimeLateTerminal,
  RuntimeOperationBegin,
  RuntimeObservationMode,
  RuntimeObservedTermination,
  RuntimeOperation,
  RuntimeOperationObservation,
  RuntimeOperationOutcome,
  RuntimeTransport,
  WorkerOperationFacts,
} from '#types/runtime-observation.types.js';

/** Why the session settled an attempt, as each settle site knows it. @internal */
export type SettleReason =
  | Readonly<{ type: 'result'; result: Readonly<{ success: boolean; issues: readonly KernelIssue[] }> }>
  | Readonly<{ type: 'superseded' }>
  | Readonly<{ type: 'deadline'; phase: string }>
  | Readonly<{ type: 'abort-notice'; code: string; phase: string }>
  | Readonly<{ type: 'closed' }>
  /** `client.terminate()`, or a `requested` transport close. */
  | Readonly<{ type: 'terminated-by-caller' }>
  /** The transport closed under the attempt. */
  | Readonly<{ type: 'transport-closed'; close: Exclude<RuntimeTransportCloseResult, { cause: 'requested' }> }>
  | Readonly<{ type: 'materialise-failed'; error: unknown }>
  | Readonly<{ type: 'rejected'; error: unknown }>;

/** One attempt the session is observing. Facts known later (the kernel, the operation id) are filled in. @internal */
export type ObservedAttempt = {
  readonly operation: RuntimeOperation;
  operationId: string;
  readonly started: number;
  /** Whether the worker was asked to compute facts for this attempt. */
  observing: boolean;
  settled: boolean;
  kernel?: string;
  format?: string;
  plugin?: string;
  sourceFormat?: string;
  entryFormat?: string;
};

/** Milliseconds a settled attempt waits for its trailing facts. */
const joinWindow = 1000;
/** Attempts that can wait for facts at once: the number that can settle before their facts arrive. */
const awaitingLimit = 64;
/** Settled attempts remembered so a late reply can be recognised. */
const settledLimit = 1024;
/** Milliseconds after its settlement within which a late reply is reported. */
const lateWindow = 600_000;
/** Warning codes an observation keeps. */
const adaptationLimit = 8;

const unref = (timer: unknown): void => {
  // Node timers are objects with `unref`; browser timers are numbers.
  if (typeof timer === 'object' && timer !== null && 'unref' in timer && typeof timer.unref === 'function') {
    (timer as { unref: () => void }).unref();
  }
};

/**
 * A rejection's stable code: its upper-snake `code`, else `UNKNOWN`.
 *
 * @param error - The rejection.
 * @returns A bounded identifier, never a message.
 */
const stableCode = (error: unknown): string => {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  return typeof code === 'string' && /^[A-Z][A-Z\d_]{0,63}$/u.test(code) ? code : 'UNKNOWN';
};

const terminationOf = (
  close: Exclude<RuntimeTransportCloseResult, { cause: 'requested' }>,
): RuntimeObservedTermination | undefined => {
  if (close.cause !== 'host-exit') {
    return undefined;
  }
  const exceeded = readResourceLimit(close.exceeded);
  return {
    phase: close.phase,
    ...(close.exitCode === undefined ? {} : { exitCode: close.exitCode }),
    ...(close.released === undefined ? {} : { released: close.released }),
    ...(exceeded === undefined ? {} : { exceeded }),
  };
};

const rejectionOutcome = (error: unknown): RuntimeOperationOutcome => {
  if (isOperationTimeoutError(error)) {
    return { type: 'timed-out', phase: error.phase };
  }
  if (isOperationAbortedError(error)) {
    return { type: 'cancelled' };
  }
  if (isRuntimeTerminatedError(error)) {
    if (error.causeKind === 'explicit') {
      return { type: 'abandoned', reason: 'terminated' };
    }
    if (error.causeKind === 'operation-timeout') {
      return { type: 'terminated', close: 'operation-timeout', detail: undefined };
    }
    if (error.detail !== undefined) {
      const exceeded = readResourceLimit(error.detail.exceeded);
      return {
        type: 'terminated',
        close: 'host-exit',
        detail: {
          phase: error.detail.phase,
          ...(error.detail.exitCode === undefined ? {} : { exitCode: error.detail.exitCode }),
          ...(error.detail.released === undefined ? {} : { released: error.detail.released }),
          ...(exceeded === undefined ? {} : { exceeded }),
        },
      };
    }
    return { type: 'terminated', close: 'wire-failure', detail: undefined };
  }
  return { type: 'failed', code: stableCode(error) };
};

/**
 * The outcome of an attempt, from the reason it settled.
 *
 * @param reason - Why the session settled it.
 * @returns Exactly one outcome.
 * @internal
 */
export const outcomeOf = (reason: SettleReason): RuntimeOperationOutcome => {
  switch (reason.type) {
    case 'result': {
      const first = reason.result.issues.find((issue) => issue.severity === 'error');
      return reason.result.success || first === undefined ? { type: 'succeeded' } : { type: 'issue', code: first.code };
    }
    case 'superseded': {
      return { type: 'superseded' };
    }
    case 'deadline': {
      return { type: 'timed-out', phase: reason.phase };
    }
    case 'abort-notice': {
      return reason.code === 'OPERATION_TIMEOUT' ? { type: 'timed-out', phase: reason.phase } : { type: 'cancelled' };
    }
    case 'closed': {
      return { type: 'abandoned', reason: 'closed' };
    }
    case 'terminated-by-caller': {
      return { type: 'abandoned', reason: 'terminated' };
    }
    case 'transport-closed': {
      return { type: 'terminated', close: reason.close.cause, detail: terminationOf(reason.close) };
    }
    case 'materialise-failed': {
      return { type: 'discarded', code: stableCode(reason.error) };
    }
    case 'rejected': {
      return rejectionOutcome(reason.error);
    }
  }
};

/**
 * Warning-severity codes, in order, without repeats; past eight they are counted.
 *
 * @param issues - The result's issues.
 * @returns The adaptations and how many were dropped.
 */
const adaptationsOf = (
  issues: readonly KernelIssue[],
): Pick<RuntimeOperationObservation, 'adaptations' | 'adaptationsDropped'> => {
  const adaptations: KernelIssueCode[] = [];
  let adaptationsDropped = 0;
  for (const issue of issues) {
    if (issue.severity !== 'warning' || adaptations.includes(issue.code)) {
      continue;
    }
    if (adaptations.length === adaptationLimit) {
      adaptationsDropped++;
    } else {
      adaptations.push(issue.code);
    }
  }
  return { adaptations, adaptationsDropped };
};

const limitOf = (outcome: RuntimeOperationOutcome, issues: readonly KernelIssue[]): ResourceLimitDetails | undefined =>
  outcome.type === 'terminated'
    ? outcome.detail?.exceeded
    : readResourceLimit(issues.find((issue) => issue.code === 'RESOURCE_LIMIT')?.details);

/**
 * An observation still waiting for its worker facts. Only the observer holds it, and {@link joinFacts} completes it
 * once, just before it is emitted, so it is never copied.
 */
type Settled = { -readonly [Key in keyof RuntimeOperationObservation]: RuntimeOperationObservation[Key] };

/**
 * Join an observation with its trailing facts, completing it in place. The worker's transcoder wins over the client's
 * own stamp: it ran.
 *
 * @param settled - The observation without facts.
 * @param facts - The worker's facts, when they arrived.
 * @param why - The status when they did not.
 * @returns The completed observation.
 */
const joinFacts = (
  settled: Settled,
  facts: WorkerOperationFacts | undefined,
  why: Exclude<RuntimeFactsStatus, 'joined'>,
): RuntimeOperationObservation => {
  if (facts === undefined) {
    settled.facts = why;
  } else {
    if (facts.plugin !== undefined) {
      settled.plugin = facts.plugin;
    }
    settled.worker = facts;
    settled.facts = 'joined';
  }
  return settled;
};

/** An attempt waiting for its facts, and when it settled. */
type Awaiting = Readonly<{ settled: Settled; at: number }>;

const lateOutcomes: ReadonlySet<RuntimeOperationOutcome['type']> = new Set(['timed-out', 'cancelled', 'abandoned']);

/** Observation state of one client: subscribers, the worker's support, and attempts waiting for facts. @internal */
export class ClientOperationObserver {
  readonly #operations = new Topic<RuntimeOperationObservation>({ name: 'operation' });
  readonly #late = new Topic<RuntimeLateTerminal>({ name: 'operation-late' });
  /* A host handler that throws never reaches the attempt. */
  readonly #begins = new Topic<RuntimeOperationBegin>({ name: 'operation-begin', onError: () => undefined });
  readonly #transport: RuntimeTransport;
  #mode: RuntimeObservationMode = 'off';
  #sent: RuntimeObservationMode = 'off';
  #workerObservation: readonly RuntimeObservationMode[] = [];
  #send: ((mode: RuntimeObservationMode) => void) | undefined;
  /**
   * The oldest attempt waiting for facts, held outside {@link ClientOperationObserver.#awaiting} while no other attempt
   * waits: with one operation in flight at a time, the common case, an attempt then costs no map insertion and deletion.
   * Every attempt in the map settled after it.
   */
  #first: Awaiting | undefined;
  readonly #awaiting = new Map<string, Awaiting>();
  readonly #early = new Map<string, Readonly<{ facts: WorkerOperationFacts; at: number }>>();
  readonly #settled = new Map<
    string,
    Readonly<{ operation: RuntimeOperation; settledAs: RuntimeLateTerminal['settledAs']; at: number }>
  >();
  #timer: ReturnType<typeof setTimeout> | undefined;

  /** @param transport - How the client reaches its worker. */
  public constructor(transport: RuntimeTransport) {
    this.#transport = transport;
  }

  /** The modes the worker advertised; empty before `initialize` and for a worker that predates observation. */
  public get workerObservation(): readonly RuntimeObservationMode[] {
    return this.#workerObservation;
  }

  /** The mode the `initialize` call carries: the caller's wish so far. */
  public get initializeMode(): RuntimeObservationMode {
    return this.#mode;
  }

  /**
   * Subscribe to observations.
   *
   * @param handler - Receives each observation once.
   * @param options - An abort signal that unsubscribes.
   * @returns The unsubscribe function.
   */
  public onOperation(
    handler: (observation: RuntimeOperationObservation) => void,
    options?: { signal?: AbortSignal },
  ): () => void {
    return this.#operations.subscribe(handler, options);
  }

  /**
   * Subscribe to late terminal replies.
   *
   * @param handler - Receives each late reply once.
   * @param options - An abort signal that unsubscribes.
   * @returns The unsubscribe function.
   */
  public onLate(handler: (late: RuntimeLateTerminal) => void, options?: { signal?: AbortSignal }): () => void {
    return this.#late.subscribe(handler, options);
  }

  /**
   * Subscribe to attempts as they begin.
   *
   * @param handler - Receives each beginning once.
   * @param options - An abort signal that unsubscribes.
   * @returns The unsubscribe function.
   */
  public onBegin(handler: (begin: RuntimeOperationBegin) => void, options?: { signal?: AbortSignal }): () => void {
    return this.#begins.subscribe(handler, options);
  }

  /**
   * Record whether the worker should compute facts, and tell it when it can.
   *
   * @param mode - The mode.
   */
  public observe(mode: RuntimeObservationMode): void {
    this.#mode = mode;
    this.#sync();
  }

  /**
   * The worker answered `initialize`.
   *
   * @param input - What it advertised, the mode the `initialize` call carried, and how to send `observe`.
   */
  public connected(
    input: Readonly<{
      observation: unknown;
      sent: RuntimeObservationMode;
      send: (mode: RuntimeObservationMode) => void;
    }>,
  ): void {
    this.#workerObservation = Array.isArray(input.observation)
      ? input.observation.filter((mode): mode is RuntimeObservationMode => mode === 'facts' || mode === 'off')
      : [];
    this.#sent = this.#workerObservation.length > 0 ? input.sent : 'off';
    this.#send = input.send;
    this.#sync();
  }

  /** Whether the worker computes facts for an attempt started now. */
  public get observing(): boolean {
    return this.#sent === 'facts';
  }

  /**
   * Start one attempt. Builds nothing when nobody listens.
   *
   * @param input - The attempt's operation, id and the facts known at submission.
   * @returns The attempt, or `undefined` when it is not observed.
   */
  public begin(
    input: Readonly<{
      operation: RuntimeOperation;
      operationId: string;
      observing?: boolean;
      kernel?: string;
      format?: string;
      plugin?: string;
      sourceFormat?: string;
      entryFormat?: string;
    }>,
  ): ObservedAttempt | undefined {
    if (this.#begins.size > 0) {
      this.#begins.emit({ operationId: input.operationId, operation: input.operation });
    }
    if (this.#operations.size === 0 && this.#late.size === 0) {
      return undefined;
    }
    return {
      ...input,
      started: performance.now(),
      observing: input.observing ?? this.observing,
      settled: false,
    };
  }

  /**
   * Settle one attempt, exactly once.
   *
   * @param attempt - The attempt, or `undefined` when it was not observed.
   * @param reason - Why it settled.
   */
  public settle(attempt: ObservedAttempt | undefined, reason: SettleReason): void {
    if (attempt === undefined || attempt.settled) {
      return;
    }
    attempt.settled = true;
    try {
      this.#settle(attempt, reason);
    } catch {
      // Observation must not change runtime outcomes.
    }
  }

  /**
   * The worker's trailing facts for one operation.
   *
   * @param operationId - The operation.
   * @param facts - Its facts.
   */
  public receiveFacts(operationId: string, facts: WorkerOperationFacts): void {
    let waiting = this.#first;
    if (waiting?.settled.operationId === operationId) {
      this.#first = undefined;
    } else {
      waiting = this.#awaiting.get(operationId);
      this.#awaiting.delete(operationId);
    }
    if (waiting !== undefined) {
      // The armed sweep is left to find nothing: re-arming per attempt would cost a timer per operation.
      this.#emit(joinFacts(waiting.settled, facts, 'missing-timeout'));
      return;
    }
    if (this.#operations.size === 0) {
      return;
    }
    // Facts can overtake an attempt whose result the client is still materialising.
    this.#early.set(operationId, { facts, at: performance.now() });
    if (this.#early.size > awaitingLimit) {
      this.#early.delete(this.#early.keys().next().value!);
    }
    this.#arm();
  }

  /**
   * A terminal reply arrived for an operation. When its attempt had already settled as timed out, cancelled or
   * abandoned, the worker kept running past the caller: that is reported once, within ten minutes.
   *
   * @param operationId - The operation.
   */
  public terminal(operationId: string): void {
    const settled = this.#settled.get(operationId);
    if (settled === undefined) {
      return;
    }
    this.#settled.delete(operationId);
    const after = performance.now() - settled.at;
    if (after > lateWindow || this.#late.size === 0) {
      return;
    }
    this.#late.emit({ operationId, operation: settled.operation, settledAs: settled.settledAs, after });
  }

  /**
   * An attempt settled under a placeholder id before the worker named it; a late reply arrives under the real one.
   *
   * @param from - The placeholder.
   * @param to - The id the worker uses.
   */
  public rekey(from: string, to: string): void {
    const settled = this.#settled.get(from);
    if (settled !== undefined) {
      this.#settled.delete(from);
      this.#settled.set(to, settled);
    }
  }

  /** The worker is gone: every attempt still waiting for facts is emitted now, synchronously. */
  public workerGone(): void {
    this.#clearTimer();
    const waiting = [...(this.#first === undefined ? [] : [this.#first]), ...this.#awaiting.values()];
    this.#first = undefined;
    this.#awaiting.clear();
    this.#early.clear();
    for (const { settled } of waiting) {
      this.#emit(joinFacts(settled, undefined, 'missing-worker-gone'));
    }
  }

  /** Release subscribers. Call after {@link ClientOperationObserver.workerGone}. */
  public dispose(): void {
    this.#operations.dispose();
    this.#late.dispose();
    this.#settled.clear();
  }

  #sync(): void {
    if (this.#send === undefined || this.#workerObservation.length === 0) {
      return;
    }
    const wanted: RuntimeObservationMode =
      this.#mode === 'facts' && this.#workerObservation.includes('facts') ? 'facts' : 'off';
    if (wanted === this.#sent) {
      return;
    }
    this.#sent = wanted;
    try {
      this.#send(wanted);
    } catch {
      // The channel may be closing; the next attempt is then not observed.
    }
  }

  /**
   * Build the observation of a settled attempt; its worker facts and their status are filled in by {@link joinFacts}.
   *
   * @param attempt - The attempt.
   * @param reason - Why it settled.
   * @param now - The settle time.
   * @returns The observation, waiting for its facts status.
   */
  #observe(attempt: ObservedAttempt, reason: SettleReason, now: number): Settled {
    const issues = reason.type === 'result' ? reason.result.issues : [];
    const outcome = outcomeOf(reason);
    const { adaptations, adaptationsDropped } = adaptationsOf(issues);
    // Assigned in the observation's key order rather than spread: one spread puts the whole literal on the slow path.
    const settled: Partial<Settled> = {
      operationId: attempt.operationId,
      operation: attempt.operation,
      kernel: attempt.kernel,
      outcome,
      transport: this.#transport,
      issues: issues.length === 0 ? [] : [...new Set(issues.map((issue) => issue.code))],
      adaptations,
      adaptationsDropped,
      limit: limitOf(outcome, issues),
      format: attempt.format,
      plugin: attempt.plugin,
    };
    if (attempt.sourceFormat !== undefined) {
      settled.sourceFormat = attempt.sourceFormat;
    }
    if (attempt.entryFormat !== undefined) {
      settled.entryFormat = attempt.entryFormat;
    }
    settled.duration = Math.max(0, now - attempt.started);
    settled.worker = undefined;
    settled.facts = 'none';
    // Every key the type requires is assigned above.
    return settled as Settled;
  }

  #settle(attempt: ObservedAttempt, reason: SettleReason): void {
    const now = performance.now();
    const settled = this.#observe(attempt, reason, now);
    const { outcome } = settled;
    if (this.#late.size > 0 && lateOutcomes.has(outcome.type)) {
      this.#settled.set(attempt.operationId, {
        operation: attempt.operation,
        settledAs: outcome.type as RuntimeLateTerminal['settledAs'],
        at: now,
      });
      if (this.#settled.size > settledLimit) {
        this.#settled.delete(this.#settled.keys().next().value!);
      }
    }
    if (this.#operations.size === 0) {
      return;
    }
    const replied = reason.type === 'result' || reason.type === 'materialise-failed';
    if (!attempt.observing) {
      this.#early.delete(attempt.operationId);
      this.#emit(joinFacts(settled, undefined, 'not-observed'));
      return;
    }
    if (!replied) {
      this.#early.delete(attempt.operationId);
      this.#emit(joinFacts(settled, undefined, 'none'));
      return;
    }
    const early = this.#early.get(attempt.operationId);
    if (early !== undefined) {
      this.#early.delete(attempt.operationId);
      this.#emit(joinFacts(settled, early.facts, 'missing-timeout'));
      return;
    }
    const waiting = { settled, at: now };
    const first = this.#first;
    if (first === undefined ? this.#awaiting.size === 0 : first.settled.operationId === attempt.operationId) {
      this.#first = waiting;
    } else {
      this.#awaiting.set(attempt.operationId, waiting);
    }
    if ((this.#first === undefined ? 0 : 1) + this.#awaiting.size > awaitingLimit) {
      let oldest = this.#first;
      if (oldest === undefined) {
        const [oldestId, entry] = this.#awaiting.entries().next().value!;
        this.#awaiting.delete(oldestId);
        oldest = entry;
      } else {
        this.#first = undefined;
      }
      this.#emit(joinFacts(oldest.settled, undefined, 'missing-timeout'));
    }
    this.#arm();
  }

  #emit(observation: RuntimeOperationObservation): void {
    this.#operations.emit(observation);
  }

  #arm(): void {
    if (this.#timer !== undefined) {
      return;
    }
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      this.#sweep();
    }, joinWindow);
    unref(this.#timer);
  }

  #sweep(): void {
    const expired = performance.now() - joinWindow;
    const first = this.#first;
    if (first !== undefined && first.at <= expired) {
      this.#first = undefined;
      this.#emit(joinFacts(first.settled, undefined, 'missing-timeout'));
    }
    for (const [operationId, waiting] of this.#awaiting) {
      if (waiting.at <= expired) {
        this.#awaiting.delete(operationId);
        this.#emit(joinFacts(waiting.settled, undefined, 'missing-timeout'));
      }
    }
    for (const [operationId, early] of this.#early) {
      if (early.at <= expired) {
        this.#early.delete(operationId);
      }
    }
    if (this.#first !== undefined || this.#awaiting.size > 0 || this.#early.size > 0) {
      this.#arm();
    }
  }

  #clearTimer(): void {
    if (this.#timer !== undefined) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
  }
}

/**
 * How a client reaches its worker, read from its transport's descriptor.
 *
 * @param wire - The descriptor's wire.
 * @returns The observation's transport.
 * @internal
 */
export const runtimeTransportOf = (
  wire: 'in-process' | 'web-worker' | 'node-worker' | 'electron-utility' | 'cross-process' | 'remote',
): RuntimeTransport => {
  switch (wire) {
    case 'in-process':
    case 'web-worker':
    case 'node-worker': {
      return wire;
    }
    case 'electron-utility':
    case 'cross-process': {
      return 'utility';
    }
    case 'remote': {
      return 'websocket';
    }
  }
};

/**
 * The entry file's format: the longest registered kernel extension it ends with.
 *
 * @param filename - The entry file's name.
 * @param extensions - Every registered kernel extension.
 * @returns The extension, or `undefined` when none matches.
 * @internal
 */
export const entryFormatOf = (filename: string, extensions: Iterable<string>): string | undefined => {
  const name = filename.toLowerCase();
  let best: string | undefined;
  for (const extension of extensions) {
    const candidate = extension.toLowerCase();
    if (candidate === '*' || candidate.length === 0) {
      continue;
    }
    if (name.endsWith(`.${candidate}`) && (best === undefined || candidate.length > best.length)) {
      best = candidate;
    }
  }
  return best;
};
