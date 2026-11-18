// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ModuleIdManifest, ModuleIdManifestChunk } from '@taucad/vite/module-id-manifest';
import {
  buildVariantOf,
  compareWithBudget,
  findEarlyKernelPreloads,
  findPrecacheProblems,
  findSplitRouteModules,
  findWarmManifestProblems,
  measureClass,
  preloadHrefs,
} from '#scripts/check-critical-budget.mts';
import { rootKeys, staticClosure } from '#scripts/interactive-closure.ts';
import type {
  ClassBudget,
  ClassMeasure,
  RouterManifest,
  WrittenPrecacheEntry,
} from '#scripts/check-critical-budget.mts';

const manifest = {
  'app/entry.client.tsx': { file: 'assets/entry.client-a.js', imports: ['_react-b.js'] },
  'app/root.tsx?__react-router-build-client-route': {
    file: 'assets/root-c.js',
    imports: ['_react-b.js'],
    css: ['assets/root-c.css'],
  },
  'app/routes/_index/route.tsx?__react-router-build-client-route': {
    file: 'assets/route-d.js',
    imports: ['_three-e.js'],
  },
  'app/components/viewer.tsx': { file: 'assets/viewer-f.js', imports: ['_three-e.js'] },
  '_react-b.js': { file: 'assets/react-b.js' },
  '_three-e.js': { file: 'assets/three-e.js', css: ['assets/three-e.css'] },
};

const chunk = (fileName: string, ids: readonly string[]): ModuleIdManifestChunk => ({
  fileName,
  isEntry: false,
  isDynamicEntry: false,
  facadeModuleId: undefined,
  imports: [],
  dynamicImports: [],
  modules: ids.map((id) => ({ id, renderedLength: 100 })),
});

const chunks = [
  chunk('assets/entry.client-a.js', ['apps/ui/app/entry.client.tsx']),
  chunk('assets/root-c.js', ['apps/ui/app/root.tsx', 'apps/ui/app/cloud/commercial-features.cloud.ts']),
  chunk('assets/route-d.js', ['apps/ui/app/routes/_index/route.tsx']),
  chunk('assets/viewer-f.js', ['apps/ui/app/components/viewer.tsx']),
  chunk('assets/react-b.js', ['node_modules/.pnpm/react@19.2.0/node_modules/react/index.js']),
  chunk('assets/three-e.js', ['node_modules/.pnpm/three@0.184.0/node_modules/three/build/three.module.js']),
  chunk('assets/kernel-g.js', ['packages/plugins/replicad/src/replicad.kernel.ts']),
];

const moduleIds: ModuleIdManifest = {
  schema: 'tau-module-id-manifest-v1',
  chunks,
  assets: [
    { fileName: 'assets/kernel.worker-h.js', sources: ['apps/ui/app/workers/kernel.worker.ts'] },
    { fileName: 'assets/opencascade-i.wasm', sources: [] },
  ],
};

const measure = (overrides: Partial<ClassMeasure> = {}): ClassMeasure => ({
  brotliBytes: 100_000,
  requests: 40,
  largestChunkBrotliBytes: 20_000,
  largestChunk: 'assets/three-e.js',
  files: [],
  heavy: new Map([['three', ['assets/three-e.js']]]),
  moduleBytes: new Map(),
  ...overrides,
});

const budget: ClassBudget = {
  brotliBytes: 100_000,
  requests: 40,
  largestChunkBrotliBytes: 20_000,
  knownHeavy: { three: 'PL5' },
};
const limits = { tolerance: { bytes: 0.01, requests: 2 }, ratchetMargin: { bytes: 0.05, requests: 5 } };

describe('staticClosure', () => {
  it('should collect the static chunks and their stylesheets, and leave a dynamic chunk out', () => {
    expect(
      staticClosure(manifest, rootKeys(manifest, ['entry.client.tsx', 'root.tsx', 'routes/_index/route.tsx'])),
    ).toEqual({
      js: [
        'assets/entry.client-a.js',
        'assets/react-b.js',
        'assets/root-c.js',
        'assets/route-d.js',
        'assets/three-e.js',
      ],
      css: ['assets/root-c.css', 'assets/three-e.css'],
    });
  });

  it('should refuse a root the manifest does not hold, so a rename never passes by matching nothing', () => {
    expect(() => rootKeys(manifest, ['routes/renamed/route.tsx'])).toThrow(/no entry for app\/routes\/renamed/u);
  });
});

describe('measureClass', () => {
  it('should sum brotli bytes and requests, find the largest chunk and name the heavy families inside', () => {
    const result = measureClass({
      manifest,
      chunksByFile: new Map(chunks.map((entry) => [entry.fileName, entry])),
      roots: ['entry.client.tsx', 'routes/_index/route.tsx'],
      brotliSize: (file) => (file === 'assets/three-e.js' ? 500 : 10),
    });
    expect(result).toMatchObject({
      brotliBytes: 500 + 10 * 4,
      requests: 5,
      largestChunk: 'assets/three-e.js',
      largestChunkBrotliBytes: 500,
    });
    expect(result.heavy).toEqual(new Map([['three', ['assets/three-e.js']]]));
  });
});

describe('compareWithBudget', () => {
  it('should pass within the tolerance', () => {
    expect(
      compareWithBudget({ label: 'Home', measure: measure({ brotliBytes: 100_900, requests: 42 }), budget, limits }),
    ).toEqual([]);
  });

  it('should fail on growth past the tolerance', () => {
    expect(
      compareWithBudget({ label: 'Home', measure: measure({ brotliBytes: 101_100, requests: 43 }), budget, limits }),
    ).toEqual([
      'Home: brotli bytes 101100 B exceeds the budget 100000 B by more than 1%',
      'Home: 43 requests exceed the budget 40 by more than 2',
    ]);
  });

  it('should fail a gain past the ratchet margin until the budget is lowered', () => {
    expect(compareWithBudget({ label: 'Home', measure: measure({ brotliBytes: 94_000 }), budget, limits })).toEqual([
      'Home: brotli bytes 94000 B is more than 5% under the budget 100000 B; lower the budget (--write) to keep the gain',
    ]);
  });

  it('should fail a heavy family that is not known, and a known one that is gone', () => {
    expect(
      compareWithBudget({
        label: 'Home',
        measure: measure({ heavy: new Map([['ai', ['assets/root-c.js']]]) }),
        budget,
        limits,
      }),
    ).toEqual([
      "Home: the interactive tier holds the heavy family 'ai' (assets/root-c.js); load it behind import()",
      "Home: 'three' is no longer in the interactive tier; remove it from knownHeavy",
    ]);
  });

  it('should fail a class with no budget', () => {
    expect(compareWithBudget({ label: 'Home', measure: measure(), budget: undefined, limits })).toEqual([
      'Home: no budget for this class; run with --write to record one',
    ]);
  });
});

describe('findEarlyKernelPreloads', () => {
  it('should accept preloads of ordinary chunks', () => {
    expect(
      findEarlyKernelPreloads({
        preloads: new Map([['entry', ['/assets/entry.client-a.js', '/assets/three-e.js']]]),
        moduleIds,
      }),
    ).toEqual([]);
  });

  it('should name a preloaded wasm file, worker and kernel chunk', () => {
    expect(
      findEarlyKernelPreloads({
        preloads: new Map([
          ['route root', ['/assets/kernel-g.js', '/assets/kernel.worker-h.js']],
          ['usage/index.html', ['/assets/opencascade-i.wasm']],
        ]),
        moduleIds,
      }),
    ).toEqual([
      'route root preloads /assets/kernel-g.js, a chunk holding the kernel module packages/plugins/replicad/src/replicad.kernel.ts',
      'route root preloads /assets/kernel.worker-h.js, a worker or runtime asset',
      'usage/index.html preloads the wasm file /assets/opencascade-i.wasm',
    ]);
  });
});

describe('preloadHrefs', () => {
  it('should read modulepreload, preload and prefetch links and skip stylesheets', () => {
    const html = [
      '<link rel="modulepreload" href="/assets/entry.client-a.js"/>',
      "<link rel='preload' as='fetch' href='/assets/opencascade-i.wasm' crossorigin>",
      '<link href="/assets/later-j.js" rel="prefetch">',
      '<link rel="stylesheet" href="/assets/root-c.css"/>',
    ].join('');
    expect(preloadHrefs(html)).toEqual([
      '/assets/entry.client-a.js',
      '/assets/opencascade-i.wasm',
      '/assets/later-j.js',
    ]);
  });
});

describe('buildVariantOf', () => {
  it('should tell a cloud build from a self-host build by its boundary modules', () => {
    expect(buildVariantOf(moduleIds)).toBe('cloud');
    expect(
      buildVariantOf({
        ...moduleIds,
        chunks: [chunk('assets/root-c.js', ['apps/ui/app/cloud/commercial-features.self-host.ts'])],
      }),
    ).toBe('self-host');
    expect(() => buildVariantOf({ ...moduleIds, chunks: [] })).toThrow(/cloud or a self-host/u);
  });
});

describe('findWarmManifestProblems (PL8)', () => {
  const closures = new Map([
    ['home', ['assets/entry.client-a.js', 'assets/react-b.js', 'assets/root-c.js', 'assets/root-c.css']],
    ['project', ['assets/entry.client-a.js', 'assets/three-e.js', 'assets/three-e.css', 'assets/kernel-g.js']],
  ]);
  const check = (classes: Record<string, readonly string[]>): string[] =>
    findWarmManifestProblems({ warm: { version: 1, classes }, closures, manifest, moduleIds });

  it('should accept light files of each class closure', () => {
    expect(check({ home: ['/assets/entry.client-a.js', '/assets/root-c.css'], project: [] })).toEqual([]);
  });

  it('should refuse a heavy chunk, its stylesheet and a kernel chunk even inside the closure', () => {
    expect(check({ home: [], project: ['/assets/three-e.js', '/assets/three-e.css', '/assets/kernel-g.js'] })).toEqual([
      expect.stringMatching(/project lists \/assets\/three-e\.js, which belongs with the three module/u),
      expect.stringMatching(/project lists \/assets\/three-e\.css, which belongs with the three module/u),
      expect.stringMatching(/project lists \/assets\/kernel-g\.js, which belongs with the kernels module/u),
    ]);
  });

  it('should refuse a worker, a wasm file and a file outside the interactive tier', () => {
    expect(
      check({
        home: ['/assets/kernel.worker-h.js', '/assets/opencascade-i.wasm', '/assets/viewer-f.js'],
        project: [],
      }),
    ).toEqual([
      expect.stringMatching(/home lists \/assets\/kernel\.worker-h\.js, which is not a script or stylesheet/u),
      expect.stringMatching(/home lists \/assets\/opencascade-i\.wasm, which is not a script or stylesheet/u),
      expect.stringMatching(/home lists \/assets\/viewer-f\.js, which is outside its interactive tier/u),
    ]);
  });

  it('should require exactly the guarded classes, and a readable manifest', () => {
    expect(check({ home: [], publication: [] })).toEqual([
      "warm manifest: no list for the guarded class 'project'",
      "warm manifest: 'publication' is not a class the critical-path guards measure",
    ]);
    expect(findWarmManifestProblems({ warm: undefined, closures, manifest, moduleIds })).toEqual([
      expect.stringMatching(/__shell\/warm\.json is missing/u),
    ]);
  });
});

describe('findSplitRouteModules (React Router 8 migration B8, RR6)', () => {
  const manifest = (routes: RouterManifest['routes']): RouterManifest => ({
    entry: { module: '/assets/entry.client-a.js', imports: [] },
    routes,
  });

  it('should pass a manifest whose routes load one module each, as today', () => {
    expect(
      findSplitRouteModules(
        manifest({
          root: { module: '/assets/root-a.js' },
          'routes/import.$': { module: '/assets/route-b.js', imports: ['/assets/chunk-c.js'] },
        }),
      ),
    ).toStrictEqual([]);
  });

  it('should name every split module, which loads outside the patched stale-build fallback', () => {
    expect(
      findSplitRouteModules(
        manifest({
          'routes/import.$': {
            module: '/assets/route-b.js',
            clientLoaderModule: '/assets/route-b-client-loader.js',
          },
          'routes/projects_': { module: '/assets/route-d.js', hydrateFallbackModule: '/assets/route-d-fallback.js' },
        }),
      ),
    ).toStrictEqual([
      'routes/import.$ splits clientLoaderModule /assets/route-b-client-loader.js',
      'routes/projects_ splits hydrateFallbackModule /assets/route-d-fallback.js',
    ]);
  });
});

describe('findPrecacheProblems (PL7, shell invariant 8)', () => {
  const closures = new Map([
    ['home', ['assets/entry.client-a.js', 'assets/react-b.js', 'assets/root-c.js', 'assets/root-c.css']],
  ]);
  const documents = ['/__shell/home/index.html'];
  const expected = [...documents, ...(closures.get('home') ?? []).map((file) => `/${file}`), '/fonts/Geist.woff2'];
  const entry = (url: string): WrittenPrecacheEntry => ({
    url,
    revision: url.startsWith('/assets/') ? null : 'a1b2',
  });
  const check = (
    entries: readonly WrittenPrecacheEntry[] | undefined,
    generated: readonly string[] = expected,
  ): string[] =>
    findPrecacheProblems({ entries, expected: generated, closures, workerClassIds: ['home'], manifest, moduleIds });

  it('should accept the generated list: documents and fonts revisioned, hashed files not', () => {
    expect(check(expected.map((url) => entry(url)))).toEqual([]);
  });

  it('should refuse an entry added by hand and one the registry generates but the list lacks', () => {
    expect(
      check([...expected.filter((url) => url !== '/fonts/Geist.woff2'), '/robots.txt'].map((url) => entry(url))),
    ).toEqual([
      "precache: /fonts/Geist.woff2 is generated from the registry but not in the worker's list",
      "precache: /robots.txt is in the worker's list but not generated from the registry",
    ]);
  });

  it('should refuse a heavy chunk, its stylesheet, a kernel, a worker and a wasm file', () => {
    const heavy = [
      '/assets/three-e.js',
      '/assets/three-e.css',
      '/assets/kernel-g.js',
      '/assets/kernel.worker-h.js',
      '/assets/opencascade-i.wasm',
    ];
    expect(
      check(
        [...expected, ...heavy].map((url) => entry(url)),
        [...expected, ...heavy],
      ),
    ).toEqual([
      expect.stringMatching(/\/assets\/three-e\.js belongs with the three module/u),
      expect.stringMatching(/\/assets\/three-e\.css belongs with the three module/u),
      expect.stringMatching(/\/assets\/kernel-g\.js belongs with the kernels module/u),
      'precache: /assets/kernel.worker-h.js is a wasm, worker or runtime asset',
      'precache: /assets/opencascade-i.wasm is a wasm, worker or runtime asset',
    ]);
  });

  it('should refuse a revision on a hashed file, none on a document, and any integrity', () => {
    expect(
      check([
        { url: '/__shell/home/index.html', revision: null },
        { url: '/assets/entry.client-a.js', revision: 'a1b2' },
        { url: '/assets/react-b.js', revision: null, integrity: 'sha384-x' },
        ...expected.slice(3).map((url) => entry(url)),
      ]),
    ).toEqual([
      'precache: /__shell/home/index.html carries no content revision',
      'precache: /assets/entry.client-a.js is hashed by name but carries a revision',
      'precache: /assets/react-b.js carries url, revision, integrity; only url and revision are allowed',
    ]);
  });

  it('should require each answered class’s interactive tier, and a written list', () => {
    const withoutRoot = expected.filter((url) => url !== '/assets/root-c.js');
    expect(
      check(
        withoutRoot.map((url) => entry(url)),
        withoutRoot,
      ),
    ).toEqual(["precache: home's interactive tier holds /assets/root-c.js, which the worker does not precache"]);
    expect(check(undefined)).toEqual(['precache: build/service-worker-precache.json is missing']);
  });
});
