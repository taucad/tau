/**
 * `tau install` over a real project directory with the registry replaced by an
 * injected `fetch`: the command must lock, install, stay warm and refuse
 * tampered bytes exactly as the shared installer does, with no network.
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { runCommand } from 'citty';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { exitCodes } from '#output.js';

const { installCommand } = await import('#commands/install.js');

const encoder = new TextEncoder();

/** Gzipped ustar archive of regular files under `package/`. */
const tarball = (files: Readonly<Record<string, string>>): Uint8Array<ArrayBuffer> => {
  const blocks: Array<Uint8Array<ArrayBuffer>> = [];
  for (const [name, text] of Object.entries(files)) {
    const data = encoder.encode(text);
    const header = new Uint8Array(512);
    header.set(encoder.encode(`package/${name}`), 0);
    header.set(encoder.encode(`${data.length.toString(8).padStart(11, '0')}\0`), 124);
    header.set(encoder.encode('0'), 156);
    header.set(encoder.encode('ustar\u000000'), 257);
    header.fill(0x20, 148, 156);
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.set(encoder.encode(`${checksum.toString(8).padStart(6, '0')}\0 `), 148);
    blocks.push(header, data, new Uint8Array((512 - (data.length % 512)) % 512));
  }
  blocks.push(new Uint8Array(1024));
  return new Uint8Array(gzipSync(Buffer.concat(blocks)));
};

const sri = (bytes: Uint8Array<ArrayBuffer>): string => `sha512-${createHash('sha512').update(bytes).digest('base64')}`;

/** `a@1.0.0` depends on `b@^1`; both serve an `index.js`. */
const publish = (name: string, dependencies: Record<string, string> = {}) => {
  const bytes = tarball({
    'package.json': JSON.stringify({ name, version: '1.0.0', dependencies }),
    'index.js': `export default '${name}';\n`,
  });
  const url = `https://registry.npmjs.org/${name}/-/${name}-1.0.0.tgz`;
  const packument = {
    name,
    'dist-tags': { latest: '1.0.0' },
    versions: { '1.0.0': { name, version: '1.0.0', dependencies, dist: { tarball: url, integrity: sri(bytes) } } },
  };
  return { bytes, url, packument };
};

describe('installCommand', () => {
  let sandbox: string;
  let project: string;
  let stdout: string[];
  let tarballFetches: string[];
  let served: Map<string, Uint8Array<ArrayBuffer>>;

  const packages = [publish('a', { b: '^1' }), publish('b')];

  beforeEach(async () => {
    sandbox = await mkdtemp(join(tmpdir(), 'tau-cli-install-'));
    project = join(sandbox, 'project');
    await mkdir(project);
    await writeFile(join(project, 'package.json'), '{\n  "name": "fixture",\n  "private": true\n}\n');
    vi.stubEnv('TAU_CONFIG_DIR', join(sandbox, 'config'));
    stdout = [];
    tarballFetches = [];
    served = new Map(packages.map(({ url, bytes }) => [url, bytes]));
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
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (input) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const bytes = served.get(url);
        if (bytes !== undefined) {
          tarballFetches.push(url);
          return new Response(new Uint8Array(bytes));
        }
        const packument = packages.find(({ packument: { name } }) => url.endsWith(`/${name}`))?.packument;
        return packument === undefined ? new Response('', { status: 404 }) : Response.json(packument);
      }),
    );
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    await rm(sandbox, { recursive: true, force: true });
  });

  it('locks, installs the transitive tree, stays warm, then prunes a removed package', async () => {
    await runCommand(installCommand, { rawArgs: [project, '--add', 'a@^1', '--add=b@^1'] });

    const manifest = JSON.parse(await readFile(join(project, 'package.json'), 'utf8')) as Record<string, unknown>;
    expect(manifest['dependencies']).toEqual({ a: '^1', b: '^1' });
    const lock = JSON.parse(await readFile(join(project, 'package-lock.json'), 'utf8')) as {
      packages: Record<string, { version?: string; integrity?: string }>;
    };
    expect(Object.keys(lock.packages)).toEqual(['', 'node_modules/a', 'node_modules/b']);
    expect(lock.packages['node_modules/b']?.integrity).toBe(packages[1]?.packument.versions['1.0.0'].dist.integrity);
    expect(await readFile(join(project, 'node_modules/b/index.js'), 'utf8')).toBe("export default 'b';\n");
    expect(stdout.join('')).toBe('2 packages locked (package-lock.json updated); 2 installed, 0 already present.\n');

    tarballFetches = [];
    stdout = [];
    await runCommand(installCommand, { rawArgs: [project] });
    expect(tarballFetches).toEqual([]);
    expect(stdout.join('')).toBe('2 packages locked; 0 installed, 2 already present.\n');

    await runCommand(installCommand, { rawArgs: [project, '--remove', 'a', '--remove', 'b'] });
    expect(existsSync(join(project, 'node_modules/a'))).toBe(false);
    expect(existsSync(join(project, 'node_modules/b'))).toBe(false);
  });

  it('refuses tarball bytes that do not match the lock and writes nothing into node_modules', async () => {
    served.set(packages[1]!.url, tarball({ 'package.json': '{"name":"b","version":"1.0.0"}', 'index.js': 'evil' }));

    await expect(runCommand(installCommand, { rawArgs: [project, '--add', 'a@^1'] })).rejects.toMatchObject({
      code: 'integrity-mismatch',
      exit: exitCodes.refused,
    });
    expect(existsSync(join(project, 'node_modules/b'))).toBe(false);
    expect(existsSync(join(project, 'node_modules/a/index.js'))).toBe(true);
  });

  it('refuses a registry miss before writing package.json or a lock', async () => {
    await expect(runCommand(installCommand, { rawArgs: [project, '--add', 'missing@^1'] })).rejects.toMatchObject({
      code: 'no-matching-version',
      exit: exitCodes.refused,
    });
    expect(existsSync(join(project, 'package-lock.json'))).toBe(false);
  });

  it('asks for a range when --add names only a package', async () => {
    await expect(runCommand(installCommand, { rawArgs: [project, '--add', 'a'] })).rejects.toMatchObject({
      code: 'ARG_ADD_INVALID',
      exit: exitCodes.usage,
    });
  });
});
