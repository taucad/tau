import type { PublicationCollectFailureCode } from '@taucad/types/constants';
import { publicationApiCode, publishForbiddenPathPrefixes, isPublishableTauPath } from '@taucad/types/constants';

export const publishMaxFiles = 200;

/** Bytes */
export const publishMaxTotalBytes = 50 * 1024 * 1024;

/** Bytes */
export const publishMaxFileBytes = 25 * 1024 * 1024;

export function normalizePublishRelativePath(relativePath: string): string {
  return relativePath.replaceAll('\\', '/').replace(/^\.\/+/, '');
}

export function isForbiddenPublishRelativePath(relativePath: string): boolean {
  const normalized = normalizePublishRelativePath(relativePath);
  if (!normalized || normalized.startsWith('/') || normalized.includes('..')) {
    return true;
  }

  if (normalized === '.tau' || normalized.startsWith('.tau/')) {
    return !isPublishableTauPath(normalized);
  }

  return publishForbiddenPathPrefixes.some(
    (prefix) => normalized === prefix || normalized.startsWith(prefix) || normalized.includes(`/${prefix}`),
  );
}

export function validateCollectedPublishFiles(args: {
  files: Map<string, Uint8Array<ArrayBuffer>>;
  entryFile: string;
}): { ok: true } | { ok: false; reason: PublicationCollectFailureCode; path?: string } {
  const { files, entryFile } = args;

  if (!files.has(entryFile)) {
    return { ok: false, reason: publicationApiCode.MISSING_ENTRY_FILE };
  }

  if (files.size > publishMaxFiles) {
    return { ok: false, reason: publicationApiCode.TOO_MANY_FILES };
  }

  let total = 0;
  for (const [path, buf] of files) {
    if (buf.byteLength > publishMaxFileBytes) {
      return { ok: false, reason: publicationApiCode.FILE_TOO_LARGE, path };
    }

    total += buf.byteLength;
  }

  if (total > publishMaxTotalBytes) {
    return { ok: false, reason: publicationApiCode.PAYLOAD_TOO_LARGE };
  }

  return { ok: true };
}
