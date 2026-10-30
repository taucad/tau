import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeObservationInput } from '@taucad/telemetry/client';
import { RuntimeAttemptFailure, reportRuntimeFailures, runtimeFailureReport } from '#lib/runtime-failure-reporting.js';

const reportUiError = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('#lib/error-reporting.js', () => ({ reportUiError }));

afterEach(() => {
  reportUiError.mockClear();
});

type Attempt = RuntimeObservationInput & { operationId?: string; issues?: readonly string[] };

const attempt = (overrides: Partial<Attempt>): Attempt => ({
  operationId: 'op_1',
  operation: 'render',
  kernel: 'openscad',
  outcome: { type: 'succeeded' },
  transport: 'web-worker',
  issues: [],
  adaptations: [],
  limit: undefined,
  format: undefined,
  plugin: undefined,
  duration: 120,
  worker: undefined,
  facts: 'not-observed',
  ...overrides,
});

describe('runtimeFailureReport', () => {
  it('should report a terminated attempt with its close cause and the runtime vocabulary', () => {
    const report = runtimeFailureReport(
      attempt({ outcome: { type: 'terminated', close: 'wire-failure', detail: undefined } }),
    );

    expect(report?.error).toBeInstanceOf(RuntimeAttemptFailure);
    expect(report?.error.message).toBe('Kernel render terminated (wire-failure)');
    expect(report?.details).toEqual({
      tags: {
        kernel: 'openscad',
        'runtime.operation': 'render',
        'runtime.outcome': 'terminated',
        'runtime.close': 'wire-failure',
        'runtime.transport': 'web-worker',
      },
      contexts: { 'tau.runtime': { operationId: 'op_1' } },
      fingerprint: ['runtime-attempt', 'openscad', 'render', 'terminated', 'wire-failure'],
    });
  });

  it('should never name memory from a termination alone (runtime I5)', () => {
    const report = runtimeFailureReport(
      attempt({
        outcome: { type: 'terminated', close: 'host-exit', detail: { phase: 'session' } },
        worker: { queue: 0, execution: 10, cold: false, reuse: 'none', heapBytes: 2_000_000_000, heapSource: 'kernel' },
      }),
    );

    expect(JSON.stringify(report).toLowerCase()).not.toMatch(/memory|oom|out-of/u);
    expect(report?.details.contexts?.['tau.runtime']).toEqual({
      operationId: 'op_1',
      heapBytes: 2_000_000_000,
      heapSource: 'kernel',
    });
  });

  it('should tag a timed-out attempt with its phase only when the phase is one of the runtime’s', () => {
    const known = runtimeFailureReport(attempt({ outcome: { type: 'timed-out', phase: 'mesh' } }));
    const unknown = runtimeFailureReport(attempt({ outcome: { type: 'timed-out', phase: 'tessellate' } }));

    expect(known?.details.tags).toMatchObject({ 'runtime.outcome': 'timed-out', 'runtime.phase': 'mesh' });
    expect(unknown?.details.tags).not.toHaveProperty('runtime.phase');
  });

  it('should report a discarded attempt with its code, and leave an unselected kernel absent', () => {
    const report = runtimeFailureReport(
      attempt({ kernel: undefined, issues: ['KERNEL_ERROR'], outcome: { type: 'discarded', code: 'DECODE_FAILED' } }),
    );

    expect(report?.details.tags).not.toHaveProperty('kernel');
    expect(report?.details.contexts?.['tau.runtime']).toEqual({
      operationId: 'op_1',
      issues: ['KERNEL_ERROR'],
      code: 'DECODE_FAILED',
    });
  });

  it.each<RuntimeObservationInput['outcome']>([
    { type: 'succeeded' },
    { type: 'cancelled' },
    { type: 'superseded' },
    { type: 'abandoned', reason: 'closed' },
    { type: 'issue', code: 'KERNEL_ERROR' },
    { type: 'failed', code: 'UNKNOWN' },
  ])('should not report an attempt that ended $type', (outcome) => {
    expect(runtimeFailureReport(attempt({ outcome }))).toBeUndefined();
  });
});

describe('reportRuntimeFailures', () => {
  it('should report each failed attempt the client emits, and stop when unsubscribed', () => {
    const handlers = new Set<(observation: RuntimeObservationInput) => void>();
    const client = {
      on: (_event: 'operation', handler: (observation: RuntimeObservationInput) => void) => {
        handlers.add(handler);
        return () => {
          handlers.delete(handler);
        };
      },
    };
    const emit = (observation: RuntimeObservationInput): void => {
      for (const handler of handlers) {
        handler(observation);
      }
    };

    const stop = reportRuntimeFailures(client);
    emit(attempt({}));
    emit(attempt({ outcome: { type: 'timed-out', phase: 'compute' } }));
    stop();
    emit(attempt({ outcome: { type: 'timed-out', phase: 'compute' } }));

    expect(reportUiError).toHaveBeenCalledOnce();
  });
});
