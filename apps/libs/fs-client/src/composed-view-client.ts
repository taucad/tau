import type { FileStat, FileProvenance } from '@taucad/types';
import type { FileTreeNode } from '@taucad/filesystem';
import type { FileSystemClient } from '#file-system-client.js';
import type { WorkspacePathResolver } from '#workspace-path-resolver.js';

/**
 * The rooted half of a filesystem bridge proxy opened as a composed view.
 *
 * Structural on purpose: the only implementation is a bridge proxy, and naming
 * the proxy type here would drag the whole bridge surface into this package.
 *
 * @public
 */
export type ComposedViewProxy = {
  readFile(path: string, options: 'utf8'): Promise<string>;
  readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  readdir(path: string): Promise<string[]>;
  stat(path: string): Promise<FileStat>;
  lstat(path: string): Promise<FileStat>;
  exists(path: string): Promise<boolean>;
  readdirWithStats(path: string): Promise<Array<{ name: string } & FileStat>>;
  provenance(path: string): Promise<FileProvenance>;
};

const treeNode = (row: { name: string } & FileStat): FileTreeNode => {
  const common = {
    id: row.name,
    name: row.name,
    size: row.size,
    mtimeMs: row.mtimeMs,
    ...(row.provenance === undefined ? {} : { provenance: row.provenance }),
  };
  if (row.type === 'dir') {
    return { ...common, children: [] };
  }
  return row.contentKind === 'text'
    ? { ...common, contentKind: 'text', lineCount: row.lineCount }
    : { ...common, contentKind: 'binary' };
};

/** Mutations this client refuses on the main thread, before the worker is asked. */
const guardedMutations = new Set(['writeFile', 'mkdir', 'unlink', 'rmdir']);

/**
 * One filesystem client that reads the project through its composed view and
 * asks the authority for everything else.
 *
 * The split is deliberate and is the whole of it:
 *
 * - **Reads inside the project root** go to the view, because that is the one
 *   composition the agent's tools read too (charter D1): the same overlay
 *   entries, the same mask, the same provenance on every row.
 * - **Writes and workspace porcelain** — zip, recursive stat, search, the
 *   move preflights, cross-root writes — stay on the authority. Porcelain is
 *   authority-global and has no rooted counterpart; writes stay there because
 *   the authority suppresses a port's own change events, and re-issuing this
 *   client's writes through a second port would echo every UI edit back to the
 *   UI as an external change.
 * - **Paths outside the project root** (the global `/node_modules` alias the
 *   resolver keeps) are the authority's too: dependencies are a mount, not an
 *   overlay.
 *
 * @param input - The authority client, the rooted view, and the path resolver they share.
 * @returns A client with the same surface as `workspace`, reading through the view.
 * @public
 *
 * @example <caption>Wire the file services to one composed view</caption>
 * ```typescript
 * import { createComposedViewClient } from '@taucad/fs-client/composed-view-client';
 *
 * export function exampleClient(
 *   workspace: FileSystemClient,
 *   view: ComposedViewProxy,
 *   paths: WorkspacePathResolver,
 * ): FileSystemClient {
 *   return createComposedViewClient({ workspace, view, paths });
 * }
 * ```
 */
export const createComposedViewClient = (input: {
  readonly workspace: FileSystemClient;
  readonly view: ComposedViewProxy;
  readonly paths: WorkspacePathResolver;
}): FileSystemClient => {
  const { workspace, view, paths } = input;
  /* ponytail: provenance memo, filled by the reads that already answer it, so
   * a refusal costs no round trip. A path becomes writable again only after it
   * is re-read, which is what creating an override does anyway. */
  const provenance = new Map<string, FileProvenance>();

  const remember = (relativePath: string, value: FileProvenance | undefined): void => {
    if (value !== undefined) {
      provenance.set(relativePath, value);
    }
  };

  /** The view-relative path, or `undefined` when the authority owns this one. */
  const viewPath = (absolutePath: string): string | undefined => {
    const relative = paths.toRelativePath(absolutePath);
    return relative === undefined || paths.toAbsolutePath(relative) !== absolutePath ? undefined : relative;
  };

  const readFile = async (absolutePath: string, options?: unknown): Promise<string | Uint8Array<ArrayBuffer>> => {
    const relative = viewPath(absolutePath);
    if (relative === undefined) {
      return (workspace.readFile as (path: string, options?: unknown) => Promise<string | Uint8Array<ArrayBuffer>>)(
        absolutePath,
        options,
      );
    }
    const encoding = options === 'utf8' || (options as { encoding?: string } | undefined)?.encoding === 'utf8';
    return encoding ? view.readFile(relative, 'utf8') : view.readFile(relative);
  };

  const overrides: Partial<Record<keyof FileSystemClient, unknown>> = {
    readFile,
    readdir: async (absolutePath: string) => {
      const relative = viewPath(absolutePath);
      return relative === undefined ? workspace.readdir(absolutePath) : view.readdir(relative);
    },
    stat: async (absolutePath: string) => {
      const relative = viewPath(absolutePath);
      if (relative === undefined) {
        return workspace.stat(absolutePath);
      }
      const result = await view.stat(relative);
      remember(relative, result.provenance);
      return result;
    },
    lstat: async (absolutePath: string) => {
      const relative = viewPath(absolutePath);
      return relative === undefined ? workspace.lstat(absolutePath) : view.lstat(relative);
    },
    exists: async (absolutePath: string) => {
      const relative = viewPath(absolutePath);
      return relative === undefined ? workspace.exists(absolutePath) : view.exists(relative);
    },
    readDirectory: async (absolutePath: string) => {
      const relative = viewPath(absolutePath);
      if (relative === undefined) {
        return workspace.readDirectory(absolutePath);
      }
      const rows = await view.readdirWithStats(relative);
      for (const row of rows) {
        remember(relative === '' ? row.name : `${relative}/${row.name}`, row.provenance);
      }
      return rows.map((row) => treeNode(row));
    },
  };

  return new Proxy(workspace, {
    get(target, property, receiver) {
      if (typeof property !== 'string') {
        return Reflect.get(target, property, target) as unknown;
      }
      if (guardedMutations.has(property)) {
        return async (absolutePath: string, ...rest: unknown[]): Promise<unknown> => {
          const relative = viewPath(absolutePath);
          if (relative !== undefined) {
            /* Memoized from the read that listed or stat'd this path, so the
             * common case costs nothing; a path nobody has read yet is asked
             * about once, and never reaches the authority when the answer is an
             * overlay's. */
            let known = provenance.get(relative);
            if (known === undefined) {
              known = await view.provenance(relative);
              provenance.set(relative, known);
            }
            if (known.source !== 'project') {
              throw Object.assign(new Error(`EROFS: ${relative} is served read-only by this view.`), {
                code: 'EROFS',
              });
            }
          }
          return (target[property as 'writeFile'] as (...args: unknown[]) => Promise<unknown>).call(
            target,
            absolutePath,
            ...rest,
          );
        };
      }
      const override = overrides[property as keyof FileSystemClient];
      if (override !== undefined) {
        return override;
      }
      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  }) as FileSystemClient;
};
