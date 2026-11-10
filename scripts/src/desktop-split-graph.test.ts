import { globSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { createProjectGraphAsync, readCachedProjectGraph } from '@nx/devkit';
import type { ProjectGraph } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

/*
 * The desktop split's graph guards in their pre-split form (desktop split, DS-0). `apps/desktop/src/tau` is still
 * inside `desktop` and the one static `desktop -> ui` edge, `renderer-payload.test.ts`, is still there; these
 * assertions hold today and pin the import surface the split relies on, so a new import cannot quietly widen the
 * closure `desktop-services-host` will have or add a second edge to `ui`. Each later PR of the split flips its
 * section to the post-split form.
 */

const root = resolve(import.meta.dirname, '../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

/** Every module specifier a file names in a static, re-export, side-effect or dynamic import. */
const specifiers = (source: string): readonly string[] =>
  [
    ...source.matchAll(/\b(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/gu),
    ...source.matchAll(/\brequire(?:\.resolve)?\(\s*['"]([^'"]+)['"]/gu),
  ].map(([, specifier]) => specifier ?? '');

const desktopRoot = 'apps/desktop';
const uiRoot = 'apps/ui';
const uiPackageName = '@taucad/app';

const isProduction = (path: string): boolean => !/\.(?:test|fixture)\.ts$|\.d\.ts$/u.test(path);

/** The services host tree (desktop split blueprint F1 rows 5–10): what becomes `desktop-services-host`. */
const tauProductionFiles = globSync(`${desktopRoot}/src/tau/**/*.ts`, { cwd: root })
  .filter((file) => isProduction(file))
  .toSorted();

/** Every source file of the desktop project that can import a module. */
const desktopSourceFiles = globSync(`${desktopRoot}/**/*.{ts,mts,cts,tsx,js,mjs,cjs}`, {
  cwd: root,
  exclude: (path) => /(?:^|\/)(?:node_modules|dist|out|package-out|resources)$/u.test(path),
}).toSorted();

/** A specifier that names the UI app: its package name, or a relative path that lands inside `apps/ui`. */
const importsUi = (file: string, specifier: string): boolean => {
  if (specifier === uiPackageName || specifier.startsWith(`${uiPackageName}/`)) {
    return true;
  }
  if (!specifier.startsWith('.')) {
    return false;
  }
  const target = relative(root, resolve(root, dirname(file), specifier)).replaceAll('\\', '/');
  return target === uiRoot || target.startsWith(`${uiRoot}/`);
};

const projectGraph = async (): Promise<ProjectGraph> => {
  try {
    return readCachedProjectGraph();
  } catch {
    return createProjectGraphAsync();
  }
};

describe('desktop split graph (pre-split)', () => {
  it('finds the services host tree where the blueprint maps it', () => {
    for (const file of [
      'services-host.impl.ts',
      'services-host.ts',
      'services-host.entry.ts',
      'desktop-runtime.factory.ts',
      'kernel-host.ts',
      'geometry-host.ts',
      'native-preparation.ts',
      'permission-host.ts',
      'permission-store.ts',
    ]) {
      expect(tauProductionFiles).toContain(`${desktopRoot}/src/tau/${file}`);
    }
  });

  it('reaches into main and shared from the services host only at the couplings the split inverts', () => {
    const reaches = tauProductionFiles.flatMap((file) =>
      [
        ...new Set(
          specifiers(read(file)).filter(
            (specifier) =>
              specifier.startsWith('#main/') || specifier.startsWith('#shared/') || specifier.startsWith('..'),
          ),
        ),
      ].map((specifier) => `${file.slice(`${desktopRoot}/src/tau/`.length)} -> ${specifier}`),
    );

    // Blueprint F2: canonicalPath moves into the library, createDiagnosticsLog becomes an injected port, and the
    // two IPC contracts move to a `libs/types` subpath. Anything else is a new coupling the split would have to carry.
    expect(reaches.toSorted()).toEqual([
      'desktop-runtime.factory.ts -> #main/diagnostics.js',
      'permission-host.ts -> #shared/permission-channels.js',
      'permission-store.ts -> #main/project-roots.js',
      'services-host.impl.ts -> #main/project-roots.js',
      'services-host.impl.ts -> #shared/machine-shutdown.js',
      'services-host.impl.ts -> #shared/permission-channels.js',
      'services-host.ts -> #main/diagnostics.js',
    ]);
  });

  it('imports the UI app from the desktop project only in the renderer payload test', () => {
    expect(desktopSourceFiles).toContain(`${desktopRoot}/src/main/main.ts`);
    const importers = desktopSourceFiles.filter((file) =>
      specifiers(read(file)).some((specifier) => importsUi(file, specifier)),
    );

    expect(importers).toEqual([`${desktopRoot}/src/main/renderer-payload.test.ts`]);
  });

  it('has that test as the one static desktop -> ui edge, and builds the renderer through a task edge', async () => {
    const graph = await projectGraph();
    const uiEdges = (graph.dependencies['desktop'] ?? []).filter(({ target }) => target === 'ui');

    expect(uiEdges.map(({ type }) => type)).toEqual(['static']);
    expect(graph.nodes['desktop']?.data.targets?.['build']?.dependsOn).toContainEqual({
      projects: ['ui'],
      target: 'build:desktop',
    });
  });

  it('keeps the packaged suite a dependent of desktop', async () => {
    const graph = await projectGraph();

    expect(graph.nodes['desktop-e2e']?.data.implicitDependencies).toContain('desktop');
    expect(graph.dependencies['desktop-e2e']?.map(({ target }) => target)).toContain('desktop');
  });

  it('tags exactly the desktop lane projects with ci:desktop', async () => {
    const graph = await projectGraph();
    const tagged = Object.values(graph.nodes)
      .filter(({ data }) => data.tags?.includes('ci:desktop'))
      .map(({ name }) => name);

    // `desktop-services-host` joins when it is extracted (DS-2).
    expect(tagged.toSorted()).toEqual(['desktop']);
  });
});
