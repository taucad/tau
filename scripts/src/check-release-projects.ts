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

export const findVersionPlanScopeMismatches = (
  plans: readonly VersionPlan[],
  releaseTrain: readonly string[],
): string[] => {
  const allowed = new Set(releaseTrain);

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
  return JSON.parse(stdout.slice(stdout.indexOf('['), stdout.lastIndexOf(']') + 1)) as string[];
};

/** Pull every `-p`/`--projects=` list out of a release-critical file. */
const selectorsIn = (text: string, source: string): Array<{ value: string; source: string }> =>
  [...text.matchAll(/(?:--projects=|-p )([^\s"',]+(?:,[^\s"']+)*)/g)].flatMap(
    (match) => match[1]?.split(',').map((value) => ({ value, source })) ?? [],
  );

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
    // Every publish line, dry-run included: one `-p` anywhere shrinks the train.
    publishesWholeGroup: publishLines.length > 0 && publishLines.every((line) => !/(?:-p |--projects[= ])/u.test(line)),
  };
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const scope = await collectReleaseScope();
  const plans = globSync('.nx/version-plans/*.md', { cwd: root }).map((path) => ({
    path,
    text: readFileSync(join(root, path), 'utf8'),
  }));
  const mismatches = [
    ...findReleaseScopeMismatches(scope),
    ...findVersionPlanScopeMismatches(plans, scope.releaseTrain),
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
      `release train, ${scope.selectors.length} selectors resolved, published as one fixed group.`,
  );
}
