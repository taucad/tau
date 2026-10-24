/**
 * The viewer page's Share pane link (viewer parity blueprint V10): the desktop's direct link, the shown entry's
 * project packed into the portable share ZIP `@taucad/project-core/share-artifact` makes, which the page turns into
 * the self-contained `/s/direct#v=2&zip=` link and seals under a password itself when asked. The files are the
 * runtime's source closure of the entry ({@link SourceSnapshotter}, the desktop's `snapshotSource`), as the desktop
 * collects them.
 */

import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

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
 * client, the seam the desktop's direct link collects through. A host without a runtime offers no direct link.
 */
export type SourceSnapshotter = (
  input: Readonly<{
    root: string;
    entryPath: string;
    additionalPaths: ReadonlyArray<Readonly<{ path: string; required: boolean }>>;
    signal?: AbortSignal | undefined;
  }>,
) => Promise<
  | Readonly<{
      entryPath: string;
      files: readonly SourceSnapshotFile[];
      unresolvedPaths: readonly string[];
    }>
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
  /** The runtime's source closure of the entry. */
  snapshotSource: SourceSnapshotter;
  signal?: AbortSignal | undefined;
}>;

const sha256Of = (content: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(content).digest('hex');

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

const failureOf = (error: unknown, fallback: string): TauMcpViewerFailure =>
  isShareError(error)
    ? failure(error.code, error.message)
    : failure('SHARE_FAILED', error instanceof Error ? error.message : fallback);

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
  input: DirectShareInput,
  manifest: ProjectManifest,
): Promise<
  | Readonly<{
      files: readonly ShareSnapshotFile[];
      warnings: readonly ShareSnapshotWarning[];
    }>
  | TauMcpViewerFailure
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
      .map((file) => ({
        ...file,
        role: file.role === 'additional' ? 'project-metadata' : file.role,
      })),
    warnings: result.unresolvedPaths.map((path) => ({
      code: 'UNRESOLVED_DEPENDENCY',
      message: `The runtime could not resolve ${path}.`,
    })),
  };
};

/**
 * Pack the shown entry's project for a direct link: the runtime's closure of the entry, then `tau.json` naming the
 * entry as main, and the entry's saved parameters, as the desktop's collector adds them.
 *
 * @param input - The project folder, the entry, the runtime closure, and optionally the origin and a signal.
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
    const collected = await closureFiles({ ...input, entryPath }, manifest);
    if ('errorCode' in collected) {
      return collected;
    }
    const manifestContent = serializeProjectManifest(manifest);
    const parametersPath = parameterEntryPath(entryPath);
    const parameterContent = await readRegularFile(join(input.root, ...parametersPath.split('/'))).catch(
      () => undefined,
    );
    const metadata: ShareSnapshotFile[] = [
      {
        path: 'tau.json',
        content: manifestContent,
        sha256: sha256Of(manifestContent),
        role: 'project-metadata',
      },
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
      closure: 'runtime',
      fileCount: packed.metrics.fileCount,
      uncompressedBytes: packed.metrics.uncompressedBytes,
      archiveBytes: packed.metrics.archiveBytes,
      warnings: snapshot.warnings,
    };
  } catch (error) {
    return failureOf(error, 'Tau could not pack this project for a direct link.');
  }
};
