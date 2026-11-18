// @vitest-environment node
/**
 * T04: a killed or crashed node worker, its observation, and the next operation.
 *
 * A real `worker_threads` worker runs the stuck-work fixture. The test kills it from outside (`worker.terminate()`,
 * as a host's supervisor does) or lets its kernel crash it from inside (`process.exit(70)`), mid-evaluation. The
 * client must settle the attempt as `terminated` with the host-exit facts the worker actually ended with, refuse
 * later calls on the dead client, and a replacement client from the same transport (what a host does on
 * `lifecycleState === 'terminated'`: `createIdleRuntimeClient` in the UI, `keyedResource` in `@taucad/host`) must
 * serve the next operation and observe it as `succeeded` with joined worker facts.
 *
 * The worker's own record (see `node-worker-stuck-work.fixture.ts`) travels on a separate port, so the test can
 * check that each client's attempts ran on a fresh worker without trusting the client's account of it.
 */
import { MessageChannel, Worker as NodeWorker } from 'node:worker_threads';
import type { MessagePort, WorkerOptions } from 'node:worker_threads';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkerRecord } from '#transport/node-worker-stuck-work.fixture.js';
import { createRuntimeClient } from '#client/runtime-document-client-core.js';
import { isRuntimeTerminatedError } from '#client/runtime-terminated-error.js';
import { fromMemoryFs } from '#filesystem/runtime-filesystem.js';
import { nodeWorkerTransport } from '#transport/node-worker-transport.js';
import type { RuntimeOperationObservation } from '#types/runtime-observation.types.js';

/** The exit code the fixture's `crash.circuit` evaluation ends its thread with. */
const crashExitCode = 70;
/** The exit code Node reports for a worker stopped by `worker.terminate()`. */
const terminatedExitCode = 1;

const opened: Array<{ shutdown: () => Promise<void> }> = [];
const ports: MessagePort[] = [];

/**
 * A client over a fresh real worker thread, with the client's record, the worker's record and the worker itself.
 *
 * @returns The client, both records, and the started worker thread.
 */
const connect = () => {
  const worker: WorkerRecord[] = [];
  const threads: NodeWorker[] = [];
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
      threads.push(this);
    }
  }
  const client = createRuntimeClient({
    transport: nodeWorkerTransport({
      url: new URL('node-worker-stuck-work.fixture.ts', import.meta.url),
      workerCtor: RecordingWorker,
      fileSystem: fromMemoryFs({}),
    }),
  });
  opened.push(client);
  const observations: RuntimeOperationObservation[] = [];
  client.on('operation', (observation) => observations.push(observation));
  client.observe('facts');
  return { client, observations, worker, threads };
};

const byOperation = (seen: readonly RuntimeOperationObservation[], operation: string) =>
  seen.filter((observation) => observation.operation === operation);

const rootsOf = (worker: readonly WorkerRecord[], name: string) =>
  worker.flatMap((line) =>
    line.kind === 'span' && line.entry.name === name && line.entry.detail?.['parentSpanId'] === undefined
      ? [line.entry]
      : [],
  );

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

/**
 * Open `entry`, wait until the worker has entered its evaluation, and return the pending evaluation.
 *
 * @param connection - The connection to open the document on.
 * @param entry - The entry file name.
 * @returns The document and its pending evaluation.
 */
const evaluateUntilEntered = async (connection: ReturnType<typeof connect>, entry: string) => {
  const document = connection.client.open({ source: { files: { [entry]: 'x' } }, watch: false });
  const evaluation = rejectionOf(document.evaluation());
  // A cold worker under a loaded runner can take seconds to boot.
  await vi.waitFor(
    () => {
      expect(connection.worker).toContainEqual({ kind: 'entered', operation: 'evaluate' });
    },
    { timeout: 10_000 },
  );
  return { document, evaluation };
};

/**
 * The host's recovery: a terminated client is replaced by a new one from the same transport, which serves the next
 * operation. Asserts the next evaluation succeeds and is observed as such on a worker that booted afresh.
 *
 * @param dead - The terminated connection.
 */
const expectReplacementServes = async (dead: ReturnType<typeof connect>): Promise<void> => {
  expect(dead.client.lifecycleState).toBe('terminated');
  const next = connect();
  const document = next.client.open({ source: { files: { 'model.circuit': 'x' } }, watch: false });
  await expect(document.evaluation()).resolves.toMatchObject({ superseded: false, evaluation: { success: true } });
  await vi.waitFor(
    () => {
      expect(byOperation(next.observations, 'evaluate')).toHaveLength(1);
      expect(byOperation(next.observations, 'evaluate')[0]?.facts).toBe('joined');
    },
    { timeout: 5000 },
  );
  const [evaluated] = byOperation(next.observations, 'evaluate');
  expect(evaluated).toMatchObject({
    outcome: { type: 'succeeded' },
    transport: 'node-worker',
    kernel: 'stuck-kernel',
    facts: 'joined',
    worker: { cold: true, realm: 'node-worker' },
  });
  // The replacement's own worker booted and ended the evaluation under the id its client settled.
  expect(rootsOf(next.worker, 'kernel.bootstrap')).toHaveLength(1);
  expect(rootsOf(next.worker, 'kernel.evaluate').map(({ detail }) => detail)).toEqual([
    expect.objectContaining({ 'operation.id': evaluated!.operationId, 'operation.outcome': 'succeeded' }),
  ]);
  // The dead client's record gained nothing from the replacement's work.
  expect(byOperation(dead.observations, 'evaluate')).toHaveLength(1);
  document.close();
};

afterEach(async () => {
  await Promise.all(opened.splice(0).map(async (client) => client.shutdown()));
  for (const port of ports.splice(0)) {
    port.close();
  }
});

describe('T04: a killed or crashed node worker, and the operation after it', () => {
  it('T04: should record a worker killed mid-evaluation as terminated by host exit, and serve the next operation', async () => {
    const dead = connect();
    const { document, evaluation } = await evaluateUntilEntered(dead, 'slow.circuit');
    const [thread] = dead.threads;
    expect(dead.threads).toHaveLength(1);

    // Killed from outside, as a supervisor kills a worker over its memory or deadline budget.
    await thread!.terminate();

    const error = await evaluation;
    expect(isRuntimeTerminatedError(error)).toBe(true);
    expect(error).toMatchObject({
      causeKind: 'transport-closed',
      detail: { phase: 'session', exitCode: terminatedExitCode },
    });
    await vi.waitFor(
      () => {
        expect(byOperation(dead.observations, 'evaluate')).toHaveLength(1);
      },
      { timeout: 5000 },
    );
    const [evaluated] = byOperation(dead.observations, 'evaluate');
    // The exit the worker really ended with, in the session phase; no memory limit is invented for an unmeasured kill.
    expect(evaluated).toMatchObject({
      outcome: {
        type: 'terminated',
        close: 'host-exit',
        detail: { phase: 'session', exitCode: terminatedExitCode },
      },
      transport: 'node-worker',
      limit: undefined,
      facts: 'none',
    });
    expect(evaluated!.outcome).not.toHaveProperty('detail.exceeded');
    // The worker's record: it entered the evaluation and never ended it.
    expect(rootsOf(dead.worker, 'kernel.evaluate')).toEqual([]);
    // The dead client refuses later work with the same cause, rather than hanging on a gone worker.
    await expect(dead.client.describe({ source: { files: { 'ok.circuit': 'x' } } })).rejects.toMatchObject({
      code: 'RUNTIME_TERMINATED',
      causeKind: 'transport-closed',
      detail: { exitCode: terminatedExitCode },
    });
    document.close();

    await expectReplacementServes(dead);
  }, 20_000);

  it('T04: should record a worker that crashed itself with its own exit code, and serve the next operation', async () => {
    const dead = connect();
    const { document, evaluation } = await evaluateUntilEntered(dead, 'crash.circuit');

    const error = await evaluation;
    expect(isRuntimeTerminatedError(error)).toBe(true);
    expect(error).toMatchObject({
      causeKind: 'transport-closed',
      detail: { phase: 'session', exitCode: crashExitCode },
    });
    await vi.waitFor(
      () => {
        expect(byOperation(dead.observations, 'evaluate')).toHaveLength(1);
      },
      { timeout: 5000 },
    );
    const [evaluated] = byOperation(dead.observations, 'evaluate');
    expect(evaluated).toMatchObject({
      outcome: { type: 'terminated', close: 'host-exit', detail: { phase: 'session', exitCode: crashExitCode } },
      limit: undefined,
      facts: 'none',
    });
    // The client's own kill path never ran: the code is the worker's, not the terminate default.
    expect(dead.threads).toHaveLength(1);
    expect(rootsOf(dead.worker, 'kernel.evaluate')).toEqual([]);
    document.close();

    await expectReplacementServes(dead);
  }, 20_000);
});
