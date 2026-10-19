import JSZip from 'jszip';
import { parseProjectManifestBytes, serializeProjectManifest } from '@taucad/types';
import { convertLegacyProjectManifestBytes } from '@taucad/project-core';
import {
  assertDistinctPaths,
  createShareArchive,
  isSafePathSegment,
  openShareArchive,
  shareArtifactLimits,
} from '#artifact.js';
import type { ShareOpenedArtifact, ShareOpenedFile } from '#artifact.js';
import { ShareError } from '#provider.js';

type ZipEntryInternal = JSZip.JSZipObject & {
  readonly unsafeOriginalName?: string;
  readonly _data?: { readonly compressedSize?: number; readonly uncompressedSize?: number };
};

/** Bounds one provider repository archive must fit before its files are selected. @public */
export type RepositoryArchiveLimits = {
  /** Compressed archive bytes as downloaded from the provider. */
  readonly maxArchiveBytes: number;
  /** ZIP entries in the whole archive, directories included. */
  readonly maxEntries: number;
  /** Files selected under the requested root. */
  readonly maxFiles: number;
  /** Expanded bytes of one selected file. */
  readonly maxEntryBytes: number;
  /** Expanded bytes of every selected file together. */
  readonly maxTotalBytes: number;
  /** Expanded-to-compressed ratio one selected file may declare or reach. */
  readonly maxCompressionRatio: number;
  /** UTF-8 bytes of one archive path, provider root included. */
  readonly maxPathBytes: number;
};

/**
 * Limits for copying a public repository into a person's own project. Import is
 * bounded by the resources it uses (download, browser memory, local storage),
 * not by what a share link can carry, so these are separate from
 * `shareArtifactLimits`. The aggregate expanded-byte bound is what stops an
 * archive bomb; the per-file ratio only refuses pathological single entries.
 * @public
 */
export const repositoryImportLimits: RepositoryArchiveLimits = {
  maxArchiveBytes: 256 * 1024 * 1024,
  maxEntries: 100_000,
  maxFiles: 100_000,
  maxEntryBytes: 25 * 1024 * 1024,
  maxTotalBytes: 512 * 1024 * 1024,
  maxCompressionRatio: 1000,
  maxPathBytes: shareArtifactLimits.maxPathBytes * 2,
};

/** A repository share is a portable project, so its archive keeps the share artifact bounds. */
const repositoryShareLimits: RepositoryArchiveLimits = {
  maxArchiveBytes: shareArtifactLimits.maxArchiveBytes,
  maxEntries: shareArtifactLimits.maxEntries * 3,
  maxFiles: shareArtifactLimits.maxEntries,
  maxEntryBytes: shareArtifactLimits.maxEntryBytes,
  maxTotalBytes: shareArtifactLimits.maxTotalBytes,
  maxCompressionRatio: shareArtifactLimits.maxCompressionRatio,
  maxPathBytes: shareArtifactLimits.maxPathBytes * 2,
};

const failInvalid = (message: string, cause?: unknown): never => {
  throw new ShareError('SHARE_ARTIFACT_INVALID', message, cause === undefined ? undefined : { cause });
};

const failLimit = (message: string): never => {
  throw new ShareError('SHARE_ARTIFACT_LIMIT', message);
};

const isSymlink = (permissions: unknown): boolean => {
  const mode = typeof permissions === 'string' ? Number.parseInt(permissions, 8) : permissions;
  // oxlint-disable-next-line no-bitwise -- POSIX file-type bits identify symlinks.
  return typeof mode === 'number' && (mode & 0o17_0000) === 0o12_0000;
};

const validateArchivePath = (rawPath: string, limits: RepositoryArchiveLimits): string => {
  const path = rawPath.endsWith('/') ? rawPath.slice(0, -1) : rawPath;
  if (
    path.length === 0 ||
    path.startsWith('/') ||
    path.startsWith('\\') ||
    path.includes('\\') ||
    /^[A-Za-z]:/u.test(path) ||
    path
      .split('/')
      .some((segment) => segment.length === 0 || segment === '.' || segment === '..' || !isSafePathSegment(segment))
  ) {
    return failInvalid('The repository archive contains an unsafe path.');
  }
  if (new TextEncoder().encode(path).byteLength > limits.maxPathBytes) {
    return failLimit('A repository archive path is too long.');
  }
  return path;
};

const loadRepositoryZip = async (
  archive: Uint8Array<ArrayBuffer>,
  limits: RepositoryArchiveLimits,
): Promise<readonly ZipEntryInternal[]> => {
  if (archive.byteLength === 0 || archive.byteLength > limits.maxArchiveBytes) {
    failLimit('The repository archive exceeds the compressed-size limit.');
  }
  let zip: JSZip;
  try {
    const loadOptions: JSZip.JSZipLoadOptions = { createFolders: false };
    loadOptions.checkCRC32 = true;
    zip = await JSZip.loadAsync(archive, loadOptions);
  } catch (error) {
    return failInvalid('The repository archive is invalid.', error);
  }
  const entries = Object.values(zip.files) as ZipEntryInternal[];
  if (entries.length === 0 || entries.length > limits.maxEntries) {
    failLimit('The repository archive contains too many entries.');
  }
  for (const entry of entries) {
    validateArchivePath(entry.unsafeOriginalName ?? entry.name, limits);
    if (isSymlink(entry.unixPermissions)) {
      failInvalid('The repository archive contains a symbolic link.');
    }
  }
  return entries;
};

const exceedsRatio = (expandedBytes: number, compressedBytes: number, limits: RepositoryArchiveLimits): boolean =>
  expandedBytes > 0 && expandedBytes / Math.max(compressedBytes, 1) > limits.maxCompressionRatio;

/** Strip the verified provider root, select one subtree and expand it under `limits`. */
const selectRepositoryFiles = async (
  archive: Uint8Array<ArrayBuffer>,
  options: { readonly root: string; readonly limits: RepositoryArchiveLimits },
): Promise<readonly ShareOpenedFile[]> => {
  const { limits } = options;
  const entries = await loadRepositoryZip(archive, limits);
  const roots = new Set(
    entries.map((entry) => validateArchivePath(entry.unsafeOriginalName ?? entry.name, limits).split('/')[0]),
  );
  if (roots.size !== 1) {
    failInvalid('The repository archive does not have one verified root directory.');
  }
  const archiveRoot = [...roots][0]!;
  const projectPrefix = options.root ? `${archiveRoot}/${options.root}/` : `${archiveRoot}/`;
  const selected = entries.filter((entry) => {
    const path = validateArchivePath(entry.unsafeOriginalName ?? entry.name, limits);
    return !entry.dir && path.startsWith(projectPrefix) && path.length > projectPrefix.length;
  });
  if (selected.length === 0) {
    failInvalid('The requested project root does not exist in the repository archive.');
  }
  if (selected.length > limits.maxFiles) {
    failLimit('The repository project contains too many files.');
  }

  let totalBytes = 0;
  const files: ShareOpenedFile[] = [];
  for (const entry of selected.sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
    const uncompressedBytes = entry._data?.uncompressedSize;
    const compressedBytes = entry._data?.compressedSize;
    if (uncompressedBytes !== undefined && uncompressedBytes > limits.maxEntryBytes) {
      failLimit('A repository project file exceeds the per-file size limit.');
    }
    if (
      uncompressedBytes !== undefined &&
      compressedBytes !== undefined &&
      exceedsRatio(uncompressedBytes, compressedBytes, limits)
    ) {
      failLimit('The repository archive exceeds the compression-ratio limit.');
    }
    if (uncompressedBytes !== undefined && totalBytes + uncompressedBytes > limits.maxTotalBytes) {
      failLimit('The repository project exceeds the expanded-size limit.');
    }
    let content: Uint8Array<ArrayBuffer>;
    try {
      // oxlint-disable-next-line no-await-in-loop -- sequential expansion enforces aggregate limits before the next entry.
      content = new Uint8Array(await entry.async('uint8array'));
    } catch (error) {
      return failInvalid('A repository archive entry is invalid.', error);
    }
    if (content.byteLength > limits.maxEntryBytes) {
      failLimit('A repository project file exceeds the per-file size limit.');
    }
    totalBytes += content.byteLength;
    if (totalBytes > limits.maxTotalBytes) {
      failLimit('The repository project exceeds the expanded-size limit.');
    }
    const rawPath = validateArchivePath(entry.unsafeOriginalName ?? entry.name, limits);
    files.push({ path: rawPath.slice(projectPrefix.length), content });
  }
  assertDistinctPaths(files.map(({ path }) => path));
  return files;
};

/**
 * Safely extract one subtree of a provider repository ZIP for import into a
 * person's own project, under {@link repositoryImportLimits}. No manifest is
 * required, and the files are not re-packed as a share artifact.
 *
 * @param archive - The provider's repository ZIP, with one root directory.
 * @param options - `root` is the subtree to import, relative to the repository root; `''` imports everything.
 * @returns The selected files with paths relative to `root`.
 * @throws {ShareError} `SHARE_ARTIFACT_LIMIT` past a limit, `SHARE_ARTIFACT_INVALID` for unsafe or missing content.
 * @public
 */
export const extractRepositoryImportFiles = async (
  archive: Uint8Array<ArrayBuffer>,
  options: { readonly root: string },
): Promise<readonly ShareOpenedFile[]> =>
  selectRepositoryFiles(archive, { root: options.root, limits: repositoryImportLimits });

/**
 * Normalize a repository subtree to the canonical validated portable artifact.
 *
 * @param archive - The provider's repository ZIP, with one root directory.
 * @param root - The project subtree holding `tau.json`, relative to the repository root.
 * @returns The opened canonical share artifact.
 * @throws {ShareError} When the subtree is not a valid portable project within share limits.
 * @public
 */
export const normalizeRepositoryArchive = async (
  archive: Uint8Array<ArrayBuffer>,
  root: string,
): Promise<ShareOpenedArtifact> => {
  const files = await selectRepositoryFiles(archive, { root, limits: repositoryShareLimits });
  const manifestFile = files.find(({ path }) => path === 'tau.json');
  if (!manifestFile) {
    return failInvalid('The repository project does not contain a root tau.json.');
  }
  const parsed = parseProjectManifestBytes(manifestFile.content);
  const legacy = parsed.success ? undefined : convertLegacyProjectManifestBytes(manifestFile.content);
  const manifest = parsed.success ? parsed.data : legacy?.success ? legacy.data.manifest : undefined;
  if (!manifest) {
    return failInvalid('The repository project manifest is invalid.');
  }
  const { entryPath } = manifest.assets.main;
  if (!files.some(({ path }) => path === entryPath)) {
    failInvalid('The repository project entry file does not exist.');
  }
  const normalized = await createShareArchive({
    entryPath,
    files: files.map((file) => ({
      ...file,
      content: file.path === 'tau.json' ? serializeProjectManifest(manifest) : file.content,
      sha256: '',
      role: file.path === entryPath ? 'entry' : 'project-metadata',
    })),
    warnings: [],
  });
  return openShareArchive(normalized);
};
