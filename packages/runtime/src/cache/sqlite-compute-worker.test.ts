import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { afterEach, describe, expect, it } from 'vitest';
import { connectSqliteComputeStoreWorker } from '#cache/sqlite-compute-worker-client.js';

describe('dedicated SQLite compute worker', () => {
  let directory: string | undefined;
  let worker: Worker | undefined;
  afterEach(async () => {
    await worker?.terminate();
    if (directory) {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('owns SQLite in another worker realm and mints workspace-scoped controls', async () => {
    directory = await mkdtemp(join(tmpdir(), 'tau-compute-worker-'));
    worker = new Worker(new URL('sqlite-compute-worker.fixture.ts', import.meta.url), { workerData: { directory } });
    const client = connectSqliteComputeStoreWorker({ worker, workspace: 'admitted-project' });
    const peer = connectSqliteComputeStoreWorker({ worker, workspace: 'admitted-project' });
    const session = await client.engine.open({ workspace: 'forged-project' });
    const peerSession = await peer.engine.open({ workspace: 'another-forged-project' });
    expect(session.durable).toBe(true);
    const report = await client.control.inspect({});
    expect(report.generation).toBe(session.generation);
    const cleared = await peer.control.clear({});
    const revoked = await client.control.inspect({});
    expect(cleared.generation).toBeGreaterThan(session.generation);
    expect(revoked.generation).toBe(cleared.generation);
    await session.close();
    const afterPeerClose = await peer.control.inspect({});
    expect(afterPeerClose.generation).toBe(cleared.generation);
    await peerSession.close();
    client.dispose();
    peer.dispose();
  });
});
