import { globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createProjectGraphAsync, readCachedProjectGraph } from '@nx/devkit';
import type { ProjectGraph } from '@nx/devkit';
import { bundledLibraries, workspace } from '@taucad/nx';
import { describe, expect, it } from 'vitest';

/*
 * The shell split's graph guards (shell split blueprint). PR 1 extracted the sandbox into the private
 * `libs/sandbox` library that `@taucad/native-process-core` bundles, so its section is in the
 * project-level form: no workspace dependency, private, bundled by its one published owner. The
 * production files of `packages/host/src/shell` are still inside `host`; that section stays in its
 * pre-split form and pins the import surface `shell-service` will have, until PR 2 flips it.
 */

const root = resolve(import.meta.dirname, '../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

/** Every module specifier a file names in a static, re-export, side-effect or dynamic import. */
const specifiers = (source: string): readonly string[] =>
  [
    ...source.matchAll(/\b(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/gu),
    ...source.matchAll(/\brequire(?:\.resolve)?\(\s*['"]([^'"]+)['"]/gu),
  ].map(([, specifier]) => specifier ?? '');

const sandboxRoot = 'libs/sandbox';

/** Every source file of `libs/sandbox` (blueprint F1 rows 1–11), relative to the workspace root. */
const sandboxFiles = globSync(`${sandboxRoot}/src/**/*.ts`, { cwd: root }).toSorted();

const isProduction = (path: string): boolean => !/\.(?:test|fixture)\.ts$/u.test(path);

/** The `#…` subpath import a sandbox file resolves to, as a workspace-relative path. */
const sandboxImportPath = (specifier: string): string =>
  `${sandboxRoot}/src/${specifier.slice(1).replace(/\.js$/u, '.ts')}`;

/** The host's shell service (blueprint F1 rows 20–23): what becomes `libs/shell-service`. */
const hostShellFiles = globSync('packages/host/src/shell/*.ts', { cwd: root }).toSorted();
const hostShellProductionFiles = hostShellFiles.filter((file) => isProduction(file));

/** The only workspace modules the service imports; `@taucad/sandbox` subpaths replace the third in PR 2. */
const hostShellAllowedWorkspaceImports = new Set([
  '@taucad/agent-host',
  '@taucad/filesystem/path-registry',
  '@taucad/native-process-core/shell',
]);

/** The workspace projects one project depends on directly. */
const directDependencies = (projectGraphValue: ProjectGraph, project: string): readonly string[] =>
  (projectGraphValue.dependencies[project] ?? []).map(({ target }) => target);

const projectGraph = async (): Promise<ProjectGraph> => {
  try {
    return readCachedProjectGraph();
  } catch {
    return createProjectGraphAsync();
  }
};

describe('shell split graph', () => {
  it('finds the sandbox file set where the blueprint maps it', () => {
    for (const file of [
      'shell/process-tree.ts',
      'shell/shell-custody.ts',
      'shell/shell-provider.ts',
      'shell/shell-fake.ts',
      'shell/srt-shell-provider.ts',
      'shell/srt-supervisor.ts',
      'shell/shell.conformance.test.ts',
      'shell/srt-which.test.ts',
      'shell.ts',
      'native-sandbox.ts',
      'child-resident.ts',
    ]) {
      expect(sandboxFiles).toContain(`${sandboxRoot}/src/${file}`);
    }
  });

  it('imports no workspace package from the sandbox library', () => {
    const offenders = sandboxFiles.flatMap((file) =>
      specifiers(read(file))
        .filter((specifier) => specifier.startsWith('@taucad/') || specifier.startsWith('..'))
        .map((specifier) => `${file} -> ${specifier}`),
    );

    expect(offenders).toEqual([]);
  });

  it('keeps the production files of the sandbox library closed over the library', () => {
    const offenders = sandboxFiles
      .filter((file) => isProduction(file))
      .flatMap((file) =>
        specifiers(read(file))
          .filter((specifier) => specifier.startsWith('#') && !sandboxFiles.includes(sandboxImportPath(specifier)))
          .map((specifier) => `${file} -> ${specifier}`),
      );

    expect(offenders).toEqual([]);
  });

  it('gives the sandbox no workspace dependency and the tags of a private shell library', async () => {
    const graph = await projectGraph();
    const { sandbox } = graph.nodes;

    expect(sandbox?.data.root).toBe(sandboxRoot);
    expect(sandbox?.data.tags?.filter((tag) => !tag.startsWith('npm:')).toSorted()).toEqual([
      'ci:shell',
      'scope:shared',
      'shell:sandbox',
      'type:lib',
    ]);
    expect(directDependencies(graph, 'sandbox').filter((target) => !target.startsWith('npm:'))).toEqual([]);
    expect(JSON.parse(read(`${sandboxRoot}/package.json`))).toMatchObject({ name: '@taucad/sandbox', private: true });
  });

  it('bundles the sandbox into native-process-core, its one published owner', { timeout: 60_000 }, async () => {
    expect(bundledLibraries(await workspace(), 'native-process-core')).toEqual(['@taucad/sandbox']);
    expect(directDependencies(await projectGraph(), 'native-process-core')).toContain('sandbox');
  });

  it('finds the host shell service production files', () => {
    expect(hostShellProductionFiles).toEqual([
      'packages/host/src/shell/shell-contract.ts',
      'packages/host/src/shell/shell-environment.ts',
      'packages/host/src/shell/shell-git-view.ts',
      'packages/host/src/shell/shell-grant.ts',
      'packages/host/src/shell/shell-output.ts',
      'packages/host/src/shell/shell-service.ts',
    ]);
  });

  it('imports only agent-host, the filesystem path registry and the sandbox barrel from the host shell service (pre-split)', () => {
    const offenders = hostShellProductionFiles.flatMap((file) =>
      specifiers(read(file))
        .filter(
          (specifier) =>
            specifier.startsWith('@taucad/') ||
            (specifier.startsWith('#') && !specifier.startsWith('#shell/')) ||
            specifier.startsWith('..'),
        )
        .filter((specifier) => !hostShellAllowedWorkspaceImports.has(specifier))
        .map((specifier) => `${file} -> ${specifier}`),
    );

    expect(offenders).toEqual([]);
  });

  it('keeps every shell conformance and qualification target uncached', async () => {
    const graph = await projectGraph();
    const targets = Object.values(graph.nodes).flatMap(({ name, data }) =>
      Object.entries(data.targets ?? {})
        .filter(([target]) =>
          /^test:[\w-]*conformance$|^test:shell-qualification$|^test:native-sandbox-integration$/u.test(target),
        )
        .map(([target, configuration]) => ({ target: `${name}:${target}`, cache: configuration.cache })),
    );

    expect(targets.map(({ target }) => target).toSorted()).toEqual(
      expect.arrayContaining([
        'desktop:test:terminal-conformance',
        'host:test:shell-conformance',
        'host:test:shell-qualification',
        'native-process-core:test:native-sandbox-integration',
        'sandbox:test:shell-conformance',
      ]),
    );
    expect(targets.filter(({ cache }) => cache !== false)).toEqual([]);
  });
});
