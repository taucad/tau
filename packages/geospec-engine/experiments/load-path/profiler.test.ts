import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { profileNodeCliLoadPath } from '#experiments/load-path/profiler.js';

describe('load-path Node CLI profiler', () => {
  it('should profile direct Node CLI invocation outcomes', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'geospec-node-cli-profile-'));
    try {
      await writeFile(
        join(projectPath, 'main.geospec.ts'),
        [
          "import { describe, it } from 'geospec';",
          "describe('direct node cli profile', () => {",
          "  it('runs a deterministic smoke test', () => {});",
          '});',
        ].join('\n'),
        'utf8',
      );

      const result = await profileNodeCliLoadPath({
        projectPath,
        iterations: 1,
      });

      expect(result.command.nodeExecutable).toBe(process.execPath);
      expect(result.command.cliPath).toMatch(/packages\/geospec-engine\/src\/cli\/main\.ts$/);
      expect(result.command.args).toContain('--json');
      expect(result.counters).toEqual({
        cliInvocations: 1,
        successfulInvocations: 1,
        failedInvocations: 0,
      });
      expect(result.runs).toHaveLength(1);
      expect(result.runs[0]?.exitCode).toBe(0);
      expect(result.runs[0]?.stdoutBytes).toBeTypeOf('number');
      expect(result.runs[0]?.stderrBytes).toBeTypeOf('number');
      expect(result.summary.buckets.nodeCli?.count).toBe(1);
    } finally {
      await rm(projectPath, { recursive: true, force: true });
    }
  }, 15_000);
});
