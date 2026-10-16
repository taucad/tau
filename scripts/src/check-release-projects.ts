/**
 * Assert the release scope before the publish workflow runs anything under it.
 *
 * Nx project selectors fail open: `nx run-many -p does-not-exist` prints
 * "No tasks were run" and exits 0, so a typo, a rename, or an untracked package
 * silently shrinks the release train. Every selector the release reads from
 * (nx.json and publish.yml) is resolved against the real graph here, and the
 * sets those selectors must cover come from `@taucad/nx` rather than a list
 * maintained by hand alongside the ones it is meant to guard.
 *
 * Usage: node scripts/src/check-release-projects.ts
 */
import { execFileSync } from 'node:child_process';
import { globSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { load as loadYaml } from 'js-yaml';
import { publishable, workspace } from '@taucad/nx';

export type Selector = {
  readonly value: string;
  readonly source: string;
  /** True for the selectors `nx release` versions (nx.json `release.projects`/groups). */
  readonly release: boolean;
  readonly matches: readonly string[];
};

export type ReleaseScope = {
  readonly selectors: readonly Selector[];
  /** `publishable()` — what must be versioned and what must be published. */
  readonly publishable: readonly string[];
  /** The widest set versioning may legitimately touch. */
  readonly releaseTrain: readonly string[];
  /** Each publishable package's manifest version, by project name. */
  readonly versions: Readonly<Record<string, string | undefined>>;
  /** How publish.yml publishes: the whole fixed group, or a hand-picked subset. */
  readonly publishesWholeGroup: boolean;
};

export type VersionPlan = { readonly path: string; readonly text: string };

export const findReleaseScopeMismatches = ({
  selectors,
  publishable: publishableProjects,
  releaseTrain: train,
  publishesWholeGroup,
}: ReleaseScope): string[] => {
  const mismatches: string[] = [];

  for (const { value, source, matches } of selectors) {
    if (matches.length === 0) {
      mismatches.push(`${source}: selector "${value}" resolves to no projects`);
    }
  }

  const versioned = new Set(selectors.filter(({ release }) => release).flatMap(({ matches }) => matches));
  for (const name of publishableProjects) {
    if (!versioned.has(name)) {
      mismatches.push(`nx.json release.projects: publishable project "${name}" is outside the release scope`);
    }
  }
  for (const name of [...versioned].sort()) {
    if (!train.includes(name)) {
      mismatches.push(`nx.json release.projects: "${name}" is versioned but is not in the release train`);
    }
  }

  /*
   * The workflow publishes the fixed group in one `nx release publish`: Nx orders
   * it through the synthesised `nx-release-publish` target (`dependsOn:
   * ['^nx-release-publish', 'pkgcheck']`). A `-p` subset would silently shrink the
   * train and drop that ordering, so the absence of one is the invariant.
   */
  if (!publishesWholeGroup) {
    mismatches.push('publish.yml: no `nx release publish` step publishes the whole fixed group');
  }

  if (selectors.length === 0) {
    mismatches.push('no release project selectors found in nx.json or the publish workflow');
  }

  return mismatches;
};

/**
 * The fixed group ships one version: every publishable manifest must carry the same `version`.
 * @param versions - Each publishable package's manifest version, by project name.
 * @returns One mismatch naming every version found and its projects, or none.
 */
export const findGroupVersionMismatches = (versions: Readonly<Record<string, string | undefined>>): string[] => {
  const byVersion = new Map<string, string[]>();
  for (const [project, version] of Object.entries(versions)) {
    const key = version ?? '(none)';
    byVersion.set(key, [...(byVersion.get(key) ?? []), project]);
  }
  if (byVersion.size <= 1) {
    return [];
  }
  const found = [...byVersion.entries()]
    .sort(([, a], [, b]) => b.length - a.length)
    .map(([version, projects]) => `${version} (${projects.sort().join(', ')})`);
  return [`the fixed release group carries ${String(byVersion.size)} versions, not one: ${found.join('; ')}`];
};

/** The release group Nx names when nx.json declares `release.projects` without `release.groups`. */
export const defaultReleaseGroup = '__default__';

/**
 * Below 1.0.0 a breaking change is a minor bump (release policy, Pre-1.0 Convention). A `major` or
 * `premajor` plan applied to the fixed group would release the whole train as 1.0.0, so it is refused
 * until the group itself has reached 1.0.0.
 * @param plans - The version-plan files.
 * @param groupVersion - The fixed group's current version.
 * @returns One mismatch per plan entry that would take the group to 1.0.0.
 */
export const findPreStableBumpMismatches = (plans: readonly VersionPlan[], groupVersion: string): string[] => {
  if (!groupVersion.startsWith('0.')) {
    return [];
  }
  return plans.flatMap(({ path, text }) => {
    const frontmatter = /^---\r?\n(?<body>[\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(text)?.groups?.['body'];
    let metadata: unknown;
    try {
      metadata = frontmatter === undefined ? undefined : loadYaml(frontmatter);
    } catch {
      // The scope check reports unreadable frontmatter.
      return [];
    }
    if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
      return [];
    }
    return Object.entries(metadata)
      .filter(([, bump]) => bump === 'major' || bump === 'premajor')
      .map(
        ([project, bump]) =>
          `${path}: "${project}: ${String(bump)}" would release the fixed group at ${groupVersion} as 1.0.0; ` +
          'below 1.0.0 a breaking change is a minor bump',
      );
  });
};

/**
 * Version-plan keys must name a project of the train or a release group: a fixed group's plans
 * name the group (Nx's `__default__` when nx.json declares no groups), which bumps all of it.
 */
export const findVersionPlanScopeMismatches = (
  plans: readonly VersionPlan[],
  releaseTrain: readonly string[],
  releaseGroups: readonly string[] = [defaultReleaseGroup],
): string[] => {
  const allowed = new Set([...releaseTrain, ...releaseGroups]);

  return plans.flatMap(({ path, text }) => {
    const match = /^---\r?\n(?<frontmatter>[\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(text);
    if (!match?.groups?.['frontmatter']) {
      return [`${path}: missing YAML frontmatter`];
    }

    let metadata: unknown;
    try {
      metadata = loadYaml(match.groups['frontmatter']);
    } catch {
      return [`${path}: invalid YAML frontmatter`];
    }

    if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
      return [`${path}: version-plan frontmatter must map project names to bump types`];
    }

    return Object.keys(metadata).flatMap((project) =>
      allowed.has(project) ? [] : [`${path}: project "${project}" is outside the release scope`],
    );
  });
};

const root = resolve(import.meta.dirname, '../..');
const workflowPath = '.github/workflows/publish.yml';

/**
 * The project list `nx show projects --json` prints as one line. Plugins may print banners around it
 * (dotenv's tips can carry `[www…]`), so the list is the last line that parses as a JSON array.
 * @param stdout - The command's standard output.
 * @returns The project names.
 * @throws When no line is a JSON array of strings.
 */
export const parseProjectList = (stdout: string): string[] => {
  for (const line of stdout.split('\n').reverse()) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('[')) {
      continue;
    }
    try {
      const value: unknown = JSON.parse(trimmed);
      if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
        return value;
      }
    } catch {
      // A banner line that merely starts with '['.
    }
  }
  throw new Error(`nx show projects printed no project list:\n${stdout}`);
};

const showProjects = (selector?: string): string[] => {
  const environment = { ...process.env };
  environment['NX_CLOUD'] = 'false';
  environment['NX_DAEMON'] = 'false';
  const stdout = execFileSync(
    join(root, 'node_modules/.bin/nx'),
    ['show', 'projects', '--json', ...(selector ? [`--projects=${selector}`] : [])],
    {
      cwd: root,
      encoding: 'utf8',
      env: environment,
    },
  );
  return parseProjectList(stdout);
};

/**
 * Pull every `-p`/`--projects=` list out of the Nx commands of a release-critical file; a `-p` on
 * any other command (`mkdir -p`) is not a project selector.
 */
export const selectorsIn = (text: string, source: string): Array<{ value: string; source: string }> =>
  text
    .split('\n')
    .filter((line) => /\bnx\b/u.test(line) && !line.trimStart().startsWith('#'))
    .flatMap((line) => [...line.matchAll(/(?:--projects=|-p )([^\s"',]+(?:,[^\s"']+)*)/gu)])
    .flatMap((match) => match[1]?.split(',').map((value) => ({ value, source })) ?? []);

const collectReleaseScope = async (): Promise<ReleaseScope> => {
  const nxJsonText = readFileSync(join(root, 'nx.json'), 'utf8');
  const workflowText = readFileSync(join(root, workflowPath), 'utf8');
  // Release scope is either one flat list or one list per release group.
  const release =
    (
      JSON.parse(nxJsonText) as {
        release?: { projects?: string[]; groups?: Record<string, { projects?: string[] }> };
      }
    ).release ?? {};

  const declared = [
    ...(release.projects ?? []).map((value) => ({ value, source: 'nx.json release.projects', release: true })),
    ...Object.entries(release.groups ?? {}).flatMap(([group, { projects = [] }]) =>
      projects.map((value) => ({ value, source: `nx.json release.groups.${group}`, release: true })),
    ),
    ...[...selectorsIn(nxJsonText, 'nx.json'), ...selectorsIn(workflowText, workflowPath)].map((selector) => ({
      ...selector,
      release: false,
    })),
  ].filter(
    (selector, index, all) =>
      all.findIndex((other) => other.value === selector.value && other.source === selector.source) === index,
  );

  // Globs and `tag:` selectors only Nx can expand; a bare name is its own match.
  const graph = showProjects();
  const needsResolution = (value: string): boolean => value.includes('*') || value.startsWith('tag:');
  const resolutions = new Map(
    [...new Set(declared.filter(({ value }) => needsResolution(value)).map(({ value }) => value))].map(
      (value) => [value, showProjects(value)] as const,
    ),
  );

  const resolvedWorkspace = await workspace({ fresh: true });
  const publishLines = workflowText
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#') && line.includes('nx release publish'));

  return {
    selectors: declared.map((selector) => ({
      ...selector,
      matches: needsResolution(selector.value)
        ? (resolutions.get(selector.value) ?? [])
        : graph.includes(selector.value)
          ? [selector.value]
          : [],
    })),
    publishable: publishable(resolvedWorkspace).map((project) => project.name),
    // `nx release version --dry-run` proved the private libraries do not belong:
    // versioning them adds telemetry and chat to the train and changes nothing
    // else, so the upper bound on versioning is the publishable set itself.
    releaseTrain: publishable(resolvedWorkspace).map((project) => project.name),
    versions: Object.fromEntries(
      publishable(resolvedWorkspace).map((project) => [project.name, project.manifest?.version]),
    ),
    // Every publish line, dry-run included: one `-p` anywhere shrinks the train.
    publishesWholeGroup: publishLines.length > 0 && publishLines.every((line) => !/(?:-p |--projects[= ])/u.test(line)),
  };
};

/** The release groups version plans may name: nx.json's `release.groups`, or Nx's default group. */
const releaseGroups = (): string[] => {
  const { release } = JSON.parse(readFileSync(join(root, 'nx.json'), 'utf8')) as {
    release?: { groups?: Record<string, unknown> };
  };
  const groups = Object.keys(release?.groups ?? {});
  return groups.length > 0 ? groups : [defaultReleaseGroup];
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const scope = await collectReleaseScope();
  const plans = globSync('.nx/version-plans/*.md', { cwd: root }).map((path) => ({
    path,
    text: readFileSync(join(root, path), 'utf8'),
  }));
  const groupVersionMismatches = findGroupVersionMismatches(scope.versions);
  const [groupVersion] = Object.values(scope.versions);
  const mismatches = [
    ...findReleaseScopeMismatches(scope),
    ...groupVersionMismatches,
    ...findVersionPlanScopeMismatches(plans, scope.releaseTrain, releaseGroups()),
    ...(groupVersionMismatches.length === 0 && groupVersion !== undefined
      ? findPreStableBumpMismatches(plans, groupVersion)
      : []),
  ];

  if (mismatches.length > 0) {
    console.error(`Release scope mismatches (${mismatches.length}):`);
    for (const mismatch of mismatches) {
      console.error(`- ${mismatch}`);
    }
    process.exit(1);
  }

  console.log(
    `Release scope verified: ${scope.publishable.length} publishable packages in a ${scope.releaseTrain.length}-project ` +
      `release train at one version (${String(groupVersion)}), ${scope.selectors.length} selectors resolved, ` +
      'published as one fixed group.',
  );
}
