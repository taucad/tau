/**
 * Owner-only, atomic file access for a Node host's pending-evidence queue (blueprint T11): the desktop services host
 * and the cloud host keep one queue file per project under a directory only their user can read.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { PendingFileSystem } from '#pending-stores.js';

/** A crash leaves the old queue or the new one, never half of either. @public */
export const ownerOnlyFiles: PendingFileSystem = {
  readFile: async (path) => {
    try {
      return await readFile(path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
  },
  replaceFile: async (path, contents) => {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const staged = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(staged, contents, { encoding: 'utf8', mode: 0o600 });
      await rename(staged, path);
    } catch (error) {
      await rm(staged, { force: true });
      throw error;
    }
  },
};
