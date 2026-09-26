#!/usr/bin/env node

/**
 * Purpose: Assemble the pinned, relocatable `git` + `git-lfs` payload the desktop records revisions with.
 * Why: A Finder-launched app has no Homebrew PATH, so a machine without git and git-lfs cannot back a project up (OQ3, X2).
 * Environment: Node 24+, make, a C compiler (Xcode Command Line Tools on macOS), tar, unzip, network access, on the target.
 * Usage: node --import @oxc-node/core/register apps/desktop/scripts/prepare-git.mts [--target darwin-arm64|linux-x64]
 * Exit codes: 0 for an integrity-verified payload; non-zero for unsupported targets or download/build/probe failure.
 */

import { execFileSync } from 'node:child_process';
import { chmod, cp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { join, resolve } from 'node:path';

// oxlint-disable-next-line no-restricted-imports -- Operational scripts are outside the app's # source alias.
import * as payload from './git-payload.mjs';

const workspaceRoot = resolve(import.meta.dirname, '../../..');
const resourceRoot = resolve(workspaceRoot, 'apps/desktop/resources/git');
const cacheRoot = resolve(workspaceRoot, 'out/cache/git');

const parseTargets = (): string[] => {
  const arguments_ = process.argv.slice(2);
  const selected: string[] = [];
  for (let index = 0; index < arguments_.length; index += 1) {
    if (arguments_[index] !== '--target' || !arguments_[index + 1]) {
      throw new TypeError('Usage: prepare-git.mts [--target darwin-arm64|linux-x64]');
    }
    selected.push(arguments_[index + 1]!);
    index += 1;
  }
  return selected.length > 0 ? selected : [`${process.platform}-${process.arch}`];
};

const download = async (options: Readonly<{ name: string; sha256: string; url: string }>): Promise<string> => {
  await mkdir(cacheRoot, { recursive: true });
  const path = resolve(cacheRoot, options.name);
  if ((await payload.sha256Of(path).catch(() => undefined)) === options.sha256) {
    return path;
  }
  const response = await fetch(options.url);
  if (!response.ok) {
    throw new Error(`${options.name} download failed with HTTP ${String(response.status)}`);
  }
  const temporary = `${path}.${String(process.pid)}.tmp`;
  await writeFile(temporary, new Uint8Array(await response.arrayBuffer()));
  if ((await payload.sha256Of(temporary)) !== options.sha256) {
    await rm(temporary, { force: true });
    throw new Error(`${options.name} integrity mismatch`);
  }
  await rename(temporary, path);
  return path;
};

/** Find one file by name under an extracted archive, wherever its top directory put it. */
const findFile = async (root: string, name: string): Promise<string> => {
  for (const entry of await readdir(root, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && entry.name === name) {
      return join(entry.parentPath, entry.name);
    }
  }
  throw new Error(`${name} is not in ${root}`);
};

/** Both version probes, run from the payload's final location so relocation is what is proven. */
const probe = (git: string): Readonly<{ git: string; gitLfs: string }> => {
  /* No PATH git-lfs to fall back on: `git lfs` must resolve from the payload's own exec path. */
  const environment: NodeJS.ProcessEnv = { ...process.env };
  environment['PATH'] = '/usr/bin:/bin';
  environment['GIT_CONFIG_NOSYSTEM'] = '1';
  return {
    git: execFileSync(git, ['--version'], { encoding: 'utf8', env: environment }).trim(),
    gitLfs: execFileSync(git, ['lfs', 'version'], { encoding: 'utf8', env: environment }).trim(),
  };
};

const manifestIsCurrent = async (targetName: string): Promise<boolean> => {
  const layout = payload.gitPayloadLayout(resourceRoot, targetName);
  try {
    const manifest = JSON.parse(await readFile(layout.manifest, 'utf8')) as Record<string, unknown>;
    return (
      manifest['payload.gitSourceSha256'] === payload.gitSourceSha256 &&
      manifest['gitLfsArchiveSha256'] === payload.gitTargets[targetName]?.gitLfs.sha256 &&
      JSON.stringify(manifest['makeVariables']) === JSON.stringify(payload.gitMakeVariables) &&
      manifest['gitSha256'] === (await payload.sha256Of(layout.git)) &&
      manifest['gitLfsSha256'] === (await payload.sha256Of(layout.gitLfs)) &&
      (await payload.sha256Of(layout.source)) === payload.gitSourceSha256
    );
  } catch {
    return false;
  }
};

const prepareTarget = async (targetName: string): Promise<void> => {
  const target = payload.gitTargets[targetName];
  if (!target) {
    throw new Error(`Unsupported git payload target: ${targetName}`);
  }
  if (targetName !== `${process.platform}-${process.arch}`) {
    throw new Error(`git is compiled on its target; ${targetName} cannot be prepared on this machine.`);
  }
  if (await manifestIsCurrent(targetName)) {
    console.log(`git payload is current: ${targetName}`);
    return;
  }
  const [sourceArchive, lfsArchive, lfsLicense] = await Promise.all([
    download({ name: payload.gitSourceName, sha256: payload.gitSourceSha256, url: payload.gitSourceUrl }),
    download(target.gitLfs),
    download({
      name: `git-lfs-v${payload.gitLfsVersion}-LICENSE.md`,
      sha256: payload.gitLfsLicenseSha256,
      url: payload.gitLfsLicenseUrl,
    }),
  ]);

  const work = resolve(cacheRoot, `.${targetName}.${String(process.pid)}.work`);
  await rm(work, { recursive: true, force: true });
  await mkdir(join(work, 'lfs'), { recursive: true });
  execFileSync('tar', ['-xJf', sourceArchive, '-C', work], { stdio: 'inherit' });
  const source = join(work, `git-${payload.gitVersion}`);
  const destination = join(work, 'destination');
  execFileSync(
    'make',
    [
      '-C',
      source,
      `-j${String(availableParallelism())}`,
      ...payload.gitMakeVariables,
      `DESTDIR=${destination}`,
      'all',
      'strip',
      'install',
    ],
    { stdio: 'inherit' },
  );
  execFileSync(
    'tar',
    target.gitLfs.format === 'zip'
      ? ['-xf', lfsArchive, '-C', join(work, 'lfs')]
      : ['-xzf', lfsArchive, '-C', join(work, 'lfs')],
    { stdio: 'inherit' },
  );

  /* The installed prefix becomes the payload root, then the pieces that make it
   * one: git-lfs in git's exec path, the licences and the NOTICE beside them. */
  const temporary = join(resourceRoot, `.${targetName}.${String(process.pid)}.tmp`);
  await rm(temporary, { recursive: true, force: true });
  await mkdir(resourceRoot, { recursive: true });
  await rename(join(destination, payload.gitInstallPrefix), temporary);
  const staged = payload.gitPayloadLayout(resourceRoot, `.${targetName}.${String(process.pid)}.tmp`);
  await cp(await findFile(join(work, 'lfs'), 'git-lfs'), staged.gitLfs);
  await chmod(staged.gitLfs, 0o755);
  await Promise.all([
    cp(join(source, 'COPYING'), staged.gitCopying),
    cp(lfsLicense, staged.gitLfsLicense),
    writeFile(staged.notice, payload.gitPayloadNotice),
    /* Documentation a GUI app never renders. */
    rm(join(temporary, 'share', 'man'), { recursive: true, force: true }),
  ]);

  const layout = payload.gitPayloadLayout(resourceRoot, targetName);
  await rm(layout.root, { recursive: true, force: true });
  await rename(temporary, layout.root);
  await payload.copyGitSource(sourceArchive, layout.source, payload.gitSourceSha256);
  const versions = probe(layout.git);
  await writeFile(
    layout.manifest,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        target: targetName,
        gitVersion: payload.gitVersion,
        gitSourceSha256: payload.gitSourceSha256,
        gitLfsVersion: payload.gitLfsVersion,
        gitLfsArchiveSha256: target.gitLfs.sha256,
        makeVariables: payload.gitMakeVariables,
        gitSha256: await payload.sha256Of(layout.git),
        gitLfsSha256: await payload.sha256Of(layout.gitLfs),
        probed: versions,
      },
      undefined,
      2,
    )}\n`,
  );
  await rm(work, { recursive: true, force: true });
  console.log(`Prepared git payload: ${targetName} (${versions.git}; ${versions.gitLfs})`);
};

await Promise.all(parseTargets().map(async (target) => prepareTarget(target)));
