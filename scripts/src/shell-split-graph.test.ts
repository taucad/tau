import { globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createProjectGraphAsync, readCachedProjectGraph } from '@nx/devkit';
import type { ProjectGraph } from '@nx/devkit';
import { bundledLibraries, workspace } from '@taucad/nx';
import { describe, expect, it } from 'vitest';

/*
 * The shell split's graph guards (shell split blueprint). PR 1 extracted the sandbox into the private
 * `libs/sandbox` library that `@taucad/native-process-core` bundles; PR 2 extracted the shell service into the
 * private `libs/shell-service` library that `@taucad/host` bundles; PR 3 extracted the desktop Terminal's concern into
 * the private app library `apps/libs/desktop-terminal` that the desktop app bundles. Every section is in the
 * project-level form: the closure each library's rows test, private, bundled by its one owner. The service reaches the
 * sandbox only through its stateless `./shell/*` subpaths, so `@taucad/host` ships neither the SRT provider nor its
 * native dependencies (blueprint F2.7). The Terminal concern reaches only the service and the wire; the desktop keeps
 * its services host, its frame routing and the unchanged rows that drive them (decision D4).
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

const shellServiceRoot = 'libs/shell-service';

/** Every source file of `libs/shell-service` (blueprint F1 rows 20–24), relative to the workspace root. */
const shellServiceFiles = globSync(`${shellServiceRoot}/src/**/*.ts`, { cwd: root }).toSorted();
const shellServiceProductionFiles = shellServiceFiles.filter((file) => isProduction(file));

/** The only workspace modules the service's production files import: never the `@taucad/sandbox/shell` barrel. */
const shellServiceAllowedWorkspaceImports = new Set([
  '@taucad/agent-host',
  '@taucad/filesystem/path-registry',
  '@taucad/sandbox/shell/baseline',
  '@taucad/sandbox/shell/environment',
  '@taucad/sandbox/shell/identity',
  '@taucad/sandbox/shell/provider',
]);

/** Workspace modules no file of the service imports: the host's own wiring and the wire schema stay in `host`. */
const shellServiceForbiddenImports = [
  '@taucad/agent-tools',
  '@taucad/chat',
  '@taucad/host',
  '@taucad/native-process-core',
  '#agent-tools',
  '#mcp-server',
];

/** What is left of the host's shell directory: tests and fixtures only. */
const hostShellFiles = globSync('packages/host/src/shell/*.ts', { cwd: root }).toSorted();

const desktopTerminalRoot = 'apps/libs/desktop-terminal';

/** Every source file of `apps/libs/desktop-terminal` (blueprint F1 row 34 and its new rows), relative to the root. */
const desktopTerminalFiles = globSync(`${desktopTerminalRoot}/src/**/*.ts`, { cwd: root }).toSorted();
const desktopTerminalProductionFiles = desktopTerminalFiles.filter((file) => isProduction(file));

/** The only workspace modules the concern's production files import: the service's types and the wire. */
const desktopTerminalAllowedWorkspaceImports = new Set(['@taucad/shell-service', '@taucad/types/desktop-terminal']);

/** Modules no file of the concern imports: Electron, the services host and what the service already wraps. */
const desktopTerminalForbiddenImports = [
  'electron',
  '@taucad/host',
  '@taucad/native-process-core',
  '@taucad/agent-host',
  '#tau',
  '#main',
  '#shared',
];

/** The desktop Terminal rows that stay in `desktop`, unchanged (decision D4). */
const desktopTerminalConformance = 'apps/desktop/src/tau/services-host.terminal.conformance.test.ts';

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

  it('finds the shell service file set where the blueprint maps it', () => {
    expect(shellServiceProductionFiles).toEqual([
      'libs/shell-service/src/index.ts',
      'libs/shell-service/src/shell/shell-contract.ts',
      'libs/shell-service/src/shell/shell-environment.ts',
      'libs/shell-service/src/shell/shell-git-view.ts',
      'libs/shell-service/src/shell/shell-grant.ts',
      'libs/shell-service/src/shell/shell-output.ts',
      'libs/shell-service/src/shell/shell-service.ts',
    ]);
    expect(shellServiceFiles).toContain('libs/shell-service/src/shell/shell-service.conformance.test.ts');
  });

  it('leaves only tests and fixtures in the host shell directory', () => {
    expect(hostShellFiles.filter((file) => isProduction(file))).toEqual([]);
    expect(hostShellFiles).toEqual(
      expect.arrayContaining([
        'packages/host/src/shell/shell-contract.parity.test.ts',
        'packages/host/src/shell/shell-qualification.conformance.test.ts',
        'packages/host/src/shell/shell-service.host.conformance.test.ts',
      ]),
    );
  });

  it('imports only agent-host, the filesystem path registry and the stateless sandbox subpaths from the service', () => {
    const offenders = shellServiceProductionFiles.flatMap((file) =>
      specifiers(read(file))
        .filter(
          (specifier) =>
            specifier.startsWith('@taucad/') ||
            (specifier.startsWith('#') && !specifier.startsWith('#shell/')) ||
            specifier.startsWith('..'),
        )
        .filter((specifier) => !shellServiceAllowedWorkspaceImports.has(specifier))
        .map((specifier) => `${file} -> ${specifier}`),
    );

    expect(offenders).toEqual([]);
  });

  it('imports neither the host wiring nor the chat wire from any file of the service', () => {
    const offenders = shellServiceFiles.flatMap((file) =>
      specifiers(read(file))
        .filter((specifier) =>
          shellServiceForbiddenImports.some(
            (forbidden) =>
              specifier === forbidden || specifier.startsWith(`${forbidden}/`) || specifier.startsWith(`${forbidden}.`),
          ),
        )
        .map((specifier) => `${file} -> ${specifier}`),
    );

    expect(offenders).toEqual([]);
  });

  it('gives the shell service its three workspace dependencies and the tags of a private shell library', async () => {
    const graph = await projectGraph();
    const service = graph.nodes['shell-service'];

    expect(service?.data.root).toBe(shellServiceRoot);
    expect(service?.data.tags?.filter((tag) => !tag.startsWith('npm:')).toSorted()).toEqual([
      'ci:shell',
      'scope:shared',
      'shell:service',
      'type:lib',
    ]);
    expect(
      directDependencies(graph, 'shell-service')
        .filter((target) => !target.startsWith('npm:'))
        .toSorted(),
    ).toEqual(['agent-host', 'filesystem', 'sandbox']);
    expect(JSON.parse(read(`${shellServiceRoot}/package.json`))).toMatchObject({
      name: '@taucad/shell-service',
      private: true,
    });
  });

  it(
    'bundles the shell service and the sandbox into host without its native dependencies',
    { timeout: 60_000 },
    async () => {
      expect(bundledLibraries(await workspace(), 'host')).toEqual(
        expect.arrayContaining(['@taucad/sandbox', '@taucad/shell-service']),
      );
      expect(directDependencies(await projectGraph(), 'host')).toEqual(
        expect.arrayContaining(['sandbox', 'shell-service']),
      );
      const manifest = JSON.parse(read('packages/host/package.json')) as Record<
        string,
        Record<string, string> | undefined
      >;
      const declared = ['dependencies', 'optionalDependencies', 'peerDependencies'].flatMap((field) =>
        Object.keys(manifest[field] ?? {}),
      );
      expect(declared).not.toContain('@anthropic-ai/sandbox-runtime');
      expect(declared).not.toContain('node-pty');
    },
  );

  it('finds the Terminal concern file set where the blueprint maps it', () => {
    expect(desktopTerminalProductionFiles).toEqual([
      'apps/libs/desktop-terminal/src/index.ts',
      'apps/libs/desktop-terminal/src/terminal-concern.ts',
    ]);
    expect(desktopTerminalFiles).toEqual(
      expect.arrayContaining([
        'apps/libs/desktop-terminal/src/terminal-concern.conformance.test.ts',
        'apps/libs/desktop-terminal/src/terminal-concern.test.ts',
      ]),
    );
    expect(globSync('apps/desktop/src/tau/services-host.terminal.ts', { cwd: root })).toEqual([]);
  });

  it('keeps the desktop Terminal rows and their target in desktop', async () => {
    expect(globSync(desktopTerminalConformance, { cwd: root })).toEqual([desktopTerminalConformance]);
    expect(specifiers(read(desktopTerminalConformance))).toContain('#tau/services-host.impl.js');
    const graph = await projectGraph();
    const target = graph.nodes['desktop']?.data.targets?.['test:terminal-conformance'];
    const options = target?.options as { command?: string } | undefined;
    expect(target?.cache).toBe(false);
    expect(options?.command).toContain('src/tau/services-host.terminal.conformance.test.ts');
  });

  it('imports only the shell service and the Terminal wire from the concern', () => {
    const offenders = desktopTerminalProductionFiles.flatMap((file) =>
      specifiers(read(file))
        .filter(
          (specifier) =>
            specifier.startsWith('@taucad/') ||
            (specifier.startsWith('#') && specifier !== '#terminal-concern.js') ||
            specifier.startsWith('..'),
        )
        .filter((specifier) => !desktopTerminalAllowedWorkspaceImports.has(specifier))
        .map((specifier) => `${file} -> ${specifier}`),
    );

    expect(offenders).toEqual([]);
  });

  it('imports neither Electron nor the services host from any file of the concern', () => {
    const offenders = desktopTerminalFiles.flatMap((file) =>
      specifiers(read(file))
        .filter(
          (specifier) =>
            specifier.startsWith('..') ||
            desktopTerminalForbiddenImports.some(
              (forbidden) => specifier === forbidden || specifier.startsWith(`${forbidden}/`),
            ),
        )
        .map((specifier) => `${file} -> ${specifier}`),
    );

    expect(offenders).toEqual([]);
  });

  it('gives the Terminal concern its workspace dependencies and the tags of a private shell app library', async () => {
    const graph = await projectGraph();
    const concern = graph.nodes['desktop-terminal'];

    expect(concern?.data.root).toBe(desktopTerminalRoot);
    expect(concern?.data.tags?.filter((tag) => !tag.startsWith('npm:')).toSorted()).toEqual([
      'ci:shell',
      'layer:feature',
      'scope:ui',
      'shell:terminal',
      'type:app-lib',
    ]);
    /* `sandbox` is a devDependency only: the conformance rows build the real provider through `@taucad/sandbox/shell`. */
    expect(
      directDependencies(graph, 'desktop-terminal')
        .filter((target) => !target.startsWith('npm:'))
        .toSorted(),
    ).toEqual(['sandbox', 'shell-service', 'types']);
    const manifest = JSON.parse(read(`${desktopTerminalRoot}/package.json`)) as Record<string, unknown>;
    expect(manifest).toMatchObject({ name: '@taucad/desktop-terminal', private: true });
    expect(Object.keys((manifest['dependencies'] ?? {}) as Record<string, string>).toSorted()).toEqual([
      '@taucad/shell-service',
      '@taucad/types',
    ]);
    expect(Object.keys((manifest['devDependencies'] ?? {}) as Record<string, string>)).toEqual(['@taucad/sandbox']);
  });

  it('bundles the Terminal concern into the desktop app from source', async () => {
    expect(directDependencies(await projectGraph(), 'desktop')).toContain('desktop-terminal');
    const manifest = JSON.parse(read('apps/desktop/package.json')) as { dependencies?: Record<string, string> };
    expect(manifest.dependencies?.['@taucad/desktop-terminal']).toBe('workspace:*');
    const bundled = /const bundledWorkspaceDependencies = \[(?<list>[^\]]*)\]/u.exec(
      read('apps/desktop/electron.vite.config.ts'),
    )?.groups?.['list'];
    expect(bundled).toContain("'@taucad/desktop-terminal'");
    expect(specifiers(read('apps/desktop/src/tau/services-host.impl.ts'))).toContain('@taucad/desktop-terminal');
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
        'desktop-terminal:test:terminal-conformance',
        'desktop:test:terminal-conformance',
        'host:test:shell-conformance',
        'host:test:shell-qualification',
        'native-process-core:test:native-sandbox-integration',
        'sandbox:test:shell-conformance',
        'shell-service:test:shell-conformance',
      ]),
    );
    expect(targets.filter(({ cache }) => cache !== false)).toEqual([]);
  });
});
