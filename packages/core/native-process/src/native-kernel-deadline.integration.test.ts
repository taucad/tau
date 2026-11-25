// @vitest-environment node
/* oxlint-disable no-await-in-loop -- polls a child's own log until it shows what the test waits for. */
/**
 * T23: a native child-process kernel that stops responding and ignores its cancel, against independent logs.
 *
 * A real runtime client drives a real `worker_threads` worker (`native-kernel-deadline.fixture.ts`) whose kernel
 * evaluates by one request to a real native child process through `NativeProcessSession`. The child never answers a
 * `stuck` request, never acknowledges `cancel`, and ignores SIGTERM. Three records are compared, each kept apart from
 * the others: the client's observations, the kernel's own record on a side port, and the child's own log file.
 *
 * The native-process unit tests stop at the session; these follow the deadline through the runtime: the client's
 * `timed-out` observation, the session's kill fallback ending the child, and the host serving the next operation,
 * either on the same worker (the kill fallback acknowledged in time) or on a replacement client (the worker was
 * abandoned).
 */
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel, Worker as NodeWorker } from 'node:worker_threads';
import type { MessagePort, WorkerOptions } from 'node:worker_threads';
import { createRuntimeClient } from '@taucad/runtime';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { nodeWorkerTransport } from '@taucad/runtime/transport/node';
import type { RuntimeLateTerminal, RuntimeOperationObservation } from '@taucad/runtime/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { KernelRecord, NativeKernelWorkerData } from '#native-kernel-deadline.fixture.js';

/** The client's deadline. Milliseconds. The client abandons a worker that has not acknowledged 1000 ms after it. */
const deadline = 2000;
/** The session's kill fallback that lands inside the client's recovery grace: after the deadline, before the grace ends. */
const killFallback = 2500;
/** `abortReason.timeout` on the runtime wire: the cancel the kernel sees is the client's deadline. */
const timeoutReason = 2;

/** The native child: answers `ok`, never answers `stuck`, logs and ignores `cancel` and SIGTERM. */
const childSource = `
const fs = require('node:fs');
const log = process.argv[2];
const write = (event) => fs.appendFileSync(log, JSON.stringify({ ...event, pid: process.pid }) + '\\n');
process.on('SIGTERM', () => write({ event: 'sigterm' }));
write({ event: 'ready' });
process.stdout.write(JSON.stringify({ protocolVersion: 1, type: 'ready' }) + '\\n');
require('node:readline').createInterface({ input: process.stdin }).on('line', (line) => {
  const frame = JSON.parse(line);
  if (frame.method === 'cancel') {
    write({ event: 'cancel', requestId: frame.requestId });
    return;
  }
  write({ event: 'work', requestId: frame.requestId, mode: frame.params.mode });
  if (frame.params.mode === 'ok') {
    process.stdout.write(JSON.stringify({ protocolVersion: 1, requestId: frame.requestId, result: { ok: true } }) + '\\n');
  }
});
setInterval(() => {}, 1000);
`;

type ChildLine = Readonly<{ event: string; pid: number; requestId?: string; mode?: string }>;

const roots: string[] = [];
const logs: string[] = [];
const opened: Array<{ shutdown: () => Promise<void> }> = [];
const ports: MessagePort[] = [];

/**
 * The child's own log, as written so far.
 *
 * @param logPath - The log file.
 * @returns Its lines.
 */
const childLog = (logPath: string): ChildLine[] =>
  existsSync(logPath)
    ? readFileSync(logPath, 'utf8')
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as ChildLine)
    : [];

/**
 * Whether a process is still running.
 *
 * @param pid - The process id.
 * @returns Whether a signal can reach it.
 */
const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/**
 * A client over a fresh worker whose native session kills a request after `requestTimeout` milliseconds.
 *
 * @param requestTimeout - The session's kill fallback; zero waits forever.
 * @returns The client, its observations and late replies, the kernel's record and the child's log path.
 */
const connect = (requestTimeout: number) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'tau-native-deadline-')));
  roots.push(root);
  const childPath = join(root, 'child.cjs');
  const logPath = join(root, 'child.log');
  const workspacePath = join(root, 'workspace');
  const artifactPath = join(root, 'artifacts');
  mkdirSync(workspacePath);
  mkdirSync(artifactPath);
  writeFileSync(childPath, childSource);
  logs.push(logPath);
  const kernel: KernelRecord[] = [];
  const { port1, port2 } = new MessageChannel();
  port1.on('message', (line: KernelRecord) => {
    kernel.push(line);
  });
  port1.unref();
  ports.push(port1);
  const data: NativeKernelWorkerData = {
    childPath,
    logPath,
    workspacePath,
    artifactPath,
    requestTimeout,
    record: port2,
  };
  /** Runs the `.ts` fixture entry under tsx with its native child's paths and the kernel's record port. */
  class FixtureWorker extends NodeWorker {
    public constructor(url: string | URL, options?: WorkerOptions) {
      super(url, { ...options, execArgv: ['--import', 'tsx'], workerData: data, transferList: [port2] });
    }
  }
  const client = createRuntimeClient({
    transport: nodeWorkerTransport({
      url: new URL('native-kernel-deadline.fixture.ts', import.meta.url),
      workerCtor: FixtureWorker,
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
  return { client, observations, late, kernel, logPath };
};

const evaluations = (seen: readonly RuntimeOperationObservation[]) =>
  seen.filter((observation) => observation.operation === 'evaluate');

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
 * Warm the worker and its native child with one answered evaluation, then evaluate a stuck entry past the client's
 * deadline, and return the timed-out attempt's observation.
 *
 * @param connection - The connection.
 * @returns The observation, the document and the child that took the request.
 */
const timeOut = async (connection: ReturnType<typeof connect>) => {
  // Warm: the stuck request then reaches a running child at once, well inside the deadline.
  await connection.client.connect();
  const warm = connection.client.open({ source: { files: { 'warm.native': 'x' } }, watch: false });
  await expect(warm.evaluation()).resolves.toMatchObject({ evaluation: { success: true } });
  warm.close();
  const document = connection.client.open({ source: { files: { 'stuck.native': 'x' } }, watch: false });
  const error = await rejectionOf(document.evaluation());
  expect(error).toMatchObject({ name: 'OperationTimeoutError', code: 'RUNTIME_OPERATION_TIMEOUT', phase: 'evaluate' });
  await vi.waitFor(
    () => {
      expect(evaluations(connection.observations)).toHaveLength(2);
    },
    { timeout: 10_000 },
  );
  const [warmed, observed] = evaluations(connection.observations);
  expect(warmed?.outcome).toEqual({ type: 'succeeded' });
  // The client's record: the attempt timed out in its own phase, with no worker facts to wait for.
  expect(observed).toMatchObject({
    outcome: { type: 'timed-out', phase: 'evaluate' },
    transport: 'node-worker',
    facts: 'none',
    limit: undefined,
  });
  // The kernel's record: it entered the native call and saw the client's deadline as its cancel.
  await vi.waitFor(
    () => {
      expect(connection.kernel).toContainEqual({ kind: 'abort-seen', reason: timeoutReason });
    },
    { timeout: 10_000 },
  );
  expect(connection.kernel).toEqual([
    { kind: 'entered', mode: 'ok' },
    { kind: 'settled', mode: 'ok', result: 'resolved', generation: 1 },
    { kind: 'entered', mode: 'stuck' },
    { kind: 'abort-seen', reason: timeoutReason },
  ]);
  // The child's record: one child took the warm request, then the stuck one and its cancel, and answered neither.
  await vi.waitFor(
    () => {
      expect(
        childLog(connection.logPath)
          .slice(0, 4)
          .map(({ event }) => event),
      ).toEqual(['ready', 'work', 'work', 'cancel']);
    },
    { timeout: 10_000 },
  );
  const [ready, , work, cancel] = childLog(connection.logPath);
  expect(work).toMatchObject({ mode: 'stuck', pid: ready!.pid });
  expect(cancel).toMatchObject({ requestId: work!.requestId, pid: ready!.pid });
  return { observed: observed!, document, pid: ready!.pid };
};

/**
 * The next evaluation on `connection` succeeds, is observed as such, and ran on a native child that started afresh.
 *
 * @param connection - The connection that serves it.
 * @param stalePid - The child that took the stuck request, if this connection's session started one.
 */
const expectNextServed = async (connection: ReturnType<typeof connect>, stalePid?: number): Promise<void> => {
  const before = evaluations(connection.observations).length;
  const document = connection.client.open({ source: { files: { 'ok.native': 'x' } }, watch: false });
  await expect(document.evaluation()).resolves.toMatchObject({ superseded: false, evaluation: { success: true } });
  await vi.waitFor(
    () => {
      expect(evaluations(connection.observations)).toHaveLength(before + 1);
      expect(evaluations(connection.observations).at(-1)?.facts).toBe('joined');
    },
    { timeout: 10_000 },
  );
  expect(evaluations(connection.observations).at(-1)).toMatchObject({
    outcome: { type: 'succeeded' },
    kernel: 'native-kernel',
    worker: { realm: 'node-worker' },
  });
  expect(connection.kernel.at(-1)).toMatchObject({ kind: 'settled', mode: 'ok', result: 'resolved' });
  const served = childLog(connection.logPath).findLast(({ event, mode }) => event === 'work' && mode === 'ok');
  expect(isAlive(served!.pid)).toBe(true);
  if (stalePid !== undefined) {
    expect(served!.pid).not.toBe(stalePid);
  }
  document.close();
};

afterEach(async () => {
  await Promise.all(opened.splice(0).map(async (client) => client.shutdown()));
  for (const port of ports.splice(0)) {
    port.close();
  }
  // A child the runtime left running must not outlive its test.
  for (const pid of new Set(logs.splice(0).flatMap((logPath) => childLog(logPath).map((line) => line.pid)))) {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      /* Already gone. */
    }
  }
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('T23: a native kernel that stops responding and ignores its cancel', () => {
  it('T23: should time out, kill the native child through the session fallback, and serve the next operation on the same worker', async () => {
    // The session's kill fallback lands inside the client's recovery grace, so the worker acknowledges in time.
    const connection = connect(killFallback);
    const { observed, document, pid } = await timeOut(connection);

    // The kill fallback ended the native request, and the kernel saw it end in the first generation.
    await vi.waitFor(
      () => {
        expect(connection.kernel).toContainEqual({ kind: 'settled', mode: 'stuck', result: 'rejected', generation: 1 });
      },
      { timeout: 10_000 },
    );
    // The child ignored SIGTERM (it logged it) and was then killed: it is gone, with no reply ever written.
    await vi.waitFor(
      () => {
        expect(childLog(connection.logPath).map(({ event }) => event)).toEqual([
          'ready',
          'work',
          'work',
          'cancel',
          'sigterm',
        ]);
        expect(isAlive(pid)).toBe(false);
      },
      { timeout: 5000 },
    );
    // The worker's late terminal is reported once, under the attempt's id, as a timed-out attempt: not a success.
    await vi.waitFor(
      () => {
        expect(connection.late).toEqual([
          expect.objectContaining({ operationId: observed.operationId, operation: 'evaluate', settledAs: 'timed-out' }),
        ]);
      },
      { timeout: 10_000 },
    );
    expect(evaluations(connection.observations)).toHaveLength(2);
    expect(connection.client.lifecycleState).toBe('connected');
    document.close();

    // The host recovered without a restart: the same client and worker, a fresh native child.
    await expectNextServed(connection, pid);
    expect(connection.kernel.at(-1)).toMatchObject({ generation: 2 });
    expect(connection.client.lifecycleState).toBe('connected');
  }, 30_000);

  it('T23: should abandon a worker whose native call never acknowledges, and serve the next operation on a replacement', async () => {
    // No session kill fallback: the native call outlives the client's recovery grace.
    const connection = connect(0);
    const { document } = await timeOut(connection);

    // The client abandons the worker instead of waiting on it, and says why on every later call.
    await vi.waitFor(
      () => {
        expect(connection.client.lifecycleState).toBe('terminated');
      },
      { timeout: 5000 },
    );
    await expect(connection.client.describe({ source: { files: { 'ok.native': 'x' } } })).rejects.toMatchObject({
      code: 'RUNTIME_TERMINATED',
      causeKind: 'operation-timeout',
    });
    // Nothing replied: no late terminal, no second observation, and the kernel never saw its native call settle.
    expect(connection.late).toEqual([]);
    expect(evaluations(connection.observations)).toHaveLength(2);
    expect(connection.kernel.filter((line) => line.kind === 'settled' && line.mode === 'stuck')).toEqual([]);
    document.close();

    // The host's recovery: a replacement client, as a host makes on `lifecycleState === 'terminated'`.
    const replacement = connect(0);
    await expectNextServed(replacement);
    expect(evaluations(replacement.observations)).toHaveLength(1);
  }, 30_000);
});
