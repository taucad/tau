// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ModuleIdManifest, ModuleIdManifestChunk } from '@taucad/vite/module-id-manifest';
import { buildWarmManifest, warmFilesOf, writeWarmManifest } from '#scripts/write-warm-manifest.ts';
import { findWarmManifestProblems } from '#scripts/check-critical-budget.mts';
import { rootKeys, staticClosure } from '#scripts/interactive-closure.ts';

const manifest = {
  'app/entry.client.tsx': { file: 'assets/entry.client-a.js', imports: ['_react-b.js'] },
  'app/root.tsx?__react-router-build-client-route': {
    file: 'assets/root-c.js',
    imports: ['_react-b.js'],
    css: ['assets/root-c.css'],
  },
  'app/routes/_index/route.tsx?__react-router-build-client-route': { file: 'assets/route-d.js' },
  'app/routes/w.$workspace.$project/chat-interface-desktop.tsx': {
    file: 'assets/chat-interface-desktop-j.js',
    imports: ['_three-e.js', '_kernel-g.js', '_worker-url-k.js'],
    css: ['assets/chat-interface-desktop-j.css'],
  },
  '_react-b.js': { file: 'assets/react-b.js' },
  '_three-e.js': { file: 'assets/three-e.js', css: ['assets/three-e.css'] },
  '_kernel-g.js': { file: 'assets/kernel-g.js' },
  '_worker-url-k.js': { file: 'assets/kernel.worker-h.js' },
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

const moduleIds: ModuleIdManifest = {
  schema: 'tau-module-id-manifest-v1',
  chunks: [
    chunk('assets/entry.client-a.js', ['apps/ui/app/entry.client.tsx']),
    chunk('assets/root-c.js', ['apps/ui/app/root.tsx']),
    chunk('assets/route-d.js', ['apps/ui/app/routes/_index/route.tsx']),
    chunk('assets/chat-interface-desktop-j.js', [
      'apps/ui/app/routes/w.$workspace.$project/chat-interface-desktop.tsx',
    ]),
    chunk('assets/react-b.js', ['node_modules/.pnpm/react@19.2.0/node_modules/react/index.js']),
    chunk('assets/three-e.js', ['node_modules/.pnpm/three@0.184.0/node_modules/three/build/three.module.js']),
    chunk('assets/kernel-g.js', ['packages/plugins/replicad/src/replicad.kernel.ts']),
  ],
  assets: [
    { fileName: 'assets/kernel.worker-h.js', sources: ['apps/ui/app/workers/kernel.worker.ts'] },
    { fileName: 'assets/opencascade-i.wasm', sources: [] },
  ],
};

const homeRoots = ['entry.client.tsx', 'root.tsx', 'routes/_index/route.tsx'];
const projectRoots = ['entry.client.tsx', 'root.tsx', 'routes/w.$workspace.$project/chat-interface-desktop.tsx'];

describe('warmFilesOf', () => {
  it("should list a light class's whole interactive closure", () => {
    const { js, css } = staticClosure(manifest, rootKeys(manifest, homeRoots));
    expect(warmFilesOf({ manifest, moduleIds, roots: homeRoots })).toEqual([...js, ...css].map((file) => `/${file}`));
  });

  it('should leave out a heavy chunk and its stylesheet, a kernel chunk and a worker, whatever the closure holds', () => {
    const warm = warmFilesOf({ manifest, moduleIds, roots: projectRoots });
    expect(warm).toEqual([
      '/assets/chat-interface-desktop-j.js',
      '/assets/entry.client-a.js',
      '/assets/react-b.js',
      '/assets/root-c.js',
      '/assets/chat-interface-desktop-j.css',
      '/assets/root-c.css',
    ]);
    expect(warm.some((href) => /three|kernel|worker|wasm/u.test(href))).toBe(false);
  });
});

describe('buildWarmManifest', () => {
  it('should list each guarded class, and pass the budget check of its own build', () => {
    const classes = [
      { id: 'project', label: 'project route', roots: projectRoots },
      { id: 'home', label: 'Home', roots: homeRoots },
    ];
    const warm = buildWarmManifest({ manifest, moduleIds, classes });
    expect(Object.keys(warm.classes)).toEqual(['project', 'home']);
    const closures = new Map(
      classes.map((routeClass) => {
        const { js, css } = staticClosure(manifest, rootKeys(manifest, routeClass.roots));
        return [routeClass.id, [...js, ...css]];
      }),
    );
    expect(findWarmManifestProblems({ warm, closures, manifest, moduleIds })).toEqual([]);
  });
});

describe('writeWarmManifest', () => {
  let directory: string | undefined;

  afterEach(() => {
    if (directory !== undefined) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("should write the registry's guarded classes beside the edge shells", () => {
    directory = mkdtempSync(join(tmpdir(), 'warm-manifest-'));
    const clientDirectory = join(directory, 'client');
    mkdirSync(join(clientDirectory, '.vite'), { recursive: true });
    mkdirSync(join(clientDirectory, '__shell'));
    const registryManifest = {
      ...manifest,
      'app/components/chat/new-project-chat-composer.tsx': { file: 'assets/composer-l.js' },
      'app/routes/w.$workspace.$project/route.tsx?__react-router-build-client-route': { file: 'assets/project-m.js' },
      'app/routes/w.$workspace.$project/project-live-sessions.tsx': { file: 'assets/sessions-n.js' },
      'app/routes/w.$workspace.$project/chat-interface-mobile.tsx': { file: 'assets/mobile-o.js' },
    };
    writeFileSync(join(clientDirectory, '.vite', 'manifest.json'), JSON.stringify(registryManifest));
    const moduleIdsPath = join(directory, 'client-module-ids.json');
    writeFileSync(
      moduleIdsPath,
      JSON.stringify({
        ...moduleIds,
        chunks: [
          ...moduleIds.chunks,
          chunk('assets/composer-l.js', ['apps/ui/app/components/chat/new-project-chat-composer.tsx']),
          chunk('assets/project-m.js', ['apps/ui/app/routes/w.$workspace.$project/route.tsx']),
          chunk('assets/sessions-n.js', ['apps/ui/app/routes/w.$workspace.$project/project-live-sessions.tsx']),
          chunk('assets/mobile-o.js', ['apps/ui/app/routes/w.$workspace.$project/chat-interface-mobile.tsx']),
        ],
      }),
    );
    const written = writeWarmManifest({ clientDirectory, moduleIdsPath });
    expect(JSON.parse(readFileSync(join(clientDirectory, '__shell', 'warm.json'), 'utf8'))).toEqual(written);
    expect(Object.keys(written.classes)).toEqual(['project', 'home']);
    expect(written.classes['home']).toContain('/assets/composer-l.js');
    expect(written.classes['project']).toEqual(
      expect.arrayContaining(['/assets/project-m.js', '/assets/sessions-n.js', '/assets/mobile-o.js']),
    );
    expect(written.classes['project']).not.toContain('/assets/three-e.js');
  });
});
