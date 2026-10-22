#!/usr/bin/env node
/**
 * Purpose: Wrap the existing Linux application in retained runtime and stable selector Debian packages.
 * Environment: Linux x64, dpkg-deb, TAU_LINUX_APP_DIR, DESKTOP_RELEASE_TAG, TAU_DESKTOP_SOURCE_SHA,
 * TAU_LINUX_MAINTAINER; optional TAU_MANAGED_APPIMAGE, TAU_DESKTOP_PACKAGE_OUTPUT_ROOT. No signing keys or host package mutation.
 * Usage: pnpm nx run desktop:make-linux-deb
 * Exit: nonzero on mismatched staged identity, missing tools or invalid output.
 */
import { execFileSync } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { extractFile } from '@electron/asar';
import { z } from 'zod';

import { desktopReleaseIdentity } from '#shared/desktop-release.js';
// oxlint-disable-next-line no-restricted-imports -- Shared Debian assembly helper.
import { buildLinuxAptPackages } from './linux-apt-package.mjs';

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
};

const main = async (): Promise<void> => {
  if (process.platform !== 'linux' || process.arch !== 'x64') {
    throw new Error('Debian application packaging requires a Linux x64 host');
  }
  const tag = required('DESKTOP_RELEASE_TAG');
  const identity = desktopReleaseIdentity(tag);
  const sourceCommit = required('TAU_DESKTOP_SOURCE_SHA');
  const appDirectory = await realpath(required('TAU_LINUX_APP_DIR'));
  const manifest = z
    .object({
      version: z.string(),
      tauDesktop: z.object({
        sourceCommit: z.string(),
        channel: z.enum(['staging', 'production']).optional(),
        environmentOverrides: z.boolean().optional(),
      }),
    })
    .parse(JSON.parse(extractFile(join(appDirectory, 'resources/app.asar'), 'package.json').toString('utf8')));
  if (
    manifest.version !== identity.version ||
    manifest.tauDesktop.sourceCommit !== sourceCommit ||
    (manifest.tauDesktop.channel ?? 'production') !== identity.channel ||
    manifest.tauDesktop.environmentOverrides
  ) {
    throw new Error('Prepackaged application identity differs from Debian candidate');
  }
  execFileSync(
    process.execPath,
    [resolve(import.meta.dirname, '../../../packages/plugins/tscircuit/check-vendored-licenses.mjs')],
    { stdio: 'inherit' },
  );
  const files = await buildLinuxAptPackages({
    appDirectory,
    ...(process.env['TAU_MANAGED_APPIMAGE']
      ? { appImagePath: await realpath(process.env['TAU_MANAGED_APPIMAGE']) }
      : {}),
    outputDirectory: resolve(
      process.env['TAU_DESKTOP_PACKAGE_OUTPUT_ROOT'] ?? join(import.meta.dirname, '../package-out/deb'),
    ),
    tag,
    sourceCommit,
    maintainer: required('TAU_LINUX_MAINTAINER'),
  });
  for (const file of files) {
    console.log(`Debian package: ${file}`);
  }
};
try {
  await main();
} catch (error) {
  console.error('Debian packaging failed:', error);
  process.exit(1);
}
