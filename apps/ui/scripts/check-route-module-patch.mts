#!/usr/bin/env node
/**
 * Route-module patch gate (React Router 8 migration RR8, ruling RD4): every client build ships React Router's
 * `loadRouteModule` with Tau's local patch (`tools/pnpm/patches/react-router@<version>.patch`, TAU-UI-S).
 *
 * When a route module fails to import, React Router reloads the current page. During a push navigation the URL still
 * names the page being left, so the user lands back where they started; the patch loads the destination instead. The
 * patch is kept locally, so every React Router bump re-keys it, and a patch that pnpm no longer applies (a renamed
 * build file, a changed hunk) would ship the original defect without a failing build. This check reads the built
 * client, where minification keeps the loader's log message and the property names the patch adds:
 * - the loader is found by its log text `Error loading route module`;
 * - the patched loader reads `__reactRouterDataRouter` and calls `location.assign(` before the build's next function.
 *
 * Usage (after the builds):
 *   node apps/ui/scripts/check-route-module-patch.mts apps/ui/build apps/ui/desktop/build apps/ui/serve/build
 *
 * Exit codes:
 *   0  Every named build's client holds exactly the patched loader
 *   1  A build holds no loader, an unpatched loader, or is missing
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/** The log line React Router's `loadRouteModule` prints before it reloads; minification keeps template text. */
export const loaderMarker = 'Error loading route module';
/** What the patched catch block reads and calls, both kept by minification (a global and a DOM method). */
export const patchMarkers = ['__reactRouterDataRouter', 'location.assign('] as const;
/** How far past the log text the patched catch block may reach in a minified or development build. */
const catchBlockWindow = 1500;

/**
 * Check one chunk's source: each `loadRouteModule` copy in it must carry the patch.
 *
 * @param source - A built JavaScript chunk.
 * @returns How many loaders the chunk holds and how many of them are unpatched.
 */
export const inspectChunk = (source: string): { loaders: number; unpatched: number } => {
  let loaders = 0;
  let unpatched = 0;
  for (let index = source.indexOf(loaderMarker); index !== -1; index = source.indexOf(loaderMarker, index + 1)) {
    loaders += 1;
    const start = index;
    const inCatchBlock = (marker: string): boolean => {
      const found = source.indexOf(marker, start);
      return found !== -1 && found < start + catchBlockWindow;
    };
    if (!patchMarkers.every((marker) => inCatchBlock(marker))) {
      unpatched += 1;
    }
  }
  return { loaders, unpatched };
};

const listChunks = (directory: string): string[] =>
  readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.[cm]?js$/u.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .toSorted();

/**
 * Check one build's client output.
 *
 * @param buildDirectory - A React Router build directory (holding `client/`).
 * @returns One message per problem; empty when the client holds the patched loader and no unpatched one.
 */
export const checkBuild = (buildDirectory: string): string[] => {
  const assets = join(buildDirectory, 'client', 'assets');
  if (!existsSync(assets)) {
    return [`${assets} is missing: run the build first`];
  }
  let loaders = 0;
  const problems: string[] = [];
  for (const chunk of listChunks(assets)) {
    const result = inspectChunk(readFileSync(chunk, 'utf8'));
    loaders += result.loaders;
    if (result.unpatched > 0) {
      problems.push(`${relative(process.cwd(), chunk)}: loadRouteModule without Tau's route-module patch`);
    }
  }
  if (loaders === 0) {
    problems.push(`${relative(process.cwd(), assets)}: no loadRouteModule found ('${loaderMarker}')`);
  }
  return problems;
};

const main = (): void => {
  const builds = process.argv.slice(2).map((path) => resolve(process.cwd(), path));
  if (builds.length === 0) {
    console.error('check-route-module-patch: name at least one build directory');
    process.exit(1);
  }
  const problems = builds.flatMap((build) => checkBuild(build));
  if (problems.length > 0) {
    console.error(`Route-module patch check failed (${problems.length}):`);
    for (const problem of problems) {
      console.error(`- ${problem}`);
    }
    console.error(
      'Re-key tools/pnpm/patches/react-router@<version>.patch to the installed React Router and reinstall.',
    );
    process.exit(1);
  }
  for (const build of builds) {
    console.info(`Route-module patch OK: ${relative(process.cwd(), join(build, 'client'))}`);
  }
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
