/**
 * Assert the release scope before the publish workflow runs anything under it.
 *
 * Nx project selectors fail open: `nx run-many -p does-not-exist` prints
 * "No tasks were run" and exits 0, so a typo, a rename, or an untracked package
 * silently shrinks the release train. Every selector the release reads from
 * (nx.json and publish.yml) is resolved against the real graph here instead.
 *
 * Usage: node scripts/src/check-release-projects.ts
 */
import { execFileSync } from 'node:child_process';
import { globSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

/** The only packages the release train is allowed to publish. Drift here must be deliberate. */
export const expectedPublishableProjects = ['cli', 'geospec', 'geospec-engine', 'openrscad', 'react', 'runtime'];

export type Selector = { readonly value: string; readonly source: string };

export type ReleaseScope = {
  /** Every project name Nx knows about. */
  readonly graph: readonly string[];
  /** One entry per manifest under packages/* and packages/kernels/*. */
  readonly manifests: ReadonlyArray<{ readonly name: string; readonly publishable: boolean }>;
  /** Bare-name selectors used by the release. */
  readonly names: readonly Selector[];
  /** Glob selectors used by the release, with what Nx resolved them to. */
  readonly globs: ReadonlyArray<Selector & { readonly matches: readonly string[] }>;
};

export const findReleaseScopeMismatches = ({ graph, manifests, names, globs }: ReleaseScope): string[] => {
  const mismatches: string[] = [];
  const publishable = manifests
    .filter((manifest) => manifest.publishable)
    .map((manifest) => manifest.name)
    .sort();
  const missing = expectedPublishableProjects.filter((name) => !publishable.includes(name));
  const unexpected = publishable.filter((name) => !expectedPublishableProjects.includes(name));

  if (missing.length > 0 || unexpected.length > 0) {
    mismatches.push(
      `publishable packages drifted: expected [${expectedPublishableProjects.join(', ')}], found [${publishable.join(', ')}]` +
        ` (missing: [${missing.join(', ')}], unexpected: [${unexpected.join(', ')}])`,
    );
  }

  for (const { name } of manifests) {
    if (!graph.includes(name)) {
      mismatches.push(`package "${name}" has a manifest but no project in the Nx graph`);
    }
  }

  for (const { value, source } of names) {
    if (!graph.includes(value)) {
      mismatches.push(`${source}: selector "${value}" is not a project in the Nx graph`);
    }
  }

  for (const { value, source, matches } of globs) {
    if (matches.length === 0) {
      mismatches.push(`${source}: selector "${value}" matches no projects`);
    }
  }

  if (names.length === 0 && globs.length === 0) {
    mismatches.push('no release project selectors found in nx.json or the publish workflow');
  }

  return mismatches;
};

const root = resolve(import.meta.dirname, '../..');

const showProjects = (selector?: string): string[] => {
  const stdout = execFileSync(
    'pnpm',
    ['nx', 'show', 'projects', '--json', ...(selector ? [`--projects=${selector}`] : [])],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, NX_CLOUD: 'false' },
    },
  );
  return JSON.parse(stdout.slice(stdout.indexOf('['), stdout.lastIndexOf(']') + 1)) as string[];
};

/** Pull every `-p`/`--projects=` list out of a release-critical file. */
const selectorsIn = (text: string, source: string): Selector[] =>
  [...text.matchAll(/(?:--projects=|-p )([^\s"',]+(?:,[^\s"']+)*)/g)].flatMap(
    (match) => match[1]?.split(',').map((value) => ({ value, source })) ?? [],
  );

const collectReleaseScope = (): ReleaseScope => {
  const nxJsonText = readFileSync(join(root, 'nx.json'), 'utf8');
  const workflowPath = '.github/workflows/publish.yml';
  // Release scope is either one flat list or one list per release group.
  const release =
    (
      JSON.parse(nxJsonText) as {
        release?: { projects?: string[]; groups?: Record<string, { projects?: string[] }> };
      }
    ).release ?? {};

  const selectors = [
    ...(release.projects ?? []).map((value) => ({ value, source: 'nx.json release.projects' })),
    ...Object.entries(release.groups ?? {}).flatMap(([group, { projects = [] }]) =>
      projects.map((value) => ({ value, source: `nx.json release.groups.${group}` })),
    ),
    ...selectorsIn(nxJsonText, 'nx.json'),
    ...selectorsIn(readFileSync(join(root, workflowPath), 'utf8'), workflowPath),
  ].filter(
    (selector, index, all) =>
      all.findIndex((other) => other.value === selector.value && other.source === selector.source) === index,
  );

  const globMatches = new Map(
    [...new Set(selectors.filter(({ value }) => value.includes('*')).map(({ value }) => value))].map(
      (value) => [value, showProjects(value)] as const,
    ),
  );

  return {
    graph: showProjects(),
    manifests: globSync(['packages/*/package.json', 'packages/kernels/*/package.json'], { cwd: root }).map((path) => ({
      name: basename(dirname(path)),
      publishable: (JSON.parse(readFileSync(join(root, path), 'utf8')) as { private?: boolean }).private !== true,
    })),
    names: selectors.filter(({ value }) => !value.includes('*')),
    globs: selectors
      .filter(({ value }) => value.includes('*'))
      .map((selector) => ({ ...selector, matches: globMatches.get(selector.value) ?? [] })),
  };
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const scope = collectReleaseScope();
  const mismatches = findReleaseScopeMismatches(scope);

  if (mismatches.length > 0) {
    console.error(`Release scope mismatches (${mismatches.length}):`);
    for (const mismatch of mismatches) {
      console.error(`- ${mismatch}`);
    }
    process.exit(1);
  }

  console.log(
    `Release scope verified: ${expectedPublishableProjects.length} publishable packages, ` +
      `${scope.names.length + scope.globs.length} selectors resolved against ${scope.graph.length} Nx projects.`,
  );
}
