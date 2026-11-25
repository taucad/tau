/**
 * The desktop build's id for agent observability (blueprint LW8): the 12-hex short commit of the tree the app was
 * packaged from. The release workflow checks out the release tag, so its commit is the tag's. A tree with no readable
 * commit records nothing, and its facts carry no build.
 *
 * The bundles never compile it in, so `desktop:build`'s Nx cache key holds sources and configuration only and a
 * rebuild of an unchanged tree is a cache hit (ST-9). Packaging (`scripts/runtime-stage.mts`) and the local launcher
 * (`scripts/run-electron-vite.mts`) write it beside the bundles as `dist/host-build.json`; main reads that file and
 * hands the id to the services utility as `TAU_DESKTOP_HOST_BUILD`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const commitPattern = /^[\da-f]{40}$/u;
const buildPattern = /^[\da-f]{12}$/u;

/** The file beside `dist/main` and `dist/preload` that records the build id. */
export const desktopHostBuildFileName = 'host-build.json';

/**
 * Resolve the build id to record.
 *
 * @param readCommit - Reads the checked-out commit; it may throw where there is no checkout or no git.
 * @returns The 12-hex short commit, or an empty string.
 */
export const desktopHostBuildOf = (readCommit: () => string | undefined): string => {
  let commit: string | undefined;
  try {
    commit = readCommit()?.trim().toLowerCase();
  } catch {
    return '';
  }
  return commit !== undefined && commitPattern.test(commit) ? commit.slice(0, 12) : '';
};

/**
 * Record the build id beside a `dist` tree's bundles.
 *
 * @param bundleDirectory - The `dist` directory that holds `main/` and `preload/`.
 * @param build - The 12-hex build id, or an empty string for none.
 */
export const writeDesktopHostBuild = (bundleDirectory: string, build: string): void => {
  writeFileSync(join(bundleDirectory, desktopHostBuildFileName), `${JSON.stringify({ build })}\n`);
};

/**
 * Read the build id recorded beside a `dist` tree's bundles.
 *
 * @param bundleDirectory - The `dist` directory that holds `main/` and `preload/`.
 * @returns The 12-hex build id, or an empty string when none was recorded.
 */
export const readDesktopHostBuild = (bundleDirectory: string): string => {
  let recorded: unknown;
  try {
    recorded = JSON.parse(readFileSync(join(bundleDirectory, desktopHostBuildFileName), 'utf8'));
  } catch {
    return '';
  }
  const build = typeof recorded === 'object' && recorded !== null && 'build' in recorded ? recorded.build : undefined;
  return typeof build === 'string' && buildPattern.test(build) ? build : '';
};
