import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ClientOperationObserver,
  entryFormatOf,
  outcomeOf,
  runtimeTransportOf,
} from '#client/runtime-operation-observer.js';
import { workerOperationFactsSchema } from '#types/runtime-wire-common.schemas.js';
import type { ResourceLimitDetails } from '#types/runtime.types.js';
import type {
  RuntimeLateTerminal,
  RuntimeObservationMode,
  RuntimeOperationObservation,
  WorkerOperationFacts,
} from '#types/runtime-observation.types.js';

const facts: WorkerOperationFacts = { queue: 1, execution: 2, cold: false, reuse: 'none' };

const limit: ResourceLimitDetails = {
  limit: 'host.utility.resident',
  unit: 'By',
  maximum: 1024,
  demand: { kind: 'measured', value: 2048 },
  origin: 'host-option',
};

/**
 * An observer connected to a worker, with one subscriber collecting observations.
 *
 * @param observation - What the worker's `initialize` result advertised.
 * @param sent - The mode the `initialize` call carried.
 * @returns The observer, what it emitted and what it sent.
 */
const connect = (observation: unknown, sent: RuntimeObservationMode = 'facts') => {
  const observer = new ClientOperationObserver('node-worker');
  const seen: RuntimeOperationObservation[] = [];
  const late: RuntimeLateTerminal[] = [];
  const send = vi.fn<(mode: RuntimeObservationMode) => void>();
  observer.onOperation((observed) => seen.push(observed));
  observer.onLate((terminal) => late.push(terminal));
  observer.observe(sent);
  observer.connected({ observation, sent, send });
  return { observer, seen, late, send };
};

const success = { type: 'result', result: { success: true, issues: [] } } as const;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ClientOperationObserver', () => {
  describe('against a worker that predates observation', () => {
    it('should mark every attempt not-observed, send nothing and arm no timer', () => {
      const { observer, seen, send } = connect(undefined);
      expect(observer.workerObservation).toEqual([]);
      expect(observer.observing).toBe(false);
      observer.observe('facts');
      observer.settle(observer.begin({ operation: 'evaluate', operationId: 'op-1' }), success);
      expect(send).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
      expect(seen).toMatchObject([{ operationId: 'op-1', facts: 'not-observed', worker: undefined }]);
    });
  });

  describe('the join', () => {
    it('should join the trailing facts once and never again', () => {
      const { observer, seen } = connect(['facts']);
      observer.settle(observer.begin({ operation: 'render', operationId: 'op-1' }), success);
      expect(seen).toEqual([]);
      observer.receiveFacts('op-1', facts);
      observer.receiveFacts('op-1', facts);
      expect(seen).toMatchObject([{ operationId: 'op-1', facts: 'joined', worker: facts }]);
      // The duplicate waits, bounded, for an attempt that never comes; the one armed sweep drops it unemitted.
      vi.advanceTimersByTime(1000);
      expect(seen).toHaveLength(1);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('should join facts that overtake the settlement', () => {
      const { observer, seen } = connect(['facts']);
      const attempt = observer.begin({ operation: 'export', operationId: 'op-1', format: 'stl' });
      observer.receiveFacts('op-1', { ...facts, plugin: 'converter' });
      observer.settle(attempt, success);
      expect(seen).toMatchObject([{ facts: 'joined', format: 'stl', plugin: 'converter' }]);
    });

    it('should emit missing-timeout after one second and drop the facts that arrive later', () => {
      const { observer, seen } = connect(['facts']);
      observer.settle(observer.begin({ operation: 'evaluate', operationId: 'op-1' }), success);
      vi.advanceTimersByTime(999);
      expect(seen).toEqual([]);
      vi.advanceTimersByTime(1);
      expect(seen).toMatchObject([{ operationId: 'op-1', facts: 'missing-timeout', worker: undefined }]);
      observer.receiveFacts('op-1', facts);
      expect(seen).toHaveLength(1);
    });

    it('should emit missing-worker-gone synchronously when the worker dies between the reply and the facts', () => {
      const { observer, seen } = connect(['facts']);
      observer.settle(observer.begin({ operation: 'evaluate', operationId: 'op-1' }), success);
      observer.workerGone();
      expect(seen).toMatchObject([{ operationId: 'op-1', facts: 'missing-worker-gone' }]);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('should not wait for facts of an attempt that settled without a reply', () => {
      const { observer, seen } = connect(['facts']);
      observer.settle(observer.begin({ operation: 'evaluate', operationId: 'op-1' }), { type: 'superseded' });
      expect(seen).toMatchObject([{ outcome: { type: 'superseded' }, facts: 'none' }]);
    });

    it('should settle each attempt exactly once', () => {
      const { observer, seen } = connect(['facts'], 'off');
      const attempt = observer.begin({ operation: 'describe', operationId: 'op-1' });
      observer.settle(attempt, success);
      observer.settle(attempt, { type: 'closed' });
      expect(seen).toHaveLength(1);
    });

    it('should build nothing when nobody listens', () => {
      const observer = new ClientOperationObserver('in-process');
      expect(observer.begin({ operation: 'evaluate', operationId: 'op-1' })).toBeUndefined();
    });
  });

  describe('the mode', () => {
    it('should send observe only on a change, for the next attempt', () => {
      const { observer, send } = connect(['facts'], 'off');
      const before = observer.begin({ operation: 'evaluate', operationId: 'op-1' });
      observer.observe('facts');
      observer.observe('facts');
      expect(send.mock.calls).toEqual([['facts']]);
      expect(before?.observing).toBe(false);
      expect(observer.begin({ operation: 'evaluate', operationId: 'op-2' })?.observing).toBe(true);
      observer.observe('off');
      expect(send.mock.calls).toEqual([['facts'], ['off']]);
    });
  });

  describe('late terminal replies', () => {
    it('should report a reply that lands after a timed-out attempt, once, within ten minutes', () => {
      const { observer, late } = connect(['facts']);
      observer.settle(observer.begin({ operation: 'evaluate', operationId: 'op-1' }), {
        type: 'deadline',
        phase: 'evaluate',
      });
      vi.advanceTimersByTime(5000);
      observer.terminal('op-1');
      observer.terminal('op-1');
      expect(late).toEqual([{ operationId: 'op-1', operation: 'evaluate', settledAs: 'timed-out', after: 5000 }]);
    });

    it('should report a reply after a cancel under the id the worker named', () => {
      const { observer, late } = connect(['facts']);
      observer.settle(observer.begin({ operation: 'render', operationId: 'render:doc:intent-1' }), {
        type: 'abort-notice',
        code: 'OPERATION_ABORTED',
        phase: 'render',
      });
      observer.rekey('render:doc:intent-1', 'op-9');
      observer.terminal('op-9');
      expect(late).toMatchObject([{ operationId: 'op-9', settledAs: 'cancelled' }]);
    });

    it('should drop a reply that lands after ten minutes, and never report a succeeded attempt', () => {
      const { observer, late } = connect(['facts']);
      observer.settle(observer.begin({ operation: 'evaluate', operationId: 'op-1' }), { type: 'closed' });
      observer.settle(observer.begin({ operation: 'evaluate', operationId: 'op-2' }), success);
      vi.advanceTimersByTime(600_001);
      observer.terminal('op-1');
      observer.terminal('op-2');
      expect(late).toEqual([]);
    });
  });

  describe('faults', () => {
    it('should keep emitting to other subscribers when one throws', () => {
      const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { observer, seen } = connect(['facts'], 'off');
      observer.onOperation(() => {
        throw new Error('subscriber failed');
      });
      expect(() => {
        observer.settle(observer.begin({ operation: 'evaluate', operationId: 'op-1' }), success);
      }).not.toThrow();
      expect(seen).toHaveLength(1);
      quiet.mockRestore();
    });

    it('should reject NaN, Infinity and negative facts on the wire', () => {
      for (const queue of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
        expect(workerOperationFactsSchema.safeParse({ ...facts, queue }).success).toBe(false);
      }
      expect(workerOperationFactsSchema.safeParse({ ...facts, heapBytes: Number.NaN }).success).toBe(false);
      expect(workerOperationFactsSchema.safeParse({ ...facts, heapBytes: 1e15 }).success).toBe(true);
    });
  });
});

describe('outcomeOf', () => {
  it('should carry the limit a supervisor killed the host for', () => {
    const observer = new ClientOperationObserver('utility');
    const seen: RuntimeOperationObservation[] = [];
    observer.onOperation((observed) => seen.push(observed));
    observer.settle(observer.begin({ operation: 'export', operationId: 'op-1' }), {
      type: 'transport-closed',
      close: { cause: 'host-exit', phase: 'session', exitCode: 137, released: true, exceeded: limit },
    });
    expect(seen).toMatchObject([
      {
        outcome: { type: 'terminated', close: 'host-exit', detail: { exitCode: 137, released: true, exceeded: limit } },
        limit,
        transport: 'utility',
      },
    ]);
  });

  it('should read a RESOURCE_LIMIT refusal from its issue details and drop malformed ones', () => {
    const observer = new ClientOperationObserver('in-process');
    const seen: RuntimeOperationObservation[] = [];
    observer.onOperation((observed) => seen.push(observed));
    const refusal = (details: unknown) =>
      ({
        type: 'result',
        result: {
          success: false,
          issues: [{ code: 'RESOURCE_LIMIT', severity: 'error', message: 'too many triangles', details }],
        },
      }) as const;
    observer.settle(observer.begin({ operation: 'export', operationId: 'op-1' }), refusal(limit));
    observer.settle(
      observer.begin({ operation: 'export', operationId: 'op-2' }),
      refusal({ ...limit, maximum: Number.NaN }),
    );
    expect(seen).toMatchObject([
      { outcome: { type: 'issue', code: 'RESOURCE_LIMIT' }, issues: ['RESOURCE_LIMIT'], limit },
      { outcome: { type: 'issue', code: 'RESOURCE_LIMIT' }, limit: undefined },
    ]);
  });

  it('should report a materialisation failure as discarded with a stable code', () => {
    expect(
      outcomeOf({ type: 'materialise-failed', error: Object.assign(new Error('bad glb'), { code: 'GLB_CORRUPT' }) }),
    ).toEqual({
      type: 'discarded',
      code: 'GLB_CORRUPT',
    });
    expect(outcomeOf({ type: 'materialise-failed', error: new Error('no code, with a message') })).toEqual({
      type: 'discarded',
      code: 'UNKNOWN',
    });
  });

  it('should map every client-side settle reason to one outcome', () => {
    expect(outcomeOf({ type: 'abort-notice', code: 'OPERATION_TIMEOUT', phase: 'render' })).toEqual({
      type: 'timed-out',
      phase: 'render',
    });
    expect(outcomeOf({ type: 'closed' })).toEqual({ type: 'abandoned', reason: 'closed' });
    expect(outcomeOf({ type: 'terminated-by-caller' })).toEqual({ type: 'abandoned', reason: 'terminated' });
    expect(outcomeOf({ type: 'rejected', error: 'not an error' })).toEqual({ type: 'failed', code: 'UNKNOWN' });
  });
});

describe('runtimeTransportOf', () => {
  it('should name the utility and websocket transports', () => {
    expect(runtimeTransportOf('electron-utility')).toBe('utility');
    expect(runtimeTransportOf('cross-process')).toBe('utility');
    expect(runtimeTransportOf('remote')).toBe('websocket');
    expect(runtimeTransportOf('web-worker')).toBe('web-worker');
  });
});

describe('entryFormatOf', () => {
  it('should pick the longest registered extension', () => {
    expect(entryFormatOf('Model.Kicad_Sch', ['sch', 'kicad_sch', '*'])).toBe('kicad_sch');
    expect(entryFormatOf('model.scad', ['ts'])).toBeUndefined();
  });
});
