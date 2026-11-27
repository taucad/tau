// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  checkBuildOutput,
  findMissingExternalImports,
  findServerOutputViolations,
  findUnresolvedAssetUrls,
  isWorkerBundle,
  parseBuildArguments,
  parseExternalArguments,
} from '#scripts/check-server-output.mts';

const scriptPath = fileURLToPath(new URL('check-server-output.mts', import.meta.url));

let buildRoot: string | undefined;

afterEach(async () => {
  if (buildRoot !== undefined) {
    await rm(buildRoot, { recursive: true, force: true });
    buildRoot = undefined;
  }
});

/** Writes `files` (paths relative to a fresh build directory) and returns the directory. */
const writeBuild = async (files: readonly string[]): Promise<string> => {
  buildRoot = await mkdtemp(join(tmpdir(), 'tau-server-output-'));
  const directory = buildRoot;
  await Promise.all(
    files.map(async (file) => {
      const path = join(directory, file);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `// ${file}\n`);
    }),
  );
  return directory;
};

/** A build whose server output holds a kernel WASM file and a worker bundle, as the 7.18.2 build did. */
const dirtyBuild = [
  'client/assets/entry.client-a1b2c3d4.js',
  'server/index.js',
  'server/.vite/manifest.json',
  'server/assets/server-build-a1b2c3d4.js',
  'server/assets/index_bg-Blvrv-U2.wasm',
  'server/assets/file-manager.worker-DpJHQLhi.js',
];

/** Writes files with their contents into a fresh build directory and returns the directory. */
const writeBuildContents = async (files: Readonly<Record<string, string>>): Promise<string> => {
  buildRoot = await mkdtemp(join(tmpdir(), 'tau-server-output-'));
  const directory = buildRoot;
  await Promise.all(
    Object.entries(files).map(async ([file, content]) => {
      const path = join(directory, file);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content);
    }),
  );
  return directory;
};

/** A server entry as React Router's Environment API build writes it: one `index.js` and its chunks. */
const serverEntry = [
  'import { a } from "./assets/resources-a1b2c3d4.js";',
  'import { createContext } from "react";',
  'import { resources } from "@taucad/openrscad/agent/resources.js";',
  "const text = `import { createRuntimeClient } from '@taucad/runtime/client'`;",
  'export { a, createContext, resources, text };',
].join('\n');

const runScript = (args: readonly string[]): { status: number | undefined; stderr: string } => {
  const result = spawnSync(process.execPath, [scriptPath, ...args], { encoding: 'utf8' });
  return { status: result.status ?? undefined, stderr: result.stderr };
};

describe('isWorkerBundle', () => {
  it('should match worker entry chunks and worker module graphs', () => {
    expect(isWorkerBundle('file-manager.worker-DpJHQLhi.js')).toBe(true);
    expect(isWorkerBundle('object-store.worker-khUTSUqg.js')).toBe(true);
    expect(isWorkerBundle('kcl-lsp-worker-AbCdEf12.js')).toBe(true);
    expect(isWorkerBundle('tau-module-graph-D6w5H8d0.json')).toBe(true);
  });

  it('should not match main-thread chunks named after worker helpers', () => {
    expect(isWorkerBundle('kernel-worker.constants-C_fcDwNP.js')).toBe(false);
    expect(isWorkerBundle('worker-error-reporting-iyROhzRJ.js')).toBe(false);
    expect(isWorkerBundle('use-file-manager-B_b6Lts2.js')).toBe(false);
  });
});

describe('findServerOutputViolations', () => {
  it('should report WASM files, worker bundles and files also in client/assets', () => {
    expect(
      findServerOutputViolations({
        serverFiles: [
          'assets/hero-gearbox-hDAgWlLd.webp',
          'assets/index_bg-Blvrv-U2.wasm',
          'assets/object-store.worker-khUTSUqg.js',
          'assets/server-build-a1b2c3d4.js',
          'index.js',
        ],
        clientAssetFiles: ['hero-gearbox-hDAgWlLd.webp', 'object-store.worker-khUTSUqg.js'],
      }),
    ).toEqual([
      { file: 'assets/hero-gearbox-hDAgWlLd.webp', rule: 'client-asset' },
      { file: 'assets/index_bg-Blvrv-U2.wasm', rule: 'wasm' },
      { file: 'assets/object-store.worker-khUTSUqg.js', rule: 'worker' },
      { file: 'assets/object-store.worker-khUTSUqg.js', rule: 'client-asset' },
    ]);
  });

  it('should pass a server output of server chunks only', () => {
    expect(
      findServerOutputViolations({
        serverFiles: ['.vite/manifest.json', 'assets/server-build-a1b2c3d4.js', 'index.js'],
        clientAssetFiles: ['entry.client-a1b2c3d4.js', 'manifest-a1b2c3d4.js'],
      }),
    ).toEqual([]);
  });
});

describe('parseBuildArguments', () => {
  it('should resolve each build against the working directory', () => {
    expect(parseBuildArguments(['--server', 'apps/ui/build', '--spa', '/abs/build'], '/repo')).toEqual([
      { kind: 'server', directory: '/repo/apps/ui/build' },
      { kind: 'spa', directory: '/abs/build' },
    ]);
  });

  it('should reject an unknown flag, a flag without a path and an empty list', () => {
    expect(() => parseBuildArguments(['--web', 'build'], '/repo')).toThrow('expected --server, --spa or --external');
    expect(() => parseBuildArguments(['--server', 'build', '--external'], '/repo')).toThrow(
      'needs a package specifier',
    );
    expect(() => parseBuildArguments(['--server'], '/repo')).toThrow('needs a build directory');
    expect(() => parseBuildArguments(['--server', '--spa', 'build'], '/repo')).toThrow('needs a build directory');
    expect(() => parseBuildArguments([], '/repo')).toThrow('name at least one build');
  });
});

describe('parseExternalArguments', () => {
  it('should collect each --external specifier and leave the builds to parseBuildArguments', () => {
    const args = ['--server', 'apps/ui/build', '--external', '@taucad/openrscad', '--spa', 'b', '--external', 'x'];

    expect(parseExternalArguments(args)).toEqual(['@taucad/openrscad', 'x']);
    expect(parseBuildArguments(args, '/repo')).toEqual([
      { kind: 'server', directory: '/repo/apps/ui/build' },
      { kind: 'spa', directory: '/repo/b' },
    ]);
  });
});

describe('findUnresolvedAssetUrls', () => {
  const chunks: Record<string, string> = {
    'assets/resources-a1b2c3d4.js': [
      // Rewritten by `@taucad/runtime/vite` and kept: only the server emitted it.
      'const skill = new URL("./SKILL-a1b2c3d4.md", import.meta.url).href;',
      // Rewritten, and the server copy removed because the client output holds it.
      'const thumbnail = new URL("./thumbnail-a1b2c3d4.webp", import.meta.url).href;',
      // A browser-only worker the server never constructs.
      'const worker = () => new Worker(new URL("../runtime/runtime.worker.ts", import.meta.url));',
    ].join('\n'),
  };
  const readServerFile = (file: string): string => chunks[file] ?? '';

  it('should accept a URL resolving in the server output or client/assets, and skip script sources', () => {
    expect(
      findUnresolvedAssetUrls({
        serverFiles: ['assets/resources-a1b2c3d4.js', 'assets/SKILL-a1b2c3d4.md'],
        clientAssetFiles: ['thumbnail-a1b2c3d4.webp'],
        readServerFile,
      }),
    ).toEqual([]);
  });

  it('should report a source-tree path the asset plugin left unrewritten', () => {
    const left = 'const doc = new URL("./cad-smlibpy/api-align.md", import.meta.url).href;';

    expect(
      findUnresolvedAssetUrls({
        serverFiles: ['index.js'],
        clientAssetFiles: ['api-align-a1b2c3d4.md'],
        readServerFile: () => left,
      }),
    ).toEqual([{ file: 'index.js -> ./cad-smlibpy/api-align.md', rule: 'unresolved-asset-url' }]);
  });
});

describe('findMissingExternalImports', () => {
  it('should find an import by name and ignore a specifier quoted in embedded text', () => {
    expect(
      findMissingExternalImports({
        externals: ['@taucad/openrscad', '@taucad/runtime'],
        serverFiles: ['index.js', 'assets/data.json'],
        readServerFile: (file) => (file === 'index.js' ? serverEntry : '"@taucad/runtime"'),
      }),
    ).toEqual(['@taucad/runtime']);
  });

  it('should accept a multi-line import and a dynamic import', () => {
    const code = 'import {\n\ta,\n\tb\n} from "@taucad/openrscad";\nconst m = () => import("@taucad/runtime/client");';

    expect(
      findMissingExternalImports({
        externals: ['@taucad/openrscad', '@taucad/runtime'],
        serverFiles: ['index.js'],
        readServerFile: () => code,
      }),
    ).toEqual([]);
  });
});

describe('checkBuildOutput', () => {
  it('should require each external of an ssr: true build to be imported by name', async () => {
    const directory = await writeBuildContents({
      'client/assets/entry.client-a1b2c3d4.js': '',
      'server/index.js': serverEntry,
      'server/assets/resources-a1b2c3d4.js': 'export const a = 1;',
    });

    expect(checkBuildOutput({ kind: 'server', directory }, ['@taucad/openrscad'])).toEqual([]);
    expect(checkBuildOutput({ kind: 'server', directory }, ['@taucad/runtime'])).toEqual([
      `${join(directory, 'server')}: no chunk imports @taucad/runtime by name (bundled despite resolve.external)`,
    ]);
  });

  it('should fail a server output holding a WASM file and a worker bundle', async () => {
    const directory = await writeBuild(dirtyBuild);

    expect(checkBuildOutput({ kind: 'server', directory })).toEqual([
      `${join(directory, 'server', 'assets/file-manager.worker-DpJHQLhi.js')}: a worker bundle`,
      `${join(directory, 'server', 'assets/index_bg-Blvrv-U2.wasm')}: a WASM file`,
    ]);
  });

  it('should fail an ssr: false build that leaves a server output behind, clean or not (RR8)', async () => {
    const dirty = await writeBuild(dirtyBuild);
    const clean = await writeBuild(['client/index.html', 'server/index.js']);

    for (const directory of [dirty, clean]) {
      expect(checkBuildOutput({ kind: 'spa', directory })).toEqual([
        `${join(directory, 'server')} is left by an ssr: false build: its React Router config's buildEnd removes it (RR8)`,
      ]);
    }
  });

  it('should pass an ssr: false build without a server output and fail an ssr: true one', async () => {
    const directory = await writeBuild(['client/index.html', 'client/assets/entry.client-a1b2c3d4.js']);

    expect(checkBuildOutput({ kind: 'spa', directory })).toEqual([]);
    expect(checkBuildOutput({ kind: 'server', directory })).toEqual([
      `${join(directory, 'server')} is missing from an ssr: true build`,
    ]);
  });

  it('should fail a build that never ran', async () => {
    const directory = await writeBuild([]);

    expect(checkBuildOutput({ kind: 'spa', directory })).toEqual([
      `${join(directory, 'client')} is missing: run the build first`,
    ]);
  });
});

describe('check-server-output command', () => {
  it('should exit 1 and name each offender on a fixture holding a WASM file and a worker bundle', async () => {
    const directory = await writeBuild(dirtyBuild);

    const { status, stderr } = runScript(['--server', directory]);

    expect(status).toBe(1);
    expect(stderr).toContain('index_bg-Blvrv-U2.wasm: a WASM file');
    expect(stderr).toContain('file-manager.worker-DpJHQLhi.js: a worker bundle');
  });

  it('should exit 1 when the server bundled a required external', async () => {
    const directory = await writeBuildContents({
      'client/assets/entry.client-a1b2c3d4.js': '',
      'server/index.js': serverEntry,
    });

    expect(runScript(['--server', directory, '--external', '@taucad/openrscad']).status).toBe(0);
    const { status, stderr } = runScript(['--server', directory, '--external', '@taucad/runtime']);
    expect(status).toBe(1);
    expect(stderr).toContain('no chunk imports @taucad/runtime by name');
  });

  it('should exit 0 on a clean server output', async () => {
    const directory = await writeBuild([
      'client/assets/entry.client-a1b2c3d4.js',
      'server/index.js',
      'server/assets/server-build-a1b2c3d4.js',
    ]);

    expect(runScript(['--server', directory]).status).toBe(0);
  });
});
