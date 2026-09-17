/* oxlint-disable no-await-in-loop -- serialized I/O bounds memory and closes stat/read/write races. */
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { mkdtemp, mkdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { assertRootedPath, joinRelativePath, sha256Bytes } from '@taucad/runtime/kernel';
import type { KernelFileSystem } from '@taucad/runtime/kernel';

const maxDepth = 32;
const maxEntries = 10_000;
const maxFileBytes = 32 * 1024 * 1024;
const maxWorkspaceBytes = 512 * 1024 * 1024;
const defaultExcludedDirectories = ['.git', '.hg', '.svn', '.tau', 'node_modules'];
const encoder = new TextEncoder();

/** Configuration for one bounded native workspace projection. @public */
export type WorkspaceMirrorOptions = {
  readonly temporaryPrefix: string;
  readonly displayName: string;
  readonly excludedDirectories?: readonly string[];
  readonly excludedFileSuffixes?: readonly string[];
  /** Exact workspace-relative paths excluded before metadata or content reads. */
  readonly excludedPaths?: readonly string[];
};

/** Private physical projection owned by one native kernel context. @public */
export type WorkspaceMirror = {
  readonly rootPath: string;
  readonly workspacePath: string;
  readonly artifactPath: string;
  /**
   * Project the rooted filesystem into the mirror and return the mirrored paths.
   *
   * `contents` is the runtime's own file-content cache (`KernelRuntime.fileContentCache`). Bytes the
   * runtime already read for this operation are taken from it instead of being read again, which also
   * keeps the mirror byte-identical to what the render was computed from. A cached entry whose length
   * disagrees with the stat is ignored and the file is read.
   */
  sync(
    filesystem: KernelFileSystem,
    contents?: ReadonlyMap<string, Uint8Array<ArrayBuffer> | string>,
  ): Promise<readonly string[]>;
  cleanup(): Promise<void>;
};

/** Create a bounded, disposable physical projection of Tau's rooted filesystem. @public */
export const createWorkspaceMirror = async (options: WorkspaceMirrorOptions): Promise<WorkspaceMirror> => {
  const excludedPaths = new Set((options.excludedPaths ?? []).map((path) => assertRootedPath(path)));
  const temporaryRoot = await mkdtemp(join(tmpdir(), options.temporaryPrefix));
  const rootPath = await realpath(temporaryRoot);
  const workspacePath = join(rootPath, 'workspace');
  const artifactPath = join(rootPath, 'artifacts');
  await Promise.all([mkdir(workspacePath), mkdir(artifactPath)]);
  const cleanupRoot = (): void => {
    rmSync(rootPath, { force: true, recursive: true });
  };
  const exitAfterCleanup = process.exit.bind(process, 0);
  process.once('exit', cleanupRoot);
  process.once('SIGINT', exitAfterCleanup);
  process.once('SIGTERM', exitAfterCleanup);
  /** Mirrored file to the stat it was mirrored from and the hash of the bytes written. */
  const mirrored = new Map<string, { size: number; mtimeMs: number; hash: string }>();
  /* D6's racily-clean rule: a stat is only trusted once it is older than the sync that recorded it.
   * A file modified within the same millisecond as its own mirroring, keeping its size, is
   * indistinguishable by stat alone, so it is re-read until its mtime falls behind a completed sync. */
  /** Milliseconds. When the previous completed sync began reading. */
  let previousSyncStarted = Number.NEGATIVE_INFINITY;
  const excludedDirectories = new Set([...defaultExcludedDirectories, ...(options.excludedDirectories ?? [])]);
  const excludedFileSuffixes = options.excludedFileSuffixes ?? [];

  const sync = async (
    filesystem: KernelFileSystem,
    contents?: ReadonlyMap<string, Uint8Array<ArrayBuffer> | string>,
  ): Promise<readonly string[]> => {
    const started = Date.now();
    const files: Array<{ readonly path: string; readonly size: number; readonly mtimeMs: number }> = [];
    const folded = new Map<string, string>();
    let entryCount = 0;
    let totalBytes = 0;

    const visit = async (directory: string, depth: number): Promise<void> => {
      if (depth > maxDepth) {
        throw new Error(`${options.displayName} workspace exceeds ${String(maxDepth)} directory levels.`);
      }
      // One listing carries every child's stat, so a directory costs one call rather than 1 + N.
      const listing = await filesystem.readdirStat(directory);
      for (const entry of listing.toSorted((left, right) => (left.name < right.name ? -1 : 1))) {
        const path = assertRootedPath(joinRelativePath(directory, entry.name));
        if (excludedPaths.has(path)) {
          continue;
        }
        const canonicalName = path.toLocaleLowerCase('en-US');
        const collision = folded.get(canonicalName);
        if (collision && collision !== path) {
          throw new Error(`${options.displayName} workspace has a case-colliding path: ${collision} and ${path}.`);
        }
        folded.set(canonicalName, path);
        if (entry.type === 'dir') {
          if (!excludedDirectories.has(entry.name)) {
            await visit(path, depth + 1);
          }
          continue;
        }
        if (excludedFileSuffixes.some((suffix) => path.endsWith(suffix))) {
          continue;
        }
        entryCount += 1;
        totalBytes += entry.size;
        if (entryCount > maxEntries || entry.size > maxFileBytes || totalBytes > maxWorkspaceBytes) {
          throw new Error(`${options.displayName} workspace exceeds its mirror size limits.`);
        }
        files.push({ path, size: entry.size, mtimeMs: entry.mtimeMs });
      }
    };

    await visit('', 0);
    for (const file of files) {
      const previous = mirrored.get(file.path);
      if (
        previous !== undefined &&
        previous.size === file.size &&
        previous.mtimeMs === file.mtimeMs &&
        previous.mtimeMs < previousSyncStarted
      ) {
        continue;
      }
      const seeded = contents?.get(file.path);
      const cached = typeof seeded === 'string' ? encoder.encode(seeded) : seeded;
      const bytes = cached?.byteLength === file.size ? cached : await filesystem.readFile(file.path);
      if (bytes.byteLength !== file.size) {
        throw new Error(`${options.displayName} workspace changed while mirroring: ${file.path}.`);
      }
      const hash = await sha256Bytes(bytes);
      if (previous?.hash !== hash) {
        const destination = join(workspacePath, file.path);
        await mkdir(dirname(destination), { recursive: true });
        const temporary = `${destination}.tau-${randomUUID()}.tmp`;
        await writeFile(temporary, bytes, { mode: 0o600 });
        await rename(temporary, destination);
      }
      mirrored.set(file.path, { size: file.size, mtimeMs: file.mtimeMs, hash });
    }
    const paths = files.map(({ path }) => path);
    const current = new Set(paths);
    for (const path of mirrored.keys()) {
      if (!current.has(path)) {
        await rm(join(workspacePath, path), { force: true });
        mirrored.delete(path);
      }
    }
    previousSyncStarted = started;
    return paths.sort();
  };

  return {
    rootPath,
    workspacePath,
    artifactPath,
    sync,
    cleanup: async () => {
      process.off('exit', cleanupRoot);
      process.off('SIGINT', exitAfterCleanup);
      process.off('SIGTERM', exitAfterCleanup);
      cleanupRoot();
    },
  };
};
/* oxlint-enable no-await-in-loop */
