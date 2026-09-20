/**
 * U14 — batch atomicity under process kill.
 *
 * A child process publishes fixed-size batches into a real database file and is
 * SIGKILLed while it works. Whatever survives must be whole: every batch is
 * present in full or not at all, and every surviving record's bytes still hash
 * to the identity it is filed under. A crashed writer must never leave a hit on
 * partial bytes (charter U14, S5 gate 13).
 */

/* oxlint-disable no-await-in-loop, unicorn/no-await-expression-member -- the kill sequence is inherently ordered: each child runs, is killed and has its store verified before the next kill point is tried. */

import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digestAction, digestContent } from '@taucad/cache-core';
import { afterAll, expect, it } from 'vitest';
import { createSqliteComputeEngine } from '#cache/sqlite-compute-engine.js';
import { killTestAction, killTestBytes, killTestEntry } from '#cache/sqlite-kill-child.fixture.js';

const rounds = 12;
const batchSize = 16;
const payloadBytes = 65_536;
const childPath = join(dirname(fileURLToPath(import.meta.url)), 'sqlite-kill-child.fixture.ts');
const directories: string[] = [];

afterAll(async () => {
  for (const directory of directories) {
    await rm(directory, { recursive: true, force: true });
  }
});

/** Run the child and SIGKILL it `killAfter` ms after it reports readiness. */
const runAndKill = async (
  directory: string,
  killAfter: number,
): Promise<{ readonly committed: number; readonly killed: boolean }> => {
  const child = spawn(
    process.execPath,
    [
      '--import',
      '@oxc-node/core/register',
      childPath,
      directory,
      String(rounds),
      String(batchSize),
      String(payloadBytes),
    ],
    { cwd: join(dirname(fileURLToPath(import.meta.url)), '..', '..'), stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let output = '';
  let killed = false;
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    output += chunk;
    if (output.includes('READY') && !killed) {
      killed = true;
      setTimeout(() => {
        child.kill('SIGKILL');
      }, killAfter);
    }
  });
  await new Promise<void>((resolve) => {
    child.on('close', () => {
      resolve();
    });
  });
  const committed = [...output.matchAll(/^COMMITTED (\d+)$/gmu)].length;
  return { committed, killed: !output.includes('DONE') };
};

const runMetadataChild = async (directory: string, command: 'metadata-put' | 'metadata-clear'): Promise<void> => {
  const child = spawn(process.execPath, ['--import', '@oxc-node/core/register', childPath, directory, command], {
    cwd: join(dirname(fileURLToPath(import.meta.url)), '..', '..'),
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const output: string[] = [];
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => output.push(chunk));
  // oxlint-disable-next-line typescript/no-restricted-types -- a child killed by a signal closes with a null exit code.
  const code = await new Promise<number | null>((resolve) => {
    child.on('close', resolve);
  });
  expect(code).toBe(0);
  expect(output.join('')).toContain('"status"');
};

it('M2: a live authority observes metadata and clear committed by separate SQLite processes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tau-compute-process-'));
  directories.push(directory);
  const store = createSqliteComputeEngine({ directory });
  const stale = await store.engine.open({ workspace: 'kill-test' });
  await runMetadataChild(directory, 'metadata-put');
  expect(await (await store.control({ workspace: 'kill-test' })).inspect({})).toMatchObject({ entries: 1 });
  await runMetadataChild(directory, 'metadata-clear');
  const entry = await killTestEntry(99, 0, 32);
  expect(
    (await stale.get({ digests: [entry.actionDigest], maxEntries: 1, maxBytes: 64, generation: stale.generation }))
      .status,
  ).toBe('stale-generation');
  await stale.close();
  await store.dispose();
});

it('U14: a process killed mid-publication leaves whole batches and no partial bytes', async () => {
  const outcomes: Array<{ killAfter: number; committed: number; visible: number; killed: boolean }> = [];

  // A spread of kill points, so at least one lands inside a transaction rather
  // than between two of them.
  for (const killAfter of [5, 15, 30, 60, 120, 240]) {
    const directory = await mkdtemp(join(tmpdir(), 'tau-compute-kill-'));
    directories.push(directory);
    const { committed, killed } = await runAndKill(directory, killAfter);

    // Reopen the same database the killed writer was using.
    const store = createSqliteComputeEngine({ directory });
    const session = await store.engine.open({ workspace: 'kill-test' });
    let visible = 0;
    for (let round = 0; round < rounds; round += 1) {
      const digests = await Promise.all(
        Array.from({ length: batchSize }, async (_unused, index) =>
          digestAction({ action: killTestAction(round, index) }),
        ),
      );
      const get = await session.get({
        digests,
        maxEntries: batchSize,
        maxBytes: batchSize * payloadBytes * 2,
        generation: session.generation,
      });
      expect(get.status).toBe('ok');
      if (get.status !== 'ok') {
        continue;
      }
      // Atomicity: a batch is entirely present or entirely absent.
      expect([0, batchSize]).toContain(get.entries.length);
      visible += get.entries.length === batchSize ? 1 : 0;

      // Integrity: no surviving record is a hit on partial or mislabelled bytes.
      for (const entry of get.entries) {
        expect(await digestContent({ bytes: entry.bytes })).toBe(entry.contentDigest);
        expect(await digestAction({ action: entry.action })).toBe(entry.actionDigest);
        const index = Number(/entry-(\d+)$/u.exec(entry.action.operation)?.[1] ?? -1);
        expect([...entry.bytes]).toStrictEqual([...killTestBytes(round, index, payloadBytes)]);
      }
    }
    const report = await (await store.control({ workspace: 'kill-test' })).inspect({});
    // The maintained counters survived the crash and match what is readable.
    expect(report.entries).toBe(visible * batchSize);
    await session.close();
    await store.dispose();
    outcomes.push({ killAfter, committed, visible, killed });
  }

  // The child was actually killed before finishing at least once.
  expect(outcomes.some((outcome) => outcome.killed)).toBe(true);
  for (const outcome of outcomes) {
    // Every batch the child announced as committed survived the crash intact.
    // The comparison runs this way round on purpose: SIGKILL discards whatever
    // the child had written to the pipe but not yet flushed, so `committed` can
    // undercount what really landed and can never overcount it.
    expect(outcome.visible).toBeGreaterThanOrEqual(outcome.committed);
  }
  // At least one kill landed before every round was committed, so the atomicity
  // assertions above were exercised against an interrupted writer.
  expect(outcomes.some((outcome) => outcome.visible < rounds)).toBe(true);
}, 120_000);
