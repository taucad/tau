#!/usr/bin/env node

import { appendFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SHA = /^[0-9a-f]{40}$/u;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const RELEASE_SUBJECT = /^chore\(release\): @@CREATE_REPO_slug@@ v(.+?)(?: \(#\d+\))?$/u;
const npmDirectory = new URL('../npm/', import.meta.url);
const platformManifests = existsSync(npmDirectory)
  ? readdirSync(npmDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(new URL(`./${entry.name}/package.json`, npmDirectory)))
      .map((entry) => `npm/${entry.name}/package.json`)
  : [];
/** Files every fixed-group release rewrites: the changelog and each package manifest. */
const RELEASE_FILES = new Set(['CHANGELOG.md', ...platformManifests, 'package.json']);
/**
 * A version bump leaves `pnpm-lock.yaml` byte-identical unless a dependency
 * specifier moved, because the lockfile records no importer version. It is
 * therefore permitted in a release commit but never required.
 */
const ALLOWED_FILES = new Set([...RELEASE_FILES, 'pnpm-lock.yaml']);

export const releaseFiles = [...RELEASE_FILES];
export const allowedReleaseFiles = [...ALLOWED_FILES];

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const isVersionPlan = (file) => file.startsWith('.nx/version-plans/') && file.endsWith('.md');

const validateRelease = ({ changedFiles, changelog, packageVersion, subject }) => {
  const match = RELEASE_SUBJECT.exec(subject);
  assert(match, `release source is not an exact release commit: ${subject}`);
  assert(match[1] === packageVersion, `release subject ${match[1]} does not match ${packageVersion}`);
  assert(SEMVER.test(packageVersion), `release version is not stable SemVer: ${packageVersion}`);
  for (const file of RELEASE_FILES) assert(changedFiles.includes(file), `release commit must change ${file}`);
  assert(changedFiles.some(isVersionPlan), 'release commit must consume a Version Plan');
  const unexpected = changedFiles.filter((file) => !ALLOWED_FILES.has(file) && !isVersionPlan(file));
  assert(unexpected.length === 0, `release commit has unexpected files: ${unexpected.join(', ')}`);
  assert(
    changelog
      .split(/\r?\n/u)
      .some((line) => line === `## ${packageVersion}` || line.startsWith(`## ${packageVersion} (`)),
    `CHANGELOG.md has no ${packageVersion} section`,
  );
};

/**
 * Classify one CI run: what evidence it owes, and whether it may publish.
 *
 * Publication has exactly one source: a `push` of an exact release commit to
 * `refs/heads/main`. A `workflow_dispatch` from any ref is evidence only and
 * never derives `release`, not even for a release commit on main.
 */
export const deriveRelease = ({ event, ref, sha, packageVersion, subject = '', changedFiles = [], changelog = '' }) => {
  assert(SHA.test(sha), 'sha must be 40 lowercase hexadecimal characters');
  assert(SEMVER.test(packageVersion), `package version is not stable SemVer: ${packageVersion}`);
  const release = RELEASE_SUBJECT.test(subject);

  if (event === 'pull_request') {
    if (release) validateRelease({ changedFiles, changelog, packageVersion, subject });
    return { kind: release ? 'release-pull-request' : 'pull-request', npmPublish: false, version: packageVersion };
  }

  if (event === 'workflow_dispatch') return { kind: 'dispatch', npmPublish: false, version: packageVersion };

  assert(event === 'push', `unsupported event: ${event}`);
  assert(ref === 'refs/heads/main', `publication source must be protected main: ${ref}`);
  if (!release) {
    assert(!subject.startsWith('chore(release): @@CREATE_REPO_slug@@ v'), `malformed release subject: ${subject}`);
    return { kind: 'main', npmPublish: false, version: packageVersion };
  }
  validateRelease({ changedFiles, changelog, packageVersion, subject });
  return { kind: 'release', npmPublish: true, releaseTag: `v${packageVersion}`, version: packageVersion };
};

const parseArgs = (argv) =>
  Object.fromEntries(
    argv.flatMap((value, index) => (value.startsWith('--') ? [[value.slice(2), argv[index + 1] ?? '']] : [])),
  );

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const changedFiles = args['changed-files-file']
      ? readFileSync(args['changed-files-file'], 'utf8').split(/\r?\n/u).filter(Boolean)
      : [];
    const result = deriveRelease({
      event: args.event,
      ref: args.ref,
      sha: args.sha,
      packageVersion: args['package-version'],
      subject: args.subject,
      changedFiles,
      changelog: readFileSync('CHANGELOG.md', 'utf8'),
    });
    const output = Object.entries(result)
      .map(([key, value]) => `${key.replace(/[A-Z]/gu, (c) => `_${c.toLowerCase()}`)}=${value}`)
      .join('\n');
    process.stdout.write(`${output}\n`);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${output}\n`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
