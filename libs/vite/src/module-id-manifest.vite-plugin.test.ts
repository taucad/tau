import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import { moduleIdManifest } from '#module-id-manifest.vite-plugin.js';
import type { ModuleIdManifest } from '#module-id-manifest.vite-plugin.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true })));
});

/** A three-module app: an entry with a static import, a dynamic import and a worker. */
const createFixture = async (): Promise<string> => {
  const root = await mkdtemp(path.join(tmpdir(), 'tau-module-id-manifest-'));
  directories.push(root);
  await mkdir(path.join(root, 'src'));
  await writeFile(
    path.join(root, 'src/main.js'),
    [
      "import { shared } from './shared.js';",
      'console.log(shared);',
      "void import('./later.js');",
      "new Worker(new URL('./job.worker.js', import.meta.url), { type: 'module' });",
      '',
    ].join('\n'),
  );
  await writeFile(path.join(root, 'src/shared.js'), "export const shared = 'shared value';\n");
  await writeFile(path.join(root, 'src/later.js'), "export const later = 'later value';\n");
  await writeFile(path.join(root, 'src/job.worker.js'), 'self.postMessage(1);\n');
  return root;
};

const buildFixture = async (root: string): Promise<ModuleIdManifest> => {
  const outFile = path.join(root, 'build/module-ids.json');
  await build({
    root,
    logLevel: 'silent',
    configFile: false,
    plugins: [moduleIdManifest({ outFile, root })],
    worker: { format: 'es' },
    build: {
      outDir: path.join(root, 'build/client'),
      minify: false,
      rolldownOptions: { input: path.join(root, 'src/main.js') },
    },
  });
  return JSON.parse(await readFile(outFile, 'utf8')) as ModuleIdManifest;
};

describe('moduleIdManifest', () => {
  it('should write each chunk with its module ids relative to the root and their rendered bytes', async () => {
    const root = await createFixture();
    const manifest = await buildFixture(root);

    expect(manifest.schema).toBe('tau-module-id-manifest-v1');
    const entry = manifest.chunks.find((chunk) => chunk.isEntry);
    expect(entry?.facadeModuleId).toBe('src/main.js');
    // Vite's own preload helper is a virtual module; its id loses the `\0` prefix.
    expect(entry?.modules.map((module) => module.id)).toEqual([
      'src/main.js',
      'src/shared.js',
      'vite/preload-helper.js',
    ]);
    expect(entry?.modules.every((module) => module.renderedLength > 0)).toBe(true);

    const later = manifest.chunks.find((chunk) => chunk.isDynamicEntry);
    expect(later?.modules.map((module) => module.id)).toEqual(['src/later.js']);
    expect(entry?.dynamicImports).toEqual([later?.fileName]);
  });

  it('should list a worker as an asset, never as a chunk of the page', async () => {
    const root = await createFixture();
    const manifest = await buildFixture(root);

    expect(manifest.chunks.flatMap((chunk) => chunk.modules.map((module) => module.id))).not.toContain(
      'src/job.worker.js',
    );
    expect(manifest.assets.some((asset) => /job\.worker-[\w-]+\.js$/u.test(asset.fileName))).toBe(true);
  });

  it('should write nothing into the published directory', async () => {
    const root = await createFixture();
    const manifest = await buildFixture(root);

    expect(manifest.assets.map((asset) => asset.fileName).filter((file) => file.endsWith('.json'))).toEqual([]);
  });
});
