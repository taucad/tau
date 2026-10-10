import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

import { describe, expect, it, vi } from 'vitest';

import type { BundlerFileSystem } from '#package-artifact-cache.js';
import type { PackageLock, PackageLockEntry } from '#package-lock.types.js';
import { installStatePath } from '#package-lock.types.js';
import { materializePackages } from '#package-materialize.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Gzipped ustar archive of regular files under `package/`, built by hand. */
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
    header.set(
      encoder.encode(
        `${header
          .reduce((sum, byte) => sum + byte, 0)
          .toString(8)
          .padStart(6, '0')}\0 `,
      ),
      148,
    );
    blocks.push(header, data, new Uint8Array((512 - (data.length % 512)) % 512));
  }
  blocks.push(new Uint8Array(1024));
  const archive = new Uint8Array(blocks.reduce((length, block) => length + block.length, 0));
  let offset = 0;
  for (const block of blocks) {
    archive.set(block, offset);
    offset += block.length;
  }
  return new Uint8Array(gzipSync(archive));
};

const sri = (bytes: Uint8Array<ArrayBuffer>): string => `sha512-${createHash('sha512').update(bytes).digest('base64')}`;

type Published = { readonly entry: PackageLockEntry; readonly bytes: Uint8Array<ArrayBuffer> };

const publish = (
  name: string,
  files: Readonly<Record<string, string>>,
  extra: Partial<PackageLockEntry> = {},
): Published => {
  const bytes = tarball({ 'package.json': JSON.stringify({ name, version: '1.0.0' }), ...files });
  return {
    bytes,
    entry: {
      version: '1.0.0',
      resolved: `https://registry.npmjs.org/${name}/-/${name}-1.0.0.tgz`,
      integrity: sri(bytes),
      ...extra,
    },
  };
};

const lockOf = (packages: Readonly<Record<string, Published>>): PackageLock => ({
  lockfileVersion: 3,
  requires: true,
  packages: {
    '': { version: '1.0.0', name: 'project' },
    ...Object.fromEntries(Object.entries(packages).map(([path, { entry }]) => [path, entry])),
  },
});

const createRegistry = (packages: readonly Published[]): ReturnType<typeof vi.fn<typeof fetch>> => {
  const tarballs = new Map(packages.map(({ entry, bytes }) => [entry.resolved, bytes]));
  return vi.fn<typeof fetch>(async (input) => {
    const bytes = tarballs.get(new Request(input).url);
    return bytes === undefined ? new Response(undefined, { status: 404 }) : new Response(bytes);
  });
};

const createMemoryFileSystem = (
  options: { readonly removable?: boolean } = {},
): BundlerFileSystem & { readonly files: Map<string, Uint8Array<ArrayBuffer>> } => {
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  async function readFile(path: string, encoding: 'utf8'): Promise<string>;
  async function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  async function readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    const value = files.get(path);
    if (value === undefined) {
      throw new Error(`ENOENT: ${path}`);
    }
    return encoding === 'utf8' ? decoder.decode(value) : value;
  }
  const filesystem = {
    files,
    exists: async (path: string) => files.has(path) || [...files.keys()].some((key) => key.startsWith(`${path}/`)),
    readFile,
    writeFile: async (path: string, content: string | Uint8Array<ArrayBuffer>) => {
      files.set(path, typeof content === 'string' ? encoder.encode(content) : content);
    },
    ensureDir: async () => undefined,
  };
  if (options.removable === false) {
    return filesystem;
  }
  return {
    ...filesystem,
    remove: async (path: string) => {
      for (const key of files.keys()) {
        if (key === path || key.startsWith(`${path}/`)) {
          files.delete(key);
        }
      }
    },
  };
};

const text = (
  filesystem: { readonly files: Map<string, Uint8Array<ArrayBuffer>> },
  path: string,
): string | undefined => {
  const bytes = filesystem.files.get(path);
  return bytes === undefined ? undefined : decoder.decode(bytes);
};

const isNumber = publish('is-number', { 'index.js': 'module.exports = 1;' });
const d3Shape = publish('d3-shape', { 'src/index.js': 'export * from "d3-path";' });
const d3Path = publish('d3-path', { 'src/path.js': 'export const path = 1;' });
const tree = {
  'node_modules/is-number': isNumber,
  'node_modules/d3-shape': d3Shape,
  'node_modules/d3-shape/node_modules/d3-path': d3Path,
};

describe('materializePackages', () => {
  it('should extract every verified tarball into its lock path and record the install state', async () => {
    const filesystem = createMemoryFileSystem();
    const fetchMock = createRegistry([isNumber, d3Shape, d3Path]);

    const result = await materializePackages({
      filesystem,
      lock: lockOf(tree),
      fetch: fetchMock,
      signal: AbortSignal.timeout(5000),
    });

    expect(result).toEqual({
      installed: ['node_modules/d3-shape', 'node_modules/d3-shape/node_modules/d3-path', 'node_modules/is-number'],
      skipped: [],
      issues: [],
    });
    expect(text(filesystem, 'node_modules/is-number/index.js')).toBe('module.exports = 1;');
    expect(text(filesystem, 'node_modules/d3-shape/node_modules/d3-path/src/path.js')).toBe('export const path = 1;');
    expect(JSON.parse(text(filesystem, installStatePath) ?? '')).toEqual({
      schemaVersion: 1,
      installed: {
        'node_modules/d3-shape': d3Shape.entry.integrity,
        'node_modules/d3-shape/node_modules/d3-path': d3Path.entry.integrity,
        'node_modules/is-number': isNumber.entry.integrity,
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('should perform zero fetches when the tree already matches the lock', async () => {
    const filesystem = createMemoryFileSystem();
    await materializePackages({
      filesystem,
      lock: lockOf(tree),
      fetch: createRegistry([isNumber, d3Shape, d3Path]),
      signal: AbortSignal.timeout(5000),
    });
    const warmFetch = createRegistry([]);

    const result = await materializePackages({
      filesystem,
      lock: lockOf(tree),
      fetch: warmFetch,
      signal: AbortSignal.timeout(5000),
    });

    expect(warmFetch).not.toHaveBeenCalled();
    expect(result).toEqual({ installed: [], skipped: Object.keys(tree).toSorted(), issues: [] });
  });

  it('should refetch a recorded package whose package.json is missing', async () => {
    const filesystem = createMemoryFileSystem();
    const lock = lockOf({ 'node_modules/is-number': isNumber });
    await materializePackages({
      filesystem,
      lock,
      fetch: createRegistry([isNumber]),
      signal: AbortSignal.timeout(5000),
    });
    filesystem.files.delete('node_modules/is-number/package.json');
    const fetchMock = createRegistry([isNumber]);

    const result = await materializePackages({ filesystem, lock, fetch: fetchMock, signal: AbortSignal.timeout(5000) });

    expect(result.installed).toEqual(['node_modules/is-number']);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('should refuse tampered tarball bytes before writing anything', async () => {
    const filesystem = createMemoryFileSystem();
    const tampered = { ...isNumber, bytes: tarball({ 'package.json': '{}', 'index.js': 'steal();' }) };

    const result = await materializePackages({
      filesystem,
      lock: lockOf({ 'node_modules/is-number': isNumber }),
      fetch: createRegistry([tampered]),
      signal: AbortSignal.timeout(5000),
    });

    expect(result.installed).toEqual([]);
    expect(result.issues).toEqual([
      {
        code: 'integrity-mismatch',
        path: 'node_modules/is-number',
        name: 'is-number',
        message:
          "'is-number' tarball does not match the integrity in package-lock.json. Nothing was written; check the registry or reinstall.",
      },
    ]);
    expect([...filesystem.files.keys()]).toEqual([]);
  });

  it('should remove a reinstalled package directory before extracting the new version', async () => {
    const filesystem = createMemoryFileSystem();
    const old = publish('is-number', { 'old.js': 'old' });
    await materializePackages({
      filesystem,
      lock: lockOf({ 'node_modules/is-number': old }),
      fetch: createRegistry([old]),
      signal: AbortSignal.timeout(5000),
    });

    await materializePackages({
      filesystem,
      lock: lockOf({ 'node_modules/is-number': isNumber }),
      fetch: createRegistry([isNumber]),
      signal: AbortSignal.timeout(5000),
    });

    expect(text(filesystem, 'node_modules/is-number/old.js')).toBeUndefined();
    expect(text(filesystem, 'node_modules/is-number/index.js')).toBe('module.exports = 1;');
  });

  it('should prune a package that is no longer in the lock', async () => {
    const filesystem = createMemoryFileSystem();
    await materializePackages({
      filesystem,
      lock: lockOf(tree),
      fetch: createRegistry([isNumber, d3Shape, d3Path]),
      signal: AbortSignal.timeout(5000),
    });

    const result = await materializePackages({
      filesystem,
      lock: lockOf({ 'node_modules/is-number': isNumber }),
      fetch: createRegistry([]),
      signal: AbortSignal.timeout(5000),
    });

    expect(result).toEqual({ installed: [], skipped: ['node_modules/is-number'], issues: [] });
    expect([...filesystem.files.keys()].filter((path) => path.startsWith('node_modules/d3-'))).toEqual([]);
    expect(JSON.parse(text(filesystem, installStatePath) ?? '')).toEqual({
      schemaVersion: 1,
      installed: { 'node_modules/is-number': isNumber.entry.integrity },
    });
  });

  it('should ignore tampered install-state keys outside node_modules instead of removing them', async () => {
    const filesystem = createMemoryFileSystem();
    await filesystem.writeFile('src/main.ts', 'export {};');
    await filesystem.writeFile(
      installStatePath,
      JSON.stringify({ schemaVersion: 1, installed: { src: 'sha512-x', 'node_modules/../src': 'sha512-x' } }),
    );

    const result = await materializePackages({
      filesystem,
      lock: lockOf({}),
      fetch: createRegistry([]),
      signal: AbortSignal.timeout(5000),
    });

    expect(result.issues).toEqual([]);
    expect(text(filesystem, 'src/main.ts')).toBe('export {};');
  });

  it('should report instead of prune when the filesystem cannot remove', async () => {
    const filesystem = createMemoryFileSystem({ removable: false });
    const lock = lockOf({ 'node_modules/is-number': isNumber, 'node_modules/d3-path': d3Path });
    await materializePackages({
      filesystem,
      lock,
      fetch: createRegistry([isNumber, d3Path]),
      signal: AbortSignal.timeout(5000),
    });

    const result = await materializePackages({
      filesystem,
      lock: lockOf({ 'node_modules/is-number': isNumber }),
      fetch: createRegistry([]),
      signal: AbortSignal.timeout(5000),
    });

    expect(result.issues).toEqual([
      {
        code: 'lock-stale',
        path: 'node_modules/d3-path',
        name: 'd3-path',
        message:
          "'node_modules/d3-path' is no longer in package-lock.json but this filesystem cannot remove it. Delete it manually.",
      },
    ]);
    expect(text(filesystem, 'node_modules/d3-path/src/path.js')).toBe('export const path = 1;');
  });

  it('should skip optional native and unreachable packages with a warning and install the rest', async () => {
    const filesystem = createMemoryFileSystem();
    const native = publish('@esbuild/darwin-arm64', {}, { optional: true, os: ['darwin'], cpu: ['arm64'] });
    const missing = publish('fsevents-shim', {}, { optional: true });
    const fetchMock = createRegistry([isNumber]);

    const result = await materializePackages({
      filesystem,
      lock: lockOf({
        'node_modules/@esbuild/darwin-arm64': native,
        'node_modules/fsevents-shim': missing,
        'node_modules/is-number': isNumber,
      }),
      fetch: fetchMock,
      signal: AbortSignal.timeout(5000),
    });

    expect(result.installed).toEqual(['node_modules/is-number']);
    expect(result.issues).toEqual([
      {
        code: 'package-unavailable-in-host',
        path: 'node_modules/@esbuild/darwin-arm64',
        name: '@esbuild/darwin-arm64',
        message:
          "'@esbuild/darwin-arm64' was not installed: it is a native build for a specific OS or CPU. Imports of it fail in Tau.",
      },
      {
        code: 'package-unavailable-in-host',
        path: 'node_modules/fsevents-shim',
        name: 'fsevents-shim',
        message: "'fsevents-shim' was not installed: tarball download failed (HTTP 404). Imports of it fail in Tau.",
      },
    ]);
    expect(fetchMock.mock.calls.map(([input]) => new Request(input).url)).toEqual([
      missing.entry.resolved,
      isNumber.entry.resolved,
    ]);
  });

  it('should warn about install scripts, never run them, and still install the files', async () => {
    const filesystem = createMemoryFileSystem();
    const scripted = publish('scripted', { 'install.js': 'process.exit(1);' }, { hasInstallScript: true });
    const onIssue = vi.fn();

    const result = await materializePackages({
      filesystem,
      lock: lockOf({ 'node_modules/scripted': scripted }),
      fetch: createRegistry([scripted]),
      signal: AbortSignal.timeout(5000),
      onIssue,
    });

    expect(result.installed).toEqual(['node_modules/scripted']);
    expect(onIssue).toHaveBeenCalledExactlyOnceWith({
      code: 'install-script-skipped',
      path: 'node_modules/scripted',
      name: 'scripted',
      message: "'scripted' declares install scripts; Tau never runs them. Run them yourself if the package needs them.",
    });
    expect(text(filesystem, 'node_modules/scripted/install.js')).toBe('process.exit(1);');
  });

  it('should leave bundled dependencies to their parent tarball without fetching or reporting them', async () => {
    const filesystem = createMemoryFileSystem();
    const parent = publish('bundler-parent', { 'node_modules/bundled/package.json': '{"name":"bundled"}' });
    const bundled: Published = { bytes: new Uint8Array(), entry: { version: '1.0.0', inBundle: true } };
    const fetchMock = createRegistry([parent]);

    const result = await materializePackages({
      filesystem,
      lock: lockOf({
        'node_modules/bundler-parent': parent,
        'node_modules/bundler-parent/node_modules/bundled': bundled,
      }),
      fetch: fetchMock,
      signal: AbortSignal.timeout(5000),
    });

    expect(result).toEqual({ installed: ['node_modules/bundler-parent'], skipped: [], issues: [] });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(text(filesystem, 'node_modules/bundler-parent/node_modules/bundled/package.json')).toBe(
      '{"name":"bundled"}',
    );
  });

  it('should refuse a lock key that escapes node_modules', async () => {
    const filesystem = createMemoryFileSystem();

    const result = await materializePackages({
      filesystem,
      lock: lockOf({ 'node_modules/../src': isNumber }),
      fetch: createRegistry([isNumber]),
      signal: AbortSignal.timeout(5000),
    });

    expect(result.issues.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: 'lock-invalid', path: 'node_modules/../src' },
    ]);
    expect([...filesystem.files.keys()]).toEqual([]);
  });
});
