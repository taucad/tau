/**
 * Version Tau's deployable applications (UI, API, desktop) from git history.
 *
 * The npm train is versioned by Nx Release with version plans (nx.json
 * `release`). The applications are not npm packages and ship whatever their
 * dependency closure contains, so their version follows the conventional
 * commits that touched that closure since the application's last tag. Each
 * application carries the `release:app` project tag and is tagged
 * `<project>@<version>`; that tag names its GitHub Release.
 *
 * Commands:
 * - `plan`: print the pending release of every application as JSON.
 * - `apps`: print the name of every application, one per line.
 * - `prepare <project>`: apply that application's pending release, writing its
 *   manifest version and prepending its CHANGELOG.md section; prints the plan
 *   and the release commit subject. Each application has its own release pull
 *   request, so a release commit versions exactly one application.
 * - `tags`: on a release commit, print the tags the commit introduces with their
 *   release notes, for the release workflow to create.
 *
 * Usage: node scripts/src/release-apps.ts plan|apps|prepare <project>|tags
 * Environment: a git checkout with full history and tags (fetch-depth: 0).
 * Exit codes: 0 on success; 1 on invalid input or a git/graph failure.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { workspaceRoot } from '@nx/devkit';
import type { ProjectGraph } from '@nx/devkit';

/** The project tag that marks a deployable application. */
export const releaseAppTag = 'release:app';

/** The version an application takes on its first tracked release. */
export const firstReleaseVersion = '0.1.0';

export type Bump = 'major' | 'minor' | 'patch';

export type Commit = { readonly hash: string; readonly subject: string; readonly body: string };

export type ReleaseApp = {
  readonly name: string;
  readonly root: string;
  /** Roots of the application and every workspace project it depends on. */
  readonly paths: readonly string[];
};

export type AppRelease = {
  readonly name: string;
  readonly root: string;
  readonly currentVersion: string;
  readonly nextVersion: string;
  readonly previousTag: string | undefined;
  readonly tag: string;
  readonly bump: Bump | 'first';
  readonly commits: readonly Commit[];
};

/** Files that change no shipped behaviour of an application. */
const ignoredPathspecs = [
  ':(exclude,glob)**/*.md',
  ':(exclude,glob)**/*.test.*',
  ':(exclude,glob)**/*.spec.*',
  ':(exclude,glob)**/*.test-d.*',
] as const;

const releaseSubjectPrefix = 'chore(release): ';
const conventional = /^(?<type>[a-z]+)(?:\([^)]*\))?(?<breaking>!)?: /u;

const bumpRank: Record<Bump, number> = { patch: 0, minor: 1, major: 2 };

/**
 * The bump a set of commits calls for. While an application is below 1.0.0 a
 * breaking change is a minor bump, as the release policy's pre-1.0 convention
 * allows; a feature is a minor bump and everything else a patch.
 */
export const bumpFor = (commits: readonly Commit[], currentVersion: string): Bump => {
  const preStable = parseVersion(currentVersion)[0] === 0;
  let bump: Bump = 'patch';
  for (const { subject, body } of commits) {
    const match = conventional.exec(subject);
    const breaking = match?.groups?.['breaking'] === '!' || /^BREAKING[ -]CHANGE: /mu.test(body);
    const candidate: Bump = breaking
      ? preStable
        ? 'minor'
        : 'major'
      : match?.groups?.['type'] === 'feat'
        ? 'minor'
        : 'patch';
    if (bumpRank[candidate] > bumpRank[bump]) {
      bump = candidate;
    }
  }

  return bump;
};

export const parseVersion = (version: string): [number, number, number] => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(version);
  if (!match) {
    throw new TypeError(`"${version}" is not a release version (MAJOR.MINOR.PATCH)`);
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])];
};

export const increment = (version: string, bump: Bump): string => {
  const [major, minor, patch] = parseVersion(version);
  if (bump === 'major') {
    return `${major + 1}.0.0`;
  }

  return bump === 'minor' ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`;
};

/** The release of one application, or `undefined` when nothing shipped changed. */
export const planRelease = ({
  app,
  currentVersion,
  previousTag,
  commits,
}: {
  readonly app: Pick<ReleaseApp, 'name' | 'root'>;
  readonly currentVersion: string;
  readonly previousTag: string | undefined;
  readonly commits: readonly Commit[];
}): AppRelease | undefined => {
  const shipped = commits.filter(({ subject }) => !subject.startsWith(releaseSubjectPrefix));
  if (previousTag === undefined) {
    const nextVersion = compareVersions(currentVersion, firstReleaseVersion) < 0 ? firstReleaseVersion : currentVersion;
    return {
      ...app,
      currentVersion,
      nextVersion,
      previousTag,
      tag: `${app.name}@${nextVersion}`,
      bump: 'first',
      commits: [],
    };
  }

  if (shipped.length === 0) {
    return undefined;
  }

  const bump = bumpFor(shipped, currentVersion);
  const nextVersion = increment(currentVersion, bump);
  return {
    ...app,
    currentVersion,
    nextVersion,
    previousTag,
    tag: `${app.name}@${nextVersion}`,
    bump,
    commits: shipped,
  };
};

export const compareVersions = (left: string, right: string): number => {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
};

const sectionTitles = [
  ['feat', 'Features'],
  ['fix', 'Fixes'],
  ['perf', 'Performance'],
] as const;

/** The CHANGELOG.md section for one release, also used as its GitHub Release notes. */
export const changelogSection = (release: AppRelease, date: string): string => {
  const lines = [`## ${release.nextVersion} (${date})`, ''];
  if (release.bump === 'first') {
    lines.push('First tracked release of this application.', '');
    return lines.join('\n');
  }

  const typeOf = (subject: string): string => conventional.exec(subject)?.groups?.['type'] ?? 'other';
  const entry = ({ hash, subject }: Commit): string => `- ${subject} (${hash.slice(0, 9)})`;
  const known = new Set<string>(sectionTitles.map(([type]) => type));
  for (const [type, title] of sectionTitles) {
    const matching = release.commits.filter(({ subject }) => typeOf(subject) === type);
    if (matching.length > 0) {
      lines.push(`### ${title}`, '', ...matching.map((match) => entry(match)), '');
    }
  }

  const other = release.commits.filter(({ subject }) => !known.has(typeOf(subject)));
  if (other.length > 0) {
    lines.push('### Other changes', '', ...other.map((change) => entry(change)), '');
  }

  return lines.join('\n');
};

/** Prepend a section below the file's `# ` title, creating the file when absent. */
export const prependChangelog = (existing: string | undefined, title: string, section: string): string => {
  if (existing === undefined || existing.trim() === '') {
    return `# ${title}\n\n${section}`;
  }

  const [first, ...rest] = existing.split('\n');
  if (first?.startsWith('# ')) {
    return [first, '', section, ...rest.join('\n').replace(/^\n+/u, '').split('\n')].join('\n');
  }

  return `${section}\n${existing}`;
};

/** The commit subject a release commit carries; the release workflow keys on its prefix. */
export const releaseCommitSubject = (releases: readonly AppRelease[]): string =>
  `chore(release): ${releases.map(({ name, nextVersion }) => `${name} v${nextVersion}`).join(', ')}`;

/** Replace the top-level `"version"` of a manifest without reformatting the rest of it. */
export const setManifestVersion = (manifest: string, version: string): string => {
  const pattern = /^( {2}"version": )"[^"]*"/mu;
  if (!pattern.test(manifest)) {
    throw new Error('manifest has no top-level "version" field');
  }

  return manifest.replace(pattern, `$1"${version}"`);
};

const git = (...args: string[]): string =>
  execFileSync('git', args, { cwd: workspaceRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();

const latestTag = (name: string): string | undefined => {
  const tags = git('tag', '--list', `${name}@*`, '--merged', 'HEAD', '--sort=-v:refname');
  return tags.split('\n').find((tag) => tag !== '');
};

const commitsSince = (previousTag: string, paths: readonly string[]): Commit[] => {
  const output = git('log', '--format=%H%x1f%s%x1f%b%x1e', `${previousTag}..HEAD`, '--', ...paths, ...ignoredPathspecs);
  return output
    .split('\u001E')
    .map((record) => record.replace(/^\n+/u, ''))
    .filter((record) => record !== '')
    .map((record) => {
      const [hash = '', subject = '', body = ''] = record.split('\u001F');
      return { hash, subject, body };
    });
};

const manifestVersion = (root: string): string => {
  const manifest = JSON.parse(readFileSync(join(workspaceRoot, root, 'package.json'), 'utf8')) as { version?: string };
  if (typeof manifest.version !== 'string') {
    throw new TypeError(`${root}/package.json has no version`);
  }

  return manifest.version;
};

/**
 * The workspace project graph, computed by the Nx CLI. Nx plugins load
 * TypeScript configs (such as `apps/docs/react-router.config.ts`) whose
 * transpiled helpers resolve only through the pnpm virtual store that the `nx`
 * launcher puts on NODE_PATH, so an in-process `createProjectGraphAsync` under
 * plain `node` fails on a cold cache. Nx's own output goes to stderr: stdout is
 * this script's JSON, and the release workflow redirects it to a file.
 */
const projectGraph = (): ProjectGraph => {
  const directory = mkdtempSync(join(tmpdir(), 'release-apps-'));
  try {
    const file = join(directory, 'graph.json');
    execFileSync(join(workspaceRoot, 'node_modules/.bin/nx'), ['graph', `--file=${file}`], {
      cwd: workspaceRoot,
      stdio: ['ignore', 2, 2],
    });
    return (JSON.parse(readFileSync(file, 'utf8')) as { graph: ProjectGraph }).graph;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

/** Every `release:app` project with the roots of its workspace dependency closure. */
export const releaseApps = (): ReleaseApp[] => {
  const graph = projectGraph();
  const closure = (name: string, seen = new Set<string>()): Set<string> => {
    if (seen.has(name) || graph.nodes[name] === undefined) {
      return seen;
    }

    seen.add(name);
    for (const { target } of graph.dependencies[name] ?? []) {
      closure(target, seen);
    }

    return seen;
  };

  const apps = Object.values(graph.nodes)
    .filter(({ data }) => data.tags?.includes(releaseAppTag))
    .map(({ name, data }) => ({
      name,
      root: data.root,
      paths: [...closure(name)]
        .map((member) => graph.nodes[member]?.data.root ?? '')
        .filter(Boolean)
        .sort(),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  if (apps.length === 0) {
    throw new Error(`no project carries the ${releaseAppTag} tag`);
  }

  return apps;
};

export const planReleases = (apps: readonly ReleaseApp[] = releaseApps()): AppRelease[] => {
  return apps.flatMap((app) => {
    const previousTag = latestTag(app.name);
    const commits = previousTag === undefined ? [] : commitsSince(previousTag, app.paths);
    // The tag is the released truth; a manifest can lag it when a release commit was reverted.
    const currentVersion =
      previousTag === undefined ? manifestVersion(app.root) : previousTag.slice(app.name.length + 1);
    const release = planRelease({ app, currentVersion, previousTag, commits });
    return release ? [release] : [];
  });
};

/** The pending release of one application; throws for a name that is not an application. */
export const selectRelease = (
  releases: readonly AppRelease[],
  apps: ReadonlyArray<Pick<ReleaseApp, 'name'>>,
  project: string | undefined,
): AppRelease[] => {
  if (project === undefined || !apps.some(({ name }) => name === project)) {
    throw new TypeError(
      `"${project ?? ''}" is not an application; expected one of ${apps.map(({ name }) => name).join(', ')}`,
    );
  }

  return releases.filter(({ name }) => name === project);
};

const today = (): string => new Date().toISOString().slice(0, 10);

const prepare = (project: string | undefined): void => {
  const apps = releaseApps();
  const releases = selectRelease(planReleases(apps), apps, project);
  for (const release of releases) {
    const manifestPath = join(workspaceRoot, release.root, 'package.json');
    writeFileSync(manifestPath, setManifestVersion(readFileSync(manifestPath, 'utf8'), release.nextVersion));
    const changelogPath = join(workspaceRoot, release.root, 'CHANGELOG.md');
    const existing = existsSync(changelogPath) ? readFileSync(changelogPath, 'utf8') : undefined;
    writeFileSync(changelogPath, prependChangelog(existing, 'Changelog', changelogSection(release, today())));
  }

  console.log(
    JSON.stringify({ releases, subject: releases.length > 0 ? releaseCommitSubject(releases) : undefined }, null, 2),
  );
};

/** The section of a changelog that documents one version, without its heading. */
export const changelogNotes = (changelog: string, version: string): string => {
  const lines = changelog.split('\n');
  const start = lines.findIndex((line) => line.startsWith(`## ${version} `) || line === `## ${version}`);
  if (start === -1) {
    return '';
  }

  const end = lines.findIndex((line, index) => index > start && line.startsWith('## '));
  return lines
    .slice(start + 1, end === -1 ? undefined : end)
    .join('\n')
    .trim();
};

/** Tags introduced by HEAD: each application whose manifest version HEAD changed and is not yet tagged. */
const tags = (): void => {
  const apps = releaseApps();
  const introduced = apps.flatMap((app) => {
    const version = manifestVersion(app.root);
    const before = (() => {
      try {
        return (JSON.parse(git('show', `HEAD~1:${app.root}/package.json`)) as { version?: string }).version;
      } catch {
        return undefined;
      }
    })();
    const tag = `${app.name}@${version}`;
    if (before === version || git('tag', '--list', tag) !== '') {
      return [];
    }

    const changelogPath = join(workspaceRoot, app.root, 'CHANGELOG.md');
    const notes = existsSync(changelogPath) ? changelogNotes(readFileSync(changelogPath, 'utf8'), version) : '';
    return [{ name: app.name, version, tag, notes }];
  });
  console.log(JSON.stringify(introduced, null, 2));
};

const main = (command: string | undefined, argument: string | undefined): void => {
  switch (command) {
    case 'plan': {
      console.log(JSON.stringify(planReleases(), null, 2));
      break;
    }
    case 'apps': {
      console.log(
        releaseApps()
          .map(({ name }) => name)
          .join('\n'),
      );
      break;
    }
    case 'prepare': {
      prepare(argument);
      break;
    }
    case 'tags': {
      tags();
      break;
    }
    default: {
      throw new TypeError('Usage: node scripts/src/release-apps.ts plan|apps|prepare <project>|tags');
    }
  }
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main(process.argv[2], process.argv[3]);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
