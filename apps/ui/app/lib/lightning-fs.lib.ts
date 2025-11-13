import type { File } from '@taucad/types';
import { lightningFs } from '#db/storage.js';

/**
 * Get the directory path for a build in the virtual filesystem
 */
export function getBuildDirectory(buildId: string): string {
  return `/builds/${buildId}`;
}

/**
 * Write all build files to LightningFS
 */
export async function writeBuildToLightningFs(buildId: string, files: Record<string, File>): Promise<void> {
  if (!lightningFs) {
    throw new Error('LightningFS not initialized');
  }

  const fs = lightningFs;

  // Ensure /builds directory exists
  try {
    await fs.promises.mkdir('/builds');
  } catch {
    // Directory might already exist, ignore
  }

  // Ensure the specific build directory exists
  const buildDir = getBuildDirectory(buildId);
  try {
    await fs.promises.mkdir(buildDir);
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
      // If the error code is EEXIST, directory already exists, so just continue
      // (do nothing, fall through)
    } else {
      throw error;
    }
  }

  // Write all files to LightningFS
  for (const [path, fileData] of Object.entries(files)) {
    const directory = path.split('/').slice(0, -1).join('/');
    if (directory) {
      // Create directory path recursively
      const parts = directory.split('/');
      let currentPath = buildDir;

      for (const part of parts) {
        currentPath += `/${part}`;
        try {
          // eslint-disable-next-line no-await-in-loop -- need sequential directory creation
          await fs.promises.mkdir(currentPath);
        } catch {
          // Directory might already exist
        }
      }
    }

    // Write as binary data (Uint8Array)
    // eslint-disable-next-line no-await-in-loop -- need sequential file writing
    await fs.promises.writeFile(`${buildDir}/${path}`, fileData.content);
  }
}
