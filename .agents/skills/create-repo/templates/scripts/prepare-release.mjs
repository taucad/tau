#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { releaseChangelog, releaseVersion } from 'nx/release/index.js';
import semver from 'semver';

const ROOT_DIRECTORY = new URL('../', import.meta.url);
const NPM_DIRECTORY = new URL('./npm/', ROOT_DIRECTORY);
const PACKAGE_DIRECTORIES = [
  ROOT_DIRECTORY,
  ...(existsSync(NPM_DIRECTORY)
    ? readdirSync(NPM_DIRECTORY, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && existsSync(new URL(`./${entry.name}/package.json`, NPM_DIRECTORY)))
        .map((entry) => new URL(`./${entry.name}/`, NPM_DIRECTORY))
    : []),
];
const PACKAGE_PATHS = PACKAGE_DIRECTORIES.map((directory) => new URL('./package.json', directory));
const PROJECTS = PACKAGE_DIRECTORIES.map((directory) => {
  const projectPath = new URL('./project.json', directory);
  return existsSync(projectPath)
    ? JSON.parse(readFileSync(projectPath, 'utf8')).name
    : JSON.parse(readFileSync(new URL('./package.json', directory), 'utf8')).name;
});
const PLATFORM_PACKAGES = PACKAGE_PATHS.slice(1).map((path) => JSON.parse(readFileSync(path, 'utf8')).name);
const CHANGELOG_PATH = new URL('./CHANGELOG.md', ROOT_DIRECTORY);
const GIT_OPTIONS = { gitCommit: false, gitPush: false, gitTag: false, stageChanges: false };
const THANK_YOU = '### ❤️ Thank You';
/**
 * Authors that are not people: the `tau-release-bot` that commits the release,
 * Dependabot, and the coding assistants whose `Co-Authored-By` trailer nx reads
 * as an author.
 */
const NON_HUMAN_AUTHOR = /^- (?:claude\b|openai codex\b|.*\[bot\])/iu;

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

/**
 * Drop non-human authors from the newest changelog entry's Thank You list.
 * Commit trailers keep that provenance; published entries stay untouched.
 */
export const withoutNonHumanAuthors = (changelog) => {
  const lines = changelog.split('\n');
  const nextEntry = lines.findIndex((line, index) => index > 0 && line.startsWith('## '));
  const limit = nextEntry === -1 ? lines.length : nextEntry;
  const heading = lines.findIndex((line, index) => index < limit && line === THANK_YOU);
  if (heading === -1) return changelog;

  let end = heading + 1;
  while (end < limit && lines[end] === '') end += 1;
  const authors = [];
  while (end < limit && lines[end].startsWith('- ')) {
    authors.push(lines[end]);
    end += 1;
  }

  const people = authors.filter((author) => !NON_HUMAN_AUTHOR.test(author));
  if (people.length === authors.length) return changelog;

  // With nobody left to thank, the heading and its separating blank line go too.
  const start = people.length > 0 || lines[heading - 1] !== '' ? heading : heading - 1;
  const kept = people.length > 0 ? [THANK_YOU, '', ...people] : [];
  return [...lines.slice(0, start), ...kept, ...lines.slice(end)].join('\n');
};

const packageVersions = () => PACKAGE_PATHS.map((path) => JSON.parse(readFileSync(path, 'utf8')).version);

const syncOptionalDependencies = (version) => {
  if (PLATFORM_PACKAGES.length === 0) return;
  const manifest = JSON.parse(readFileSync(PACKAGE_PATHS[0], 'utf8'));
  for (const name of PLATFORM_PACKAGES) manifest.optionalDependencies[name] = version;
  writeFileSync(PACKAGE_PATHS[0], `${JSON.stringify(manifest, null, 2)}\n`);
};

const assertClean = () => {
  const status = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' });
  assert(status.length === 0, 'release preparation requires a clean worktree');
};

/**
 * Run the quality gate once, against the committed tree, with its output shown.
 * An nx `preVersionCommand` would run on both `releaseVersion` calls below,
 * grading the second time a tree the first regenerated, and nx pipes that
 * command's stdout away, so a failing gate printed no findings.
 */
const runQualityGate = () => {
  execFileSync('pnpm', ['nx', 'run', '@@CREATE_REPO_slug@@:quality'], { stdio: 'inherit' });
};

/** The one version every pending Version Plan agrees on, for `--from-plans` runs. */
export const versionFromPlans = (plannedVersions) => {
  assert(
    plannedVersions.length > 0 && plannedVersions.every(Boolean),
    'no pending Version Plan affects the fixed release group',
  );
  assert(new Set(plannedVersions).size === 1, 'Version Plans did not produce one fixed version');
  return plannedVersions[0];
};

export const validateRequestedVersion = ({
  currentVersions,
  optionalDependencyVersions,
  plannedVersions,
  requestedVersion,
}) => {
  assert(
    currentVersions.every((version) => semver.valid(version)),
    'invalid package version',
  );
  assert(new Set(currentVersions).size === 1, 'fixed release packages have different versions');
  assert(
    optionalDependencyVersions.every((version) => version === currentVersions[0]),
    'native optional dependency versions do not match the fixed release group',
  );
  assert(
    plannedVersions.every((version) => semver.valid(version)),
    'invalid Version Plan result',
  );
  assert(new Set(plannedVersions).size === 1, 'Version Plans did not produce one fixed version');
  assert(semver.valid(requestedVersion), `invalid requested version: ${requestedVersion}`);
  assert(semver.prerelease(requestedVersion) === null, 'routine releases require stable SemVer');
  assert(
    requestedVersion === plannedVersions[0],
    `requested ${requestedVersion} does not match Version Plans (${plannedVersions[0]})`,
  );
  assert(
    semver.gt(requestedVersion, currentVersions[0]),
    `${requestedVersion} must be newer than ${currentVersions[0]}`,
  );
  return requestedVersion;
};

const prepare = async ({ dryRun, requestedVersion }) => {
  // Asserted on entry: the quality gate can regenerate committed artifacts, so
  // the tree cannot stay clean once preparation starts. Release-commit purity
  // is enforced by staging only release files and by the CI release policy.
  if (!dryRun) assertClean();
  runQualityGate();
  const currentVersions = packageVersions();
  const rootManifest = JSON.parse(readFileSync(PACKAGE_PATHS[0], 'utf8'));
  const optionalDependencyVersions = PLATFORM_PACKAGES.map((name) => rootManifest.optionalDependencies[name]);
  const preview = await releaseVersion({ ...GIT_OPTIONS, deleteVersionPlans: false, dryRun: true });
  const plannedVersions = PROJECTS.map((project) => preview.projectsVersionData[project]?.newVersion);
  const plannedVersion = versionFromPlans(plannedVersions);
  const version = requestedVersion ?? plannedVersion;
  validateRequestedVersion({ currentVersions, optionalDependencyVersions, plannedVersions, requestedVersion: version });

  await releaseChangelog({
    ...GIT_OPTIONS,
    createRelease: false,
    deleteVersionPlans: true,
    dryRun: true,
    releaseGraph: preview.releaseGraph,
    version,
  });
  if (dryRun) return version;

  await releaseVersion({
    ...GIT_OPTIONS,
    deleteVersionPlans: true,
    version,
  });
  syncOptionalDependencies(version);
  execFileSync('pnpm', ['install', '--lockfile-only'], { stdio: 'inherit' });
  await releaseChangelog({
    ...GIT_OPTIONS,
    createRelease: false,
    deleteVersionPlans: false,
    releaseGraph: preview.releaseGraph,
    version,
  });
  writeFileSync(CHANGELOG_PATH, withoutNonHumanAuthors(readFileSync(CHANGELOG_PATH, 'utf8')));
  execFileSync('pnpm', ['exec', 'oxfmt', '--write', fileURLToPath(CHANGELOG_PATH)]);
  assert(
    packageVersions().every((prepared) => prepared === version),
    `fixed release did not prepare every package at ${version}`,
  );
  return version;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const requestedVersion = process.argv.slice(2).find((value) => !value.startsWith('-'));
  const dryRun = process.argv.includes('--dry-run');
  const fromPlans = process.argv.includes('--from-plans');

  try {
    assert(
      fromPlans ? !requestedVersion : requestedVersion,
      'usage: pnpm release:prepare -- <version> [--dry-run], or pnpm release:prepare -- --from-plans [--dry-run]',
    );
    const version = await prepare({ dryRun, requestedVersion });
    console.log(`${dryRun ? 'Would prepare' : 'Prepared'} @@CREATE_REPO_slug@@ v${version}`);
    if (!dryRun) {
      console.log(`Commit generated release files as: chore(release): @@CREATE_REPO_slug@@ v${version}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
