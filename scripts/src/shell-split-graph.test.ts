import { globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createProjectGraphAsync, readCachedProjectGraph } from '@nx/devkit';
import type { ProjectGraph } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

/*
 * The shell split's graph guards in their pre-split form (shell split blueprint, PR 0). The sandbox file set
 * of `native-process-core` and the production files of `packages/host/src/shell` are still inside their
 * owners; these assertions hold today and pin the import surface the extraction relies on, so a new import
 * cannot quietly widen the closure that `sandbox` and `shell-service` will have once they move. Each later
 * PR of the split flips its section to the project-level form.
 */

const root = resolve(import.meta.dirname, '../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

/** Every module specifier a file names in a static, re-export, side-effect or dynamic import. */
const specifiers = (source: string): readonly string[] =>
  [
    ...source.matchAll(/\b(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/gu),
    ...source.matchAll(/\brequire(?:\.resolve)?\(\s*['"]([^'"]+)['"]/gu),
  ].map(([, specifier]) => specifier ?? '');

const nativeProcessRoot = 'packages/core/native-process';

/** The files that become `libs/sandbox` (blueprint F1 rows 1–11), relative to the workspace root. */
const sandboxFiles = [
  ...globSync(`${nativeProcessRoot}/src/shell/**/*.ts`, { cwd: root }),
  `${nativeProcessRoot}/src/shell.ts`,
  `${nativeProcessRoot}/src/native-sandbox.ts`,
  `${nativeProcessRoot}/src/native-sandbox.test.ts`,
  `${nativeProcessRoot}/src/child-resident.ts`,
  `${nativeProcessRoot}/src/child-resident.test.ts`,
].toSorted();

const isProduction = (path: string): boolean => !/\.(?:test|fixture)\.ts$/u.test(path);

/** The `#…` subpath import a sandbox file resolves to, as a workspace-relative path. */
const sandboxImportPath = (specifier: string): string =>
  `${nativeProcessRoot}/src/${specifier.slice(1).replace(/\.js$/u, '.ts')}`;

/** The host's shell service (blueprint F1 rows 20–23): what becomes `libs/shell-service`. */
const hostShellFiles = globSync('packages/host/src/shell/*.ts', { cwd: root }).toSorted();
const hostShellProductionFiles = hostShellFiles.filter((file) => isProduction(file));

/** The only workspace modules the service imports; `sandbox` replaces the third at extraction. */
const hostShellAllowedWorkspaceImports = new Set([
  '@taucad/agent-host',
  '@taucad/filesystem/path-registry',
  '@taucad/native-process-core/shell',
]);

const projectGraph = async (): Promise<ProjectGraph> => {
  try {
    return readCachedProjectGraph();
  } catch {
    return createProjectGraphAsync();
  }
};

describe('shell split graph (pre-split)', () => {
  it('finds the sandbox file set where the blueprint maps it', () => {
    for (const file of [
      'process-tree.ts',
      'shell-custody.ts',
      'shell-provider.ts',
      'shell-fake.ts',
      'srt-shell-provider.ts',
      'srt-supervisor.ts',
      'shell.conformance.test.ts',
    ]) {
      expect(sandboxFiles).toContain(`${nativeProcessRoot}/src/shell/${file}`);
    }
  });

  it('imports no workspace package from the sandbox file set', () => {
    const offenders = sandboxFiles.flatMap((file) =>
      specifiers(read(file))
        .filter((specifier) => specifier.startsWith('@taucad/'))
        .map((specifier) => `${file} -> ${specifier}`),
    );

    expect(offenders).toEqual([]);
  });

  it('keeps the production files of the sandbox file set closed over the set', () => {
    const offenders = sandboxFiles
      .filter((file) => isProduction(file))
      .flatMap((file) =>
        specifiers(read(file))
          .filter((specifier) => specifier.startsWith('#') && !sandboxFiles.includes(sandboxImportPath(specifier)))
          .map((specifier) => `${file} -> ${specifier}`),
      );

    expect(offenders).toEqual([]);
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

  it('imports only agent-host, the filesystem path registry and the sandbox barrel from the host shell service', () => {
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
        .filter(([target]) => /^test:[\w-]*conformance$|^test:shell-qualification$/u.test(target))
        .map(([target, configuration]) => ({ target: `${name}:${target}`, cache: configuration.cache })),
    );

    expect(targets.map(({ target }) => target).toSorted()).toEqual(
      expect.arrayContaining([
        'desktop:test:terminal-conformance',
        'host:test:shell-conformance',
        'host:test:shell-qualification',
        'native-process-core:test:shell-conformance',
      ]),
    );
    expect(targets.filter(({ cache }) => cache !== false)).toEqual([]);
  });
});
