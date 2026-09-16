/**
 * The allowlist is generated, never hand-maintained (B5 R3): it must resolve to
 * real build output and fail the build when it cannot.
 */
import { expect, it } from 'vitest';
import { collectOfflineShellAssets, offlineShellVersion } from '#scripts/generate-offline-shell.js';
import type { ClientBuildView, ViteManifest } from '#scripts/generate-offline-shell.js';

const manifest: ViteManifest = {
  'app/entry.client.tsx': {
    file: 'assets/entry-aaa.js',
    imports: ['_shared-ddd.js'],
    css: ['assets/app-bbb.css'],
  },
  '_shared-ddd.js': { file: 'assets/shared-ddd.js', dynamicImports: ['app/kernel.ts'] },
  'app/kernel.ts': { file: 'assets/kernel-eee.js', assets: ['assets/kernel-fff.wasm'] },
  'app/styles/global.css': { file: 'assets/app-bbb.css' },
};

const files = new Map<string, string>([
  [
    'usage/index.html',
    `<!DOCTYPE html><html><head>
      <link rel="stylesheet" href="/assets/app-bbb.css"/>
      <link rel="preload" as="font" href="/fonts/Geist-Variable.woff2"/>
      <link rel="icon" href="/favicon.svg"/>
      <link rel="modulepreload" href="/assets/entry-aaa.js"/>
      <script src="/assets/entry-aaa.js"></script>
      <a href="https://docs.tau.new/">docs</a>
    </head><body></body></html>`,
  ],
  ['assets/app-bbb.css', "@font-face{src:url('/fonts/GeistMono-Variable.woff2') format('woff2')}"],
  ['assets/entry-aaa.js', 'entry'],
  ['assets/shared-ddd.js', 'shared'],
  ['fonts/Geist-Variable.woff2', 'font'],
  ['fonts/GeistMono-Variable.woff2', 'mono font'],
  ['favicon.svg', '<svg/>'],
]);

const build: ClientBuildView = {
  readText: (relativePath) => files.get(relativePath),
  exists: (relativePath) => files.has(relativePath),
  manifest,
};

it('resolves every entry the prerendered document needs to an existing build asset', () => {
  const assets = collectOfflineShellAssets(['/usage'], build);

  expect(assets).toStrictEqual([
    '/assets/app-bbb.css',
    '/assets/entry-aaa.js',
    '/assets/shared-ddd.js',
    '/favicon.svg',
    '/fonts/Geist-Variable.woff2',
    '/fonts/GeistMono-Variable.woff2',
  ]);
});

it('ignores query strings and fragments when resolving same-origin assets', () => {
  const decoratedFiles = new Map(files);
  decoratedFiles.set(
    'usage/index.html',
    '<link rel="stylesheet" href="/assets/app-bbb.css?v=1#theme"><script src="/assets/entry-aaa.js?module=1#boot"></script>',
  );
  const decoratedBuild: ClientBuildView = {
    ...build,
    readText: (relativePath) => decoratedFiles.get(relativePath),
    exists: (relativePath) => decoratedFiles.has(relativePath),
  };

  expect(collectOfflineShellAssets(['/usage'], decoratedBuild)).toStrictEqual([
    '/assets/app-bbb.css',
    '/assets/entry-aaa.js',
    '/assets/shared-ddd.js',
    '/fonts/GeistMono-Variable.woff2',
  ]);
});

it.each(['/assets/kernel.wasm?v=1#x', '/assets/kernel.js.map?debug=1#x', String.raw`/\other.invalid/assets/entry.js`])(
  'excludes %s after URL normalization',
  (reference) => {
    const referenceBuild: ClientBuildView = {
      readText: (relativePath) =>
        relativePath === 'usage/index.html' ? `<script src="${reference}"></script>` : undefined,
      exists: () => false,
      manifest: {},
    };

    expect(collectOfflineShellAssets(['/usage'], referenceBuild)).toStrictEqual([]);
  },
);

it('excludes cross-origin references, dynamic imports and kernel binaries', () => {
  const assets = collectOfflineShellAssets(['/usage'], build);

  expect(assets).not.toContain('https://docs.tau.new/');
  expect(assets).not.toContain('/assets/kernel-eee.js');
  expect(assets.some((asset) => asset.endsWith('.wasm'))).toBe(false);
});

it('fails when a referenced asset is missing from the build output', () => {
  const withoutShared: ClientBuildView = {
    ...build,
    exists: (relativePath) => relativePath !== 'assets/shared-ddd.js' && files.has(relativePath),
  };

  expect(() => collectOfflineShellAssets(['/usage'], withoutShared)).toThrow(/missing build asset/u);
});

it('collects a directly linked hashed stylesheet absent from the build manifest', () => {
  const directCssFiles = new Map(files);
  directCssFiles.set('usage/index.html', '<link rel="stylesheet" href="/assets/app-bbb.css">');
  const directCssBuild: ClientBuildView = {
    readText: (relativePath) => directCssFiles.get(relativePath),
    exists: (relativePath) => directCssFiles.has(relativePath),
    manifest: {},
  };

  expect(collectOfflineShellAssets(['/usage'], directCssBuild)).toStrictEqual([
    '/assets/app-bbb.css',
    '/fonts/GeistMono-Variable.woff2',
  ]);
});

it('fails when a hashed asset is absent from the build manifest', () => {
  const unlistedFiles = new Map(files);
  unlistedFiles.set('usage/index.html', '<script src="/assets/orphan-zzz.js"></script>');
  unlistedFiles.set('assets/orphan-zzz.js', 'orphan');
  const unlisted: ClientBuildView = {
    readText: (relativePath) => unlistedFiles.get(relativePath),
    exists: (relativePath) => unlistedFiles.has(relativePath),
    manifest,
  };

  expect(() => collectOfflineShellAssets(['/usage'], unlisted)).toThrow(/absent from the build manifest/u);
});

it('fails when the shell document was not prerendered', () => {
  expect(() => collectOfflineShellAssets(['/nowhere'], build)).toThrow(/was not prerendered/u);
});

it('changes the version when the shell content changes', () => {
  const assets = collectOfflineShellAssets(['/usage'], build);
  const changedFiles = new Map(files);
  changedFiles.set('usage/index.html', `${files.get('usage/index.html') ?? ''}<!-- redeploy -->`);
  const changed: ClientBuildView = { ...build, readText: (path) => changedFiles.get(path) };

  expect(offlineShellVersion(['/usage'], assets, build)).toBe(offlineShellVersion(['/usage'], assets, build));
  expect(offlineShellVersion(['/usage'], assets, changed)).not.toBe(offlineShellVersion(['/usage'], assets, build));
});
