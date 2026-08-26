/**
 * Where the persistent evidence cache lives.
 *
 * Never the project filesystem. The project tree is writable by the system
 * under test, so an in-tree cache is a reward-hacking channel: a run could
 * "prove" a claim by planting its own evidence (Register C5). The root
 * therefore defaults outside any checkout and an override that resolves back
 * inside the working directory is rejected.
 *
 * @module
 */

import { homedir, tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

const isInside = (parent: string, child: string): boolean => child === parent || child.startsWith(parent + sep);

/**
 * Resolve the evidence-cache root for this process.
 *
 * @returns The absolute cache root, or `undefined` when explicitly disabled.
 * @public
 */
export const resolveGeoSpecCacheRoot = (
  options: {
    cache?: boolean;
    cacheDirectory?: string;
    projectPath?: string;
  } = {},
): string | undefined => {
  if (options.cache === false && options.cacheDirectory !== undefined) {
    throw new TypeError("GeoSpec cache options cannot combine 'cache: false' with 'cacheDirectory'.");
  }
  if (options.cache === false) {
    return undefined;
  }
  const home = homedir();
  const candidate =
    options.cacheDirectory === undefined
      ? join(home.length > 0 ? home : tmpdir(), '.cache', 'geospec', 'evidence')
      : resolve(options.cacheDirectory);
  const project = resolve(options.projectPath ?? process.cwd());
  if (isInside(project, candidate)) {
    throw new TypeError(
      `GeoSpec cacheDirectory must be outside the project root '${project}', received '${candidate}'.`,
    );
  }
  return candidate;
};
