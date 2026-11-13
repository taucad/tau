import { globSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { createProjectGraphAsync, readCachedProjectGraph } from '@nx/devkit';
import type { ProjectGraph } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

/*
 * The desktop split's graph guards. The services host section is in its project-level form (DS-2): the utility hosts
 * are the app library `desktop-services-host`, which imports nothing from the desktop app (its main process, shared
 * contracts or utility entries) or the UI app, so its closure stays what its rows test; the app bundles it and passes
 * it the diagnostics log through a port (D-DS6), and the two IPC contracts both sides share are
 * `@taucad/types/desktop` (D-DS5). The renderer section is in its post-cut form (DS-1): `desktop` no longer imports the UI app, so
 * a renderer-only change does not affect `desktop`, while `desktop:build` still builds the renderer through a task edge
 * and the payload check that reads the renderer belongs to `ui`.
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

/** The services host library (desktop split blueprint F1 rows 5–8 and 10). */
const servicesHostRoot = 'apps/libs/desktop-services-host';
const servicesHostProductionFiles = globSync(`${servicesHostRoot}/src/**/*.ts`, { cwd: root })
  .filter((file) => isProduction(file))
  .toSorted();
const servicesHostFiles = globSync(`${servicesHostRoot}/src/**/*.ts`, { cwd: root }).toSorted();

/** Every source file of the desktop project that can import a module. */
const desktopSourceFiles = globSync(`${desktopRoot}/**/*.{ts,mts,cts,tsx,js,mjs,cjs}`, {
  cwd: root,
  exclude: (path) => /(?:^|\/)(?:node_modules|dist|out|package-out|resources)$/u.test(path),
}).toSorted();

/** Whether a path relative to a file's directory lands inside `apps/ui`. */
const landsInUi = (file: string, path: string): boolean => {
  const target = relative(root, resolve(root, dirname(file), path)).replaceAll('\\', '/');
  return target === uiRoot || target.startsWith(`${uiRoot}/`);
};

/** A specifier that names the UI app: its package name, or a relative path that lands inside `apps/ui`. */
const importsUi = (file: string, specifier: string): boolean => {
  if (specifier === uiPackageName || specifier.startsWith(`${uiPackageName}/`)) {
    return true;
  }
  return specifier.startsWith('.') && landsInUi(file, specifier);
};

/** Relative path literals (`'../../../ui/package.json'`) that a file could read, require or resolve from. */
const relativePathLiterals = (source: string): readonly string[] =>
  [...source.matchAll(/['"`]((?:\.\.\/)+[^'"`$]*)['"`]/gu)].map(([, path]) => path ?? '');

const projectGraph = async (): Promise<ProjectGraph> => {
  try {
    return readCachedProjectGraph();
  } catch {
    return createProjectGraphAsync();
  }
};

describe('desktop split graph: services host (extracted)', () => {
  it('finds the services host tree in the library and none of it left in the app', () => {
    for (const file of [
      'services-host.impl.ts',
      'services-host.ts',
      'desktop-runtime.factory.ts',
      'kernel-host.ts',
      'geometry-host.ts',
      'native-preparation.ts',
      'permission-host.ts',
      'permission-store.ts',
      'project-roots.ts',
      'services-host.terminal.conformance.test.ts',
    ]) {
      expect(servicesHostFiles).toContain(`${servicesHostRoot}/src/${file}`);
    }
    expect(globSync(`${desktopRoot}/src/tau/**`, { cwd: root })).toEqual([]);
    // The three utility entries are the app's rollup inputs: they hand the library the diagnostics port, then import it.
    expect(globSync(`${desktopRoot}/src/utility/*.entry.ts`, { cwd: root }).toSorted()).toEqual([
      `${desktopRoot}/src/utility/geometry-host.entry.ts`,
      `${desktopRoot}/src/utility/kernel-host.entry.ts`,
      `${desktopRoot}/src/utility/services-host.entry.ts`,
    ]);
  });

  it('imports nothing from the desktop app, its shared contracts or the UI app', () => {
    // Tests included: a library test that reached into the app would put the app back in the library's closure.
    const reaches = servicesHostFiles.flatMap((file) =>
      specifiers(read(file))
        .filter(
          (specifier) =>
            specifier.startsWith('#main/') ||
            specifier.startsWith('#shared/') ||
            specifier.startsWith('#tau/') ||
            specifier.startsWith('..') ||
            specifier === '@taucad/desktop' ||
            specifier === uiPackageName ||
            specifier.startsWith(`${uiPackageName}/`),
        )
        .map((specifier) => `${file} -> ${specifier}`),
    );

    expect(reaches).toEqual([]);
  });

  it('inverts the couplings the blueprint names (F2): contracts in types, diagnostics through a port', () => {
    const imports = new Set(servicesHostProductionFiles.flatMap((file) => specifiers(read(file))));
    expect(imports).toContain('@taucad/types/desktop');
    expect(imports).toContain('#diagnostics.js');
    expect(globSync(`${desktopRoot}/src/shared/{permission-channels,machine-shutdown}.ts`, { cwd: root })).toEqual([]);
    for (const entry of ['kernel-host', 'services-host']) {
      expect(specifiers(read(`${desktopRoot}/src/utility/${entry}.entry.ts`)), entry).toEqual(
        expect.arrayContaining([
          'node:module',
          '#main/diagnostics.js',
          '@taucad/desktop-services-host/diagnostics',
          `@taucad/desktop-services-host/${entry}`,
        ]),
      );
    }
  });

  it('bundles the library into the desktop app from source and depends on it one way', async () => {
    const graph = await projectGraph();
    const manifest = JSON.parse(read(`${desktopRoot}/package.json`)) as { dependencies?: Record<string, string> };
    const library = JSON.parse(read(`${servicesHostRoot}/package.json`)) as {
      private?: boolean;
      sideEffects?: unknown;
    };
    const bundled = /const bundledWorkspaceDependencies = \[(?<list>[^\]]*)\]/u.exec(
      read(`${desktopRoot}/electron.vite.config.ts`),
    )?.groups?.['list'];

    expect(library.private).toBe(true);
    // The three bootstraps run on import: without this list the bundler drops them and each utility entry is empty.
    expect(library.sideEffects).toEqual(['./src/geometry-host.ts', './src/kernel-host.ts', './src/services-host.ts']);
    expect(manifest.dependencies?.['@taucad/desktop-services-host']).toBe('workspace:*');
    expect(bundled).toContain("'@taucad/desktop-services-host'");
    expect(graph.dependencies['desktop']?.map(({ target }) => target)).toContain('desktop-services-host');
    expect(graph.dependencies['desktop-services-host']?.map(({ target }) => target)).not.toContain('desktop');
    expect(graph.dependencies['desktop-services-host']?.map(({ target }) => target)).not.toContain('ui');
  });

  it('keeps the packaged suite a dependent of desktop', async () => {
    const graph = await projectGraph();

    expect(graph.nodes['desktop-e2e']?.data.implicitDependencies).toContain('desktop');
    expect(graph.dependencies['desktop-e2e']?.map(({ target }) => target)).toContain('desktop');
  });

  it('tags exactly the desktop lane projects with ci:desktop, and the library ci:shell', async () => {
    const graph = await projectGraph();
    const tagged = Object.values(graph.nodes)
      .filter(({ data }) => data.tags?.includes('ci:desktop'))
      .map(({ name }) => name);

    expect(tagged.toSorted()).toEqual(['desktop', 'desktop-services-host']);
    expect(graph.nodes['desktop-services-host']?.data.tags).toContain('ci:shell');
    expect(graph.nodes['desktop']?.data.tags).not.toContain('ci:shell');
  });
});

describe('desktop split graph: renderer edge (cut)', () => {
  it('imports the UI app from no file of the desktop project', () => {
    expect(desktopSourceFiles).toContain(`${desktopRoot}/src/main/main.ts`);
    const importers = desktopSourceFiles.flatMap((file) =>
      specifiers(read(file))
        .filter((specifier) => importsUi(file, specifier))
        .map((specifier) => `${file} -> ${specifier}`),
    );

    expect(importers).toEqual([]);
  });

  it('names no relative path into the UI app from the desktop project except its desktop build output', () => {
    // `ui:build:desktop`'s output is what `desktop:build` depends on as a task, so reading it is the artifact
    // consumption the cut keeps (`main.ts` serves it in development); the sources and manifest are not.
    const buildOutput = `${uiRoot}/desktop/build/`;
    const paths = desktopSourceFiles.flatMap((file) =>
      relativePathLiterals(read(file))
        .filter((path) => landsInUi(file, path))
        .map((path) => ({
          file,
          path,
          target: relative(root, resolve(root, dirname(file), path)).replaceAll('\\', '/'),
        })),
    );

    expect(
      paths.filter(({ target }) => !target.startsWith(buildOutput)).map(({ file, path }) => `${file} -> ${path}`),
    ).toEqual([]);
    expect(paths.map(({ file, target }) => `${file} -> ${target}`)).toEqual([
      `${desktopRoot}/src/main/main.ts -> ${buildOutput}client`,
    ]);
  });

  it('has no project-graph edge from desktop to ui, and builds the renderer through a task edge', async () => {
    const graph = await projectGraph();

    expect(graph.dependencies['desktop']?.map(({ target }) => target)).not.toContain('ui');
    expect(graph.nodes['desktop']?.data.implicitDependencies ?? []).not.toContain('ui');
    expect(graph.nodes['desktop']?.data.targets?.['build']?.dependsOn).toContainEqual({
      projects: ['ui'],
      target: 'build:desktop',
    });
  });

  it('runs the renderer payload check as a ui target that every desktop package target depends on', async () => {
    const graph = await projectGraph();
    const desktopTargets = graph.nodes['desktop']?.data.targets ?? {};
    const check = graph.nodes['ui']?.data.targets?.['check-desktop-payload'];
    const packageTargets = Object.keys(desktopTargets).filter((target) =>
      /^package-(?:macos|linux|windows)/u.test(target),
    );

    expect(check?.options?.command).toBe(
      'node --import @oxc-node/core/register apps/ui/scripts/check-desktop-payload.mts',
    );
    expect(check?.dependsOn).toEqual(['build:desktop', { projects: ['desktop'], target: 'build' }]);
    expect(desktopTargets).not.toHaveProperty('check-renderer-payload');
    expect(packageTargets.toSorted()).toEqual([
      'package-linux',
      'package-macos',
      'package-macos-intel',
      'package-macos-release',
      'package-macos-release-intel',
      'package-macos-unsigned',
      'package-macos-unsigned-intel',
      'package-windows',
    ]);
    for (const target of packageTargets) {
      expect(desktopTargets[target]?.dependsOn, target).toContainEqual({
        projects: ['ui'],
        target: 'check-desktop-payload',
      });
    }
  });
});
