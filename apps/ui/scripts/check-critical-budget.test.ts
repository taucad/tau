// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ModuleIdManifest, ModuleIdManifestChunk } from '@taucad/vite/module-id-manifest';
import {
  buildVariantOf,
  compareWithBudget,
  findEarlyKernelPreloads,
  measureClass,
  preloadHrefs,
  rootKeys,
  staticClosure,
} from '#scripts/check-critical-budget.mts';
import type { ClassBudget, ClassMeasure } from '#scripts/check-critical-budget.mts';

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
