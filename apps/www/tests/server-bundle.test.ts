import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { checkServerBundle, findServerBundleViolations } from '#tools/server-bundle.js';

/** The Environment API server build: one `index.js` and React Router's empty `.client` stub. */
const cleanBuild: Record<string, string> = {
  'index.js': [
    '//#region app/entry.server.tsx',
    'export const entry = 1;',
    '//#endregion',
    '//#region src/hero-view.ts',
    'export const heroView = 2;',
    '//#endregion',
  ].join('\n'),
  '.vite/manifest.json': '{}',
  '_www/bundles/client.client-DB_rB0xG.js':
    '//#region src/client.client.ts\nvar initializePage = void 0;\n//#endregion',
};

let directory: string | undefined;

afterEach(async () => {
  if (directory !== undefined) {
    await rm(directory, { recursive: true, force: true });
    directory = undefined;
  }
});

const writeServer = async (files: Readonly<Record<string, string>>): Promise<string> => {
  directory = await mkdtemp(join(tmpdir(), 'www-server-bundle-'));
  const root = directory;
  await Promise.all(
    Object.entries(files).map(async ([file, code]) => {
      await mkdir(dirname(join(root, file)), { recursive: true });
      await writeFile(join(root, file), code);
    }),
  );
  return root;
};

const asFiles = (files: Readonly<Record<string, string>>) =>
  Object.entries(files).map(([path, code]) => ({ path, code }));

describe('www server bundle check (RR5)', () => {
  test('passes the single-index server build', async () => {
    expect(findServerBundleViolations(asFiles(cleanBuild))).toEqual([]);
    expect(await checkServerBundle(await writeServer(cleanBuild))).toEqual([]);
  });

  test('fails a live or scene module inlined into index.js', () => {
    const inlined = {
      ...cleanBuild,
      'index.js': `${cleanBuild['index.js']}\n//#region src/live.ts\nexport const live = 3;\n//#endregion`,
    };
    const sceneInlined = { ...cleanBuild, 'index.js': `//#region src/scene.ts\nconst scene = 4;\n//#endregion` };

    expect(findServerBundleViolations(asFiles(inlined))).toEqual([
      { file: 'index.js', rule: 'graphics-module', detail: '//#region src/live.ts' },
    ]);
    expect(findServerBundleViolations(asFiles(sceneInlined))).toEqual([
      { file: 'index.js', rule: 'graphics-module', detail: '//#region src/scene.ts' },
    ]);
  });

  test('fails a live or scene chunk, three.js and a source map', () => {
    const dirty = {
      ...cleanBuild,
      '_www/bundles/live-G4aXMVSD.js': 'export {};',
      'index.js': `${cleanBuild['index.js']}\n//#region ../../node_modules/.pnpm/three@0.184.0/node_modules/three/build/three.core.js\nconst REVISION = "184";\n//#endregion`,
      'index.js.map': '{}',
    };

    expect(findServerBundleViolations(asFiles(dirty)).map(({ file, rule }) => `${file}: ${rule}`)).toEqual([
      'index.js: three',
      '_www/bundles/live-G4aXMVSD.js: graphics-chunk',
      'index.js.map: source-map',
    ]);
    expect(
      findServerBundleViolations([{ path: 'index.js', code: 'window.__THREE__ = "184";' }]).map(({ rule }) => rule),
    ).toEqual(['three']);
  });

  test('throws when the server build has no index.js', async () => {
    await expect(checkServerBundle(await writeServer({ 'server-build.js': '' }))).rejects.toThrow('has no index.js');
  });
});
