import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const rootCaFilename = 'rootCA.pem';
const rootCaKeyFilename = 'rootCA-key.pem';

/**
 * Move the existing workspace-local CA identity without generating a second
 * trusted authority. Conflicting identities require explicit trust-store cleanup.
 */
export const migrateLegacyMkcertStorage = (legacyPath: string, savePath: string): boolean => {
  if (!existsSync(legacyPath)) {
    return false;
  }

  if (existsSync(savePath)) {
    const sameIdentity = [rootCaFilename, rootCaKeyFilename].every((fileName) => {
      const legacyFile = path.join(legacyPath, fileName);
      const persistentFile = path.join(savePath, fileName);
      return (
        existsSync(legacyFile) &&
        existsSync(persistentFile) &&
        readFileSync(legacyFile).equals(readFileSync(persistentFile))
      );
    });
    if (!sameIdentity) {
      throw new Error(
        `Conflicting mkcert identities exist at ${legacyPath} and ${savePath}. Uninstall the legacy CA before deleting it.`,
      );
    }

    rmSync(legacyPath, { recursive: true, force: true });
    return true;
  }

  mkdirSync(path.dirname(savePath), { recursive: true, mode: 0o700 });
  cpSync(legacyPath, savePath, { recursive: true, preserveTimestamps: true });
  chmodSync(savePath, 0o700);
  rmSync(legacyPath, { recursive: true, force: true });
  return true;
};

/** Keep mkcert-owned files writable by their owner before certificate regeneration. */
export const ensureMkcertStorageWritableForRegeneration = (savePath: string): void => {
  const entries = [
    { fileName: rootCaKeyFilename, mode: 0o600 },
    { fileName: rootCaFilename, mode: 0o644 },
    { fileName: 'dev.key', mode: 0o600 },
    { fileName: 'dev.pem', mode: 0o644 },
  ] as const;

  for (const { fileName, mode } of entries) {
    const absolutePath = path.join(savePath, fileName);
    if (existsSync(absolutePath)) {
      chmodSync(absolutePath, mode);
    }
  }
};
