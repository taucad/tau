/**
 * Purpose: Upload the signed desktop's JavaScript maps before packaging its injected bundles.
 * Why: Native symbolication does not resolve bundled main-process JavaScript frames, and the
 * renderer's hidden client maps never ship, so neither side's frames map without an upload.
 * Environment: SENTRY_AUTH_TOKEN, built desktop and renderer output and the pinned workspace sentry-cli.
 * Usage: called by package-macos.mts for reporting-enabled releases, before ASAR/signing.
 * Exit codes: n/a; missing credentials or upload failure abort packaging.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, glob, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';

const requireAuthToken = (): void => {
  if (!process.env['SENTRY_AUTH_TOKEN']?.trim()) {
    throw new Error('SENTRY_AUTH_TOKEN is required for a reporting-enabled desktop release');
  }
};

const injectAndUpload = (cli: string, directory: string): void => {
  execFileSync(cli, ['sourcemaps', 'inject', directory], { stdio: 'inherit' });
  execFileSync(
    cli,
    ['sourcemaps', 'upload', '--validate', '--wait', '--org', 'taucad', '--project', 'tau-desktop', directory],
    { stdio: 'inherit' },
  );
};

/**
 * Inject only the staged copy, upload its matching maps, and keep source maps out of the package.
 * @param source - Pristine desktop build output (also used by the Nx cache).
 * @param staged - Package's private copy of that output.
 * @param cli - Pinned sentry-cli executable.
 */
export const uploadDesktopSourceMaps = async (source: string, staged: string, cli: string): Promise<void> => {
  requireAuthToken();
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
    injectAndUpload(cli, staged);
  } finally {
    await Promise.all(maps.map(async (map) => rm(resolve(staged, map), { force: true })));
  }
};

/**
 * Give the packaged renderer's compiled chunks debug ids and upload their hidden maps to tau-desktop.
 *
 * Only `assets/` chunks the build wrote a map for are touched: the PicoGK and C# hosts copy their files verbatim
 * under their own prefixes and check them against a manifest, so one appended byte breaks their loaders. The chunks
 * and maps are injected in a private directory, then the injected chunks replace the packaged copies; neither the
 * cached build output nor the package ever holds a map.
 * @param client - Pristine renderer client build (`apps/ui/desktop/build/client`, also used by the Nx cache).
 * @param packaged - The package's copy of that build, already stripped of maps.
 * @param cli - Pinned sentry-cli executable.
 */
export const uploadRendererSourceMaps = async (client: string, packaged: string, cli: string): Promise<void> => {
  requireAuthToken();
  const chunks: string[] = [];
  for await (const map of glob('assets/**/*.js.map', { cwd: client })) {
    const chunk = map.slice(0, -'.map'.length);
    if (existsSync(resolve(packaged, chunk))) {
      chunks.push(chunk);
    }
  }
  if (chunks.length === 0) {
    throw new Error('Desktop renderer source maps are missing');
  }
  const staged = await mkdtemp(join(tmpdir(), 'tau-renderer-maps-'));
  try {
    await Promise.all(
      chunks.map(async (chunk) => {
        await mkdir(dirname(resolve(staged, chunk)), { recursive: true });
        await Promise.all([
          cp(resolve(client, chunk), resolve(staged, chunk)),
          cp(resolve(client, `${chunk}.map`), resolve(staged, `${chunk}.map`)),
        ]);
      }),
    );
    injectAndUpload(cli, staged);
    await Promise.all(chunks.map(async (chunk) => cp(resolve(staged, chunk), resolve(packaged, chunk))));
  } finally {
    await rm(staged, { recursive: true, force: true });
  }
};
