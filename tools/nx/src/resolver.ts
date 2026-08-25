/**
 * The workspace resolver: one IO entry point (`workspace()`, the Nx project
 * graph plus each project's manifest) and pure functions over the value it
 * returns. Every release fact — what is publishable, what a package bundles,
 * what order the waves publish in — is derived here instead of hand-listed in
 * `nx.json`, `publish.yml`, and the gate scripts.
 *
 * @see docs/research/runtime-prepublish-gate-residual-closeout.md
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createProjectGraphAsync, readCachedProjectGraph, workspaceRoot } from '@nx/devkit';
import { projectTagVocabulary } from '#tags.js';

/**
 * The fields of a project's `package.json` the release rules read.
 *
 * @public
 */
export type ProjectManifest = {
  name?: string;
  private?: boolean;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

/**
 * One Nx project: its graph identity, its tags, and its manifest.
 *
 * @public
 */
export type WorkspaceProject = {
  name: string;
  root: string;
  tags: readonly string[];
  /** The names of the targets the graph resolved for the project. */
  targets: readonly string[];
  manifest: ProjectManifest | undefined;
  /**
   * True when the project is declared by a `project.json` rather than inferred
   * from a bare `package.json`. Only the name rule reads this: an inferred
   * project's name *is* its package name, so it cannot drift from it. Tags are
   * not exempted — an inferred project declares them under `nx.tags`.
   */
  configured: boolean;
};

/**
 * The resolved project graph every rule in this package is pure over.
 *
 * @public
 */
export type Workspace = { projects: readonly WorkspaceProject[] };

/**
 * Filter accepted by {@link projects}; `tags` means "carries all of these".
 *
 * @public
 */
export type ProjectFilter = {
  tags?: readonly string[];
  not?: readonly string[];
  private?: boolean;
  predicate?: (project: WorkspaceProject) => boolean;
};

const readManifest = (root: string): ProjectManifest | undefined => {
  const path = join(workspaceRoot, root, 'package.json');
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as ProjectManifest) : undefined;
};

const isConfigured = (root: string): boolean => existsSync(join(workspaceRoot, root, 'project.json'));

const loadWorkspace = async (fresh: boolean): Promise<Workspace> => {
  // The cached graph is what every other Nx consumer reads; computing one is the
  // fallback for a cold cache (a fresh clone, or a CI step before any target ran).
  // `fresh` skips it entirely: the cache is written by the last Nx run, so a gate
  // reading it would validate the tree as it stood then, not as it stands now.
  let graph;
  if (fresh) {
    graph = await createProjectGraphAsync();
  } else {
    try {
      graph = readCachedProjectGraph();
    } catch {
      graph = await createProjectGraphAsync();
    }
  }

  return {
    projects: Object.values(graph.nodes)
      .map((node) => ({
        name: node.name,
        root: node.data.root,
        tags: node.data.tags ?? [],
        targets: Object.keys(node.data.targets ?? {}),
        manifest: readManifest(node.data.root),
        configured: isConfigured(node.data.root),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
};

let cachedWorkspace: Promise<Workspace> | undefined;

/**
 * The only IO in this package. Memoised: the graph does not change mid-process.
 *
 * Pass `fresh` from a gate that asserts a property of the working tree — it
 * recomputes the graph instead of trusting the cache the last Nx run wrote.
 * Everything that runs *inside* an Nx target (build configs, pkgcheck) already
 * has a graph Nx just refreshed, and should take the cheap path.
 *
 * @public
 */
export const workspace = async (options?: { readonly fresh?: boolean }): Promise<Workspace> => {
  if (options?.fresh === true) {
    cachedWorkspace = loadWorkspace(true);
  }

  cachedWorkspace ??= loadWorkspace(false);
  return cachedWorkspace;
};

/**
 * `filter` accepts an Nx selector string (`tag:type:package`) so a script and a
 * `nx run-many --projects` invocation cannot disagree about a set.
 *
 * @public
 */
export const projects = (workspaceValue: Workspace, filter: ProjectFilter | string = {}): WorkspaceProject[] => {
  const {
    tags = [],
    not = [],
    private: isPrivate,
    predicate,
  } = typeof filter === 'string' ? { tags: [filter.replace(/^tag:/, '')] } : filter;

  return workspaceValue.projects.filter(
    (project) =>
      tags.every((tag) => project.tags.includes(tag)) &&
      !not.some((tag) => project.tags.includes(tag)) &&
      (isPrivate === undefined || (project.manifest?.private === true) === isPrivate) &&
      (predicate?.(project) ?? true),
  );
};

const byName = (a: { name: string }, b: { name: string }): number => a.name.localeCompare(b.name);

/**
 * Every package that ships to the registry: `type:package`, not private.
 *
 * @public
 */
export const publishable = (workspaceValue: Workspace): WorkspaceProject[] =>
  projects(workspaceValue, { tags: ['type:package'], private: false }).sort(byName);

/**
 * Every project carries exactly one `type:` and one `scope:` from the
 * vocabulary. Application libraries additionally carry exactly one `layer:`;
 * other projects may carry one. The returned strings are the violations.
 *
 * @public
 */
export const validateTags = (workspaceValue: Workspace): string[] =>
  workspaceValue.projects.flatMap(({ root, tags }) => {
    const reasons = Object.entries(projectTagVocabulary).flatMap(([dimension, values]) => {
      const allowed: readonly string[] = values;
      const present = tags.filter((tag) => tag.startsWith(`${dimension}:`));
      const [tag, ...extra] = present;
      const required = dimension !== 'layer' || tags.includes('type:app-lib');
      if ((required && tag === undefined) || extra.length > 0) {
        return [`expected exactly one ${dimension}: tag, found ${present.join(', ') || 'none'}`];
      }

      if (tag === undefined) {
        return [];
      }

      return allowed.includes(tag.slice(dimension.length + 1))
        ? []
        : [`unknown tag "${tag}" (${dimension}: must be one of ${allowed.join(', ')})`];
    });

    return reasons.length > 0 ? [`${root}: ${reasons.join('; ')}`] : [];
  });

const projectByPackageName = (workspaceValue: Workspace): Map<string, WorkspaceProject> =>
  new Map(
    workspaceValue.projects.flatMap((project) =>
      project.manifest?.name === undefined ? [] : [[project.manifest.name, project] as const],
    ),
  );

/**
 * Bundle-eligibility rule: a publishable's `workspace:` devDependencies, minus
 * its peerDependencies, restricted to private `type:lib` projects. This states
 * what *may* be bundled; the emitted `dist/libs/*` mirrors state what did — so
 * a consumer that walks the projects must tolerate a candidate with no mirror.
 *
 * @public
 */
export const bundledLibraryProjects = (
  workspaceValue: Workspace,
  projectName: string,
): Array<{ packageName: string; project: WorkspaceProject }> => {
  const manifest = workspaceValue.projects.find((project) => project.name === projectName)?.manifest;
  const byPackage = projectByPackageName(workspaceValue);
  const peers = manifest?.peerDependencies ?? {};

  return Object.entries(manifest?.devDependencies ?? {})
    .filter(([packageName, range]) => range.startsWith('workspace:') && !(packageName in peers))
    .flatMap(([packageName]) => {
      const project = byPackage.get(packageName);
      return project?.manifest?.private === true && project.tags.includes('type:lib') ? [{ packageName, project }] : [];
    })
    .sort((a, b) => a.packageName.localeCompare(b.packageName));
};

/**
 * The private libraries a publishable may bundle, as package names.
 *
 * @public
 */
export const bundledLibraries = (workspaceValue: Workspace, projectName: string): string[] =>
  bundledLibraryProjects(workspaceValue, projectName).map(({ packageName }) => packageName);

const escapeForRegExp = (value: string): string => value.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);

/**
 * The `deps.alwaysBundle` / `dts.neverBundle` pattern for a publishable.
 *
 * @public
 */
export const bundlePattern = (workspaceValue: Workspace, projectName: string): RegExp => {
  const libraries = bundledLibraries(workspaceValue, projectName);
  // An empty alternation would match the empty string, so bundle nothing explicitly.
  return libraries.length === 0
    ? /(?!)/
    : new RegExp(`^(?:${libraries.map((library) => escapeForRegExp(library)).join('|')})(?:/|$)`);
};

/** Every bundled library mapped to the publishables that claim it. */
const bundleOwners = (workspaceValue: Workspace): Map<string, string[]> => {
  const owners = new Map<string, string[]>();

  for (const project of publishable(workspaceValue)) {
    for (const library of bundledLibraries(workspaceValue, project.name)) {
      owners.set(library, [...(owners.get(library) ?? []), project.name]);
    }
  }

  return owners;
};

/**
 * Zero owners cannot occur by construction, so this only reports multi-owner
 * libraries — the invariant is exactly one owner per bundled library.
 *
 * @public
 */
export const bundleOwnershipIssues = (workspaceValue: Workspace): string[] =>
  [...bundleOwners(workspaceValue)]
    .filter(([, owners]) => owners.length !== 1)
    .map(([library, owners]) => `${library} is bundled by ${owners.join(' and ')}`)
    .sort();

const publishableDependencies = (workspaceValue: Workspace): Map<string, string[]> => {
  const published = new Set(publishable(workspaceValue));
  const nameByPackage = new Map(
    [...projectByPackageName(workspaceValue)]
      .filter(([, project]) => published.has(project))
      .map(([packageName, project]) => [packageName, project.name] as const),
  );

  return new Map(
    [...published].map((project) => [
      project.name,
      [
        ...new Set(
          [
            ...Object.keys(project.manifest?.dependencies ?? {}),
            ...Object.keys(project.manifest?.peerDependencies ?? {}),
            ...Object.keys(project.manifest?.optionalDependencies ?? {}),
          ].flatMap((packageName) => {
            const dependency = nameByPackage.get(packageName);
            return dependency === undefined || dependency === project.name ? [] : [dependency];
          }),
        ),
      ],
    ]),
  );
};

/**
 * Longest-path topological layering: a package sits one layer after the latest
 * package it depends on, so every wave can publish in parallel.
 *
 * ponytail: no cycle guard — a publishable dependency cycle would recurse
 * forever, but Nx's `enforce-module-boundaries` rejects circular workspace
 * dependencies before they can reach here.
 *
 * @public
 */
export const publishWaves = (workspaceValue: Workspace): string[][] => {
  const edges = publishableDependencies(workspaceValue);
  const depths = new Map<string, number>();

  const depth = (name: string): number => {
    const known = depths.get(name);
    if (known !== undefined) {
      return known;
    }

    /* v8 ignore next -- Every edge target is itself a publishable, so this lookup always hits. */
    const dependencies = edges.get(name) ?? [];
    const value = dependencies.length === 0 ? 0 : 1 + Math.max(...dependencies.map((dependency) => depth(dependency)));
    depths.set(name, value);
    return value;
  };

  const waves: string[][] = [];
  for (const name of edges.keys()) {
    const layer = depth(name);
    waves[layer] = [...(waves[layer] ?? []), name];
  }

  return waves.map((wave) => [...wave].sort());
};

/**
 * The requested publishables plus every publishable they depend on, transitively,
 * in publish-wave order. A gate that packs a subset of the train uses this to
 * close it: an omitted sibling makes the install fall back to the registry.
 *
 * Names that are not publishable carry no edges and drop out of the result.
 *
 * @public
 */
export const publishableClosure = (workspaceValue: Workspace, projectNames: readonly string[]): string[] => {
  const edges = publishableDependencies(workspaceValue);
  const reached = new Set<string>();

  const visit = (name: string): void => {
    if (reached.has(name)) {
      return;
    }

    reached.add(name);
    for (const dependency of edges.get(name) ?? []) {
      visit(dependency);
    }
  };

  for (const name of projectNames) {
    visit(name);
  }

  return publishWaves(workspaceValue)
    .flat()
    .filter((name) => reached.has(name));
};
