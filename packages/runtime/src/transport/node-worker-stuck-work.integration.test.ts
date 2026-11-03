// @vitest-environment node
/**
 * T23: stuck or late work against independent logs, over a real Node worker thread.
 *
 * The client's record is what `client.on('operation')` emits. The worker's record is what the worker posts on its
 * own port (see `node-worker-stuck-work.fixture.ts`): every span its collector is handed and every cancel
 * its kernel sees. Neither travels the runtime wire, so neither can vouch for the other.
 */
import { MessageChannel, Worker as NodeWorker } from 'node:worker_threads';
import type { MessagePort, WorkerOptions } from 'node:worker_threads';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkerRecord } from '#transport/node-worker-stuck-work.fixture.js';
import { createRuntimeClient } from '#client/runtime-document-client-core.js';
import { isRuntimeTerminatedError } from '#client/runtime-terminated-error.js';
import { fromMemoryFs } from '#filesystem/runtime-filesystem.js';
import { isOperationTimeoutError } from '#framework/runtime-operation-errors.js';
import { nodeWorkerTransport } from '#transport/node-worker-transport.js';
import type { RuntimeLateTerminal, RuntimeOperationObservation } from '#types/runtime-observation.types.js';
import { abortReason } from '#types/runtime-wire.types.js';

/** Milliseconds before the client gives up on an operation. */
const deadline = 300;

const opened: Array<{ shutdown: () => Promise<void> }> = [];
const ports: MessagePort[] = [];

/**
 * A client over a real worker thread, its own record, and the worker's.
 *
 * @returns The client, the client's record and the worker's record.
 */
const connect = () => {
  const worker: WorkerRecord[] = [];
  const { port1, port2 } = new MessageChannel();
  port1.on('message', (line: WorkerRecord) => {
    worker.push(line);
  });
  port1.unref();
  ports.push(port1);
  /** Runs the `.ts` fixture entry under tsx, handing it the port it keeps its own record on. */
  class RecordingWorker extends NodeWorker {
    public constructor(url: string | URL, options?: WorkerOptions) {
      const workerData: unknown = options?.workerData;
      super(url, {
        ...options,
        execArgv: ['--import', 'tsx'],
        workerData: { ...(typeof workerData === 'object' ? workerData : {}), record: port2 },
        transferList: [...(options?.transferList ?? []), port2],
      });
    }
  }
  const client = createRuntimeClient({
    transport: nodeWorkerTransport({
      url: new URL('node-worker-stuck-work.fixture.ts', import.meta.url),
      workerCtor: RecordingWorker,
      fileSystem: fromMemoryFs({}),
    }),
    operationTimeout: deadline,
  });
  opened.push(client);
  const observations: RuntimeOperationObservation[] = [];
  const late: RuntimeLateTerminal[] = [];
  client.on('operation', (observation) => observations.push(observation));
  client.on('operation-late', (terminal) => late.push(terminal));
  client.observe('facts');
  return { client, observations, late, worker };
};

const spansOf = (worker: readonly WorkerRecord[]) =>
  worker.flatMap((line) => (line.kind === 'span' ? [line.entry] : []));

const rootsOf = (worker: readonly WorkerRecord[], name: string) =>
  spansOf(worker).filter((entry) => entry.name === name && entry.detail?.['parentSpanId'] === undefined);

const byOperation = (seen: readonly RuntimeOperationObservation[], operation: string) =>
  seen.filter((observation) => observation.operation === operation);

/**
 * What a promise rejected with.
 *
 * @param promise - The promise.
 * @returns Its rejection, or `undefined` when it resolved.
 */
const rejectionOf = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error;
  }
};

/** Any rejection or exception that escapes to the process while a test runs. */
const escapes = () => {
  const seen: unknown[] = [];
  const keep = (error: unknown): void => {
    seen.push(error);
  };
  process.on('unhandledRejection', keep);
  process.on('uncaughtException', keep);
  return {
    seen,
    stop: () => {
      process.off('unhandledRejection', keep);
      process.off('uncaughtException', keep);
    },
  };
};

afterEach(async () => {
  await Promise.all(opened.splice(0).map(async (client) => client.shutdown()));
  for (const port of ports.splice(0)) {
    port.close();
  }
});

describe('T23: stuck or late work against independent logs', () => {
  it('T23: should time out a describe on a worker that never replies, and abandon the worker', async () => {
    const { client, observations, late, worker } = connect();
    await client.connect();
    await vi.waitFor(() => {
      expect(rootsOf(worker, 'kernel.bootstrap')).toHaveLength(1);
    });

    const started = performance.now();
    const error = await rejectionOf(client.describe({ source: { files: { 'spin.circuit': 'x' } } }));
    const waited = performance.now() - started;
    expect(isOperationTimeoutError(error)).toBe(true);
    expect(waited).toBeGreaterThanOrEqual(deadline - 5);
    expect(waited).toBeLessThan(deadline + 2000);

    // The client's record: one describe, timed out in its own phase, with no facts to wait for.
    await vi.waitFor(() => {
      expect(byOperation(observations, 'describe')).toHaveLength(1);
    });
    const [described] = byOperation(observations, 'describe');
    expect(described).toMatchObject({ outcome: { type: 'timed-out', phase: 'describe' }, facts: 'none' });
    // The worker is abandoned once the recovery grace passes without a reply.
    await vi.waitFor(
      () => {
        expect(client.lifecycleState).toBe('terminated');
      },
      { timeout: 5000 },
    );
    const after = await rejectionOf(client.describe({ source: { files: { 'ok.circuit': 'x' } } }));
    expect(isRuntimeTerminatedError(after)).toBe(true);
    expect(after).toMatchObject({ causeKind: 'operation-timeout' });

    // The worker's record: it entered the describe and never ended it, so no span claims the operation settled.
    expect(worker).toContainEqual({ kind: 'entered', operation: 'describe' });
    expect(rootsOf(worker, 'kernel.describe')).toEqual([]);
    expect(spansOf(worker).some((entry) => entry.detail?.['operation.id'] === described!.operationId)).toBe(false);
    expect(late).toEqual([]);
  }, 15_000);

  it('T23: should agree that an export whose worker never acknowledges the cancel timed out and never settled', async () => {
    const { client, observations, late, worker } = connect();
    const document = client.open({ source: { files: { 'model.circuit': 'x' } }, watch: false });
    await expect(document.evaluation()).resolves.toMatchObject({ evaluation: { success: true } });

    const error = await rejectionOf(document.export('bom'));
    expect(isOperationTimeoutError(error)).toBe(true);

    // The client's record: the export timed out in its export phase.
    await vi.waitFor(() => {
      expect(byOperation(observations, 'export')).toHaveLength(1);
    });
    const [exported] = byOperation(observations, 'export');
    expect(exported).toMatchObject({ outcome: { type: 'timed-out', phase: 'export' }, facts: 'none' });

    // The worker's record: it saw the cancel as a timeout, and never acknowledged it.
    await vi.waitFor(() => {
      expect(worker).toContainEqual({ kind: 'abort-seen', operation: 'export', reason: abortReason.timeout });
    });
    // No acknowledgement within the grace: the client abandons the worker rather than wait on it.
    await vi.waitFor(
      () => {
        expect(client.lifecycleState).toBe('terminated');
      },
      { timeout: 5000 },
    );
    expect(rootsOf(worker, 'kernel.export')).toEqual([]);
    expect(spansOf(worker).some((entry) => entry.detail?.['operation.id'] === exported!.operationId)).toBe(false);
    // Nothing replied, so nothing is late: the closed channel is not a reply. And the evaluation it ran against stays a success on both sides.
    expect(late).toEqual([]);
    expect(byOperation(observations, 'export')).toHaveLength(1);
    const [evaluated] = byOperation(observations, 'evaluate');
    expect(evaluated?.outcome).toEqual({ type: 'succeeded' });
    expect(rootsOf(worker, 'kernel.evaluate').map(({ detail }) => detail?.['operation.outcome'])).toEqual([
      'succeeded',
    ]);
  }, 15_000);

  it('T23: should fire a deadline with no waiter attached and record it the same on both sides', async () => {
    const escaped = escapes();
    try {
      const { client, observations, late, worker } = connect();
      // Nobody awaits the evaluation: the deadline is armed by the open alone.
      const document = client.open({ source: { files: { 'slow.circuit': 'x' } }, watch: false });
      const statuses: string[] = [];
      document.on('status', (status) => statuses.push(status));

      await vi.waitFor(
        () => {
          expect(byOperation(observations, 'evaluate')).toHaveLength(1);
        },
        { timeout: 10_000 },
      );
      const [evaluated] = byOperation(observations, 'evaluate');
      expect(evaluated).toMatchObject({ outcome: { type: 'timed-out', phase: 'evaluate' }, facts: 'none' });
      expect(statuses.at(-1)).toBe('error');
      // A waiter that arrives after the deadline is told it timed out.
      const error = await rejectionOf(document.evaluation());
      expect(isOperationTimeoutError(error)).toBe(true);

      // The worker's record: it saw the cancel as a timeout, honoured it, and ended the root timed out under the
      // same operation id the client settled.
      await vi.waitFor(() => {
        expect(worker).toContainEqual({ kind: 'abort-seen', operation: 'evaluate', reason: abortReason.timeout });
        expect(rootsOf(worker, 'kernel.evaluate')).toHaveLength(1);
      });
      const [root] = rootsOf(worker, 'kernel.evaluate');
      expect(root?.detail).toMatchObject({ 'operation.id': evaluated!.operationId, 'operation.outcome': 'timed-out' });
      // The worker acknowledged in time, so it is kept and serves the next operation.
      await expect(client.describe({ source: { files: { 'ok.circuit': 'x' } } })).resolves.toMatchObject({
        success: true,
      });
      expect(client.lifecycleState).toBe('connected');
      // Its acknowledgement is the worker's terminal notice, landing after the client settled: reported once, as late,
      // under the id both records share.
      expect(late).toEqual([
        expect.objectContaining({ operationId: evaluated!.operationId, operation: 'evaluate', settledAs: 'timed-out' }),
      ]);
      document.close();
    } finally {
      escaped.stop();
    }
    expect(escaped.seen).toEqual([]);
  }, 15_000);
});
