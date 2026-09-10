import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';

import { afterEach, describe, expect, it } from 'vitest';
import { connectSqliteComputeStoreWorker } from '@taucad/runtime/node';

describe('desktop compute-store worker lifecycle', () => {
  let directory: string | undefined;
  const workers: Worker[] = [];

  afterEach(async () => {
    await Promise.all(workers.splice(0).map(async (worker) => worker.terminate()));
    if (directory) {
      await rm(directory, { recursive: true, force: true });
    }
  });

  const start = (): Worker => {
    const worker = new Worker(new URL('compute-store.worker.ts', import.meta.url), { workerData: { directory } });
    workers.push(worker);
    return worker;
  };

  it('keeps project identities separate, survives restart, fences stale clients, and clears one project', async () => {
    directory = await mkdtemp(join(tmpdir(), 'tau-desktop-compute-'));
    const firstWorker = start();
    const project = connectSqliteComputeStoreWorker({ worker: firstWorker, workspace: '/projects/a' });
    const candidate = connectSqliteComputeStoreWorker({ worker: firstWorker, workspace: '/projects/a' });
    const other = connectSqliteComputeStoreWorker({ worker: firstWorker, workspace: '/projects/b' });
    const opened = await project.engine.open({ workspace: 'ignored' });
    const candidateOpened = await candidate.engine.open({ workspace: 'ignored-candidate' });
    const otherOpened = await other.engine.open({ workspace: 'ignored-other' });

    expect(candidateOpened.generation).toBe(opened.generation);
    const otherCleared = await other.control.clear({});
    const projectReport = await project.control.inspect({});
    expect(otherCleared.generation).toBeGreaterThan(otherOpened.generation);
    expect(projectReport.generation).toBe(opened.generation);

    await Promise.all([opened.close(), candidateOpened.close(), otherOpened.close()]);
    await firstWorker.terminate();
    await expect(project.control.inspect({})).rejects.toThrow();

    const restarted = connectSqliteComputeStoreWorker({ worker: start(), workspace: '/projects/a' });
    const restartedReport = await restarted.control.inspect({});
    expect(restartedReport.generation).toBe(opened.generation);
    const cleared = await restarted.control.clear({});
    expect(cleared.generation).toBeGreaterThan(opened.generation);

    project.dispose();
    candidate.dispose();
    other.dispose();
    restarted.dispose();
  });
});
