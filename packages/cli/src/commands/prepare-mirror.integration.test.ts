/**
 * `tau prepare` as a child process against a loopback `node:http` mirror (charter D27: one mirror test per surface;
 * this is the CLI's). A fixture PicoGK closure, built with `@taucad/runtime-testing/preparation` and pinned to
 * origins under `payloads.invalid`, is written as a seed directory that the mirror serves; a sync loader hook points
 * `@taucad/picogk/tau-plugin.json` at the fixture manifest in the child only. Under no-fallback the mirror is the
 * only source: every blob is requested once, a missing blob fails the command naming the mirror URL, and an offline
 * cold store refuses before any request.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createFixtureClosure, startPayloadMirror, tarGz } from '@taucad/runtime-testing/preparation';
import type { FixtureClosure, PayloadMirror } from '@taucad/runtime-testing/preparation';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolvePath(here, '../../../..');
const binPath = resolvePath(repoRoot, 'packages/cli/src/bin.ts');

const runtimeVersion = '10.0.11';

/** What one `tau prepare` child printed and how it exited. */
type Run = { readonly code: number | undefined; readonly stdout: string; readonly stderr: string };

describe('tau prepare against a loopback mirror (W15, the CLI surface)', () => {
  let scratch = '';
  let closure: FixtureClosure;
  let mirror: PayloadMirror;
  let rosterHook = '';

  const run = async (configDirectory: string, extra: readonly string[] = []): Promise<Run> =>
    new Promise((resolve, reject) => {
      /* Built by assignment so no environment key is a source literal. */
      const env: Record<string, string> = { ...(process.env as Record<string, string>) };
      env['TAU_CONFIG_DIR'] = configDirectory;
      env['TAU_PAYLOAD_MIRROR'] = mirror.url;
      env['TAU_PAYLOAD_MIRROR_NO_FALLBACK'] = '1';
      env['TAU_PAYLOAD_TARGET'] = 'darwin-arm64';
      env['TAU_ACQUISITION'] = '';
      env['TAU_PAYLOAD_DIR'] = '';
      /* A loopback mirror must bypass any proxy the runner sets (S7). */
      env['NO_PROXY'] = '127.0.0.1,localhost';
      env['no_proxy'] = '127.0.0.1,localhost';
      const child = spawn(
        process.execPath,
        [
          '--import',
          'tsx',
          '--import',
          pathToFileURL(rosterHook).href,
          binPath,
          'prepare',
          'picogk',
          '--json',
          ...extra,
        ],
        { cwd: repoRoot, env, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
        stderr += chunk;
      });
      child.once('error', reject);
      child.once('exit', (code) => {
        resolve({ code: code ?? undefined, stdout, stderr });
      });
    });

  const blobRequests = (): string[] =>
    mirror.requests.filter(({ path }) => path.startsWith('blobs/')).map(({ path, status }) => `${path} ${status}`);

  beforeAll(async () => {
    scratch = await mkdtemp(join(tmpdir(), 'tau-prepare-mirror-'));
    closure = await createFixtureClosure({
      package: '@taucad/picogk',
      dependency: 'runtime',
      kernel: { name: 'picogk', extensions: ['cs'] },
      targets: [{ runtime: 'native', os: 'darwin', arch: 'arm64', minimumOsVersion: '14.0' }],
      payloads: [
        {
          name: 'dotnet',
          bytes: tarGz(
            { name: 'dotnet', data: 'muxer', mode: 0o755 },
            { name: `host/fxr/${runtimeVersion}/libhostfxr.dylib`, data: 'hostfxr' },
            { name: `shared/Microsoft.NETCore.App/${runtimeVersion}/libhostpolicy.dylib`, data: 'hostpolicy' },
            { name: `shared/Microsoft.NETCore.App/${runtimeVersion}/System.Private.CoreLib.dll`, data: 'corelib' },
          ),
          format: 'tar.gz',
          destination: 'dotnet',
          urls: ['https://payloads.invalid/dotnet.tar.gz'],
        },
        {
          name: 'worker',
          bytes: tarGz(
            { name: 'Tau.PicoGK.Worker.dll', data: 'worker' },
            { name: 'Tau.PicoGK.Worker.runtimeconfig.json', data: '{}' },
            { name: 'PicoGK.dll', data: 'picogk' },
            { name: 'picogk.26.2.dylib', data: 'engine' },
          ),
          format: 'tar.gz',
          destination: 'tau-worker',
          urls: ['https://payloads.invalid/worker.tar.gz'],
        },
      ],
    });
    const manifest = join(scratch, 'picogk-tau-plugin.json');
    await closure.writeManifest(manifest);
    await closure.writeSeed(join(scratch, 'seed'));
    mirror = await startPayloadMirror(join(scratch, 'seed'));
    rosterHook = join(scratch, 'native-roster.mjs');
    await writeFile(
      rosterHook,
      `import { registerHooks } from 'node:module';
registerHooks({
  resolve: (specifier, context, next) =>
    specifier === '@taucad/picogk/tau-plugin.json'
      ? { url: ${JSON.stringify(pathToFileURL(manifest).href)}, format: "json", shortCircuit: true }
      : next(specifier, context),
});
`,
    );
  });

  afterAll(async () => {
    await mirror.close();
    await rm(scratch, { recursive: true, force: true });
  });

  it('should refuse an offline cold store with exit 3 before any request', async () => {
    const result = await run(join(scratch, 'offline'), ['--offline']);

    expect(result.code, result.stderr).toBe(3);
    expect(`${result.stdout}${result.stderr}`).toContain('offline');
    expect(mirror.requests).toEqual([]);
  }, 120_000);

  it('should prepare from the mirror alone, one request per blob, then reuse the store with none', async () => {
    const config = join(scratch, 'config');
    const first = await run(config);
    const requested = blobRequests();
    const second = await run(config);

    expect(first.code, first.stderr).toBe(0);
    expect(JSON.parse(first.stdout)).toMatchObject({
      status: 'ready',
      kernel: 'picogk',
      closureIntegrity: closure.closureIntegrity,
    });
    expect(requested.toSorted()).toEqual(closure.payloads.map(({ sha256 }) => `blobs/sha256/${sha256} 200`).toSorted());
    expect(second.code, second.stderr).toBe(0);
    expect(blobRequests()).toEqual(requested);
  }, 120_000);

  it('should fail naming the mirror URL when the mirror misses a blob, and never fall back to the origin', async () => {
    const worker = `blobs/sha256/${closure.payloads[1]!.sha256}`;
    mirror.override(worker, { status: 404 });
    const before = mirror.requests.length;

    const result = await run(join(scratch, 'missing'));

    expect(result.code).toBe(3);
    expect(`${result.stdout}${result.stderr}`).toContain(`${mirror.url}${worker}`);
    expect(`${result.stdout}${result.stderr}`).not.toContain('payloads.invalid/worker');
    expect(mirror.requests.slice(before)).toContainEqual({ method: 'GET', path: worker, status: 404 });
  }, 120_000);
});
