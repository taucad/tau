/**
 * The one composed view every consumer reads (L4, charter D1).
 *
 * A checkout's working copy is the bytes; a composed view is what an agent's
 * tools or a Files pane actually see over them: the checkout, plus read-only
 * overlays at fixed paths, plus the {@link PathPolicy}'s mask for that
 * consumer, plus provenance per entry. Browser worker, `tau serve`, the Electron utility
 * and the CLI call this same function, so the agent's filesystem and the Files
 * pane cannot disagree about one path (blueprint finding 1).
 *
 * It is neither a provider nor a mount (mount-provenance V10): composition
 * happens *above* a rooted filesystem, which keeps the authority's routing,
 * ESTALE semantics and watch planes exactly as they are.
 *
 * Two things it deliberately does not do:
 *
 * - It does not carry labels. `{ source, versioned, access }` is data; the copy
 *   that renders it is one UI catalog, so no presentation string crosses a
 *   process boundary (blueprint S14).
 * - It does not merge per file. A project entry inside an overlay unit replaces
 *   that whole unit — a skill bundle is a version, not a pile of files
 *   (mount-provenance V8).
 *
 * @module
 */

import type {
  CheckedFileWrite,
  CheckedFileWriteResult,
  FileContentMetadata,
  FileProvenance,
  FileProvenanceSource,
  FileStat,
  FileStatEntry,
} from '@taucad/types';
import { assertRootedPath, joinRelativePath } from '@taucad/utils/path';
import type {
  DirectoryEntry,
  FileReadStreamOptions,
  FileSystemProvider,
  PathClassification,
  PathPolicy,
  WatchEvent,
  WatchRequest,
} from '#types.js';
import type { TreeSearchOptions } from '#tree-index.js';
import type { RootedPorcelain } from '#rooted-views.js';
import type { WorkspaceMutationError } from '#workspace-errors.js';

/** Who a view is composed for. The set of paths is the same; the mask is not. @public */
export type ComposedViewConsumer = 'agent' | 'user';

/** One entry an overlay serves. Overlay entries are frozen and never watched (mount-provenance V9). @public */
export type ComposedOverlayNode =
  | Readonly<{ type: 'dir'; children: readonly string[] }>
  | (Readonly<{ type: 'file'; size: number }> & FileContentMetadata);

/**
 * A read-only source composed into a view at a fixed path.
 *
 * Data, not a filesystem: the producer (the skill bundle registry today) owns
 * the bytes and their identity, and `libs/filesystem` never learns what a skill
 * is.
 *
 * @public
 */
export type ComposedViewOverlay = Readonly<{
  /**
   * Checkout-relative path the overlay is composed at, e.g. `.agents/skills`.
   *
   * Load-bearing, not decoration: `unit` and `node` are asked only about this
   * path, its subtree, and the directories above it (those merge with the
   * checkout's own children). An overlay that answers outside that set is not
   * composed. `''` is every path's ancestor, so an overlay rooted there is
   * asked about everything.
   */
  root: string;
  source: Exclude<FileProvenanceSource, 'project'>;
  /**
   * The overlay unit serving `path`, or `undefined` for the shared directories
   * above every unit (`''`, `.agents`, `.agents/skills`), which are merged
   * rather than owned.
   *
   * A unit is what a project entry replaces wholesale, and its identity is what
   * the replacing entry reports as `overrides`.
   */
  unit: (path: string) => Readonly<{ root: string; identity: string }> | undefined;
  /** The overlay's own tree, including the shared directories above its units. */
  node: (path: string) => ComposedOverlayNode | undefined;
  read: (path: string, options?: { readonly signal?: AbortSignal }) => Promise<Uint8Array<ArrayBuffer>>;
}>;

/** Optional watch surface a rooted filesystem brings to the view. @public */
type WatchableFileSystem = {
  watch(request: WatchRequest, handler: (event: WatchEvent) => void): () => void;
};

/**
 * Optional index-backed reads a rooted filesystem brings to the view (charter D3).
 *
 * Not derivable from the port: search and recursive stat are answered from the
 * root's own {@link TreeSearchOptions}-filtered index, so a host that composes
 * over a bare provider simply offers neither.
 */
type IndexedFileSystem = {
  search(query: string, options?: TreeSearchOptions): Promise<FileStatEntry[]>;
  statTree(path: string, options?: { admits?: TreeSearchOptions['admits'] }): Promise<FileStatEntry[]>;
};

/**
 * The working copy a view is composed over: already rooted at the checkout.
 *
 * The root is a string on a host with a mount table and nothing at all on a
 * host without one, so the view takes the rooted filesystem itself — the
 * browser worker passes `createRootedFileSystem(root, context)`, the daemon a
 * `NodeFsProvider` rooted at the checkout.
 *
 * @public
 */
export type ComposedViewCheckout = Readonly<{
  filesystem: Omit<FileSystemProvider, 'rmdir'> &
    RecursiveRmdir &
    Partial<WatchableFileSystem> &
    Partial<IndexedFileSystem> &
    Partial<RootedPorcelain>;
  /** Stable checkout id, reported as the `identity` of project entries. */
  id?: string;
}>;

/** Options for {@link composeView}. @public */
export type ComposedViewOptions = Readonly<{
  consumer: ComposedViewConsumer;
  /**
   * The reserved layout this view enforces (D6).
   *
   * Required, because a view that guessed one would be a second enforcement
   * point. Tau's hosts pass `tauPathPolicy`; the example below shows where it
   * comes from.
   */
  policy: PathPolicy;
  overlays?: readonly ComposedViewOverlay[];
}>;

/**
 * A directory removal that carries the rooted surface's recursive option.
 *
 * The bare port's `rmdir` empties one directory; a rooted filesystem's has
 * always taken `{ recursive: true }` (see {@link RootedFileSystem}), and a view
 * that dropped the option would turn a Files-pane folder delete into
 * `ENOTEMPTY`. A provider that only declares `rmdir(path)` still satisfies this.
 *
 * @public
 */
export type RecursiveRmdir = { rmdir(path: string, options?: { recursive?: boolean }): Promise<void> };

/** A rooted filesystem with provenance. @public */
export type ComposedView = Omit<FileSystemProvider, 'rmdir'> &
  RecursiveRmdir &
  Partial<WatchableFileSystem> &
  Partial<IndexedFileSystem> &
  Partial<RootedPorcelain> & {
    /** What this view knows about one checkout-relative path. */
    provenance(path: string): Promise<FileProvenance>;
    /** One directory's immediate children with stat metadata and provenance. */
    readdirWithStats(path: string): Promise<Array<{ name: string } & FileStat>>;
  };

/** One refusal code for every path the registry hides, on ACP `fs/*` and on Tau's own tools alike. @public */
export const maskedPathCode = 'WORKSPACE_MASKED_PATH';

/** Epoch zero: an overlay entry has no history, so it must not look freshly written. */
const immutableMtimeMs = 0;

/**
 * Classifications one view remembers. Wide enough that a single listing — the
 * widest thing that asks for the same path twice — never evicts its own rows;
 * small enough that a long-lived view holding one per path it ever touched is
 * still bounded.
 */
const classificationMemoEntries = 32_768;

const fileSystemError = (code: string, message: string, extra?: Record<string, unknown>): never => {
  throw Object.assign(new Error(message), { code, ...extra });
};

/*
 * A view speaks POSIX: its callers classify a failure by errno. A path the
 * agent may not see at all is a permission denial carrying the mask's reason;
 * a path it may read but not write is a read-only filesystem, which is the
 * answer acceptance 6 names.
 */
const refuseHidden = (path: string): never =>
  fileSystemError('EPERM', `No path under ${path} exists in a composed view.`, { reason: maskedPathCode });

const refuseRecords = (path: string): never =>
  fileSystemError('EROFS', `EROFS: this agent may read but not write ${path}; Tau records that itself.`, {
    reason: maskedPathCode,
  });

const refuseOverlay = (path: string): never =>
  fileSystemError('EROFS', `EROFS: ${path} is served read-only by this view.`);

/** Every proper ancestor of a checkout-relative path, shallowest first, excluding the root. */
const ancestorsOf = (path: string): string[] => {
  const segments = path.split('/').filter(Boolean);
  return segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join('/'));
};

/**
 * Compose one checkout into the view its consumer reads.
 *
 * @param checkout - The checkout's working copy, already rooted.
 * @param options - Which consumer the mask is for, the path policy it enforces, and the overlays to compose.
 * @returns A rooted filesystem that also answers {@link ComposedView.provenance}.
 * @public
 *
 * @example <caption>The daemon's agent tools over one checkout</caption>
 * ```typescript
 * import { composeView } from '@taucad/filesystem/composed-view';
 * import { NodeFsProvider } from '@taucad/filesystem/backend/node';
 * import { tauPathPolicy } from '@taucad/filesystem/path-registry';
 *
 * const view = composeView(
 *   { filesystem: new NodeFsProvider('/checkouts/main') },
 *   { consumer: 'agent', policy: tauPathPolicy },
 * );
 * await view.provenance('main.ts'); // { source: 'project', versioned: true, agentAccess: 'read-write' }
 * ```
 */
export const composeView = (checkout: ComposedViewCheckout, options: ComposedViewOptions): ComposedView => {
  const base = checkout.filesystem;
  const overlays = options.overlays ?? [];
  const masked = options.consumer === 'agent';

  /*
   * One classification per path per view. The policy's answer is a pure
   * function of the path, and the same path is asked for two or three times
   * within one operation: a listing filters every row for visibility and then
   * asks each row for its provenance, and each of those was a fresh regex plus
   * a scan of the registry's rows. Cleared wholesale instead of evicted one
   * entry at a time — the bound only has to outlast one listing, and the whole
   * map goes with the view.
   */
  const classifications = new Map<string, PathClassification>();
  const classify = (path: string): PathClassification => {
    const known = classifications.get(path);
    if (known !== undefined) {
      return known;
    }
    const classification = options.policy.classify(path);
    if (classifications.size >= classificationMemoEntries) {
      classifications.clear();
    }
    classifications.set(path, classification);
    return classification;
  };

  /** Whether this view hides the path at all — the one question the streams ask. */
  const hidden = (path: string): boolean => classify(path).agentAccess === 'hidden';

  /** The policy's answer, refused before any provider I/O: the control plane is in no view (A1, P30). */
  const readablePath = (path: string): string => {
    if (hidden(path)) {
      refuseHidden(path);
    }
    return path;
  };

  /**
   * One watch event as this view may deliver it, or nothing.
   *
   * The explicit `watch` is a second stream over the same bytes: the bridge masks
   * its own broadcast, and the node composed views have no bridge in front of
   * them at all, so the mask belongs here (G0b-1). A rename degrades exactly as
   * `scopeEventToRoot` degrades one whose other end left the root — the visible
   * end survives as a change or a delete, and an event with no visible end is
   * dropped. Fields the base adds to an event (the node provider's `kind`) ride
   * along with it.
   */
  const visibleEvent = (event: WatchEvent): WatchEvent | undefined => {
    if (event.type === 'reset') {
      return event;
    }
    if (event.type !== 'rename') {
      return hidden(event.path) ? undefined : event;
    }
    const from = hidden(event.oldPath) ? undefined : event.oldPath;
    const to = hidden(event.newPath) ? undefined : event.newPath;
    if (from !== undefined && to !== undefined) {
      return event;
    }
    if (to !== undefined) {
      return { type: 'change', path: to };
    }
    return from === undefined ? undefined : { type: 'delete', path: from };
  };

  const writablePath = (path: string): string => {
    const { agentAccess } = classify(path);
    if (agentAccess === 'hidden') {
      refuseHidden(path);
    }
    if (masked && agentAccess !== 'read-write') {
      refuseRecords(path);
    }
    return path;
  };

  const upperStat = async (path: string): Promise<FileStat | undefined> => {
    try {
      return await base.stat(path);
    } catch {
      return undefined;
    }
  };

  /**
   * Whether the checkout's own tree owns an overlay unit, and therefore the
   * whole subtree below it (mount-provenance V8).
   *
   * A project file where the overlay expects a directory owns everything under
   * it too: a `.agents` file cannot have skills inside it.
   */
  const projectOwnsUnit = async (unitRoot: string): Promise<boolean> => {
    for (const ancestor of ancestorsOf(unitRoot)) {
      // oxlint-disable-next-line no-await-in-loop -- the shallowest non-directory ancestor decides; deeper probes would be wasted I/O.
      const stat = await upperStat(ancestor);
      if (stat !== undefined && stat.type !== 'dir') {
        return true;
      }
    }
    return (await upperStat(unitRoot)) !== undefined;
  };

  type Route =
    | Readonly<{ kind: 'project'; overrides?: string }>
    | Readonly<{ kind: 'overlay'; overlay: ComposedViewOverlay; identity: string }>
    /** A directory both the checkout and an overlay contribute children to. */
    | Readonly<{ kind: 'merge'; overlays: readonly ComposedViewOverlay[] }>;

  /**
   * Whether an overlay can say anything about this path at all.
   *
   * Its own subtree, or one of the directories above it — those merge with the
   * checkout's own children. Everything else skips the overlay's two probes.
   */
  const overlayTouches = (overlayRoot: string, path: string): boolean =>
    overlayRoot === '' ||
    path === '' ||
    path === overlayRoot ||
    path.startsWith(`${overlayRoot}/`) ||
    overlayRoot.startsWith(`${path}/`);

  const routeFor = async (path: string): Promise<Route> => {
    const merging: ComposedViewOverlay[] = [];
    for (const overlay of overlays) {
      if (!overlayTouches(overlay.root, path)) {
        continue;
      }
      const unit = overlay.unit(path);
      if (unit === undefined) {
        if (overlay.node(path) !== undefined) {
          merging.push(overlay);
        }
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- the first overlay that claims the path decides it; probing the rest would be wasted I/O.
      if (await projectOwnsUnit(unit.root)) {
        return { kind: 'project', overrides: unit.identity };
      }
      return { kind: 'overlay', overlay, identity: unit.identity };
    }
    return merging.length > 0 ? { kind: 'merge', overlays: merging } : { kind: 'project' };
  };

  const overlayNode = (overlay: ComposedViewOverlay, path: string): ComposedOverlayNode =>
    overlay.node(path) ?? fileSystemError('ENOENT', `ENOENT: ${path}`);

  const overlayStat = (node: ComposedOverlayNode): FileStat =>
    node.type === 'dir'
      ? { type: 'dir', size: 0, mtimeMs: immutableMtimeMs }
      : {
          type: 'file',
          size: node.size,
          mtimeMs: immutableMtimeMs,
          ...(node.contentKind === 'text'
            ? ({ contentKind: 'text', lineCount: node.lineCount } as const)
            : ({ contentKind: 'binary' } as const)),
        };

  const projectProvenance = (path: string, overrides?: string): FileProvenance => {
    const { versioned, agentAccess } = classify(path);
    return {
      source: 'project',
      versioned,
      agentAccess: agentAccess === 'read-write' ? 'read-write' : 'read-only',
      ...(checkout.id === undefined ? {} : { identity: checkout.id }),
      ...(overrides === undefined ? {} : { overrides }),
    };
  };

  const overlayProvenance = (source: ComposedViewOverlay['source'], identity: string): FileProvenance => ({
    source,
    versioned: false,
    agentAccess: 'read-only',
    identity,
  });

  const provenanceForRoute = (path: string, route: Route): FileProvenance =>
    route.kind === 'overlay'
      ? overlayProvenance(route.overlay.source, route.identity)
      : projectProvenance(path, route.kind === 'project' ? route.overrides : undefined);

  /**
   * The mask an index query descends with: control-plane subtrees are never
   * entered, and a caller's own filter narrows further but can never widen.
   */
  const admitsVisible =
    (queryRoot: string, callerAdmits?: TreeSearchOptions['admits']) =>
    (relativePath: string, kind: 'file' | 'dir'): boolean =>
      classify(joinRelativePath(queryRoot, relativePath)).agentAccess !== 'hidden' &&
      callerAdmits?.(relativePath, kind) !== false;

  /** Names the checkout contributes to a directory, control-plane rows dropped for every consumer. */
  const upperNames = async (path: string, tolerateMissing: boolean): Promise<string[]> => {
    try {
      const names = await base.readdir(path);
      return names.filter((name) => classify(joinRelativePath(path, name)).agentAccess !== 'hidden');
    } catch (error) {
      if (tolerateMissing) {
        return [];
      }
      throw error;
    }
  };

  const overlayNames = (overlay: ComposedViewOverlay, path: string): readonly string[] => {
    const node = overlayNode(overlay, path);
    return node.type === 'dir' ? node.children : fileSystemError('ENOTDIR', `ENOTDIR: ${path}`);
  };

  const namesFor = async (path: string, route: Route): Promise<string[]> => {
    if (route.kind === 'overlay') {
      return [...overlayNames(route.overlay, path)];
    }
    if (route.kind === 'project') {
      return upperNames(path, false);
    }
    /* A merge directory exists as soon as any overlay contributes to it, even
     * when the checkout has no `.agents` of its own. */
    const names = await upperNames(path, true);
    const seen = new Set(names);
    for (const overlay of route.overlays) {
      for (const name of overlayNames(overlay, path)) {
        if (!seen.has(name)) {
          seen.add(name);
          names.push(name);
        }
      }
    }
    return names;
  };

  const statAt = async (path: string, route: Route): Promise<FileStat> => {
    if (route.kind === 'overlay') {
      return overlayStat(overlayNode(route.overlay, path));
    }
    const stat = await upperStat(path);
    if (stat !== undefined) {
      return stat;
    }
    /* A merge directory the checkout does not have is still a directory. */
    return route.kind === 'merge' ? { type: 'dir', size: 0, mtimeMs: immutableMtimeMs } : base.stat(path);
  };

  /** Every row the checkout holds in a directory, hidden ones included, batched when the base offers it. */
  const baseEntries = async (path: string): Promise<Array<{ name: string } & FileStat>> => {
    const batched = await base.readdirWithStats?.(path);
    if (batched !== undefined) {
      return batched;
    }
    const names = await base.readdir(path);
    return Promise.all(names.map(async (name) => ({ name, ...(await base.stat(joinRelativePath(path, name))) })));
  };

  /** The checkout's own rows of a directory, control-plane rows dropped for every consumer. */
  const upperEntries = async (path: string, tolerateMissing: boolean): Promise<Array<{ name: string } & FileStat>> => {
    try {
      const rows = await baseEntries(path);
      return rows.filter(({ name }) => !hidden(joinRelativePath(path, name)));
    } catch (error) {
      if (tolerateMissing) {
        return [];
      }
      throw error;
    }
  };

  /**
   * The first path inside a subtree that this view hides, if there is one.
   *
   * The walk stops at the first hit and never descends into a hidden directory —
   * hidden is inherited (PP2), so the directory itself is the answer.
   *
   * @param directory - Checkout-relative directory to walk.
   * @returns The hidden path, or `undefined` when the subtree holds none.
   */
  const firstHiddenBelow = async (directory: string): Promise<string | undefined> => {
    let rows: Array<{ name: string } & FileStat>;
    try {
      rows = await baseEntries(directory);
    } catch {
      /* ponytail: a path that is not a listable directory has no subtree to
       * protect, and the base answers the real error when the mutation runs. */
      return undefined;
    }
    for (const { name, type } of rows) {
      const child = joinRelativePath(directory, name);
      if (hidden(child)) {
        return child;
      }
      if (type === 'dir') {
        // oxlint-disable-next-line no-await-in-loop -- The walk exists to stop at the first hidden row; a parallel descent would list the whole subtree.
        const deeper = await firstHiddenBelow(child);
        if (deeper !== undefined) {
          return deeper;
        }
      }
    }
    return undefined;
  };

  /**
   * Refuse a subtree-wide mutation that would reach a path this view hides (G0b-2).
   *
   * Hiding a path is not the same as refusing to delete beneath it: a recursive
   * removal or a directory move reaches paths nobody named, and `classify` was
   * asked only about the operand (CI1). The ruling splits the two cases the walk
   * can find. The project's own control plane and reserved records sit at the view
   * root, so a recursive removal of the root is refused for every consumer,
   * before anything is deleted. A store nested inside the design — a vendored
   * dependency's — blocks an agent and goes with its directory for a person, who
   * must not be left with an undeletable folder.
   *
   * @param target - The operand whose subtree the mutation would reach.
   * @returns Resolves when nothing in the subtree is hidden.
   */
  const refuseHiddenSubtree = async (target: string): Promise<void> => {
    if (!masked && target !== '') {
      return;
    }
    const found = await firstHiddenBelow(target);
    if (found !== undefined) {
      refuseHidden(found);
    }
  };

  const canonical = (path: string): string => assertRootedPath(path);

  function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  function readFile(path: string, encoding: 'utf8'): Promise<string>;
  async function readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    const target = readablePath(canonical(path));
    const route = await routeFor(target);
    if (route.kind !== 'overlay') {
      return encoding === 'utf8' ? base.readFile(target, 'utf8') : base.readFile(target);
    }
    const node = overlayNode(route.overlay, target);
    if (node.type === 'dir') {
      return fileSystemError('EISDIR', `EISDIR: ${target}`);
    }
    const bytes = await route.overlay.read(target);
    if (bytes.byteLength !== node.size) {
      fileSystemError('EIO', `EIO: ${target} did not match its declared length.`);
    }
    return encoding === 'utf8' ? new TextDecoder('utf-8', { fatal: true }).decode(bytes) : bytes;
  }

  const readdirWithStats = async (path: string): Promise<Array<{ name: string } & FileStat>> => {
    const target = readablePath(canonical(path));
    const route = await routeFor(target);
    const rows: Array<{ name: string } & FileStat> =
      route.kind === 'overlay'
        ? overlayNames(route.overlay, target).map((name) => ({
            name,
            ...overlayStat(overlayNode(route.overlay, joinRelativePath(target, name))),
          }))
        : await upperEntries(target, route.kind === 'merge');
    if (route.kind === 'merge') {
      const seen = new Set(rows.map(({ name }) => name));
      for (const overlay of route.overlays) {
        for (const name of overlayNames(overlay, target)) {
          if (!seen.has(name)) {
            seen.add(name);
            rows.push({ name, ...overlayStat(overlayNode(overlay, joinRelativePath(target, name))) });
          }
        }
      }
    }
    /* One route for the whole listing whenever no overlay reaches into this
     * directory: an overlay that touches any child touches the parent too — its
     * root is then at or below it — so resolving each row again can only find
     * the project. */
    if (!overlays.some((overlay) => overlayTouches(overlay.root, target))) {
      return rows.map((row) => ({ ...row, provenance: projectProvenance(joinRelativePath(target, row.name)) }));
    }
    return Promise.all(
      rows.map(async (row) => {
        const childPath = joinRelativePath(target, row.name);
        return { ...row, provenance: provenanceForRoute(childPath, await routeFor(childPath)) };
      }),
    );
  };

  const mutate = async <T>(path: string, apply: (target: string) => Promise<T>): Promise<T> => {
    const [target] = await writableTargets([path]);
    return apply(target!);
  };

  /**
   * Every path a batch would write, refused before the batch begins.
   *
   * The porcelain below is one operation over many paths, so the mask has to
   * answer for all of them first: a batch that refused halfway would have
   * already written the paths before it (Rule 5a's "preflight before the first
   * mutation").
   */
  const writableTargets = async (paths: readonly string[]): Promise<string[]> => {
    const targets = paths.map((path) => writablePath(canonical(path)));
    const routes = await Promise.all(targets.map(async (target) => routeFor(target)));
    for (const [index, route] of routes.entries()) {
      if (route.kind === 'overlay') {
        refuseOverlay(targets[index]!);
      }
    }
    return targets;
  };

  /**
   * A copy source the view serves itself, refused instead of passed down.
   *
   * An overlay's bytes are not in the checkout, so a copy the base performed
   * would answer ENOENT for a path this view reads perfectly well (review N1).
   * The read-only filesystem is the honest answer until a copy that stages
   * overlay bytes exists.
   */
  const readableSource = async (path: string): Promise<string> => {
    const from = readablePath(canonical(path));
    const route = await routeFor(from);
    if (route.kind === 'overlay') {
      refuseOverlay(from);
    }
    return from;
  };

  /**
   * The mask a copy descends with, asked about project-relative spellings.
   *
   * A copy root can be any directory, so the source is joined back on before
   * the policy is asked: `notes/exports` is an ordinary directory, `exports`
   * under the project root is a records row. The control plane needs no such
   * care — it is the control plane at any depth (path policy contract, PP3).
   */
  const porcelain = (base: Partial<RootedPorcelain>): Partial<RootedPorcelain> => ({
    ...(base.copyTree === undefined
      ? {}
      : {
          copyTree: async (source: string, target: string, options?: { admits?: TreeSearchOptions['admits'] }) => {
            const from = await readableSource(source);
            const [to] = await writableTargets([target]);
            /* Every entry a copy writes is a target too: `notes/exports` is
             * authored where it sits, but copied to the project root it would be
             * a records row, which is not the agent's to write. */
            const writableBelow = (relativePath: string): boolean => {
              const { agentAccess } = classify(joinRelativePath(to!, relativePath));
              return agentAccess !== 'hidden' && (!masked || agentAccess === 'read-write');
            };
            const visible = admitsVisible(from, options?.admits);
            return base.copyTree!(from, to!, {
              admits: (relativePath, kind) => visible(relativePath, kind) && writableBelow(relativePath),
            });
          },
        }),
    ...(base.duplicate === undefined
      ? {}
      : {
          duplicate: async (source: string, target: string) => {
            const from = await readableSource(source);
            const [to] = await writableTargets([target]);
            return base.duplicate!(from, to!);
          },
        }),
    ...(base.move === undefined
      ? {}
      : {
          move: async (source: string, target: string): Promise<FileStat> => {
            const [from, to] = await writableTargets([source, target]);
            await refuseHiddenSubtree(from!);
            return base.move!(from!, to!);
          },
        }),
    ...(base.bulkMove === undefined
      ? {}
      : {
          bulkMove: async (edits: ReadonlyArray<{ source: string; target: string }>) => {
            const targets = await writableTargets(edits.flatMap(({ source, target }) => [source, target]));
            /* Every source, before the first edit: a batch that refused halfway
             * would have moved the ones before it. */
            await Promise.all(
              targets.filter((_, index) => index % 2 === 0).map(async (from) => refuseHiddenSubtree(from)),
            );
            return base.bulkMove!(edits);
          },
        }),
    ...(base.writeFiles === undefined
      ? {}
      : {
          writeFiles: async (files: Record<string, { content: Uint8Array<ArrayBuffer> | string }>) => {
            await writableTargets(Object.keys(files));
            return base.writeFiles!(files);
          },
        }),
    ...(base.canMove === undefined
      ? {}
      : {
          canMove: async (source: string, target: string): Promise<true | WorkspaceMutationError> => {
            const [from, to] = await writableTargets([source, target]);
            return base.canMove!(from!, to!);
          },
        }),
    ...(base.canRename === undefined
      ? {}
      : {
          canRename: async (source: string, newName: string): Promise<true | WorkspaceMutationError> => {
            const from = canonical(source);
            await writableTargets([from, `${from.slice(0, from.lastIndexOf('/') + 1)}${newName}`]);
            return base.canRename!(from, newName);
          },
        }),
    ...(base.canCreate === undefined
      ? {}
      : {
          canCreate: async (path: string, kind: 'file' | 'directory'): Promise<true | WorkspaceMutationError> => {
            const [target] = await writableTargets([path]);
            return base.canCreate!(target!, kind);
          },
        }),
    ...(base.canDelete === undefined
      ? {}
      : {
          canDelete: async (path: string): Promise<true | WorkspaceMutationError> => {
            const [target] = await writableTargets([path]);
            return base.canDelete!(target!);
          },
        }),
  });

  return {
    id: `composed-view:${options.consumer}`,
    capabilities: base.capabilities,
    dispose: () => {
      base.dispose();
    },
    readFile,
    async provenance(path) {
      const target = readablePath(canonical(path));
      return provenanceForRoute(target, await routeFor(target));
    },
    async readdir(path) {
      const target = readablePath(canonical(path));
      return namesFor(target, await routeFor(target));
    },
    readdirWithStats,
    async stat(path) {
      const target = readablePath(canonical(path));
      const route = await routeFor(target);
      return { ...(await statAt(target, route)), provenance: provenanceForRoute(target, route) };
    },
    async lstat(path) {
      const target = readablePath(canonical(path));
      const route = await routeFor(target);
      const stat = route.kind === 'overlay' ? await statAt(target, route) : await base.lstat(target);
      return { ...stat, provenance: provenanceForRoute(target, route) };
    },
    async exists(path) {
      const target = canonical(path);
      if (classify(target).agentAccess === 'hidden') {
        /* A boolean that threw would announce the path it is hiding. */
        return false;
      }
      const route = await routeFor(target);
      if (route.kind === 'overlay') {
        return route.overlay.node(target) !== undefined;
      }
      return route.kind === 'merge' ? true : base.exists(target);
    },
    async writeFile(path, data) {
      return mutate(path, async (target) => base.writeFile(target, data));
    },
    async mkdir(path, mkdirOptions?: { recursive?: boolean }) {
      return mutate(path, async (target) => base.mkdir(target, mkdirOptions));
    },
    async unlink(path) {
      return mutate(path, async (target) => base.unlink(target));
    },
    async rmdir(path, rmdirOptions?: { recursive?: boolean }) {
      return mutate(path, async (target) => {
        if (rmdirOptions?.recursive === true) {
          await refuseHiddenSubtree(target);
        }
        return base.rmdir(target, rmdirOptions);
      });
    },
    async rename(from, to) {
      return mutate(from, async (source) =>
        mutate(to, async (target) => {
          await refuseHiddenSubtree(source);
          return base.rename(source, target);
        }),
      );
    },
    ...(base.writeFileChecked === undefined
      ? {}
      : {
          /* The target is a write, the preconditions are reads: a hidden path is
           * refused on whichever side names it, before the fence is taken. */
          writeFileChecked: async (input: Omit<CheckedFileWrite, 'signal'>): Promise<CheckedFileWriteResult> => {
            const [target] = await writableTargets([input.path]);
            return base.writeFileChecked!({
              ...input,
              path: target!,
              preconditions: input.preconditions.map(({ path, expected }) => ({
                path: readablePath(canonical(path)),
                expected,
              })),
            });
          },
        }),
    ...(base.appendFile === undefined
      ? {}
      : {
          appendFile: async (path: string, data: Uint8Array<ArrayBuffer> | string): Promise<void> =>
            mutate(path, async (target) => base.appendFile!(target, data)),
        }),
    ...(base.watch === undefined
      ? {}
      : {
          /* A hidden request path is refused like any other hidden read, and the
           * stream carries only what this view would serve. The base's own
           * disposer is returned as it is, so a `watch` that answers a promise of
           * one (`NodeFsProviderClient`) keeps working. */
          watch: (request: WatchRequest, handler: (event: WatchEvent) => void) =>
            base.watch!(
              { ...request, paths: request.paths.map((path) => readablePath(canonical(path))) },
              (event: WatchEvent) => {
                const visible = visibleEvent(event);
                if (visible !== undefined) {
                  handler(visible);
                }
              },
            ),
        }),
    ...(base.readFileStream === undefined
      ? {}
      : {
          readFileStream: (path: string, streamOptions?: FileReadStreamOptions) => {
            /*
             * One stream for both routes: `readFile` already resolves the route,
             * the mask and the overlay's declared length, so the requested
             * window is a slice of what it answers. The mask itself still
             * refuses synchronously, before any stream exists.
             *
             * ponytail: a project file is buffered whole instead of keeping the
             * base's chunking. No consumer of a composed view streams yet; give
             * the project route back to `base.readFileStream` when one does.
             */
            const target = readablePath(canonical(path));
            return new ReadableStream<Uint8Array<ArrayBuffer>>({
              async start(controller) {
                streamOptions?.signal?.throwIfAborted();
                const bytes = await readFile(target);
                streamOptions?.signal?.throwIfAborted();
                const from = streamOptions?.position ?? 0;
                controller.enqueue(
                  bytes.subarray(from, streamOptions?.length === undefined ? undefined : from + streamOptions.length),
                );
                controller.close();
              },
            });
          },
        }),
    ...(base.readdirEntries === undefined
      ? {}
      : {
          /* Present when the base can answer kinds cheaply; the rows are the
           * view's merged ones, never the base's raw listing. */
          readdirEntries: async (path: string): Promise<DirectoryEntry[]> => {
            const rows = await readdirWithStats(path);
            return rows.map(({ name, type }) => ({ name, kind: type }));
          },
        }),
    ...(base.refresh === undefined
      ? {}
      : { refresh: async (prefixes?: readonly string[]): Promise<void> => base.refresh!(prefixes) }),
    /*
     * The index answers whole subtrees at once, so the mask goes *down* as
     * `admits` rather than filtering rows on the way back: a hidden subtree is
     * never descended into, and a capped search returns `maxResults` rows the
     * consumer may actually see.
     */
    ...(base.search === undefined
      ? {}
      : {
          search: async (query: string, searchOptions?: TreeSearchOptions): Promise<FileStatEntry[]> =>
            base.search!(query, { ...searchOptions, admits: admitsVisible('', searchOptions?.admits) }),
        }),
    ...(base.statTree === undefined
      ? {}
      : {
          statTree: async (
            path: string,
            statOptions?: { admits?: TreeSearchOptions['admits'] },
          ): Promise<FileStatEntry[]> => {
            const target = readablePath(canonical(path));
            return base.statTree!(target, { admits: admitsVisible(target, statOptions?.admits) });
          },
        }),
    /*
     * The mutating porcelain is a batch in the pipeline below, not N port
     * writes (charter D4), so the mask answers for every operand of one
     * operation before any of it runs.
     */
    ...porcelain(base),
  };
};
