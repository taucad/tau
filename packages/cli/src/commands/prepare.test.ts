/**
 * `tau prepare` in process over a real store under `TAU_CONFIG_DIR`, with an in-test plugin manifest and the
 * registry replaced by an injected `fetch`: the command must prepare, report, verify, collect garbage and refuse
 * with the scripted exit codes, with no network.
 */

import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { computeClosureIntegrity, parsePluginDeployment } from '@taucad/runtime/preparation/node';
import type { DependencyPayload, PreparationPlugin } from '@taucad/runtime/preparation/node';
import { runCommand } from 'citty';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { exitCodes } from '#output.js';

const { createPrepareCommand } = await import('#commands/prepare.js');

const encoder = new TextEncoder();

const rawPayload = (
  name: string,
  text: string,
): { readonly payload: DependencyPayload; readonly bytes: Uint8Array<ArrayBuffer> } => {
  const bytes = encoder.encode(text);
  return {
    bytes,
    payload: {
      name,
      integrity: `sha256-${createHash('sha256').update(bytes).digest('base64')}`,
      byteLength: bytes.byteLength,
      format: 'raw',
      origin: { kind: 'url', urls: [`https://registry.example/${name}`] },
      destination: 'bin',
    },
  };
};

const runtime = rawPayload('runtime.py', 'print("runtime")\n');
const worker = rawPayload('worker.py', 'print("ready")\n');
const payloads = [runtime.payload, worker.payload] as const;

const plugin: PreparationPlugin = {
  package: '@taucad/demo',
  deployment: parsePluginDeployment({
    schemaVersion: 1,
    dependencies: {
      engine: [
        { target: { runtime: 'native', os: 'linux', arch: 'x64', libc: 'glibc' }, payloads },
        { target: { runtime: 'native', os: 'linux', arch: 'arm64', libc: 'glibc' }, payloads },
        { target: { runtime: 'native', os: 'darwin', arch: 'arm64' }, payloads },
        { target: { runtime: 'native', os: 'darwin', arch: 'x64' }, payloads },
      ],
    },
    kernels: { demo: { requires: ['engine'], extensions: ['py'] } },
  }),
};

// Native kernels are refused on Windows and on a musl host; the scenarios below need a host the manifest declares.
const supported =
  (process.platform === 'darwin' || process.platform === 'linux') &&
  (process.arch === 'x64' || process.arch === 'arm64');

describe.runIf(supported)('tau prepare', () => {
  let sandbox: string;
  let hostPath: string;
  let stdout: string[];
  let fetches: string[];
  let served: Map<string, Uint8Array<ArrayBuffer>>;

  const command = () =>
    createPrepareCommand({
      plugins: async () => [plugin],
      hostPath,
      fetch: async (input) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        fetches.push(url);
        const bytes = served.get(url);
        return bytes === undefined ? new Response('', { status: 404 }) : new Response(new Uint8Array(bytes));
      },
    });

  const records = (): Array<Record<string, unknown>> =>
    stdout
      .join('')
      .split('\n')
      .filter((line) => line.startsWith('{'))
      .map((line) => JSON.parse(line) as Record<string, unknown>);

  beforeEach(async () => {
    sandbox = await mkdtemp(join(tmpdir(), 'tau-cli-prepare-'));
    hostPath = join(sandbox, 'tau.mjs');
    await writeFile(hostPath, '// host installation\n');
    vi.stubEnv('TAU_CONFIG_DIR', join(sandbox, 'config'));
    for (const name of [
      'TAU_ACQUISITION',
      'TAU_PAYLOAD_MIRROR',
      'TAU_PAYLOAD_MIRROR_NO_FALLBACK',
      'TAU_PAYLOAD_DIR',
      'TAU_PAYLOAD_TARGET',
      'TAU_PAYLOAD_EMULATION',
    ]) {
      vi.stubEnv(name, '');
    }
    stdout = [];
    fetches = [];
    served = new Map([
      ['https://registry.example/runtime.py', runtime.bytes],
      ['https://registry.example/worker.py', worker.bytes],
    ]);
    vi.spyOn(process.stdout, 'write').mockImplementation(((
      chunk: string | Uint8Array<ArrayBuffer>,
      ...rest: unknown[]
    ) => {
      stdout.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      const callback = rest.at(-1);
      if (typeof callback === 'function') {
        (callback as () => void)();
      }
      return true;
    }) as typeof process.stdout.write);
    vi.stubGlobal('fetch', async () => {
      throw new Error('tau prepare tests are hermetic; the global fetch must not be called.');
    });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    await rm(sandbox, { recursive: true, force: true });
  });

  it('should prepare a kernel, print one ready record and prepare again with no download', async () => {
    await runCommand(command(), { rawArgs: ['demo', '--json'] });

    const [record] = records();
    expect(record).toEqual({
      v: 1,
      kind: 'prepare',
      status: 'ready',
      kernel: 'demo',
      closureIntegrity: await computeClosureIntegrity(payloads),
      treeIntegrity: expect.stringMatching(/^sha256-/u) as unknown,
      byteLength: runtime.bytes.byteLength + worker.bytes.byteLength,
    });
    expect(fetches).toHaveLength(2);

    stdout = [];
    await runCommand(command(), { rawArgs: ['demo', '--json'] });
    expect(records()[0]).toEqual(record);
    expect(fetches).toHaveLength(2);
  });

  it('should exit 3 with OFFLINE_MISS and make no request when --offline finds a cold store', async () => {
    await expect(runCommand(command(), { rawArgs: ['demo', '--offline', '--json'] })).rejects.toMatchObject({
      code: 'OFFLINE_MISS',
      exit: exitCodes.refused,
    });
    expect(fetches).toEqual([]);
  });

  it('should treat TAU_ACQUISITION=locked without a mirror as offline', async () => {
    vi.stubEnv('TAU_ACQUISITION', 'locked');

    await expect(runCommand(command(), { rawArgs: ['demo'] })).rejects.toMatchObject({
      code: 'OFFLINE_MISS',
      exit: exitCodes.refused,
    });
    expect(fetches).toEqual([]);
  });

  it('should exit 2 naming the kernels that can be prepared for an unknown kernel', async () => {
    await expect(runCommand(command(), { rawArgs: ['openscad'] })).rejects.toMatchObject({
      code: 'UNKNOWN_KERNEL',
      exit: exitCodes.usage,
      message: "No native kernel is called 'openscad'. Kernels that can be prepared: demo.",
    });
  });

  it('should exit 2 for a managed variable no host can honour', async () => {
    vi.stubEnv('TAU_ACQUISITION', 'closed');

    await expect(runCommand(command(), { rawArgs: ['demo'] })).rejects.toMatchObject({
      code: 'MANAGED_PROFILE_INVALID',
      exit: exitCodes.usage,
    });
  });

  it('should exit 3 with DOWNLOAD_FAILED naming the URL when the registry misses a payload', async () => {
    served.delete('https://registry.example/worker.py');

    await expect(runCommand(command(), { rawArgs: ['demo'] })).rejects.toMatchObject({
      code: 'DOWNLOAD_FAILED',
      exit: exitCodes.refused,
      message: expect.stringContaining('https://registry.example/worker.py') as unknown,
    });
  });

  it('should print the effective profile and the store state with --inspect --json', async () => {
    await runCommand(command(), { rawArgs: ['--inspect', '--json'] });
    await runCommand(command(), { rawArgs: ['demo'] });
    stdout = [];
    await runCommand(command(), { rawArgs: ['--inspect', '--json'] });

    expect(records()[0]).toMatchObject({
      v: 1,
      kind: 'profile',
      profile: 'open',
      store: join(sandbox, 'config', 'payloads'),
      noFallback: false,
      emulation: true,
      closures: [{ package: '@taucad/demo', dependency: 'engine', state: 'ready' }],
    });
    expect(fetches).toHaveLength(2);
  });

  it('G1: should make no request on a warm store under TAU_ACQUISITION=locked: prepare and inspect read receipts only', async () => {
    await runCommand(command(), { rawArgs: ['demo'] });
    expect(fetches).toHaveLength(2);
    vi.stubEnv('TAU_ACQUISITION', 'locked');
    stdout = [];

    await runCommand(command(), { rawArgs: ['demo', '--json'] });
    await runCommand(command(), { rawArgs: ['--inspect', '--json'] });

    expect(records().map(({ kind, status, profile }) => ({ kind, status, profile }))).toEqual([
      { kind: 'prepare', status: 'ready', profile: undefined },
      { kind: 'profile', status: undefined, profile: 'locked' },
    ]);
    expect(fetches).toHaveLength(2);
  });

  it('G6: should print the effective profile an auditor reads, naming the variables set but never their values', async () => {
    /* eslint-disable @typescript-eslint/naming-convention -- environment variable names */
    const environment = {
      TAU_ACQUISITION: 'locked',
      TAU_PAYLOAD_MIRROR: 'https://mirror.corp.example/tau/',
      TAU_PAYLOAD_DIR: join(sandbox, 'seed'),
      TAU_PAYLOAD_EMULATION: '0',
      HTTPS_PROXY: 'http://user:proxy-secret@proxy.corp.example:3128',
      NODE_USE_ENV_PROXY: '1',
      NODE_EXTRA_CA_CERTS: '/etc/corp/ca.pem',
    };
    /* eslint-enable @typescript-eslint/naming-convention -- end of the environment variable names */
    for (const [name, value] of Object.entries(environment)) {
      vi.stubEnv(name, value);
    }

    await runCommand(command(), { rawArgs: ['--inspect', '--json'] });

    expect(records()[0]).toMatchObject({
      kind: 'profile',
      profile: 'locked',
      store: join(sandbox, 'config', 'payloads'),
      mirror: 'https://mirror.corp.example/tau/',
      noFallback: true,
      seed: join(sandbox, 'seed'),
      emulation: false,
      proxy: 'env-proxy',
      ca: 'extra',
      variables: expect.arrayContaining([...Object.keys(environment), 'TAU_CONFIG_DIR']) as unknown,
      closures: [{ package: '@taucad/demo', dependency: 'engine', state: 'absent' }],
    });
    expect(stdout.join('')).not.toContain('proxy-secret');
    expect(fetches).toEqual([]);
  });

  it('should repair a tampered closure with --verify and report it', async () => {
    await runCommand(command(), { rawArgs: ['demo', '--json'] });
    const store = join(sandbox, 'config', 'payloads');
    const [closure] = await readdir(join(store, 'closures', 'sha256'));
    const workerPath = join(store, 'closures', 'sha256', closure ?? '', 'bin', 'worker.py');
    await writeFile(workerPath, 'tampered\n');
    stdout = [];

    await runCommand(command(), { rawArgs: ['--verify', '--json'] });

    expect(records()[0]).toMatchObject({
      kind: 'verify',
      closures: [{ package: '@taucad/demo', dependency: 'engine', status: 'repaired', payloads: ['worker.py'] }],
    });
    expect(await readFile(workerPath, 'utf8')).toBe('print("ready")\n');
  });

  it('should report what --gc --dry-run would remove and remove nothing', async () => {
    await runCommand(command(), { rawArgs: ['demo'] });
    await rm(hostPath);
    stdout = [];

    await runCommand(command(), { rawArgs: ['--gc', '--dry-run', '--json'] });
    const [report] = records();
    stdout = [];
    await runCommand(command(), { rawArgs: ['--gc', '--json'] });

    expect(report).toMatchObject({ kind: 'gc', dryRun: true, links: [expect.any(String)] });
    expect(report?.['closures']).toHaveLength(1);
    expect(records()[0]).toMatchObject({ kind: 'gc', dryRun: false, closures: report?.['closures'] });
  });

  it('should ask for a kernel when none is named', async () => {
    await expect(runCommand(command(), { rawArgs: [] })).rejects.toMatchObject({
      code: 'ARG_KERNEL_MISSING',
      exit: exitCodes.usage,
    });
  });
});
