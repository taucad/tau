import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { defaultConfigDirectory } from '@taucad/host';
import { lock } from 'proper-lockfile';
import { cliError, exitCodes } from '#output.js';

/**
 * Serialize credential changes for one origin, including separate CLI processes.
 * @param origin - Selected API origin.
 * @param run - Credential mutation to serialize.
 * @returns The mutation result.
 */
export const withAuthLock = async <T>(origin: string, run: () => Promise<T>): Promise<T> => {
  const directory = join(defaultConfigDirectory(), 'auth');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, createHash('sha256').update(origin).digest('hex'));
  let release: () => Promise<void>;
  try {
    release = await lock(path, { realpath: false, retries: 0 });
  } catch {
    throw cliError(
      'AUTH_BUSY',
      'Another login or logout is in progress for this API. Let it finish and try again.',
      exitCodes.refused,
    );
  }
  try {
    return await run();
  } finally {
    await release();
  }
};
