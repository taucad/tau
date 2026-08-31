import JSZip from 'jszip';
import { parseProjectManifestBytes } from '@taucad/types';
import { createShareArchive, openShareArchive, shareArtifactLimits } from '#artifact.js';
import type { ShareOpenedArtifact, ShareOpenedFile } from '#artifact.js';
import { ShareError } from '#provider.js';

type ZipEntryInternal = JSZip.JSZipObject & {
  readonly unsafeOriginalName?: string;
  readonly _data?: { readonly compressedSize?: number; readonly uncompressedSize?: number };
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

const validateArchivePath = (rawPath: string): string => {
  const path = rawPath.endsWith('/') ? rawPath.slice(0, -1) : rawPath;
  if (
    path.length === 0 ||
    path.startsWith('/') ||
    path.startsWith('\\') ||
    path.includes('\\') ||
    /^[A-Za-z]:/u.test(path) ||
    path.split('/').some((segment) => segment.length === 0 || segment === '.' || segment === '..')
  ) {
    return failInvalid('The repository archive contains an unsafe path.');
  }
  if (new TextEncoder().encode(path).byteLength > shareArtifactLimits.maxPathBytes * 2) {
    return failLimit('A repository archive path exceeds the portable-share limit.');
  }
  return path;
};

const loadRepositoryZip = async (archive: Uint8Array<ArrayBuffer>): Promise<readonly ZipEntryInternal[]> => {
  if (archive.byteLength === 0 || archive.byteLength > shareArtifactLimits.maxArchiveBytes) {
    failLimit('The repository archive exceeds the compressed portable-share limit.');
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
  if (entries.length === 0 || entries.length > shareArtifactLimits.maxEntries * 3) {
    failLimit('The repository archive contains too many entries.');
  }
  for (const entry of entries) {
    validateArchivePath(entry.unsafeOriginalName ?? entry.name);
    if (isSymlink(entry.unixPermissions)) {
      failInvalid('The repository archive contains a symbolic link.');
    }
  }
  return entries;
};

/** Safely extract one selected project subtree from a provider repository ZIP. @public */
export const extractRepositoryArchiveFiles = async (
  archive: Uint8Array<ArrayBuffer>,
  options: { readonly root: string; readonly requireManifest: boolean },
): Promise<readonly ShareOpenedFile[]> => {
  const entries = await loadRepositoryZip(archive);
  const roots = new Set(
    entries.map((entry) => validateArchivePath(entry.unsafeOriginalName ?? entry.name).split('/')[0]),
  );
  if (roots.size !== 1) {
    failInvalid('The repository archive does not have one verified root directory.');
  }
  const archiveRoot = [...roots][0]!;
  const projectPrefix = options.root ? `${archiveRoot}/${options.root}/` : `${archiveRoot}/`;
  const selected = entries.filter((entry) => {
    const path = validateArchivePath(entry.unsafeOriginalName ?? entry.name);
    return !entry.dir && path.startsWith(projectPrefix) && path.length > projectPrefix.length;
  });
  if (selected.length === 0) {
    failInvalid('The requested project root does not exist in the repository archive.');
  }
  if (selected.length > shareArtifactLimits.maxEntries) {
    failLimit('The repository project contains too many files.');
  }

  let totalBytes = 0;
  const files: ShareOpenedFile[] = [];
  for (const entry of selected.sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
    const uncompressedBytes = entry._data?.uncompressedSize;
    const compressedBytes = entry._data?.compressedSize;
    if (uncompressedBytes !== undefined && uncompressedBytes > shareArtifactLimits.maxEntryBytes) {
      failLimit('A repository project file exceeds the portable-share limit.');
    }
    if (
      uncompressedBytes !== undefined &&
      compressedBytes !== undefined &&
      uncompressedBytes > 0 &&
      uncompressedBytes / Math.max(compressedBytes, 1) > shareArtifactLimits.maxCompressionRatio
    ) {
      failLimit('The repository archive exceeds the compression-ratio limit.');
    }
    let content: Uint8Array<ArrayBuffer>;
    try {
      // oxlint-disable-next-line no-await-in-loop -- sequential expansion enforces aggregate limits before the next entry.
      content = new Uint8Array(await entry.async('uint8array'));
    } catch (error) {
      return failInvalid('A repository archive entry is invalid.', error);
    }
    if (content.byteLength > shareArtifactLimits.maxEntryBytes) {
      failLimit('A repository project file exceeds the portable-share limit.');
    }
    totalBytes += content.byteLength;
    if (totalBytes > shareArtifactLimits.maxTotalBytes) {
      failLimit('The repository project exceeds the expanded portable-share limit.');
    }
    const rawPath = validateArchivePath(entry.unsafeOriginalName ?? entry.name);
    files.push({ path: rawPath.slice(projectPrefix.length), content: new Uint8Array(content) });
  }

  const manifestFile = files.find(({ path }) => path === 'tau.json');
  let entryPath = files[0]!.path;
  if (options.requireManifest) {
    const parsed = manifestFile
      ? parseProjectManifestBytes(manifestFile.content)
      : failInvalid('The repository project does not contain a root tau.json.');
    if (!parsed.success) {
      return failInvalid('The repository project manifest is invalid.');
    }
    entryPath = parsed.data.assets.main.entryPath;
    if (!files.some(({ path }) => path === entryPath)) {
      failInvalid('The repository project entry file does not exist.');
    }
  }

  await createShareArchive({
    entryPath,
    files: files.map((file) => ({ ...file, sha256: '', role: file.path === entryPath ? 'entry' : 'project-metadata' })),
    warnings: [],
  });
  return files;
};

/** Normalize a repository subtree to the canonical validated portable artifact. @public */
export const normalizeRepositoryArchive = async (
  archive: Uint8Array<ArrayBuffer>,
  root: string,
): Promise<ShareOpenedArtifact> => {
  const files = await extractRepositoryArchiveFiles(archive, { root, requireManifest: true });
  const manifest = parseProjectManifestBytes(files.find(({ path }) => path === 'tau.json')!.content);
  if (!manifest.success) {
    return failInvalid('The repository project manifest is invalid.');
  }
  const normalized = await createShareArchive({
    entryPath: manifest.data.assets.main.entryPath,
    files: files.map((file) => ({
      ...file,
      sha256: '',
      role: file.path === manifest.data.assets.main.entryPath ? 'entry' : 'project-metadata',
    })),
    warnings: [],
  });
  return openShareArchive(normalized);
};
