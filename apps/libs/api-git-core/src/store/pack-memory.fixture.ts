import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { appendFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';

/**
 * What DA4's memory tests share: the pack they move, the bound they hold it
 * to, and how they measure. Test-only; nothing in the API imports it.
 */

/**
 * DA4's pack: 600 MiB under `TAU_SCALE_TESTS=1`, the size the work package
 * names, and 128 MiB otherwise, which a buffered upload or restore already
 * puts past the bound on its own.
 */
export const largePackMebibytes = process.env['TAU_SCALE_TESTS'] === '1' ? 600 : 128;

/**
 * DA4's stated bound: peak growth of retained V8 heap plus `ArrayBuffer`
 * memory while one pack commits or restores, whatever the pack's size.
 *
 * Buffers live outside the V8 heap, so `--max-old-space-size` alone never sees
 * a buffered pack; the sum is what the VM holds. A streamed transfer retains a
 * hashing buffer and the read-ahead of one HTTP body, which plateaus near
 * 40 MiB on loopback MinIO however large the object (33 MiB at 128 MiB, 41 MiB
 * at 600 MiB). A buffered commit retained the whole pack, and a buffered
 * restore about three times it.
 */
export const streamedGrowthBoundMebibytes = 64;

export const mebibytes = (bytes: number): string => (bytes / 1024 / 1024).toFixed(1);

/**
 * The collector, so a sample measures what is retained rather than garbage
 * not yet collected. `--expose-gc` can be set at run time; the function then
 * exists in any new context.
 */
const collectGarbage = ((): (() => void) => {
  setFlagsFromString('--expose-gc');
  return runInNewContext('gc') as () => void;
})();

export type Growth = { heapAndBuffers: number; rss: number };

/**
 * Runs `run` while sampling memory every 100 ms, and returns the peak above
 * the value before it started.
 *
 * `heapAndBuffers` is sampled after a collection, so it is what `run` holds:
 * a buffered pack is held whole across its upload, which lasts seconds, so a
 * 100 ms sample cannot miss it. `rss` is sampled as found and is the figure
 * the VM pays, garbage and allocator slack included.
 */
export const measureGrowth = async <T>(run: () => Promise<T>): Promise<{ result: T; growth: Growth }> => {
  const heapAndBuffers = (): number => {
    collectGarbage();
    const usage = process.memoryUsage();
    return usage.heapUsed + usage.arrayBuffers;
  };
  const rss = process.memoryUsage.rss();
  const baseline = { heapAndBuffers: heapAndBuffers(), rss };
  const peak = { ...baseline };
  const sample = (): void => {
    peak.rss = Math.max(peak.rss, process.memoryUsage.rss());
    peak.heapAndBuffers = Math.max(peak.heapAndBuffers, heapAndBuffers());
  };
  const timer = setInterval(sample, 100);
  try {
    const result = await run();
    sample();
    return {
      result,
      growth: { heapAndBuffers: peak.heapAndBuffers - baseline.heapAndBuffers, rss: peak.rss - baseline.rss },
    };
  } finally {
    clearInterval(timer);
  }
};

/** Hex SHA-256 of a stream, read chunk by chunk. */
export const sha256OfStream = async (stream: AsyncIterable<unknown>): Promise<string> => {
  const hash = createHash('sha256');
  for await (const chunk of stream) {
    hash.update(chunk as Uint8Array<ArrayBuffer>);
  }
  return hash.digest('hex');
};

/** Appends a measured number to the file `TAU_W2_MEASUREMENTS` names, as the W2 suite does. */
export const recordMeasurement = (line: string): void => {
  const file = process.env['TAU_W2_MEASUREMENTS'];
  if (file !== undefined && file !== '') {
    appendFileSync(file, `${line}\n`);
  }
};

/** Largest fixture file: the pre-receive hook refuses a project file above 100 MiB. */
const fixtureFileMebibytes = 64;

/* eslint-disable @typescript-eslint/naming-convention -- process environment names */
const isolatedGit = {
  PATH: process.env['PATH'] ?? '/usr/bin:/bin',
  HOME: tmpdir(),
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
} as unknown as NodeJS.ProcessEnv;
/* eslint-enable @typescript-eslint/naming-convention -- end of the process environment map */

/**
 * Makes `directory` a client whose one commit adds `size` MiB of random bytes,
 * tagged `v1`, so its pack is that size and no delta or zlib pass can shrink
 * it. The bytes are split into files the hook accepts and written a mebibyte
 * at a time, so the fixture never holds a file.
 */
export const incompressibleClient = (directory: string, size: number): string => {
  const git = (...args: readonly string[]): void => {
    execFileSync('git', args, { cwd: directory, stdio: 'ignore', env: isolatedGit });
  };
  git('init', '--quiet', '--initial-branch=main', '.');
  git('config', 'user.name', 'DA4');
  git('config', 'user.email', 'da4@tau.test');
  // Random bytes do not compress; level 0 skips the attempt on add and on push.
  git('config', 'core.compression', '0');
  for (let written = 0, index = 0; written < size; index += 1) {
    const file = path.join(directory, `large-${String(index)}.bin`);
    writeFileSync(file, '');
    for (let inFile = 0; inFile < fixtureFileMebibytes && written < size; inFile += 1, written += 1) {
      appendFileSync(file, randomBytes(1024 * 1024));
    }
  }
  git('add', '.');
  git('commit', '--quiet', '-m', `${String(size)} MiB`);
  git('tag', '-a', 'v1', '-m', 'v1');
  return directory;
};
