/**
 * Purpose: Upload the signed desktop's JavaScript maps before packaging its injected bundles.
 * Why: Native symbolication does not resolve bundled main-process JavaScript frames.
 * Environment: SENTRY_AUTH_TOKEN, built desktop output and the pinned workspace sentry-cli.
 * Usage: called by package-macos.mts for reporting-enabled releases, before ASAR/signing.
 * Exit codes: n/a; missing credentials or upload failure abort packaging.
 */
import { execFileSync } from 'node:child_process';
import { cp, glob, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

/**
 * Inject only the staged copy, upload its matching maps, and keep source maps out of the package.
 * @param source - Pristine desktop build output (also used by the Nx cache).
 * @param staged - Package's private copy of that output.
 * @param cli - Pinned sentry-cli executable.
 */
export const uploadDesktopSourceMaps = async (source: string, staged: string, cli: string): Promise<void> => {
  if (!process.env['SENTRY_AUTH_TOKEN']?.trim()) {
    throw new Error('SENTRY_AUTH_TOKEN is required for a reporting-enabled desktop release');
  }
  const maps: string[] = [];
  for await (const map of glob('**/*.map', { cwd: source })) {
    maps.push(map);
  }
  if (!maps.includes('main/index.js.map')) {
    throw new Error('Desktop main source map is missing');
  }
  try {
    await Promise.all(
      maps.map(async (map) => {
        const destination = resolve(staged, map);
        await mkdir(dirname(destination), { recursive: true });
        await cp(resolve(source, map), destination);
      }),
    );
    execFileSync(cli, ['sourcemaps', 'inject', staged], { stdio: 'inherit' });
    execFileSync(
      cli,
      ['sourcemaps', 'upload', '--validate', '--wait', '--org', 'taucad', '--project', 'tau-desktop', staged],
      { stdio: 'inherit' },
    );
  } finally {
    await Promise.all(maps.map(async (map) => rm(resolve(staged, map), { force: true })));
  }
};
