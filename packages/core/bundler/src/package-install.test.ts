import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { NodeFsAuthorityHost, serveNodeFsProvider } from '@taucad/filesystem/backend/node';
import { NodeFsChannel, NodeFsProviderClient } from '@taucad/filesystem/backend';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';

import { createPackageManifestCommit, installPackages, parsePackageLock } from '@taucad/bundler-core';
import type {
  BundlerFileSystem,
  PackageManifestCommit,
  PackageManifestCommitInput,
  PackageRegistry,
  Packument,
} from '@taucad/bundler-core';

import { createTestFileSystem } from '#testing.fixture.js';

const recorded = JSON.parse(readFileSync(new URL('fixtures/packuments.json', import.meta.url), 'utf8')) as Record<
  string,
  Packument
>;
const registry = vi.fn<PackageRegistry>(async (name) => recorded[name]);
const { signal } = new AbortController();

/** In-memory checked write with the same all-preconditions-or-nothing contract as the filesystem authority. */
const harness = (
  files: Readonly<Record<string, string>>,
): {
  filesystem: BundlerFileSystem;
  commits: PackageManifestCommitInput[];
  commit: PackageManifestCommit;
  read: (path: string) => Promise<string | undefined>;
} => {
  const filesystem = createTestFileSystem(files);
  const read = async (path: string): Promise<string | undefined> =>
    (await filesystem.exists(path)) ? filesystem.readFile(path, 'utf8') : undefined;
  const commits: PackageManifestCommitInput[] = [];
  const commit: PackageManifestCommit = async (input) => {
    commits.push(input);
    for (const condition of [{ path: input.path, expected: input.expected }, ...(input.preconditions ?? [])]) {
      // oxlint-disable-next-line no-await-in-loop -- preconditions are checked in order before the write
      if ((await read(condition.path)) !== condition.expected) {
        return false;
      }
    }
    await filesystem.writeFile(input.path, input.content);
    return true;
  };
  return { filesystem, commits, commit, read };
};

const manifestText =
  '{\n    "name": "demo",\n    "type": "module",\n    "scripts": {\n        "dev": "tau"\n    }\n}\n';

describe('installPackages', () => {
  it('should add a dependency, keep every other key and indentation, then write the lock against the new manifest', async () => {
    const project = harness({ 'package.json': manifestText });
    const result = await installPackages({ ...project, mode: 'install', add: { 'd3-shape': '^3' }, registry, signal });
    expect(result.issues).toEqual([]);
    expect(result).toMatchObject({ manifestChanged: true, lockChanged: true });
    const manifest = await project.read('package.json');
    expect(manifest).toBe(
      '{\n    "name": "demo",\n    "type": "module",\n    "scripts": {\n        "dev": "tau"\n    },\n    "dependencies": {\n        "d3-shape": "^3"\n    }\n}\n',
    );
    expect(project.commits.map(({ path, expected, preconditions }) => ({ path, expected, preconditions }))).toEqual([
      { path: 'package.json', expected: manifestText, preconditions: undefined },
      { path: 'package-lock.json', expected: undefined, preconditions: [{ path: 'package.json', expected: manifest }] },
    ]);
    const lock = parsePackageLock((await project.read('package-lock.json')) ?? '');
    expect(Object.keys(lock.packages)).toEqual(['', 'node_modules/d3-path', 'node_modules/d3-shape']);
    expect(lock.packages['']).toEqual({ name: 'demo', dependencies: { 'd3-shape': '^3' } });
  });

  it('should write nothing and fetch nothing when the lock already matches', async () => {
    const project = harness({ 'package.json': manifestText });
    await installPackages({ ...project, mode: 'install', add: { 'is-number': '^7' }, registry, signal });
    const offline = vi.fn<PackageRegistry>(async () => {
      throw new Error('offline');
    });
    project.commits.length = 0;
    const result = await installPackages({ ...project, mode: 'install', registry: offline, signal });
    expect(result).toMatchObject({ manifestChanged: false, lockChanged: false, issues: [] });
    expect(result.lock?.packages['node_modules/is-number']?.version).toBe('7.0.0');
    expect(project.commits).toEqual([]);
    expect(offline).not.toHaveBeenCalled();
  });

  it('should remove a dependency and prune its subtree from the lock', async () => {
    const project = harness({ 'package.json': manifestText });
    await installPackages({
      ...project,
      mode: 'install',
      add: { 'd3-shape': '^3', 'is-number': '^7' },
      registry,
      signal,
    });
    const result = await installPackages({ ...project, mode: 'install', remove: ['d3-shape'], registry, signal });
    expect(Object.keys(result.lock?.packages ?? {})).toEqual(['', 'node_modules/is-number']);
    expect(JSON.parse((await project.read('package.json')) ?? '{}')).toMatchObject({
      dependencies: { 'is-number': '^7' },
    });
  });

  it('should refuse a missing package.json without creating one', async () => {
    const project = harness({});
    const result = await installPackages({ ...project, mode: 'install', add: { 'is-number': '^7' }, registry, signal });
    expect(result.issues).toEqual([expect.objectContaining({ code: 'manifest-conflict' })]);
    expect(result.issues[0]?.message).toContain('package.json is missing');
    expect(project.commits).toEqual([]);
  });

  it('should write nothing when resolution is refused', async () => {
    const project = harness({ 'package.json': manifestText });
    const result = await installPackages({
      ...project,
      mode: 'install',
      add: { a: 'github:user/a' },
      registry,
      signal,
    });
    expect(result.lock).toBeUndefined();
    expect(result.issues.map((issue) => issue.code)).toEqual(['unsupported-dependency-protocol']);
    expect(project.commits).toEqual([]);
    expect(await project.read('package.json')).toBe(manifestText);
  });

  it('should report manifest-conflict and leave both files untouched when package.json changed during Install', async () => {
    const project = harness({ 'package.json': manifestText });
    const racing: PackageManifestCommit = async (input) => {
      await project.filesystem.writeFile('package.json', '{"name":"edited"}\n');
      return project.commit(input);
    };
    const result = await installPackages({
      ...project,
      commit: racing,
      mode: 'install',
      add: { 'is-number': '^7' },
      registry,
      signal,
    });
    expect(result).toMatchObject({ manifestChanged: false, lockChanged: false });
    expect(result.issues.map((issue) => issue.code)).toEqual(['manifest-conflict']);
    expect(await project.read('package.json')).toBe('{"name":"edited"}\n');
    expect(await project.read('package-lock.json')).toBeUndefined();
  });

  it('should not write the lock when package.json changes between the two writes', async () => {
    const project = harness({ 'package.json': manifestText });
    const racing: PackageManifestCommit = async (input) => {
      const written = await project.commit(input);
      if (input.path === 'package.json') {
        await project.filesystem.writeFile('package.json', '{"name":"edited"}\n');
      }
      return written;
    };
    const result = await installPackages({
      ...project,
      commit: racing,
      mode: 'install',
      add: { 'is-number': '^7' },
      registry,
      signal,
    });
    expect(result).toMatchObject({ manifestChanged: true, lockChanged: false });
    expect(result.issues[0]?.message).toContain('the lock was not written');
    expect(await project.read('package-lock.json')).toBeUndefined();
  });

  it('should upgrade only the named package in upgrade mode', async () => {
    const project = harness({ 'package.json': manifestText });
    await installPackages({
      ...project,
      mode: 'install',
      add: { 'd3-shape': '^3', 'is-number': '^7' },
      registry,
      signal,
    });
    const newer = (name: string, version: string): Packument => {
      const current = recorded[name];
      const latest = current?.versions[current['dist-tags']['latest'] ?? ''];
      if (current === undefined || latest === undefined) {
        throw new Error(`fixture lacks ${name}`);
      }
      return {
        ...current,
        'dist-tags': { latest: version },
        versions: { ...current.versions, [version]: { ...latest, version } },
      };
    };
    const later = vi.fn<PackageRegistry>(async (name) =>
      name === 'is-number'
        ? newer('is-number', '7.9.0')
        : name === 'd3-shape'
          ? newer('d3-shape', '3.9.0')
          : recorded[name],
    );
    const result = await installPackages({
      ...project,
      mode: 'upgrade',
      upgrade: ['is-number'],
      registry: later,
      signal,
    });
    expect(result.lock?.packages['node_modules/is-number']?.version).toBe('7.9.0');
    expect(result.lock?.packages['node_modules/d3-shape']?.version).toBe('3.2.0');
    expect(result.manifestChanged).toBe(false);
  });
});

describe('real filesystem authority', () => {
  it('should publish through the Node authority and fence two independent clients', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'tau-package-host-'));
    const root = join(sandbox, 'project');
    const authorityRoot = join(sandbox, 'authority');
    await mkdir(root);
    await mkdir(authorityRoot);
    await writeFile(join(root, 'package.json'), '{\n  "name": "host"\n}\n');
    const authority = new NodeFsAuthorityHost({
      authorityDirectory: () => authorityRoot,
      authorityIdentity: () => root,
    });
    const connect = () => {
      const ports = new MessageChannel();
      const stop = serveNodeFsProvider(ports.port2, {
        authority,
        policy: tauPathPolicy,
        allowRoot: (candidate) => candidate === root,
      });
      const channel = new NodeFsChannel(ports.port1);
      return { ports, channel, stop, provider: new NodeFsProviderClient(channel, root) };
    };
    const first = connect();
    const second = connect();
    try {
      const filesystem: BundlerFileSystem = {
        exists: first.provider.exists.bind(first.provider),
        readFile: first.provider.readFile.bind(first.provider),
        writeFile: first.provider.writeFile.bind(first.provider),
        ensureDir: async (path: string) => first.provider.mkdir(path, { recursive: true }),
      };
      const commit = createPackageManifestCommit({ authority: first.provider, signal });
      const result = await installPackages({
        filesystem,
        commit,
        mode: 'install',
        add: { 'is-number': '^7' },
        registry,
        signal,
      });
      expect(result.issues).toEqual([]);
      const lockText = await readFile(join(root, 'package-lock.json'), 'utf8');
      expect(parsePackageLock(lockText).packages['node_modules/is-number']?.version).toBe('7.0.0');
      const otherCommit = createPackageManifestCommit({ authority: second.provider, signal });
      const outcomes = await Promise.all([
        commit({ path: 'package-lock.json', expected: lockText, content: 'first' }),
        otherCommit({ path: 'package-lock.json', expected: lockText, content: 'second' }),
      ]);
      expect(outcomes.filter(Boolean)).toHaveLength(1);
      expect(['first', 'second']).toContain(await readFile(join(root, 'package-lock.json'), 'utf8'));
      const manifest = await readFile(join(root, 'package.json'), 'utf8');
      expect(
        await otherCommit({
          path: 'package-lock.json',
          expected: await readFile(join(root, 'package-lock.json'), 'utf8'),
          content: 'stale',
          preconditions: [{ path: 'package.json', expected: `${manifest} ` }],
        }),
      ).toBe(false);
    } finally {
      first.channel.close();
      second.channel.close();
      await first.stop();
      await second.stop();
      first.ports.port2.close();
      second.ports.port2.close();
      await rm(sandbox, { recursive: true, force: true });
    }
  }, 60_000);

  it('should preserve potentially-applied failures instead of claiming nothing was written', async () => {
    const failure = Object.assign(new Error('authority connection lost after write'), {
      applicationState: 'potentially-applied',
    });
    const commit = createPackageManifestCommit({
      authority: { writeFileChecked: vi.fn().mockRejectedValue(failure) },
      signal,
    });
    await expect(commit({ path: 'package.json', expected: undefined, content: '{}' })).rejects.toBe(failure);
  });
});

const nodeFileSystem = (root: string): BundlerFileSystem => {
  const readFileAt = (async (path: string, encoding?: 'utf8') =>
    encoding === 'utf8'
      ? readFile(join(root, path), 'utf8')
      : new Uint8Array(await readFile(join(root, path)))) as BundlerFileSystem['readFile'];
  return {
    exists: async (path) => {
      try {
        await stat(join(root, path));
        return true;
      } catch {
        return false;
      }
    },
    readFile: readFileAt,
    writeFile: async (path, content) => {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), content);
    },
    ensureDir: async (path) => {
      await mkdir(join(root, path), { recursive: true });
    },
  };
};

describe('npm acceptance', () => {
  // Live registry and host npm; opt in with TAU_NPM_LIVE_TESTS=true.
  it.skipIf(process.env['TAU_NPM_LIVE_TESTS'] !== 'true')(
    'should write a lock that npm ci installs unmodified with the same tree npm resolves',
    async () => {
      const sandbox = await mkdtemp(join(tmpdir(), 'tau-npm-ci-'));
      const project = join(sandbox, 'project');
      const reference = join(sandbox, 'reference');
      try {
        await mkdir(project);
        await writeFile(
          join(project, 'package.json'),
          '{\n  "name": "tau-npm-ci",\n  "private": true,\n  "type": "module"\n}\n',
        );
        const filesystem = nodeFileSystem(project);
        const commit: PackageManifestCommit = async ({ path, content }) => {
          await filesystem.writeFile(path, content);
          return true;
        };
        const result = await installPackages({
          filesystem,
          commit,
          mode: 'install',
          add: {
            'd3-shape': '^3',
            debug: '^2',
            'is-number': '^7',
            ms: '^2.1',
            'react-dom': '^18',
            replicad: 'npm:@taulabs/replicad@0.23.4-beta.2',
          },
          signal: AbortSignal.timeout(300_000),
        });
        expect(result.issues).toEqual([]);
        const lockText = await readFile(join(project, 'package-lock.json'), 'utf8');
        const lock = parsePackageLock(lockText);

        await cp(join(project, 'package.json'), join(reference, 'package.json'));
        execFileSync('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], {
          cwd: reference,
          stdio: 'pipe',
        });
        const npmLock = parsePackageLock(await readFile(join(reference, 'package-lock.json'), 'utf8'));
        const identity = (packages: typeof lock.packages) =>
          Object.fromEntries(
            Object.entries(packages).map(([path, entry]) => [path, [entry.name, entry.version, entry.integrity]]),
          );
        expect(identity(lock.packages)).toEqual(identity(npmLock.packages));

        execFileSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: project, stdio: 'pipe' });
        expect(await readFile(join(project, 'package-lock.json'), 'utf8')).toBe(lockText);
        for (const [path, entry] of Object.entries(lock.packages)) {
          if (path === '') {
            continue;
          }
          // oxlint-disable-next-line no-await-in-loop -- compare each installed package with its lock row
          const installed = JSON.parse(await readFile(join(project, path, 'package.json'), 'utf8')) as Record<
            string,
            unknown
          >;
          expect([path, installed['version']]).toEqual([path, entry.version]);
          expect([path, installed['name']]).toEqual([
            path,
            entry.name ?? path.slice(path.lastIndexOf('node_modules/') + 13),
          ]);
        }
      } finally {
        await rm(sandbox, { recursive: true, force: true });
      }
    },
    600_000,
  );
});
