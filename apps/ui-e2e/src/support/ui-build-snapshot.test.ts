// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// oxlint-disable-next-line no-restricted-imports -- The Node-only unit target intentionally runs without browser aliases.
import { missingSnapshotFiles } from './ui-build-snapshot.ts';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { force: true, recursive: true })));
});

/**
 * The shape `react-router build` emits, reduced to what the verification reads:
 * a client tree whose route manifest names every module, and an SSR bundle
 * split across sibling chunks that also names client modules.
 */
const createBuild = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-ui-build-'));
  roots.push(root);
  const build = join(root, 'build');
  await mkdir(join(build, 'client/assets'), { recursive: true });
  await mkdir(join(build, 'server/assets'), { recursive: true });
  await writeFile(
    join(build, 'client/assets/manifest-5a458655.js'),
    `window.__reactRouterManifest=${JSON.stringify({
      entry: { module: '/assets/entry.client-DAownI8W.js', imports: ['/assets/chunk-Dsj6hcqR.js'], css: [] },
      routes: {
        root: { id: 'root', module: '/assets/root-lhdA6SbP.js', imports: [], css: ['/assets/global-BhgZPHH5.css'] },
      },
    })};\n`,
  );
  await Promise.all(
    [
      'client/assets/entry.client-DAownI8W.js',
      'client/assets/chunk-Dsj6hcqR.js',
      'client/assets/root-lhdA6SbP.js',
      'client/assets/global-BhgZPHH5.css',
      'server/assets/chunk-D6YOYt7c.js',
    ].map(async (file) => writeFile(join(build, file), '')),
  );
  await writeFile(
    join(build, 'server/index.js'),
    'import { n } from "./assets/chunk-D6YOYt7c.js";\nconst m = "/assets/manifest-5a458655.js";\nexport { n, m };\n',
  );
  await writeFile(
    join(build, 'server/assets/wasm-exception-nClfmULj.js'),
    // The second line is the false positive the lowercase-hash rule exists for:
    // a bundled package's own path, quoted inside an inlined module source.
    'import { n } from "./chunk-D6YOYt7c.js";\nconst d = "./dist/nextjs/browser-node-builtins.mjs";\nexport { n, d };\n',
  );
  return build;
};

describe('UI build snapshot verification', () => {
  it('accepts a complete build, and ignores a package path quoted inside a bundle', async () => {
    // `browser-node-builtins.mjs` has an all-lowercase "hash"; treating it as an
    // emitted asset would reject every complete build.
    expect(missingSnapshotFiles(await createBuild())).toEqual([]);
  });

  it('rejects a snapshot missing one module the client route manifest names', async () => {
    const build = await createBuild();
    await rm(join(build, 'client/assets/root-lhdA6SbP.js'));

    expect(missingSnapshotFiles(build)).toEqual(['assets/manifest-5a458655.js → root-lhdA6SbP.js']);
  });

  it('rejects a snapshot missing a chunk the SSR bundle imports', async () => {
    const build = await createBuild();
    await rm(join(build, 'server/assets/chunk-D6YOYt7c.js'));

    expect(missingSnapshotFiles(build)).toEqual([
      'index.js → assets/chunk-D6YOYt7c.js',
      'assets/wasm-exception-nClfmULj.js → chunk-D6YOYt7c.js',
    ]);
  });

  it('rejects a snapshot whose SSR entry never arrived', async () => {
    const build = await createBuild();
    await rm(join(build, 'server/index.js'));

    expect(missingSnapshotFiles(build)).toContain('server/index.js');
  });
});
