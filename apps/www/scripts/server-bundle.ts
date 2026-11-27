import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

/**
 * What the marketing site's server build must never hold (React Router 8 migration RR5, round-2 finding 10).
 *
 * The live hero (`src/live.ts`) and its scene (`src/scene.ts`) load three.js in the browser only, behind
 * `src/client.client.ts`. Under the Environment API build the server is one `build/server/index.js` (plus React
 * Router's empty `.client` stubs), so a graphics module reaching the server graph is inlined there instead of
 * appearing as a `live-*` or `scene-*` chunk: the check reads every server file's contents, not only its name.
 */
export type ServerBundleRule = 'source-map' | 'graphics-chunk' | 'graphics-module' | 'three';

export type ServerBundleViolation = Readonly<{ file: string; rule: ServerBundleRule; detail: string }>;

/** The browser-only graphics sources, as Rolldown names them in a `//#region` comment relative to `apps/www`. */
const graphicsModulePattern = /^\/\/#region (?:\.\.\/)*(?:apps\/www\/)?src\/(?:live|scene)\.ts$/mu;
/** A Rolldown region for any file of the `three` package. */
const threeRegionPattern = /^\/\/#region [^\n]*\/node_modules\/three\//mu;
/** Every three.js build, minified or not, registers itself under this global name. */
const threeMarker = '__THREE__';
/** A client-style graphics chunk name: `live-<hash>.js` or `scene-<hash>.js`. */
const graphicsChunkPattern = /(?:^|\/)(?:live|scene)-[\w-]+\.[cm]?js$/u;

/**
 * The server-bundle rules each file breaks.
 *
 * @param files - Every server output file, relative to `build/server` with `/` separators, and its text.
 * @returns The violations, in file order.
 */
export const findServerBundleViolations = (
  files: ReadonlyArray<Readonly<{ path: string; code: string }>>,
): ServerBundleViolation[] =>
  files.flatMap(({ path, code }) => {
    const violations: ServerBundleViolation[] = [];
    if (path.endsWith('.map')) {
      violations.push({ file: path, rule: 'source-map', detail: 'a source map' });
      return violations;
    }
    if (graphicsChunkPattern.test(path)) {
      violations.push({ file: path, rule: 'graphics-chunk', detail: 'a live or scene chunk' });
    }
    const graphicsModule = graphicsModulePattern.exec(code);
    if (graphicsModule) {
      violations.push({ file: path, rule: 'graphics-module', detail: graphicsModule[0] });
    }
    if (code.includes(threeMarker) || threeRegionPattern.test(code)) {
      violations.push({ file: path, rule: 'three', detail: 'three.js' });
    }
    return violations;
  });

/**
 * Read a server build and check it.
 *
 * @param serverDirectory - The `build/server` directory.
 * @returns The violations; throws when the directory has no `index.js`, so a missing build never passes.
 */
export const checkServerBundle = async (serverDirectory: string): Promise<ServerBundleViolation[]> => {
  const entries = await readdir(serverDirectory, { recursive: true, withFileTypes: true });
  const paths = entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(serverDirectory, resolve(entry.parentPath, entry.name)).split(sep).join('/'))
    .toSorted();
  if (!paths.includes('index.js')) {
    throw new Error(`${serverDirectory} has no index.js: run the www build first`);
  }
  const files = await Promise.all(
    paths.map(async (path) => ({ path, code: await readFile(resolve(serverDirectory, path), 'utf8') })),
  );
  return findServerBundleViolations(files);
};
