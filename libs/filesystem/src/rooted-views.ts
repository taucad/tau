/**
 * Rooted views: one captured mount, issued as an ordinary filesystem (authority Rule 15).
 *
 * Extracted from `WorkspaceFileService` unchanged. `create` resolves its
 * argument to one *exact* mount, captures that entry, and returns the full
 * read/write/watch surface rebased to the root-relative namespace — so runtime,
 * agent and UI code operate inside an already-selected checkout without ever
 * spelling an authority-global path (Rule 4).
 *
 * Two rules make it a boundary rather than a convenience:
 *
 * - **Confinement.** Every public path goes through `resolveLocal`, which
 *   canonicalises it and joins it under the captured mount's provider base. A
 *   view never falls through to a broader mount, and the root itself cannot be
 *   renamed or removed.
 * - **Staleness.** A mount replacement invalidates the captured view instead of
 *   retargeting it: `assertCurrent` throws `ESTALE`, and a live watch stops and
 *   reports one `reset` rather than delivering another route's events.
 *
 * It is unmasked on purpose. The mask belongs to `composeView` above it, which
 * is also where the consumer-facing porcelain refuses a hidden path before any
 * provider I/O (charter D4, authority Rule 16).
 *
 * @module
 */

import type { CheckedFileWrite, CheckedFileWriteResult, FileStat, FileStatEntry } from '@taucad/types';
import { assertRootedPath, joinRelativePath, resolveAuthorityPath } from '@taucad/utils/path';
import type {
  DirectoryEntry,
  FileReadStreamOptions,
  FileSystemProvider,
  MkdirOptions,
  WatchEvent,
  WatchRequest,
  WorkspaceMutationContext,
} from '#types.js';
import type { MountResolution, MountTable } from '#mount-table.js';
import type { TreeIndex, TreeIndexAdmits, TreeSearchOptions } from '#tree-index.js';
import type { WalkOptions } from '#content-ops/walk.js';
import { preflightCreate, preflightDelete, preflightMove } from '#mutation-pipeline.js';
import type { BulkMoveEdit, BulkMoveResult, MutationPipeline } from '#mutation-pipeline.js';
import type { WatchRegistry } from '#watch-registry.js';
import { RootedFileSystemError, WorkspaceMutationError } from '#workspace-errors.js';
import { bufferToStream, validateFileReadStreamOptions } from '#backend/stream-utils.js';
import { getEventOrigin } from '#event-origin-registry.js';

/**
 * The mutating porcelain a rooted view serves (charter D4).
 *
 * Batch operations, not sugar over N port writes: each one runs in the mutation
 * pipeline with today's semantics (authority Rule 5a) — a copy takes one lock
 * set and emits one summary event; a batch write settles per file and drops
 * only the rejected paths' derivatives — and is confined to the captured mount.
 *
 * Unmasked here, like every other rooted primitive. `composeView` mirrors this
 * surface and is where a hidden operand is refused before provider I/O and
 * where a copy inherits the consumer's mask as its entry filter (Rule 16).
 *
 * @public
 */
export type RootedPorcelain = {
  /** Recursively copy one subtree of this root onto another. */
  copyTree(source: string, target: string, options?: { admits?: WalkOptions['admits'] }): Promise<void>;
  /** Copy one file of this root to a new path. */
  duplicate(source: string, target: string): Promise<void>;
  /** Move one path of this root, answering with the resulting stat. */
  move(source: string, target: string): Promise<FileStat>;
  /** Move many paths sequentially, reporting each completed and failed edit. */
  bulkMove(edits: readonly BulkMoveEdit[]): Promise<BulkMoveResult>;
  /** Write many files of this root as one batch. */
  writeFiles(files: Record<string, { content: Uint8Array<ArrayBuffer> | string }>): Promise<void>;
  canMove(source: string, target: string): Promise<true | WorkspaceMutationError>;
  canRename(source: string, newName: string): Promise<true | WorkspaceMutationError>;
  canCreate(path: string, kind: 'file' | 'directory'): Promise<true | WorkspaceMutationError>;
  canDelete(path: string): Promise<true | WorkspaceMutationError>;
};

/**
 * Filesystem provider surface issued for one captured mount.
 * @public
 */
export type RootedFileSystem = Omit<FileSystemProvider, 'writeFileChecked'> &
  Partial<RootedPorcelain> & {
    writeFileChecked(input: CheckedFileWrite): Promise<CheckedFileWriteResult>;
    watch(request: WatchRequest, handler: (event: WatchEvent) => void): () => void;
    /**
     * Search this root's own index, which no other root's queries evict (D3).
     *
     * Unmasked here, like every other rooted primitive: the mask belongs to the
     * composed view above, which passes its policy's answer as `admits` so a
     * hidden subtree is never descended into and `maxResults` counts only the
     * rows its consumer may see.
     *
     * Optional for the same reason `readdirEntries` is: a rooted surface that is
     * not the authority's own — a bridge client rooted at someone else's
     * checkout — holds no index and offers neither read.
     */
    search?(query: string, options?: TreeSearchOptions): Promise<FileStatEntry[]>;
    /** Recursively stat one directory of this root from the same index. */
    statTree?(path: string, options?: { admits?: TreeIndexAdmits }): Promise<FileStatEntry[]>;
  };

/**
 * A rooted view, its captured mount and the pipeline it mutates through.
 *
 * @public
 */
export class RootedViews {
  private readonly _mountTable: MountTable;
  private readonly _pipeline: MutationPipeline;
  private readonly _watchRegistry: WatchRegistry;
  /** One root's warm index, built by the authority that owns the scan. */
  private readonly _treeIndexFor: (root: string) => Promise<TreeIndex>;

  /**
   * Create the rooted-view factory over the authority's own collaborators.
   *
   * @param options - The mount table, mutation pipeline, watch registry and per-root index accessor the authority owns.
   */
  public constructor(options: {
    mountTable: MountTable;
    pipeline: MutationPipeline;
    watchRegistry: WatchRegistry;
    treeIndexFor: (root: string) => Promise<TreeIndex>;
  }) {
    this._mountTable = options.mountTable;
    this._pipeline = options.pipeline;
    this._watchRegistry = options.watchRegistry;
    this._treeIndexFor = options.treeIndexFor;
  }

  /**
   * Capture one exact mount selected by trusted composition as a fully
   * writable filesystem whose entire visible namespace has root `''`.
   *
   * @param authorityRoot - Exact authority-global mount path to capture.
   * @param mutationContext - Optional origin metadata for echo suppression.
   * @returns A writable filesystem whose root is the captured mount.
   */
  public create(authorityRoot: string, mutationContext?: WorkspaceMutationContext): RootedFileSystem {
    const root = resolveAuthorityPath(authorityRoot);
    const captured = this._mountTable.getExactMount(root);
    if (captured === undefined) {
      throw new RootedFileSystemError('ROOT_UNAVAILABLE');
    }

    const assertCurrent = (): void => {
      if (this._mountTable.getExactMount(root) !== captured) {
        throw new RootedFileSystemError('ESTALE');
      }
    };
    const assertMutableRoot = (localPath: string): void => {
      if (localPath === '') {
        throw new Error('Cannot remove or rename the rooted filesystem root.');
      }
    };
    const resolveLocal = (
      localPath: string,
    ): { authorityPath: string; resolution: MountResolution; localPath: string } => {
      const canonicalLocalPath = assertRootedPath(localPath);
      assertCurrent();
      const authorityPath =
        canonicalLocalPath === ''
          ? root
          : root === '/'
            ? resolveAuthorityPath(`/${canonicalLocalPath}`)
            : resolveAuthorityPath(`${root}/${canonicalLocalPath}`);
      const providerPath = assertRootedPath(joinRelativePath(captured.providerBasePath, canonicalLocalPath));
      return {
        authorityPath,
        localPath: canonicalLocalPath,
        resolution: { provider: captured.provider, path: providerPath, backend: captured.backend, entry: captured },
      };
    };
    const toLocalPath = (authorityPath: string): string | undefined => {
      if (root === '/') {
        return authorityPath === '/' ? '' : authorityPath.startsWith('/') ? authorityPath.slice(1) : undefined;
      }
      if (authorityPath === root) {
        return '';
      }
      if (!authorityPath.startsWith(`${root}/`)) {
        return undefined;
      }
      return authorityPath.slice(root.length + 1);
    };
    const prefixGlob = (pattern: string): string => {
      if (pattern.startsWith('/')) {
        throw new TypeError('A rooted watch glob must not begin with a slash.');
      }
      if (pattern === '') {
        return root;
      }
      return root === '/' ? `/${pattern}` : `${root}/${pattern}`;
    };

    function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
    function readFile(path: string, encoding: 'utf8'): Promise<string>;
    async function readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
      const { resolution } = resolveLocal(path);
      return encoding === 'utf8'
        ? resolution.provider.readFile(resolution.path, 'utf8')
        : resolution.provider.readFile(resolution.path);
    }

    const readFileStream = (path: string, options?: FileReadStreamOptions): ReadableStream<Uint8Array<ArrayBuffer>> => {
      validateFileReadStreamOptions(options);
      const { resolution } = resolveLocal(path);
      let reader = resolution.provider.readFileStream?.(resolution.path, options).getReader();
      const cancelAfterFailure = async (reason: unknown): Promise<void> => {
        try {
          await reader?.cancel(reason);
        } catch {
          // Preserve the read or staleness failure that required cleanup.
        }
      };
      return new ReadableStream(
        {
          async pull(controller) {
            try {
              assertCurrent();
              reader ??= bufferToStream(await resolution.provider.readFile(resolution.path), options).getReader();
              const result = await reader.read();
              assertCurrent();
              if (result.done) {
                controller.close();
              } else {
                controller.enqueue(result.value);
              }
            } catch (error) {
              await cancelAfterFailure(error);
              throw error;
            }
          },
          cancel: async (reason) => reader?.cancel(reason),
        },
        { highWaterMark: 0 },
      );
    };

    const readdir = async (path: string): Promise<string[]> => {
      const { resolution } = resolveLocal(path);
      return resolution.provider.readdir(resolution.path);
    };
    const stat = async (path: string): Promise<FileStat> => {
      const { resolution } = resolveLocal(path);
      return resolution.provider.stat(resolution.path);
    };
    const readdirEntries = captured.provider.readdirEntries
      ? async (path: string): Promise<DirectoryEntry[]> => {
          const { resolution } = resolveLocal(path);
          return resolution.provider.readdirEntries!(resolution.path);
        }
      : undefined;
    const getFileMode = captured.provider.getFileMode
      ? async (path: string) => {
          const { resolution } = resolveLocal(path);
          return resolution.provider.getFileMode!(resolution.path);
        }
      : undefined;
    const setFileMode = captured.provider.setFileMode
      ? async (path: string, mode: '100644' | '100755') => {
          const { resolution } = resolveLocal(path);
          await resolution.provider.setFileMode!(resolution.path, mode);
        }
      : undefined;
    const writeFile = async (path: string, data: Uint8Array<ArrayBuffer> | string): Promise<void> => {
      const { authorityPath, resolution } = resolveLocal(path);
      await this._pipeline.writeFileResolved({ path: authorityPath, resolution, data, context: mutationContext });
    };
    const writeFileChecked = async (input: CheckedFileWrite): Promise<CheckedFileWriteResult> => {
      const target = resolveLocal(input.path);
      const preconditions = input.preconditions.map((precondition) => {
        const resolved = resolveLocal(precondition.path);
        return { ...precondition, path: resolved.authorityPath, resolution: resolved.resolution };
      });
      return this._pipeline.writeFileCheckedResolved({
        path: target.authorityPath,
        resolution: target.resolution,
        data: input.data,
        preconditions,
        signal: input.signal,
        context: mutationContext,
      });
    };
    const appendFile = async (path: string, data: Uint8Array<ArrayBuffer> | string): Promise<void> => {
      const { authorityPath, resolution } = resolveLocal(path);
      await this._pipeline.appendFileResolved({ path: authorityPath, resolution, data, context: mutationContext });
    };
    const mkdir = async (path: string, options?: MkdirOptions): Promise<void> => {
      const { authorityPath, resolution } = resolveLocal(path);
      await this._pipeline.mkdirResolved({ path: authorityPath, resolution, options, context: mutationContext });
    };
    const unlink = async (path: string): Promise<void> => {
      const { authorityPath, resolution, localPath } = resolveLocal(path);
      assertMutableRoot(localPath);
      await this._pipeline.unlinkResolved({ path: authorityPath, resolution, context: mutationContext });
    };
    const rmdir = async (path: string): Promise<void> => {
      const { authorityPath, resolution, localPath } = resolveLocal(path);
      assertMutableRoot(localPath);
      await this._pipeline.rmdirResolved({ path: authorityPath, resolution, context: mutationContext });
    };
    const move = async (from: string, to: string): Promise<FileStat> => {
      const source = resolveLocal(from);
      const target = resolveLocal(to);
      assertMutableRoot(source.localPath);
      assertMutableRoot(target.localPath);
      return this._pipeline.moveResolved({
        source: source.authorityPath,
        target: target.authorityPath,
        sourceResolution: source.resolution,
        targetResolution: target.resolution,
        context: mutationContext,
      });
    };
    const rename = async (from: string, to: string): Promise<void> => {
      await move(from, to);
    };
    const copyTree = async (
      source: string,
      target: string,
      options?: { admits?: WalkOptions['admits'] },
    ): Promise<void> => {
      const from = resolveLocal(source);
      const to = resolveLocal(target);
      await this._pipeline.copyTree({
        source: from.authorityPath,
        target: to.authorityPath,
        sourceResolution: from.resolution,
        targetResolution: to.resolution,
        admits: options?.admits,
        context: mutationContext,
      });
    };
    const duplicate = async (source: string, target: string): Promise<void> => {
      assertMutableRoot(resolveLocal(target).localPath);
      await writeFile(target, await readFile(source));
    };
    const bulkMove = async (edits: readonly BulkMoveEdit[]): Promise<BulkMoveResult> =>
      this._pipeline.bulkMove(move, edits);
    const writeFiles = async (files: Record<string, { content: Uint8Array<ArrayBuffer> | string }>): Promise<void> => {
      await this._pipeline.writeFiles(
        Object.entries(files).map(([path, file]) => {
          const { authorityPath, resolution } = resolveLocal(path);
          return {
            path: authorityPath,
            resolution,
            content: typeof file.content === 'string' ? file.content : new Uint8Array(file.content),
          };
        }),
        mutationContext,
      );
    };
    /*
     * A preflight answers with a typed refusal instead of throwing, so an
     * uncanonical operand is `INVALID_NAME` rather than an exception — but a
     * stale view is still stale, and that is not a preflight outcome.
     */
    const resolveForPreflight = (
      path: string,
    ): { path: string; resolution: MountResolution } | WorkspaceMutationError => {
      try {
        const { localPath, resolution } = resolveLocal(path);
        return { path: localPath, resolution };
      } catch (error) {
        if (error instanceof RootedFileSystemError) {
          throw error;
        }
        return new WorkspaceMutationError('INVALID_NAME', path, { cause: error });
      }
    };
    const canMove = async (source: string, target: string): Promise<true | WorkspaceMutationError> => {
      const from = resolveForPreflight(source);
      if (from instanceof WorkspaceMutationError) {
        return from;
      }
      const to = resolveForPreflight(target);
      if (to instanceof WorkspaceMutationError) {
        return to;
      }
      return preflightMove(from, to);
    };
    const canRename = async (source: string, newName: string): Promise<true | WorkspaceMutationError> => {
      if (newName.length === 0 || newName.includes('/') || newName.includes('\\')) {
        return new WorkspaceMutationError('INVALID_NAME', newName);
      }
      if (newName === '.' || newName === '..') {
        return new WorkspaceMutationError('INVALID_NAME', newName);
      }
      return canMove(source, `${source.slice(0, source.lastIndexOf('/') + 1)}${newName}`);
    };
    const canCreate = async (path: string, kind: 'file' | 'directory'): Promise<true | WorkspaceMutationError> => {
      const target = resolveForPreflight(path);
      /* `kind` is the authority's contract too: providers route on the eventual
       * mutation, and the parameter is kept so the RPC can grow. */
      void kind;
      return target instanceof WorkspaceMutationError ? target : preflightCreate(target);
    };
    const canDelete = async (path: string): Promise<true | WorkspaceMutationError> => {
      const target = resolveForPreflight(path);
      return target instanceof WorkspaceMutationError ? target : preflightDelete(target);
    };
    const exists = async (path: string): Promise<boolean> => {
      const { resolution } = resolveLocal(path);
      return resolution.provider.exists(resolution.path);
    };
    const lstat = async (path: string): Promise<FileStat> => {
      const { resolution } = resolveLocal(path);
      return resolution.provider.lstat(resolution.path);
    };
    const search = async (query: string, options?: TreeSearchOptions): Promise<FileStatEntry[]> => {
      assertCurrent();
      const index = await this._treeIndexFor(root);
      return index.searchFiles(query, options);
    };
    const statTree = async (path: string, options?: { admits?: TreeIndexAdmits }): Promise<FileStatEntry[]> => {
      const { localPath } = resolveLocal(path);
      const index = await this._treeIndexFor(root);
      return index.getDirectoryStat(localPath, options);
    };
    const watch = (request: WatchRequest, handler: (event: WatchEvent) => void): (() => void) => {
      assertCurrent();
      if (request.paths.length === 0) {
        throw new TypeError('A rooted watch requires at least one path.');
      }
      const paths = request.paths.map((path) => resolveLocal(path).authorityPath);
      let active = true;
      let unsubscribe = (): void => undefined;
      const stop = (): void => {
        if (!active) {
          return;
        }
        active = false;
        unsubscribe();
      };
      unsubscribe = this._watchRegistry.watch(
        {
          ...request,
          paths,
          includes: request.includes?.map(prefixGlob),
          excludes: request.excludes?.map(prefixGlob),
        },
        (event) => {
          if (!active) {
            return;
          }
          try {
            assertCurrent();
          } catch (error) {
            if (error instanceof RootedFileSystemError && error.code === 'ESTALE') {
              stop();
              handler({ type: 'reset' });
              return;
            }
            throw error;
          }
          if (
            mutationContext?.originClientId !== undefined &&
            mutationContext.originClientId === getEventOrigin(event)
          ) {
            return;
          }
          if (event.type === 'reset') {
            handler(event);
            return;
          }
          if (event.type === 'rename') {
            const oldPath = toLocalPath(event.oldPath);
            const newPath = toLocalPath(event.newPath);
            if (oldPath !== undefined && newPath !== undefined) {
              handler({ ...event, oldPath, newPath });
            } else if (oldPath !== undefined) {
              handler({ type: 'delete', path: oldPath });
            } else if (newPath !== undefined) {
              handler({ type: 'change', path: newPath });
            }
            return;
          }
          const path = toLocalPath(event.path);
          if (path !== undefined) {
            handler({ ...event, path });
          }
        },
        { authority: captured },
      );
      return stop;
    };
    return {
      id: 'workspace-root',
      capabilities: captured.provider.capabilities,
      dispose() {
        // The provider and rooted view lifetime remain owned by WorkspaceFileService.
      },
      readFile,
      readFileStream,
      writeFile,
      writeFileChecked,
      appendFile,
      readdir,
      readdirEntries,
      stat,
      getFileMode,
      setFileMode,
      mkdir,
      unlink,
      rmdir,
      rename,
      exists,
      lstat,
      watch,
      search,
      statTree,
      copyTree,
      duplicate,
      move,
      bulkMove,
      writeFiles,
      canMove,
      canRename,
      canCreate,
      canDelete,
    };
  }
}
