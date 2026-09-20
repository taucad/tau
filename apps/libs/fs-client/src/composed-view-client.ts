import type { CheckedFileWrite, CheckedFileWriteResult, FileStat, FileStatEntry, FileProvenance } from '@taucad/types';
import { isWorkspaceMutationError, WorkspaceMutationError } from '@taucad/filesystem';
import type { FileTreeNode, WorkspaceScope } from '@taucad/filesystem';
import type { BulkMoveEdit, BulkMoveResult, FileSystemClient } from '#file-system-client.js';
import { rootedPathOf } from '#rooted-content-client.js';
import { isGlobalNodeModulesPath } from '#workspace-path-resolver.js';
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
  /** ZIP one subtree of the view; `{ versionedOnly }` keeps the bytes that are the project. */
  archive(path: string, options?: { versionedOnly?: boolean }): Promise<Blob>;
  /** Search this view's root from its own index; the mask is applied before the cap. */
  search(query: string, options?: { maxResults?: number; includeDirectories?: boolean }): Promise<FileStatEntry[]>;
  /** Recursively stat one directory of the view from the same index. */
  statTree(path: string): Promise<FileStatEntry[]>;
  /*
   * The mutating half, on the same connection as the reads (charter D12): the
   * bridge suppresses a port's own change events, so a write issued on any other
   * port comes back to this client as somebody else's edit.
   */
  writeFile(path: string, data: Uint8Array<ArrayBuffer> | string): Promise<void>;
  writeFileChecked(input: Omit<CheckedFileWrite, 'signal'>): Promise<CheckedFileWriteResult>;
  writeFiles(files: Record<string, { content: Uint8Array<ArrayBuffer> | string }>): Promise<void>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  unlink(path: string): Promise<void>;
  rmdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  move(source: string, target: string): Promise<FileStat>;
  bulkMove(edits: readonly BulkMoveEdit[]): Promise<BulkMoveResult>;
  /** Copy one file inside the root; the absolute-path spelling is `duplicateFile`. */
  duplicate(source: string, target: string): Promise<void>;
  /** Copy one subtree inside the root, with the view's own mask as the entry filter. */
  copyTree(source: string, target: string): Promise<void>;
  canMove(source: string, target: string): Promise<true | WorkspaceMutationError>;
  canRename(source: string, newName: string): Promise<true | WorkspaceMutationError>;
  canCreate(path: string, kind: 'file' | 'directory'): Promise<true | WorkspaceMutationError>;
  canDelete(path: string): Promise<true | WorkspaceMutationError>;
};

/**
 * The composed client: a {@link FileSystemClient} plus the one gesture that is
 * allowed to write where the guard otherwise refuses.
 *
 * @public
 */
export type ComposedViewClient = FileSystemClient & {
  /**
   * Copy one file inside the view, mask-checked by it (charter D4).
   *
   * Not on {@link FileSystemClient}: the authority's unmasked `duplicateFile`
   * went with its last consumer (W12d). This is the rooted `duplicate` in the
   * absolute paths the file services speak, and a path outside the view's root
   * has no view to serve it.
   */
  duplicateFile(sourcePath: string, destinationPath: string): Promise<void>;
  /**
   * Search the view's own root from its index, masked by its policy (charter D3).
   *
   * `root` must be the view's root; a wider or narrower one has no index.
   */
  searchFiles(
    root: string,
    query: string,
    options?: { maxResults?: number; includeDirectories?: boolean },
  ): Promise<FileStatEntry[]>;
  /** Recursive stat of one directory, from the same index and the same mask. */
  getDirectoryStat(path: string): Promise<FileStatEntry[]>;
  /**
   * Place a whole overlay unit into the project, so the project owns it.
   *
   * The only write allowed under an overlay root (ruling P11), and whole by
   * construction: it reads the unit's own subtree through the view rather than
   * taking bytes from the caller, so "a bundle is a version, not a pile of
   * files" (V8) is the guard's invariant instead of a caller's manners.
   *
   * `unitRoot` is **checkout-relative**, unlike the absolute paths the rest of
   * this surface takes: a unit only exists inside the checkout, and the Files
   * pane speaks the same tree paths the view does.
   */
  overrideUnit(unitRoot: string): Promise<void>;
};

/**
 * What the authority's own mounts are, as provenance.
 *
 * Only one mount lives outside a project checkout today — the global
 * `/node_modules` alias the resolver keeps — and it is the dependency layer:
 * never versioned, read-only to everyone. The view stamps everything else.
 *
 * ponytail: ask the mount table for the mount's class once a second
 * out-of-checkout mount exists. `agentAccess` is `'read-only'` because the wire
 * has no `'hidden'`, which is how `composeView` collapses it too.
 */
const outsideCheckoutProvenance: FileProvenance = Object.freeze({
  source: 'dependencies',
  versioned: false,
  agentAccess: 'read-only',
});

/** The one mount outside every checkout, as the authority and the tree spell it. */
const dependencyMountName = 'node_modules';
const dependencyMountPath = `/${dependencyMountName}`;

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

/**
 * Mutating members, and which positional arguments name a path.
 *
 * `writeFiles`, `bulkMove` and `canRename` carry their paths in some other
 * shape and are read out below.
 */
const guardedMutations = new Map<string, readonly number[]>([
  ['writeFile', [0]],
  ['writeFileChecked', []],
  ['mkdir', [0]],
  ['unlink', [0]],
  ['rmdir', [0]],
  ['move', [0, 1]],
  ['duplicateFile', [0, 1]],
]);

/**
 * Members the view alone serves: the authority's unmasked equivalent is gone
 * with its last consumer (W12d), so a path outside the root is refused rather
 * than forwarded.
 */
const viewOnlyMutations = new Set(['duplicateFile']);

/** Preflights: they answer with a {@link WorkspaceMutationError}, never a throw. */
const guardedPreflights = new Map<string, readonly number[]>([
  ['canMove', [0, 1]],
  ['canRename', [0]],
  ['canCreate', [0]],
  ['canDelete', [0]],
]);

/**
 * The view's own name for each guarded member, where the two surfaces differ.
 *
 * The rooted porcelain spells a tree copy `copyTree` and a file copy
 * `duplicate`; everything else is the same word on both surfaces.
 */
const viewMutations = new Map<string, keyof ComposedViewProxy>([
  ['writeFile', 'writeFile'],
  ['writeFileChecked', 'writeFileChecked'],
  ['writeFiles', 'writeFiles'],
  ['mkdir', 'mkdir'],
  ['unlink', 'unlink'],
  ['rmdir', 'rmdir'],
  ['move', 'move'],
  ['bulkMove', 'bulkMove'],
  ['duplicateFile', 'duplicate'],
  ['canMove', 'canMove'],
  ['canRename', 'canRename'],
  ['canCreate', 'canCreate'],
  ['canDelete', 'canDelete'],
]);

/** The paths a guarded call would touch, whatever shape its arguments take. */
const touchedPaths = (property: string, args: readonly unknown[]): readonly string[] => {
  if (property === 'writeFileChecked') {
    const input = args[0] as { path?: unknown; preconditions?: ReadonlyArray<{ path?: unknown }> } | undefined;
    return [input?.path, ...(input?.preconditions?.map(({ path }) => path) ?? [])].filter(
      (value): value is string => typeof value === 'string',
    );
  }
  if (property === 'canRename') {
    /* The new name lands in the source's own parent, and that parent can still
     * be an overlay's — so the preflight answers on the same two paths the
     * `move` it precedes is guarded on. */
    const [source, newName] = args as [string, string];
    return [source, `${source.slice(0, source.lastIndexOf('/') + 1)}${newName}`];
  }
  if (property === 'writeFiles') {
    return Object.keys((args[0] ?? {}) as Record<string, unknown>);
  }
  if (property === 'bulkMove') {
    return ((args[0] ?? []) as ReadonlyArray<{ source: string; target: string }>).flatMap(({ source, target }) => [
      source,
      target,
    ]);
  }
  const positions = guardedMutations.get(property) ?? guardedPreflights.get(property) ?? [];
  return positions.map((index) => args[index]).filter((value): value is string => typeof value === 'string');
};

/**
 * The same guarded call in the view's own namespace, or `undefined` when one of
 * its paths is not the view's to serve.
 *
 * The shapes are {@link touchedPaths}': the same three irregular members carry
 * their paths in a record, an edit list or a checked-write input, and every
 * other one carries them in the positions the tables above declare. An
 * all-or-nothing rewrite is the point — a batch with one path outside the root
 * is the authority's whole call, not a pair of half calls.
 */
const viewArgs = (
  property: string,
  args: readonly unknown[],
  relative: (absolutePath: string) => string | undefined,
): unknown[] | undefined => {
  if (property === 'writeFileChecked') {
    const input = args[0] as Omit<CheckedFileWrite, 'signal'>;
    const path = relative(input.path);
    const preconditions = input.preconditions.map((precondition) => ({
      ...precondition,
      path: relative(precondition.path),
    }));
    return path === undefined || preconditions.some((precondition) => precondition.path === undefined)
      ? undefined
      : [{ ...input, path, preconditions }];
  }
  if (property === 'writeFiles') {
    const entries = Object.entries((args[0] ?? {}) as Record<string, unknown>).map(
      ([path, descriptor]) => [relative(path), descriptor] as const,
    );
    return entries.some(([path]) => path === undefined) ? undefined : [Object.fromEntries(entries)];
  }
  if (property === 'bulkMove') {
    const edits = ((args[0] ?? []) as readonly BulkMoveEdit[]).map(({ source, target }) => ({
      source: relative(source),
      target: relative(target),
    }));
    return edits.some(({ source, target }) => source === undefined || target === undefined) ? undefined : [edits];
  }
  const rewritten = [...args];
  /* `canRename`'s second argument is a bare name, not a path. */
  for (const index of guardedMutations.get(property) ?? guardedPreflights.get(property) ?? []) {
    const path = relative(args[index] as string);
    if (path === undefined) {
      return undefined;
    }
    rewritten[index] = path;
  }
  return rewritten;
};

/**
 * One filesystem client that reads the project through its composed view and
 * asks the authority for everything else.
 *
 * The split is deliberate and is the whole of it:
 *
 * - **Reads inside the project root** go to the view, because that is the one
 *   composition the agent's tools read too (charter D1): the same overlay
 *   entries, the same mask, the same provenance on every row. That includes the
 *   whole-subtree reads — the archive a person downloads is composed exactly
 *   like the tree they are looking at (charter D2).
 *   That includes search and recursive stat, which the view answers from its
 *   root's own index (charter D3): the same rows the tree shows, masked by the
 *   same policy, and warm for as long as the project is open.
 * - **Writes and the mutating porcelain inside the project root** go to the view
 *   too, on that one connection (charter D12): the authority suppresses a port's
 *   own change events, so a write issued on any other port would come back to
 *   this client as somebody else's edit. That is why the routing cannot be split
 *   across two changes — the reads and the writes have to share a port or the UI
 *   re-announces itself.
 * - **Paths outside the project root** (the global `/node_modules` alias the
 *   resolver keeps) are the authority's: dependencies are a mount, not an
 *   overlay, and no rooted handle serves them. A batch with one path outside the
 *   root is the authority's whole call — this client never splits one operation
 *   across both surfaces.
 *
 * @param input - The authority client, the rooted view, and the path resolver they share.
 * @returns A client with the same surface as `workspace`, reading through the view, plus {@link ComposedViewClient.overrideUnit}.
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
 * ): ComposedViewClient {
 *   return createComposedViewClient({ workspace, view, paths });
 * }
 * ```
 */
export const createComposedViewClient = (input: {
  readonly workspace: FileSystemClient;
  readonly view: ComposedViewProxy;
  readonly paths: WorkspacePathResolver;
}): ComposedViewClient => {
  const { workspace, view, paths } = input;
  /* Ponytail: provenance memo, filled by the reads that already answer it, so
   * a refusal costs no round trip. A path becomes writable again only after it
   * is re-read, which is what creating an override does anyway. */
  const provenance = new Map<string, FileProvenance>();

  /**
   * The first of these paths the view serves read-only, or `undefined`.
   *
   * Memoized from the read that listed or stat'd the path, so the common case
   * costs nothing; a path nobody has read yet is asked about once, and never
   * reaches the authority when the answer is an overlay's.
   */
  const firstReadOnly = async (paths: readonly string[]): Promise<string | undefined> => {
    const relatives = paths.map((absolutePath) => viewPath(absolutePath)).filter((path) => path !== undefined);
    /* One round of probes, not one per path: a multi-select move asks about
     * every path it touches, and the memo answers for none of them the first
     * time (a move target has never been read). Order still decides which path
     * the refusal names (W2 R14). */
    await Promise.all(
      relatives
        .filter((relative) => !provenance.has(relative))
        .map(async (relative) => {
          provenance.set(relative, await view.provenance(relative));
        }),
    );
    return relatives.find((relative) => provenance.get(relative)?.source !== 'project');
  };

  /**
   * The dependency mount as one row of the view's root, or `undefined`.
   *
   * The mount is a sibling of the checkout, so no view lists it — but a root
   * listing is authoritative over the root's children, so a listing that omits
   * the mount is what deletes the row from the tree on every re-list (blueprint
   * Finding 4). Asked once per client: the worker mounts it before the workspace
   * is ready and never unmounts it, and the mount is fail-soft — a profile where
   * it never came up must not grow a row nothing serves.
   *
   * Only a resolved row is remembered (G0b-7): the probe swallows every error, so
   * remembering its absence would let one transient authority failure — or one
   * listing that raced the mount — cost the session its row for good.
   */
  let dependencyMount: Promise<FileTreeNode | undefined> | undefined;
  const dependencyMountRow = async (): Promise<FileTreeNode | undefined> => {
    dependencyMount ??= (async () => {
      try {
        const mount = await workspace.stat(dependencyMountPath);
        return mount.type === 'dir'
          ? treeNode({ name: dependencyMountName, ...mount, provenance: outsideCheckoutProvenance })
          : undefined;
      } catch {
        return undefined;
      }
    })();
    const row = await dependencyMount;
    if (row === undefined) {
      dependencyMount = undefined;
    }
    return row;
  };

  const remember = (relativePath: string, value: FileProvenance | undefined): void => {
    if (value !== undefined) {
      provenance.set(relativePath, value);
    }
  };

  /**
   * The view-relative path, or `undefined` when the authority owns this one.
   *
   * A path that does not live under the checkout is a mount, not the view's:
   * the resolver keeps the global `/node_modules` alias addressable as
   * `node_modules/...`, and the view — rooted at the checkout — has never heard
   * of it (a1 review C2).
   */
  const viewPath = (absolutePath: string): string | undefined => {
    /* Whatever the root: the alias is the resolver's own branch, and at the Home
     * root (`/`) the root prefix alone would claim it for a view confined to
     * Home's provider, which has never held a dependency (gate G-D, H9). */
    if (isGlobalNodeModulesPath(absolutePath)) {
      return undefined;
    }
    /* Home's prefix is `/`, which every path starts with; a path another route
     * owns sits on that route's mount, and only the mount table finds it. */
    if (rootedPathOf(absolutePath).root !== rootedPathOf(paths.root).root) {
      return undefined;
    }
    const relative = paths.toRelativePath(absolutePath);
    if (relative === undefined || paths.toAbsolutePath(relative) !== absolutePath) {
      return undefined;
    }
    return absolutePath === paths.root || absolutePath.startsWith(paths.rootPrefix) ? relative : undefined;
  };

  /**
   * The same refusal in the namespace the caller asked in.
   *
   * A fresh instance, not a mutated one: `path` and `target` are readonly and
   * the class is a structured-clone wire contract, so it is rebuilt with the
   * same `code` and `cause` and survives another hop. An operand the resolver
   * cannot spell as a path — `canRename` refuses a bare `..` before it resolves
   * anything — is left as it is rather than turned into a throw.
   */
  const absoluteRefusal = <T>(answer: T): T => {
    if (!isWorkspaceMutationError(answer)) {
      return answer;
    }
    try {
      /* One cast: the guard narrows `T` to the error, and a new instance of it
       * is what goes back in `T`'s place. */
      return new WorkspaceMutationError(answer.code, paths.toAbsolutePath(answer.path), {
        ...(answer.target === undefined ? {} : { target: paths.toAbsolutePath(answer.target) }),
        ...(answer.cause === undefined ? {} : { cause: answer.cause }),
      }) as T;
    } catch {
      return answer;
    }
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

  /** Every file of one unit, keyed by the view-relative path it is written at. */
  const unitFiles = async (relativePath: string): Promise<Record<string, { content: Uint8Array<ArrayBuffer> }>> => {
    const rows = await view.readdirWithStats(relativePath);
    const parts = await Promise.all(
      rows.map(async (row) => {
        const child = `${relativePath}/${row.name}`;
        return row.type === 'dir' ? unitFiles(child) : { [child]: { content: await view.readFile(child) } };
      }),
    );
    return Object.assign({}, ...parts) as Record<string, { content: Uint8Array<ArrayBuffer> }>;
  };

  const overrideUnit = async (unitRoot: string): Promise<void> => {
    const current = await view.provenance(unitRoot);
    if (current.source === 'project') {
      throw Object.assign(new Error(`EEXIST: ${unitRoot} is already the project's own.`), { code: 'EEXIST' });
    }
    await view.writeFiles(await unitFiles(unitRoot));
    /* The memo answered "overlay" for every path under the unit; the project
     * owns them from the next read, so drop what it remembers. */
    for (const key of provenance.keys()) {
      if (key === unitRoot || key.startsWith(`${unitRoot}/`)) {
        provenance.delete(key);
      }
    }
  };

  const overrides: Record<string, unknown> = {
    overrideUnit,
    readFile,
    readdir: async (absolutePath: string) => {
      const relative = viewPath(absolutePath);
      return relative === undefined ? workspace.readdir(absolutePath) : view.readdir(relative);
    },
    stat: async (absolutePath: string) => {
      const relative = viewPath(absolutePath);
      if (relative === undefined) {
        return {
          ...(await workspace.stat(absolutePath)),
          provenance: outsideCheckoutProvenance,
        };
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
    getZippedDirectory: async (absolutePath: string, options?: { scope?: WorkspaceScope; versionedOnly?: boolean }) => {
      if (options?.scope !== undefined) {
        return workspace.getZippedDirectory(absolutePath, { scope: options.scope });
      }
      const relative = viewPath(absolutePath);
      if (relative === undefined) {
        throw new Error(`No rooted view serves ${absolutePath}; pass a workspace scope to archive it`);
      }
      return view.archive(relative, options);
    },
    getDirectoryStat: async (absolutePath: string) => {
      const relative = viewPath(absolutePath);
      if (relative === undefined) {
        /* The authority's unmasked walk is gone (W12d): a recursive stat is the
         * root's own index, masked by the view above it (charter D3). */
        throw new Error(`No rooted view serves ${absolutePath}; a recursive stat is the view's own index`);
      }
      return view.statTree(relative);
    },
    searchFiles: async (
      absoluteRoot: string,
      query: string,
      options?: { maxResults?: number; includeDirectories?: boolean },
    ) => {
      /* The index is rooted at the checkout, so only the view's own root is
       * searchable through it — and since W12d there is no unmasked authority
       * search for a wider or narrower one to fall back to. */
      if (viewPath(absoluteRoot) !== '') {
        throw new Error(`No rooted view is rooted at ${absoluteRoot}; only this view's own root is searchable`);
      }
      return view.search(query, options);
    },
    readDirectory: async (absolutePath: string) => {
      const relative = viewPath(absolutePath);
      if (relative === undefined) {
        const rows = await workspace.readDirectory(absolutePath);
        return rows.map((node) => ({
          ...node,
          provenance: outsideCheckoutProvenance,
        }));
      }
      const rows = await view.readdirWithStats(relative);
      for (const row of rows) {
        remember(relative === '' ? row.name : `${relative}/${row.name}`, row.provenance);
      }
      const nodes = rows.map((row) => treeNode(row));
      /* A checkout can hold a `node_modules` of its own — the registry classes it
       * as cache for every consumer, so the view lists it and that row stands:
       * two rows of one name would fight over one tree key. */
      if (relative !== '' || nodes.some((node) => node.name === dependencyMountName)) {
        return nodes;
      }
      const mount = await dependencyMountRow();
      return mount === undefined ? nodes : [...nodes, mount];
    },
  };

  /* The proxy serves one member the authority does not have, so its type is
   * the handler's contract rather than the target's. */
  return new Proxy(workspace, {
    get(target, property, receiver) {
      if (typeof property !== 'string') {
        return Reflect.get(target, property, target) as unknown;
      }
      const preflight = guardedPreflights.has(property);
      if (preflight || guardedMutations.has(property) || property === 'writeFiles' || property === 'bulkMove') {
        return async (...args: unknown[]): Promise<unknown> => {
          const refused = await firstReadOnly(touchedPaths(property, args));
          if (refused !== undefined) {
            /* A preflight answers; a mutation throws. Both say read-only
             * rather than letting the authority answer `NOT_FOUND` for a path
             * it has never held (a1 review R1). */
            if (preflight) {
              return new WorkspaceMutationError('READ_ONLY_MOUNT', refused);
            }
            throw Object.assign(new Error(`EROFS: ${refused} is served read-only by this view.`), { code: 'EROFS' });
          }
          const viewMember = viewMutations.get(property);
          const routed = viewMember === undefined ? undefined : viewArgs(property, args, viewPath);
          if (viewMember !== undefined && routed !== undefined) {
            const answer = await (view[viewMember] as (...rest: unknown[]) => Promise<unknown>)(...routed);
            if (property !== 'bulkMove') {
              /* A preflight answers with a refusal, and the path it names is the
               * one the caller asked about. */
              return absoluteRefusal(answer);
            }
            /* Callers match outcomes to the edits they sent, so the edits come
             * back in the namespace they were asked in. */
            const absolute = <T extends { edit: BulkMoveEdit }>(outcome: T): T => ({
              ...outcome,
              edit: {
                source: paths.toAbsolutePath(outcome.edit.source),
                target: paths.toAbsolutePath(outcome.edit.target),
              },
            });
            const { moved, failed } = answer as BulkMoveResult;
            return {
              moved: moved.map((outcome) => absolute(outcome)),
              failed: failed.map((outcome) => ({ ...absolute(outcome), error: absoluteRefusal(outcome.error) })),
            };
          }
          if (viewOnlyMutations.has(property)) {
            /* The authority has no unmasked equivalent since W12d, so there is
             * nothing to forward a path outside the root to. */
            throw new Error(
              `No rooted view serves ${touchedPaths(property, args).join(', ')}; ${property} is the view's own operation`,
            );
          }
          return (target[property as 'writeFile'] as (...rest: unknown[]) => Promise<unknown>).apply(target, args);
        };
      }
      const override = overrides[property];
      if (override !== undefined) {
        return override;
      }
      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  }) as ComposedViewClient;
};
