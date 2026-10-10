/**
 * Parity oracle for the project package lock (blueprint I5): the lock Tau writes passes `npm ci` unmodified and
 * `npm ci` installs the same tree, package for package, that Tau materialises, which bundles to the same bytes.
 *
 * Live registry and the host `npm`; opt in with TAU_NPM_LIVE_TESTS=true (the bundler-core gate).
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { installPackages, materializePackages, parsePackageLock } from '@taucad/bundler-core';
import type { BundlerFileSystem, PackageLock } from '@taucad/bundler-core';
import { createEsbuildModuleVm } from '@taucad/esbuild/vm';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import { describe, expect, it } from 'vitest';

const live = process.env['TAU_NPM_LIVE_TESTS'] === 'true';
const npmOnPath = spawnSync('npm', ['--version'], { stdio: 'ignore' }).status === 0;

const manifest = `${JSON.stringify(
  {
    name: 'tau-lock-parity',
    private: true,
    type: 'module',
    dependencies: { alea: '^1.0.1', 'd3-shape': '^3.2.0', 'simplex-noise': '^4.0.3' },
  },
  undefined,
  2,
)}\n`;

const mainSource = `import alea from 'alea';
import { line } from 'd3-shape';
import { createNoise2D } from 'simplex-noise';

const noise = createNoise2D(alea('tau'));
export default line()(Array.from({ length: 8 }, (_, index) => [index, noise(index, 0)]));
`;

const nodeFileSystem = (root: string): BundlerFileSystem => {
  const files = new NodeFsProvider(root);
  return {
    exists: async (path) => files.exists(path),
    readFile: files.readFile.bind(files),
    writeFile: async (path, content) => files.writeFile(path, content),
    ensureDir: async (path) => files.mkdir(path, { recursive: true }),
  };
};

/** SHA-256 of the esbuild bundle of `main.ts` over one installed tree; fails on any bundle issue. */
const bundleHash = async (root: string): Promise<string> => {
  const vm = await createEsbuildModuleVm({ filesystem: nodeFileSystem(root) });
  try {
    const result = await vm.bundle('main.ts');
    expect(result.issues).toEqual([]);
    expect(result.success).toBe(true);
    return createHash('sha256').update(result.code).digest('hex');
  } finally {
    vm.dispose();
  }
};

/** `node_modules/<path>` → `name@version` read from each installed package.json, nested trees included. */
const installedTree = async (root: string, directory = 'node_modules'): Promise<Record<string, string>> => {
  const tree: Record<string, string> = {};
  const entries = await readdir(join(root, directory)).catch(() => []);
  for (const entry of entries.filter((name) => !name.startsWith('.'))) {
    // oxlint-disable-next-line no-await-in-loop -- walk one scope directory at a time
    const scoped = entry.startsWith('@') ? await readdir(join(root, directory, entry)) : undefined;
    const names = scoped?.map((name) => `${entry}/${name}`) ?? [entry];
    for (const name of names) {
      const path = `${directory}/${name}`;
      // oxlint-disable-next-line no-await-in-loop -- ordered walk of a small tree
      const installed = JSON.parse(await readFile(join(root, path, 'package.json'), 'utf8')) as {
        name: string;
        version: string;
      };
      tree[path] = `${installed.name}@${installed.version}`;
      // oxlint-disable-next-line no-await-in-loop -- nested node_modules after its parent
      Object.assign(tree, await installedTree(root, `${path}/node_modules`));
    }
  }
  return tree;
};

const integrities = (lock: Pick<PackageLock, 'packages'>): Record<string, string | undefined> =>
  Object.fromEntries(
    Object.entries(lock.packages)
      .filter(([path]) => path !== '')
      .map(([path, entry]) => [path, entry.integrity]),
  );

describe('package-lock.json parity with npm ci', () => {
  it.skipIf(!live || !npmOnPath)(
    'installs and bundles the same node_modules tree, with the same integrity, as npm ci (needs TAU_NPM_LIVE_TESTS=true and npm)',
    async () => {
      const sandbox = await mkdtemp(join(tmpdir(), 'tau-lock-parity-'));
      const tau = join(sandbox, 'tau');
      const npm = join(sandbox, 'npm');
      try {
        await mkdir(tau);
        await mkdir(npm);
        await writeFile(join(tau, 'package.json'), manifest);
        await writeFile(join(tau, 'main.ts'), mainSource);
        const filesystem = nodeFileSystem(tau);
        const signal = AbortSignal.timeout(300_000);
        const installed = await installPackages({
          filesystem,
          commit: async ({ path, content }) => {
            await filesystem.writeFile(path, content);
            return true;
          },
          mode: 'install',
          signal,
        });
        expect(installed.issues).toEqual([]);
        const lock = parsePackageLock(await readFile(join(tau, 'package-lock.json'), 'utf8'));
        const materialized = await materializePackages({ filesystem, lock, signal });
        expect(materialized.issues).toEqual([]);

        for (const file of ['package.json', 'package-lock.json', 'main.ts']) {
          // oxlint-disable-next-line no-await-in-loop -- three small copies
          await copyFile(join(tau, file), join(npm, file));
        }
        execFileSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: npm, stdio: 'pipe' });

        const tauTree = await installedTree(tau);
        expect(Object.keys(tauTree)).toEqual(
          expect.arrayContaining(['node_modules/alea', 'node_modules/d3-path', 'node_modules/simplex-noise']),
        );
        expect(tauTree).toEqual(await installedTree(npm));

        const npmHiddenLock = JSON.parse(await readFile(join(npm, 'node_modules/.package-lock.json'), 'utf8')) as Pick<
          PackageLock,
          'packages'
        >;
        expect(integrities(npmHiddenLock)).toEqual(integrities(lock));
        const tauState = JSON.parse(await readFile(join(tau, 'node_modules/.tau-install-state.json'), 'utf8')) as {
          installed: Record<string, string>;
        };
        expect(tauState.installed).toEqual(integrities(lock));
        expect(await readFile(join(npm, 'package-lock.json'), 'utf8')).toBe(
          await readFile(join(tau, 'package-lock.json'), 'utf8'),
        );
        const bundle = await bundleHash(tau);
        expect(await bundleHash(npm)).toBe(bundle);
        console.info(JSON.stringify({ parity: 'npm-ci', tree: tauTree, bundle }));
      } finally {
        await rm(sandbox, { recursive: true, force: true });
      }
    },
    600_000,
  );
});
