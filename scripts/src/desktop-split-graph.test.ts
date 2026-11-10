import { globSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { createProjectGraphAsync, readCachedProjectGraph } from '@nx/devkit';
import type { ProjectGraph } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

/*
 * The desktop split's graph guards. The services host section is still in its pre-split form (desktop split, DS-0):
 * `apps/desktop/src/tau` is still inside `desktop`, and these assertions pin the import surface the extraction relies
 * on, so a new import cannot quietly widen the closure `desktop-services-host` will have; DS-2 flips it to the
 * project-level form. The renderer section is in its post-cut form (DS-1): `desktop` no longer imports the UI app, so
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

/** The services host tree (desktop split blueprint F1 rows 5–10): what becomes `desktop-services-host`. */
const tauProductionFiles = globSync(`${desktopRoot}/src/tau/**/*.ts`, { cwd: root })
  .filter((file) => isProduction(file))
  .toSorted();

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

describe('desktop split graph: services host (pre-split)', () => {
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
