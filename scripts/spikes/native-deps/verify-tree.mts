#!/usr/bin/env node

/**
 * Purpose: Time a full receipt verification (walk, lstat, sha256 of every file) of a prepared closure.
 * Why: Spike S3 decides whether full verification is a seconds-scale seal-time cost (charter D8, Q33).
 * Environment: Node 24+; any prepared tree. Reads only.
 * Usage: node --import @oxc-node/core/register scripts/spikes/native-deps/verify-tree.mts
 *   --root <tree> --label <name> --mode async|threads [--concurrency <n>] [--receipt <file>] [--write-receipt <file>] [--out <file>]
 * Exit codes: 0 when every file matches the receipt (or a receipt was written); 1 on mismatch or failure.
 */

import { createHash } from 'node:crypto';
import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import process from 'node:process';
import { Worker } from 'node:worker_threads';

/* oxlint-disable no-restricted-imports -- spike-only scripts outside a package import their siblings and the kernel sessions, which are not public exports, by relative path; deleted with their W package. */
import { cpuMilliseconds, emit, parseFlags, requiredFlag } from './spike-common.mts';
/* oxlint-enable no-restricted-imports */

type Entry = { readonly path: string; readonly byteLength: number; readonly sha256: string };

const hashFile = async (path: string): Promise<string> =>
  new Promise((_resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(path, { highWaterMark: 1024 * 1024 })
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => {
        _resolve(hash.digest('hex'));
      });
  });

const hashAll = async (paths: readonly string[], concurrency: number): Promise<string[]> => {
  const results = Array.from<string>({ length: paths.length });
  let next = 0;
  const lane = async (): Promise<void> => {
    while (next < paths.length) {
      const index = next;
      next += 1;
      // oxlint-disable-next-line no-await-in-loop -- each lane is one bounded serial stream.
      results[index] = await hashFile(paths[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, lane));
  return results;
};

/** Plain-JavaScript shard hasher, so a worker starts without the TypeScript loader. */
const shardWorkerSource = `
const { createHash } = require('node:crypto');
const { createReadStream } = require('node:fs');
const { parentPort, workerData } = require('node:worker_threads');
const hashFile = (path) => new Promise((done, fail) => {
  const hash = createHash('sha256');
  createReadStream(path, { highWaterMark: 1024 * 1024 }).on('data', (chunk) => hash.update(chunk)).on('error', fail).on('end', () => done(hash.digest('hex')));
});
const { paths, concurrency } = workerData;
const results = new Array(paths.length);
let next = 0;
const lane = async () => { while (next < paths.length) { const index = next++; results[index] = await hashFile(paths[index]); } };
Promise.all(Array.from({ length: concurrency }, lane)).then(() => parentPort.postMessage(results));
`;

{
  const walk = async (root: string): Promise<Array<{ path: string; byteLength: number }>> => {
    const files: Array<{ path: string; byteLength: number }> = [];
    const visit = async (directory: string): Promise<void> => {
      const entries = await readdir(directory, { withFileTypes: true });
      await Promise.all(
        entries.map(async (entry) => {
          const path = join(directory, entry.name);
          if (entry.isDirectory()) {
            await visit(path);
          } else if (entry.isFile()) {
            const metadata = await lstat(path);
            files.push({ path, byteLength: metadata.size });
          }
        }),
      );
    };
    await visit(root);
    return files.sort((left, right) => (left.path < right.path ? -1 : 1));
  };

  const main = async (): Promise<void> => {
    const flags = parseFlags(['root', 'label', 'mode', 'concurrency', 'receipt', 'write-receipt', 'out']);
    const root = resolve(requiredFlag(flags, 'root'));
    const mode = requiredFlag(flags, 'mode');
    const concurrency = Number(flags.get('concurrency') ?? '8');
    if (mode !== 'async' && mode !== 'threads') {
      throw new TypeError('--mode must be async or threads');
    }
    const cpuStart = process.cpuUsage();
    const started = performance.now();
    const files = await walk(root);
    const walkMilliseconds = performance.now() - started;
    const paths = files.map(({ path }) => path);
    let hashes: string[];
    if (mode === 'async') {
      hashes = await hashAll(paths, concurrency);
    } else {
      // Interleave files across workers so large files spread evenly.
      const shards = Array.from({ length: concurrency }, () => [] as number[]);
      for (const [index] of paths.entries()) {
        shards[index % concurrency]!.push(index);
      }
      hashes = Array.from<string>({ length: paths.length });
      await Promise.all(
        shards.map(
          async (shard) =>
            new Promise<void>((_resolve, reject) => {
              const worker = new Worker(shardWorkerSource, {
                eval: true,
                workerData: { paths: shard.map((index) => paths[index]), concurrency: 2 },
              });
              worker.once('message', (shardHashes: string[]) => {
                for (const [position, index] of shard.entries()) {
                  hashes[index] = shardHashes[position]!;
                }
                void worker.terminate();
                _resolve();
              });
              worker.once('error', reject);
            }),
        ),
      );
    }
    const entries: Entry[] = files.map(({ path, byteLength }, index) => ({
      path: relative(root, path),
      byteLength,
      sha256: hashes[index]!,
    }));
    let mismatches = 0;
    const receiptPath = flags.get('receipt');
    if (receiptPath !== undefined) {
      const receipt = new Map(
        (JSON.parse(readFileSync(receiptPath, 'utf8')) as { files: Entry[] }).files.map((entry) => [entry.path, entry]),
      );
      for (const entry of entries) {
        const expected = receipt.get(entry.path);
        if (expected?.sha256 !== entry.sha256 || expected.byteLength !== entry.byteLength) {
          mismatches += 1;
        }
      }
      mismatches += Math.max(0, receipt.size - entries.length);
    }
    const wallMilliseconds = performance.now() - started;
    const cpu = cpuMilliseconds(cpuStart);
    const treeIntegrity = createHash('sha256')
      .update(entries.map(({ path, sha256 }) => `${path}\0${sha256}\n`).join(''))
      .digest('hex');
    const receiptOut = flags.get('write-receipt');
    if (receiptOut !== undefined) {
      writeFileSync(receiptOut, JSON.stringify({ treeIntegrity, files: entries }));
    }
    emit(flags.get('out'), {
      spike: 'verify-tree',
      label: requiredFlag(flags, 'label'),
      mode,
      concurrency,
      files: entries.length,
      bytes: entries.reduce((sum, { byteLength }) => sum + byteLength, 0),
      walkMilliseconds,
      wallMilliseconds,
      cpuMilliseconds: cpu,
      treeIntegrity,
      mismatches,
    });
    if (mismatches > 0) {
      throw new Error(`${String(mismatches)} files differ from the receipt`);
    }
  };

  try {
    await main();
  } catch (error) {
    console.error('verify-tree failed:', error);
    process.exit(1);
  }
}
