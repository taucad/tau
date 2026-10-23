/**
 * The esbuild-wasm browser service (through 0.28.2) keeps every call's settled promise, and so the result it was
 * fulfilled with, reachable for the life of the service. The bundler must not leave each edit's output files, source
 * map and metafile on those results. Each scenario runs in its own `--permission --expose-gc` process, where
 * `initializeEsbuild` selects esbuild-wasm's in-thread service, as in the browser worker.
 */
import { execFile } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../../..');
const childPath = resolve(here, 'esbuild-core.release.test.child.ts');

const runChild = async (scenario: 'release' | 'service-death'): Promise<unknown> => {
  const { stdout } = await execFileAsync(
    process.execPath,
    ['--permission', `--allow-fs-read=${repoRoot}`, '--expose-gc', childPath, scenario],
    { cwd: repoRoot },
  );
  return JSON.parse(stdout) as unknown;
};

describe('esbuild bundler on the in-thread esbuild-wasm service', () => {
  it('does not retain each edit’s build output', { timeout: 120_000 }, async () => {
    const { edits, retainedBytes } = (await runChild('release')) as { edits: number; retainedBytes: number };

    // Each edit emits about half a megabyte of code and source map; 20 retained edits held about 10 MB of heap.
    expect(edits).toBe(20);
    expect(retainedBytes).toBeLessThan(2 * 1024 * 1024);
  });

  it('still fails a pending and a later call when the service dies', { timeout: 120_000 }, async () => {
    await expect(runChild('service-death')).resolves.toEqual({
      pending: { success: false, messages: ['service died'] },
      later: { success: false, messages: ['service died'] },
      detect: 'rejected: service died',
    });
  });
});
