import { execFile } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../../..');
const childPath = resolve(here, 'esbuild-core.permission.test.child.ts');

describe('esbuild under the Node permission model', () => {
  it('bundles on its own thread where child processes and workers are refused', { timeout: 60_000 }, async () => {
    const { stdout } = await execFileAsync(
      process.execPath,
      ['--permission', `--allow-fs-read=${repoRoot}`, childPath],
      {
        cwd: repoRoot,
      },
    );

    expect(stdout).toBe('const answer = 42;\nexport default answer;\n');
  });
});
