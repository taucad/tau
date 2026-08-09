/**
 * GeoSpec's Node-side persistent cache root (R5 placement contract, A3).
 *
 * The root lives OUTSIDE the project filesystem — GeoSpec is a reward
 * function and the project tree is writable by the system under test, so an
 * in-tree cache would be a reward-hacking channel. Placement: the OS user
 * cache directory, keyed by a project-identity hash so distinct checkouts
 * never share entries. `GEOSPEC_CACHE_DIR` overrides the base for tests and
 * hermetic CI.
 *
 * Browser hosts do not import this module; their store is OPFS (also outside
 * the project filesystem) behind the same evidence-cache interface.
 */

import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';

const defaultCacheBase = (): string => {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Caches', 'tau-geospec');
  }
  if (process.platform === 'win32') {
    const localAppData = process.env['LOCALAPPDATA'];
    return join(localAppData ?? join(homedir(), 'AppData', 'Local'), 'tau-geospec');
  }
  const xdgCacheHome = process.env['XDG_CACHE_HOME'];
  return join(xdgCacheHome ?? join(homedir(), '.cache'), 'tau-geospec');
};

/**
 * Resolve the per-project GeoSpec cache root.
 *
 * @param projectPath - Absolute project root; hashed into the directory name.
 * @returns Absolute cache-root path outside the project tree.
 */
export const resolveGeoSpecCacheRoot = (projectPath: string): string => {
  const base = process.env['GEOSPEC_CACHE_DIR'] ?? defaultCacheBase();
  const projectKey = createHash('sha256').update(projectPath).digest('hex').slice(0, 16);
  return join(base, projectKey);
};
