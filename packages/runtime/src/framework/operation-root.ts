/**
 * Operation roots.
 *
 * Every client operation a worker serves — describe, evaluate, render, export
 * and transcode — runs inside one root span opened where the operation is
 * dequeued and closed where it settles. The root carries the client's
 * operation id as `operation.id` and ends with the worker-side outcome, so a
 * trace names the attempt it belongs to and no framework span becomes an
 * accidental root. Worker initialization keeps its `kernel.bootstrap` root.
 */

import type { KernelIssue } from '#types/runtime.types.js';
import { abortReason } from '#types/runtime-wire.types.js';

/** Span attributes, as the tracer accepts them. */
type SpanAttributes = Record<string, string | number | boolean>;

/** The client operations a worker serves inside an operation root. @internal */
export type WorkerOperation = 'describe' | 'evaluate' | 'render' | 'export' | 'transcode';

/** The worker-side outcome an operation root ends with. @internal */
export type WorkerOperationOutcome = 'succeeded' | 'issue' | 'cancelled' | 'timed-out' | 'failed';

/** The root an operation opens when it is dequeued. @internal */
export type OperationRootRequest = Readonly<{
  operation: WorkerOperation;
  /** The id the client uses for this attempt; the root carries it as `operation.id`. */
  operationId: string;
  /** Scalar attributes known when the operation starts. */
  attributes?: SpanAttributes;
}>;

/** One operation from dequeue to settlement, as its root span describes it. @internal */
export type OperationRecord = {
  readonly operation: WorkerOperation;
  readonly operationId: string;
  /** Set by the operation when its result is published rather than returned. */
  result?: Readonly<{ success: boolean; issues: readonly KernelIssue[] }>;
  /** Scalar attributes the root ends with, set by the operation once it knows them. */
  endAttributes?: SpanAttributes;
};

/** A settled operation, handed to the dispatcher so it can flush after the terminal reply. @internal */
export type SettledOperation = Readonly<{
  operation: WorkerOperation;
  operationId: string;
  outcome: WorkerOperationOutcome;
  /** The first error issue's code for `issue`, or the thrown error's code or name for `failed`. */
  errorType?: string;
}>;

/**
 * The root span name of a client operation.
 *
 * @param operation - The operation the root wraps.
 * @returns `kernel.<operation>`.
 * @internal
 */
export const operationRootName = (operation: WorkerOperation): `kernel.${WorkerOperation}` => `kernel.${operation}`;

/**
 * Read a result-shaped value that an operation returned.
 *
 * @param value - Whatever the operation returned.
 * @returns Its success flag and issues, when it has that shape.
 */
const resultOf = (value: unknown): OperationRecord['result'] => {
  if (typeof value !== 'object' || value === null || !('success' in value)) {
    return undefined;
  }
  const { success } = value;
  const issues = 'issues' in value && Array.isArray(value.issues) ? (value.issues as KernelIssue[]) : [];
  return typeof success === 'boolean' ? { success, issues } : undefined;
};

/**
 * The stable code of a thrown value: its upper-snake `code`, else its `name`, else `UNKNOWN`.
 *
 * @param error - The thrown value.
 * @returns A bounded identifier, never a message.
 * @internal
 */
export const stableErrorCode = (error: unknown): string => {
  if (typeof error === 'object' && error !== null) {
    const code = 'code' in error ? error.code : undefined;
    if (typeof code === 'string' && /^[A-Z][A-Z\d_]{0,63}$/u.test(code)) {
      return code;
    }
    const name = 'name' in error ? error.name : undefined;
    if (typeof name === 'string' && /^[A-Za-z][\w]{0,63}$/u.test(name)) {
      return name;
    }
  }
  return 'UNKNOWN';
};

/**
 * Decide how an operation settled.
 *
 * A thrown operation whose signal aborted was cancelled, or timed out when the
 * abort reason says so; any other throw failed. A returned or published result
 * succeeded or carried an issue. An operation that returned nothing and
 * published nothing was abandoned by a newer intent, which is a cancellation.
 *
 * @param record - The operation as it ran.
 * @param settlement - Whether it threw, with what, and the abort state of its signal.
 * @returns The settled operation.
 * @internal
 */
export const settleOperation = (
  record: OperationRecord,
  settlement: Readonly<{ thrown: boolean; error?: unknown; value?: unknown; signal: AbortSignal }>,
): SettledOperation => {
  const base = { operation: record.operation, operationId: record.operationId };
  if (settlement.thrown) {
    if (settlement.signal.aborted) {
      return { ...base, outcome: settlement.signal.reason === abortReason.timeout ? 'timed-out' : 'cancelled' };
    }
    return { ...base, outcome: 'failed', errorType: stableErrorCode(settlement.error) };
  }
  const result = record.result ?? resultOf(settlement.value);
  if (result === undefined) {
    return { ...base, outcome: 'cancelled' };
  }
  if (result.success) {
    return { ...base, outcome: 'succeeded' };
  }
  const first = result.issues.find((issue) => issue.severity === 'error') ?? result.issues[0];
  return first === undefined ? { ...base, outcome: 'issue' } : { ...base, outcome: 'issue', errorType: first.code };
};
