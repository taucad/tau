import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = resolve(import.meta.dirname, '../..');

/** Execute the real shell and packer in an isolated tree; only the two serving subprocesses are stubs. */
const runFixture = (
  oversized: boolean,
  discardFailure = false,
): { status: ReturnType<typeof spawnSync>['status']; calls: string[]; stderr: string } => {
  const root = mkdtempSync(join(tmpdir(), 'tau-s12-shell-'));
  try {
    const script = 'scripts/spikes/native-deps/linux/s12/measure-and-serve.sh';
    for (const directory of [
      'scripts/spikes/native-deps/linux/s12',
      'scripts/src',
      'apps/ui/serve/build/client',
      'apps/ui-e2e/src/support',
      'bin',
    ]) {
      mkdirSync(join(root, directory), { recursive: true });
    }
    let shell = readFileSync(join(sourceRoot, script), 'utf8');
    if (discardFailure) {
      shell = shell.replace('status=1 # Complete archives exist;', 'status=0 # Complete archives exist;');
    }
    writeFileSync(join(root, script), shell);
    let helper = readFileSync(join(sourceRoot, 'scripts/src/pack-serve-ui-layer.ts'), 'utf8');
    // Keep the actual packer and exit contract, reducing only the fixture cap to avoid a 150 MB test allocation.
    if (oversized) {
      helper = helper.replace('150_000_000', '1');
    }
    writeFileSync(join(root, 'scripts/src/pack-serve-ui-layer.ts'), helper);
    writeFileSync(join(root, 'apps/ui/serve/build/client/index.html'), '<html>fixture</html>');
    writeFileSync(
      join(root, 'apps/ui-e2e/src/support/serve-ui-build.test.ts'),
      "const uiRoot = resolvePath(repoRoot, 'apps/ui/serve/build/client');\n",
    );
    writeFileSync(join(root, 'bin/pnpm'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$S12_TEST_CALLS"\nexit 0\n', {
      mode: 0o755,
    });
    const environment = { ...process.env };
    environment['PATH'] = `${join(root, 'bin')}:${process.env['PATH'] ?? ''}`;
    environment['S12_TEST_CALLS'] = join(root, 'calls');
    const result = spawnSync('bash', [join(root, script), join(root, 'output'), join(root, 'store')], {
      env: environment,
      encoding: 'utf8',
      timeout: 15_000,
    });
    expect(result.error).toBeUndefined();
    const calls = readFileSync(join(root, 'calls'), 'utf8').trim().split('\n');
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain('serve-ui-build.test.ts');
    expect(calls[1]).toContain('serve-ui-build.s12-store.test.ts');
    expect(readFileSync(join(root, 'apps/ui/serve/build/client/index.html'), 'utf8')).toBe('<html>fixture</html>');
    return { status: result.status, calls, stderr: result.stderr };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

describe('S12 shell budget propagation', () => {
  it('should fail after an oversized archive even when both serving subprocesses pass', () => {
    const result = runFixture(true);
    expect(result.stderr).toContain('S12 runtime layer exceeds 1 bytes');
    expect(result.status).toBe(1);
    // Negative control: dropping the shell budget failure makes the same oversized fixture falsely green.
    expect(runFixture(true, true).status).toBe(0);
  });

  it('should succeed after a within-budget archive and both successful serving subprocesses', () => {
    expect(runFixture(false).status).toBe(0);
  });
});
