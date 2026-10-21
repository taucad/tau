#!/usr/bin/env node
/**
 * Purpose: Assemble an isolated AppImage from the existing Linux application without publishing.
 * Environment: Linux x64; TAU_APPIMAGE_APP_DIR, DESKTOP_RELEASE_TAG, TAU_DESKTOP_SOURCE_SHA,
 * TAU_APPIMAGE_PUBLIC_KEYS_FILE (JSON map of key ids to Ed25519 public PEM keys).
 * Optional: TAU_DESKTOP_PACKAGE_OUTPUT_ROOT; --test-trust marks disposable CI assembly.
 * Usage: pnpm nx run desktop:make-appimage --args=--test-trust
 * Exit: nonzero on identity, launcher, embedded key or artifact validation failure.
 */
import { execFileSync } from 'node:child_process';
import { createHash, createPublicKey } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, cp, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';

import { extractFile } from '@electron/asar';
import { build, Platform } from 'electron-builder';
import { z } from 'zod';

import { desktopArtifactName, desktopReleaseIdentity } from '#shared/desktop-release.js';

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
};
const digest = async (path: string): Promise<string> => {
  const hash = createHash('sha512');
  for await (const chunk of createReadStream(path)) {
    hash.update(Buffer.from(chunk));
  }
  return hash.digest('base64');
};

const main = async (): Promise<void> => {
  if (process.platform !== 'linux' || process.arch !== 'x64') {
    throw new Error('AppImage assembly requires a Linux x64 host');
  }
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--test-trust')) {
    throw new Error('Expected no arguments or --test-trust for isolated CI assembly');
  }
  const tag = required('DESKTOP_RELEASE_TAG');
  const identity = desktopReleaseIdentity(tag);
  const sourceCommit = z
    .string()
    .regex(/^[a-f\d]{40}$/u)
    .parse(required('TAU_DESKTOP_SOURCE_SHA'));
  const keys = z
    .record(z.string().regex(/^[\w-]{1,128}$/u), z.string().min(1))
    .parse(JSON.parse(await readFile(required('TAU_APPIMAGE_PUBLIC_KEYS_FILE'), 'utf8')));
  if (Object.keys(keys).length === 0 || Object.keys(keys).length > 8) {
    throw new Error('AppImage requires one to eight embedded update verification keys');
  }
  for (const pem of Object.values(keys)) {
    if (!pem.startsWith('-----BEGIN PUBLIC KEY-----') || createPublicKey(pem).asymmetricKeyType !== 'ed25519') {
      throw new Error('Only Ed25519 public keys may be embedded in the application');
    }
  }
  const desktopRoot = resolve(import.meta.dirname, '..');
  const input = await realpath(required('TAU_APPIMAGE_APP_DIR'));
  const stagedIdentity = z
    .object({
      version: z.string(),
      tauDesktop: z.object({
        channel: z.enum(['staging', 'production']).optional(),
        sourceCommit: z.string(),
        environmentOverrides: z.boolean().optional(),
      }),
    })
    .parse(JSON.parse(extractFile(join(input, 'resources/app.asar'), 'package.json').toString('utf8')));
  if (
    stagedIdentity.version !== identity.version ||
    (stagedIdentity.tauDesktop.channel ?? 'production') !== identity.channel ||
    stagedIdentity.tauDesktop.sourceCommit !== sourceCommit ||
    stagedIdentity.tauDesktop.environmentOverrides
  ) {
    throw new Error('Prepackaged application version, channel, source or release hardening disagrees with candidate');
  }
  const output = resolve(process.env['TAU_DESKTOP_PACKAGE_OUTPUT_ROOT'] ?? join(desktopRoot, 'package-out/appimage'));
  if (output === input || output.startsWith(input + sep) || input.startsWith(output + sep)) {
    throw new Error('AppImage output and staged input must be separate trees');
  }
  execFileSync(
    process.execPath,
    [resolve(desktopRoot, '../../packages/plugins/tscircuit/check-vendored-licenses.mjs')],
    { stdio: 'inherit' },
  );
  await mkdir(output, { recursive: true });
  const stage = join(output, 'app');
  await mkdir(stage);
  await cp(input, stage, { recursive: true, errorOnExist: true });
  const cache = identity.channel === 'staging' ? 'tau-staging-updater' : 'tau-updater';
  const name = identity.channel === 'staging' ? 'Tau Staging' : 'Tau';
  const marker =
    JSON.stringify({
      schemaVersion: 1,
      route: 'linux-appimage',
      tag,
      ...identity,
      sourceCommit,
      arch: 'x64',
      trust: args[0] === '--test-trust' ? 'test' : 'release',
      cache,
      keys,
    }) + '\n';
  await writeFile(join(stage, 'resources/desktop-installation.json'), marker);
  const updateConfig = JSON.stringify({ updaterCacheDirName: cache }) + '\n';
  await writeFile(join(stage, 'resources/app-update.yml'), updateConfig);
  // The pinned builder copies prepackaged files after its generated launcher. Its default launcher
  // disables Chromium sandboxing when user namespaces fail. Own this file and verify the actual image.
  const launcher = await readFile(join(desktopRoot, 'resources/appimage/AppRun'), 'utf8');
  await writeFile(join(stage, 'AppRun'), launcher, { mode: 0o755 });
  await chmod(join(stage, 'AppRun'), 0o755);
  const artifactName = desktopArtifactName({ kind: 'linux-appimage', ...identity, arch: 'x64' });
  const project = join(output, 'maker-project');
  await mkdir(project);
  await writeFile(
    join(project, 'package.json'),
    JSON.stringify({
      name: 'tau-desktop',
      version: identity.version,
      description: 'Tau desktop CAD workspace',
      author: 'Tau',
      desktopName: identity.channel === 'staging' ? 'com.taucad.tau.staging.desktop' : 'com.taucad.tau.desktop',
      license: 'Apache-2.0',
    }),
  );
  const electronMetadata = z
    .object({ version: z.string() })
    .parse(createRequire(import.meta.url)('electron/package.json'));
  const artifacts = await build({
    projectDir: project,
    prepackaged: stage,
    targets: Platform.LINUX.createTarget(['AppImage']),
    publish: 'never',
    config: {
      appId: identity.channel === 'staging' ? 'com.taucad.tau.staging' : 'com.taucad.tau',
      productName: name,
      executableName: 'Tau',
      artifactName,
      directories: { output },
      extraMetadata: { version: identity.version },
      electronVersion: electronMetadata.version,
      npmRebuild: false,
      publish: null,
      linux: { target: ['AppImage'], category: 'Graphics', icon: join(desktopRoot, 'resources/icon.png') },
      appImage: { executableArgs: [] },
      protocols: [{ name, schemes: [identity.channel === 'staging' ? 'tau-staging' : 'tau'] }],
    },
  });
  const artifact = join(output, artifactName);
  const artifactStat = await stat(artifact);
  if (!artifacts.map((path) => resolve(path)).includes(artifact) || !artifactStat.isFile()) {
    throw new Error('AppImage maker did not produce the expected artifact');
  }
  const extracted = join(output, 'verification');
  await mkdir(extracted);
  execFileSync(artifact, ['--appimage-extract'], {
    cwd: extracted,
    stdio: ['ignore', 'ignore', 'pipe'],
    timeout: 120_000,
  });
  const appDirectory = join(extracted, 'squashfs-root');
  const [actualLauncher, actualMarker, actualUpdateConfig, inputHash, actualHash] = await Promise.all([
    readFile(join(appDirectory, 'AppRun'), 'utf8'),
    readFile(join(appDirectory, 'resources/desktop-installation.json'), 'utf8'),
    readFile(join(appDirectory, 'resources/app-update.yml'), 'utf8'),
    digest(join(input, 'resources/app.asar')),
    digest(join(appDirectory, 'resources/app.asar')),
  ]);
  if (
    actualLauncher !== launcher ||
    actualMarker !== marker ||
    actualUpdateConfig !== updateConfig ||
    inputHash !== actualHash
  ) {
    throw new Error('AppImage changed the launcher, installation identity, updater configuration or finalized app');
  }
  await writeFile(
    join(output, 'appimage-assembly.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        tag,
        ...identity,
        sourceCommit,
        trust: args[0] === '--test-trust' ? 'test' : 'release',
        keyIds: Object.keys(keys),
        artifact: { name: artifactName, size: artifactStat.size, sha512: await digest(artifact) },
        applicationSha512: inputHash,
        launcherVerified: true,
      },
      null,
      2,
    ) + '\n',
  );
};
try {
  await main();
} catch (error) {
  console.error('AppImage assembly failed:', error);
  process.exit(1);
}
