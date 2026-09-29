import { once } from 'node:events';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Worker } from 'node:worker_threads';
import { afterEach, describe, expect, it } from 'vitest';
import { createSqliteComputeEngine } from '#cache/sqlite-compute-engine.js';
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
    const client = connectSqliteComputeStoreWorker({
      worker,
      workspace: 'admitted-project',
    });
    const peer = connectSqliteComputeStoreWorker({
      worker,
      workspace: 'admitted-project',
    });
    const session = await client.engine.open({ workspace: 'forged-project' });
    const peerSession = await peer.engine.open({
      workspace: 'another-forged-project',
    });
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

  it('waits for a concurrent worker writer while opening a store', async () => {
    directory = await mkdtemp(join(tmpdir(), 'tau-compute-worker-lock-'));
    const workspace = 'contended-project';
    const seed = createSqliteComputeEngine({ directory });
    try {
      const control = await seed.control({ workspace });
      await control.inspect({});
    } finally {
      await seed.dispose();
    }
    const files = await readdir(directory);
    const file = files.find((name) => name.endsWith('.sqlite'));
    expect(file).toBeDefined();
    const lockerSource = `
      const { parentPort, workerData } = require('node:worker_threads');
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(workerData.file);
      db.exec('PRAGMA journal_mode = DELETE');
      db.exec('BEGIN EXCLUSIVE');
      parentPort.postMessage('locked');
      parentPort.once('message', () => setTimeout(() => {
        db.exec('ROLLBACK');
        db.close();
        parentPort.postMessage('released');
      }, 200));
    `;
    worker = new Worker(lockerSource, { eval: true, workerData: { file: join(directory, file!) } });
    const lockSignal = (await once(worker, 'message')) as unknown[];
    expect(lockSignal[0]).toBe('locked');
    const originalExec = DatabaseSync.prototype.exec;
    let attemptedJournalMode = false;
    DatabaseSync.prototype.exec = function (this: DatabaseSync, sql: string): void {
      if (sql === 'PRAGMA journal_mode = WAL') {
        attemptedJournalMode = true;
        // The separate realm releases only after this exact locking pragma
        // begins. Worker startup can no longer bypass the contention.
        worker!.postMessage('release');
      }
      originalExec.call(this, sql);
    };
    let opener: ReturnType<typeof createSqliteComputeEngine> | undefined;
    try {
      opener = createSqliteComputeEngine({ directory });
      const control = await opener.control({ workspace });
      expect(await control.inspect({})).toMatchObject({ entries: 0 });
      expect(attemptedJournalMode).toBe(true);
    } finally {
      DatabaseSync.prototype.exec = originalExec;
      worker.postMessage('release');
      await opener?.dispose();
    }
  });
});
