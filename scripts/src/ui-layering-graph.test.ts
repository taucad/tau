import { globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createProjectGraphAsync, readCachedProjectGraph } from '@nx/devkit';
import type { ProjectGraph } from '@nx/devkit';
import { projectTagVocabulary } from '@taucad/nx/tags';
import { describe, expect, it } from 'vitest';

/*
 * The UI app library layering's graph guards (docs/research/ui-app-lib-layering-blueprint.md, W0). Four layers sit
 * under the app: L0 foundation (`ui-core`, `ui-kit`), L1 features, L2 composition and L3 agent-host adapters.
 * `eslint.config.mjs` names, per `ui:<name>` tag, the UI app libraries each one may depend on and bars L0 from the
 * `protocol:agent` projects; lint checks one import at a time, so this file checks the project graph and the
 * closures lint cannot see.
 *
 * Every edge the target refuses today is listed as debt with the work item that removes it. The lists only shrink:
 * each rule fails when an unlisted violation appears and when a listed one is gone, so the PR that clears an edge
 * also deletes its entry.
 */

const root = resolve(import.meta.dirname, '../..');

type DebtEdge = { readonly source: string; readonly target: string; readonly work: string };
type DebtFile = { readonly file: string; readonly work: string };
type DepConstraint = {
  readonly sourceTag?: string;
  readonly onlyDependOnLibsWithTags?: readonly string[];
  readonly notDependOnLibsWithTags?: readonly string[];
};
type BoundaryRule = readonly ['error', { readonly depConstraints: readonly DepConstraint[] }];
type ConfigEntry = { readonly files?: readonly string[]; readonly rules?: Record<string, unknown> };
type EslintLayering = {
  readonly default: readonly ConfigEntry[];
  readonly uiLibraryDependencies: Readonly<Record<string, readonly string[]>>;
  readonly uiLibraryDependencyDebt: readonly DebtEdge[];
  readonly uiFoundationProtocolDebtFiles: readonly DebtFile[];
};

const eslint = (await import(pathToFileURL(resolve(root, 'eslint.config.mjs')).href)) as EslintLayering;

/** The `ui:` tag each UI app library carries. A new library picks one here and in `eslint.config.mjs`. */
const uiTagByProject: Readonly<Record<string, string>> = {
  'ui-core': 'ui-core',
  'ui-kit': 'ui-kit',
  'chat-ui': 'chat-ui',
  'files-ui': 'files-ui',
  'editor-ui': 'editor-ui',
  'revisions-ui': 'revisions-ui',
  'publish-ui': 'publish-ui',
  'settings-ui': 'settings-ui',
  'billing-ui': 'billing-ui',
  'project-workspace': 'project-workspace',
  consent: 'infra',
  'csharp-language': 'infra',
  'fs-client': 'infra',
  lsp: 'infra',
  'lsp-fs': 'infra',
  'openscad-language': 'infra',
  converter: 'unlayered',
  'desktop-services-host': 'unlayered',
  'desktop-terminal': 'unlayered',
  'planetary-gearbox': 'unlayered',
};

const foundation = ['ui-core', 'ui-kit'];

/** The `protocol:agent` projects: the agent wire, its host, its tools, its evidence and its skills. */
const agentProtocol = ['agent-host', 'agent-observability', 'agent-tools', 'chat', 'skills'];

/** The projects outside the UI app libraries that L0 may depend on: the platform and the shared app libraries. */
const foundationTargets = new Set([
  'billing',
  'events',
  'filesystem',
  'json-schema',
  'preferences',
  'project-core',
  'share',
  'taucad-ui',
  'telemetry',
  'types',
  'utils',
]);

/** L0's agent-protocol edges (the files behind them are `uiFoundationProtocolDebtFiles`). */
const foundationProtocolDebt: readonly DebtEdge[] = [
  { source: 'ui-core', target: 'agent-host', work: 'W3' },
  { source: 'ui-core', target: 'agent-observability', work: 'W3' },
  { source: 'ui-core', target: 'agent-tools', work: 'W3' },
  { source: 'ui-core', target: 'chat', work: 'W3' },
  { source: 'ui-core', target: 'skills', work: 'W3' },
];

/** L0's domain-package edges. The W7 rows wait on owner libraries. */
const foundationPackageDebt: readonly DebtEdge[] = [
  { source: 'ui-core', target: 'grammars', work: 'W2' },
  { source: 'ui-core', target: 'kinematics', work: 'W7' },
  { source: 'ui-core', target: 'parameters', work: 'W7' },
  { source: 'ui-core', target: 'revisions', work: 'W7' },
  { source: 'ui-core', target: 'viewer', work: 'W7' },
  { source: 'ui-core', target: 'workbench', work: 'W7' },
  { source: 'ui-kit', target: 'workbench-panes', work: 'W6' },
];

/** Edges no other rule refuses that keep a closure rule from holding. */
const closureDebt: readonly DebtEdge[] = [{ source: 'files-ui', target: 'chat', work: 'W5' }];

/** What each library's closure may not reach once the debt is cleared. */
const closureRules: ReadonlyArray<{ readonly source: string; readonly excluded: (project: string) => boolean }> = [
  { source: 'ui-core', excluded: (project) => agentProtocol.includes(project) || isRuntimePlugin(project) },
  { source: 'ui-kit', excluded: (project) => agentProtocol.includes(project) || isRuntimePlugin(project) },
  { source: 'files-ui', excluded: (project) => project === 'chat' },
  { source: 'editor-ui', excluded: (project) => project === 'chat-ui' || project === 'files-ui' },
];

const edgeKey = ({ source, target }: { readonly source: string; readonly target: string }): string =>
  `${source} -> ${target}`;
const keys = (edges: readonly DebtEdge[]): readonly string[] => edges.map((edge) => edgeKey(edge)).toSorted();

const projectGraph = async (): Promise<ProjectGraph> => {
  try {
    return readCachedProjectGraph();
  } catch {
    return createProjectGraphAsync();
  }
};

const graph = await projectGraph();

const tagsOf = (project: string): readonly string[] => graph.nodes[project]?.data.tags ?? [];
const uiTagOf = (project: string): string | undefined =>
  tagsOf(project)
    .find((tag) => tag.startsWith('ui:'))
    ?.slice('ui:'.length);
const isUiLibrary = (project: string): boolean =>
  tagsOf(project).includes('scope:ui') && tagsOf(project).includes('type:app-lib');
const isRuntimePlugin = (project: string): boolean =>
  graph.nodes[project]?.data.root.startsWith('packages/plugins/') ?? false;

/** The workspace projects one project depends on directly, from source imports and its manifest alike. */
const directDependencies = (project: string): readonly string[] => [
  ...new Set((graph.dependencies[project] ?? []).map(({ target }) => target).filter((target) => target in graph.nodes)),
];

const graphEdges = (sources: readonly string[]): readonly DebtEdge[] =>
  sources.flatMap((source) => directDependencies(source).map((target) => ({ source, target, work: '' })));

const allDebt = [
  ...eslint.uiLibraryDependencyDebt,
  ...foundationProtocolDebt,
  ...foundationPackageDebt,
  ...closureDebt,
];

/** Every project a source reaches once the listed debt edges are cut. */
const residualClosure = (source: string): ReadonlySet<string> => {
  const cut = new Set(allDebt.map((edge) => edgeKey(edge)));
  const reached = new Set<string>();
  const pending = [source];
  for (let project = pending.pop(); project !== undefined; project = pending.pop()) {
    for (const target of directDependencies(project)) {
      if (!cut.has(edgeKey({ source: project, target })) && !reached.has(target)) {
        reached.add(target);
        pending.push(target);
      }
    }
  }
  return reached;
};

const boundaryRule = (entry: ConfigEntry): BoundaryRule | undefined =>
  entry.rules?.['@nx/enforce-module-boundaries'] as BoundaryRule | undefined;

/** Agent-protocol package names, so a file's specifiers (imports, re-exports and `vi.mock` paths) can be matched. */
const agentProtocolPackages = new Set(
  agentProtocol.map(
    (project) =>
      (
        JSON.parse(readFileSync(resolve(root, graph.nodes[project]?.data.root ?? '', 'package.json'), 'utf8')) as {
          name: string;
        }
      ).name,
  ),
);
const namesAgentProtocol = (source: string): boolean =>
  [...source.matchAll(/['"](@taucad\/[\w-]+)(?:\/[^'"]*)?['"]/gu)].some(([, name]) =>
    agentProtocolPackages.has(name ?? ''),
  );

describe('UI app library layering graph', () => {
  it('gives every UI app library its one ui: tag and only the agent protocol the protocol:agent tag', () => {
    const uiLibraries = Object.keys(graph.nodes).filter((project) => isUiLibrary(project));
    expect(Object.fromEntries(uiLibraries.toSorted().map((project) => [project, uiTagOf(project)]))).toEqual(
      Object.fromEntries(Object.entries(uiTagByProject).toSorted(([a], [b]) => a.localeCompare(b))),
    );
    expect(
      Object.keys(graph.nodes)
        .filter((project) => tagsOf(project).includes('protocol:agent'))
        .toSorted(),
    ).toEqual(agentProtocol);
  });

  it('names every layered ui: value in the allowlist and nothing else', () => {
    expect(Object.keys(eslint.uiLibraryDependencies).toSorted()).toEqual(
      projectTagVocabulary.ui.filter((name) => name !== 'unlayered').toSorted(),
    );
    for (const dependencies of Object.values(eslint.uiLibraryDependencies)) {
      expect(dependencies.every((name) => name in eslint.uiLibraryDependencies)).toBe(true);
    }
  });

  it('wires the allowlist, its debt and the L0 protocol ban into the module boundaries', () => {
    const base = eslint.default.find((entry) => entry.files === undefined && Array.isArray(boundaryRule(entry)));
    const constraints = base === undefined ? [] : (boundaryRule(base)?.[1].depConstraints ?? []);

    for (const [name, dependencies] of Object.entries(eslint.uiLibraryDependencies)) {
      const debt = eslint.uiLibraryDependencyDebt.filter(({ source }) => source === name).map(({ target }) => target);
      const allowed = [...new Set([...dependencies, ...debt, 'infra'])].map((dependency) => `ui:${dependency}`);
      expect(constraints, name).toContainEqual({
        sourceTag: `ui:${name}`,
        onlyDependOnLibsWithTags: [...allowed, 'scope:shared', 'type:lib', 'type:package', 'type:tool', 'type:example'],
      });
    }
    for (const name of foundation) {
      expect(constraints).toContainEqual({ sourceTag: `ui:${name}`, notDependOnLibsWithTags: ['protocol:agent'] });
    }

    const debtFiles = eslint.uiFoundationProtocolDebtFiles.map(({ file }) => file);
    const exemption = eslint.default.find((entry) => entry.files?.join('\n') === debtFiles.join('\n'));
    const exempted = exemption === undefined ? [] : (boundaryRule(exemption)?.[1].depConstraints ?? []);
    expect(exempted.filter((constraint) => constraint.notDependOnLibsWithTags !== undefined)).toEqual([]);
    expect(exempted.length).toBe(constraints.length - foundation.length);
  });

  it('refuses every UI app library edge outside the allowlist except the listed debt', () => {
    const violations = graphEdges(Object.keys(uiTagByProject))
      .filter(({ source, target }) => {
        const sourceName = uiTagOf(source) ?? '';
        const allowed = eslint.uiLibraryDependencies[sourceName];
        return allowed !== undefined && isUiLibrary(target) && ![...allowed, 'infra'].includes(uiTagOf(target) ?? '');
      })
      .map((edge) => edgeKey(edge))
      .toSorted();

    expect(violations).toEqual(keys(eslint.uiLibraryDependencyDebt));
  });

  it('keeps L0 off the agent protocol except the listed debt', () => {
    const violations = graphEdges(foundation)
      .filter(({ target }) => agentProtocol.includes(target))
      .map((edge) => edgeKey(edge))
      .toSorted();

    expect(violations).toEqual(keys(foundationProtocolDebt));
  });

  it('keeps L0 on the platform packages except the listed domain debt', () => {
    const violations = graphEdges(foundation)
      .filter(({ target }) => !isUiLibrary(target) && !agentProtocol.includes(target) && !foundationTargets.has(target))
      .map((edge) => edgeKey(edge))
      .toSorted();

    expect(violations).toEqual(keys(foundationPackageDebt));
  });

  it('lists only debt edges that are still in the graph', () => {
    const missing = allDebt.filter(({ source, target }) => !directDependencies(source).includes(target));
    expect(missing.map((edge) => edgeKey(edge))).toEqual([]);
    expect(new Set(allDebt.map((edge) => edgeKey(edge))).size).toBe(allDebt.length);
  });

  it('holds every closure rule once the listed debt edges are cut', () => {
    const reached = closureRules.flatMap(({ source, excluded }) =>
      [...residualClosure(source)].filter((project) => excluded(project)).map((project) => `${source} ->* ${project}`),
    );

    expect(reached).toEqual([]);
  });

  it('exempts exactly the L0 files that name the agent protocol', () => {
    const naming = foundation
      .flatMap((project) =>
        globSync(`${graph.nodes[project]?.data.root ?? ''}/src/**/*.{ts,tsx}`, { cwd: root }).filter((file) =>
          namesAgentProtocol(readFileSync(resolve(root, file), 'utf8')),
        ),
      )
      .toSorted();

    expect(naming).toEqual(eslint.uiFoundationProtocolDebtFiles.map(({ file }) => file).toSorted());
  });
});
