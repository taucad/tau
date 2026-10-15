import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { detectHostIndicators, parsePluginDeployment, selectVariant } from '@taucad/runtime/preparation/node';
import { validateGlbData } from '@taucad/runtime-testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const cliBinPath = resolve(repoRoot, 'packages/cli/dist/bin/tau.mjs');
/** The payload seed `pnpm nx run build123d:seed` fills; `TAU_PAYLOAD_DIR` points `tau prepare` at it. */
const seedDirectory = resolve(repoRoot, 'out/cache/build123d-seed');

const deployment = parsePluginDeployment(
  JSON.parse(readFileSync(createRequire(import.meta.url).resolve('@taucad/build123d/tau-plugin.json'), 'utf8')),
  '@taucad/build123d tau-plugin.json',
);
const indicators = detectHostIndicators();
const selection =
  indicators === undefined ? undefined : selectVariant(deployment.dependencies['engine'] ?? [], indicators);
const seedPresent =
  selection?.status === 'selected' &&
  selection.variant.payloads.every(
    (payload) =>
      payload.origin.kind !== 'url' ||
      existsSync(
        join(
          seedDirectory,
          'blobs',
          'sha256',
          Buffer.from(payload.integrity.slice('sha256-'.length), 'base64').toString('hex'),
        ),
      ),
  );

const model = `from dataclasses import dataclass

from build123d import Box


@dataclass(frozen=True)
class Params:
    width: float = 10.0


def main(params: Params):
    return Box(params.width, 20, 30)
`;

const runCli = async (
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
): Promise<{ readonly stdout: string; readonly stderr: string; readonly exitCode: number }> => {
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ['--import', '@oxc-node/core/register', cliBinPath, ...args],
      { cwd: repoRoot, env: environment, maxBuffer: 64 * 1024 * 1024 },
    );
    return { stdout, stderr, exitCode: 0 };
  } catch (error) {
    const failure = error as { readonly stdout?: string; readonly stderr?: string; readonly code?: number };
    return {
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? '',
      exitCode: typeof failure.code === 'number' ? failure.code : 1,
    };
  }
};

describe.runIf(seedPresent)('tau export of a Build123d model (real binary, prepared from the seed)', () => {
  let root: string;
  let environment: NodeJS.ProcessEnv;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'tau-build123d-export-'));
    // The model's directory is the workspace the kernel mirrors, so the payload store stays outside it.
    await mkdir(join(root, 'project'));
    await writeFile(join(root, 'project', 'main.py'), model);
    // A bare PATH and an empty config directory: nothing on the machine supplies Python or a prepared closure.
    /* eslint-disable @typescript-eslint/naming-convention -- environment variable names are not camelCase. */
    environment = {
      HOME: root,
      PATH: '/usr/bin:/bin',
      TAU_CONFIG_DIR: join(root, 'config'),
      NX_PREFER_NODE_STRIP_TYPES: 'true',
    };
    /* eslint-enable @typescript-eslint/naming-convention -- camelCase names resume. */
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('should refuse before preparation, prepare from the seed, then export valid geometry', async () => {
    const input = join(root, 'project', 'main.py');
    const output = join(root, 'model.glb');

    const refused = await runCli(['export', input, '--ext=glb', `--output=${output}`, '--json'], environment);
    expect(refused.exitCode, refused.stderr).toBe(3);
    expect(refused.stdout).toContain('"code":"KERNEL_NOT_PREPARED"');
    expect(refused.stderr).toContain('tau prepare build123d');
    expect(`${refused.stdout}${refused.stderr}`).not.toContain('--plugin');
    expect(existsSync(output)).toBe(false);

    const prepared = await runCli(['prepare', 'build123d', '--offline'], {
      ...environment,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- an environment variable name
      TAU_PAYLOAD_DIR: seedDirectory,
    });
    expect(prepared.exitCode, prepared.stderr).toBe(0);

    const exported = await runCli(['export', input, '--ext=glb', `--output=${output}`], environment);
    expect(exported.exitCode, exported.stderr).toBe(0);
    validateGlbData(new Uint8Array(await readFile(output)));
  }, 900_000);
});
