import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const cliBinPath = resolve(repoRoot, 'packages/cli/dist/bin/taucad.mjs');
const birdhouse = resolve(repoRoot, 'libs/tau-examples/src/kernels/replicad/birdhouse/main.ts');

const gltfMagicBytes = 0x46_54_6c_67;

const runCli = async (args: readonly string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
  /*
   * CWD is the repo root so Node can resolve `@oxc-node/core` from the
   * workspace's `node_modules`. The CLI accepts absolute paths for `--file`
   * and `--output`, so the working directory has no semantic effect on the
   * export — it only governs module resolution for the `--import` flag.
   */
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ['--import', '@oxc-node/core/register', cliBinPath, ...args],
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables are not camelCase
      { cwd: repoRoot, env: { ...process.env, NX_PREFER_NODE_STRIP_TYPES: 'true' } },
    );
    return { stdout, stderr, exitCode: 0 };
  } catch (error) {
    const errno = error as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: errno.stdout ?? '',
      stderr: errno.stderr ?? '',
      exitCode: typeof errno.code === 'number' ? errno.code : 1,
    };
  }
};

describe('taucad CLI dist (real binary)', () => {
  let workspace: string;

  beforeAll(async () => {
    await execFileAsync('pnpm', ['nx', 'build', 'cli'], { cwd: repoRoot });
    workspace = await mkdtemp(join(tmpdir(), 'taucad-cli-dist-'));
  }, 180_000);

  afterAll(async () => {
    if (workspace) {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it('should ship a hashbang executable at dist/bin/taucad.mjs', async () => {
    const head = await readFile(cliBinPath, 'utf8');

    expect(head.startsWith('#!/usr/bin/env node')).toBe(true);
  });

  it('should exit 0 and emit a valid glTF 2.0 binary when exporting the birdhouse fixture to GLB', async () => {
    const outputPath = join(workspace, 'birdhouse-default.glb');

    const result = await runCli(['export', birdhouse, '--ext=glb', `--output=${outputPath}`]);

    expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);

    const bytes = await readFile(outputPath);
    expect(bytes.byteLength).toBeGreaterThan(0);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint32(0, true)).toBe(gltfMagicBytes);
  }, 120_000);

  it('should exit non-zero and list the supported formats in stderr when --ext is invalid', async () => {
    const result = await runCli([
      'export',
      birdhouse,
      '--ext=not-a-format',
      `--output=${join(workspace, 'invalid.bin')}`,
    ]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/Unsupported format: "not-a-format"/);
    expect(result.stderr).toMatch(/glb/);
  }, 60_000);

  it('should produce a different output size when parameters override the default geometry', async () => {
    const defaultOut = join(workspace, 'birdhouse-default-params.glb');
    const tweakedOut = join(workspace, 'birdhouse-tweaked.glb');

    const defaultResult = await runCli(['export', birdhouse, '--ext=glb', `--output=${defaultOut}`]);
    expect(defaultResult.exitCode, `stderr: ${defaultResult.stderr}`).toBe(0);

    const tweakedResult = await runCli([
      'export',
      birdhouse,
      '--ext=glb',
      `--output=${tweakedOut}`,
      '--params={"width":250,"height":180}',
    ]);
    expect(tweakedResult.exitCode, `stderr: ${tweakedResult.stderr}`).toBe(0);

    const [defaultStat, tweakedStat] = await Promise.all([stat(defaultOut), stat(tweakedOut)]);
    expect(tweakedStat.size).not.toBe(defaultStat.size);
  }, 240_000);
});
