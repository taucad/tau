/**
 * The precache list is generated, never hand-maintained (progressive loading PL7): it must resolve to real build
 * output and fail the build when it cannot.
 */
import { expect, it } from 'vitest';
import { collectPrecacheFiles, precacheEntries } from '#scripts/precache-list.js';
import type { ClientBuildView, PrecacheDocument, ViteManifest } from '#scripts/precache-list.js';

const usage: PrecacheDocument = { document: '/usage/index.html', roots: [] };
const collect = (build: ClientBuildView, documents: readonly PrecacheDocument[] = [usage]): string[] =>
  collectPrecacheFiles(documents, build);

const manifest: ViteManifest = {
  'app/entry.client.tsx': {
    file: 'assets/entry-aaa.js',
    imports: ['_shared-ddd.js'],
    css: ['assets/app-bbb.css'],
  },
  '_shared-ddd.js': { file: 'assets/shared-ddd.js', dynamicImports: ['app/kernel.ts'] },
  'app/kernel.ts': { file: 'assets/kernel-eee.js', assets: ['assets/kernel-fff.wasm'] },
  'app/styles/global.css': { file: 'assets/app-bbb.css' },
  'app/routes/w.$workspace.$project/route.tsx?__react-router-build-client-route': {
    file: 'assets/route-ggg.js',
    imports: ['_shared-ddd.js'],
    css: ['assets/route-hhh.css'],
    assets: ['assets/thumbnail-iii.webp'],
    dynamicImports: ['app/kernel.ts'],
  },
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
  ['w/__shell/__shell/index.html', '<link rel="modulepreload" href="/assets/entry-aaa.js"/>'],
  ['assets/route-ggg.js', 'route'],
  ['assets/route-hhh.css', "@font-face{src:url('/assets/KaTeX_Main-jjj.woff') format('woff')}"],
  ['assets/thumbnail-iii.webp', 'image'],
  ['assets/KaTeX_Main-jjj.woff', 'font fallback'],
]);

const build: ClientBuildView = {
  readText: (relativePath) => files.get(relativePath),
  exists: (relativePath) => files.has(relativePath),
  manifest,
};

it('resolves every entry the prerendered document needs to an existing build asset', () => {
  const assets = collect(build);

  expect(assets).toStrictEqual([
    '/assets/app-bbb.css',
    '/assets/entry-aaa.js',
    '/assets/shared-ddd.js',
    '/favicon.svg',
    '/fonts/Geist-Variable.woff2',
    '/fonts/GeistMono-Variable.woff2',
    '/usage/index.html',
  ]);
});

it('adds a class’s interactive roots and their static closure, never a dynamic import', () => {
  const files = collect(build, [
    { document: '/w/__shell/__shell/index.html', roots: ['routes/w.$workspace.$project/route.tsx'] },
  ]);

  // The chunk's image and the stylesheet's hashed font fallback load when rendered, so they are cached on first use.
  expect(files).toStrictEqual([
    '/assets/app-bbb.css',
    '/assets/entry-aaa.js',
    '/assets/route-ggg.js',
    '/assets/route-hhh.css',
    '/assets/shared-ddd.js',
    '/fonts/GeistMono-Variable.woff2',
    '/w/__shell/__shell/index.html',
  ]);
});

it('fails when a class names a root the build manifest does not have', () => {
  expect(() => collect(build, [{ document: '/usage/index.html', roots: ['routes/renamed/route.tsx'] }])).toThrow(
    /no entry for app\/routes\/renamed\/route.tsx/u,
  );
});

it('revisions documents and other unhashed files by content and leaves hashed files unrevisioned', () => {
  const bytes = (path: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(files.get(path) ?? '');
  const entries = precacheEntries(['/assets/entry-aaa.js', '/usage/index.html', '/favicon.svg'], bytes);

  expect(entries.map((entry) => entry.revision === null)).toStrictEqual([true, false, false]);
  expect(entries[1]?.revision).toMatch(/^[\da-f]{32}$/u);
  expect(Object.keys(entries[0] ?? {}).toSorted()).toStrictEqual(['revision', 'url']);

  const changed = new Map(files);
  changed.set('usage/index.html', `${files.get('usage/index.html') ?? ''}<!-- redeploy -->`);
  const redeployed = precacheEntries(['/usage/index.html'], (path) =>
    new TextEncoder().encode(changed.get(path) ?? ''),
  );
  expect(redeployed[0]?.revision).not.toBe(entries[1]?.revision);
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

  expect(collect(decoratedBuild)).toStrictEqual([
    '/assets/app-bbb.css',
    '/assets/entry-aaa.js',
    '/assets/shared-ddd.js',
    '/fonts/GeistMono-Variable.woff2',
    '/usage/index.html',
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

    expect(collect(referenceBuild)).toStrictEqual(['/usage/index.html']);
  },
);

it('excludes cross-origin references, dynamic imports and kernel binaries', () => {
  const assets = collect(build);

  expect(assets).not.toContain('https://docs.tau.new/');
  expect(assets).not.toContain('/assets/kernel-eee.js');
  expect(assets.some((asset) => asset.endsWith('.wasm'))).toBe(false);
});

it('fails when a referenced asset is missing from the build output', () => {
  const withoutShared: ClientBuildView = {
    ...build,
    exists: (relativePath) => relativePath !== 'assets/shared-ddd.js' && files.has(relativePath),
  };

  expect(() => collect(withoutShared)).toThrow(/missing build file/u);
});

it('collects a directly linked hashed stylesheet absent from the build manifest', () => {
  const directCssFiles = new Map(files);
  directCssFiles.set('usage/index.html', '<link rel="stylesheet" href="/assets/app-bbb.css">');
  const directCssBuild: ClientBuildView = {
    readText: (relativePath) => directCssFiles.get(relativePath),
    exists: (relativePath) => directCssFiles.has(relativePath),
    manifest: {},
  };

  expect(collect(directCssBuild)).toStrictEqual([
    '/assets/app-bbb.css',
    '/fonts/GeistMono-Variable.woff2',
    '/usage/index.html',
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

  expect(() => collect(unlisted)).toThrow(/absent from the build manifest/u);
});

it('fails when the shell document was not prerendered', () => {
  expect(() => collect(build, [{ document: '/nowhere/index.html', roots: [] }])).toThrow(/was not prerendered/u);
});

it('ignores navigation links in the useful server-rendered shell', () => {
  const linkedFiles = new Map(files);
  linkedFiles.set(
    'usage/index.html',
    `${files.get('usage/index.html')}<a href="/projects">Projects</a><link rel="canonical" href="/usage"><a download href="/private/export">Export</a>`,
  );
  expect(collect({ ...build, readText: (path) => linkedFiles.get(path) })).toEqual(collect(build));
});
