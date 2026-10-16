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
import { startPayloadMirror } from '@taucad/runtime-testing/preparation';
import type { PayloadMirror } from '@taucad/runtime-testing/preparation';
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
/** The mirror path of every payload this host's variant downloads: `blobs/sha256/<hex>`. */
const payloadPaths = [
  ...new Set(
    selection?.status === 'selected'
      ? selection.variant.payloads
          .filter((payload) => payload.origin.kind === 'url')
          .map(
            (payload) =>
              `blobs/sha256/${Buffer.from(payload.integrity.slice('sha256-'.length), 'base64').toString('hex')}`,
          )
      : [],
  ),
];
const seedPresent =
  selection?.status === 'selected' && payloadPaths.every((path) => existsSync(join(seedDirectory, path)));

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

/*
 * The W17 oracle on the real binary, from an empty config directory: `tau export main.py` refuses naming
 * `tau prepare build123d`; `tau prepare build123d` from a loopback mirror of the seed under no-fallback asks the
 * mirror for each payload once and never the origin; then the export writes valid geometry.
 */
describe.runIf(seedPresent)('tau export of a Build123d model (real binary, prepared from a no-fallback mirror)', () => {
  let root: string;
  let environment: NodeJS.ProcessEnv;
  let mirror: PayloadMirror;

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
    mirror = await startPayloadMirror(seedDirectory);
  });

  afterAll(async () => {
    await mirror.close();
    await rm(root, { recursive: true, force: true });
  });

  it('should refuse before preparation, prepare from the mirror fetching each payload once, then export valid geometry', async () => {
    const input = join(root, 'project', 'main.py');
    const output = join(root, 'model.glb');

    const refused = await runCli(['export', input, '--ext=glb', `--output=${output}`, '--json'], environment);
    expect(refused.exitCode, refused.stderr).toBe(3);
    expect(refused.stdout).toContain('"code":"KERNEL_NOT_PREPARED"');
    expect(refused.stderr).toContain('tau prepare build123d');
    expect(`${refused.stdout}${refused.stderr}`).not.toContain('--plugin');
    expect(existsSync(output)).toBe(false);

    /* eslint-disable @typescript-eslint/naming-convention -- environment variable names */
    const prepared = await runCli(['prepare', 'build123d', '--json'], {
      ...environment,
      TAU_PAYLOAD_MIRROR: mirror.url,
      TAU_PAYLOAD_MIRROR_NO_FALLBACK: '1',
      /* A loopback mirror must bypass any proxy the runner sets (S7). */
      NO_PROXY: '127.0.0.1,localhost',
      no_proxy: '127.0.0.1,localhost',
    });
    /* eslint-enable @typescript-eslint/naming-convention -- end environment variable names */
    /* Evidence: the mirror's request log, written before any assertion so a failure keeps it. */
    const log = process.env['TAU_CLI_SCENARIO_LOG'];
    if (log !== undefined && log !== '') {
      await writeFile(
        `${log}.mirror.txt`,
        mirror.requests.map(({ method, path, status }) => `${method} ${path} ${String(status)}`).join('\n'),
      );
    }
    expect(prepared.exitCode, prepared.stderr).toBe(0);
    expect(JSON.parse(prepared.stdout.trim().split('\n').at(-1)!)).toMatchObject({ status: 'ready' });
    const blobRequests = mirror.requests.filter(({ path }) => path.startsWith('blobs/'));
    /* Each payload is asked for once. The package's own files (`packagePath` origins) are asked for too and answered
     * 404, then read from the package; every downloaded payload comes from the mirror, once, with 200. */
    const requested = blobRequests.map(({ path }) => path);
    expect(requested).toHaveLength(new Set(requested).size);
    expect(
      blobRequests
        .filter(({ status }) => status === 200)
        .map(({ path }) => path)
        .toSorted(),
    ).toEqual(payloadPaths.toSorted());

    const exported = await runCli(['export', input, '--ext=glb', `--output=${output}`], environment);
    expect(exported.exitCode, exported.stderr).toBe(0);
    validateGlbData(new Uint8Array(await readFile(output)));
  }, 900_000);
});
