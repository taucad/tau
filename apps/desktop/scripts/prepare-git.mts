#!/usr/bin/env node

/**
 * Purpose: Assemble the pinned, relocatable `git` + `git-lfs` payload the desktop records revisions with.
 * Why: A Finder-launched app has no Homebrew PATH, so a machine without git and git-lfs cannot back a project up (OQ3, X2).
 * Environment: Node 24+, network access. macOS and Linux: make, a C compiler (Xcode Command Line Tools on macOS) and tar,
 * on the target. win32-x64 (MinGit, extracted, not compiled): the inbox tar.exe on Windows, or unzip elsewhere; it is
 * probed only on a Windows x64 host.
 * Usage: node --import @oxc-node/core/register apps/desktop/scripts/prepare-git.mts [--target darwin-arm64|darwin-x64|linux-x64|win32-x64]
 * Exit codes: 0 for an integrity-verified payload; non-zero for unsupported targets or download/build/probe failure.
 */

import { execFileSync } from 'node:child_process';
import { chmod, cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { join, resolve, win32 } from 'node:path';

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
      throw new TypeError('Usage: prepare-git.mts [--target darwin-arm64|darwin-x64|linux-x64|win32-x64]');
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
  /* Windows' own folders only on Windows (no Git for Windows or git-lfs of the runner's; names are case-insensitive). */
  const systemRoot = process.env['SystemRoot'] ?? String.raw`C:\Windows`;
  const environment: NodeJS.ProcessEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key.toUpperCase() !== 'PATH'),
  );
  environment['PATH'] =
    process.platform === 'win32' ? [win32.join(systemRoot, 'System32'), systemRoot].join(';') : '/usr/bin:/bin';
  environment['GIT_CONFIG_NOSYSTEM'] = '1';
  return {
    git: execFileSync(git, ['--version'], { encoding: 'utf8', env: environment }).trim(),
    gitLfs: execFileSync(git, ['lfs', 'version'], { encoding: 'utf8', env: environment }).trim(),
  };
};

const manifestIsCurrent = async (targetName: string): Promise<boolean> => {
  const layout = payload.gitPayloadLayout(resourceRoot, targetName);
  try {
    return (
      payload.gitPayloadManifestIsCurrent(JSON.parse(await readFile(layout.manifest, 'utf8')), {
        target: targetName,
        gitSha256: await payload.sha256Of(layout.git),
        gitLfsSha256: await payload.sha256Of(layout.gitLfs),
      }) &&
      (layout.source === undefined || (await payload.sha256Of(layout.source)) === payload.gitSourceSha256)
    );
  } catch {
    return false;
  }
};

/** Mach-O magic numbers, either byte order, thin or universal. */
const machoMagic = new Set([0xfe_ed_fa_ce, 0xfe_ed_fa_cf, 0xce_fa_ed_fe, 0xcf_fa_ed_fe, 0xca_fe_ba_be, 0xbe_ba_fe_ca]);

/** Refuse a macOS payload that links anything a clean Mac does not have. */
const assertSystemLinkedOnly = async (root: string): Promise<void> => {
  const entries = await readdir(root, { withFileTypes: true, recursive: true });
  const found = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const path = join(entry.parentPath, entry.name);
        const bytes = await readFile(path);
        return bytes.length >= 4 && machoMagic.has(bytes.readUInt32BE(0)) ? [path] : [];
      }),
  );
  const machoFiles = found.flat();
  const foreign = payload.foreignLibraries(execFileSync('otool', ['-L', ...machoFiles], { encoding: 'utf8' }));
  if (foreign.length > 0) {
    throw new Error(`The git payload links libraries a clean Mac does not have: ${foreign.join(', ')}`);
  }
};

/** Extract a ZIP: Windows' inbox bsdtar (Git Bash's GNU tar cannot read ZIP), `unzip` elsewhere. */
const extractZip = (archive: string, destination: string): void => {
  if (process.platform === 'win32') {
    const tar = win32.join(process.env['SystemRoot'] ?? String.raw`C:\Windows`, 'System32', 'tar.exe');
    execFileSync(tar, ['-xf', archive, '-C', destination], {
      stdio: 'inherit',
    });
  } else {
    execFileSync('unzip', ['-q', archive, '-d', destination], {
      stdio: 'inherit',
    });
  }
};

/**
 * The Windows payload: MinGit's release tree, less `mingitOmittedPaths`, with its launcher at `bin/git.exe` and the
 * git-lfs release binary in its exec path. Nothing is compiled, so any host can assemble it; only a Windows x64 host
 * can probe it, and the manifest records a probe only when one ran.
 */
const prepareMingit = async (targetName: string, target: payload.GitTarget): Promise<void> => {
  const host = `${process.platform}-${process.arch}`;
  if (host === targetName && (await manifestIsCurrent(targetName))) {
    console.log(`git payload is current: ${targetName}`);
    return;
  }
  const [mingitArchive, lfsArchive, lfsLicense] = await Promise.all([
    download(payload.mingitArchive),
    download(target.gitLfs),
    download({
      name: `git-lfs-v${payload.gitLfsVersion}-LICENSE.md`,
      sha256: payload.gitLfsLicenseSha256,
      url: payload.gitLfsLicenseUrl,
    }),
  ]);
  const work = resolve(cacheRoot, `.${targetName}.${String(process.pid)}.work`);
  await rm(work, { recursive: true, force: true });
  await mkdir(work, { recursive: true });
  extractZip(lfsArchive, work);

  const stagingName = `.${targetName}.${String(process.pid)}.tmp`;
  const temporary = join(resourceRoot, stagingName);
  await rm(temporary, { recursive: true, force: true });
  await mkdir(temporary, { recursive: true });
  extractZip(mingitArchive, temporary);
  /* `stat` throws ENOENT when a pinned path is gone: a MinGit bump reviews this list. */
  await Promise.all(payload.mingitOmittedPaths.map(async (path) => stat(join(temporary, path))));
  await Promise.all(payload.mingitOmittedPaths.map(async (path) => rm(join(temporary, path))));
  /* MinGit's launcher, under the name a full Git for Windows install gives it and the app resolves. */
  await rename(join(temporary, 'cmd'), join(temporary, 'bin'));
  const staged = payload.gitPayloadLayout(resourceRoot, targetName, stagingName);
  await cp(await findFile(work, 'git-lfs.exe'), staged.gitLfs);
  await Promise.all([
    stat(staged.gitCopying),
    cp(lfsLicense, staged.gitLfsLicense),
    writeFile(staged.notice, payload.mingitPayloadNotice),
  ]);

  const layout = payload.gitPayloadLayout(resourceRoot, targetName);
  await rm(layout.root, { recursive: true, force: true });
  await rename(temporary, layout.root);
  const versions = host === targetName ? probe(layout.git) : undefined;
  await writeFile(
    layout.manifest,
    `${JSON.stringify(
      payload.gitPayloadManifest({
        target: targetName,
        gitSha256: await payload.sha256Of(layout.git),
        gitLfsSha256: await payload.sha256Of(layout.gitLfs),
        ...(versions === undefined ? {} : { probed: versions }),
      }),
      undefined,
      2,
    )}\n`,
  );
  await rm(work, { recursive: true, force: true });
  console.log(
    versions === undefined
      ? `Prepared git payload: ${targetName} (${payload.mingitVersion}; not probed on ${host})`
      : `Prepared git payload: ${targetName} (${versions.git}; ${versions.gitLfs})`,
  );
};

const prepareTarget = async (targetName: string): Promise<void> => {
  const target = payload.gitTargets[targetName];
  if (!target) {
    throw new Error(`Unsupported git payload target: ${targetName}`);
  }
  if (target.build === 'mingit') {
    await prepareMingit(targetName, target);
    return;
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
  /* The oldest macOS the payload must run on; an environment name, so assigned. */
  const makeEnvironment: NodeJS.ProcessEnv = { ...process.env };
  if (process.platform === 'darwin') {
    makeEnvironment['MACOSX_DEPLOYMENT_TARGET'] = payload.gitMacosDeploymentTarget;
  }
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
    { stdio: 'inherit', env: makeEnvironment },
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
  const staged = payload.gitPayloadLayout(resourceRoot, targetName, `.${targetName}.${String(process.pid)}.tmp`);
  await cp(await findFile(join(work, 'lfs'), 'git-lfs'), staged.gitLfs);
  await chmod(staged.gitLfs, 0o755);
  await Promise.all([
    cp(join(source, 'COPYING'), staged.gitCopying),
    cp(lfsLicense, staged.gitLfsLicense),
    writeFile(staged.notice, payload.gitPayloadNotice),
    /* Documentation a GUI app never renders. */
    rm(join(temporary, 'share', 'man'), { recursive: true, force: true }),
  ]);

  if (process.platform === 'darwin') {
    await assertSystemLinkedOnly(temporary);
  }
  const layout = payload.gitPayloadLayout(resourceRoot, targetName);
  await rm(layout.root, { recursive: true, force: true });
  await rename(temporary, layout.root);
  if (layout.source === undefined) {
    throw new Error(`A source-built git payload has a source path: ${targetName}`);
  }
  await payload.copyGitSource(sourceArchive, layout.source, payload.gitSourceSha256);
  const versions = probe(layout.git);
  await writeFile(
    layout.manifest,
    `${JSON.stringify(
      payload.gitPayloadManifest({
        target: targetName,
        gitSha256: await payload.sha256Of(layout.git),
        gitLfsSha256: await payload.sha256Of(layout.gitLfs),
        probed: versions,
      }),
      undefined,
      2,
    )}\n`,
  );
  await rm(work, { recursive: true, force: true });
  console.log(`Prepared git payload: ${targetName} (${versions.git}; ${versions.gitLfs})`);
};

await Promise.all(parseTargets().map(async (target) => prepareTarget(target)));
