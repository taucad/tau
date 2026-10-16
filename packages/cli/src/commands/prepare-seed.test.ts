/**
 * `tau prepare --bundle`, `--verify-seed`, `--seed` and `--audit` in process over real stores under `TAU_CONFIG_DIR`
 * (charter D25, D26). A fixture plugin package with a manifest, a CycloneDX SBOM and supplemental notices is prepared
 * from an injected registry on machine A, exported, and restored on machine B whose `fetch` throws: B's receipt must
 * equal A's (S26's round trip), and the audit must hold with no request.
 */

import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ClosureReceipt } from '@taucad/runtime/preparation/node';
import { createFixtureClosure } from '@taucad/runtime-testing/preparation';
import type { FixtureClosure } from '@taucad/runtime-testing/preparation';
import { runCommand } from 'citty';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { auditClosure, integrityHex } from '#commands/prepare-seed.js';
import type { SeedIndex } from '#commands/prepare-seed.js';
import { exitCodes } from '#output.js';

const { createPrepareCommand } = await import('#commands/prepare.js');

const encoder = new TextEncoder();

// Native kernels are refused on Windows and on a musl host; the scenarios below need a host the manifest declares.
const supported =
  (process.platform === 'darwin' || process.platform === 'linux') &&
  (process.arch === 'x64' || process.arch === 'arm64');

const sbomFor = (closure: FixtureClosure, omit?: string): Record<string, unknown> => ({
  bomFormat: 'CycloneDX',
  specVersion: '1.6',
  version: 1,
  metadata: { component: { type: 'application', name: closure.package } },
  components: closure.payloads
    .filter(({ payload }) => payload.name !== omit)
    .map(({ payload, sha256 }) => ({
      type: 'library',
      name: payload.name,
      purl: `pkg:generic/${payload.name}@1.0.0`,
      hashes: [{ alg: 'SHA-256', content: sha256 }],
      externalReferences: payload.origin.kind === 'url' ? [{ type: 'distribution', url: payload.origin.urls[0] }] : [],
    })),
});

describe.runIf(supported)('tau prepare --bundle, --verify-seed, --seed and --audit', () => {
  let sandbox: string;
  let packageDirectory: string;
  let closure: FixtureClosure;
  let stdout: string[];
  let fetches: string[];

  const command = (machine: 'a' | 'b') =>
    createPrepareCommand({
      plugins: async () => [closure.plugin({ directory: packageDirectory })],
      hostPath: join(sandbox, machine, 'tau.mjs'),
      fetch: async (input) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        fetches.push(url);
        if (machine === 'b') {
          throw new TypeError('fetch failed: machine B has no network');
        }
        const bytes = closure.routes.get(url);
        return bytes === undefined ? new Response('', { status: 404 }) : new Response(new Uint8Array(bytes));
      },
    });

  const on = (machine: 'a' | 'b'): void => {
    vi.stubEnv('TAU_CONFIG_DIR', join(sandbox, machine, 'config'));
  };

  const records = (): Array<Record<string, unknown>> =>
    stdout
      .join('')
      .split('\n')
      .filter((line) => line.startsWith('{'))
      .map((line) => JSON.parse(line) as Record<string, unknown>);

  const receiptOf = async (machine: 'a' | 'b'): Promise<Record<string, unknown>> => {
    const root = join(sandbox, machine, 'config', 'payloads', 'closures', 'sha256');
    const [hex] = await readdir(root);
    return JSON.parse(await readFile(join(root, hex ?? '', 'receipt.json'), 'utf8')) as Record<string, unknown>;
  };

  const identity = ({
    files,
    closureIntegrity,
    treeIntegrity,
    target,
    package: name,
    dependency,
  }: Record<string, unknown>) => ({
    package: name,
    dependency,
    target,
    closureIntegrity,
    treeIntegrity,
    files,
  });

  beforeEach(async () => {
    sandbox = await mkdtemp(join(tmpdir(), 'tau-cli-seed-'));
    closure = await createFixtureClosure({
      package: '@taucad/demo',
      kernel: { name: 'demo', extensions: ['py'] },
      payloads: [
        { name: 'runtime.py', bytes: encoder.encode('print("runtime")\n'), format: 'raw', destination: 'bin' },
        // A payload that carries its own licence text, as a wheel's `dist-info/licenses/` does.
        { name: 'LICENSE', bytes: encoder.encode('MIT License\n'), format: 'raw', destination: 'licenses/engine' },
        {
          name: 'engine.dat',
          bytes: encoder.encode('engine bytes\n'),
          format: 'raw',
          destination: 'lib',
          algorithm: 'sha512',
        },
      ],
    });
    packageDirectory = join(sandbox, 'node_modules', '@taucad', 'demo');
    await closure.writeManifest(join(packageDirectory, 'tau-plugin.json'));
    await writeFile(join(packageDirectory, 'package.json'), '{ "name": "@taucad/demo", "version": "1.2.3" }\n');
    await writeFile(join(packageDirectory, 'tau-plugin.cdx.json'), JSON.stringify(sbomFor(closure)));
    await Promise.all(
      ['runtime.py', 'engine.dat'].map(async (name) => {
        await mkdir(join(packageDirectory, 'notices', name), { recursive: true });
        await writeFile(join(packageDirectory, 'notices', name, 'LICENSE'), `${name} licence\n`);
      }),
    );
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
    await Promise.all(
      ['a', 'b'].map(async (machine) => {
        await mkdir(join(sandbox, machine), { recursive: true });
        await writeFile(join(sandbox, machine, 'tau.mjs'), '// host installation\n');
      }),
    );
    on('a');
    stdout = [];
    fetches = [];
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

  it('should restore on a machine with no network the receipt the bundling machine sealed, and audit it there', async () => {
    const bundle = join(sandbox, 'bundle');
    await runCommand(command('a'), { rawArgs: ['--bundle', bundle, '--json'] });
    const [bundled] = records();
    const index = JSON.parse(await readFile(join(bundle, 'tau-seed.json'), 'utf8')) as SeedIndex;

    on('b');
    stdout = [];
    await runCommand(command('b'), { rawArgs: ['--verify-seed', bundle, '--json'] });
    await runCommand(command('b'), { rawArgs: ['--seed', bundle, '--json'] });
    await runCommand(command('b'), { rawArgs: ['--audit', '--json'] });
    const [verified, seeded, audited] = records();

    expect(bundled).toMatchObject({ kind: 'bundle', kernels: ['demo'], indexed: 1 });
    expect(index).toMatchObject({
      schemaVersion: 1,
      closures: [
        {
          package: '@taucad/demo',
          version: '1.2.3',
          dependency: 'engine',
          closureIntegrity: closure.closureIntegrity,
          audit: `notices/${integrityHex(closure.closureIntegrity).hex}`,
          payloads: closure.payloads.map(({ payload, sha256 }) => ({
            name: payload.name,
            integrity: payload.integrity,
            byteLength: payload.byteLength,
            format: 'raw',
            blob: `blobs/sha256/${sha256}`,
          })),
        },
      ],
    });
    expect(verified).toMatchObject({ kind: 'verify-seed', ok: true, blobs: 3, problems: [] });
    expect(seeded).toMatchObject({ kind: 'seed', status: 'ready', kernels: ['demo'] });
    expect(audited).toMatchObject({
      kind: 'audit',
      ok: true,
      closures: [
        {
          package: '@taucad/demo',
          files: 'intact',
          sbom: [],
          notices: [],
          noticeFiles: [
            'licenses/engine/LICENSE',
            'supplemental/engine.dat/LICENSE',
            'supplemental/runtime.py/LICENSE',
          ],
        },
      ],
    });
    expect(identity(await receiptOf('b'))).toEqual(identity(await receiptOf('a')));
    expect(fetches).toHaveLength(3);
    expect(fetches.every((url) => url.startsWith('https://registry.example/'))).toBe(true);
    expect(await readdir(join(bundle, index.closures[0]?.audit ?? '', 'NOTICES', 'licenses', 'engine'))).toEqual([
      'LICENSE',
    ]);
  });

  it('should refuse a bundle whose blob was altered, naming the blob, before anything is prepared', async () => {
    const bundle = join(sandbox, 'bundle');
    await runCommand(command('a'), { rawArgs: ['--bundle', bundle] });
    const [runtime] = closure.payloads;
    await writeFile(join(bundle, 'blobs', 'sha256', runtime?.sha256 ?? ''), 'tampered\n');
    on('b');
    stdout = [];

    await expect(runCommand(command('b'), { rawArgs: ['--verify-seed', bundle, '--json'] })).rejects.toMatchObject({
      code: 'SEED_INVALID',
      exit: exitCodes.refused,
    });
    expect(records()[0]).toMatchObject({
      kind: 'verify-seed',
      ok: false,
      problems: expect.arrayContaining([
        {
          path: `blobs/sha256/${runtime?.sha256 ?? ''}`,
          problem: expect.stringContaining('not to its name') as unknown,
        },
      ]) as unknown,
    });
    // The host refuses the altered blob by itself too (G2): nothing is sealed from it.
    await expect(runCommand(command('b'), { rawArgs: ['--seed', bundle] })).rejects.toMatchObject({
      code: 'INTEGRITY_MISMATCH',
      exit: exitCodes.refused,
      message: expect.stringContaining('runtime.py') as unknown,
    });
    expect(await readdir(join(sandbox, 'b', 'config', 'payloads', 'closures', 'sha256')).catch(() => [])).toEqual([]);
  });

  it('should fail the audit when a sealed file changed, without a request', async () => {
    await runCommand(command('a'), { rawArgs: ['demo'] });
    const receipt = await receiptOf('a');
    await writeFile(join(String(receipt['root']), 'bin', 'runtime.py'), 'tampered\n');
    const before = fetches.length;
    stdout = [];

    await expect(runCommand(command('a'), { rawArgs: ['--audit', '--json'] })).rejects.toMatchObject({
      code: 'AUDIT_FAILED',
      exit: exitCodes.refused,
    });
    expect(records()[0]).toMatchObject({ kind: 'audit', ok: false, closures: [{ files: 'stale' }] });
    expect(fetches).toHaveLength(before);
  });

  it('should refuse to bundle a closure whose SBOM misses a payload, and write no index', async () => {
    await writeFile(join(packageDirectory, 'tau-plugin.cdx.json'), JSON.stringify(sbomFor(closure, 'engine.dat')));
    const bundle = join(sandbox, 'bundle');

    await expect(runCommand(command('a'), { rawArgs: ['--bundle', bundle] })).rejects.toMatchObject({
      code: 'AUDIT_FAILED',
      exit: exitCodes.refused,
      message: expect.stringContaining('no SBOM component for engine.dat') as unknown,
    });
    await expect(readFile(join(bundle, 'tau-seed.json'), 'utf8')).rejects.toThrow('ENOENT');
  });
});

describe('auditClosure', () => {
  it('should require a purl and the distribution URL for a payload fetched from a registry, and a notice', async () => {
    const closure = await createFixtureClosure({
      payloads: [{ name: 'wheel', bytes: encoder.encode('wheel\n'), format: 'raw', destination: 'lib' }],
    });
    const [only] = closure.payloads;
    const receipt: Pick<ClosureReceipt, 'package' | 'dependency' | 'closureIntegrity' | 'files' | 'payloads'> = {
      package: closure.package,
      dependency: closure.dependency,
      closureIntegrity: closure.closureIntegrity,
      files: [{ path: 'lib/wheel', byteLength: 6, sha256: only?.sha256 ?? '', mode: 0o644, payload: 'wheel' }],
      payloads: [
        {
          name: 'wheel',
          integrity: only?.payload.integrity ?? 'sha256-',
          sha256: only?.sha256 ?? '',
          acquiredFrom: { kind: 'origin', location: 'https://registry.example/payloads/wheel' },
        },
      ],
    };
    const bare = {
      bomFormat: 'CycloneDX',
      specVersion: '1.6',
      components: [{ name: 'wheel', hashes: [{ alg: 'SHA-256', content: only?.sha256 }] }],
    };

    const row = auditClosure({
      plugin: closure.plugin(),
      sbom: bare,
      supplemental: new Map(),
      receipt,
      files: 'intact',
    });

    expect(row).toEqual({
      package: closure.package,
      dependency: closure.dependency,
      closureIntegrity: closure.closureIntegrity,
      files: 'intact',
      sbom: ['wheel'],
      notices: ['wheel'],
      noticeFiles: [],
      ok: false,
    });
  });
});
