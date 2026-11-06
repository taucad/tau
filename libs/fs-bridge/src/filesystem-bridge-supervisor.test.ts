/**
 * Compute-worker supervision (charter D14, W10) against a real
 * `worker_threads` worker: a death fails the calls in flight typed, restarts
 * the worker and reports `compute-restarted`; a hung call is stopped at its
 * deadline; a worker that keeps dying is given up on.
 */
import { Worker } from 'node:worker_threads';
import { afterEach, describe, expect, it } from 'vitest';
import { superviseWorker } from '#filesystem-bridge-supervisor.js';
import { createFileSystemBridgePort, createFileSystemBridgeProxy } from '#filesystem-bridge.js';
import type { FileSystemBridgeEvent } from '#filesystem-bridge-protocol.js';
import { rootedWorkspaceHandlers } from '#filesystem-bridge-rooted.test-fixture.js';
import type { ComputeRestartedEvent, SupervisedWorker, WorkerSupervisor } from '#filesystem-bridge-supervisor.js';

type TestCompute = {
  echo(value: string): Promise<string>;
  sleep(milliseconds: number): Promise<string>;
  hang(): Promise<never>;
  crash(): Promise<never>;
};

const spawn = (): SupervisedWorker<Worker> => {
  const worker = new Worker(new URL('filesystem-bridge-supervisor.test-worker.ts', import.meta.url));
  return {
    connection: worker,
    terminate() {
      void worker.terminate();
    },
    onDeath(listener) {
      worker.once('exit', listener);
    },
  };
};

/** The test worker's contract over its thread: one id per request, one answer per id. */
const connect = (worker: Worker): TestCompute => {
  let next = 0;
  const waiting = new Map<number, (value: unknown) => void>();
  worker.on('message', ({ id, result }: { id: number; result: unknown }) => {
    waiting.get(id)?.(result);
    waiting.delete(id);
  });
  const ask =
    (method: string) =>
    async (...args: unknown[]): Promise<never> =>
      new Promise((resolve) => {
        const id = next;
        next += 1;
        waiting.set(id, resolve as (value: unknown) => void);
        worker.postMessage({ id, method, args });
      });
  return { echo: ask('echo'), sleep: ask('sleep'), hang: ask('hang'), crash: ask('crash') };
};

const supervisors: Array<WorkerSupervisor<TestCompute>> = [];

afterEach(() => {
  for (const supervisor of supervisors.splice(0)) {
    supervisor.dispose();
  }
});

const supervised = (options: { maxRestarts?: number; callTimeout?: number } = {}) => {
  const supervisor = superviseWorker({ spawn, connect, ...options });
  supervisors.push(supervisor);
  const events: ComputeRestartedEvent[] = [];
  supervisor.subscribe((event) => events.push(event));
  return { supervisor, events };
};

describe('compute worker supervision', () => {
  it('answers calls on the worker it started', async () => {
    const { supervisor, events } = supervised();
    await expect(supervisor.api.echo('one')).resolves.toBe('one');
    expect(supervisor.restarts).toBe(0);
    expect(events).toEqual([]);
  });

  it('fails every call in flight typed when the worker dies, reports them, and serves the next call on a new worker', async () => {
    const { supervisor, events } = supervised();
    const slow = supervisor.api.sleep(10_000);
    const crash = supervisor.api.crash();
    await expect(slow).rejects.toMatchObject({ code: 'COMPUTE_RESTARTED' });
    await expect(crash).rejects.toMatchObject({ code: 'COMPUTE_RESTARTED' });
    expect(events).toEqual([{ kind: 'compute-restarted', failed: [0, 1] }]);
    expect(supervisor.restarts).toBe(1);
    await expect(supervisor.api.echo('after')).resolves.toBe('after');
  });

  it('stops a call that overruns its deadline with ETIMEDOUT and restarts the hung worker', async () => {
    const { supervisor, events } = supervised({ callTimeout: 300 });
    const hung = supervisor.api.hang();
    const queued = supervisor.api.echo('queued behind the hang');
    await expect(hung).rejects.toMatchObject({ code: 'ETIMEDOUT' });
    await expect(queued).rejects.toMatchObject({ code: 'COMPUTE_RESTARTED' });
    expect(events).toEqual([{ kind: 'compute-restarted', failed: [0, 1] }]);
    await expect(supervisor.api.echo('fresh')).resolves.toBe('fresh');
  });

  it('gives up on a worker that keeps dying, and says so on every later call', async () => {
    const { supervisor, events } = supervised({ maxRestarts: 1 });
    await expect(supervisor.api.crash()).rejects.toMatchObject({ code: 'COMPUTE_RESTARTED' });
    await expect(supervisor.api.crash()).rejects.toMatchObject({ code: 'COMPUTE_RESTARTED' });
    expect(events).toHaveLength(2);
    expect(supervisor.restarts).toBe(1);
    await expect(supervisor.api.echo('no')).rejects.toMatchObject({ code: 'COMPUTE_UNAVAILABLE' });
  });

  it('restarts on request and stops for good on dispose', async () => {
    const { supervisor, events } = supervised();
    const slow = supervisor.api.sleep(10_000);
    supervisor.restart(new Error('the host saw it wedge'));
    await expect(slow).rejects.toMatchObject({ code: 'COMPUTE_RESTARTED' });
    expect(events).toEqual([{ kind: 'compute-restarted', failed: [0] }]);
    const pending = supervisor.api.sleep(10_000);
    supervisor.dispose();
    await expect(pending).rejects.toMatchObject({ code: 'COMPUTE_UNAVAILABLE' });
    await expect(supervisor.api.echo('no')).rejects.toMatchObject({ code: 'COMPUTE_UNAVAILABLE' });
    supervisor.restart();
    expect(supervisor.restarts).toBe(1);
  });

  it('is not a thenable', async () => {
    const { supervisor } = supervised();
    expect((supervisor.api as unknown as { then?: unknown }).then).toBeUndefined();
    expect((supervisor.api as unknown as Record<symbol, unknown>)[Symbol.iterator]).toBeUndefined();
  });

  it("tells a rooted connection's event channel which calls a worker death failed", async () => {
    const { supervisor } = supervised();
    const { service, handlers } = await rootedWorkspaceHandlers({ 'a.ts': 'x' }, 'working-copy');
    const proxy = createFileSystemBridgeProxy(createFileSystemBridgePort(handlers, { computeEvents: supervisor }));
    try {
      await proxy.ready;
      const heard: FileSystemBridgeEvent[] = [];
      const arrived = new Promise<void>((resolve) => {
        proxy.events((event) => {
          heard.push(event);
          resolve();
        });
      });
      await proxy.events(() => undefined).ready;
      await expect(supervisor.api.crash()).rejects.toMatchObject({ code: 'COMPUTE_RESTARTED' });
      await arrived;
      expect(heard).toEqual([{ kind: 'compute-restarted', failed: [0] }]);
    } finally {
      proxy.dispose();
      service.dispose();
    }
  });
});
