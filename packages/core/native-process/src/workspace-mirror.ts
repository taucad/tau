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
  sync(filesystem: KernelFileSystem): Promise<readonly string[]>;
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
  const hashes = new Map<string, string>();
  const excludedDirectories = new Set([...defaultExcludedDirectories, ...(options.excludedDirectories ?? [])]);
  const excludedFileSuffixes = options.excludedFileSuffixes ?? [];

  const sync = async (filesystem: KernelFileSystem): Promise<readonly string[]> => {
    const files: Array<{ readonly path: string; readonly size: number }> = [];
    const folded = new Map<string, string>();
    let entryCount = 0;
    let totalBytes = 0;

    const visit = async (directory: string, depth: number): Promise<void> => {
      if (depth > maxDepth) {
        throw new Error(`${options.displayName} workspace exceeds ${String(maxDepth)} directory levels.`);
      }
      const names = await filesystem.readdir(directory);
      for (const name of names.toSorted()) {
        const path = assertRootedPath(joinRelativePath(directory, name));
        if (excludedPaths.has(path)) {
          continue;
        }
        const canonicalName = path.toLocaleLowerCase('en-US');
        const collision = folded.get(canonicalName);
        if (collision && collision !== path) {
          throw new Error(`${options.displayName} workspace has a case-colliding path: ${collision} and ${path}.`);
        }
        folded.set(canonicalName, path);
        const stat = await filesystem.lstat(path);
        if (stat.type === 'dir') {
          if (!excludedDirectories.has(name)) {
            await visit(path, depth + 1);
          }
          continue;
        }
        if (excludedFileSuffixes.some((suffix) => path.endsWith(suffix))) {
          continue;
        }
        entryCount += 1;
        totalBytes += stat.size;
        if (entryCount > maxEntries || stat.size > maxFileBytes || totalBytes > maxWorkspaceBytes) {
          throw new Error(`${options.displayName} workspace exceeds its mirror size limits.`);
        }
        files.push({ path, size: stat.size });
      }
    };

    await visit('', 0);
    for (const file of files) {
      const bytes = await filesystem.readFile(file.path);
      if (bytes.byteLength !== file.size) {
        throw new Error(`${options.displayName} workspace changed while mirroring: ${file.path}.`);
      }
      const hash = await sha256Bytes(bytes);
      if (hashes.get(file.path) === hash) {
        continue;
      }
      const destination = join(workspacePath, file.path);
      await mkdir(dirname(destination), { recursive: true });
      const temporary = `${destination}.tau-${randomUUID()}.tmp`;
      await writeFile(temporary, bytes, { mode: 0o600 });
      await rename(temporary, destination);
      hashes.set(file.path, hash);
    }
    const paths = files.map(({ path }) => path);
    const current = new Set(paths);
    for (const path of hashes.keys()) {
      if (!current.has(path)) {
        await rm(join(workspacePath, path), { force: true });
        hashes.delete(path);
      }
    }
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
