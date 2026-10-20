/**
 * The viewer page's Share pane link (viewer parity blueprint V10): the desktop's direct link, the shown entry's
 * project packed into the portable share ZIP `@taucad/project-core/share-artifact` makes, which the page turns into
 * the self-contained `/s/direct#v=2&zip=` link and seals under a password itself when asked. The files are the
 * runtime's source closure of the entry when the host wires one in ({@link SourceSnapshotter}, the seam the desktop's
 * `snapshotSource` uses); without it, every project file git does not ignore, under the portable-share caps.
 */

import { execFile } from 'node:child_process';
import { createHash, randomInt } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { basename, join, relative, sep } from 'node:path';

import type { TauMcpViewerFailure } from '@taucad/mcp';
import type { TauViewerDirectShare } from '@taucad/mcp/viewer-protocol';
import { parseProjectManifestBytes, projectToManifest, serializeProjectManifest } from '@taucad/project-core';
import { parameterEntryPath } from '@taucad/types';
import type { ProjectManifest } from '@taucad/project-core';
import { isSafePathSegment, shareArtifactCodec, shareArtifactLimits } from '@taucad/project-core/share-artifact';
import { isShareError } from '@taucad/project-core/share-error';
import type {
  ShareProjectSnapshot,
  ShareSnapshotFile,
  ShareSnapshotWarning,
} from '@taucad/project-core/share-snapshot';

/** Where the link opens when the server is not told otherwise: the Tau web app. */
export const defaultTauOrigin = 'https://tau.new';

/** Runs one git command in a folder: its trimmed standard output, or `undefined` when it fails. */
export type GitRunner = (cwd: string, args: readonly string[]) => Promise<string | undefined>;

/** Most a git command may print before it is treated as failed. */
const gitOutputLimit = 1024 * 1024;

/** How long one git command may take. */
const gitTimeout = 10_000;

const systemGit: GitRunner = async (cwd, args) =>
  new Promise((resolve) => {
    execFile(
      'git',
      [...args],
      {
        cwd,
        maxBuffer: gitOutputLimit,
        timeout: gitTimeout,
        windowsHide: true,
      },
      (error, stdout) => {
        resolve(error === null ? stdout.trim() : undefined);
      },
    );
  });

const failure = (errorCode: string, message: string): TauMcpViewerFailure => ({
  errorCode,
  message,
});

/** What the page's Share pane gets back for a direct link: the packed project. */
export type McpViewerDirectShare = TauViewerDirectShare;

/** One file of a runtime source closure, as `RuntimeClient.snapshotSource` answers it. */
export type SourceSnapshotFile = Readonly<{
  path: string;
  content: Uint8Array<ArrayBuffer>;
  sha256: string;
  role: 'entry' | 'kernel-dependency' | 'middleware-dependency' | 'additional';
}>;

/**
 * The runtime's source closure of one entry in one project: `RuntimeClient.snapshotSource` over the project's runtime
 * client, the seam the desktop's direct link collects through. A host without a runtime leaves it out.
 */
export type SourceSnapshotter = (
  input: Readonly<{
    root: string;
    entryPath: string;
    additionalPaths: ReadonlyArray<Readonly<{ path: string; required: boolean }>>;
    signal?: AbortSignal | undefined;
  }>,
) => Promise<
  | Readonly<{ entryPath: string; files: readonly SourceSnapshotFile[]; unresolvedPaths: readonly string[] }>
  | TauMcpViewerFailure
>;

/** What {@link createDirectShare} needs. */
export type DirectShareInput = Readonly<{
  /** The project folder of the shown model. */
  root: string;
  /** The entry the page shows, project-relative (`model.sourceFile ?? model.path`). */
  entryPath: string;
  /** The Tau web origin; {@link defaultTauOrigin} when absent. */
  origin?: string | undefined;
  /** The runtime's source closure; without it every project file git does not ignore is packed. */
  snapshotSource?: SourceSnapshotter | undefined;
  /** How git lists the project's files; the system `git` when absent. */
  git?: GitRunner | undefined;
  signal?: AbortSignal | undefined;
}>;

/**
 * Most a project-files snapshot reads before compressing. A direct link holds at most
 * {@link shareArtifactLimits.maxDirectUrlCharacters} characters, about 384 KiB of ZIP, so a project whose files pass
 * this is refused before it is read in full rather than compressed only to be refused.
 */
export const directShareFileBytesLimit = 16 * 1024 * 1024;

/** Folders a project-files snapshot never enters, as `browse_models` skips them. */
const skippedFolders = new Set(['node_modules', '.git', '.tau', 'dist', 'build', 'out', '.venv', '__pycache__']);

const sha256Of = (content: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(content).digest('hex');

const posixPath = (path: string): string => path.split(sep).join('/');

/** Whether a project-relative path may travel in a portable share (the archive refuses the rest). */
const isPortablePath = (path: string): boolean =>
  path
    .split('/')
    .every((segment) => segment !== '' && segment !== '.' && segment !== '..' && isSafePathSegment(segment));

/** Paths the snapshot writes itself or never carries, as the desktop's collector leaves them out. */
const isCollectorOwned = (path: string): boolean =>
  path === 'tau.json' || path === '.tau' || path.startsWith('.tau/') || path.startsWith('node_modules/');

const readRegularFile = async (absolutePath: string): Promise<Uint8Array<ArrayBuffer> | undefined> => {
  const stats = await lstat(absolutePath).catch(() => undefined);
  if (stats === undefined || !stats.isFile()) {
    return undefined;
  }
  return new Uint8Array(await readFile(absolutePath));
};

/** Every file under `root` outside {@link skippedFolders}, for a project git does not track. */
const walkProjectFiles = async (root: string, limit: number): Promise<readonly string[]> => {
  const found: string[] = [];
  const visit = async (folder: string): Promise<void> => {
    const entries = await readdir(folder, { withFileTypes: true }).catch(() => []);
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
      if (found.length > limit) {
        return;
      }
      const absolute = join(folder, entry.name);
      if (entry.isDirectory()) {
        if (!skippedFolders.has(entry.name)) {
          // oxlint-disable-next-line no-await-in-loop -- the walk stops at the entry limit, so it goes in order.
          await visit(absolute);
        }
      } else if (entry.isFile()) {
        found.push(posixPath(relative(root, absolute)));
      }
    }
  };
  await visit(root);
  return found;
};

/** The project's files as git sees them (tracked and untracked, not ignored), or the walk outside git. */
const listProjectFiles = async (root: string, git: GitRunner, limit: number): Promise<readonly string[]> => {
  const listed = await git(root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']);
  if (listed === undefined) {
    return walkProjectFiles(root, limit);
  }
  return [...new Set(listed.split('\0').filter((path) => path !== ''))].sort((left, right) =>
    left.localeCompare(right, 'en'),
  );
};

const failureOf = (error: unknown, fallback: string): TauMcpViewerFailure =>
  isShareError(error)
    ? failure(error.code, error.message)
    : failure('SHARE_FAILED', error instanceof Error ? error.message : fallback);

const randomProjectId = (): string => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return `proj_${Array.from({ length: 21 }, () => alphabet[randomInt(alphabet.length)]).join('')}`;
};

/**
 * The `tau.json` the link carries: the project's own, re-encoded with the shown entry as its main entry, as the
 * desktop re-encodes its project record; a folder without a valid one gets a fresh manifest named after it.
 */
const manifestFor = async (
  root: string,
  entryPath: string,
): Promise<Readonly<{ manifest: ProjectManifest; warning?: ShareSnapshotWarning }>> => {
  const bytes = await readRegularFile(join(root, 'tau.json')).catch(() => undefined);
  const parsed = bytes === undefined ? undefined : parseProjectManifestBytes(bytes);
  if (parsed?.success === true) {
    const { thumbnail } = parsed.data.assets.main;
    return {
      manifest: projectToManifest({
        ...parsed.data,
        assets: {
          main: {
            entryPath,
            ...(thumbnail !== undefined && parsed.data.assets.main.entryPath === entryPath ? { thumbnail } : {}),
          },
        },
      }),
    };
  }
  return {
    manifest: projectToManifest({
      id: randomProjectId(),
      name: basename(root).slice(0, 200),
      description: '',
      tags: [],
      assets: { main: { entryPath } },
    }),
    warning: {
      code: bytes === undefined ? 'MANIFEST_MISSING' : 'MANIFEST_INVALID',
      message:
        bytes === undefined
          ? 'This folder has no tau.json, so the link carries a new one.'
          : "This project's tau.json is not valid, so the link carries a new one.",
    },
  };
};

/** The entry's runtime closure, with the project's manifest, package.json, README and thumbnail beside it. */
const closureFiles = async (
  input: DirectShareInput & { snapshotSource: SourceSnapshotter },
  manifest: ProjectManifest,
): Promise<
  Readonly<{ files: readonly ShareSnapshotFile[]; warnings: readonly ShareSnapshotWarning[] }> | TauMcpViewerFailure
> => {
  const names = await readdir(input.root).catch(() => []);
  const readmePath = names.find((name) => name.toLocaleLowerCase('en-US') === 'readme.md');
  const { thumbnail } = manifest.assets.main;
  const result = await input.snapshotSource({
    root: input.root,
    entryPath: input.entryPath,
    additionalPaths: [
      { path: 'tau.json', required: false },
      { path: 'package.json', required: false },
      ...(readmePath === undefined ? [] : [{ path: readmePath, required: false }]),
      ...(thumbnail === undefined ? [] : [{ path: thumbnail, required: false }]),
    ],
    signal: input.signal,
  });
  if ('errorCode' in result) {
    return result;
  }
  return {
    files: result.files
      .filter(({ path }) => !isCollectorOwned(path))
      .map((file) => ({ ...file, role: file.role === 'additional' ? 'project-metadata' : file.role })),
    warnings: result.unresolvedPaths.map((path) => ({
      code: 'UNRESOLVED_DEPENDENCY',
      message: `The runtime could not resolve ${path}.`,
    })),
  };
};

/** Every project file git does not ignore, under the portable-share caps. */
const projectFiles = async (
  input: DirectShareInput,
): Promise<
  Readonly<{ files: readonly ShareSnapshotFile[]; warnings: readonly ShareSnapshotWarning[] }> | TauMcpViewerFailure
> => {
  /* Two slots stay free for the manifest and the parameter record the snapshot adds. */
  const fileLimit = shareArtifactLimits.maxEntries - 2;
  const listed = await listProjectFiles(input.root, input.git ?? systemGit, fileLimit);
  const paths = listed.filter((path) => !isCollectorOwned(path));
  const unsafe = paths.filter((path) => !isPortablePath(path));
  const portable = paths.filter((path) => isPortablePath(path));
  if (portable.length > fileLimit) {
    return failure(
      'SHARE_ARTIFACT_LIMIT',
      `This project has more than ${String(fileLimit)} files, too many for a direct link.`,
    );
  }
  const files: ShareSnapshotFile[] = [];
  let totalBytes = 0;
  for (const path of portable) {
    input.signal?.throwIfAborted();
    // oxlint-disable-next-line no-await-in-loop -- sequential reads stop at the byte cap before reading the next file.
    const content = await readRegularFile(join(input.root, ...path.split('/'))).catch(() => undefined);
    if (content === undefined) {
      continue;
    }
    totalBytes += content.byteLength;
    if (totalBytes > directShareFileBytesLimit) {
      return failure('SHARE_ARTIFACT_LIMIT', 'This project is too large for a direct link.');
    }
    files.push({
      path,
      content,
      sha256: sha256Of(content),
      role: path === input.entryPath ? 'entry' : 'project-metadata',
    });
  }
  if (!files.some(({ path }) => path === input.entryPath)) {
    return failure('NOT_FOUND', `${input.entryPath} is not a project file this link can carry.`);
  }
  return {
    files,
    warnings: unsafe.map((path) => ({
      code: 'UNPORTABLE_PATH',
      message: `${path} has a name a shared project cannot carry, so the link leaves it out.`,
    })),
  };
};

/**
 * Pack the shown entry's project for a direct link: the runtime's closure of the entry when the host wires one in,
 * otherwise every project file git does not ignore; then `tau.json` naming the entry as main, and the entry's saved
 * parameters, as the desktop's collector adds them.
 *
 * @param input - The project folder, the entry, and optionally the origin, the runtime closure, git and a signal.
 * @returns The packed project, or why it cannot travel in a link.
 */
export const createDirectShare = async (
  input: DirectShareInput,
): Promise<McpViewerDirectShare | TauMcpViewerFailure> => {
  const entryPath = input.entryPath.replace(/^\.?\/+/u, '');
  if (!isPortablePath(entryPath) || entryPath.startsWith('.tau/')) {
    return failure('SHARE_ARTIFACT_INVALID', `${input.entryPath} cannot be the entry of a shared project.`);
  }
  try {
    const { manifest, warning } = await manifestFor(input.root, entryPath);
    const collected =
      input.snapshotSource === undefined
        ? await projectFiles({ ...input, entryPath })
        : await closureFiles({ ...input, entryPath, snapshotSource: input.snapshotSource }, manifest);
    if ('errorCode' in collected) {
      return collected;
    }
    const manifestContent = serializeProjectManifest(manifest);
    const parametersPath = parameterEntryPath(entryPath);
    const parameterContent = await readRegularFile(join(input.root, ...parametersPath.split('/'))).catch(
      () => undefined,
    );
    const metadata: ShareSnapshotFile[] = [
      { path: 'tau.json', content: manifestContent, sha256: sha256Of(manifestContent), role: 'project-metadata' },
    ];
    if (parameterContent !== undefined) {
      metadata.push({
        path: parametersPath,
        content: parameterContent,
        sha256: sha256Of(parameterContent),
        role: 'project-metadata',
      });
    }
    const snapshot: ShareProjectSnapshot = {
      entryPath,
      files: [...collected.files, ...metadata],
      warnings: [...(warning === undefined ? [] : [warning]), ...collected.warnings],
    };
    const packed = await shareArtifactCodec.pack(snapshot, input.signal);
    /* Every direct link carries at least the encoded ZIP; one that cannot fit is refused here, not shipped to the page. */
    if (packed.encodedArchive.length >= shareArtifactLimits.maxDirectUrlCharacters) {
      return failure('SHARE_ARTIFACT_LIMIT', 'This project is too large for a direct URL.');
    }
    const { origin } = new URL(input.origin ?? defaultTauOrigin);
    return {
      kind: 'direct',
      origin,
      entryPath,
      encodedArchive: packed.encodedArchive,
      closure: input.snapshotSource === undefined ? 'project-files' : 'runtime',
      fileCount: packed.metrics.fileCount,
      uncompressedBytes: packed.metrics.uncompressedBytes,
      archiveBytes: packed.metrics.archiveBytes,
      warnings: snapshot.warnings,
    };
  } catch (error) {
    return failureOf(error, 'Tau could not pack this project for a direct link.');
  }
};
