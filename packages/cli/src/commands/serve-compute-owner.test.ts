/**
 * `tau serve`'s compute owner, in process: the daemon is stubbed at `startHostDaemon` and every worker thread is
 * observed, so the test sees when the owner allocates, invalidates, restarts and closes its compute worker. The
 * child-process gate for the same command is `apps/cli-e2e/src/serve-agent.integration.test.ts`.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type * as WorkerThreads from 'node:worker_threads';

import { runCommand } from 'citty';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type * as TauHost from '@taucad/host';

const disposers: Array<() => Promise<void> | void> = [];

const ownerState = vi.hoisted(() => ({
  daemonOptions: undefined as
    | undefined
    | {
        agent?: { compute?: unknown; computeControl?: unknown };
        systemSkillBundles?: readonly unknown[];
      },
  closed: undefined as undefined | PromiseWithResolvers<{ cause: 'requested' }>,
  workers: [] as WorkerThreads.Worker[],
  closeFailure: undefined as Error | undefined,
}));
const capturedDaemonOptions = (): typeof ownerState.daemonOptions => Reflect.get(ownerState, 'daemonOptions');

vi.mock('node:worker_threads', async (importOriginal) => {
  const actual = await importOriginal<typeof WorkerThreads>();
  class ObservedWorker extends actual.Worker {
    public constructor(filename: string | URL, options?: WorkerThreads.WorkerOptions) {
      super(filename, options);
      ownerState.workers.push(this);
    }
  }
  // eslint-disable-next-line @typescript-eslint/naming-convention -- `node:worker_threads` names its export `Worker`.
  return { ...actual, Worker: ObservedWorker };
});

vi.mock('@taucad/host', async (importOriginal) => {
  const actual = await importOriginal<typeof TauHost>();
  return {
    ...actual,
    startHostDaemon: vi.fn((options: typeof ownerState.daemonOptions) => {
      ownerState.daemonOptions = options;
      ownerState.closed = Promise.withResolvers<{ cause: 'requested' }>();
      return {
        ready: Promise.resolve(),
        closed: ownerState.closed.promise,
        close: async () => {
          ownerState.closed?.resolve({ cause: 'requested' });
          if (ownerState.closeFailure) {
            throw ownerState.closeFailure;
          }
        },
      };
    }),
  };
});

afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) {
    // oxlint-disable-next-line no-await-in-loop -- teardown is ordered: child first, then its servers.
    await dispose();
  }
});

describe('tau serve compute owner', () => {
  it('allocates only for durable use, invalidates on error, restarts, and awaits worker close', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'tau-serve-compute-workspace-'));
    const configDirectory = await mkdtemp(join(tmpdir(), 'tau-serve-compute-config-'));
    const previousConfig = process.env['TAU_CONFIG_DIR'];
    process.env['TAU_CONFIG_DIR'] = configDirectory;
    disposers.push(async () => {
      if (previousConfig === undefined) {
        delete process.env['TAU_CONFIG_DIR'];
      } else {
        process.env['TAU_CONFIG_DIR'] = previousConfig;
      }
      await Promise.all(ownerState.workers.splice(0).map(async (worker) => worker.terminate()));
      await rm(workspace, { recursive: true, force: true });
      await rm(configDirectory, { recursive: true, force: true });
    });

    const { serveCommand } = await import('#commands/serve.js');
    const offRun = runCommand(serveCommand, {
      rawArgs: [
        '--trust-projects',
        '--agent-port=0',
        `--workspace=${workspace}`,
        '--compute-mode=off',
        '--relay=http://127.0.0.1:1',
      ],
    });
    await vi.waitFor(() => {
      expect(ownerState.daemonOptions?.agent).toBeDefined();
    });
    expect(ownerState.daemonOptions?.systemSkillBundles).not.toEqual([]);
    expect(JSON.stringify(ownerState.daemonOptions?.systemSkillBundles?.[0])).toContain('"path":"SKILL.md"');
    expect(ownerState.daemonOptions!.agent!.compute).toEqual({ mode: 'off' });
    expect(ownerState.workers).toHaveLength(0);
    ownerState.closed!.resolve({ cause: 'requested' });
    await offRun;
    ownerState.daemonOptions = undefined;

    const running = runCommand(serveCommand, {
      rawArgs: [
        '--trust-projects',
        '--agent-port=0',
        `--workspace=${workspace}`,
        '--compute-mode=durable',
        '--relay=http://127.0.0.1:1',
      ],
    });
    await vi.waitFor(() => {
      expect(capturedDaemonOptions()).toBeDefined();
    });
    const durableOptions = capturedDaemonOptions();
    expect(durableOptions?.agent).toBeDefined();
    expect(ownerState.workers).toHaveLength(0);

    const compute = durableOptions!.agent!.compute as () => { mode: string };
    expect(compute()).toMatchObject({ mode: 'durable' });
    expect(ownerState.workers).toHaveLength(1);
    const control = durableOptions!.agent!.computeControl as {
      inspect(input: Record<string, never>): Promise<{ generation: number }>;
    };
    const before = await control.inspect({});
    const first = ownerState.workers[0]!;
    first.emit('error', new Error('fixture worker error'));
    expect(compute()).toMatchObject({ mode: 'durable' });
    expect(ownerState.workers).toHaveLength(2);
    await first.terminate();
    const after = await control.inspect({});
    expect(after.generation).toBe(before.generation);

    /* A refused final revision is reported, not thrown: a throw from serve's
     * `finally` would replace whatever brought the daemon down. */
    ownerState.closeFailure = new Error('daemon close failed');
    ownerState.closed!.resolve({ cause: 'requested' });
    try {
      await expect(running).resolves.toBeDefined();
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = undefined;
    }
    expect(ownerState.workers[1]!.threadId).toBe(-1);
  });
});
