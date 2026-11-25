/**
 * Move the server build's source maps aside so the deployed server bundle carries none.
 *
 * Copies `build/server` to `build/server-sourcemaps`, then deletes every `.map` file from
 * `build/server` and every other file from `build/server-sourcemaps`. `ui:sourcemaps` uploads
 * the aside copy. Runs after the client build, inside the existing build lock, in Node so the
 * build starts under cmd.exe as well as a POSIX shell.
 *
 * Usage: node apps/ui/scripts/split-server-sourcemaps.mts
 */
import { cpSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';

/** Delete the files under `directory` for which `remove` holds, leaving directories in place. */
const deleteFiles = (directory: string, remove: (name: string) => boolean): void => {
  for (const entry of readdirSync(directory, { recursive: true, withFileTypes: true })) {
    if (entry.isFile() && remove(entry.name)) {
      rmSync(join(entry.parentPath, entry.name));
    }
  }
};

/** Split `<buildDirectory>/server` into a map-free server bundle and a maps-only aside copy. */
export function splitServerSourcemaps(buildDirectory: string): void {
  const server = join(buildDirectory, 'server');
  const aside = join(buildDirectory, 'server-sourcemaps');
  rmSync(aside, { recursive: true, force: true });
  cpSync(server, aside, { recursive: true });
  deleteFiles(server, (name) => name.endsWith('.map'));
  deleteFiles(aside, (name) => !name.endsWith('.map'));
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  try {
    splitServerSourcemaps(resolve(import.meta.dirname, '../build'));
  } catch (error) {
    console.error('split-server-sourcemaps failed:', error);
    process.exit(1);
  }
}
